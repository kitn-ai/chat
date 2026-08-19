import { defineWebComponent } from './define';
import { CodeBlock, CodeBlockCode } from '../components/code-block';
import { ChatConfig, useChatConfig, type ProseSize } from '../primitives/chat-config';

interface Props extends Record<string, unknown> {
  /** The source code to render. */
  code: string;
  /** Language grammar (e.g. `js`, `python`). Defaults to `tsx`. */
  language?: string;
  /** Shiki theme name. */
  codeTheme?: string;
  /** Disable syntax highlighting (renders plain text, no Shiki). */
  codeHighlight?: boolean;
  /**
   * Show the copy button. **Defaults to ON**, because this element is documented
   * as shipping one. Opt out with `copy="false"` or `el.copy = false`.
   */
  copy?: boolean;
  /** Code text sizing. */
  proseSize?: ProseSize;
}

/**
 * `<kai-code-block>` — one syntax-highlighted code block (with a copy button).
 * Code via the `code` property; `language`/`code-theme` via attributes.
 *
 * The copy button is ON by default and writes the raw `code` property, never the
 * highlighted markup. Turn it off with `copy="false"`. Style it via
 * `kai-code-block::part(copy)`.
 */
defineWebComponent<Props>('kai-code-block', {
  code: '',
  language: undefined,
  codeTheme: 'github-dark-dimmed',
  codeHighlight: true,
  copy: true,
  proseSize: 'sm',
}, (props, { flag }) => {
  const outer = useChatConfig();
  return (
    <ChatConfig
      proseSize={props.proseSize}
      codeTheme={props.codeTheme}
      codeHighlight={flag('codeHighlight')}
      portalMount={outer.portalMount()}
    >
      {/* The ELEMENT opts in; the Solid `CodeBlock` default stays OFF so markdown and
          artifact are untouched. `copyText` is the raw property — the button must
          never copy what Shiki produced. `copy` is NOT reflected, matching
          `codeHighlight` beside it: reflecting a default-ON flag would stamp `copy=""`
          on every instance for no benefit, and the runtime-attribute hazard that
          earned `reflectFlag` elsewhere needs a BARE attribute, which is a no-op on a
          flag that is already on. The meaningful spelling, `copy="false"`, is a real
          prop change and is pinned as one. */}
      <CodeBlock copy={flag('copy')} copyText={props.code}>
        <CodeBlockCode code={props.code} language={props.language} />
      </CodeBlock>
    </ChatConfig>
  );
});
