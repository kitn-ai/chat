import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, For, Show } from 'solid-js';
import {
  RotateCw, ExternalLink, Lock, Monitor, Tablet, Smartphone, Rocket, Users,
  Search, Bell, LayoutDashboard, BarChart3, ShoppingCart, Settings, Sparkles,
  Paperclip, TrendingUp, TrendingDown, CircleCheck, Activity, DollarSign,
} from 'lucide-solid';
import './register'; // every kai-* element used below
import type { FileTreeFile } from '../components/file-tree';
import type { KaiTabItem } from '../ui/tabs';

// Labs/Apps: a faithful replica of Lovable (lovable.dev), the AI app-builder.
// Lovable's signature is the SPLIT SHELL: a chat/conversation column on the LEFT
// (you describe the app, the agent answers with a plan + a streamed build log,
// with the prompt composer pinned at the bottom) and a LIVE PREVIEW of the
// running APPLICATION on the RIGHT, wrapped in browser chrome (refresh, a
// preview--*.lovable.app URL bar, a desktop/tablet/mobile device toggle,
// open-in-new-tab, and a Preview vs Code toggle). A Publish button lives in the
// top bar. The brand mark is a warm coral/pink heart.
//
// DISTINCT from the other builders: v0/Vesper builds a marketing WEBSITE inside a
// real kai-artifact iframe. Lovable builds an APPLICATION, so the right pane is a
// hand-built browser frame rendering a genuine-looking SaaS analytics dashboard
// ("Helm") that responds to the device toggle. The kit supplies the real pieces:
// kai-prompt-input (composer), kai-message (agent prose + the Code tab's
// highlighted source), kai-tasks (the build plan), kai-tabs (Preview/Code),
// kai-file-tree (the project tree), kai-button/kai-menu/kai-badge/kai-avatar
// (controls + the dashboard's own chips and avatars). Layout glue is hand-written.

// These kai-* tags are used as JSX elements below. TypeScript MERGES identical
// global augmentations across the compilation, so each declaration must match its
// sibling story byte-for-byte or it errors TS2717. All blocks below are copied
// verbatim from codex.stories.tsx / perplexity.stories.tsx.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-menu': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'trigger-icon'?: string; 'trigger-label'?: string; 'trigger-icon-trailing'?: string; label?: string; full?: boolean };
      'kai-badge': JSX.HTMLAttributes<HTMLElement> & { variant?: string };
      'kai-prompt-input': JSX.HTMLAttributes<HTMLElement> & { theme?: string; placeholder?: string; loading?: boolean; disabled?: boolean; voice?: boolean; 'web-search'?: boolean; attach?: boolean; submit?: string; 'suggestion-mode'?: string };
      'kai-message': JSX.HTMLAttributes<HTMLElement>;
      'kai-tasks': JSX.HTMLAttributes<HTMLElement>;
      'kai-file-tree': JSX.HTMLAttributes<HTMLElement>;
      'kai-avatar': JSX.HTMLAttributes<HTMLElement> & { src?: string; alt?: string; fallback?: string; size?: string };
      'kai-tabs': JSX.HTMLAttributes<HTMLElement> & { variant?: string; value?: string; 'default-value'?: string; disabled?: boolean; theme?: string };
      'kai-tooltip': JSX.HTMLAttributes<HTMLElement> & { content?: string; 'open-delay'?: number | string };
      'kai-separator': JSX.HTMLAttributes<HTMLElement> & { orientation?: string };
    }
  }
}

