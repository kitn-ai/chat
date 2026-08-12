import { type JSX, type Accessor, splitProps, createSignal, createContext, useContext, createEffect, createUniqueId, onCleanup, Show } from 'solid-js';
import { cn } from '../utils/cn';
import { ChevronDown } from 'lucide-solid';
import { Markdown } from './markdown';
import { observeContentHeight } from '../primitives/use-resize-observer';

interface ReasoningContextValue {
  isOpen: () => boolean;
  onOpenChange: (open: boolean) => void;
  disabled: () => boolean;
  /** Id minted on the root and shared by the trigger's `aria-controls` and the
   *  content's `id` — the same wiring `Collapsible` uses, so a screen reader can
   *  name the panel this disclosure toggles. */
  contentId: string;
  /** ReasoningTrigger registers its button here on mount; the content reads it
   *  when a panel holding focus collapses, so focus has somewhere to land. */
  registerTrigger: (el: HTMLElement | undefined) => void;
  /** The registered trigger. Deliberately a plain getter over a mutable
   *  variable, NOT a signal — registration must not re-run the content effect. */
  trigger: () => HTMLElement | undefined;
}

/** Imperative open controller, handed to a parent (the kai-reasoning facade) via
 *  `controllerRef` so it can drive/observe open state — mirrors
 *  CollapsibleController/HoverCardController. */
export interface ReasoningController { open: Accessor<boolean>; setOpen: (v: boolean) => void; }

const ReasoningContext = createContext<ReasoningContextValue>();

function useReasoningContext() {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error('useReasoningContext must be used within a Reasoning provider');
  }
  return context;
}

// --- Reasoning (Root) ---

export interface ReasoningProps {
  children: JSX.Element;
  class?: string;
  open?: boolean;
  /** Initial open state (uncontrolled seed). */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  isStreaming?: boolean;
  /** Gate the trigger — programmatic control via the controller still works. */
  disabled?: boolean;
  /** Receive the open controller (open accessor + setOpen) once mounted. */
  controllerRef?: (api: ReasoningController) => void;
}

function Reasoning(props: ReasoningProps) {
  const [local] = splitProps(props, ['children', 'class', 'open', 'defaultOpen', 'onOpenChange', 'isStreaming', 'disabled', 'controllerRef']);
  const [internalOpen, setInternalOpen] = createSignal(local.defaultOpen ?? false);
  const [wasAutoOpened, setWasAutoOpened] = createSignal(false);

  const isControlled = () => local.open !== undefined;
  const isOpen = () => (isControlled() ? local.open! : internalOpen());
  const disabled = () => !!local.disabled;

  // The single open-mutate path, shared by the trigger and the imperative
  // controller. In controlled mode we don't touch internal state; the consumer
  // reflects via the `open` prop and observes via onOpenChange.
  const handleOpenChange = (newOpen: boolean) => {
    if (isOpen() === newOpen) return;
    if (!isControlled()) {
      setInternalOpen(newOpen);
    }
    local.onOpenChange?.(newOpen);
  };

  createEffect(() => {
    const streaming = local.isStreaming;
    if (streaming && !wasAutoOpened()) {
      if (!isControlled()) setInternalOpen(true);
      setWasAutoOpened(true);
    }
    if (!streaming && wasAutoOpened()) {
      if (!isControlled()) setInternalOpen(false);
      setWasAutoOpened(false);
    }
  });

  // Hand the controller up once. setOpen routes through handleOpenChange so it
  // notifies onOpenChange and respects controlled/uncontrolled mode. Not gated
  // by disabled — the facade's wireDisclosure applies disabled-gating itself.
  local.controllerRef?.({ open: isOpen, setOpen: handleOpenChange });

  const contentId = createUniqueId();

  // The trigger element, for the focus hand-off in ReasoningContent. Read once,
  // at the moment a panel collapses — a signal would only add a spurious
  // dependency to the content effect when the trigger mounts.
  let triggerEl: HTMLElement | undefined;

  return (
    <ReasoningContext.Provider
      value={{
        isOpen,
        onOpenChange: handleOpenChange,
        disabled,
        contentId,
        registerTrigger: (el) => { triggerEl = el; },
        trigger: () => triggerEl,
      }}
    >
      <div class={local.class}>{local.children}</div>
    </ReasoningContext.Provider>
  );
}

// --- ReasoningTrigger ---

export interface ReasoningTriggerProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  children: JSX.Element;
}

