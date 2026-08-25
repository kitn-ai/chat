// V2-PORT helper: Solid 2's `merge` resolves to the right-most source that HAS a
// key — an explicitly-undefined prop (`<Form cardId={maybeUndefined}>` creates the
// getter either way) now OVERRIDES the default, where 1.x `mergeProps` skipped
// undefined values. Every former `mergeProps(defaults, props)` site in this kit
// relies on the 1.x rule (the element facades pass their whole declared prop bag
// through, unset entries included), so this reproduces it: read the prop first,
// fall back to the default only when the resolved value is undefined. Reads stay
// reactive — each property access forwards to the live props object at read time.
export function mergeDefaults<T extends object, D extends object>(defaults: D, props: T): T & D {
  const keys = () => {
    const set = new Set<string | symbol>(Reflect.ownKeys(defaults));
    for (const k of Reflect.ownKeys(props)) set.add(k);
    return [...set];
  };
  return new Proxy({} as T & D, {
    get(_, key) {
      const v = (props as Record<string | symbol, unknown>)[key];
      return v === undefined ? (defaults as Record<string | symbol, unknown>)[key] : v;
    },
    has(_, key) {
      return key in props || key in defaults;
    },
    ownKeys: keys,
    getOwnPropertyDescriptor(_, key) {
      return { configurable: true, enumerable: true };
    },
  });
}
