import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, For, type Component } from 'solid-js';
import { Dynamic } from '@solidjs/web';
import {
  TrendingUp,
  Calendar,
  ChevronDown,
  DollarSign,
  Users,
  Activity,
  ShoppingCart,
  CreditCard,
  UserPlus,
  RefreshCw,
  FileText,
  TriangleAlert,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Ellipsis,
} from 'lucide-solid';

// Labs/Proofs: an Analytics Dashboard built ENTIRELY from the kit's design tokens
// + raw markup - NO feature components (no kai-*). It exists to prove the token
// system can dress a polished, real-world screen the kit has no component for.
// The only dependency is lucide-solid for glyphs (rendered as plain inline SVG
// via the icon components; kai-icon is deliberately avoided to keep this pure
// token-driven markup). Colour comes only from --color-* tokens, surfaces from
// the bg-surface / bg-card / bg-surface-sunken hierarchy, elevation from the
// .kai-elevation utility, and the up/down deltas borrow the --color-tool-green /
// --color-tool-red hues (the kit has no semantic positive/negative token - see
// the GAPS notes in the story's parameters block).

const meta = { title: 'Labs/Proofs', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// A lucide glyph component - all of them are (props: { class?: string }) => Element.
type Glyph = Component<{ class?: string }>;

// --- Top-bar date range (segmented control) ---------------------------------
const RANGES = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '3m', label: '3M' },
  { id: '12m', label: '12M' },
];

// --- Metric tiles -----------------------------------------------------------
interface Metric {
  label: string;
  value: string;
  delta: number; // signed percent; sign drives the up/down direction + colour
  icon: Glyph;
  spark: number[]; // mini bar heights (0-100), purely illustrative
}
const METRICS: Metric[] = [
  { label: 'Revenue', value: '$48,290', delta: 12.5, icon: DollarSign, spark: [40, 52, 48, 60, 55, 72, 90] },
  { label: 'Active users', value: '8,420', delta: 4.2, icon: Users, spark: [50, 55, 62, 58, 70, 75, 82] },
  { label: 'Conversion', value: '3.18%', delta: -0.8, icon: Activity, spark: [80, 72, 76, 65, 60, 55, 48] },
  { label: 'Avg. order', value: '$112.40', delta: 2.1, icon: ShoppingCart, spark: [55, 60, 58, 64, 62, 68, 72] },
];

// --- Revenue chart (faux grouped bars, drawn with token-coloured divs) -------
interface Bar { m: string; now: number; prev: number }
const CHART_MAX = 64;
const CHART: Bar[] = [
  { m: 'Jan', now: 28, prev: 22 },
  { m: 'Feb', now: 31, prev: 24 },
  { m: 'Mar', now: 30, prev: 26 },
  { m: 'Apr', now: 37, prev: 28 },
  { m: 'May', now: 34, prev: 30 },
  { m: 'Jun', now: 42, prev: 31 },
  { m: 'Jul', now: 39, prev: 33 },
  { m: 'Aug', now: 47, prev: 35 },
  { m: 'Sep', now: 44, prev: 37 },
  { m: 'Oct', now: 52, prev: 40 },
  { m: 'Nov', now: 49, prev: 42 },
  { m: 'Dec', now: 58, prev: 45 },
];

// --- Recent activity --------------------------------------------------------
interface Act {
  icon: Glyph;
  // FULL literal Tailwind class string (Tailwind only scans literal strings, so a
  // computed `bg-tool-${tone}` would not be generated - these must be written out).
  tone: string;
  title: string;
  detail: string;
  time: string;
}
const ACTIVITY: Act[] = [
  { icon: CreditCard, tone: 'bg-tool-green/15 text-tool-green', title: 'Sarah Chen', detail: 'upgraded to the Pro plan ($49/mo)', time: '2 minutes ago' },
  { icon: UserPlus, tone: 'bg-tool-blue/15 text-tool-blue', title: '128 new sign-ups', detail: 'from the product launch campaign', time: '14 minutes ago' },
  { icon: RefreshCw, tone: 'bg-tool-amber/15 text-tool-amber', title: 'Refund issued', detail: 'for order #10482 ($112.40)', time: '1 hour ago' },
  { icon: TriangleAlert, tone: 'bg-tool-red/15 text-tool-red', title: 'API error rate', detail: 'spiked to 2.1% on the checkout service', time: '3 hours ago' },
  { icon: FileText, tone: 'bg-surface-sunken text-muted-foreground', title: 'Monthly report', detail: 'for May is ready to download', time: '5 hours ago' },
  { icon: Building2, tone: 'bg-tool-blue/15 text-tool-blue', title: 'New enterprise lead', detail: 'Northwind Traders requested a demo', time: 'Yesterday' },
];

