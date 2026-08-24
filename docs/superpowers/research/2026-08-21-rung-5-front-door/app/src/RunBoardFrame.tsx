/**
 * The cross-origin run board, framed.
 *
 * WHY THIS IS NOT `<Remote>` FROM `@kitn.ai/ui/react`.
 *
 * The generated React wrappers render the bare tag with only `ref`/`className`/
 * `style`/`id`, then assign every real prop from a `useLayoutEffect` — which
 * runs AFTER the element is in the document, so after `connectedCallback`. For
 * almost every `kai-*` element that is harmless: a late assignment is just
 * another reactive update and Solid re-renders.
 *
 * `<kai-remote>` is the exception. It reads `providerOrigin`, `src` and
 * `envelope` ONCE, in its mount, and if any is missing it renders a permanent
 * error and never retries. Through the React wrapper it therefore always mounts
 * having seen nothing, and paints:
 *
 *     [kai-remote] Invalid provider-origin "". Must be an absolute https: origin…
 *
 * while `el.providerOrigin` reads back perfectly from the console a tick later,
 * which is what makes this so hard to see. It is the `upgrade-race` invariant
 * with the halves swapped — the element is defined in time, the PROPS are late.
 *
 * So the element is created, configured and only THEN inserted. Same element,
 * same contract; the two lines that matter are the order of the last two.
 *
 * The static `import '@kitn.ai/ui/elements/remote'` in main.tsx is the other
 * half: `<kai-remote>` is opt-in and register-all does not include it, and
 * `document.createElement` only upgrades a tag that is already defined.
 */
import { useEffect, useRef } from 'react';
import type { KaiRemoteElement } from '@kitn.ai/ui/elements';
import type { CardEnvelope, CardPolicy } from '@kitn.ai/ui';

export interface RunBoardFrameProps {
  /** The provider page to frame. Must be on `providerOrigin`. */
  src: string;
  /** Exact provider origin; every inbound frame is checked against it. */
  providerOrigin: string;
  /** Sent down as the `render` frame. Read once, at mount. */
  envelope: CardEnvelope;
  /** Where the board's card events are routed. Same policy as the thread's. */
  policy: CardPolicy;
}

export function RunBoardFrame({ src, providerOrigin, envelope, policy }: RunBoardFrameProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const el = document.createElement('kai-remote') as KaiRemoteElement;
    el.theme = 'dark';
    el.src = src;
    el.providerOrigin = providerOrigin;
    el.envelope = envelope as unknown as Record<string, unknown>;
    el.policy = policy as unknown as Record<string, unknown>;
    // Everything above happens BEFORE this line. That is the whole point.
    host.appendChild(el);

    return () => {
      // Removing it runs the element's own teardown: `teardown` down the wire,
      // listeners off, iframe gone.
      el.remove();
    };
  }, [src, providerOrigin, envelope, policy]);

  return <div ref={hostRef} className="board-frame" />;
}
