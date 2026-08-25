// V2-PORT helper: Solid 2 removed `on()`, and its `(deps, fn)` pair maps directly
// onto the two-argument `createEffect(compute, apply)` — EXCEPT `{ defer: true }`,
// which has no v2 counterpart. This reproduces it: skip the first apply run, pass
// every later one through (cleanup return included). One helper instead of a
// hand-rolled flag at each of the former defer sites, so the pattern is auditable.
export function deferApply<T>(
  fn: (value: T, prev?: T) => (() => void) | void,
): (value: T, prev?: T) => (() => void) | void {
  let ran = false;
  return (value, prev) => {
    if (!ran) {
      ran = true;
      return;
    }
    return fn(value, prev);
  };
}
