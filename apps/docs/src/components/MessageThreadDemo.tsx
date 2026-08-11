/** Live demo for "Compose a message thread" — lays out a custom message list from
 *  standalone <kai-message> elements instead of <kai-chat>, one element per turn.
 *  It exercises the three per-message composition seams:
 *    - slot="before-body" — a per-message model-name + timestamp header (INJECT)
 *    - slot="after-body"  — a citation/sources row + a token-cost line (INJECT)
 *    - slot="avatar"      — a custom avatar that REPLACES the built-in rail;
 *                           the user turn drops the rail with avatar="none".
 *
 *  Built like ComposedShell.tsx / ComposerDemo.tsx: array/object data is set as a
 *  JS property in onMount and events are wired with addEventListener, because
 *  Solid's on:/onClick handlers don't cross the shadow boundary. Theme-aware —
 *  mirrors the page theme. No hardcoded colors: every surface reads a design token. */
import { onMount, onCleanup } from 'solid-js';
import { loadKit, syncKaiTheme } from './example/kit';

type AnyEl = HTMLElement & Record<string, unknown>;

interface MessagePart {
  type: 'text' | 'reasoning';
  text: string;
  label?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  actions?: string[];
}

const USER_MESSAGE: ChatMessage = {
  id: 'm-u',
  role: 'user',
  parts: [{ type: 'text', text: 'Which model handled this, and what did it cost?' }],
};

const ASSISTANT_MESSAGE: ChatMessage = {
  id: 'm-a',
  role: 'assistant',
  parts: [
    { type: 'reasoning', text: 'Compare the two sources, reconcile the figures, then summarise.', label: 'Reasoning' },
    {
      type: 'text',
      text: 'Here is the summary you asked for. I cross-checked two sources before answering, and the citation is below.',
    },
  ],
  actions: ['copy', 'like', 'dislike', 'regenerate'],
};

export default function MessageThreadDemo() {
  let userEl: AnyEl | undefined;
  let assistantEl: AnyEl | undefined;

  const cleanups: Array<() => void> = [];

  onMount(async () => {
    await loadKit();

    // A user turn: drop the avatar rail so the body spans the full row.
    if (userEl) {
      customElements.upgrade(userEl);
      userEl.setAttribute('avatar', 'none');
      userEl.message = USER_MESSAGE;
    }

    // An assistant turn: the message object drives the content + action bar; the
    // slotted children (declared in JSX below) fill the three composition seams.
    if (assistantEl) {
      customElements.upgrade(assistantEl);
      assistantEl.message = ASSISTANT_MESSAGE;
      // Action clicks (copy / like / regenerate …) come back here, on the element.
      const onAction = (e: Event) => {
        // A real app would copy, persist the vote, or re-run the turn. Demo: no-op.
        void (e as CustomEvent<{ messageId: string; action: string }>).detail;
      };
      assistantEl.addEventListener('kai-message-action', onAction);
      cleanups.push(() => assistantEl!.removeEventListener('kai-message-action', onAction));
    }

    // Theme-sync each <kai-message> to the page theme.
    for (const el of [userEl, assistantEl]) {
      if (el) cleanups.push(syncKaiTheme(el));
    }

    onCleanup(() => cleanups.forEach((c) => c()));
  });

  return (
    <div class="not-content my-5 flex justify-center">
      <div
        style={{
          display: 'flex',
          width: '100%',
          'max-width': '40rem',
          'flex-direction': 'column',
          gap: '1.5rem',
          padding: '1.25rem',
          border: '1px solid var(--kai-color-border, var(--sl-color-gray-5))',
          'border-radius': '0.75rem',
          background: 'var(--kai-color-card, var(--sl-color-bg))',
        } as any}
      >
        {/* A user turn — no avatar rail (predictable full-width body). */}
        {/* @ts-expect-error custom element */}
        <kai-message ref={(el: HTMLElement) => (userEl = el as AnyEl)} style={{ display: 'block' } as any} />

        {/* An assistant turn wiring up every seam: a custom avatar (REPLACE), a
            before-body model header (INJECT, above the content), and an after-body
            sources + cost row (INJECT, below the action bar). The slotted children
            are your own light DOM — your markup, your CSS, your tokens. */}
        {/* @ts-expect-error custom element */}
        <kai-message ref={(el: HTMLElement) => (assistantEl = el as AnyEl)} style={{ display: 'block' } as any}>
          {/* avatar (replace): your node stands in for the built-in rail. */}
          <div
            slot="avatar"
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'flex-shrink': '0',
              width: '2rem',
              height: '2rem',
              'border-radius': '0.5rem',
              'font-size': '0.75rem',
              'font-weight': '600',
              background: 'var(--kai-color-primary, var(--sl-color-accent))',
              color: 'var(--kai-color-primary-foreground, var(--sl-color-white))',
            } as any}
          >
            AI
          </div>

          {/* before-body (inject): a model-name + timestamp header above the content. */}
          <div
            slot="before-body"
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '0.5rem',
              'margin-bottom': '0.25rem',
              'font-size': '0.75rem',
              color: 'var(--kai-color-muted-foreground, var(--sl-color-gray-3))',
            } as any}
          >
            <span
              style={{
                display: 'inline-flex',
                'align-items': 'center',
                gap: '0.25rem',
                padding: '0.125rem 0.5rem',
                'border-radius': '9999px',
                'font-weight': '500',
                background: 'var(--kai-color-surface-strong, var(--sl-color-gray-6))',
                color: 'var(--kai-color-foreground, var(--sl-color-text))',
              } as any}
            >
              <span
                style={{
                  width: '0.375rem',
                  height: '0.375rem',
                  'border-radius': '9999px',
                  background: 'var(--kai-color-tool-green, #10b981)',
                } as any}
              />
              gpt-style-2
            </span>
            <span>just now</span>
          </div>

          {/* after-body (inject): a citation row + a token-cost line below the action bar. */}
          <div slot="after-body" style={{ display: 'flex', 'flex-direction': 'column', gap: '0.375rem', 'margin-top': '0.5rem' } as any}>
            {/* @ts-expect-error custom element */}
            <kai-source
              href="https://ui.kitn.ai"
              label="ui.kitn.ai"
              headline="AI/UI — composable chat UI"
              description="Framework-agnostic web components for AI chat."
              show-favicon
            />
            <span style={{ 'font-size': '0.6875rem', color: 'var(--kai-color-muted-foreground, var(--sl-color-gray-3))' } as any}>
              gpt-style-2 · 1,284 tokens · $0.012 · 1.9s
            </span>
          </div>
        </kai-message>
      </div>
    </div>
  );
}
