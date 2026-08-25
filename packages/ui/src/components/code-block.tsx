import { omit, createEffect, createSignal, onCleanup, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Copy, Check } from 'lucide-solid';
import { cn } from '../utils/cn';
import { useChatConfig } from '../primitives/chat-config';
import { highlight, isCodeHighlightingEnabled } from '../primitives/highlighter';

// --- CodeBlock (Root) ---

export interface CodeBlockProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children?: JSX.Element;
  /**
   * Render a copy button in a header row above the code.
   *
   * DEFAULT OFF, and deliberately. This component is shared by three surfaces —
   * `markdown.tsx` (every fenced block in every assistant message), `artifact.tsx`
   * (the code panel), and the `<kai-code-block>` facade — and only the ELEMENT is
   * documented as shipping a copy button. Defaulting on would add one to every code
   * block in every message, a kit-wide visible change. The facade opts in; the other
   * two are untouched, which `tests/elements/code-block.test.tsx` pins both
   * behaviourally and at the call sites.
   */
  copy?: boolean;
  /**
   * The exact text the copy button puts on the clipboard.
   *
   * Named for what it DOES rather than what it holds, because the distinction is the
   * whole contract: by the time the button is clicked the source has been through
   * Shiki, so anything read back out of the DOM is either `<span>`-laden HTML or a
   * `textContent` reconstruction — and the reconstruction is where tabs, blank lines
   * and trailing newlines quietly change. This prop never goes near the highlighter.
   */
  copyText?: string;
}

/** How long the button stays in its acknowledged state. Matches MessageCopyButton. */
const COPIED_MS = 2000;

function CodeBlockCopyButton(props: { text: string }) {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A click just before unmount would otherwise set state on a disposed owner.
  onCleanup(() => clearTimeout(timer));

  return (
    <button
      type="button"
      part="copy"
      // The name carries the state, so a screen-reader user gets the same
      // acknowledgement the icon swap gives a sighted one. The glyph is decorative.
      aria-label={copied() ? 'Copied' : 'Copy code'}
      class={cn(
        'inline-flex items-center justify-center rounded-md p-1.5',
        'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      onClick={() => {
        // Same mechanism as MessageCopyButton. A rejected promise (no permission,
        // insecure context) must not become an unhandled rejection.
        void Promise.resolve(navigator.clipboard?.writeText(props.text)).catch(() => {});
        setCopied(true);
        clearTimeout(timer);
        timer = setTimeout(() => setCopied(false), COPIED_MS);
      }}
    >
      <Show when={copied()} fallback={<Copy size={14} aria-hidden="true" />}>
        <Check size={14} aria-hidden="true" class="text-emerald-500" />
      </Show>
    </button>
  );
}

function CodeBlock(props: CodeBlockProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'children', 'class', 'copy', 'copyText');
  return (
    <div
      class={cn(
        'not-prose flex w-full flex-col overflow-clip border',
        'border-border bg-card text-card-foreground',
        // Radius is a CSS var (default = rounded-xl) so it can be set to 0 for
        // flush embedding, e.g. under framework tabs in the docs Code panel.
        'rounded-[var(--kai-code-radius,0.75rem)]',
        local.class
      )}
      {...rest}
    >
      <Show when={local.copy}>
        {/* A header row, NOT an overlay on the code: the code region scrolls
            horizontally, so a button inside it would ride off-screen with the code.
            Always visible — hover-only affordances fail touch outright and are
            undiscoverable everywhere else. */}
        <CodeBlockGroup class="justify-end border-b border-border px-2 py-1">
          <CodeBlockCopyButton text={local.copyText ?? ''} />
        </CodeBlockGroup>
      </Show>
      {local.children}
    </div>
  );
}

// --- CodeBlockCode ---

export interface CodeBlockCodeProps extends JSX.HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
  theme?: string;
}

function CodeBlockCode(props: CodeBlockCodeProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'code', 'language', 'theme', 'class');
  const config = useChatConfig();

  const lang = () => local.language ?? 'tsx';
  const theme = () => local.theme ?? config.codeTheme();
  const highlightingOn = () => isCodeHighlightingEnabled() && config.codeHighlight();

  // When highlighting is off, the source is null so the fetcher never runs and
  // no Shiki code is ever imported — the plain `<pre>` fallback renders instead.
  // V2-PORT: createResource is removed; a signal + two-argument effect reproduces
  // the exact contract this site used (undefined until resolved, stale results
  // dropped via the returned cleanup, no Loading boundary involved).
  const [highlighted, setHighlighted] = createSignal<string | undefined>(undefined);
  createEffect(
    () => (highlightingOn() ? { code: local.code, lang: lang(), theme: theme() } : null),
    (src) => {
      if (!src) {
        setHighlighted(undefined);
        return;
      }
      let stale = false;
      void highlight(src.code, src.lang, src.theme).then((html) => {
        if (!stale) setHighlighted(html);
      });
      return () => { stale = true; };
    },
  );

  const codeTextSize = () => {
    switch (config.proseSize()) {
      case 'xs': return 'text-[11px]';
      case 'sm': return 'text-[13px]';
      case 'base': return 'text-sm';
      case 'lg': return 'text-base';
    }
  };

  const classNames = () =>
    cn(
      // `kai-focus-inset`: this region fills a rounded `overflow: clip` wrapper,
      // so the default focus outline (offset 2px, i.e. entirely outside the
      // border box) was clipped away and keyboard users saw nothing. The inset
      // ring is drawn inside the box, where the wrapper cannot erase it.
      'w-full overflow-x-auto kai-focus-inset [&>pre]:px-4 [&>pre]:py-4',
      codeTextSize(),
      local.class
    );

  return (
    // `tabindex={0}` makes the horizontally-scrollable region reachable by
    // keyboard (axe `scrollable-region-focusable`); `{...rest}` lets a consumer
    // override it. No `role="region"` — that would demand an accessible name.
    <Show
      when={highlighted()}
      fallback={
        <div class={classNames()} tabindex={0} {...rest}>
          <pre><code>{local.code}</code></pre>
        </div>
      }
    >
      <div class={classNames()} tabindex={0} innerHTML={highlighted()} {...rest} />
    </Show>
  );
}

// --- CodeBlockGroup ---

export interface CodeBlockGroupProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children?: JSX.Element;
}

function CodeBlockGroup(props: CodeBlockGroupProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'children', 'class');
  return (
    <div
      class={cn('flex items-center justify-between', local.class)}
      {...rest}
    >
      {local.children}
    </div>
  );
}

// CodeBlockCopyButton is deliberately NOT exported: `src/index.ts` re-exports this
// module's public trio, and adding a fourth symbol here that index.ts does not carry
// would create a half-public component. It is an implementation detail of `copy`.
export { CodeBlock, CodeBlockCode, CodeBlockGroup };
