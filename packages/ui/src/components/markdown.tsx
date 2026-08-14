import { splitProps, createMemo, createUniqueId, For, Show, Switch, Match } from 'solid-js';
import { cn } from '../utils/cn';
import { Marked } from 'marked';
import { CodeBlock, CodeBlockCode } from './code-block';
import { useChatConfig, textClass } from '../primitives/chat-config';
import { isSafeUrl } from '../primitives/card-routing';

// --- The markdown sink -------------------------------------------------------
//
// `MarkdownBlock` writes this parser's output to `innerHTML`, so THIS is the one
// place in the kit where a string the model produced becomes live DOM in the
// host page's origin. `marked` passes raw HTML through verbatim by default and
// dropped its own URL sanitizing in v5, so both have to be handled here.
//
// The threat model is NOT a hostile provider. An attacker only needs to
// influence the model's OUTPUT -- a user asking to be shown an `<img onerror>`
// example, a prompt-injected model, or RAG over an untrusted document all reach
// this sink against a perfectly trusted provider.
//
// WHY ESCAPE RATHER THAN SANITIZE (no DOMPurify):
//   - A sanitizer needs a DOM. In Node this package's ESM build has no
//     `sanitize` at all (`isSupported === false`), so the SSR path either throws
//     or gets "guarded" into returning the payload UNCHANGED -- a silent
//     passthrough of exactly the string we were trying to neutralise. Escaping
//     is pure string work and behaves identically on server and client.
//   - It costs no dependency. Escaping is the ~20 lines below; DOMPurify is
//     ~35 KB gzipped of ESM in a package that gates its own footprint.
//   - For a CHAT UI it is also the better RENDERING, not just the safer one.
//     Raw HTML in model output is either the model quoting markup -- which the
//     reader should SEE as text -- or an injection. Escaping serves the first
//     case correctly and defuses the second. Nothing in this repo emits markdown
//     that relies on inline HTML.
// There is deliberately NO opt-in to restore raw HTML: nothing needs it today,
// and an unsafe switch is the hole again for whoever flips it.
//
// This is a PRIVATE `Marked` instance, and that is load-bearing rather than
// tidiness. Configuring the shared `marked` singleton would mean a consumer's
// own `marked.use({ renderer })` elsewhere in the same app silently replaces
// this renderer and reopens the vulnerability. It also stops the kit mutating
// global `marked` options out from under a consumer, which it used to do.

/** Escape for HTML TEXT content. */
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape for a double-quoted ATTRIBUTE value. */
function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    /** Raw HTML -- block (`Tokens.HTML`) and inline (`Tokens.Tag`) both land
     *  here. Rendered as visible text instead of markup. */
    html({ text }) {
      return escapeText(text);
    },

    /** Markdown link syntax. marked BUILDS this anchor itself, so escaping raw
     *  HTML does not cover it and it needs the scheme allowlist of its own.
     *  A blocked link keeps its LABEL -- the reader still sees what the model
     *  wrote, we simply refuse to make it clickable. */
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!isSafeUrl(href)) return text;
      const t = title ? ` title="${escapeAttr(title)}"` : '';
      return `<a href="${escapeAttr(href)}"${t}>${text}</a>`;
    },

    /** Markdown image syntax. Same reasoning as `link`; a blocked image falls
     *  back to its alt text. NOTE this also blocks `data:` image URIs, which
     *  are inert inside `<img>` -- one allowlist for both is worth more than
     *  the rare inline-data-image case it costs. */
    image({ href, title, text }) {
      if (!isSafeUrl(href)) return escapeText(text);
      const t = title ? ` title="${escapeAttr(title)}"` : '';
      return `<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}"${t}>`;
    },
  },
});

export interface MarkdownProps {
  content: string;
  id?: string;
  class?: string;
  codeTheme?: string;
  /** Optional `::part` name(s) to expose on the rendered root. Lets callers
   *  (e.g. the message bubble) surface a styleable part through the shadow. */
  part?: string;
}

interface ParsedBlock {
  type: 'markdown' | 'code';
  content: string;
  language?: string;
}

function parseMarkdownIntoBlocks(markdown: string): ParsedBlock[] {
  const tokens = md.lexer(markdown);
  return tokens.map((token) => {
    if (token.type === 'code') {
      return {
        type: 'code' as const,
        content: token.text,
        language: token.lang || undefined,
      };
    }
    return {
      type: 'markdown' as const,
      content: token.raw,
    };
  });
}

function MarkdownBlock(props: { content: string }) {
  const html = createMemo(() => {
    try {
      return md.parse(props.content, { async: false }) as string;
    } catch {
      // The parse failed, so nothing has been escaped -- the raw source must
      // NOT go to `innerHTML`. Escape it and show it as text.
      return escapeText(props.content);
    }
  });

  return <div innerHTML={html()} />;
}

function Markdown(props: MarkdownProps) {
  const [local] = splitProps(props, ['content', 'id', 'class', 'codeTheme', 'part']);
  const config = useChatConfig();
  const blockId = () => local.id ?? createUniqueId();
  const blocks = createMemo(() => parseMarkdownIntoBlocks(local.content));

  return (
    <div part={local.part} class={cn('chat-markdown max-w-none break-words whitespace-normal [&>div:first-child>p:first-child]:mt-0 [&>div:last-child>p:last-child]:mb-0', textClass(config.proseSize()), local.class)}>
      <For each={blocks()}>
        {(block) => (
          <Switch>
            <Match when={block.type === 'code'}>
              <CodeBlock class="my-4">
                <CodeBlockCode
                  code={block.content}
                  language={block.language}
                  theme={local.codeTheme ?? config.codeTheme()}
                />
              </CodeBlock>
            </Match>
            <Match when={block.type === 'markdown'}>
              <MarkdownBlock content={block.content} />
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
}

export { Markdown };
