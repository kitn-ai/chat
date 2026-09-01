// Per-element sample data for the theme studio's showroom — the same shape as
// the docs site's registry (apps/docs/src/lib/sample-data.ts): one module per
// tag under ./samples/, auto-aggregated via import.meta.glob.
//
// These files are COPIES of the docs samples for exactly the tags the studio's
// CARD_SLOTS / COMPONENT_SLOTS mount (a hand-curated list), taken when the
// studio moved into the package so the standalone app carries its own data
// instead of reaching into apps/docs. If a docs sample is improved, the copy
// here does not follow automatically.

interface SampleModule {
  sample?: Record<string, unknown>;
  named?: Record<string, Record<string, unknown>>;
}

const mods = import.meta.glob<{ default: SampleModule }>('./samples/*.ts', { eager: true });

export const SAMPLE: Record<string, Record<string, unknown>> = {};

for (const path in mods) {
  const tag = path.split('/').pop()!.replace(/\.ts$/, '');
  const m = mods[path].default;
  if (m?.sample) SAMPLE[tag] = m.sample;
}

/** Resolve the sample data for a tag (empty object when none is registered). */
export function sampleFor(tag: string): Record<string, unknown> {
  return SAMPLE[tag] ?? {};
}
