/**
 * The one place the `@kitn.ai/ui` pin's SHAPE is written.
 *
 * `scripts/build.mjs` calls this to produce the range it substitutes into the
 * bundle, and `src/pin-guards.ts` calls it to work out what a given kit version
 * SHOULD have produced. Two copies of `` `^${version}` `` is how the emitted pin
 * and the guard that grades it drift apart — the guard would go on passing while
 * grading a shape nothing ships.
 *
 * A leaf on purpose: no imports, so both a build script and a guard can load it
 * through `scripts/load-ts.mjs` without dragging anything behind it.
 */

/**
 * The range an emitted project pins for a given kit version.
 *
 * A caret, deliberately, and it must STAY a caret while the kit is pre-1.0 —
 * see the `WHY NOT A WIDER RANGE` note in `src/pin-guards.ts` before changing
 * it. The narrowness is the point: it is what makes the pin match the kit the
 * templates were copied from and verified against.
 */
export function derivePin(kitVersion: string): string {
  return `^${kitVersion}`;
}