function ReasoningTrigger(props: ReasoningTriggerProps) {
  // `ref` is split out rather than left in `rest`: the trigger takes its own ref
  // to register as the panel's focus-return target, and a spread `ref` would
  // silently replace it. The consumer's ref is forwarded below instead.
  const [local, rest] = splitProps(props, ['children', 'class', 'ref']);
  const { isOpen, onOpenChange, disabled, contentId, registerTrigger } = useReasoningContext();

  return (
    // The same disclosure contract as CollapsibleTrigger: an explicit
    // `type="button"` (so a trigger inside a form never submits it),
    // `aria-expanded` + `aria-controls` so assistive tech can read the state and
    // find the panel, and the `data-state` / `data-expanded` / `data-closed`
    // handles styling and tests hang off. `{...rest}` stays LAST so a consumer
    // can still override any of them.
    <button
      ref={(el) => {
        registerTrigger(el);
        // Solid hands a component's `ref` down as a callback; tolerate a raw
        // element for the hand-written case.
        if (typeof local.ref === 'function') (local.ref as (el: HTMLButtonElement) => void)(el);
      }}
      type="button"
      class={cn('flex cursor-pointer items-center gap-2 text-meta', local.class)}
      disabled={disabled() || undefined}
      aria-expanded={isOpen()}
      aria-controls={contentId}
      data-expanded={isOpen() ? '' : undefined}
      data-closed={isOpen() ? undefined : ''}
      data-state={isOpen() ? 'open' : 'closed'}
      onClick={() => { if (!disabled()) onOpenChange(!isOpen()); }}
      {...rest}
    >
      <span class="text-primary">{local.children}</span>
      <div
        class={cn(
          'transform transition-transform',
          isOpen() ? 'rotate-180' : ''
        )}
      >
        <ChevronDown class="size-4" />
      </div>
    </button>
  );
}

// --- ReasoningContent ---

export interface ReasoningContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
  markdown?: boolean;
  contentClass?: string;
}

function ReasoningContent(props: ReasoningContentProps) {
  const [local, rest] = splitProps(props, ['children', 'class', 'contentClass', 'markdown']);
  const { isOpen, contentId, trigger } = useReasoningContext();

  let contentRef: HTMLDivElement | undefined;
  let innerRef: HTMLDivElement | undefined;

  /** Hand focus back to the trigger when the panel about to go inert is holding
   *  it. Chromium keeps `activeElement` on the now-inert node for the rest of
   *  the task and then resets the document's focus to `<body>` — so without this
   *  a user who was inside the panel loses the focus ring entirely and their
   *  next Tab restarts from the top. `Collapsible` has exactly this gap: it sets
   *  `bool:inert` and never looks at where focus was. Runs BEFORE the attribute
   *  lands, so the move is ours rather than the browser's fallback. */
  const releaseFocus = () => {
    if (!contentRef) return;
    // getRootNode(), not `document`: inside the <kai-reasoning> shadow root
    // document.activeElement only ever resolves to the HOST element.
    const root = contentRef.getRootNode() as Document | ShadowRoot;
    const active = root.activeElement;
    // A disabled trigger cannot take focus; the browser then falls back to
    // <body>, which is no worse than not trying.
    if (active && contentRef.contains(active)) trigger()?.focus();
  };

  createEffect(() => {
    if (!contentRef || !innerRef) return;

    const dispose = observeContentHeight(innerRef, () => {
      if (contentRef && innerRef && isOpen()) {
        contentRef.style.maxHeight = `${innerRef.scrollHeight}px`;
      }
    });

    if (isOpen()) {
      contentRef.style.maxHeight = `${innerRef.scrollHeight}px`;
      // Dropped in the same tick as the open, NOT on transitionend: the panel is
      // interactive from the first frame, so an inert outliving the animation can
      // never swallow the first click or Tab into it.
      contentRef.removeAttribute('inert');
    } else {
      contentRef.style.maxHeight = '0px';
      releaseFocus();
      // Applied in the same tick as the collapse, again NOT on transitionend:
      // `inert` has no visual effect of its own, so the 150ms max-height
      // transition still runs to completion underneath it (verified in Chromium:
      // transitionend fires and the final computed max-height is reached), while
      // the a11y tree matches the collapsed intent immediately instead of 150ms
      // late. setAttribute rather than the `inert` IDL property because Solid
      // routes `inert` through Properties (el.inert = …), which jsdom does not
      // reflect back to an attribute — the same reason Collapsible uses `bool:`.
      contentRef.setAttribute('inert', '');
    }

    onCleanup(dispose);
  });

  return (
    // `id` matches the trigger's `aria-controls`; `data-state` gives styling and
    // tests an attribute handle on the panel instead of forcing them to read the
    // animated `max-height`. `inert` while collapsed (as CollapsibleContent does)
    // is owned by the effect above, not bound here — it has to be sequenced
    // against the focus hand-off, and a second reactive owner would race it.
    // `{...rest}` stays LAST so a consumer can still override.
    <div
      ref={contentRef}
      id={contentId}
      class={cn(
        'overflow-hidden transition-[max-height] duration-150 ease-out',
        local.class
      )}
      style={{ 'max-height': '0px' }}
      data-state={isOpen() ? 'open' : 'closed'}
      {...rest}
    >
      <div
        ref={innerRef}
        class={cn(
          // Markdown content is styled by the token-based `.chat-markdown` (see
          // Markdown component), which themes via design tokens — so no Tailwind
          // `prose`/`dark:prose-invert` is needed (those wouldn't follow a scoped theme).
          'text-muted-foreground text-body',
          local.contentClass
        )}
      >
        <Show when={local.markdown} fallback={local.children}>
          <Markdown content={local.children as string} />
        </Show>
      </div>
    </div>
  );
}

export { Reasoning, ReasoningTrigger, ReasoningContent };
