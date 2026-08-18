import { type JSX, createContext, useContext, splitProps, Show } from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { HoverCardRoot, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';
import {
  FileCode,
  FileText,
  FileX,
  Globe,
  Image as ImageIcon,
  Paperclip,
  X,
} from 'lucide-solid';
import { DEFAULT_MEDIA_POLICY } from '../wire/media-types';
import type { AttachmentData, AttachmentMediaCategory, AttachmentVariant } from './attachment-types';
export type { AttachmentData, AttachmentMediaCategory, AttachmentVariant } from './attachment-types';

// ============================================================================
// Types
// ============================================================================

/** One icon per category, and the categories are the wire's own kinds — so the
 *  set is exhaustive by construction and a kind added to `EncodableKind` is a
 *  compile error HERE rather than an `undefined` icon at runtime.
 *
 *  PDF and text get different glyphs deliberately. They are the two formats the
 *  wire handles best and they used to share the anonymous fallback icon with a
 *  `.zip`, which is the inversion this whole change is about. */
const mediaCategoryIcons: Record<AttachmentMediaCategory, typeof ImageIcon> = {
  document: FileText,
  image: ImageIcon,
  source: Globe,
  text: FileCode,
  unknown: Paperclip,
  unsendable: FileX,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * What to DRAW for this attachment, asked of the one module that knows.
 *
 * ★ NO MEDIA TYPES APPEAR BELOW, and that is the fix. This function used to be
 * a prefix switch — `image/` → image, `video/` → video, `application/` or
 * `text/` → document — a second list of media types in a repo whose media-type
 * declaration says, at its own definition, "if you find yourself writing a
 * second list of media types anywhere in this repo, delete it and read this".
 * It had drifted in both directions: `image/svg+xml` came back `image` and drew
 * a real thumbnail for a format the encoder refuses outright, while
 * `application/json` came back `document` when the wire carries it as text.
 *
 * `DEFAULT_MEDIA_POLICY` and not a narrowed one, on purpose. A developer's
 * `accept` filter says what a user may STAGE; it says nothing about what an
 * already-staged attachment IS, and narrowing here would redraw a message
 * retroactively when a host changed a prop. The default policy is the kit's
 * full capability set, so `unsupported` against it means exactly "no wire
 * format this kit ships can carry this" — which is the only claim about
 * sendability the renderer can honestly make without knowing the provider.
 */
export const getMediaCategory = (data: AttachmentData): AttachmentMediaCategory => {
  // A citation chip is not an upload and never reaches an encoder — see the
  // `kit-side` classification in `wire/files.ts`. Asking the policy about it
  // would be asking the wrong question.
  if (data.type === 'source-document') {
    return 'source';
  }

  const decision = DEFAULT_MEDIA_POLICY.decide(data.mediaType);
  switch (decision.status) {
    // The wire's kind IS the rendering category. Not mapped, not translated.
    case 'allowed':
      return decision.kind;
    case 'unsupported':
      return 'unsendable';
    // Nobody named the file, so its bytes decide it and they have not been read
    // here. `filtered` cannot occur against the unnarrowed default policy, but
    // it means "the kit could have sent this" — also not unsendable. Both are
    // honestly `unknown`, and no `default:` branch exists so a new
    // `MediaDecision` variant is a compile error rather than a silent guess.
    case 'undetermined':
    case 'filtered':
      return 'unknown';
  }
};

/**
 * The fact, written out, for the one category where the kit knows something the
 * user needs to know.
 *
 * A FACT ABOUT THE FORMATS, NOT A PREDICTION ABOUT THIS REQUEST. At render time
 * the kit does not know which provider the thread is bound for, so "this will
 * fail" is not its to say. What it does know is that no wire format it ships
 * has any representation for the type at all, which is true of every provider
 * and is what this sentence claims.
 */
export const getUnsendableNote = (data: AttachmentData): string | undefined => {
  if (getMediaCategory(data) !== 'unsendable') return undefined;
  const type = data.mediaType?.trim() || 'This file type';
  return `${type} is not one of the attachment formats a model request can carry.`;
};

export const getAttachmentLabel = (data: AttachmentData): string => {
  if (data.type === 'source-document') {
    return data.title || data.filename || 'Source';
  }

  const category = getMediaCategory(data);
  return data.filename || (category === 'image' ? 'Image' : 'Attachment');
};

// ============================================================================
// Contexts
// ============================================================================

interface AttachmentsContextValue {
  variant: AttachmentVariant;
}

const AttachmentsContext = createContext<AttachmentsContextValue>();

interface AttachmentContextValue {
  data: AttachmentData;
  mediaCategory: AttachmentMediaCategory;
  onRemove?: () => void;
  variant: AttachmentVariant;
}

const AttachmentContext = createContext<AttachmentContextValue>();

// ============================================================================
// Hooks
// ============================================================================

export const useAttachmentsContext = () =>
  useContext(AttachmentsContext) ?? { variant: 'grid' as const };

export const useAttachmentContext = () => {
  const ctx = useContext(AttachmentContext);
  if (!ctx) {
    throw new Error('Attachment components must be used within <Attachment>');
  }
  return ctx;
};

// ============================================================================
// Attachments - Container
// ============================================================================

export interface AttachmentsProps extends JSX.HTMLAttributes<HTMLDivElement> {
  variant?: AttachmentVariant;
}

function Attachments(props: AttachmentsProps) {
  const [local, rest] = splitProps(props, ['variant', 'class', 'children']);
  const variant = () => local.variant ?? 'grid';

  return (
    <AttachmentsContext.Provider value={{ get variant() { return variant(); } }}>
      <div
        class={cn(
          'flex items-start',
          variant() === 'list' ? 'flex-col gap-2' : 'flex-wrap gap-2',
          variant() === 'grid' && 'w-fit',
          local.class,
        )}
        {...rest}
      >
        {local.children}
      </div>
    </AttachmentsContext.Provider>
  );
}

// ============================================================================
// Attachment - Item
// ============================================================================

export interface AttachmentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  data: AttachmentData;
  onRemove?: () => void;
}

function Attachment(props: AttachmentProps) {
  const [local, rest] = splitProps(props, ['data', 'onRemove', 'class', 'children']);
  // Read the getter reactively — DON'T destructure, or the variant is captured
  // once and the item never re-lays-out when the container variant changes.
  const ctx = useAttachmentsContext();
  const mediaCategory = () => getMediaCategory(local.data);
  const unsendable = () => getUnsendableNote(local.data);

  return (
    <AttachmentContext.Provider
      value={{
        get data() { return local.data; },
        get mediaCategory() { return mediaCategory(); },
        get onRemove() { return local.onRemove; },
        get variant() { return ctx.variant; },
      }}
    >
      <div
        class={cn(
          'group relative',
          ctx.variant === 'grid' && 'size-24 overflow-hidden rounded-lg',
          ctx.variant === 'inline' && [
            'flex h-8 cursor-pointer select-none items-center gap-1.5',
            'rounded-md bg-surface-strong px-1.5 text-foreground',
            'font-medium text-sm transition-all',
            'hover:bg-muted',
          ],
          ctx.variant === 'list' && [
            'flex w-full items-center gap-3 rounded-lg bg-surface p-3 text-foreground',
            'hover:bg-muted/50',
          ],
          local.class,
        )}
        // ★ A STABLE HANDLE ON "THIS IS AN ATTACHMENT", published the way this
        // kit publishes them (`part="row"`, `part="bubble content"`,
        // `part="citations"`). Consumers get a `::part(attachment)` styling seam
        // — and, just as importantly, anything asserting on the rendering gets
        // something to key on that is not a class name or a position.
        //
        // That is not a hypothetical convenience. The conformance harness pinned
        // this component by `span.truncate` and broke the day the thread moved
        // from the inline chip to the grid tile; the obvious repair — "the
        // innermost div holding both the media icon and the filename" — was
        // measured to be WORSE, because when the filename is missing `.last()`
        // slides silently up to the assistant's message row, which contains the
        // tool panel echoing the same filename in its JSON. The assertion then
        // passes while the user sees an anonymous grey box. A position that
        // still resolves, to the wrong node, is the failure that stays green.
        part="attachment"
        // The mark lives on the ITEM rather than on `<AttachmentPreview>`,
        // because the sub-parts are optional in composition — a consumer who
        // renders only an `<AttachmentInfo>` still has to be told. `title` is
        // the mouse affordance; the `sr-only` line inside is what actually
        // carries the fact to assistive tech and to a test. `rest` is spread
        // after both, so a consumer's own `title` still wins.
        data-unsendable={unsendable() === undefined ? undefined : ''}
        title={unsendable()}
        {...rest}
      >
        <Show when={unsendable()}>
          {(note) => <span class="sr-only">{note()}</span>}
        </Show>
        {local.children}
      </div>
    </AttachmentContext.Provider>
  );
}

// ============================================================================
// AttachmentPreview - Media preview
// ============================================================================

export interface AttachmentPreviewProps extends JSX.HTMLAttributes<HTMLDivElement> {
  fallbackIcon?: JSX.Element;
}

function AttachmentPreview(props: AttachmentPreviewProps) {
  const [local, rest] = splitProps(props, ['fallbackIcon', 'class']);
  const ctx = useAttachmentContext();

  const iconSize = () => ctx.variant === 'inline' ? 'size-3' : 'size-4';

  const renderIcon = (Icon: typeof ImageIcon) => (
    <Icon
      class={cn(
        iconSize(),
        // The one visible half of the mark. `warning` is an existing theme
        // token, not a new colour for this state.
        ctx.mediaCategory === 'unsendable' ? 'text-warning' : 'text-muted-foreground',
      )}
    />
  );

  const renderContent = () => {
    // ★ ONLY `image` GETS A REAL PREVIEW, and `image` now means "a raster format
    // some wire can actually carry" because the category comes from the media
    // policy. There used to be a `video` branch here that mounted a real
    // <video> for a file no encoder in this kit can represent: a preview that
    // looks like it worked, in front of a send that throws. An SVG reached the
    // <img> branch for the same reason. Both are `unsendable` now and fall
    // through to the marked icon below.
    if (ctx.mediaCategory === 'image' && ctx.data.type === 'file' && ctx.data.url) {
      return ctx.variant === 'grid' ? (
        <img
          alt={ctx.data.filename || 'Image'}
          class="size-full object-cover"
          height={96}
          src={ctx.data.url}
          width={96}
        />
      ) : (
        <img
          alt={ctx.data.filename || 'Image'}
          class="size-full rounded object-cover"
          height={20}
          src={ctx.data.url}
          width={20}
        />
      );
    }

    const Icon = mediaCategoryIcons[ctx.mediaCategory];
    return local.fallbackIcon ?? renderIcon(Icon);
  };

  return (
    <div
      class={cn(
        'flex shrink-0 items-center justify-center overflow-hidden',
        ctx.variant === 'grid' && 'size-full bg-muted',
        ctx.variant === 'inline' && 'size-5 rounded bg-background',
        ctx.variant === 'list' && 'size-12 rounded bg-muted',
        local.class,
      )}
      {...rest}
    >
      {renderContent()}
    </div>
  );
}

// ============================================================================
// AttachmentInfo - Name and type display
// ============================================================================

export interface AttachmentInfoProps extends JSX.HTMLAttributes<HTMLDivElement> {
  showMediaType?: boolean;
}

function AttachmentInfo(props: AttachmentInfoProps) {
  const [local, rest] = splitProps(props, ['showMediaType', 'class']);
  const ctx = useAttachmentContext();
  const label = () => getAttachmentLabel(ctx.data);

  return (
    <Show
      when={ctx.variant !== 'grid'}
      fallback={
        /*
         * ★ A GRID TILE IS SELF-DESCRIBING ONLY WHEN IT IS AN IMAGE.
         *
         * A tile used to render no label at all, on the theory that it is "a
         * self-contained visual". True of a photo; false of a PDF, a zip or a
         * text file, which draw a 16px glyph on a grey square and are otherwise
         * anonymous. The name was reachable by hover (pointer only) and by an
         * `sr-only` line (assistive tech only), which between them serve
         * everyone EXCEPT a sighted keyboard user and a sighted touch user —
         * measured in a real browser as `visibleText: ""` on every non-image
         * tile, with no focusable element inside any of them.
         *
         * So a non-image tile carries a visible, truncated caption and needs no
         * interaction of any kind. An image tile still carries none: the image
         * is the content, and stamping a filename over it is noise. That is
         * also why the `sr-only` label was REMOVED from `<AttachmentPreview>`
         * rather than kept alongside this — an image has `alt`, everything else
         * now has this, and keeping both would announce the name twice.
         */
        <Show when={ctx.mediaCategory !== 'image'}>
          {/* A `div`, not a `span` — `AttachmentInfoProps` extends
              `JSX.HTMLAttributes<HTMLDivElement>`, so `rest` carries a
              div-typed `ref` and the other branch below is a div too. */}
          <div
            class={cn(
              'absolute inset-x-0 bottom-0 truncate px-1.5 py-1 text-caption',
              'bg-background/85 backdrop-blur-sm',
              ctx.mediaCategory === 'unsendable' ? 'text-warning' : 'text-foreground',
              local.class,
            )}
            part="attachment-name"
            {...rest}
          >
            {label()}
          </div>
        </Show>
      }
    >
      {/* Same `part` in both branches: an assertion (or a consumer's CSS) that
          asks for the attachment's name must not have to know which variant is
          rendering. That is the whole point of publishing it. */}
      <div class={cn('min-w-0 flex-1', local.class)} part="attachment-name" {...rest}>
        <span class="block truncate">{label()}</span>
        {/* The media-type subtitle is a two-line affordance — only the `list`
            variant has room for it; `inline` chips are a fixed single-line height.
            The unsendable line rides in the same slot and WINS it, because "no
            wire can carry this" is the more useful half of the same sentence. */}
        <Show
          when={ctx.mediaCategory === 'unsendable' && ctx.variant === 'list'}
          fallback={
            <Show when={local.showMediaType && ctx.variant === 'list' && ctx.data.mediaType}>
              <span class="text-muted-foreground text-caption block truncate">
                {ctx.data.mediaType}
              </span>
            </Show>
          }
        >
          <span class="text-warning text-caption block truncate">
            {ctx.data.mediaType ? `${ctx.data.mediaType} · ` : ''}unsupported attachment format
          </span>
        </Show>
      </div>
    </Show>
  );
}

// ============================================================================
// AttachmentRemove - Remove button
// ============================================================================

export interface AttachmentRemoveProps {
  label?: string;
  class?: string;
  children?: JSX.Element;
}

function AttachmentRemove(props: AttachmentRemoveProps) {
  const ctx = useAttachmentContext();

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    ctx.onRemove?.();
  };

  return (
    <Show when={ctx.onRemove}>
      <Button
        aria-label={props.label ?? 'Remove'}
        class={cn(
          ctx.variant === 'grid' && [
            'absolute top-2 right-2 size-6 rounded-full p-0',
            'bg-background/80 backdrop-blur-sm',
            'opacity-0 transition-opacity group-hover:opacity-100',
            'hover:bg-background',
            '[&>svg]:size-3',
          ],
          ctx.variant === 'inline' && [
            'size-5 rounded p-0',
            'opacity-0 transition-opacity group-hover:opacity-100',
            '[&>svg]:size-2.5',
          ],
          ctx.variant === 'list' && ['size-8 shrink-0 rounded p-0', '[&>svg]:size-4'],
          props.class,
        )}
        onClick={handleClick}
        type="button"
        variant="ghost"
      >
        {props.children ?? <X />}
        <span class="sr-only">{props.label ?? 'Remove'}</span>
      </Button>
    </Show>
  );
}

