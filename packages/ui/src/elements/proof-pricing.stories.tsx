import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, For, Show } from 'solid-js';
import './register'; // registers kai-icon (the only kai-* element used here)

// Labs/Proofs: a TOKEN-DRIVEN proof. A Pricing & Plans page built ONLY from the
// design tokens + raw markup (Tailwind utilities that map to our --color-*/radius/
// shadow tokens). DELIBERATELY uses no feature components — the point is "what if
// there's no component for this screen?". The only kit element here is <kai-icon>
// (glyphs only); every card, the billing toggle, the feature rows, and the CTAs
// are hand-rolled token markup. It renders correctly in light AND dark because it
// reads tokens, never hex. The GAP LIST this surfaces (components we should ship,
// tokens that were missing/awkward) is the whole deliverable — see the file's
// trailing notes + the worker report.

// kai-icon is the sole element. Declared identically to the other Labs stories so
// the shared global JSX augmentation matches byte-for-byte across the compilation
// (TypeScript errors TS2717 otherwise).
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-icon': JSX.HTMLAttributes<HTMLElement> & { name?: string; size?: string };
    }
  }
}

const meta = { title: 'Labs/Proofs', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

type Billing = 'monthly' | 'yearly';

interface Plan {
  id: string;
  name: string;
  tagline: string;
  monthly: number; // USD / month, billed monthly
  yearly: number; // USD / month, billed annually (the discounted rate)
  cta: string;
  featured?: boolean;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'For individuals exploring what they can build.',
    monthly: 0,
    yearly: 0,
    cta: 'Get started',
    features: [
      '1 project',
      'Community support',
      'Core component library',
      '1 GB asset storage',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For professionals shipping real products.',
    monthly: 20,
    yearly: 16,
    cta: 'Start free trial',
    featured: true,
    features: [
      'Unlimited projects',
      'Priority support',
      'Advanced components',
      '50 GB asset storage',
      'Custom themes & tokens',
      'Usage analytics',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'For teams building together at scale.',
    monthly: 40,
    yearly: 32,
    cta: 'Contact sales',
    features: [
      'Everything in Pro',
      'Up to 20 seats',
      'SSO & SAML',
      'Audit logs',
      'SLA & dedicated support',
      'Guided onboarding',
    ],
  },
];

// The feature-row check. There is NO `check` glyph in the named-icon registry
// (kai-icon can't render one), so this is hand-rolled as an inline SVG — and it
// is tinted with `text-tool-green` because the kit ships no semantic
// success/positive color token (tool-green is a tool-status hue, the closest fit).
function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="mt-0.5 size-4 shrink-0 text-tool-green"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export const Pricing: Story = {
  name: 'Pricing',
  render: () => {
    const [billing, setBilling] = createSignal<Billing>('monthly');

    const priceOf = (p: Plan) => (billing() === 'monthly' ? p.monthly : p.yearly);
    const noteOf = (p: Plan) => {
      if (p.monthly === 0) return 'Free forever — no card required';
      return billing() === 'monthly' ? 'billed monthly' : 'billed annually';
    };

    // Token-styled segmented pill. The track is a `bg-surface` capsule; the active
    // pill lifts with `bg-background` + `.kai-elevation-sm`; the inactive label is
    // muted. All token-driven — no hardcoded colors.
    const seg = (active: boolean) =>
      `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-background text-foreground kai-elevation-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`;

    return (
      // Double-container scroll pattern: the outer flex box owns the viewport and
      // scrolls; the inner block is `m-auto` so the section centers vertically yet
      // can grow taller than the viewport and still scroll.
      <div class="flex h-screen w-full overflow-auto bg-background text-foreground">
        <div class="m-auto w-full max-w-5xl px-6 py-16">
          {/* Heading + subhead */}
          <div class="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <span class="text-meta font-medium uppercase tracking-wide text-primary">
              Pricing
            </span>
            <h1 class="text-4xl font-semibold tracking-tight">
              Plans that scale with you
            </h1>
            <p class="text-base leading-relaxed text-muted-foreground">
              Start free, upgrade when your team grows. Every plan includes a
              14-day trial of Pro. No surprises, cancel anytime.
            </p>

            {/* Monthly / Yearly billing toggle */}
            <div class="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => setBilling('monthly')}
                class={seg(billing() === 'monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling('yearly')}
                class={seg(billing() === 'yearly')}
              >
                Yearly
                <span class="ml-1.5 rounded-full bg-tool-green/15 px-1.5 py-0.5 text-caption font-semibold text-tool-green">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div class="mt-14 grid items-stretch gap-6 md:grid-cols-3">
            <For each={PLANS}>
              {(plan) => (
                <div
                  class={`relative flex flex-col rounded-xl border bg-card p-6 ${
                    plan.featured
                      ? 'border-primary ring-1 ring-primary kai-elevation'
                      : 'border-border'
                  }`}
                >
                  {/* "Most popular" badge on the highlighted tier */}
                  <Show when={plan.featured}>
                    <div class="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-caption font-semibold text-primary-foreground">
                      <kai-icon name="sparkles" size="14" />
                      Most popular
                    </div>
                  </Show>

                  {/* Plan name + tagline */}
                  <div class="flex flex-col gap-1.5">
                    <h2 class="text-title font-semibold">{plan.name}</h2>
                    <p class="min-h-[2.6rem] text-sm leading-relaxed text-muted-foreground">
                      {plan.tagline}
                    </p>
                  </div>

                  {/* Price + period */}
                  <div class="mt-5 flex flex-col gap-1">
                    <div class="flex items-baseline gap-1">
                      <span class="text-4xl font-semibold tracking-tight">
                        ${priceOf(plan)}
                      </span>
                      <span class="text-sm text-muted-foreground">/month</span>
                    </div>
                    <span class="text-meta text-muted-foreground">{noteOf(plan)}</span>
                  </div>

                  {/* Feature list */}
                  <div class="my-6 h-px w-full bg-border" />
                  <ul class="flex flex-1 flex-col gap-3">
                    <For each={plan.features}>
                      {(f) => (
                        <li class="flex items-start gap-2.5 text-sm text-foreground">
                          <Check />
                          <span>{f}</span>
                        </li>
                      )}
                    </For>
                  </ul>

                  {/* CTA — primary on the featured tier, outline on the others.
                      mt-auto bottom-aligns it across the equal-height cards. */}
                  <button
                    type="button"
                    class={`mt-8 inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition ${
                      plan.featured
                        ? 'bg-primary text-primary-foreground hover:opacity-90'
                        : 'border border-border bg-background text-foreground hover:bg-surface'
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
              )}
            </For>
          </div>

          {/* Footer note */}
          <p class="mt-12 text-center text-meta text-muted-foreground">
            Prices in USD. Volume and nonprofit discounts available — get in touch.
          </p>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: `// Token-only screen: design tokens + raw markup, deliberately built without
// feature components. The single kit element in use is <kai-icon name="sparkles">
// for the "Most popular" badge glyph - everything else (cards, billing toggle,
// feature rows, CTAs) is hand-rolled markup over the --color-*/radius/shadow
// tokens.`,
      },
    },
  },
};
