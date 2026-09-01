/** Local, SSR-import-safe icons for the theme studio (geometry from lucide,
 *  ISC — https://lucide.dev).
 *
 *  WHY NOT `import { Check } from 'lucide-solid'`: lucide-solid's published
 *  `dist/esm` bundle is CLIENT-compiled Solid — it builds every icon's DOM
 *  template at MODULE SCOPE via solid-js/web's `template()`. The docs site's
 *  /theme/editor page mounts the studio `client:only`, but astro dev still
 *  EVALUATES the module graph server-side (the mdx's top-level import runs
 *  through vite's module runner, e.g. when vite-plugin-content-assets traces
 *  the page's imports). lucide-solid is an externalized SSR dep there, so node
 *  resolves `solid-js/web` to its SERVER build, whose `template()` throws
 *  "Client-only API called on the server side" during import — before any
 *  component renders, so no onMount/Show guard can help. Our own JSX is
 *  compiled per-environment by the consuming toolchain (ssr for astro dev,
 *  dom for the standalone app build), so this module imports safely anywhere.
 *
 *  Markup parity: same svg attributes and `lucide lucide-icon lucide-<name>`
 *  classes lucide-solid emits, so existing styling is untouched. */
import { splitProps, type JSX } from 'solid-js';

type IconProps = JSX.SvgSVGAttributes<SVGSVGElement>;

/** The lucide svg shell: default attributes + merged classes; extra props
 *  (e.g. `classList`) spread through, matching lucide-solid's Icon. */
function IconBase(props: IconProps & { name: string; children: JSX.Element }) {
  const [local, rest] = splitProps(props, ['name', 'class', 'children']);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={`lucide lucide-icon lucide-${local.name}${local.class ? ` ${local.class}` : ''}`}
      {...rest}
    >
      {local.children}
    </svg>
  );
}

export const IconCheck = (p: IconProps) => (
  <IconBase {...p} name="check">
    <path d="M20 6 9 17l-5-5" />
  </IconBase>
);

export const IconCopy = (p: IconProps) => (
  <IconBase {...p} name="copy">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </IconBase>
);

/** lucide ClipboardPaste. */
export const IconImport = (p: IconProps) => (
  <IconBase {...p} name="clipboard-paste">
    <path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z" />
    <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2M11 14h10" />
    <path d="m17 10 4 4-4 4" />
  </IconBase>
);

/** lucide RotateCcw. */
export const IconReset = (p: IconProps) => (
  <IconBase {...p} name="rotate-ccw">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </IconBase>
);

/** lucide ChevronRight. */
export const IconChevron = (p: IconProps) => (
  <IconBase {...p} name="chevron-right">
    <path d="m9 18 6-6-6-6" />
  </IconBase>
);

export const IconCode = (p: IconProps) => (
  <IconBase {...p} name="code">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </IconBase>
);

/** lucide Bookmark. */
export const IconSave = (p: IconProps) => (
  <IconBase {...p} name="bookmark">
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </IconBase>
);

/** lucide X. */
export const IconClose = (p: IconProps) => (
  <IconBase {...p} name="x">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </IconBase>
);
