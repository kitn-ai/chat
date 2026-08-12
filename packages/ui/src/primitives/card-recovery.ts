// src/primitives/card-recovery.ts
// Recovery glue for the card dismiss/reopen flow. `dismissRecovery` builds the
// `{ onDismiss, onReopen }` half of a CardPolicy for a host that keeps its cards in
// some store: it writes a `dismissed` resolution onto the matching envelope (a NEW
// array reference, never an in-place mutation, so a Solid/React host re-renders),
// optionally shows an injected "Dismissed · Undo" toast (Undo restores the prior
// resolution), and on reopen decides — via `isReopenable` — whether the card comes
// back live (resolution cleared) or `expired`.
//
// The toast is an INJECTED ADAPTER, never an import — cards (and this helper) stay
// decoupled from the toast module. The re-appear rule is the host's: "the agent
// already proceeded" is a host fact, surfaced through `isReopenable`.
import type { CardEnvelope, CardPolicy, CardResolution } from './card-contract';

/** The minimal toast surface this helper needs. Inject a real adapter (e.g. one
 *  backed by `kai-toast-region`) — this module never imports the toast itself. */
export interface RecoveryToast {
  show(opts: {
    message: string;
    action?: { label: string; onClick: () => void };
    durationMs?: number;
  }): { dismiss(): void };
}

/** Context handed to a custom `isReopenable` predicate. */
export interface ReopenEnv {
  cardId: string;
  /** The card's current resolution at reopen time (should be `dismissed`). */
  resolution: CardResolution | undefined;
  /** `Date.now()` at reopen time (injected for testability). */
  now: number;
}

export interface DismissRecoveryOptions {
  /** Read the current cards array. */
  get: () => CardEnvelope[];
  /** Write the next cards array (a NEW reference). */
  set: (next: CardEnvelope[]) => void;
  /** Optional injected toast adapter for the "Dismissed · Undo" affordance. */
  toast?: RecoveryToast;
  /** Override the default re-openable rule. Return false to expire instead. */
  isReopenable?: (env: ReopenEnv) => boolean;
  /** A dismissed card older than this (ms since `dismissed.at`) is no longer
   *  re-openable (→ expired). Omit/Infinity = never stale. */
  staleAfterMs?: number;
  /** Auto-dismiss the Undo toast after this long. Default 6000ms. */
  undoMs?: number;
  /** Injected clock (defaults to Date.now); keeps the helper testable. */
  now?: () => number;
}

/** The terminal resolution kinds that block a reopen (a finished card can't come back). */
const TERMINAL_KINDS = new Set<CardResolution['kind']>(['action', 'submit', 'expired']);

/** Default re-openable rule: a card can come back unless it carries a terminal
 *  resolution OR it has gone stale (`staleAfterMs` elapsed since `dismissed.at`).
 *  A `dismissed` card with no/invalid `at` is always re-openable. */
export function defaultIsReopenable(env: ReopenEnv, staleAfterMs?: number): boolean {
  const r = env.resolution;
  if (r && TERMINAL_KINDS.has(r.kind)) return false;
  if (
    staleAfterMs !== undefined &&
    Number.isFinite(staleAfterMs) &&
    r?.kind === 'dismissed' &&
    typeof r.at === 'string'
  ) {
    const at = Date.parse(r.at);
    if (!Number.isNaN(at) && env.now - at >= staleAfterMs) return false;
  }
  return true;
}

/** Return a new cards array with `cardId`'s envelope stamped with `resolution`
 *  (or cleared when `resolution` is undefined). Same reference if nothing changed. */
function withResolution(
  cards: CardEnvelope[],
  cardId: string,
  resolution: CardResolution | undefined,
): CardEnvelope[] {
  let changed = false;
  const next = cards.map((c) => {
    if (c.id !== cardId) return c;
    changed = true;
    if (resolution === undefined) {
      if (c.resolution === undefined) return c;
      const { resolution: _drop, ...rest } = c;
      return rest;
    }
    return { ...c, resolution };
  });
  return changed ? next : cards;
}

/** The current resolution on `cardId`, if any. */
function resolutionOf(cards: CardEnvelope[], cardId: string): CardResolution | undefined {
  return cards.find((c) => c.id === cardId)?.resolution;
}

/**
 * Build the `{ onDismiss, onReopen }` policy handlers for the card dismiss/recovery
 * flow over a host store (`get`/`set`).
 *
 * - `onDismiss(cardId)` — stamps `{ kind:'dismissed', at }` immutably and, when a
 *   `toast` is injected, shows "Dismissed" with an Undo that restores the card's
 *   prior resolution (live again when there was none).
 * - `onReopen(cardId)` — clears the resolution (live) when `isReopenable`, else
 *   stamps `{ kind:'expired', at }`.
 */
// `Required<Pick<…>>`, not a bare `Pick`: both members are optional on CardPolicy —
// which is right there, where a host supplies one, the other, or neither — and `Pick`
// carries the `?` across even though the body below returns both handlers on every
// path. That made the declaration say "may be missing" about two things that never
// are, and it was consumer-facing: this function is exported from src/index.ts and the
// MCP scaffolder emits `const { onDismiss, onReopen } = dismissRecovery({…})`, so any
// consumer who destructured and then INVOKED a handler hit TS2722. Assigning the
// result straight into a CardPolicy stays fine either way, both fields being optional
// there, which is why it stayed invisible. tests/primitives/card-recovery.test.ts
// pins the runtime side over the full cross-product of the optional options.
export function dismissRecovery(
  opts: DismissRecoveryOptions,
): Required<Pick<CardPolicy, 'onDismiss' | 'onReopen'>> {
  const now = opts.now ?? (() => Date.now());
  const reopenable = opts.isReopenable ?? ((env: ReopenEnv) => defaultIsReopenable(env, opts.staleAfterMs));
  const undoMs = opts.undoMs ?? 6000;

  const onDismiss = (cardId: string): void => {
    const before = opts.get();
    const prior = resolutionOf(before, cardId);
    const dismissed: CardResolution = { kind: 'dismissed', at: new Date(now()).toISOString() };
    opts.set(withResolution(before, cardId, dismissed));

    opts.toast?.show({
      message: 'Dismissed',
      durationMs: undoMs,
      action: {
        label: 'Undo',
        onClick: () => {
          // Restore the prior resolution (undefined → live again). Read fresh in
          // case the store moved on; only touch this card.
          opts.set(withResolution(opts.get(), cardId, prior));
        },
      },
    });
  };

  const onReopen = (cardId: string): void => {
    const before = opts.get();
    const current = resolutionOf(before, cardId);
    const env: ReopenEnv = { cardId, resolution: current, now: now() };
    if (reopenable(env)) {
      opts.set(withResolution(before, cardId, undefined));
    } else {
      const expired: CardResolution = { kind: 'expired', at: new Date(now()).toISOString() };
      opts.set(withResolution(before, cardId, expired));
    }
  };

  return { onDismiss, onReopen };
}
