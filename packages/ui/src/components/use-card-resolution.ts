// Shared resolution controller for interactive cards. Precedence:
//   props.resolution  (host-driven / re-hydrated)   >   local optimistic flip   >   none
// A new `data` identity clears the local flip (a fresh card definition is interactive
// again), but an explicit prop keeps it resolved. `isOptimistic` is true only for a
// flip made this session (used to announce via role="status"; silent on re-hydrate).
//
// A resolution is `isResolved` when present at all; `isTerminal` for the finished
// states (action | submit | expired) and `isDeferred` for `dismissed` — a set-aside
// card that still offers a Reopen affordance.
import { createSignal, createMemo, createEffect, type Accessor } from 'solid-js';
import { deferApply } from '../utils/defer-apply'; // V2-PORT: on(...,{defer:true}) replacement
import type { CardResolution } from '../primitives/card-contract';

export interface ResolutionController<R extends CardResolution = CardResolution> {
  resolution: Accessor<R | undefined>;
  isResolved: Accessor<boolean>;
  /** A finished resolution the user can't take back here (action | submit | expired). */
  isTerminal: Accessor<boolean>;
  /** A deferred resolution (`dismissed`) — set aside, still re-openable. */
  isDeferred: Accessor<boolean>;
  isOptimistic: Accessor<boolean>;
  setLocal: (r: R) => void;
}

/** The resolution kinds that are finished and not re-openable from the card. */
const TERMINAL_KINDS = new Set<CardResolution['kind']>(['action', 'submit', 'expired']);

export function useCardResolution<R extends CardResolution = CardResolution>(opts: {
  prop: Accessor<R | undefined>;
  data: Accessor<unknown>;
}): ResolutionController<R> {
  const [local, setLocal] = createSignal<R | undefined>(undefined);
  // Reset the optimistic flip when a NEW data identity arrives (deferred so mount
  // doesn't clobber an initial prop). The prop still wins via the memo below.
  createEffect(opts.data, deferApply(() => setLocal(undefined)));
  const resolution = createMemo(() => opts.prop() ?? local());
  const isResolved = createMemo(() => resolution() !== undefined);
  const isTerminal = createMemo(() => {
    const r = resolution();
    return r !== undefined && TERMINAL_KINDS.has(r.kind);
  });
  const isDeferred = createMemo(() => resolution()?.kind === 'dismissed');
  const isOptimistic = createMemo(() => opts.prop() === undefined && local() !== undefined);
  return { resolution, isResolved, isTerminal, isDeferred, isOptimistic, setLocal };
}