const meta = { title: 'Labs/Apps', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;
type El = HTMLElement & Record<string, unknown>;

type Device = 'desktop' | 'tablet' | 'mobile';

// --- Left chat fixtures -----------------------------------------------------

// The agent's build plan, as kai-tasks in PROGRESS (checklist) mode.
const PLAN = {
  mode: 'progress',
  heading: 'Plan',
  tasks: [
    { id: 'scaffold', label: 'Scaffold the Vite + React + Tailwind project', checked: true },
    { id: 'layout', label: 'Build the app shell (sidebar + top bar)', checked: true },
    { id: 'kpis', label: 'Add the KPI stat cards', checked: true },
    { id: 'chart', label: 'Wire the revenue chart to mock data', checked: false },
    { id: 'table', label: 'Build the recent-customers table', checked: false },
  ],
};

// The streamed build log: file actions the agent took. Hand-built layout (the
// "Worked for 38s" disclosure Lovable shows under each turn).
const BUILD_STEPS = [
  { verb: 'Created', file: 'src/App.tsx' },
  { verb: 'Created', file: 'src/components/Sidebar.tsx' },
  { verb: 'Created', file: 'src/components/StatCard.tsx' },
  { verb: 'Created', file: 'src/components/RevenueChart.tsx' },
  { verb: 'Installed', file: 'recharts, lucide-react' },
  { verb: 'Edited', file: 'src/index.css' },
];

const AGENT_INTRO = `I'll build **Helm**, a SaaS analytics dashboard. It needs an app shell with a sidebar, a row of KPI cards, a revenue chart, and a recent-customers table. Here's the plan:`;

const AGENT_DONE = `Helm is live - the preview on the right is the running app. It's responsive, so try the device toggle. Want me to wire the chart to a real data source, or add a date-range filter?`;

// --- Code tab fixtures ------------------------------------------------------

const FILES: FileTreeFile[] = [
  { path: 'index.html' },
  { path: 'package.json' },
  { path: 'src/main.tsx' },
  { path: 'src/App.tsx' },
  { path: 'src/index.css' },
  { path: 'src/components/Sidebar.tsx' },
  { path: 'src/components/StatCard.tsx', status: 'added' },
  { path: 'src/components/RevenueChart.tsx', status: 'added' },
  { path: 'src/components/CustomersTable.tsx' },
  { path: 'src/lib/data.ts' },
];

const CODE_MD = `\`\`\`tsx
// src/components/StatCard.tsx
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  delta: number;
  icon: LucideIcon;
}

export function StatCard({ label, value, delta, icon: Icon }: StatCardProps) {
  const up = delta >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className={up ? 'text-emerald-600' : 'text-red-600'}>
        {up ? '+' : ''}{delta}% vs last month
      </div>
    </div>
  );
}
\`\`\``;

// --- Dashboard (the running app) fixtures -----------------------------------

const APP_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, active: true },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const KPIS = [
  { label: 'Revenue', value: '$48,250', delta: 12.4, up: true, icon: DollarSign },
  { label: 'Active users', value: '3,914', delta: 8.1, up: true, icon: Users },
  { label: 'Orders', value: '1,284', delta: 3.2, up: true, icon: ShoppingCart },
  { label: 'Churn', value: '1.8%', delta: 0.4, up: false, icon: Activity },
];

const REVENUE = [12, 18, 15, 22, 26, 24, 31, 29, 35, 38, 34, 42];
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

interface Customer { name: string; email: string; initials: string; plan: string; mrr: string; ok: boolean }
const CUSTOMERS: Customer[] = [
  { name: 'Ada Reyes', email: 'ada@northwind.io', initials: 'AR', plan: 'Pro', mrr: '$240', ok: true },
  { name: 'Tom Okafor', email: 'tom@acme.co', initials: 'TO', plan: 'Team', mrr: '$960', ok: true },
  { name: 'Mira Patel', email: 'mira@lumen.app', initials: 'MP', plan: 'Free', mrr: '$0', ok: false },
  { name: 'Jon Vega', email: 'jon@parcel.dev', initials: 'JV', plan: 'Pro', mrr: '$240', ok: true },
];

// The composer's Default/Chat/Agent mode menu.
const MODES = [
  { id: 'agent', label: 'Agent', icon: 'sparkles', checked: true },
  { id: 'chat', label: 'Chat', icon: 'message-circle' },
  { id: 'default', label: 'Default', icon: 'box' },
];
const PROJECTS = [
  { id: 'helm', label: 'helm-analytics', icon: 'box', checked: true },
  { id: 'crm', label: 'orbit-crm', icon: 'box' },
  { id: 'shop', label: 'tiny-storefront', icon: 'box' },
  { separator: true },
  { id: 'new', label: 'New project', icon: 'plus' },
];

const DEVICE_W: Record<Device, string> = { desktop: '100%', tablet: '834px', mobile: '390px' };

// Build the line + area path for the revenue chart over a w x h box.
function chartPaths(values: number[], w: number, h: number) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => [i * stepX, h - ((v - min) / span) * (h - 8) - 4] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return { line, area, pts };
}