// ============================================================================
// AttachmentHoverCard - Hover preview
// ============================================================================

export interface AttachmentHoverCardProps {
  children: JSX.Element;
  openDelay?: number;
  closeDelay?: number;
}

function AttachmentHoverCard(props: AttachmentHoverCardProps) {
  return (
    <HoverCardRoot
      openDelay={props.openDelay ?? 0}
      closeDelay={props.closeDelay ?? 0}
    >
      {props.children}
    </HoverCardRoot>
  );
}

export interface AttachmentHoverCardTriggerProps {
  children: JSX.Element;
  class?: string;
}

function AttachmentHoverCardTrigger(props: AttachmentHoverCardTriggerProps) {
  return <HoverCardTrigger class={props.class}>{props.children}</HoverCardTrigger>;
}

export interface AttachmentHoverCardContentProps {
  children: JSX.Element;
  class?: string;
}

function AttachmentHoverCardContent(props: AttachmentHoverCardContentProps) {
  return (
    <HoverCardContent class={cn('w-auto p-2', props.class)}>
      {props.children}
    </HoverCardContent>
  );
}

// ============================================================================
// AttachmentEmpty - Empty state
// ============================================================================

export interface AttachmentEmptyProps extends JSX.HTMLAttributes<HTMLDivElement> {}

function AttachmentEmpty(props: AttachmentEmptyProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div
      class={cn(
        'flex items-center justify-center p-4 text-muted-foreground text-sm',
        local.class,
      )}
      {...rest}
    >
      {local.children ?? 'No attachments'}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
  AttachmentHoverCard,
  AttachmentHoverCardTrigger,
  AttachmentHoverCardContent,
  AttachmentEmpty,
};
