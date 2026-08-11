/** Live demo for the <kai-message> action row — copy, thumbs slide-to-fill, and the
 *  label tooltip on hover. The element wires the interactions itself; we just seed a
 *  message (with `actions`, which is what makes the bar render) and listen for
 *  `kai-message-action`, logging each event into a Console strip below the preview
 *  (mirroring the Playground/Cards preview→Console convention). */
import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import { loadKit, syncKaiTheme, syncToastRegionTheme } from './example/kit';

type AnyEl = HTMLElement & Record<string, unknown>;

// Shape mirrors apps/docs/src/data/samples/kai-message.ts (ASSISTANT_MESSAGE) and the
// ChatMessage interface in src/elements/chat-types.ts: { id, role, parts: MessagePart[], actions }.
// `actions` is REQUIRED — MessageBody only renders the bar when actions.length > 0,
// so without it there is no copy/thumbs row to demo.
const MESSAGE = {
  id: 'm-feedback',
  role: 'assistant',
  parts: [
    {
      type: 'text',
      text: 'A closure is a function bundled with the variables in scope where it was defined — it keeps reading and writing those variables even after the outer function has returned.',
    },
  ],
  actions: ['copy', 'like', 'dislike'],
};

export default function FeedbackDemo() {
  let host: AnyEl | undefined;
  const [log, setLog] = createSignal<string[]>([]);
  const push = (m: string) => setLog((p) => [...p.slice(-5), m]);

  onMount(async () => {
    await loadKit();
    if (!host) return;
    customElements.upgrade(host);

    host.message = MESSAGE;
    // 'always' (the default) keeps the bar visible so the interactions are discoverable.
    host.actionsReveal = 'always';

    host.addEventListener('kai-message-action', (e: Event) => {
      const d = (e as CustomEvent).detail as { action: string; state?: 'on' | 'off' };
      push(`kai-message-action  •  ${d.action}${d.state ? `  (${d.state})` : ''}`);
    });

    onCleanup(syncKaiTheme(host));
    // Copy / vote raise a feedback toast. Even though it's anchored to the message,
    // toast-store mounts its <kai-toast-region> on document.body — so theme-sync that
    // body region too, or the pill renders in the OS theme on a toggled page.
    onCleanup(syncToastRegionTheme());
  });

  return (
    <div class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface">
      {/* Preview */}
      <div class="p-5">
        {/* @ts-expect-error custom element */}
        <kai-message ref={(el: HTMLElement) => (host = el as AnyEl)} style={{ display: 'block' }} />
        <p class="mt-3 text-xs text-ink-3">
          Hover a button for its label tooltip · copy swaps to a check · thumbs slide-to-fill, re-tap to clear.
        </p>
      </div>

      {/* Console — below the preview, mirroring the Playground convention */}
      <div class="border-t border-line bg-surface-2 px-4 py-3">
        <div class="mb-1.5 flex items-center justify-between">
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
            <span class="size-1.5 rounded-full bg-brand"></span> Console
          </div>
          <button
            type="button"
            onClick={() => setLog([])}
            disabled={!log().length}
            class="cursor-pointer appearance-none border-0 bg-transparent text-xs font-medium text-ink-3 transition-colors hover:text-ink disabled:opacity-40"
          >
            Clear
          </button>
        </div>
        <div class="min-h-[1.75rem] font-mono text-sm leading-relaxed text-ink-2">
          <Show
            when={log().length}
            fallback={<span class="font-sans text-ink-3">Copy or vote — events appear here.</span>}
          >
            <For each={log()}>{(line) => <div class="whitespace-pre-wrap break-words">{line}</div>}</For>
          </Show>
        </div>
      </div>
    </div>
  );
}
