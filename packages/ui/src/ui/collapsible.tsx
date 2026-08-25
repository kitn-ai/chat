import { createContext, useContext, createSignal, createUniqueId, omit, type Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

// Extend SolidJS JSX to allow `bool:inert` (forces setAttribute so jsdom reflects it as an attribute).
declare module 'solid-js' {
  namespace JSX {
    interface ExplicitBoolAttributes {
      inert: boolean;
    }
  }
}

interface CollapsibleCtx {
  open: Accessor<boolean>;
  toggle: () => void;
  contentId: string;
  disabled: Accessor<boolean>;
}

// V2-PORT: v2's useContext THROWS when the resolved value is undefined; a `null`
// default restores the 1.x absent-provider behavior the consumers here handle.
const Ctx = createContext<CollapsibleCtx | null>(null);

const useCollapsible = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('Collapsible parts must be used within <Collapsible>');
  return c;
};

/** Imperative open controller, handed to a parent (e.g. the kai-tool facade)
 *  via `controllerRef` so it can drive/observe open state — mirrors
 *  HoverCardController. Only available when the Collapsible is UNCONTROLLED
 *  (no `open` prop); in controlled mode the parent already owns the state. */
export interface CollapsibleController { open: Accessor<boolean>; setOpen: (v: boolean) => void; }

export interface CollapsibleProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When true, the trigger no longer toggles (programmatic show/hide still work
   *  via the controller; this only gates the user-facing trigger). */
  disabled?: boolean;
  /** Receive the open controller (open accessor + setOpen) once mounted.
   *  Only meaningful in uncontrolled mode (no `open` prop). */
  controllerRef?: (api: CollapsibleController) => void;
  children: JSX.Element;
  class?: string;
}

export function Collapsible(props: CollapsibleProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'open', 'defaultOpen', 'onOpenChange', 'disabled', 'controllerRef', 'children', 'class');
  const [uncontrolled, setUncontrolled] = createSignal(local.defaultOpen ?? false);
  const isControlled = () => local.open !== undefined;
  const open = () => (isControlled() ? !!local.open : uncontrolled());
  const disabled = () => !!local.disabled;
  // setOpen drives the open state and notifies onOpenChange — the single mutate
  // path shared by the trigger and the imperative controller.
  const setOpen = (next: boolean) => {
    if (open() === next) return;
    if (!isControlled()) setUncontrolled(next);
    local.onOpenChange?.(next);
  };
  const toggle = () => {
    if (disabled()) return;
    setOpen(!open());
  };
  // Hand the controller up once. setOpen is NOT gated by disabled — disabled only
  // suppresses the user trigger; programmatic show/hide remain available (the
  // facade's wireDisclosure applies its own disabled-gating on show/toggle).
  local.controllerRef?.({ open, setOpen });
  const contentId = createUniqueId();
  return (
    <Ctx value={{ open, toggle, contentId, disabled }}>
      <div
        class={local.class}
        {...rest}
        data-expanded={open() ? '' : undefined}
        data-closed={open() ? undefined : ''}
        data-state={open() ? 'open' : 'closed'}
      >
        {local.children}
      </div>
    </Ctx>
  );
}

export interface CollapsibleTriggerProps {
  children?: JSX.Element;
  class?: string;
  as?: (props: Record<string, any>) => JSX.Element;
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  /** Remaining attributes are spread onto the rendered trigger. */
  [k: string]: any;
}

export function CollapsibleTrigger(props: CollapsibleTriggerProps) {
  const ctx = useCollapsible();
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'children', 'class', 'as', 'onClick');

  const triggerProps = () => ({
    type: 'button' as const,
    'aria-expanded': ctx.open() ? 'true' as const : 'false' as const,
    'aria-controls': ctx.contentId,
    disabled: ctx.disabled() || undefined,
    'data-expanded': ctx.open() ? '' : undefined,
    'data-closed': ctx.open() ? undefined : '',
    'data-state': ctx.open() ? 'open' : 'closed',
    onClick: (e: MouseEvent) => {
      if (ctx.disabled()) return;
      if (typeof local.onClick === 'function') {
        (local.onClick as (e: MouseEvent) => void)(e);
      }
      ctx.toggle();
    },
    class: local.class,
    ...rest,
  });

  return (
    <>
      {local.as
        ? local.as(triggerProps() as any)
        : (
          <button {...triggerProps()}>
            {local.children}
          </button>
        )}
    </>
  );
}

export interface CollapsibleContentProps {
  children?: JSX.Element;
  class?: string;
  /** Remaining attributes are spread onto the rendered panel. */
  [k: string]: any;
}

export function CollapsibleContent(props: CollapsibleContentProps) {
  const ctx = useCollapsible();
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'children', 'class');
  return (
    <div
      {...rest}
      id={ctx.contentId}
      data-expanded={ctx.open() ? '' : undefined}
      data-closed={ctx.open() ? undefined : ''}
      class={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out',
        ctx.open() ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
      inert={!ctx.open()} // V2-PORT: bool: namespace removed; boolean attr handled natively
    >
      <div class={cn('overflow-hidden', local.class)}>{local.children}</div>
    </div>
  );
}
