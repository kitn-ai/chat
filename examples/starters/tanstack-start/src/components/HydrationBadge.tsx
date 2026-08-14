import { useEffect, useState } from 'react';

/**
 * THE SERVER-RENDERING PROOF, ON THE PAGE.
 *
 * This starter's original job was to show that a `kai-*` element survives SSR +
 * hydration, and this badge is what makes that visible without opening devtools.
 * It is worth keeping alongside the working chat because HYDRATION FAILURE LOOKS
 * LIKE SUCCESS: TanStack Start can emit perfectly correct HTML and then throw
 * during hydration, leaving a page that reads exactly right and does nothing. A
 * screenshot cannot tell those apart. This badge can, because the only way it
 * turns green is for client JavaScript to have run.
 *
 * HOW IT AVOIDS BEING THE BUG IT REPORTS. The state starts `null` — the same value
 * on the server and on React's first client render — so the two trees agree and
 * hydration has nothing to reconcile. Only afterwards does the effect (which never
 * runs on the server) look at `customElements` and re-render. Reading
 * `customElements` during render instead would produce "none" in the server HTML
 * and "5" in the client tree, i.e. a hydration mismatch inside the hydration
 * detector.
 *
 * The tags are polled on a rAF loop rather than checked once: each React wrapper
 * registers its own element from a layout effect and the element modules load as
 * dynamic imports, so the definitions land over the next few frames rather than
 * all at once.
 */
const TAGS = ['kai-button', 'kai-conversations', 'kai-thread', 'kai-prompt-input', 'kai-resizable'] as const;

export function HydrationBadge() {
  const [defined, setDefined] = useState<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const check = () => {
      const n = TAGS.filter((t) => !!customElements.get(t)).length;
      setDefined(n);
      if (n < TAGS.length) raf = requestAnimationFrame(check);
    };
    check();
    return () => cancelAnimationFrame(raf);
  }, []);

  const hydrated = defined === TAGS.length;
  return (
    <span
      className="hydration"
      data-testid="registration-status"
      data-state={hydrated ? 'hydrated' : 'server'}
      title={
        hydrated
          ? `Client JS ran: all ${TAGS.length} kai-* elements are defined in customElements.`
          : 'Server-rendered markup. The kai-* tags are still bare — no client JS has registered them yet.'
      }
    >
      <span className="hydration-dot" aria-hidden />
      {defined === null
        ? 'server-rendered · elements not yet registered'
        : hydrated
          ? `hydrated · ${defined}/${TAGS.length} kai-* elements registered`
          : `hydrating · ${defined}/${TAGS.length} kai-* elements registered`}
    </span>
  );
}