// One KPI stat card (the dashboard's own component, mocked).
function StatCard(props: { kpi: typeof KPIS[number] }) {
  const Icon = props.kpi.icon;
  return (
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-muted-foreground">{props.kpi.label}</span>
        <Icon class="size-4 text-muted-foreground" />
      </div>
      <div class="mt-2 text-2xl font-semibold tracking-tight text-foreground">{props.kpi.value}</div>
      <div class={["mt-1 flex items-center gap-1 text-xs font-medium", { 'text-tool-green': props.kpi.up, 'text-tool-red': !props.kpi.up }]}>
        {props.kpi.up ? <TrendingUp class="size-3.5" /> : <TrendingDown class="size-3.5" />}
        {props.kpi.up ? '+' : '-'}{props.kpi.delta}%
        <span class="text-muted-foreground font-normal">vs last month</span>
      </div>
    </div>
  );
}

// The RUNNING APP rendered inside the preview viewport: a SaaS analytics
// dashboard. Responds to the device toggle via `narrow` (mobile stacks + hides
// the app's own sidebar). Everything is token-driven, so it tracks light/dark.
function HelmApp(props: { narrow: boolean }) {
  const chart = chartPaths(REVENUE, 600, 150);
  return (
    <div class="flex min-h-full bg-background text-foreground">
      {/* the app's OWN sidebar (hidden on mobile) */}
      <Show when={!props.narrow}>
        <aside class="flex w-52 shrink-0 flex-col border-r border-border bg-card/40 p-3">
          <div class="mb-4 flex items-center gap-2 px-1.5">
            <span class="grid size-7 place-items-center rounded-lg text-white" style={{ background: 'linear-gradient(135deg,#ff7a59,#ff4d6d)' }}>
              <Activity class="size-4" />
            </span>
            <span class="text-sm font-semibold tracking-tight">Helm</span>
          </div>
          <nav class="flex flex-col gap-0.5">
            <For each={APP_NAV}>
              {(item) => {
                const Icon = item.icon;
                return (
                  <a
                    class={["flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors", {
                      'bg-muted font-medium text-foreground': !!item.active, // V2-PORT: ClassValue wants boolean
                      'text-muted-foreground hover:bg-muted/60': !item.active,
                    }]}
                   
                  >
                    <Icon class="size-4" /> {item.label}
                  </a>
                );
              }}
            </For>
          </nav>
        </aside>
      </Show>

      <div class="flex min-w-0 flex-1 flex-col">
        {/* the app's own top bar */}
        <header class="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <Show when={props.narrow}>
            <span class="grid size-7 place-items-center rounded-lg text-white" style={{ background: 'linear-gradient(135deg,#ff7a59,#ff4d6d)' }}>
              <Activity class="size-4" />
            </span>
          </Show>
          <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-sm text-muted-foreground">
            <Search class="size-4 shrink-0" />
            <span class="truncate">Search</span>
          </div>
          <button aria-label="Notifications" class="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
            <Bell class="size-4" />
          </button>
          <div class="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">RT</div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <div class="mb-5 flex items-end justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold tracking-tight">Dashboard</h1>
              <p class="text-sm text-muted-foreground">Your revenue and growth at a glance.</p>
            </div>
            <button class="hidden items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium sm:flex">
              Last 12 months
            </button>
          </div>

          {/* KPI cards */}
          <div class={["grid gap-3", { 'grid-cols-1': props.narrow, 'grid-cols-2 lg:grid-cols-4': !props.narrow }]}>
            <For each={KPIS}>{(kpi) => <StatCard kpi={kpi} />}</For>
          </div>

          {/* chart + traffic */}
          <div class={["mt-3 grid gap-3", { 'grid-cols-1': props.narrow, 'grid-cols-3': !props.narrow }]}>
            <div class={["rounded-xl border border-border bg-card p-4", { 'col-span-2': !props.narrow }]}>
              <div class="mb-3 flex items-center justify-between">
                <div class="text-sm font-semibold">Revenue over time</div>
                <span class="text-xs font-medium text-tool-green">+12.4%</span>
              </div>
              <svg viewBox="0 0 600 150" class="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Revenue trend">
                <defs>
                  <linearGradient id="helm-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ff4d6d" stop-opacity="0.28" />
                    <stop offset="100%" stop-color="#ff4d6d" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <path d={chart.area} fill="url(#helm-fill)" />
                <path d={chart.line} fill="none" stroke="#ff4d6d" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
                <For each={chart.pts}>{(p) => <circle cx={p[0]} cy={p[1]} r="3" fill="#ff4d6d" />}</For>
              </svg>
              <div class="mt-1 flex justify-between px-0.5 text-[0.625rem] text-muted-foreground">
                <For each={MONTHS}>{(m) => <span>{m}</span>}</For>
              </div>
            </div>

            <div class="rounded-xl border border-border bg-card p-4">
              <div class="mb-3 text-sm font-semibold">Traffic sources</div>
              <div class="flex flex-col gap-2.5">
                <For each={[['Organic', 52, '#ff4d6d'], ['Direct', 28, '#ff7a59'], ['Referral', 14, '#fbbf24'], ['Social', 6, '#94a3b8']] as const}>
                  {([name, pct, color]) => (
                    <div class="flex flex-col gap-1">
                      <div class="flex justify-between text-xs">
                        <span class="text-muted-foreground">{name}</span>
                        <span class="font-medium tabular-nums">{pct}%</span>
                      </div>
                      <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div class="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* recent customers table */}
          <div class="mt-3 rounded-xl border border-border bg-card">
            <div class="flex items-center justify-between border-b border-border px-4 py-3">
              <div class="text-sm font-semibold">Recent customers</div>
              <a class="text-xs font-medium text-muted-foreground hover:text-foreground">View all</a>
            </div>
            <div class="divide-y divide-border">
              <For each={CUSTOMERS}>
                {(c) => (
                  <div class="flex items-center gap-3 px-4 py-2.5">
                    <kai-avatar fallback={c.initials} size="sm"></kai-avatar>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-medium">{c.name}</div>
                      <div class="truncate text-xs text-muted-foreground">{c.email}</div>
                    </div>
                    <Show when={!props.narrow}>
                      <kai-badge variant={c.plan === 'Free' ? 'outline' : 'secondary'}>{c.plan}</kai-badge>
                    </Show>
                    <div class="w-14 text-right text-sm font-medium tabular-nums">{c.mrr}</div>
                    <span class={["size-2 shrink-0 rounded-full", { 'bg-tool-green': c.ok, 'bg-tool-red': !c.ok }]}></span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Lovable: Story = {
  name: 'Lovable',
  render: () => {
    const [tab, setTab] = createSignal<'preview' | 'code'>('preview');
    const [device, setDevice] = createSignal<Device>('desktop');
    const [loading, setLoading] = createSignal(false);

    const reload = () => {
      setLoading(true);
      window.setTimeout(() => setLoading(false), 650);
    };

    const TABS: KaiTabItem[] = [
      { id: 'preview', label: 'Preview', icon: 'globe' },
      { id: 'code', label: 'Code', icon: 'code' },
    ];

    const DEVICES: { id: Device; label: string; Icon: typeof Monitor }[] = [
      { id: 'desktop', label: 'Desktop', Icon: Monitor },
      { id: 'tablet', label: 'Tablet', Icon: Tablet },
      { id: 'mobile', label: 'Mobile', Icon: Smartphone },
    ];

    // Array/object props (and event wiring) are applied in each element's ref
    // callback, NOT a one-shot onSettled, so they survive remounts (the preview /
    // code panels live inside <Show> and remount on tab switch).
    return (
      <div class="flex h-screen flex-col bg-background text-foreground">
        {/* Brand-tint the Publish button through kai-button's documented ::part(button)
            hook, with Lovable's coral->pink gradient. A thin reload bar animates the
            preview refresh. */}
        <style>{`
          .lov-publish::part(button){ background:linear-gradient(135deg,#ff7a59,#ff4d6d); color:#fff; border-color:transparent; }
          @keyframes lov-load { 0%{transform:translateX(-100%)} 100%{transform:translateX(450%)} }
          .lov-loadbar{ animation:lov-load .65s ease-in-out infinite; }
        `}</style>

        {/* TOP BAR: brand + project switcher (left); GitHub / Invite / Publish / avatar (right). */}
        <header class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div class="flex items-center gap-2">
            <svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
              <defs>
                <linearGradient id="lov-heart" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#ff7a59" />
                  <stop offset="100%" stop-color="#ff4d6d" />
                </linearGradient>
              </defs>
              <path fill="url(#lov-heart)" d="M12 21s-7.5-4.6-10-9.2C.5 8.6 2 5.2 5.2 5c2 .1 3.3 1.2 4.8 3 1.5-1.8 2.8-2.9 4.8-3 3.2.2 4.7 3.6 3.2 6.8C19.5 16.4 12 21 12 21z" />
            </svg>
            <span class="text-[0.9375rem] font-semibold tracking-tight">Lovable</span>
            <kai-separator orientation="vertical" class="mx-1 h-5"></kai-separator>
            <kai-menu
              ref={(el) => { (el as El).items = PROJECTS; }}
              trigger-icon="box"
              trigger-label="helm-analytics"
              trigger-icon-trailing="chevron-down"
              label="Switch project"
            ></kai-menu>
          </div>
          <div class="flex items-center gap-1.5">
            <kai-tooltip content="Connect to GitHub">
              <kai-button variant="ghost" size="icon-sm" icon="github" label="Connect to GitHub"></kai-button>
            </kai-tooltip>
            <kai-button variant="outline" size="sm"><Users slot="icon" class="size-4" />Invite</kai-button>
            <kai-button class="lov-publish" variant="default" size="sm"><Rocket slot="icon" class="size-4" />Publish</kai-button>
            <kai-avatar fallback="RT" size="sm"></kai-avatar>
          </div>
        </header>

        {/* BODY: the split shell. Chat column (left) + live preview (right). */}
        <div class="flex min-h-0 flex-1">
          {/* LEFT: the conversation, with the composer pinned at the bottom. */}
          <section class="flex w-[400px] shrink-0 flex-col border-r border-border">
            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div class="flex flex-col gap-4">
                {/* user prompt bubble */}
                <div class="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-muted px-3.5 py-2.5 text-sm">
                  Build a SaaS analytics dashboard with KPI cards, a revenue chart, and a recent-customers table.
                </div>

                {/* agent turn: prose + plan + build log */}
                <div class="flex flex-col gap-3">
                  <kai-message
                    ref={(el) => {
                      const m = el as El;
                      m.message = { id: 'lovable-intro', role: 'assistant', parts: [{ type: 'text', text: AGENT_INTRO }] };
                      m.avatar = 'none';
                    }}
                    style={{ display: 'block' }}
                  ></kai-message>

                  {/* The plan is display-only here: readonly drops the toggle/pointer
                      affordances so the checklist reads as a status, not a control. */}
                  <kai-tasks ref={(el) => { const t = el as El; t.data = PLAN; t.readonly = true; }}></kai-tasks>

                  {/* the streamed build log (Lovable's "Worked for Ns" disclosure) */}
                  <div class="rounded-xl border border-border bg-muted/30 p-3">
                    <div class="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Sparkles class="size-3.5" style={{ color: '#ff4d6d' }} />
                      Building Helm
                      <span class="ml-auto tabular-nums">Worked for 38s</span>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <For each={BUILD_STEPS}>
                        {(s) => (
                          <div class="flex items-center gap-2 text-xs">
                            <CircleCheck class="size-3.5 shrink-0 text-tool-green" />
                            <span class="text-muted-foreground">{s.verb}</span>
                            <code class="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem]">{s.file}</code>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </div>

                {/* final agent turn + the checkpoint/version controls */}
                <div class="flex flex-col gap-2.5">
                  <kai-message
                    ref={(el) => {
                      const m = el as El;
                      m.message = { id: 'lovable-done', role: 'assistant', parts: [{ type: 'text', text: AGENT_DONE }] };
                      m.avatar = 'none';
                    }}
                    style={{ display: 'block' }}
                  ></kai-message>
                  <div class="flex items-center gap-2">
                    <kai-badge variant="secondary">v1</kai-badge>
                    <span class="text-xs text-muted-foreground">Checkpoint saved</span>
                    <kai-button variant="ghost" size="sm" icon="rotate-cw" class="ml-auto">Restore</kai-button>
                  </div>
                </div>
              </div>
            </div>

            {/* composer pinned at the bottom */}
            <div class="shrink-0 border-t border-border p-3">
              <kai-prompt-input
                ref={(el) => { (el as El).attach = false; }}
                placeholder="Ask Lovable to make changes..."
              >
                <div slot="toolbar-start" class="flex items-center gap-1.5">
                  <kai-menu
                    ref={(el) => { (el as El).items = MODES; }}
                    trigger-icon="sparkles"
                    trigger-label="Agent"
                    trigger-icon-trailing="chevron-down"
                    label="Mode"
                  ></kai-menu>
                  <kai-tooltip content="Attach">
                    <kai-button variant="ghost" size="icon-sm" label="Attach"><Paperclip slot="icon" class="size-4" /></kai-button>
                  </kai-tooltip>
                </div>
              </kai-prompt-input>
            </div>
          </section>

          {/* RIGHT: the live preview, wrapped in browser chrome. */}
          <section class="flex min-w-0 flex-1 flex-col bg-muted/30">
            {/* preview toolbar */}
            <div class="flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-2">
              <kai-tooltip content="Refresh">
                <kai-button ref={(el) => { el.addEventListener('kai-click', reload); }} variant="ghost" size="icon-sm" label="Refresh"><RotateCw slot="icon" class="size-4" /></kai-button>
              </kai-tooltip>

              {/* device toggle (segmented) */}
              <div class="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                <For each={DEVICES}>
                  {(d) => (
                    <kai-tooltip content={d.label}>
                      <kai-button
                        ref={(el) => { el.addEventListener('kai-click', () => setDevice(d.id)); }}
                        variant={device() === d.id ? 'secondary' : 'ghost'}
                        size="icon-sm"
                        label={d.label}
                      ><d.Icon slot="icon" class="size-4" /></kai-button>
                    </kai-tooltip>
                  )}
                </For>
              </div>

              {/* URL bar */}
              <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
                <Lock class="size-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate font-mono text-xs text-muted-foreground">preview--helm-analytics.lovable.app</span>
              </div>

              <kai-tooltip content="Open in new tab">
                <kai-button variant="ghost" size="icon-sm" label="Open in new tab"><ExternalLink slot="icon" class="size-4" /></kai-button>
              </kai-tooltip>

              {/* Preview / Code */}
              <kai-tabs
                ref={(el) => {
                  const t = el as El;
                  t.items = TABS; t.defaultValue = 'preview';
                  el.addEventListener('kai-tab-change', (e) => setTab((e as CustomEvent).detail.value));
                }}
                variant="segmented"
              ></kai-tabs>
            </div>

            {/* preview canvas */}
            <div class="relative min-h-0 flex-1 overflow-auto p-4">
              {/* reload bar */}
              <Show when={loading()}>
                <div class="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
                  <div class="lov-loadbar h-full w-1/4" style={{ background: 'linear-gradient(90deg,#ff7a59,#ff4d6d)' }}></div>
                </div>
              </Show>

              <Show when={tab() === 'preview'}>
                <div class="mx-auto h-full transition-all duration-300" style={{ 'max-width': DEVICE_W[device()] }}>
                  <div class="h-full overflow-hidden rounded-xl border border-border bg-background shadow-sm ring-1 ring-black/5">
                    <Show when={!loading()} fallback={<div class="grid h-full place-items-center text-sm text-muted-foreground">Reloading...</div>}>
                      <HelmApp narrow={device() === 'mobile'} />
                    </Show>
                  </div>
                </div>
              </Show>

              <Show when={tab() === 'code'}>
                <div class="mx-auto flex h-full max-w-4xl gap-3">
                  <div class="w-56 shrink-0 overflow-hidden rounded-xl border border-border bg-background">
                    <kai-file-tree ref={(el) => { (el as El).files = FILES; }}></kai-file-tree>
                  </div>
                  <div class="min-w-0 flex-1 overflow-auto rounded-xl border border-border bg-background p-4">
                    <kai-message
                      ref={(el) => {
                        const m = el as El;
                        m.message = { id: 'lovable-code', role: 'assistant', parts: [{ type: 'text', text: CODE_MD }] };
                        m.avatar = 'none';
                      }}
                      style={{ display: 'block' }}
                    ></kai-message>
                  </div>
                </div>
              </Show>
            </div>
          </section>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'html',
        // A representative skeleton (not the full interactive render). The shape is
        // the builder SPLIT SHELL: a top bar, a left chat column (agent plan + build
        // log + composer), and a right live PREVIEW wrapped in browser chrome
        // (device toggle, URL bar, Preview/Code) rendering a running app.
        code: `<!-- TOP BAR: brand + project switcher (left); GitHub / Invite / Publish / avatar (right) -->
<header>
  <svg><!-- coral->pink heart --></svg> Lovable
  <kai-menu trigger-icon="box" trigger-label="helm-analytics" trigger-icon-trailing="chevron-down"></kai-menu>
  <kai-button icon="github" label="Connect to GitHub"></kai-button>
  <kai-button variant="outline"><svg slot="icon"></svg>Invite</kai-button>
  <kai-button class="lov-publish"><svg slot="icon"></svg>Publish</kai-button>  <!-- ::part(button) brand gradient -->
  <kai-avatar fallback="RT"></kai-avatar>
</header>

<!-- SPLIT SHELL -->
<div class="split">
  <!-- LEFT: the conversation + the composer -->
  <section class="chat">
    <div class="user-bubble">Build a SaaS analytics dashboard with KPI cards, a chart, and a customers table.</div>
    <kai-message><!-- agent prose, message set as a property --></kai-message>
    <kai-tasks><!-- the build plan: data = { mode:'progress', tasks:[...] } --></kai-tasks>
    <div class="build-log"><!-- Created src/App.tsx, Created StatCard.tsx, ... --></div>
    <kai-message><!-- "Helm is live - preview it on the right." --></kai-message>
    <kai-badge variant="secondary">v1</kai-badge> Checkpoint saved
    <kai-button variant="ghost" icon="rotate-cw">Restore</kai-button>

    <!-- composer pinned at the bottom -->
    <kai-prompt-input placeholder="Ask Lovable to make changes...">
      <div slot="toolbar-start">
        <kai-menu trigger-icon="sparkles" trigger-label="Agent" trigger-icon-trailing="chevron-down"></kai-menu>
        <kai-button size="icon-sm" label="Attach"><svg slot="icon"></svg></kai-button>
      </div>
    </kai-prompt-input>
  </section>

  <!-- RIGHT: live preview wrapped in browser chrome -->
  <section class="preview">
    <div class="toolbar">
      <kai-button size="icon-sm" label="Refresh"><svg slot="icon"></svg></kai-button>
      <!-- device toggle: active = variant="secondary", others ghost -->
      <kai-button label="Desktop"><svg slot="icon"></svg></kai-button>
      <kai-button label="Tablet"><svg slot="icon"></svg></kai-button>
      <kai-button label="Mobile"><svg slot="icon"></svg></kai-button>
      <div class="urlbar"><svg><!-- lock --></svg> preview--helm-analytics.lovable.app</div>
      <kai-button label="Open in new tab"><svg slot="icon"></svg></kai-button>
      <kai-tabs variant="segmented"><!-- Preview / Code --></kai-tabs>
    </div>

    <!-- Preview tab: the running app (a token-styled dashboard) inside a viewport
         sized by the device toggle. Code tab: kai-file-tree + a highlighted source. -->
    <div class="viewport"><!-- HelmApp: sidebar + KPI cards + revenue chart + customers table --></div>
    <kai-file-tree></kai-file-tree>
    <kai-message><!-- the Code tab source, a fenced \`\`\`tsx block --></kai-message>
  </section>
</div>

<style>
  /* brand-tint Publish via kai-button's ::part(button) */
  .lov-publish::part(button){ background:linear-gradient(135deg,#ff7a59,#ff4d6d); color:#fff }
</style>

<script type="module">
  // Array/object props are JS properties (the kai- contract); scalars are attributes.
  document.querySelector('kai-prompt-input').attach = false;
  document.querySelector('kai-tasks').data = { mode:'progress', heading:'Plan', tasks:[/* { id, label, checked } */] };
  document.querySelector('kai-message').message = {
    id: 'intro', role: 'assistant',
    parts: [{ type: 'text', text: "I'll build **Helm**, a SaaS analytics dashboard..." }],
  };
  document.querySelector('kai-tabs').items = [{ id:'preview', label:'Preview' }, { id:'code', label:'Code' }];
  document.querySelector('kai-file-tree').files = [{ path:'src/App.tsx' }, /* ... */];
  // Interactions: tabs swap Preview/Code; the device toggle resizes the viewport; refresh replays a reload bar.
</script>`,
      },
    },
  },
};