function MetricTile(props: { m: Metric }) {
  const up = () => props.m.delta >= 0;
  return (
    <div class="rounded-xl border border-border bg-card p-4 kai-elevation-sm">
      <div class="flex items-center justify-between">
        <span class="text-meta font-medium uppercase tracking-wide text-muted-foreground">{props.m.label}</span>
        <span class="flex size-7 items-center justify-center rounded-lg bg-surface-sunken text-muted-foreground">
          <Dynamic component={props.m.icon} class="size-3.5" />
        </span>
      </div>
      <div class="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{props.m.value}</div>
      <div class="mt-2 flex items-center gap-1.5">
        <span class={`inline-flex items-center gap-0.5 text-caption font-semibold tabular-nums ${up() ? 'text-tool-green' : 'text-tool-red'}`}>
          {up() ? <ArrowUpRight class="size-3" /> : <ArrowDownRight class="size-3" />}
          {Math.abs(props.m.delta)}%
        </span>
        <span class="text-caption text-muted-foreground">vs last month</span>
      </div>
      {/* sparkline - mini bars in the delta's tone */}
      <div class="mt-3 flex h-8 items-end gap-1" aria-hidden="true">
        <For each={props.m.spark}>
          {(v) => (
            <div
              class={["flex-1 rounded-sm", { 'bg-tool-green/60': up(), 'bg-tool-red/60': !up() }]}
             
              style={{ height: `${v}%` }}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function RevenueChart() {
  return (
    <div class="flex h-full flex-col rounded-xl border border-border bg-card p-5 kai-elevation-sm">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-title font-semibold">Revenue</h2>
          <p class="mt-0.5 text-meta text-muted-foreground">Monthly revenue, trailing 12 months</p>
        </div>
        <div class="flex items-center gap-4">
          <div class="hidden items-center gap-3 text-meta text-muted-foreground sm:flex">
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2 rounded-full bg-tool-blue" />
              This year
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2 rounded-full bg-border" />
              Last year
            </span>
          </div>
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Chart options"
          >
            <Ellipsis class="size-4" />
          </button>
        </div>
      </div>

      {/* plot area: a sunken well, faint gridlines behind, grouped bars on top */}
      <div class="mt-6 flex-1">
        <div class="relative h-52 rounded-lg bg-surface-sunken/50 px-3 pb-2 pt-3">
          {/* gridlines */}
          <div class="pointer-events-none absolute inset-x-3 inset-y-3 flex flex-col justify-between">
            <For each={[0, 1, 2, 3, 4]}>{() => <div class="border-t border-dashed border-border/60" />}</For>
          </div>
          {/* bars */}
          <div class="relative flex h-full items-end gap-1.5">
            <For each={CHART}>
              {(d) => (
                <div class="flex flex-1 items-end justify-center gap-1">
                  <div
                    class="w-2 rounded-t-sm bg-tool-blue transition-all sm:w-2.5"
                    style={{ height: `${(d.now / CHART_MAX) * 100}%` }}
                    title={`This year: $${d.now}k`}
                  />
                  <div
                    class="w-2 rounded-t-sm bg-border sm:w-2.5"
                    style={{ height: `${(d.prev / CHART_MAX) * 100}%` }}
                    title={`Last year: $${d.prev}k`}
                  />
                </div>
              )}
            </For>
          </div>
        </div>
        {/* x-axis month labels */}
        <div class="mt-2 flex gap-1.5 px-3">
          <For each={CHART}>{(d) => <div class="flex-1 text-center text-caption text-muted-foreground">{d.m}</div>}</For>
        </div>
      </div>
    </div>
  );
}

function ActivityCard() {
  return (
    <div class="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card kai-elevation-sm">
      <div class="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 class="text-title font-semibold">Recent activity</h2>
        <button type="button" class="text-meta font-medium text-muted-foreground transition-colors hover:text-foreground">
          View all
        </button>
      </div>
      <div class="flex flex-1 flex-col divide-y divide-border">
        <For each={ACTIVITY}>
          {(a) => (
            <div class="flex items-start gap-3 px-5 py-3">
              <span class={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${a.tone}`}>
                <Dynamic component={a.icon} class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-body leading-snug">
                  <span class="font-medium">{a.title}</span> <span class="text-muted-foreground">{a.detail}</span>
                </p>
                <p class="mt-0.5 text-caption text-muted-foreground">{a.time}</p>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

export const Dashboard: Story = {
  name: 'Dashboard',
  render: () => {
    const [range, setRange] = createSignal('30d');
    return (
      // Page canvas = recessed surface; cards lift off it with bg-card + border +
      // elevation. The whole screen is token-driven (no hardcoded hex), so the
      // Storybook light/dark toggle reskins it for free.
      <div class="min-h-screen bg-surface-sunken text-foreground">
        <div class="mx-auto max-w-6xl px-6 py-8">
          {/* TOP BAR: title + date-range control */}
          <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <span class="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <TrendingUp class="size-4" />
                </span>
                <h1 class="text-2xl font-semibold tracking-tight">Analytics</h1>
              </div>
              <p class="mt-1 text-meta text-muted-foreground">Performance overview for your workspace</p>
            </div>
            <div class="flex items-center gap-2">
              {/* segmented period selector */}
              <div class="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 kai-elevation-sm">
                <For each={RANGES}>
                  {(r) => (
                    <button
                      type="button"
                      onClick={() => setRange(r.id)}
                      class={["rounded-md px-2.5 py-1 text-meta font-medium transition-colors", {
                        'bg-surface-strong text-foreground': range() === r.id,
                        'text-muted-foreground hover:text-foreground': range() !== r.id,
                      }]}
                     
                    >
                      {r.label}
                    </button>
                  )}
                </For>
              </div>
              {/* explicit date-range pill */}
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-meta font-medium kai-elevation-sm transition-colors hover:bg-surface"
              >
                <Calendar class="size-3.5 text-muted-foreground" />
                Jun 1 - Jun 28
                <ChevronDown class="size-3.5 text-muted-foreground" />
              </button>
            </div>
          </header>

          {/* METRIC TILES */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={METRICS}>{(m) => <MetricTile m={m} />}</For>
          </div>

          {/* CHART + RECENT ACTIVITY */}
          <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div class="lg:col-span-2">
              <RevenueChart />
            </div>
            <ActivityCard />
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'PROOF: an Analytics Dashboard built only from --color-* design tokens and raw markup (no kai-* feature components; lucide-solid supplies the glyphs). Demonstrates the surface hierarchy (recessed page / bg-card panels / sunken wells), token-driven deltas + charts, and free light/dark via the toggle. See the source for the GAP notes on components and tokens the kit could add.',
      },
    },
  },
};
