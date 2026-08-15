import { type JSX, createContext, useContext, Show, splitProps } from 'solid-js';
import { cn } from '../utils/cn';
import { HoverCardRoot, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';
import { isRenderableLink } from '../primitives/link-preview';

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
  /** The citation's URL. OPTIONAL: every field of a model-produced citation is,
   *  so a source can arrive with a title and no url. In that case the chip
   *  renders as a plain, inert `<a>` with NO `href` attribute — which is valid
   *  HTML and simply not a link — rather than `<a href="">`, which would
   *  navigate to the current page. */
  href?: string;
  children: JSX.Element;
}

function Source(props: SourceProps) {
  const raw = () => props.href ?? '';

  /** The url actually put in `href`.
   *
   *  A citation url is MODEL-SUPPLIED: `wire/formats/openai.ts` (`sourcesOf`)
   *  and `wire/formats/anthropic.ts` (`citations_delta`) both take it as an
   *  arbitrary string. `javascript:`/`data:` in an href is script execution one
   *  click away, and today the only thing stopping it is `target="_blank"` plus
   *  current Chrome behaviour -- an accident of the browser, not a guard. Anyone
   *  dropping `target="_blank"` for styling would silently make it live.
   *
   *  Filtered HERE, at render, rather than in `wire/`, for two reasons.
   *  (1) The wire layer is OPTIONAL: a consumer with their own backend adapter
   *  can set `messages` containing `source` parts directly and never touch
   *  `wire/`, so a wire-side filter would leave that path exploitable while
   *  looking fixed. Every path renders through here.
   *  (2) `parts` should keep reporting what the model actually said, so a
   *  consumer logging or auditing citations is not lied to. The kit refuses to
   *  LINK the url; it does not pretend the url was never there.
   *
   *  `isRenderableLink` (absolute http(s) only) is the right guard rather than
   *  `isSafeUrl` from card-routing: a citation is a reference to a page on the
   *  web, so unlike a markdown body link it has no business being relative. */
  const href = () => (isRenderableLink(raw()) ? raw() : '');

  /** Display only, and deliberately derived from the RAW value: a blocked url
   *  still has to label its chip, and dropping to an empty string here would
   *  render a blank chip instead of showing the reader what arrived. The value
   *  lands in a text node, which Solid escapes. */
  const domain = () => {
    const h = raw();
    if (!h) return '';
    try {
      // `new URL('javascript:x')` parses fine and yields an EMPTY hostname, so
      // a blocked citation would otherwise label an empty chip. Fall back to the
      // raw string: the reader sees what arrived, just not as a link.
      return new URL(h).hostname || h;
    } catch {
      return h.split('/').pop() || h;
    }
  };

  return (
    <SourceContext.Provider value={{ get href() { return href(); }, get domain() { return domain(); } }}>
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
        // `undefined` OMITS the attribute — see SourceProps.href.
        href={ctx.href || undefined}
        target="_blank"
        rel="noopener noreferrer"
        class={cn(
          'bg-muted text-foreground/80 hover:bg-muted-foreground/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background inline-flex h-5 max-w-32 items-center gap-1 overflow-hidden rounded-full py-0 text-xs no-underline transition-colors duration-150',
          props.showFavicon ? 'pr-2 pl-1' : 'px-2',
          props.class
        )}
      >
        {/* No url, no favicon to look up. */}
        <Show when={props.showFavicon && ctx.href}>
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
        // `undefined` OMITS the attribute — see SourceProps.href.
        href={ctx.href || undefined}
        target="_blank"
        rel="noopener noreferrer"
        class="flex flex-col gap-2 p-3"
      >
        {/* The domain header row only means anything when there IS a url. */}
        <Show when={ctx.href}>
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
        </Show>
        <Show when={props.title}>
          <div class="line-clamp-2 text-sm font-medium">{props.title}</div>
        </Show>
        <Show when={props.description}>
          <div class="text-muted-foreground line-clamp-2 text-sm">
            {props.description}
          </div>
        </Show>
      </a>
    </HoverCardContent>
  );
}

// --- SourceList (convenience) ---

export interface SourceListProps {
  children: JSX.Element;
  class?: string;
  /** `::part` name(s) exposed on the row. The message body passes `"citations"`
   *  so consumers can target the citation row from outside the shadow boundary. */
  part?: string;
}

function SourceList(props: SourceListProps) {
  return <div part={props.part} class={cn('flex flex-wrap gap-1.5 mt-3', props.class)}>{props.children}</div>;
}

export { Source, SourceTrigger, SourceContent, SourceList };
