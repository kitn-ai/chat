import {
  type JSX,
  For,
  Show,
  splitProps,
  mergeProps,
  createMemo,
  createEffect,
  on,
  onMount,
  ErrorBoundary,
} from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Card } from './card';
import { DismissedStub } from './dismissed-stub';
import type { CardEnvelope, CardEvent, CardHost, CardResolution } from '../primitives/card-contract';
import { useCardResolution } from './use-card-resolution';
import { emitCardEvent } from '../primitives/card-routing';
import { useCardHost } from '../primitives/card-host';
import { AlertTriangle, Check, X } from 'lucide-solid';

// ─────────────────────────────────────────────────────────────────────────────
// Types (confirm.schema.json) — AUTHORED IN ../primitives/card-data-types.ts.
//
// They used to be declared here, and moving them is the fourth instance of the
// split card-tags.ts and card-component-types.ts already made twice: a type
// import still has to RESOLVE, so while these lived in a `.tsx` no Node/no-DOM
// project could name them (TS6142), which meant `@kitn.ai/ui/schemas` could not
// re-export them and a TypeScript backend building a card envelope got
// `data: unknown` while Python and Go read the full shape out of the published
// JSON Schemas. They are also `type` aliases rather than `interface`s now, which
// is what makes `el.data = myConfirmCardData` compile — see that file's header
// for both measurements. Re-exported here, so this module's surface is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ConfirmAction,
  ConfirmActionStyle,
  ConfirmCardData,
  ConfirmTone,
} from '../primitives/card-data-types';

export type {
  ConfirmAction,
  ConfirmActionStyle,
  ConfirmCardData,
  ConfirmCardEnvelope,
  ConfirmTone,
} from '../primitives/card-data-types';

export const CONFIRM_CARD_TYPE = 'confirm' as const;

const VALID_STYLES = new Set<ConfirmActionStyle>(['primary', 'default', 'destructive']);

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested in isolation).
// ─────────────────────────────────────────────────────────────────────────────

/** Map an action's `style` to a Button variant (falls back + warns on unknown). */
export function buttonVariantForStyle(
  style: ConfirmActionStyle | undefined,
): 'default' | 'outline' | 'destructive' {
  switch (style) {
    case 'primary':
      return 'default';
    case 'destructive':
      return 'destructive';
    case 'default':
    case undefined:
      return 'outline';
    default:
      // eslint-disable-next-line no-console
      console.warn(`[kai-confirm] unknown action style "${style as string}"; using default`);
      return 'outline';
  }
}

/** De-dupe actions by id (first wins) and validate their shape. Returns the usable
 *  list + an optional error message when there's nothing renderable. */
export function normalizeActions(actions: unknown): {
  actions: ConfirmAction[];
  error?: string;
} {
  if (!Array.isArray(actions) || actions.length === 0) {
    return { actions: [], error: "This card couldn't be displayed." };
  }
  const seen = new Set<string>();
  const out: ConfirmAction[] = [];
  for (const a of actions) {
    if (!a || typeof a !== 'object') continue;
    const action = a as Partial<ConfirmAction>;
    if (typeof action.id !== 'string' || action.id.length === 0) continue;
    if (typeof action.label !== 'string' || action.label.length === 0) continue;
    if (seen.has(action.id)) {
      // eslint-disable-next-line no-console
      console.warn(`[kai-confirm] duplicate action id "${action.id}" ignored`);
      continue;
    }
    seen.add(action.id);
    const style = VALID_STYLES.has(action.style as ConfirmActionStyle)
      ? (action.style as ConfirmActionStyle)
      : undefined;
    if (action.style !== undefined && style === undefined) {
      // eslint-disable-next-line no-console
      console.warn(`[kai-confirm] unknown action style "${String(action.style)}"; using default`);
    }
    out.push({
      id: action.id,
      label: action.label,
      style,
      payload: action.payload,
      default: action.default === true,
    });
  }
  if (out.length === 0) return { actions: [], error: "This card couldn't be displayed." };
  return { actions: out };
}

