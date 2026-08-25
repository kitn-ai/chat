import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { For, type Component } from 'solid-js';
import { Dynamic } from '@solidjs/web';
import { SearchX, Rocket, TriangleAlert, WifiOff, RotateCw, Plus } from 'lucide-solid';

// Labs/Proofs: a TOKEN-DRIVEN proof. No feature components, no kai-* elements - just
// the design-system tokens (the --color-* utilities: bg-background / text-foreground /
// bg-card / text-muted-foreground / border-border, the surface scale, the tool-* hues,
// and the radius scale) plus raw markup and inline lucide glyphs. The point: prove the
// tokens alone can build a polished screen the kit ships NO component for - an empty /
// error-state gallery. Light + dark both come for free because every color resolves to
// a --color-* token (Storybook flips the .dark scope; nothing here is a hardcoded hex).

// Lucide icons are SolidJS components; we render them dynamically from the pattern data.
type IconComponent = Component<{ class?: string }>;

interface Pattern {
  key: string;
  icon: IconComponent;
  // The soft tinted "badge" circle: a faint fill + a matching icon color, both pulled
  // from tokens (a neutral surface step, the primary, the destructive, or a tool-* hue).
  badge: string;
  title: string;
  body: string;
  cta: { label: string; variant: 'primary' | 'outline'; icon?: IconComponent };
  secondary?: string;
}

const PATTERNS: Pattern[] = [
  {
    // (1) No results - search came up empty. Neutral tone: a surface step, muted icon.
    key: 'no-results',
    icon: SearchX,
    badge: 'bg-surface-strong text-muted-foreground',
    title: 'No results found',
    body: 'Nothing matches "vesper theme". Check the spelling, or clear the filters and try a broader search.',
    cta: { label: 'Clear search', variant: 'outline' },
  },
  {
    // (2) First run / get started. Brand-ish tone - repurposed from the tool-blue hue
    // (the kit has no dedicated vivid "brand/info" accent; see the gap notes).
    key: 'get-started',
    icon: Rocket,
    badge: 'bg-tool-blue/12 text-tool-blue',
    title: 'Create your first project',
    body: 'Projects keep your chats, prompts, and artifacts together. Spin one up to get going.',
    cta: { label: 'New project', variant: 'primary', icon: Plus },
  },
  {
    // (3) Something went wrong - an error state. Destructive-tinted badge + retry.
    key: 'error',
    icon: TriangleAlert,
    badge: 'bg-destructive/10 text-destructive',
    title: 'Something went wrong',
    body: "We hit an error loading your conversations. This is usually temporary - give it another go.",
    cta: { label: 'Try again', variant: 'outline', icon: RotateCw },
    secondary: 'Contact support',
  },
  {
    // (4) You're offline. Warning tone - repurposed from the tool-amber hue.
    key: 'offline',
    icon: WifiOff,
    badge: 'bg-tool-amber/15 text-tool-amber',
    title: "You're offline",
    body: "We can't reach the server right now. Check your connection - we'll pick up where you left off.",
    cta: { label: 'Retry connection', variant: 'outline', icon: RotateCw },
  },
];

// CTA buttons, hand-built from tokens (the kit's kai-button is deliberately NOT used -
// this proof is markup + tokens only).
const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card';
const OUTLINE_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-transparent px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card';
const GHOST_BTN =
  'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground';

function EmptyStatePanel(props: { pattern: Pattern }) {
  const p = props.pattern;
  return (
    <div class="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-12 text-center">
      {/* the icon-in-a-soft-tinted-circle affordance */}
      <div class={`flex size-14 items-center justify-center rounded-full ${p.badge}`}>
        <Dynamic component={p.icon} class="size-7" />
      </div>
      <p class="mt-5 text-base font-semibold tracking-tight text-foreground">{p.title}</p>
      <p class="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">{p.body}</p>
      <div class="mt-6 flex items-center gap-2">
        <button type="button" class={p.cta.variant === 'primary' ? PRIMARY_BTN : OUTLINE_BTN}>
          {p.cta.icon && <Dynamic component={p.cta.icon} class="size-4" />}
          {p.cta.label}
        </button>
        {p.secondary && (
          <button type="button" class={GHOST_BTN}>
            {p.secondary}
          </button>
        )}
      </div>
    </div>
  );
}

const meta = { title: 'Labs/Proofs', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

export const EmptyStates: Story = {
  name: 'Empty States',
  render: () => (
    <div class="min-h-screen bg-background px-6 py-10 text-foreground">
      <div class="mx-auto max-w-5xl">
        <header class="mb-8">
          <h1 class="text-xl font-semibold tracking-tight">Empty &amp; error states</h1>
          <p class="mt-1.5 text-sm text-muted-foreground">
            Built from design tokens alone - no feature components, no kai-* elements. Toggle the theme:
            light and dark both come from the --color-* tokens.
          </p>
        </header>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <For each={PATTERNS}>{(pattern) => <EmptyStatePanel pattern={pattern} />}</For>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      source: {
        language: 'html',
        // A representative skeleton: one panel, token-driven markup. The icon sits in a
        // soft tinted circle (a faint fill + matching icon color from a token), then a
        // headline, muted body, and a CTA built from the primary/border tokens.
        code: `<!-- Pure token-driven markup - no kit components. Repeat per pattern in a 2x2 grid. -->
<div class="rounded-xl border border-border bg-card px-6 py-12 text-center">
  <!-- icon-in-a-soft-tinted-circle: faint fill + matching icon color, both from tokens -->
  <div class="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
    <svg class="size-7"><!-- lucide glyph (TriangleAlert) --></svg>
  </div>
  <p class="mt-5 text-base font-semibold text-foreground">Something went wrong</p>
  <p class="mt-1.5 max-w-xs text-sm text-muted-foreground">
    We hit an error loading your conversations. This is usually temporary.
  </p>
  <div class="mt-6 flex items-center gap-2">
    <button class="rounded-md border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-surface">
      Try again
    </button>
    <button class="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
      Contact support
    </button>
  </div>
</div>`,
      },
    },
  },
};
