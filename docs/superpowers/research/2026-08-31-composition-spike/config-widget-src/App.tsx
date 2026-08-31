import { createSignal } from 'solid-js';
import { ChatThread, createKaiChat, Dock, Empty, EmptyHeader, EmptyTitle, EmptyDescription, Button, DockCloseGlyph } from '@kitn.ai/ui/solid';
import type { AttachmentData, ChatThreadController } from '@kitn.ai/ui/solid';
import { createMockResponder, type MockReply } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';

import { localStorageStore } from '@kitn.ai/ui/solid';

// Provider seam: mock — keyless, streams locally, announces itself once.
// Swap for provider.mode "endpoint" in the construct and re-run kai dev; the
// generated fetch keeps this exact shape (the seam is the point).
//
// The script below is this template's mock conversation: it exercises every
// content type this construct enables (reasoning, citations, tool rows)
// through the kit's real parser, so the first run SHOWS the rendering paths a
// live model would use. Edit it freely — it is data, not wiring.
const MOCK_SCRIPT: MockReply[] = [
  {
    "reasoning": "An order question. Look the order up before answering — guessing a delivery date is worse than a short wait.",
    "text": "Let me pull up that order.",
    "toolCalls": [
      {
        "name": "lookup_order",
        "arguments": {
          "order": "KAI-1042"
        }
      }
    ]
  },
  {
    "text": "Order KAI-1042 shipped with DHL and should arrive Thursday. (I'm a local mock — no provider was contacted — but a real model's tool call renders exactly like the row above.)"
  },
  {
    "text": "Anything else? Still the mock: swap the provider seam for your endpoint and this handler keeps its exact shape."
  }
];

// Scripted outputs for the demo tool calls above. The wire only ever ANNOUNCES
// a call — executing it and answering is the host's side of the seam — so the
// mock's "host" is this map plus the settle step after the read. It disappears
// with the mock: a real backend's tool loop replaces it.
const MOCK_TOOL_OUTPUTS: Record<string, Record<string, unknown>> = {
  "lookup_order": {
    "order": "KAI-1042",
    "status": "shipped",
    "carrier": "DHL",
    "eta": "Thursday"
  }
};

const respond = createMockResponder({ replies: MOCK_SCRIPT });
const chat = createKaiChat();

async function submit(detail: { value: string; attachments: AttachmentData[] }) {
  if (!detail.value.trim() || chat.loading()) return;
  chat.append({
    id: crypto.randomUUID(),
    role: 'user',
    parts: [
      { type: 'text', text: detail.value },
      ...detail.attachments.map((attachment) => ({ type: 'file' as const, attachment })),
    ],
  });
  const stream = chat.streamAssistant();
  try {
    await readOpenAIStream(respond(detail.value), stream);
    for (const part of chat.messages().find((m) => m.id === stream.id)?.parts ?? []) {
      if (part.type !== 'tool' || part.tool.state !== 'input-available' || !part.tool.toolCallId) continue;
      const output = MOCK_TOOL_OUTPUTS[part.tool.type];
      if (output) stream.upsertTool(part.tool.toolCallId, { state: 'output-available', output });
    }
    stream.done();
  } catch (err) {
    stream.abort(err instanceof Error ? err.message : String(err));
  }
}


