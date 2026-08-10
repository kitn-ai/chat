import { type JSX, createContext, useContext, Show, splitProps } from 'solid-js';
import { cn } from '../utils/cn';
import { HoverCardRoot, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';

// --- Context ---

interface SourceContextValue {
  href: string;
  domain: string;
}

const SourceContext = createContext<SourceContextValue>();

function useSourceContext() {
  const ctx = useContext(SourceContext);
  if (!ctx) throw new Error('Source.* must be used inside <Source>');
  return ctx;
}

// --- Source (Root) ---

export interface SourceProps {
  href: string;
  children: JSX.Element;
}

function Source(props: SourceProps) {
  const domain = () => {
    try {
      return new URL(props.href).hostname;
    } catch {
      return props.href.split('/').pop() || props.href;
    }
  };

  return (
    <SourceContext.Provider value={{ get href() { return props.href; }, get domain() { return domain(); } }}>
      <HoverCardRoot openDelay={150}>
        {props.children}
      </HoverCardRoot>
    </SourceContext.Provider>
  );
}

// --- SourceTrigger ---

export interface SourceTriggerProps {
  label?: string | number;
  showFavicon?: boolean;
  class?: string;
}

function SourceTrigger(props: SourceTriggerProps) {
  const ctx = useSourceContext();
  const labelToShow = () => props.label ?? ctx.domain.replace('www.', '');

  return (
    <HoverCardTrigger>
      <a
        href={ctx.href}
        target="_blank"
        rel="noopener noreferrer"
        class={cn(
          'bg-muted text-foreground/80 hover:bg-muted-foreground/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background inline-flex h-5 max-w-32 items-center gap-1 overflow-hidden rounded-full py-0 text-xs no-underline transition-colors duration-150',
          props.showFavicon ? 'pr-2 pl-1' : 'px-2',
          props.class
        )}
      >
        <Show when={props.showFavicon}>
          <img
            src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(ctx.href)}`}
            alt="favicon"
            width={14}
            height={14}
            class="size-3.5 rounded-full"
          />
        </Show>
        <span class="truncate tabular-nums text-center font-normal">{labelToShow()}</span>
      </a>
    </HoverCardTrigger>
  );
}

// --- SourceContent ---

export interface SourceContentProps {
  title: string;
  description: string;
  class?: string;
}

function SourceContent(props: SourceContentProps) {
  const ctx = useSourceContext();
  return (
    <HoverCardContent class={cn('w-80 p-0 shadow-xs', props.class)}>
      <a
        href={ctx.href}
        target="_blank"
        rel="noopener noreferrer"
        class="flex flex-col gap-2 p-3"
      >
        <div class="flex items-center gap-1.5">
          <img
            src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(ctx.href)}`}
            alt="favicon"
            class="size-4 rounded-full"
            width={16}
            height={16}
          />
          <div class="text-primary truncate text-sm">
            {ctx.domain.replace('www.', '')}
          </div>
        </div>
        <div class="line-clamp-2 text-sm font-medium">{props.title}</div>
        <div class="text-muted-foreground line-clamp-2 text-sm">
          {props.description}
        </div>
      </a>
    </HoverCardContent>
  );
}

// --- SourceList (convenience) ---

export interface SourceListProps { children: JSX.Element; class?: string }

function SourceList(props: SourceListProps) {
  return <div class={cn('flex flex-wrap gap-1.5 mt-3', props.class)}>{props.children}</div>;
}

export { Source, SourceTrigger, SourceContent, SourceList };
