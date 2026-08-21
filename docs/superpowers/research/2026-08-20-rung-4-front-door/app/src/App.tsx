import { useCallback, useEffect, useRef, useState } from 'react';
import { Chat, Resizable, ResizableItem } from '@kitn.ai/ui/react';
import { toast } from '@kitn.ai/ui/elements';
import { listenForCardEvents } from '@kitn.ai/ui';
import { createAssistantStream, type ChatMessage } from '@kitn.ai/ui/state';
import { cardFromToolCall, isCardTool, type ArtifactCardData } from '@kitn.ai/ui/schemas';
import { readOpenAIStream, toOpenAIMessages, type AssistantStreamSink, type ModelToolCall } from '@kitn.ai/ui/wire';

import { PAGE_VERSION_TYPE, cards, type PageVersionCardData } from './cards';
import { SELECT_ACTION } from './page-version-card';
import { PreviewPanel, type Device } from './components/PreviewPanel';
import { TopBar } from './components/TopBar';
import { formatBytes, titleOf, type PageVersion } from './versions';

const SUGGESTIONS = [
  'Make me a landing page for a coffee shop',
  'Build a landing page for a small design studio',
  'A one-page site for a two-day developer conference',
];

/** Which panel index maximizes: 0 is the chat column, 1 the preview. */
const PREVIEW_PANEL = 1;

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [device, setDevice] = useState<Device>('desktop');
  const [maximized, setMaximized] = useState(false);

  // The streaming handler runs outside React's render, so it reads versions
  // through a ref rather than a closed-over (and by then stale) array. Every
  // write goes through the two handlers below, which set the ref and the state
  // from the same value, so the two cannot drift.
  const versionsRef = useRef<PageVersion[]>([]);

  const chatWrapRef = useRef<HTMLDivElement>(null);

  const selected = versions.find((v) => v.id === selectedId) ?? null;

  /**
   * A `page-version` card was clicked. `<kai-chat>` carries no `policy` prop, so
   * the host attaches the policy itself: `kai-card` bubbles AND composes (one of
   * the three deliberate exceptions to events-non-bubbling), so it escapes the
   * chat's shadow root and `listenForCardEvents` routes it here. This is the
   * wire from a card to the preview panel — host-coordinates: nothing else
   * connects the two.
   */
  useEffect(() => {
    const el = chatWrapRef.current;
    if (!el) return;
    return listenForCardEvents(el, {
      onAction: (_cardId, action, payload) => {
        if (action !== SELECT_ACTION) return;
        const versionId = (payload as { versionId?: string } | undefined)?.versionId;
        if (versionId) setSelectedId(versionId);
      },
    });
  }, []);

  /**
   * Keep every card's "in preview" state in step with the panel.
   *
   * reactivity-two-halves: a NEW array notifies <kai-chat>, and a NEW object for
   * the changed message makes the change visible. Both, or the cards render stale.
   */
  useEffect(() => {
    setMessages((prev) => {
      let touched = false;
      const next = prev.map((message) => {
        let messageTouched = false;
        const parts = message.parts.map((part) => {
          if (part.type !== 'card' || part.envelope.type !== PAGE_VERSION_TYPE) return part;
          const data = part.envelope.data as PageVersionCardData;
          const isSelected = data.versionId === selectedId;
          if (Boolean(data.selected) === isSelected) return part;
          messageTouched = true;
          return { ...part, envelope: { ...part.envelope, data: { ...data, selected: isSelected } } };
        });
        if (!messageTouched) return message;
        touched = true;
        return { ...message, parts };
      });
      return touched ? next : prev;
    });
  }, [selectedId]);

  /** One arriving `kai_artifact` call becomes one version plus one compact card. */
  const takeToolCall = useCallback((call: ModelToolCall, addCard: (data: PageVersionCardData, id: string) => void, prompt: string, basePrompts: string[]) => {
    // isCardTool / cardFromToolCall rather than matching the `kai_` prefix by
    // hand; a call that is not a card tool returns null and falls through.
    if (!isCardTool(call.name) || !call.input) return;
    const envelope = cardFromToolCall(call.name, call.input, { id: call.id });
    if (!envelope || envelope.type !== 'artifact') return;

    const data = envelope.data as ArtifactCardData;
    const file = data.files?.find((f) => typeof f.code === 'string');
    if (!file?.code) return;

    const version: PageVersion = {
      id: envelope.id,
      label: `v${versionsRef.current.length + 1}`,
      fileName: data.displayUrl ?? file.path,
      prompt,
      html: file.code,
      createdAt: Date.now(),
      basePrompts: [...basePrompts, prompt],
    };
    versionsRef.current = [...versionsRef.current, version];
    setVersions(versionsRef.current);
    setSelectedId(version.id);
    setTab('preview');

    addCard(
      {
        versionId: version.id,
        label: version.label,
        title: titleOf(version.html),
        fileName: version.fileName,
        summary: prompt,
        size: formatBytes(new Blob([version.html]).size),
        selected: true,
      },
      envelope.id,
    );
  }, []);

  const onSubmit = useCallback(
    async (event: CustomEvent<{ value: string }>) => {
      const value = event.detail.value.trim();
      if (!value || loading) return;

      const history: ChatMessage[] = [
        ...messages,
        { id: crypto.randomUUID(), role: 'user' as const, parts: [{ type: 'text' as const, text: value }] },
      ];
      setMessages(history);
      setLoading(true);

      // The context the next page is built FROM is the head version's own
      // lineage, not the raw transcript: restoring v2 and asking for a change
      // then branches off v2 instead of re-applying every edit since.
      const head = versionsRef.current[versionsRef.current.length - 1];
      const basePrompts = head?.basePrompts ?? [];
      const outgoing: ChatMessage[] = [...basePrompts, value].map((text, i) => ({
        id: `ctx-${i}`,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text }],
      }));

      const stream = createAssistantStream(setMessages);
      // The card is added to the message the reader is filling, so the compact
      // card lands in the same assistant turn as the text.
      const addCard = (data: PageVersionCardData, id: string) =>
        stream.addCard({ type: PAGE_VERSION_TYPE, id, data });

      // The reader drives this sink. Tool parts are swallowed on purpose: the
      // `kai_artifact` call is already represented in the thread, as the compact
      // card the host adds from it, and a raw tool panel beside it says the same
      // thing twice.
      const sink: AssistantStreamSink = {
        appendText: (delta) => stream.appendText(delta),
        appendReasoning: (delta, opts) => stream.appendReasoning(delta, opts),
        upsertTool: () => undefined,
        addSource: (source) => stream.addSource(source),
      };

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // `card` parts are never encoded by the kit's encoder; the route sees
          // the user's words, which is all the mock generator needs.
          body: JSON.stringify({
            messages: toOpenAIMessages(outgoing),
            versionCount: versionsRef.current.length,
          }),
        });
        const turn = await readOpenAIStream(res, sink, {
          traceId: `page-${versionsRef.current.length + 1}`,
          onToolCallReady: (call) => takeToolCall(call, addCard, value, basePrompts),
        });
        if (turn.error) console.error('Model error:', turn.error.message);
      } catch (err) {
        // abort(reason) settles the message and puts the reason in the thread,
        // so a failure is never a permanently blank assistant bubble.
        stream.abort(err instanceof Error && err.message ? err.message : 'The page builder could not be reached.');
        console.error(err);
      } finally {
        stream.done();
        setLoading(false);
      }
    },
    [loading, messages, takeToolCall],
  );

  /** Restore = the checkpoint becomes the newest version; nothing is thrown away. */
  const onRestore = useCallback((id: string) => {
    const source = versionsRef.current.find((v) => v.id === id);
    if (!source) return;
    const restored: PageVersion = {
      ...source,
      id: crypto.randomUUID(),
      label: `v${versionsRef.current.length + 1}`,
      createdAt: Date.now(),
      restoredFrom: source.label,
    };
    versionsRef.current = [...versionsRef.current, restored];
    setVersions(versionsRef.current);
    setSelectedId(restored.id);
    toast.success(`${source.label} restored as ${restored.label} — the next change builds on it.`);
  }, []);

  return (
    <div className="app">
      <TopBar versionCount={versions.length} />
      <Resizable
        orientation="horizontal"
        maximizedIndex={maximized ? PREVIEW_PANEL : null}
        onMaximizeChange={(e) => setMaximized(e.detail.maximized)}
        className="split"
      >
        <ResizableItem size="38%" min="320px">
          <div className="chat-col" ref={chatWrapRef}>
            <Chat
              messages={messages}
              loading={loading}
              suggestions={SUGGESTIONS}
              suggestionMode="submit"
              placeholder="Describe a page, or ask for a change…"
              chatTitle="Build"
              cardTypes={cards.tags}
              cardSchemas={cards.validationSchemas}
              onSubmit={onSubmit}
              empty
              style={{ display: 'block', width: '100%', height: '100%' }}
            >
              {/* REPLACE slot: the thread's own zero-state. The composer and the
                  suggestion chips below still render. */}
              <div slot="empty" className="chat-empty">
                <h1>Describe a page.</h1>
                <p>
                  Every reply builds one self-contained HTML file and drops it in the preview. Ask for changes —
                  <em> “make the header dark”</em>, <em>“add pricing”</em>, <em>“use a serif font”</em> — and each one
                  becomes a version you can flip back to.
                </p>
              </div>
            </Chat>
          </div>
        </ResizableItem>
        <ResizableItem min="360px">
          <PreviewPanel
            versions={versions}
            selected={selected}
            tab={tab}
            device={device}
            maximized={maximized}
            streaming={loading}
            onSelect={setSelectedId}
            onRestore={onRestore}
            onTab={setTab}
            onDevice={setDevice}
            onToggleMaximize={() => setMaximized((m) => !m)}
          />
        </ResizableItem>
      </Resizable>
    </div>
  );
}