// ChatThread is the kit's own MOST-INTEGRATED chat surface — the same
// composition <kai-chat>'s facade renders (src/elements/chat.tsx). It owns
// the message list, the composer (padding, focus ring, the send button) and
// their layout AS ONE UNIT, so nothing here re-derives spacing, alignment or
// focus styling by hand: every prior version of this file that hand-composed
// Thread + PromptInput + Button was restating layout the kit already owns,
// and every visual defect the owner hit (flush composer, a clipped focus
// ring) traced back to that restatement. Composing ChatThread directly
// leaves NOTHING here to restate it with.
//
// Capability gating (format rule: an undeclared capability's affordance must
// be OFF). The construct schema carries ONE capability field so far
// (capabilities.starters, Task 8) — every other affordance below is gated to
// "off" unconditionally, not per-construct, until there's a field to gate ON.
//   - webSearch / voice: real ChatThreadProps booleans, default OFF when
//     omitted — set to `false` explicitly rather than left implicit, so the
//     gating decision is visible in the emitted source, not just inferred
//     from an absent prop.
//   - suggestions: ChatThread ALREADY owns starter prompts end to end — its
//     own `suggestions` prop renders the chips, hides them once
//     `messages` is non-empty, and (default `suggestionMode="submit"`)
//     calls `onSubmit` with the clicked text exactly like a typed submit.
//     So capabilities.starters threads straight into that prop; there is
//     nothing to hand-compose. Omitted (undefined) when no starters are
//     declared, same off-by-default effect as the booleans above.
//   - models: omitted (undefined) — no model switcher; no capabilities field yet.
//   - attachments (the paperclip): gated via ChatThread's `attach`/`accept`
//     props (kit gap closed — ChatThread forwards both to DefaultPromptInput,
//     mirroring webSearch/voice). ChatThread ALREADY owns the whole
//     round-trip end to end — the paperclip button, staged previews, staging
//     each file as a data URI (never a blob object URL; see
//     AttachmentData.url's doc in components/attachment-types.ts), and
//     handing the staged list back via onSubmit's `attachments` — and its
//     Message component ALREADY groups consecutive file parts into one
//     attachment row (message.tsx). So there is nothing to hand-compose
//     here, same lesson as suggestions above: hand-rolling a second picker or
//     a second file-part renderer would restate what ChatThread/Message
//     already own. capabilities.attachments threads straight into
//     attach/accept; the only App.tsx-owned piece is folding the picked
//     attachments into the outgoing message's parts at the submit site
//     (see emitProviderSetup) since createKaiChat's own append/streamAssistant
//     ops don't do that folding themselves.
//   - reasoning: gated via ChatThread's own `reasoning` prop (kit gap closed
//     — ChatThread forwards it to every MessageBody as `reasoningMode`,
//     mirroring attach/accept). `'full'` is both the schema default and
//     ChatThread's own default, so it and an absent field emit no prop at
//     all — the SAME off-by-default convention as every other capability
//     here, just anchored on the medium's existing default instead of an
//     "off" value, since a reasoning disclosure is normal chat behavior, not
//     an opt-in affordance like the paperclip or a starter chip.
//   - empty (the welcome-screen greeting, Task 14): gated via ChatThread's
//     own `emptyContent` prop, plain JSX rendered in the SAME shadow tree
//     this file's App already composes ChatThread inside of (see
//     emitEmptyContentProp's own doc for why that boundary needs no Portal
//     at all). `capabilities.starters`' chips and the composer still render
//     underneath it: ChatThread's own doc comment on `emptyContent` is
//     explicit that it replaces only the empty MESSAGE LIST.
//   - the widget close control (owner feedback on the live demo): a declared
//     `header.title` on a `widget` layout gets its close button threaded
//     into ChatThread's own header row via `headerEndContent`, wired back to
//     Dock's `controllerRef` seam through a local closure — see
//     emitDockCloseVar/emitHeaderEndContentProp's docs. No header means no
//     row for it to sit in, so that case is untouched and Dock's own built-in
//     mobile X keeps covering it.
//   - conversations (Task 5): gated via ChatThread's own `conversations`/
//     `store` props (kit-owned end to end — the prior-conversations list,
//     list/load/save, autosave on every `chat.messages()` change). Requires
//     capabilities.history persistence `local` or `endpoint` (schema
//     superRefine, C-4) and SUBSUMES this file's hand-rolled history effect
//     when on — see emitHistorySetup's own doc for the persistence-ownership
//     decision: the store prop is the ONLY persistence mechanism emitted,
//     never both. ChatThread never mutates `messages` itself, so
//     `onConversationLoad` is ALSO wired here (`chat.setMessages(() =>
//     messages)`) — without it, select/new/mount-restore all update
//     ChatThread's own internal view/list state while the rendered thread
//     never changes (see emitConversationsProps's own doc for the Task 6
//     live-browser bug this fixes).
//   - conversations + widget (owner follow-up): closing the widget while its
//     list view is open must not leave it there for the next open — see
//     widgetHasConversationsChrome/emitDockOnOpenChangeProp's docs. Wired only
//     for `widget`, the one layout with something that closes/reopens at all.
export function App() {
  let dockClose: (() => void) | undefined;
  let chatController: ChatThreadController | undefined;
  const [dockOpen, setDockOpen] = createSignal(false);
  const [anyUnread, setAnyUnread] = createSignal(false);
  return (
    <Dock label="support-widget" position="bottom-end" hideClose={true} controllerRef={(api) => (dockClose = () => api.setOpen(false))} onOpenChange={(open) => { setDockOpen(open); if (!open) chatController?.closeConversationsList(); }} unread={anyUnread()}>
      <ChatThread messages={chat.messages()} loading={chat.loading()} placeholder="Ask anything" onSubmit={submit} webSearch={false} voice={false} chatTitle={"Support"} headerEndContent={<Button variant="ghost" size="icon-sm" aria-label="Close support-widget" onClick={() => dockClose?.()}><DockCloseGlyph /></Button>} attach={true} accept={"image/*,application/pdf"} suggestions={["Where's my order?","Request a refund"]} userActions={["edit"]} assistantActions={["copy","like","dislike"]} emptyContent={<Empty><EmptyHeader><EmptyTitle>{"Hi, we're here to help"}</EmptyTitle><EmptyDescription>{"Ask us about orders, refunds, and more."}</EmptyDescription></EmptyHeader></Empty>} home={{"greeting":{"title":"How can we help? 👋","subtitle":"Orders, refunds, anything."},"recentConversation":true,"links":[{"label":"Help center","href":"https://ui.kitn.ai","description":"Guides and FAQs","icon":"book-open"}]}} conversations={true} store={localStorageStore('support-widget')} onConversationLoad={(messages) => chat.setMessages(() => messages)} controllerRef={(api) => (chatController = api)} hostOpen={dockOpen()} onUnreadChange={setAnyUnread} />
    </Dock>
  );
}
