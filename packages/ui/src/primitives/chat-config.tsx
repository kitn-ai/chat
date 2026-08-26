import { createContext, useContext, type Accessor, type JSX } from 'solid-js';

export type ProseSize = 'xs' | 'sm' | 'base' | 'lg';

export interface ChatConfigValue {
  /** Prose/text size for messages, markdown, and UI elements */
  proseSize: Accessor<ProseSize>;
  /** Shiki theme for code blocks */
  codeTheme: Accessor<string>;
  /** Node the kit's overlays portal into; undefined → document.body */
  portalMount: Accessor<HTMLElement | undefined>;
  /** Whether code blocks are syntax-highlighted; false → plain text, no Shiki loaded */
  codeHighlight: Accessor<boolean>;
}

const defaultConfig: ChatConfigValue = {
  proseSize: () => 'sm' as ProseSize,
  codeTheme: () => 'github-dark-dimmed',
  portalMount: () => undefined,
  codeHighlight: () => true,
};

const ChatConfigContext = createContext<ChatConfigValue>(defaultConfig);

export interface ChatConfigProps {
  proseSize?: ProseSize;
  codeTheme?: string;
  portalMount?: HTMLElement;
  codeHighlight?: boolean;
  children: JSX.Element;
}

/**
 * Provides chat-wide appearance settings to all child components.
 * Set once at the top level — MessageContent, Markdown, CodeBlock,
 * ConversationList, and PromptInput all read from this.
 */
export function ChatConfig(props: ChatConfigProps) {
  const value: ChatConfigValue = {
    proseSize: () => props.proseSize ?? 'sm',
    codeTheme: () => props.codeTheme ?? 'github-dark-dimmed',
    portalMount: () => props.portalMount,
    codeHighlight: () => props.codeHighlight ?? true,
  };

  return (
    <ChatConfigContext.Provider value={value}>
      {props.children}
    </ChatConfigContext.Provider>
  );
}

/** Read the current chat config. Returns defaults if no provider is present. */
export function useChatConfig(): ChatConfigValue {
  return useContext(ChatConfigContext)!;
}

/**
 * Maps prose size to the Tailwind Typography *size modifier* for consumers who
 * render their own `prose` block.
 *
 * The `prose-*` names are deliberately NOT re-pointed at the --kai-text-* scale.
 * They are not font sizes: each is a plugin-generated bundle of proportional
 * margins, list indents, heading ratios and line-heights for every nested
 * element, keyed to hardcoded rems, and they only do anything alongside `prose`
 * itself. There is no `prose-body` to alias them to, and collapsing them to a
 * bare font-size would throw away the vertical rhythm that is their whole job.
 * The kit's own markdown does not go through them at all — it renders through
 * `.chat-markdown` (theme.css), which is em-relative and therefore already
 * scales off whatever `textClass` sets.
 *
 * The one raw font-size here (`xs`) DOES join the semantic scale, so it stays in
 * step with `textClass('xs')`.
 */
export function proseClass(size: ProseSize): string {
  switch (size) {
    case 'xs': return 'prose-sm text-meta';
    case 'sm': return 'prose-sm';
    case 'base': return '';
    case 'lg': return 'prose-lg';
  }
}

/**
 * Maps prose size to a text class for message content, markdown, and non-prose
 * chrome (sidebar, input).
 *
 * These are the kit's SEMANTIC type-scale utilities, not Tailwind's raw scale:
 * each resolves through a namespaced --kai-text-* token in theme.css, so a
 * consumer setting `--kai-text-body` moves the reading text. The public
 * `proseSize` strings ('xs' | 'sm' | 'base' | 'lg') are unchanged — this is an
 * internal re-point only. Sizes are byte-identical to the Tailwind classes they
 * replace (text-meta ≡ text-xs, text-body ≡ text-sm, text-title ≡ text-base),
 * so nothing moves until a token is actually overridden.
 */
export function textClass(size: ProseSize): string {
  switch (size) {
    case 'xs': return 'text-meta';
    case 'sm': return 'text-body';
    case 'base': return 'text-title';
    case 'lg': return 'text-lg';
  }
}