/** The id of the default action (first with `default:true`), if any. */
export function defaultActionId(actions: ConfirmAction[]): string | undefined {
  return actions.find((a) => a.default)?.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// The <ConfirmCard> component.
// ─────────────────────────────────────────────────────────────────────────────

/** Imperative handle exposed via `controllerRef` — surfaces the confirm card's
 *  latent action/dismiss capabilities so the `<kai-confirm>` facade can forward
 *  them as instance methods (focus/confirm/dismiss/reopen). */
export interface ConfirmController {
  /** Focus the default action button (or the first action if none default). */
  focus(options?: FocusOptions): void;
  /** Activate an action by id (or the default action when omitted) — emits the
   *  `action` verb + resolves single-shot. */
  confirm(actionId?: string): void;
  /** Dismiss the card — emits `dismiss` + optimistically collapses to the stub. */
  dismiss(): void;
  /** Re-open a dismissed card from its stub — emits `reopen`. */
  reopen(): void;
}

export interface ConfirmCardProps {
  /** The confirm definition (CardEnvelope.data). */
  data?: ConfirmCardData;
  /** The card id used to correlate every emitted CardEvent. */
  cardId?: string;
  /** The envelope title rendered in the card chrome. */
  heading?: string;
  /** Optional explicit CardHost (otherwise read from a CardProvider, otherwise the
   *  bubbling `kai-card` CustomEvent off `hostElement`). */
  host?: CardHost;
  /** The custom-element host node, for the bubbling `kai-card` fallback emit. */
  hostElement?: HTMLElement;
  /** Focus the default action on mount. Default OFF (no focus-stealing mid-stream). */
  autofocus?: boolean;
  class?: string;
  /** When set, render the chromed read-only view instead of the buttons. */
  resolution?: CardResolution;
  /** Receive the imperative controller once mounted. The `<kai-confirm>` facade
   *  forwards these as element methods (focus/confirm/dismiss/reopen). */
  controllerRef?: (controller: ConfirmController) => void;
}

/**
 * `ConfirmCard` — a named-intent approval card. Renders a title + body + a small
 * set of action buttons inside `Card` chrome. Activating an action emits the Card
 * contract's `action` verb (`{ kind:'action', cardId, action, payload }`) and
 * resolves the card (other actions disabled, the chosen one marked) so the same
 * approval can't double-fire. Emits `ready` on mount, `dismiss` for the optional
 * close affordance, and `error` for an unusable definition (inline error state).
 */
export function ConfirmCard(props: ConfirmCardProps): JSX.Element {
  const merged = mergeProps({ cardId: 'kai-confirm', autofocus: false }, props);
  const [local] = splitProps(merged, [
    'data',
    'cardId',
    'heading',
    'host',
    'hostElement',
    'autofocus',
    'class',
    'resolution',
    'controllerRef',
  ]);

  const ctxHost = useCardHost();

  const emit = (event: CardEvent): void => {
    const h = local.host ?? ctxHost;
    if (h) h.emit(event);
    else if (local.hostElement) emitCardEvent(local.hostElement, event);
  };

  const normalized = createMemo(() => normalizeActions(local.data?.actions));
  const valid = createMemo(() => normalized().error === undefined);
  const errorMessage = createMemo(() => normalized().error ?? '');
  const actions = createMemo(() => normalized().actions);
  const tone = (): ConfirmTone => local.data?.tone ?? 'default';
  const isDanger = () => tone() === 'danger';
  const defaultId = createMemo(() => defaultActionId(actions()));

  const res = useCardResolution({ prop: () => local.resolution, data: () => local.data });

  const resolvedAction = createMemo(() => {
    const r = res.resolution();
    if (!r || r.kind !== 'action') return undefined;
    const found = actions().find((a) => a.id === r.action);
    return { label: found?.label ?? r.action };
  });

  // ready / error lifecycle emits.
  createEffect(
    on(valid, (ok) => {
      if (ok) emit({ kind: 'ready', cardId: local.cardId });
      else emit({ kind: 'error', cardId: local.cardId, message: errorMessage() });
    }),
  );

  const onAction = (action: ConfirmAction): void => {
    if (res.isResolved()) return; // single-shot
    emit({
      kind: 'action',
      cardId: local.cardId,
      action: action.id,
      ...(action.payload !== undefined ? { payload: action.payload } : {}),
    });
    res.setLocal({
      kind: 'action',
      action: action.id,
      ...(action.payload !== undefined ? { payload: action.payload } : {}),
    });
  };

  // Dismiss: emit the contract `dismiss` AND optimistically flip to a `dismissed`
  // resolution so the card collapses to its re-openable stub immediately (the host
  // confirms/overrides via the resolution prop on the next render).
  const onDismiss = (): void => {
    if (res.isResolved()) return;
    emit({ kind: 'dismiss', cardId: local.cardId });
    res.setLocal({ kind: 'dismissed' });
  };
  const onReopen = (): void => emit({ kind: 'reopen', cardId: local.cardId });

  let bodyRef: HTMLDivElement | undefined;
  let actionsRef: HTMLDivElement | undefined;

  // The default action button (or the first action button if none is marked
  // default) — the same target the `autofocus` prop focuses on mount.
  const focusTarget = (): HTMLButtonElement | null => {
    if (!actionsRef) return null;
    return (
      actionsRef.querySelector<HTMLButtonElement>('button[data-kai-default="true"]') ??
      actionsRef.querySelector<HTMLButtonElement>('button[data-action-id]')
    );
  };

  // ── Imperative controller (Pattern C): hand the facade a handle over the
  //    card's latent action/dismiss capabilities. Every method drives the SAME
  //    internal path the buttons drive, so the same kai-card events fire. ──────────
  onMount(() => {
    local.controllerRef?.({
      // Focus the default (or first) action button on demand.
      focus: (options) => focusTarget()?.focus(options),
      // Activate an action by id (or the default action with no id) — the button path.
      confirm: (actionId) => {
        const list = actions();
        const id = actionId ?? defaultId();
        if (id === undefined) return;
        const action = list.find((a) => a.id === id);
        if (action) onAction(action);
      },
      // Trigger the dismiss path (the X-button path).
      dismiss: () => onDismiss(),
      // Re-open a dismissed card (the stub's affordance path).
      reopen: () => onReopen(),
    });
  });

  // Surface the resolved action id for host styling.
  createEffect(() => {
    const el = local.hostElement;
    if (!el) return;
    const r = res.resolution();
    if (r && r.kind === 'action') el.setAttribute('data-kai-resolved', r.action);
    else el.removeAttribute('data-kai-resolved');
  });

  return (
    <Show when={valid()} fallback={<Card heading={local.heading} errorMessage={errorMessage()} />}>
      <ErrorBoundary
        fallback={() => {
          emit({ kind: 'error', cardId: local.cardId, message: 'The card failed to render.' });
          return <Card heading={local.heading} errorMessage="The card failed to render." />;
        }}
      >
        <Show
          when={!res.isDeferred()}
          fallback={<DismissedStub type={CONFIRM_CARD_TYPE} title={local.heading} onReopen={onReopen} />}
        >
        <Card
          heading={local.heading}
          actions={
            <Show
              when={!res.isResolved()}
              fallback={
                <div
                  class="ml-auto flex items-center gap-2 text-sm font-medium text-foreground"
                  role={res.isOptimistic() ? 'status' : undefined}
                >
                  <Check size={16} aria-hidden="true" />
                  <span>{resolvedAction()?.label}</span>
                </div>
              }
            >
              <div class="flex w-full flex-wrap items-center justify-between gap-2">
                <Show when={local.data?.dismissible === true}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Dismiss"
                    onClick={onDismiss}
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                </Show>
                <div ref={actionsRef} class="ml-auto flex flex-wrap items-center gap-2">
                  <For each={actions()}>
                    {(action) => (
                      <Button
                        type="button"
                        variant={buttonVariantForStyle(action.style)}
                        data-action-id={action.id}
                        data-kai-default={action.default ? 'true' : undefined}
                        ref={(el) => {
                          if (local.autofocus && action.id === defaultId()) {
                            queueMicrotask(() => el.focus());
                          }
                        }}
                        onClick={() => onAction(action)}
                      >
                        {action.label}
                      </Button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          }
        >
          <div
            ref={bodyRef}
            class={cn('flex flex-col gap-2', local.class)}
            onKeyDown={(e) => {
              // Enter on the card body (not on a focused button) invokes the default action.
              if (e.key !== 'Enter') return;
              const target = e.target as HTMLElement;
              if (target.tagName === 'BUTTON') return;
              const id = defaultId();
              if (id === undefined) return;
              const action = actions().find((a) => a.id === id);
              if (action) onAction(action);
            }}
            tabindex={defaultId() !== undefined ? 0 : undefined}
          >
            <Show when={isDanger()}>
              <div class="flex items-center gap-2 text-sm font-medium text-destructive dark:text-red-400">
                <AlertTriangle size={16} class="shrink-0" aria-hidden="true" />
                <span>Heads up</span>
              </div>
            </Show>
            <Show when={local.data?.heading}>
              <p class="text-sm font-semibold text-foreground">{local.data?.heading}</p>
            </Show>
            <Show when={local.data?.body}>
              <p class="text-sm text-foreground">{local.data?.body}</p>
            </Show>
          </div>
        </Card>
        </Show>
      </ErrorBoundary>
    </Show>
  );
}
