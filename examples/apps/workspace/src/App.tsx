// Registers every <kai-*> element. Must come first, and must come before any
// property is set on one: an element that has not upgraded accepts a property
// assignment, reads it back correctly, and renders nothing — with no error and
// no warning. The React wrappers below also register their own element lazily,
// so this is belt-and-braces against a first-mount upgrade delay.
import '@kitn.ai/ui/elements';
import '@kitn.ai/ui/theme.tokens.css';
import './styles.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chat, Conversations } from '@kitn.ai/ui/react';
import { toast } from '@kitn.ai/ui/elements';
import { createAssistantStream } from '@kitn.ai/ui/state';
import type { SetMessages } from '@kitn.ai/ui/state';
import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';
import type { AttachmentData, ChatMessage } from '@kitn.ai/ui/react';

import { byRecency, deriveTitle, newConversation, titleFor, toRows } from './conversations';
import type { Conversation } from './conversations';
import { loadActiveId, loadConversations, saveActiveId, saveConversations } from './storage';

/** A stable reference for the empty thread. `messages` is diffed by reference,
 *  so a fresh `[]` every render would re-notify the element for nothing. */
const NO_MESSAGES: ChatMessage[] = [];

const SUGGESTIONS = [
  'Summarise what we discussed last time',
  'Help me draft a release note',
  'What can you do?',
];

/** How long the thread has to be quiet before history is written back. A
 *  streaming reply lands a state update per token; without this, so would
 *  localStorage. The unload flush below covers the tab closing mid-stream. */
const SAVE_DEBOUNCE_MS = 250;

function bootstrap(): { list: Conversation[]; activeId: string | null } {
  const list = loadConversations().sort(byRecency);
  const stored = loadActiveId();
  // A stored active id can outlive its conversation (deleted in another tab).
  // Fall back to the draft state rather than to a thread that is not there.
  return { list, activeId: stored && list.some((c) => c.id === stored) ? stored : null };
}

