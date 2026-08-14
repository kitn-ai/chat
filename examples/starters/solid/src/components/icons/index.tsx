import { splitProps, type JSX } from 'solid-js';

/**
 * The four glyphs this example needs, hand-rolled.
 *
 * WHY NOT AN ICON PACKAGE. This starter used to pull `lucide-solid` in for two
 * of them. Four inline `<path>`s are smaller than the dependency, and they keep
 * the starter's runtime dependencies to exactly `solid-js` + the kit — which is
 * the more honest demonstration, since a reader can then tell which of the
 * things on screen come from `@kitn.ai/ui` and which are their own. Mirrors
 * `examples/starters/react/src/components/icons/`, where moon/sun are owned by
 * the example for the same reason: they are not in the kit's `<Icon>` set.
 *
 * Props spread onto the `<svg>`, so `class` and `aria-hidden` pass through.
 * `splitProps` rather than destructuring: destructuring a Solid props object
 * reads every field once, eagerly, and severs reactivity — these are static
 * today, but the habit is the point in a file people copy.
 */
export type IconProps = { size?: number } & JSX.SvgSVGAttributes<SVGSVGElement>;

function Glyph(props: IconProps & { children: JSX.Element }) {
  const [local, rest] = splitProps(props, ['size', 'children']);
  return (
    <svg
      viewBox="0 0 24 24"
      width={local.size ?? 20}
      height={local.size ?? 20}
      fill="none"
      stroke="currentColor"
      stroke-width={2}
      stroke-linecap="round"
      stroke-linejoin="round"
      {...rest}
    >
      {local.children}
    </svg>
  );
}

/** Moon — shown in light mode (tap the toggle → dark). */
export function MoonIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </Glyph>
  );
}

/** Sun — shown in dark mode (tap the toggle → light). */
export function SunIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </Glyph>
  );
}

/** Submit arrow, on the composer's send button. */
export function ArrowUpIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </Glyph>
  );
}

/** Attach — the disabled affordance on the composer, left of centre. */
export function PlusIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Glyph>
  );
}
