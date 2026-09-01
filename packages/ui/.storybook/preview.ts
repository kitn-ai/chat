import type { Preview, Decorator } from 'storybook-solidjs-vite';
import { createComponent, onCleanup, type JSX } from 'solid-js';
import { themes } from 'storybook/theming';
import { toast } from '../src/primitives/toast-store';
// Register the kai-* elements via the BUILT bundle (`dist/kai.es.js`), not the
// src entry: the src registration is a result-unused, SSR-gated dynamic import
// that the PRODUCTION storybook build (Rollup) tree-shakes away entirely, so a
// deployed static Storybook would ship every kai-* element unregistered/inert.
// The dist bundle is listed in package.json `sideEffects`, so it's never shaken,
// and it self-registers (browser-gated + SSR-safe). `elementsReady` resolves
// once registration completes. (Requires the kit to be built — `nx build ui` —
// before `storybook build`; wired into the dev/build scripts + deploy workflow.)
import { elementsReady } from '../dist/kai.es.js';
import './styles.css';

// ── AI/UI brand for the manager (top-left) ──────────────────────────────────
// The split-node mark (the favicon glyph: zinc wedge + magenta wedge in a
// rounded square) + an "AI/UI" wordmark, built as an inline SVG data-URI so
// there's no static asset to serve. `wordmark` colour is themed per manager mode
// so it reads on both the light and dark chrome.
const brandMark = (wordmark: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="104" height="28" viewBox="0 0 104 28">' +
      '<defs><clipPath id="m"><rect width="28" height="28" rx="7"/></clipPath></defs>' +
      '<g clip-path="url(#m)">' +
      '<polygon points="0,0 17,0 9,28 0,28" fill="#71717a"/>' +
      '<polygon points="20,0 28,0 28,28 12,28" fill="#EC2295"/></g>' +
      `<text x="38" y="20" font-family="ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif" font-size="17" font-weight="700" fill="${wordmark}">AI<tspan fill="#EC2295">/</tspan>UI</text>` +
      '</svg>',
  )}`;
const BRAND = { brandTitle: 'AI/UI', brandUrl: 'https://ui.kitn.ai' };

// Storybook's dark toggle adds `.dark` to the preview <html>, but the `kai-*`
// custom elements render in SHADOW DOM, which a light-DOM class can't cross — so
// they'd otherwise fall back to their own `theme="auto"` (the OS preference) and
// ignore the toggle. Mirror the resolved Storybook theme onto each element's
// `theme` attribute (which DOES drive its shadow content), keeping web-component
// stories in lockstep with the light/dark switch.
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const applyElementTheme = (): void => {
    const dark = document.documentElement.classList.contains('dark');
    // Walk the WHOLE document, not just #storybook-root: autodocs renders stories
    // under .sbdocs (OUTSIDE #storybook-root), and the imperative toast() mounts a
    // <kai-toast-region> directly on document.body. Both must track the toggle, or
    // they fall back to theme="auto" (OS) and mismatch the page — the washed-out
    // autodocs render and the body-level toast overlay.
    document.querySelectorAll('*').forEach((el) => {
      if (el.tagName.toLowerCase().startsWith('kai-')) {
        el.setAttribute('theme', dark ? 'dark' : 'light');
      }
    });
  };
  let pending = false;
  const schedule = (): void => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      applyElementTheme();
    });
  };
  new MutationObserver(schedule).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  const start = (): void => {
    // Observe the whole body subtree so autodocs blocks + the lazily body-mounted
    // toast region are picked up (not only #storybook-root's canvas).
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

// The imperative `toast()` store lives in a module-global `createRoot` and mounts
// its `<kai-toast-region>` on `document.body` (a portal) — both OUTSIDE any story's
// reactive tree, so they survive a story unmount. A sticky toast raised by one
// story (e.g. AMUX's "agent needs you" cards in Labs/Apps) would otherwise leak
// onto the next story you navigate to. This wraps every story in a Solid component
// whose `onCleanup` clears the store when the story unmounts, so nothing carries
// across navigation. `preview.ts` is a plain `.ts` file (no JSX), so the wrapper is
// built with `createComponent` rather than `<ToastReset>`.
function ToastReset(props: { children: JSX.Element }): JSX.Element {
  onCleanup(() => toast.clear());
  return props.children;
}
const clearToastsOnUnmount: Decorator = (Story) =>
  createComponent(ToastReset, {
    get children() {
      return Story();
    },
  });

const preview: Preview = {
  // `@kitn.ai/ui/elements` (src/elements/register.ts) is now SSR-import-safe: it
  // registers the kai-* custom elements via a gated dynamic `import()` (browser-
  // only), so registration completes on a microtask AFTER the module imports —
  // not synchronously. Storybook always runs in a browser, so eagerly trigger +
  // await that registration once, before each story renders. Without this, a
  // story can render its kai-* elements before they upgrade — which, for the
  // ScrollButton "Ancestor Walk" story, means the element's mount-time ancestor
  // walk (which makes the scroll region keyboard-focusable) hasn't run yet when
  // axe checks it, failing `scrollable-region-focusable`.
  async beforeEach() {
    if (typeof window === 'undefined') return;
    await elementsReady;
  },
  // Outermost decorator: clear any imperatively-raised toasts when a story
  // unmounts so sticky toasts don't leak across story navigation (see
  // `clearToastsOnUnmount` above). Keep this FIRST so its `onCleanup` always runs.
  decorators: [clearToastsOnUnmount],
  parameters: {
    layout: 'fullscreen',
    // Accessibility (axe) runs per-story in both the Storybook UI panel and the
    // `vitest --project=storybook` test run. `test: 'error'` makes a11y
    // violations FAIL that run. Override per-story with a local `a11y.test`
    // parameter if a fixture differs.
    //
    // "so a11y is gated" is what this comment used to say, and it was wrong on
    // both halves. It credited a kit-wide audit script (`scripts/audit-a11y.mjs`,
    // PR #49) that had no assertions and always exited 0, and that is now deleted.
    // And the `storybook` job is ADVISORY -- it is not in the branch ruleset, so
    // a red run here does not block a merge. What IS gated on a11y in the
    // required `test` job is the focus-indicator paint guard
    // (tests/e2e/focus-ring-paints.spec.ts). Per-story axe here is real signal
    // and worth keeping; it is just not a gate, and the kit does not currently
    // pass a full axe sweep -- see apps/docs/.../guides/accessibility.mdx for the
    // standing violations.
    //
    // `context.exclude` is the kit's ONE documented a11y exception: the Shiki
    // dark theme (github-dark-dimmed) renders code comments at #768390 (~3.87:1),
    // below WCAG AA — a deliberate, theme-defined syntax-highlighting aesthetic we
    // don't control. axe can't scope a single rule to a subtree, so we exclude the
    // rendered code (`<pre>`) from the run; it carries no interactive/labelable
    // content, so in practice only the comment-color contrast check is waived.
    // color-contrast (and every other rule) stays enforced everywhere else.
    // NOTE: exclude MUST live under `context` — a top-level `exclude` is ignored.
    a11y: {
      test: 'error',
      context: { exclude: [['pre']] },
    },
    // SB10 Code panel: show a "Code" tab in the CANVAS (next to Controls/
    // Actions/etc.) carrying each story's source. It reuses the Docs Source-block
    // config, so element stories that set their own `docs.source.code`
    // (the per-element HTML/Solid usage snippets) surface that same snippet here
    // — which is exactly what their "See the Code tab" descriptions point at.
    // Provided by the already-registered `@storybook/addon-docs`; no extra
    // registration needed. Disable for a single story with `docs.codePanel:
    // false`.
    docs: {
      codePanel: true,
      // A `render:` story with no hand-authored `docs.source.code` (see
      // `scripts/lint-story-conventions.mjs`) leaves Storybook's default
      // source doc-block to fall back to a raw serialized dump of the story
      // OBJECT -- `{ render: [Function], parameters: {...}, ... }` -- which is
      // noise, not a usage snippet, and reads as though something rendered
      // correctly when nothing was authored at all. Swap that one shape for
      // an honest placeholder instead of trying to synthesize real usage code
      // (there is no way to reconstruct a hand-drawn `render:` body from its
      // compiled function). The guard is what actually closes the gap; this
      // is only about not lying in the meantime.
      source: {
        transform: (sourceCode: string) =>
          sourceCode.startsWith('{') && sourceCode.includes('render:')
            ? '// no usage snippet authored for this story yet — see lint:story-conventions'
            : sourceCode,
      },
    },
    options: {
      storySort: {
        // Sidebar order, top to bottom: the Getting Started guides, the SolidJS
        // Components, the Labs composition testing ground, then the small set of
        // Test Fixtures the e2e specs target.
        //
        // NOTE: every top-level group MUST be named explicitly here. The
        // trailing `*` is a catch-all that sorts unlisted groups to the very
        // bottom — so a group only referenced inside a nested sub-order (never as
        // a top-level entry) would strand itself below the named ones. The nested
        // arrays set the intra-group order rather than sorting alphabetically.
        order: [
          // Storybook is the SolidJS-primitive / contributor surface (the consumer
          // web-component docs live at ui.kitn.ai). Lead with the Getting Started
          // guides (the auto-generated Token Reference rides at the end of that
          // group — one token doc doesn't warrant its own section), then the
          // SolidJS Components, the Labs composition testing ground, and the small
          // Test Fixtures set the e2e specs target. The web-component element
          // stories now live in the docs, not here.
          'Getting Started',
          ['Overview', "How it's built", 'Working with the primitives', 'Create or modify a component', 'Building in the Labs', 'Run the kit locally', 'Token Reference'],
          'Components',
          ['Overview', 'Elements', 'Primitives'],
          'Labs',
          ['Apps', ['*', 'AMUX'], '*'],
          'Test Fixtures',
          '*',
        ],
      },
    },
    // storybook-dark-mode: one toggle themes the whole Storybook — manager
    // chrome, docs pages, and the preview. `darkClass: 'dark'` on the preview
    // <html> drives the kit's own `.dark` design tokens, so the components
    // switch in lockstep with the surrounding UI.
    darkMode: {
      current: 'light',
      stylePreview: true,
      classTarget: 'html',
      darkClass: 'dark',
      lightClass: 'light',
      dark: { ...themes.dark, appPreviewBg: 'hsl(50 2% 9%)', ...BRAND, brandImage: brandMark('#fafafa') },
      light: { ...themes.light, ...BRAND, brandImage: brandMark('#27272a') },
    },
  },
};

export default preview;