export default function App() {
  const [boot] = useState(bootstrap);
  const [conversations, setConversations] = useState<Conversation[]>(boot.list);
  /** `null` means a DRAFT: "New chat" was pressed and nothing is stored yet.
   *  A conversation is only created on its first turn, so the sidebar never
   *  fills up with empty threads. */
  const [activeId, setActiveId] = useState<string | null>(boot.activeId);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  /** One id per in-flight reply — a stream keeps running when you switch away,
   *  so this cannot be a single boolean. */
  const [streamingIds, setStreamingIds] = useState<string[]>([]);

  const inFlight = useRef(new Map<string, AbortController>());
  const latest = useRef(conversations);

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    latest.current = conversations;
    const timer = setTimeout(() => saveConversations(conversations), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [conversations]);

  useEffect(() => {
    const flush = () => saveConversations(latest.current);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  useEffect(() => saveActiveId(activeId), [activeId]);

  // ── Derived view state ────────────────────────────────────────────────────
  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const rows = useMemo(() => toRows(conversations), [conversations]);
  const messages = active?.messages ?? NO_MESSAGES;
  const loading = activeId !== null && streamingIds.includes(activeId);

  // The rail filters `conversations` by title internally, but its built-in
  // empty state only fires when there are no conversations AT ALL — a search
  // that matches nothing renders a blank list with no explanation. Mirror the
  // query (via kai-search) and say so ourselves.
  const noMatches =
    query.trim() !== '' &&
    !rows.some((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()));

  /**
   * A `SetMessages` bound to ONE conversation.
   *
   * `createAssistantStream` wants a React-shaped setter, and the thread it
   * writes to has to be the conversation that was open when the user hit send —
   * not whichever one is open when the tokens land. Binding the id here is what
   * lets you switch away mid-reply and come back to a finished answer.
   *
   * reactivity-two-halves: `map` yields a NEW array (which notifies) and the
   * spread yields a NEW object for the changed conversation (which makes the
   * change visible). Either one alone renders stale.
   */
  const setMessagesFor = useCallback(
    (conversationId: string): SetMessages =>
      (updater) => {
        setConversations((prev) => {
          let hit = false;
          const next = prev.map((c) => {
            if (c.id !== conversationId) return c;
            hit = true;
            return { ...c, messages: updater(c.messages), updatedAt: new Date().toISOString() };
          });
          // The conversation was deleted mid-stream. Drop the delta instead of
          // resurrecting it, and leave the array reference alone so nothing
          // else re-renders.
          return hit ? next : prev;
        });
      },
    [],
  );

  // ── Sending a turn ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (event: CustomEvent<{ value: string; attachments: AttachmentData[] }>) => {
      const value = event.detail.value.trim();
      if (!value) return;

      const targetId = activeId ?? crypto.randomUUID();
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: value }],
      };

      // What the assistant must see. `existing.messages` is the whole thread,
      // including everything rehydrated from localStorage on this page load —
      // this is the line that makes continuing an old conversation after a
      // reload a real continuation rather than a fresh start.
      const existing = conversations.find((c) => c.id === targetId);
      const history: ChatMessage[] = [...(existing?.messages ?? []), userMessage];

      setConversations((prev) => {
        const found = prev.find((c) => c.id === targetId);
        if (!found) return [newConversation(targetId, deriveTitle(value), userMessage), ...prev];
        const updated: Conversation = {
          ...found,
          title: found.title || deriveTitle(value),
          messages: [...found.messages, userMessage],
          updatedAt: new Date().toISOString(),
        };
        // Move to the front: the rail renders the array in the order it is
        // given and does no recency bucketing of its own.
        return [updated, ...prev.filter((c) => c.id !== targetId)];
      });
      setActiveId(targetId);
      setStreamingIds((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));

      const controller = new AbortController();
      inFlight.current.set(targetId, controller);
      const stream = createAssistantStream(setMessagesFor(targetId));

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // toOpenAIMessages is the kit's encoder. Hand-rolling this is how a
          // part variant silently stops reaching the model.
          body: JSON.stringify({ messages: toOpenAIMessages(history) }),
          signal: controller.signal,
        });
        // The kit parses, the consumer fetches: readOpenAIStream owns the SSE —
        // keep-alive comments, multi-line frames, split codepoints, tool calls.
        // It also throws (WireError) on a non-ok response, before a chunk is
        // read, which is what the catch below is really for.
        const turn = await readOpenAIStream(response, stream);
        if (turn.error) stream.abort(turn.error.message);
      } catch (err) {
        // A deliberate abort (the conversation was deleted under us) is not a
        // failure and has no one left to report it to.
        if (!controller.signal.aborted) {
          stream.abort(
            err instanceof Error && err.message ? err.message : 'The reply could not be loaded.',
          );
          console.error(err); // the console is for you; the thread is for them
        }
      } finally {
        // done() SETTLES the message; every mutation after it is dropped, which
        // is why the whole read runs above it.
        stream.done();
        inFlight.current.delete(targetId);
        setStreamingIds((prev) => prev.filter((id) => id !== targetId));
      }
    },
    [activeId, conversations, setMessagesFor],
  );

  // ── Sidebar wiring ────────────────────────────────────────────────────────
  const handleSelect = useCallback((event: CustomEvent<{ id: string }>) => {
    setActiveId(event.detail.id);
  }, []);

  const handleNewChat = useCallback(() => {
    // A draft, not a record. It becomes a conversation on its first turn.
    setActiveId(null);
  }, []);

  const handleDelete = useCallback(() => {
    const doomed = active;
    if (!doomed) return;

    // Stop the reply that is still arriving for it, or it would go on writing
    // into a thread nobody can reach.
    inFlight.current.get(doomed.id)?.abort();
    inFlight.current.delete(doomed.id);

    setConversations((prev) => prev.filter((c) => c.id !== doomed.id));
    setActiveId(null);

    // Undo instead of a confirm dialog: the destructive step is reversible for
    // as long as the toast is up, so there is nothing to interrupt the user for.
    toast(`Deleted “${titleFor(doomed)}”`, {
      action: {
        label: 'Undo',
        onAction: () => {
          setConversations((prev) =>
            prev.some((c) => c.id === doomed.id) ? prev : [doomed, ...prev].sort(byRecency),
          );
          setActiveId(doomed.id);
        },
      },
    });
  }, [active]);

  return (
    <div className="workspace">
      <aside className={collapsed ? 'rail rail--collapsed' : 'rail'}>
        <Conversations
          className="rail__list"
          conversations={rows}
          activeId={activeId ?? undefined}
          collapsed={collapsed}
          onConversationSelect={handleSelect}
          onNewChat={handleNewChat}
          onCollapseToggle={(e) => setCollapsed(e.detail.collapsed)}
          onSearch={(e) => setQuery(e.detail.query)}
        />
        {!collapsed && noMatches ? (
          <p className="rail__hint">No conversations match “{query.trim()}”.</p>
        ) : null}
      </aside>

      <Chat
        className="thread"
        messages={messages}
        loading={loading}
        suggestions={SUGGESTIONS}
        suggestionMode="submit"
        chatTitle={active ? titleFor(active) : 'New conversation'}
        placeholder={active ? 'Reply…' : 'Start a new conversation…'}
        headerEnd={active !== null}
        onSubmit={handleSubmit}
      >
        {active ? (
          <div slot="header-end">
            {/* The visible text is SLOTTED. `label` is the accessible name for
                an icon-only button and renders nothing — a `label`-only button
                is 24px of empty ghost in the corner. There is no trash icon in
                the curated registry either, so words it is. */}
            <Button variant="ghost" size="sm" onClick={handleDelete}>
              Delete chat
            </Button>
          </div>
        ) : null}
      </Chat>
    </div>
  );
}
