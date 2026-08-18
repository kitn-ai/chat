import { type JSX, splitProps, createResource, Show } from 'solid-js';
import { cn } from '../utils/cn';
import { useChatConfig } from '../primitives/chat-config';
import { highlight, isCodeHighlightingEnabled } from '../primitives/highlighter';

// --- CodeBlock (Root) ---

export interface CodeBlockProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children?: JSX.Element;
}

function CodeBlock(props: CodeBlockProps) {
  const [local, rest] = splitProps(props, ['children', 'class']);
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
  const [local, rest] = splitProps(props, ['code', 'language', 'theme', 'class']);
  const config = useChatConfig();

  const lang = () => local.language ?? 'tsx';
  const theme = () => local.theme ?? config.codeTheme();
  const highlightingOn = () => isCodeHighlightingEnabled() && config.codeHighlight();

  // When highlighting is off, the source is null so the fetcher never runs and
  // no Shiki code is ever imported — the plain `<pre>` fallback renders instead.
  const [highlighted] = createResource(
    () => (highlightingOn() ? { code: local.code, lang: lang(), theme: theme() } : null),
    (src) => highlight(src.code, src.lang, src.theme)
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
  const [local, rest] = splitProps(props, ['children', 'class']);
  return (
    <div
      class={cn('flex items-center justify-between', local.class)}
      {...rest}
    >
      {local.children}
    </div>
  );
}

export { CodeBlock, CodeBlockCode, CodeBlockGroup };
