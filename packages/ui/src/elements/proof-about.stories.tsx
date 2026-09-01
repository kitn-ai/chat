import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { For } from 'solid-js';
import { FlaskConical, ShieldCheck, ScanSearch, ArrowRight } from 'lucide-solid';

// Labs/Proofs: the section's About card. This one carries no proof of its own - it
// explains what the sibling proofs are for. Like them, it is built from design
// tokens + raw markup only (no feature components, no kai-* elements), so it reads
// correctly in light and dark off the --color-* tokens. It shares the
// `title: 'Labs/Proofs'` of the proof stories so it joins the same sidebar group;
// the `proof-about` filename sorts it to the top of that group.

// Why each proof exists - the two jobs every token-only screen is doing at once.
const JOBS = [
  {
    icon: ShieldCheck,
    tint: 'bg-tool-green/12 text-tool-green',
    title: 'Prove the tokens hold',
    body: 'Build a polished, real screen we ship no component for, from tokens alone. If it looks right in light and dark, the token layer is doing its job.',
  },
  {
    icon: ScanSearch,
    tint: 'bg-tool-blue/12 text-tool-blue',
    title: 'Surface the gaps',
    body: 'Where the tokens run out - a missing scale, a color we had to fake, a primitive worth a component - that gap is the deliverable. It gets logged.',
  },
];

// The current proof set. One line each; the names match the stories in this group.
const PROOFS = [
  { name: 'Pricing', note: 'plans, billing toggle, feature matrix, CTAs' },
  { name: 'Dashboard', note: 'stat cards, activity feed, charts-as-markup' },
  { name: 'Auth', note: 'sign-in / sign-up forms and field states' },
  { name: 'Data Table', note: 'dense rows, headers, status pills, pagination' },
  { name: 'Empty States', note: 'empty / error / offline gallery' },
];

const meta = { title: 'Labs/Proofs', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

export const About: Story = {
  name: 'About',
  render: () => (
    <div class="min-h-screen bg-background px-6 py-10 text-foreground">
      <div class="mx-auto max-w-3xl">
        <header class="mb-8 flex items-start gap-3">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FlaskConical class="size-6" />
          </div>
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Proofs</h1>
            <p class="mt-1 text-sm text-muted-foreground">
              Token-only screens built without feature components.
            </p>
          </div>
        </header>

        <p class="text-sm leading-relaxed text-foreground/90">
          Each proof is a real screen - Pricing, Dashboard, Auth, Data Table, Empty States -
          built from the design tokens plus raw markup. No feature components, no kai-* elements
          (glyphs aside). The constraint is the point: what does it take to build a screen the kit
          ships no component for, using only what the design system gives a consumer?
        </p>

        <h2 class="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Why they exist
        </h2>
        <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <For each={JOBS}>
            {(job) => (
              <div class="rounded-xl border border-border bg-card p-5">
                <div class={`flex size-9 items-center justify-center rounded-lg ${job.tint}`}>
                  <job.icon class="size-5" />
                </div>
                <h3 class="mt-3 text-sm font-semibold tracking-tight text-foreground">{job.title}</h3>
                <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{job.body}</p>
              </div>
            )}
          </For>
        </div>

        <h2 class="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How to read them
        </h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          Open a proof and toggle the theme - light and dark both come from the --color-* tokens,
          nothing is a hardcoded hex. The gaps each one surfaced (components and tokens worth
          building next) are tracked in{' '}
          <code class="rounded bg-surface-sunken px-1.5 py-0.5 text-[0.8125rem] text-foreground">
            docs/labs-proofs-gap-backlog.md
          </code>
          .
        </p>

        <h2 class="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          The proofs
        </h2>
        <ul class="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          <For each={PROOFS}>
            {(proof) => (
              <li class="flex items-center gap-3 px-5 py-3 text-sm">
                <ArrowRight class="size-4 shrink-0 text-muted-foreground" />
                <span class="font-medium text-foreground">{proof.name}</span>
                <span class="text-muted-foreground">{proof.note}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'About the Labs/Proofs section: token-only screens built without feature components, to prove the token system holds for arbitrary screens and to surface the next components/tokens worth building. Gaps are logged in docs/labs-proofs-gap-backlog.md.',
      },
      source: {
        language: 'tsx',
        code: `// Token-only screen: design tokens + raw markup, no kai-* elements and no
// feature components. There is no consumer snippet to show - the point of
// this proof is that it needs none.`,
      },
    },
  },
};
