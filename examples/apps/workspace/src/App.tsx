// Registers every <kai-*> element. Must come first, and must come before any
// property is set on one: an element that has not upgraded accepts a property
// assignment, reads it back correctly, and renders nothing — with no error and
// no warning. The React wrappers below also register their own element lazily,
// so this is belt-and-braces against a first-mount upgrade delay.
import '@kitn.ai/ui/elements';
import '@kitn.ai/ui/theme.tokens.css';
import './styles.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Chat, Conversations, Workspace } from '@kitn.ai/ui/react';
import { toast } from '@kitn.ai/ui/elements';
import {
  bindThreadMessages,
  createAssistantStream,
  createSaveScheduler,
  createThreadSessions,
} from '@kitn.ai/ui/state';
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
   *  so this cannot be a single boolean. The bookkeeping (one turn per thread,
   *  abort the prior, drop a stale settle) is the kit's `createThreadSessions`;
   *  this state is its mirror for rendering. */
  const [streamingIds, setStreamingIds] = useState<string[]>([]);
  const [sessions] = useState(() => createThreadSessions(setStreamingIds));

  // ── Persistence ───────────────────────────────────────────────────────────
  // The debounce/flush MECHANICS are the kit's `createSaveScheduler`; the
  // 250ms quiet period, the localStorage target (see storage.ts) and what a
  // failed save means stay this app's decisions. A streaming reply lands a
  // state update per token; without the debounce, so would localStorage.
  const [saver] = useState(() => createSaveScheduler(saveConversations, { delayMs: 250 }));
  useEffect(() => {
    saver.schedule(conversations);
  }, [saver, conversations]);

  useEffect(() => {
    // The unload flush covers the tab closing mid-stream (or mid-debounce).
    const flush = () => saver.flush();
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [saver]);

  useEffect(() => saveActiveId(activeId), [activeId]);

  // ── Derived view state ────────────────────────────────────────────────────
  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const rows = useMemo(() => toRows(conversations), [conversations]);
  const messages = active?.messages ?? NO_MESSAGES;
  const loading = activeId !== null && streamingIds.includes(activeId);

  // The rail filters `conversations` by title internally and shows its own
  // "No conversations match your search" state; mirroring the query (via
  // kai-search) keeps this app's fuller hint sentence below the rail.
  const noMatches =
    query.trim() !== '' &&
    !rows.some((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()));

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

      /**
       * The id-bound `SetMessages` is the kit's `bindThreadMessages` now: it
       * routes every delta to the conversation that was open when the user hit
       * send — not whichever one is open when the tokens land — handles the
       * reactivity two-halves (new array to notify, new object to be visible),
       * and drops a delta whose thread was deleted mid-stream instead of
       * resurrecting it. `touch` stays this app's policy: stamp updatedAt.
       */
      const setMessages = bindThreadMessages<Conversation>(setConversations, targetId, {
        touch: (c) => ({ ...c, updatedAt: new Date().toISOString() }),
      });

      // One in-flight turn per thread; beginning a new one aborts the prior.
      const controller = sessions.begin(targetId);
      const stream = createAssistantStream(setMessages);

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
        // is why the whole read runs above it. end() ignores a stale controller,
        // so a turn superseded by begin() cannot clear its successor's state.
        stream.done();
        sessions.end(targetId, controller);
      }
    },
    [activeId, conversations, sessions],
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
    // into a thread nobody can reach. sessions.abort also means any late delta
    // finds its thread gone and is dropped by the bound sink.
    sessions.abort(doomed.id);

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
  }, [active, sessions]);

  return (
    <div className="workspace">
      {/* The <kai-workspace> layout shell owns the arrangement that used to be
          this app's own flexbox: a resizable, collapsible start aside beside
          the main region, with a drawer mode below 720px. It knows nothing
          about chat — the rail and the thread are slotted content. */}
      <Workspace
        className="shell"
        startCollapsed={collapsed}
        drawerBelow={720}
        onAsideToggle={(e) => {
          if (e.detail.side === 'start') setCollapsed(e.detail.collapsed);
        }}
      >
        {/* A collapsed aside is fully hidden (no dead gutter — the shell's
            answer to F-02), so the reopen control lives in the header band,
            outside the aside it reopens. */}
        <div slot="header" className="appbar">
          <Button variant="ghost" size="sm" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? 'Show chats' : 'Hide chats'}
          </Button>
        </div>

        {/* The wrappers forward no `slot` prop, so a plain div carries the
            slot attribute into the shell's start aside. */}
        <div slot="start" className="rail">
          <Conversations
            className="rail__list"
            conversations={rows}
            activeId={activeId ?? undefined}
            collapsed={false}
            onConversationSelect={handleSelect}
            onNewChat={handleNewChat}
            onCollapseToggle={(e) => {
              // The rail's own toggle now drives the SHELL's aside (the rail
              // itself stays expanded — controlled collapsed={false} — so it
              // never shrinks inside a column that no longer exists).
              if (e.detail.collapsed) setCollapsed(true);
            }}
            onSearch={(e) => setQuery(e.detail.query)}
          />
          {noMatches ? <p className="rail__hint">No conversations match “{query.trim()}”.</p> : null}
        </div>

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
      </Workspace>
    </div>
  );
}
