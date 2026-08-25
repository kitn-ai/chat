// src/primitives/card-host.tsx
// The native transport: a Solid context exposing a CardHost (context() + emit()).
// emit() routes through the contract policy via the shared routeCardEvent. Cards
// inside a <CardProvider> use this; cards inside <kai-chat>/<kai-message>/
// <kai-thread> (and bare cards given a hostElement) fall back to the bubbling
// kai-card event off the host element (see card-routing.listenForCardEvents and
// CardRenderer's hostElement prop).
import { createContext, useContext } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { CardContext, CardEvent, CardHost, CardPolicy } from './card-contract';
import { routeCardEvent } from './card-routing';

// V2-PORT: v2's useContext THROWS when the resolved value is undefined; a `null`
// default restores the 1.x absent-provider behavior the consumers here handle.
const CardHostContext = createContext<CardHost | null>(null);

export interface CardProviderProps {
  /** Ambient context, static or a reactive getter. */
  context: CardContext | (() => CardContext);
  /** Routing policy applied to every emitted event. */
  policy?: CardPolicy;
  children: JSX.Element;
}

export function CardProvider(props: CardProviderProps): JSX.Element {
  // Never destructure props (Solid norm). Resolve context lazily so a getter stays reactive.
  const host: CardHost = {
    context: () =>
      typeof props.context === 'function'
        ? (props.context as () => CardContext)()
        : props.context,
    emit: (event: CardEvent) => routeCardEvent(props.policy, event),
  };
  return <CardHostContext value={host}>{props.children}</CardHostContext>;
}

/** Read the current CardHost. `undefined` when no provider is present (bare card). */
export function useCardHost(): CardHost | undefined {
  // V2-PORT: the context default is now null (see above); this keeps the public
  // undefined-when-absent contract unchanged.
  return useContext(CardHostContext) ?? undefined;
}
