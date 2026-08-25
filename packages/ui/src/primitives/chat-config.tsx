import { createContext, useContext, type Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';

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
    <ChatConfigContext value={value}>
      {props.children}
    </ChatConfigContext>
  );
}

/** Read the current chat config. Returns defaults if no provider is present. */
export function useChatConfig(): ChatConfigValue {
  return useContext(ChatConfigContext)!;
}

/** Maps prose size to Tailwind prose class */
export function proseClass(size: ProseSize): string {
  switch (size) {
    case 'xs': return 'prose-sm text-xs';
    case 'sm': return 'prose-sm';
    case 'base': return '';
    case 'lg': return 'prose-lg';
  }
}

/** Maps prose size to a text class for non-prose elements (sidebar, input) */
export function textClass(size: ProseSize): string {
  switch (size) {
    case 'xs': return 'text-xs';
    case 'sm': return 'text-sm';
    case 'base': return 'text-base';
    case 'lg': return 'text-lg';
  }
}
