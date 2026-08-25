import { omit, createContext, useContext } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { useStickToBottom } from '../primitives/use-stick-to-bottom';

interface ChatContainerContextValue {
  isAtBottom: () => boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const ChatContainerContext = createContext<ChatContainerContextValue>();

export function useChatContainer() {
  const ctx = useContext(ChatContainerContext);
  if (!ctx) throw new Error('useChatContainer must be used within ChatContainer');
  return ctx;
}

// --- ChatContainerRoot ---

export interface ChatContainerRootProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function ChatContainerRoot(props: ChatContainerRootProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'children', 'class');
  const { ref, isAtBottom, scrollToBottom } = useStickToBottom();
  return (
    <ChatContainerContext value={{ isAtBottom, scrollToBottom }}>
      <div
        ref={ref}
        // `kai-focus-inset`: the log fills a clipping container, so the default
        // focus outline (drawn outside the border box) was clipped away
        // entirely — this region was tabbable with no visible indicator.
        class={cn('flex flex-col overflow-y-auto kai-focus-inset', local.class)}
        role="log"
        // Keyboard users must be able to scroll the conversation even when no
        // message contains a focusable control (WCAG 2.1.1 — axe
        // `scrollable-region-focusable`).
        tabindex={0}
        {...rest}
      >
        {local.children}
      </div>
    </ChatContainerContext>
  );
}

// --- ChatContainerContent ---

export interface ChatContainerContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function ChatContainerContent(props: ChatContainerContentProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'children', 'class');
  return (
    <div class={cn('flex w-full flex-col', local.class)} {...rest}>
      {local.children}
    </div>
  );
}

// --- ChatContainerScrollAnchor ---

export interface ChatContainerScrollAnchorProps extends JSX.HTMLAttributes<HTMLDivElement> {
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
}

function ChatContainerScrollAnchor(props: ChatContainerScrollAnchorProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class');
  return (
    <div
      class={cn('h-px w-full shrink-0 scroll-mt-4', local.class)}
      aria-hidden="true"
      {...rest}
    />
  );
}

/** `ChatContainer` is the exported alias of `ChatContainerRoot`; its props type
 *  is aliased too, so the name a consumer imports always has a matching Props. */
export type ChatContainerProps = ChatContainerRootProps;

export {
  ChatContainerRoot as ChatContainer,
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
};
