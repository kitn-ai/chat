import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, createEffect, Show, For, Switch, Match, onMount, onCleanup, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  Bot, Terminal, FlaskConical, BookText, Boxes, Sparkles, ShieldCheck, Database,
  Megaphone, Bell, Globe, Search, Keyboard,
  X, Plus, Maximize2, Minimize2,
  Folder, GitBranch, Cloud, Laptop, Layers,
  type LucideProps,
} from 'lucide-solid';
import './register'; // every kai-* element used below
import { type AgentStatus, type AgentStatusTone } from '../ui/agent-card';
import { cn } from '../utils/cn';
import type { KaiNavItem } from '../ui/nav';
import type { KaiCommandItem } from './command';
import { toast, configureToasts } from '../primitives/toast-store';

// Labs/Apps: AMUX — a full multi-agent workspace. A desktop shell with a LEFT
// workspace rail (kai-nav) and a TOP-LEVEL view toggle — AGENTS or BROWSER — that
// fills the rest of the screen. AGENTS is the view-mode area the operator switches
// between three tiers; BROWSER is a FULL-SCREEN kai-artifact (address bar /
// back-forward / reload / displayUrl) with a hand-rolled preview TAB STRIP above
// it, one tab per open preview (composition, not a monolith).
//
// The problem this models: one human navigating MANY WORKSPACES (projects) ×
// MANY AGENTS within each, keyboard-first AND mouse-friendly. Two nav levels —
// WORKSPACE (the left rail) and AGENT (the editor-group) — and both are reachable
// from the keyboard and the command palette. The browser is full-screen, never
// tiled: a tiny tiled preview is useless, so previews get the whole canvas.
//
// The center is driven by a `Segmented` view switcher over a `view` signal:
//   • WORKSPACE — a 2-level editor-group split (Zed/VSCode/tmux WINDOW TILING): a
//                 row of resizable COLUMNS; each column is a vertical stack of one
//                 or more resizable GROUPS (rows); each group = a TAB STRIP + the
//                 active agent's `Pane`. Columns/groups are LAYOUT regions, never
//                 status lanes. The default tier.
//   • FOCUS     — one large `Pane` (the focused agent) beside a vertical RAIL of
//                 `AgentCard`s; clicking a card promotes it to focus.
//   • LIST      — a full-width column of `AgentCard`s for scanning many agents.
//
// Editor-group tabs use a SPACE-EFFICIENT design: each tab leads with a small
// tone-colored badge carrying the agent's keyboard NUMBER — the color encodes
// status, the digit is the ⌥-jump key, unifying status + hint into one element.
// The status WORD shows on the active tab + on hover (and always for needs-you /
// error). A per-tab "…" menu moves/splits the pane; an "×" closes it.
//
// Keyboard backbone (browser-safe — no Cmd/Ctrl+number, which browsers reserve):
//   • Cmd/Ctrl+K        opens the kai-command palette (both nav levels).
//   • Alt/Option+1..8   jumps to agent N: focuses its pane + its prompt input.
//   • Alt/Option+Z      zooms / restores the focused pane (Esc also restores).
//   • Alt/Option+B      toggles the top-level AGENTS / BROWSER view.
// Number keys read `event.code` (Digit1…Digit8) so macOS Option-glyphs never leak.
//
// Attention routing surfaces "who needs you": a header count pill that jumps to
// the first waiting agent, an amber edge on the agents awaiting input, and a
// "Needs you first" sort toggle. A broadcast composer ("Message all agents") opens
// from the header. The top-level rail | center split is a real kai-resizable; the
// 2-level editor-group is a hand-rolled flex layout with draggable dividers on
// BOTH axes — between columns (horizontal) and between stacked groups within a
// column (vertical) — since kai-resizable can't express the nested N×M tiling.

// kai-resizable / kai-resizable-item / kai-artifact are used here as JSX elements;
// the other kai-* tags are declared (identically) by sibling story files.
// TypeScript MERGES identical global augmentations, so each shared declaration is
// copied byte-for-byte from its canonical sibling (chatgpt.stories.tsx /
// codex.stories.tsx / t3code.stories.tsx) or it errors TS2717.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-resizable': JSX.HTMLAttributes<HTMLElement> & { orientation?: string };
      'kai-resizable-item': JSX.HTMLAttributes<HTMLElement> & {
        size?: string;
        min?: string;
        max?: string;
        locked?: boolean | string;
        hidden?: boolean | string;
        collapsed?: boolean | string;
      };
      'kai-artifact': JSX.HTMLAttributes<HTMLElement> & { expandable?: boolean; standalone?: boolean };
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-nav': JSX.HTMLAttributes<HTMLElement> & { value?: string; 'default-value'?: string; theme?: string };
      'kai-badge': JSX.HTMLAttributes<HTMLElement> & { variant?: string };
      'kai-status': JSX.HTMLAttributes<HTMLElement> & { status?: string; pulse?: boolean; label?: string; size?: string; theme?: string };
      'kai-message': JSX.HTMLAttributes<HTMLElement>;
      'kai-prompt-input': JSX.HTMLAttributes<HTMLElement> & { theme?: string; placeholder?: string; loading?: boolean; disabled?: boolean; voice?: boolean; search?: boolean; attach?: boolean; submit?: string; 'suggestion-mode'?: string };
      'kai-file-tree': JSX.HTMLAttributes<HTMLElement>;
      'kai-tabs': JSX.HTMLAttributes<HTMLElement> & { variant?: string; value?: string; 'default-value'?: string; disabled?: boolean; theme?: string };
      'kai-tooltip': JSX.HTMLAttributes<HTMLElement> & { content?: string; 'open-delay'?: number | string };
      'kai-separator': JSX.HTMLAttributes<HTMLElement> & { orientation?: string };
      'kai-command': JSX.HTMLAttributes<HTMLElement> & { placeholder?: string; 'empty-label'?: string; theme?: string };
      'kai-dialog': JSX.HTMLAttributes<HTMLElement> & { open?: boolean };
      'kai-kbd': JSX.HTMLAttributes<HTMLElement> & { keys?: string; platform?: string; size?: string; theme?: string };
      'kai-editable-label': JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        editing?: boolean;
        placeholder?: string;
        disabled?: boolean;
        theme?: string;
      };
    }
  }
}

const meta = { title: 'Labs/Apps', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;
type El = HTMLElement & Record<string, unknown>;

// ── Left rail: workspaces with counts ───────────────────────────────────────
// kai-nav is a flat list; `meta` renders the right-aligned muted count. A
// `warning`-tone `status` dot (amber, pulsing) flags a workspace whose agents are
// waiting on you — the same attention vocabulary the Pane/AgentCard treatment uses
// — so you can spot which workspace needs you without opening it. The amber dot
// sits beside the neutral count, not in place of it. The current workspace ("Acme
// App") holds Cleo + Nova (both needsAttention); "Mobile App" carries one too to
// show the indicator on more than one row.
const ATTENTION_STATUS = { tone: 'warning', pulse: true } as const;
const WORKSPACES: KaiNavItem[] = [
  { id: 'acme', label: 'Acme App', status: ATTENTION_STATUS, meta: '8' },
  { id: 'side', label: 'Side Project', meta: '8' },
  { id: 'marketing', label: 'Marketing Site', meta: '3' },
  { id: 'docs', label: 'Docs Portal', meta: '5' },
  { id: 'mobile', label: 'Mobile App', status: ATTENTION_STATUS, meta: '2' },
  { id: 'playground', label: 'Playground', meta: '4' },
];
const WORKSPACE_LABEL = new Map(WORKSPACES.map((w) => [w.id, w.label ?? w.id]));

const SAMPLE_FILES = [
  { path: 'src/index.ts' },
  { path: 'src/server.ts' },
  { path: 'src/routes/checkout.ts' },
  { path: 'src/routes/orders.ts' },
  { path: 'src/lib/db.ts' },
  { path: 'src/lib/stripe.ts' },
  { path: 'tests/checkout.test.ts' },
  { path: 'package.json' },
  { path: 'README.md' },
];

// ── The agent fleet ─────────────────────────────────────────────────────────
// One model shared by every view: the same status vocabulary the `Pane` and
// `AgentCard` primitives consume (working | idle | done | error | blocked).
interface Agent {
  id: string;
  name: string;
  role: string;
  glyph: (p: LucideProps) => JSX.Element;
  status: AgentStatus;
  lastLine: string;
  /** Awaiting the operator — raises the attention treatment everywhere. */
  needsAttention?: boolean;
  /** Terminal-style markdown shown in the pane body. */
  body: string;
  /** Working context surfaced in the per-pane context bar (only what's present shows). */
  dir?: string;
  branch?: string;
  runtime?: { kind: 'local' | 'remote'; host?: string };
}

const AGENTS: Agent[] = [
  {
    id: 'atlas', name: 'Atlas', role: 'Orchestrator', glyph: Bot,
    dir: 'api', branch: 'feat/checkout-refactor', runtime: { kind: 'local' },
    status: { tone: 'working', label: 'Running', pulse: true },
    lastLine: 'Dispatched 5 agents on the checkout refactor',
    body: 'Fanning the checkout refactor out to the fleet and watching every diff.\n\n```bash\n$ atlas dispatch --plan checkout\n→ otto · ivy · cleo · cy · rex\n5 agents running\n```',
  },
  {
    id: 'otto', name: 'Otto', role: 'Backend', glyph: Terminal,
    dir: 'api', branch: 'feat/orders-split', runtime: { kind: 'remote', host: 'sandbox-1' },
    status: { tone: 'working', label: 'Migrating', pulse: true },
    lastLine: 'Applied 3 migrations cleanly',
    body: 'Applying the schema migration for the split orders table.\n\n```bash\n$ npm run db:migrate\n✓ 0003_orders_split.sql\n✓ 0004_payment_intents.sql\n✓ 0005_drop_legacy.sql\n```',
  },
  {
    id: 'ivy', name: 'Ivy', role: 'Tests', glyph: FlaskConical,
    dir: 'api', branch: 'feat/orders-split', runtime: { kind: 'remote', host: 'ci-runner' },
    status: { tone: 'done', label: 'Green' },
    lastLine: '142 tests passing after the change',
    body: 'Suite is green after the change.\n\n```bash\n$ vitest run\n✓ 142 passed (2.1s)\n```',
  },
  {
    id: 'cleo', name: 'Cleo', role: 'Docs', glyph: BookText,
    dir: 'docs', branch: 'feat/checkout-guide', runtime: { kind: 'local' },
    status: { tone: 'blocked', label: 'Waiting for input' },
    needsAttention: true,
    lastLine: 'Which provider should the guide target?',
    body: 'The checkout guide needs a provider example before I can finish.\n\n> Which provider should the auth section target — Stripe or the in-house gateway?\n\nWaiting on your call.',
  },
  {
    id: 'dara', name: 'Dara', role: 'Infra', glyph: Boxes,
    dir: 'infra', branch: 'main', runtime: { kind: 'remote', host: 'sandbox-2' },
    status: { tone: 'idle', label: 'Idle' },
    lastLine: 'Holding for a green build',
    body: 'Holding for a green build before I touch the staging deploy.\n\n```bash\n$ # standing by for ivy\n```',
  },
  {
    id: 'cy', name: 'Cy', role: 'Frontend', glyph: Sparkles,
    dir: 'web', branch: 'feat/cart-endpoint', runtime: { kind: 'local' },
    status: { tone: 'working', label: 'Building', pulse: true },
    lastLine: 'Wired the cart to the new endpoint',
    body: 'Cart UI is wired to the new endpoint.\n\n```tsx\nconst { mutate } = useCheckout();\nawait mutate(cartId);\n```',
  },
  {
    id: 'rex', name: 'Rex', role: 'Security', glyph: ShieldCheck,
    dir: 'api', branch: 'feat/checkout-refactor', runtime: { kind: 'local' },
    status: { tone: 'error', label: '2 findings' },
    lastLine: '2 high-severity findings block merge',
    body: 'Security scan found issues that block the merge.\n\n```bash\n$ npm audit --production\n2 high severity findings\n```',
  },
  {
    id: 'nova', name: 'Nova', role: 'Data', glyph: Database,
    dir: 'infra', branch: 'feat/prod-backfill', runtime: { kind: 'remote', host: 'sandbox-2' },
    status: { tone: 'blocked', label: 'Awaiting your review' },
    needsAttention: true,
    lastLine: 'Approve the production backfill?',
    body: 'The production backfill is staged and ready.\n\n> Approve running the backfill against prod? It rewrites ~120k rows.\n\nAwaiting approval.',
  },
];

// ── Editor-group model (2-level: columns × rows) ─────────────────────────────
// WINDOW TILING, not a kanban. A `Column` is a LAYOUT region: a vertical stack of
// one or more `Group`s (rows). A `Group` is one editor group — an ordered set of
// agent tabs plus the active one. The workspace renders `columns()` left → right
// and, inside each column, its groups top → bottom. Tab "…" actions, the
// "+ New column" affordance, the column close, and the palette mutate this model
// (split right / split down · move · close), dropping empty GROUPS and empty
// COLUMNS and keeping every `activeId` + the focus valid. Columns/groups are
// never organized BY status.
interface Group {
  id: string;
  agentIds: string[];
  activeId: string;
}
interface Column {
  id: string;
  groups: Group[];
}

// A resolved tab drop target, computed live on pointermove:
//   tabs   → insert into `groupId` before `beforeId` (null = append) — reorder or cross-group move
//   center → move into `groupId`
//   edge   → DRAG-TO-SPLIT off that side of `groupId` (left/right = new column, top/bottom = new row)
type DropZone =
  | { kind: 'tabs'; groupId: string; beforeId: string | null }
  | { kind: 'center'; groupId: string }
  | { kind: 'edge'; groupId: string; edge: 'left' | 'right' | 'top' | 'bottom' };
interface DragState {
  agentId: string;
  x: number;
  y: number;
  target?: DropZone;
}

let colSeq = 0;
let groupSeq = 0;
let agentSeq = 1;
const newColId = () => `col-${colSeq++}`;
const newGroupId = () => `grp-${groupSeq++}`;
const makeGroup = (ids: string[]): Group => ({ id: newGroupId(), agentIds: [...ids], activeId: ids[0] ?? '' });

// Distribute the 8 agents across 3 HETEROGENEOUS columns so the 2-level model is
// visible by default: columns 1 and 3 are single full-height panes (one group
// each), while the MIDDLE column starts as TWO stacked groups (a row split). Cleo
// lands in the middle column's top row and Nova in the last column, so attention
// is spread across the layout. Nothing assumes columns are uniform.
const initialColumns = (): Column[] => {
  const ids = AGENTS.map((a) => a.id);
  return [
    { id: newColId(), groups: [makeGroup(ids.slice(0, 3))] },
    { id: newColId(), groups: [makeGroup(ids.slice(3, 5)), makeGroup(ids.slice(5, 6))] },
    { id: newColId(), groups: [makeGroup(ids.slice(6))] },
  ];
};

// tone → label/digit text color. Token-backed (tool-* / muted), so it reads in
// light AND dark with no hardcodes.
const TONE_TEXT: Record<AgentStatusTone, string> = {
  working: 'text-tool-blue',
  idle: 'text-muted-foreground',
  done: 'text-tool-green',
  error: 'text-tool-red',
  blocked: 'text-tool-blue',
};

// ── Browser previews (the full-screen Browser view) ─────────────────────────
// The Browser top-level view is a FULL-SCREEN kai-artifact (address bar /
// back-forward / reload / displayUrl) with a hand-rolled TAB STRIP above it — one
// tab per open preview. Different agents open their OWN preview tabs, so the model
// is a flat `browserTabs` array of { id, title, url, agentId, src }. Every
// previewed app is itself DARK (dark surfaces + light text), carried in an
// isolated `data:` iframe, so it reads as a real dark product regardless of the
// IDE theme. The artifact frames the `data:` blob; `displayUrl` shows a clean
// read-only address instead of leaking the blob.
const dataUrl = (html: string) => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

// Shared dark styling for every preview page.
const PREVIEW_CSS = `
  :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; background: #0b0b0e; color: #fafafa; }
  header { display: flex; align-items: center; gap: 8px; padding: 14px 20px; border-bottom: 1px solid #27272a; font-weight: 600; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e80; }
  main { padding: 28px 20px; max-width: 560px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  p { color: #a1a1aa; line-height: 1.55; }
  .card { margin-top: 18px; padding: 16px; border: 1px solid #27272a; border-radius: 12px; background: #18181b; }
  .btn { display: inline-block; margin-top: 12px; padding: 9px 16px; border-radius: 8px; background: #fafafa; color: #18181b; text-decoration: none; font-size: 14px; font-weight: 600; }
`;

interface PreviewCopy {
  badge: string;
  h1: string;
  lede: string;
  cardTitle: string;
  cardMeta: string;
  cta: string;
}
const previewPage = (o: PreviewCopy) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${PREVIEW_CSS}</style></head><body>` +
  `<header><span class="dot"></span> ${o.badge}</header>` +
  `<main><h1>${o.h1}</h1><p>${o.lede}</p>` +
  `<div class="card"><strong>${o.cardTitle}</strong><p style="margin:6px 0 0">${o.cardMeta}</p>` +
  `<a class="btn" href="#">${o.cta}</a></div></main></body></html>`;

// A single browser preview tab. `agentId` is the agent that opened it (so a tab
// reads as "owned" by an agent and we can dedupe re-opens); `src` is the dark
// `data:` page the artifact frames.
interface BrowserTab {
  id: string;
  title: string;
  url: string;
  agentId: string;
  src: string;
}
let previewSeq = 0;

// Seed previews opened by DIFFERENT agents: the dark "Acme App — staging /
// Checkout" one (Cy), an admin orders view (Otto), and the rendered docs guide
// (Cleo). The count of these is what the Browser top-level tab badges.
const INITIAL_BROWSER_TABS: BrowserTab[] = [
  {
    id: 'pv-checkout', title: 'Acme App — Checkout', url: '/staging/acme/checkout', agentId: 'cy',
    src: dataUrl(previewPage({
      badge: 'Acme App — staging',
      h1: 'Checkout v2',
      lede: 'The refactored flow is live on the staging preview. Atlas is coordinating the rollout while the fleet finishes its tasks.',
      cardTitle: 'Cart', cardMeta: '2 items · $84.00', cta: 'Continue to payment',
    })),
  },
  {
    id: 'pv-orders', title: 'Acme Admin — Orders', url: '/staging/acme/admin/orders', agentId: 'otto',
    src: dataUrl(previewPage({
      badge: 'Acme Admin — staging',
      h1: 'Orders',
      lede: 'The split orders table is live behind the new migrations. Otto is reconciling payment intents against the ledger.',
      cardTitle: 'Today', cardMeta: '1,284 orders · $48,910 captured', cta: 'Open order #4821',
    })),
  },
  {
    id: 'pv-docs', title: 'Docs — Checkout guide', url: '/preview/docs/checkout', agentId: 'cleo',
    src: dataUrl(previewPage({
      badge: 'Docs Portal — preview',
      h1: 'Checkout integration',
      lede: 'Cleo is drafting the provider walkthrough. The auth section is blocked on which gateway the guide should target.',
      cardTitle: 'On this page', cardMeta: 'Setup · Webhooks · Going live', cta: 'Read the guide',
    })),
  },
];

export const SplitWorkspace: Story = {
  name: 'AMUX',
  render: () => {
    const [workspace, setWorkspace] = createSignal('acme');
    // focusedId tracks the focused agent for the workspace columns.
    const [focusedId, setFocusedId] = createSignal<string>(AGENTS[0].id);
    // The 2-level editor-group model. `colSizes` holds the per-COLUMN horizontal
    // flex weights (the column dividers drive these); `rowSizes` maps a column id →
    // its per-GROUP vertical flex weights (the in-column row dividers drive those).
    const [columns, setColumns] = createSignal<Column[]>(initialColumns());
    const [colSizes, setColSizes] = createSignal<number[]>(columns().map(() => 1));
    const [rowSizes, setRowSizes] = createSignal<Record<string, number[]>>(
      Object.fromEntries(columns().map((c) => [c.id, c.groups.map(() => 1)])),
    );
    // Which group/pane is focused (the ⌥-jump + zoom target; paints Pane `focused`).
    const [focusedGroupId, setFocusedGroupId] = createSignal<string>(columns()[0]?.groups[0]?.id ?? '');
    // The zoomed (maximized) agent id, or null. Esc / ⌥Z restore.
    const [zoomedId, setZoomedId] = createSignal<string | null>(null);
    // If the maximized group is closed/merged away, drop back to the columns.
    createEffect(() => { const z = zoomedId(); if (z && !findGroup(z)) setZoomedId(null); });
    // The agent id whose tab "…" menu is open, or null.
    const [menuFor, setMenuFor] = createSignal<string | null>(null);
    const [menuPos, setMenuPos] = createSignal<{ x: number; y: number } | null>(null);
    const [attnOpen, setAttnOpen] = createSignal(false);
    const [attnPos, setAttnPos] = createSignal<{ x: number; y: number } | null>(null);
    // Pointer drag-and-drop of a tab: the live gesture (dragged agent + pointer
    // position + the resolved drop zone), or null when idle.
    const [drag, setDrag] = createSignal<DragState | null>(null);
    const [closed, setClosed] = createSignal<Set<string>>(new Set());
    const [extraAgents, setExtraAgents] = createSignal<Agent[]>([]);
    const allAgents = () => [...AGENTS, ...extraAgents()];
    const [nameOverrides, setNameOverrides] = createSignal<Record<string, string>>({});
    const [renamingId, setRenamingId] = createSignal<string | null>(null);
    const agentName = (id: string) => nameOverrides()[id] ?? agentById(id)?.name ?? '';
    const commitRename = (id: string, value: string) => {
      const v = value.trim();
      if (v) setNameOverrides((o) => ({ ...o, [id]: v }));
      setRenamingId(null);
    };
    const [attentionFirst, setAttentionFirst] = createSignal(false);
    const [cmdOpen, setCmdOpen] = createSignal(false);
    // TOP-LEVEL view: AGENTS (the editor-group tiling) or BROWSER (a full-screen
    // kai-artifact + preview tab strip). Distinct from the within-Agents tier.
    const [topView, setTopView] = createSignal<'agents' | 'browser'>('agents');
    // Open browser previews — different agents open their own tabs.
    const [browserTabs, setBrowserTabs] = createSignal<BrowserTab[]>(INITIAL_BROWSER_TABS);
    const [activeBrowserTab, setActiveBrowserTab] = createSignal<string>(INITIAL_BROWSER_TABS[0]?.id ?? '');
    // Broadcast composer now lives behind a header button → mock modal.
    const [broadcastOpen, setBroadcastOpen] = createSignal(false);
    const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
    const [confirmCloseWs, setConfirmCloseWs] = createSignal<string | null>(null);
    const [railTab, setRailTab] = createSignal<'agents' | 'files'>('agents');
    // The workspaces rail is hand-rolled (kai-nav can't do per-item close), so the
    // list is dynamic + each row has a hover-× that closes it.
    const [workspaces, setWorkspaces] = createSignal<KaiNavItem[]>(WORKSPACES);
    const closeWorkspace = (id: string) => {
      const remaining = workspaces().filter((w) => w.id !== id);
      setWorkspaces(remaining);
      if (workspace() === id && remaining[0]) setWorkspace(remaining[0].id);
    };

    // Refs captured imperatively: the per-agent prompt input (so ⌥N can focus it) and
    // the columns row (so the dividers can measure it for drag math).
    const promptRefs = new Map<string, El>();
    // The columns row (measured by the column dividers for horizontal drag) + each
    // column's group stack (measured by its row dividers for vertical drag).
    let rowEl: HTMLDivElement | undefined;
    const colRefs = new Map<string, HTMLElement>();
    // Tab-DnD hit-testing: each GROUP root (the drop-target rect), its tab STRIP
    // (the reorder/insert band), and each TAB element keyed `${groupId}:${agentId}`
    // (to compute the insertion index). Detached entries are skipped via isConnected.
    const groupRefs = new Map<string, HTMLElement>();
    const tabStripRefs = new Map<string, HTMLElement>();
    const tabRefs = new Map<string, HTMLElement>();

    const live = () => allAgents().filter((a) => !closed().has(a.id));
    const agentById = (id: string) => allAgents().find((a) => a.id === id);
    const agentNumber = (id: string) => allAgents().findIndex((a) => a.id === id) + 1;
    // Stable sort: agents awaiting input float to the top when the toggle is on.
    const ordered = (list: Agent[]) =>
      attentionFirst()
        ? [...list].sort((a, b) => Number(!!b.needsAttention) - Number(!!a.needsAttention))
        : list;
    const attentionCount = () => live().filter((a) => a.needsAttention).length;

    // ── Editor-group helpers (2-level) ───────────────────────────────────────
    // A group's live agents, in display (attention) order.
    const colAgents = (group: Group) =>
      ordered(
        group.agentIds
          .map((id) => agentById(id))
          .filter((a): a is Agent => !!a && !closed().has(a.id)),
      );
    // Locate a group (and its column) by group id / by the agent it holds.
    const findGroup = (groupId: string) => {
      for (const col of columns()) for (const group of col.groups) if (group.id === groupId) return { col, group };
      return undefined;
    };
    const findGroupOfAgent = (agentId: string) => {
      for (const col of columns()) for (const group of col.groups) if (group.agentIds.includes(agentId)) return { col, group };
      return undefined;
    };
    const focusedGroup = () => findGroup(focusedGroupId())?.group ?? columns()[0]?.groups[0];
    const focusedPaneId = () => focusedGroup()?.activeId;

    // Strip an agent out of whatever group holds it, keeping that group's activeId
    // valid. Leaves empty groups/columns in place — commitColumns drops them.
    const withoutAgent = (cols: Column[], agentId: string): Column[] =>
      cols.map((col) => ({
        ...col,
        groups: col.groups.map((g) => {
          if (!g.agentIds.includes(agentId)) return g;
          const remaining = g.agentIds.filter((id) => id !== agentId);
          return { ...g, agentIds: remaining, activeId: g.activeId === agentId ? (remaining[0] ?? '') : g.activeId };
        }),
      }));

    // Commit a new layout: drop empty GROUPS then empty COLUMNS, reset BOTH axes'
    // divider weights to equal (survivors REFLOW to fill the freed space), and keep
    // focusedGroupId pointing at a group that still exists.
    const commitColumns = (next: Column[]) => {
      const cleaned = next
        .map((col) => ({ ...col, groups: col.groups.filter((g) => g.agentIds.length > 0) }))
        .filter((col) => col.groups.length > 0);
      setColumns(cleaned);
      setColSizes(cleaned.map(() => 1));
      setRowSizes(Object.fromEntries(cleaned.map((col) => [col.id, col.groups.map(() => 1)])));
      const groupIds = cleaned.flatMap((col) => col.groups.map((g) => g.id));
      if (!groupIds.includes(focusedGroupId())) {
        setFocusedGroupId(groupIds[0] ?? '');
      }
    };

    const selectTab = (groupId: string, agentId: string) => {
      setColumns((cols) =>
        cols.map((col) => ({
          ...col,
          groups: col.groups.map((g) => (g.id === groupId ? { ...g, activeId: agentId } : g)),
        })),
      );
      setFocusedGroupId(groupId);
      setFocusedId(agentId);
    };

    const closeTab = (agentId: string) => {
      setClosed((s) => { const n = new Set<string>(s); n.add(agentId); return n; });
      setMenuFor(null);
      const next = columns().map((col) => ({
        ...col,
        groups: col.groups.map((g) => {
          if (!g.agentIds.includes(agentId)) return g;
          const idx = g.agentIds.indexOf(agentId);
          const remaining = g.agentIds.filter((id) => id !== agentId);
          const activeId =
            g.activeId === agentId
              ? remaining[Math.min(idx, remaining.length - 1)] ?? ''
              : g.activeId;
          return { ...g, agentIds: remaining, activeId };
        }),
      }));
      commitColumns(next);
    };

    // Chrome-style "+": spawn a fresh agent as a new tab in this group, made active.
    const newAgent = (groupId: string) => {
      const seq = agentSeq++;
      const id = `new-agent-${seq}`;
      const agent: Agent = {
        id,
        name: `New agent ${seq}`,
        role: 'New agent',
        glyph: Bot,
        status: { tone: 'idle', label: 'Idle' },
        lastLine: 'Ready to start',
        body: 'New agent ready. Send it a task from the composer below.',
        runtime: { kind: 'local' as const },
      };
      setExtraAgents((xs) => [...xs, agent]);
      setColumns(
        columns().map((col) => ({
          ...col,
          groups: col.groups.map((g) =>
            g.id === groupId ? { ...g, agentIds: [...g.agentIds, id], activeId: id } : g,
          ),
        })),
      );
      setFocusedGroupId(groupId);
      setRenamingId(id);
    };

    // Close an ENTIRE column (its panes go with it). The survivors REFLOW to fill
    // the freed width — commitColumns resets the column weights to equal.
    const closeColumn = (colId: string) => {
      setMenuFor(null);
      const col = columns().find((c) => c.id === colId);
      if (!col) return;
      const ids = col.groups.flatMap((g) => g.agentIds);
      setClosed((s) => { const n = new Set<string>(s); ids.forEach((id) => n.add(id)); return n; });
      commitColumns(columns().filter((c) => c.id !== colId));
    };

    const resetAll = () => {
      setClosed(new Set<string>());
      const cols = initialColumns();
      setColumns(cols);
      setColSizes(cols.map(() => 1));
      setRowSizes(Object.fromEntries(cols.map((col) => [col.id, col.groups.map(() => 1)])));
      setFocusedGroupId(cols[0]?.groups[0]?.id ?? '');
      setZoomedId(null);
    };

    // SPLIT RIGHT: pull an agent into a brand-new COLUMN inserted right after its
    // current column (a single-group column to the right).
    const splitRight = (agentId: string) => {
      setMenuFor(null);
      const loc = findGroupOfAgent(agentId);
      if (!loc) return;
      const ng = makeGroup([agentId]);
      const nc: Column = { id: newColId(), groups: [ng] };
      const next: Column[] = [];
      for (const col of withoutAgent(columns(), agentId)) {
        next.push(col);
        if (col.id === loc.col.id) next.push(nc);
      }
      commitColumns(next);
      setFocusedGroupId(ng.id);
      setFocusedId(agentId);
    };

    // SPLIT DOWN: pull an agent into a NEW GROUP (row) inserted just below its
    // current group, within the SAME column.
    const splitDown = (agentId: string) => {
      setMenuFor(null);
      const loc = findGroupOfAgent(agentId);
      if (!loc) return;
      const ng = makeGroup([agentId]);
      const next = withoutAgent(columns(), agentId).map((col) => {
        if (col.id !== loc.col.id) return col;
        const at = col.groups.findIndex((g) => g.id === loc.group.id);
        const groups = [...col.groups];
        groups.splice(at + 1, 0, ng);
        return { ...col, groups };
      });
      commitColumns(next);
      setFocusedGroupId(ng.id);
      setFocusedId(agentId);
    };

    // Add a NEW trailing column from the focused pane (the explicit "+ New column"
    // affordance at the row's trailing edge). Survivors reflow via commitColumns.
    const addColumn = () => {
      const agentId = focusedPaneId();
      if (!agentId) return;
      setMenuFor(null);
      const ng = makeGroup([agentId]);
      const nc: Column = { id: newColId(), groups: [ng] };
      commitColumns([...withoutAgent(columns(), agentId), nc]);
      setFocusedGroupId(ng.id);
      setFocusedId(agentId);
    };

    // Move an agent to the adjacent COLUMN (dir −1 / +1) — appends to that column's
    // first group + makes it active. No-op past the ends.
    const moveToColumn = (agentId: string, dir: -1 | 1) => {
      setMenuFor(null);
      const cs = columns();
      const srcIdx = cs.findIndex((c) => c.groups.some((g) => g.agentIds.includes(agentId)));
      if (srcIdx < 0) return;
      const tgtIdx = srcIdx + dir;
      if (tgtIdx < 0 || tgtIdx >= cs.length) return;
      const target = cs[tgtIdx];
      const targetGroup = target.groups[0];
      if (!targetGroup) return;
      const next = withoutAgent(cs, agentId).map((col) =>
        col.id === target.id
          ? {
              ...col,
              groups: col.groups.map((g) =>
                g.id === targetGroup.id ? { ...g, agentIds: [...g.agentIds, agentId], activeId: agentId } : g,
              ),
            }
          : col,
      );
      commitColumns(next);
      setFocusedGroupId(targetGroup.id);
      setFocusedId(agentId);
    };

    // Move an agent to the adjacent GROUP within its column (dir −1 / +1 — the row
    // above / below). No-op if there's no such row.
    // ⌥⇧Arrow: move the focused pane to the adjacent column/row; at the right/bottom
    // edge, create a new split instead. (Left/up at the first edge are no-ops for now.)
    const movePaneOrSplit = (agentId: string, dir: 'left' | 'right' | 'up' | 'down') => {
      const cols = columns();
      const colI = cols.findIndex((c) => c.groups.some((g) => g.agentIds.includes(agentId)));
      if (colI < 0) return;
      const col = cols[colI];
      const grpI = col.groups.findIndex((g) => g.agentIds.includes(agentId));
      if (dir === 'left') { if (colI > 0) moveToColumn(agentId, -1); }
      else if (dir === 'right') { if (colI < cols.length - 1) moveToColumn(agentId, 1); else splitRight(agentId); }
      else if (dir === 'up') { if (grpI > 0) moveToGroup(agentId, -1); }
      else if (dir === 'down') { if (grpI < col.groups.length - 1) moveToGroup(agentId, 1); else splitDown(agentId); }
    };

    const moveToGroup = (agentId: string, dir: -1 | 1) => {
      setMenuFor(null);
      const loc = findGroupOfAgent(agentId);
      if (!loc) return;
      const groups = loc.col.groups;
      const srcIdx = groups.findIndex((g) => g.id === loc.group.id);
      const tgtIdx = srcIdx + dir;
      if (tgtIdx < 0 || tgtIdx >= groups.length) return;
      const targetGroup = groups[tgtIdx];
      const next = withoutAgent(columns(), agentId).map((col) =>
        col.id === loc.col.id
          ? {
              ...col,
              groups: col.groups.map((g) =>
                g.id === targetGroup.id ? { ...g, agentIds: [...g.agentIds, agentId], activeId: agentId } : g,
              ),
            }
          : col,
      );
      commitColumns(next);
      setFocusedGroupId(targetGroup.id);
      setFocusedId(agentId);
    };

    // ── Pointer drag-and-drop for tabs (zed/vscode feel, 2-level) ────────────
    // A TAB (an agent) drags to REORDER within its strip, MOVE into another group
    // (its strip or body center), or DRAG-TO-SPLIT off a group's EDGE — left/right
    // makes a new COLUMN that side, top/bottom a new GROUP/row above/below. All
    // pointer-based (not HTML5 draggable): setPointerCapture, a floating ghost, a
    // live drop indicator. The resize dividers keep their own pointerdown handlers
    // on separate `role="separator"` elements, and a tab drag starts ONLY from a
    // tab, so the two gestures never both fire.
    let dragMoved = false; // did this gesture pass the move threshold (→ suppress the click)
    const EDGE_ZONE = 0.22; // outer fraction of a group on a side that means "split"

    // Which displayed tab the pointer would insert BEFORE (null = append). Skips
    // the dragged tab so its own slot never counts.
    const insertBeforeId = (groupId: string, x: number, draggedId: string): string | null => {
      const loc = findGroup(groupId);
      if (!loc) return null;
      for (const a of colAgents(loc.group)) {
        if (a.id === draggedId) continue;
        const el = tabRefs.get(`${groupId}:${a.id}`);
        if (!el || !el.isConnected) continue;
        const r = el.getBoundingClientRect();
        if (x < r.left + r.width / 2) return a.id;
      }
      return null;
    };

    // Hit-test the group under the pointer and classify the zone: over the tab
    // strip → insert-at-index; an outer EDGE band → that edge's split; the inner
    // region → center/move.
    const hitTest = (x: number, y: number, draggedId: string): DropZone | undefined => {
      let found: DropZone | undefined;
      groupRefs.forEach((el, groupId) => {
        if (found || !el.isConnected) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
        const strip = tabStripRefs.get(groupId);
        if (strip?.isConnected) {
          const sr = strip.getBoundingClientRect();
          if (x >= sr.left && x <= sr.right && y >= sr.top && y <= sr.bottom) {
            found = { kind: 'tabs', groupId, beforeId: insertBeforeId(groupId, x, draggedId) };
            return;
          }
        }
        const fx = (x - rect.left) / rect.width;
        const fy = (y - rect.top) / rect.height;
        const left = fx, right = 1 - fx, top = fy, bottom = 1 - fy;
        const min = Math.min(left, right, top, bottom);
        if (min >= EDGE_ZONE) { found = { kind: 'center', groupId }; return; }
        if (min === left) found = { kind: 'edge', groupId, edge: 'left' };
        else if (min === right) found = { kind: 'edge', groupId, edge: 'right' };
        else if (min === top) found = { kind: 'edge', groupId, edge: 'top' };
        else found = { kind: 'edge', groupId, edge: 'bottom' };
      });
      return found;
    };

    // Move an agent INTO a group at a position (before `beforeId`, else append),
    // make it active, and focus the group. Reuses withoutAgent + commitColumns.
    const insertIntoGroup = (agentId: string, groupId: string, beforeId: string | null) => {
      setMenuFor(null);
      const next = withoutAgent(columns(), agentId).map((col) => ({
        ...col,
        groups: col.groups.map((g) => {
          if (g.id !== groupId) return g;
          const ids = g.agentIds.filter((id) => id !== agentId);
          let at = beforeId ? ids.indexOf(beforeId) : -1;
          if (at < 0) at = ids.length;
          return { ...g, agentIds: [...ids.slice(0, at), agentId, ...ids.slice(at)], activeId: agentId };
        }),
      }));
      commitColumns(next);
      setFocusedGroupId(groupId);
      setFocusedId(agentId);
    };

    // DRAG-TO-SPLIT off a left/right edge: a new single-group COLUMN that side of
    // the target's column.
    const splitToColumn = (agentId: string, targetColId: string, side: 'left' | 'right') => {
      setMenuFor(null);
      const ng = makeGroup([agentId]);
      const nc: Column = { id: newColId(), groups: [ng] };
      const next: Column[] = [];
      for (const col of withoutAgent(columns(), agentId)) {
        if (col.id === targetColId && side === 'left') next.push(nc);
        next.push(col);
        if (col.id === targetColId && side === 'right') next.push(nc);
      }
      commitColumns(next);
      setFocusedGroupId(ng.id);
      setFocusedId(agentId);
    };

    // DRAG-TO-SPLIT off a top/bottom edge: a new GROUP (row) above/below the
    // target group within the SAME column.
    const splitToRow = (agentId: string, targetColId: string, targetGroupId: string, side: 'top' | 'bottom') => {
      setMenuFor(null);
      const ng = makeGroup([agentId]);
      const next = withoutAgent(columns(), agentId).map((col) => {
        if (col.id !== targetColId) return col;
        const at = col.groups.findIndex((g) => g.id === targetGroupId);
        const groups = [...col.groups];
        groups.splice(at < 0 ? groups.length : side === 'top' ? at : at + 1, 0, ng);
        return { ...col, groups };
      });
      commitColumns(next);
      setFocusedGroupId(ng.id);
      setFocusedId(agentId);
    };

    // Commit whatever zone the pointer was over on release.
    const commitDrop = (agentId: string, zone: DropZone) => {
      const loc = findGroup(zone.groupId);
      if (!loc) return;
      if (zone.kind === 'edge') {
        if (zone.edge === 'left' || zone.edge === 'right') splitToColumn(agentId, loc.col.id, zone.edge);
        else splitToRow(agentId, loc.col.id, loc.group.id, zone.edge);
        return;
      }
      insertIntoGroup(agentId, zone.groupId, zone.kind === 'tabs' ? zone.beforeId : null);
    };

    // Start a tab drag from a tab's pointerdown: left button only, never from the
    // tab's …/× buttons. A small move threshold separates a click (selectTab) from
    // a drag; once crossed we capture the pointer, raise the ghost, and live-hit-
    // test on pointermove. pointerup commits; Esc / drop-outside cancels.
    const startTabDrag = (agentId: string) => (e: PointerEvent) => {
      if (e.button !== 0) return;
      const closestBtn = (e.target as HTMLElement | null)?.closest('button');
      if (closestBtn && closestBtn !== e.currentTarget) return;
      const startX = e.clientX, startY = e.clientY;
      const tabEl = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      let started = false;
      dragMoved = false;
      const onMove = (ev: PointerEvent) => {
        if (!started) {
          if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5) return;
          started = true;
          dragMoved = true;
          try { tabEl.setPointerCapture(pointerId); } catch { /* noop */ }
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
          setDrag({ agentId, x: ev.clientX, y: ev.clientY });
        }
        setDrag({ agentId, x: ev.clientX, y: ev.clientY, target: hitTest(ev.clientX, ev.clientY, agentId) });
      };
      const finish = (commit: boolean) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey);
        try { tabEl.releasePointerCapture(pointerId); } catch { /* noop */ }
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        const state = drag();
        setDrag(null);
        if (commit && started && state?.target) commitDrop(agentId, state.target);
      };
      const onUp = () => finish(true);
      const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') finish(false); };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey);
    };

    const toggleZoom = (groupId?: string) => {
      const id = groupId ?? focusedGroupId();
      if (!id) return;
      setTopView('agents');
      setZoomedId((z) => (z === id ? null : id));
    };

    // Jump to an agent (palette "Go to …", header pill, ⌥N): make it the active tab
    // of its column, focus that group + its prompt input, in the Workspace tier.
    const jumpToAgent = (agentId: string) => {
      if (!live().some((a) => a.id === agentId)) return;
      setTopView('agents');
      setZoomedId(null);
      const loc = findGroupOfAgent(agentId);
      if (loc) {
        selectTab(loc.group.id, agentId);
      } else {
        setFocusedId(agentId);
      }
      queueMicrotask(() => promptRefs.get(agentId)?.focus?.());
    };
    const jumpToNumber = (n: number) => {
      const a = allAgents()[n - 1];
      if (a) jumpToAgent(a.id);
    };

    // Toast actions land here: open that agent in the Workspace tier.
    const focusAgent = (id: string) => jumpToAgent(id);

    // ── Browser previews (full-screen Browser view) ──────────────────────────
    const activeBrowserTabData = () =>
      browserTabs().find((t) => t.id === activeBrowserTab()) ?? browserTabs()[0];

    // Build a dark preview tab for an arbitrary agent (the "Open preview" action).
    const makeAgentTab = (a: Agent): BrowserTab => ({
      id: `pv-${a.id}-${previewSeq++}`,
      title: `${a.name} preview`,
      url: `/preview/${workspace()}/${a.id}`,
      agentId: a.id,
      src: dataUrl(
        previewPage({
          badge: `${WORKSPACE_LABEL.get(workspace())} — preview`,
          h1: `${a.name} · ${a.role}`,
          lede: a.lastLine,
          cardTitle: 'Status',
          cardMeta: a.status.label ?? a.status.tone,
          cta: 'Open in agent',
        }),
      ),
    });

    // Open a preview for an agent (defaults to the focused pane): reuse its tab if
    // one is already open, else add one, then switch to the full-screen Browser.
    const openPreview = (agentId?: string) => {
      const id = agentId ?? focusedPaneId();
      if (!id) return;
      const a = agentById(id);
      if (!a) return;
      setCmdOpen(false);
      const existing = browserTabs().find((t) => t.agentId === id);
      if (existing) {
        setActiveBrowserTab(existing.id);
      } else {
        const tab = makeAgentTab(a);
        setBrowserTabs((tabs) => [...tabs, tab]);
        setActiveBrowserTab(tab.id);
      }
      setTopView('browser');
    };

    // Close a preview tab; keep the active tab valid and drop back to Agents when
    // the last preview closes.
    const closeBrowserTab = (tabId: string) => {
      const tabs = browserTabs();
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx < 0) return;
      const next = tabs.filter((t) => t.id !== tabId);
      setBrowserTabs(next);
      if (activeBrowserTab() === tabId) setActiveBrowserTab(next[Math.min(idx, next.length - 1)]?.id ?? '');
      if (next.length === 0) setTopView('agents');
    };

    // ── Toasts + keyboard ────────────────────────────────────────────────────
    // The imperative toast() singleton lazily mounts ONE <kai-toast-region>; point
    // it bottom-right. (No manual region: a second region bound to the same store
    // would double every toast. The Storybook decorator themes the body-mounted
    // region to match the light/dark toggle.)
    onMount(() => {
      configureToasts({ position: 'bottom-right' });
      // "An agent needs you": one PERSISTENT, actionable toast per waiting agent,
      // raised ONCE. Stable ids upsert, so HMR/re-render never stacks duplicates.
      for (const a of live().filter((x) => x.needsAttention)) {
        toast(`${a.name} is waiting for your input`, {
          id: `needs-${a.id}`,
          duration: 0,
          appearance: 'card',
          action: { label: 'Respond', onAction: () => focusAgent(a.id) },
        });
      }

      // Browser-safe global shortcuts. Number + zoom keys read `event.code` so
      // macOS Option-glyphs (⌥1 → "¡", ⌥z → "Ω") never matter; preventDefault
      // cancels the default even when the event originates in a shadow-DOM input.
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') {
          e.preventDefault();
          setCmdOpen(true);
          return;
        }
        if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[1-8]$/.test(e.code)) {
          e.preventDefault();
          jumpToNumber(Number(e.code.slice(5)));
          return;
        }
        if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyZ') {
          e.preventDefault();
          toggleZoom();
          return;
        }
        if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyB') {
          e.preventDefault();
          setTopView((v) => (v === 'browser' ? 'agents' : 'browser'));
          return;
        }
        if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.code.startsWith('Arrow')) {
          const t = e.target as HTMLElement | null;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
          const fa = focusedPaneId();
          if (!fa) return;
          e.preventDefault();
          if (e.code === 'ArrowLeft') movePaneOrSplit(fa, 'left');
          else if (e.code === 'ArrowRight') movePaneOrSplit(fa, 'right');
          else if (e.code === 'ArrowUp') movePaneOrSplit(fa, 'up');
          else if (e.code === 'ArrowDown') movePaneOrSplit(fa, 'down');
          return;
        }
        if (e.key === 'Escape') {
          if (menuFor()) setMenuFor(null);
          if (attnOpen()) setAttnOpen(false);
          if (zoomedId()) setZoomedId(null);
        }
      };
      // Any outside click dismisses an open tab "…" menu (its own clicks stop
      // propagation, so opening never immediately re-closes it).
      const onDocClick = () => { if (menuFor()) setMenuFor(null); };
      document.addEventListener('keydown', onKey);
      document.addEventListener('click', onDocClick);
      onCleanup(() => {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('click', onDocClick);
      });
    });

    // "An agent finished": a success toast whose action opens that agent. Wired to
    // the header "Simulate completion" control so it's clearly triggerable.
    const simulateCompletion = () => {
      const done = live().find((a) => a.status.tone === 'working') ?? live()[0];
      if (!done) return;
      toast.success(`${done.name} finished its ${done.role.toLowerCase()} task`, {
        appearance: 'card',
        action: { label: 'Open', onAction: () => focusAgent(done.id) },
      });
    };

    // ── Command palette: covers BOTH nav levels ──────────────────────────────
    // Computed fresh each open (the overlay re-mounts), so it reflects the live
    // fleet + the currently focused pane. Icons are only set where a kai icon name
    // is known, to avoid the text-fallback warning.
    const commandItems = (): KaiCommandItem[] => {
      const items: KaiCommandItem[] = [];
      for (const a of live()) {
        items.push({
          id: `goto-${a.id}`,
          label: `Go to ${agentName(a.id)}`,
          description: a.role,
          shortcut: `Alt+${agentNumber(a.id)}`,
          group: 'Agents',
        });
      }
      for (const w of workspaces()) {
        items.push({
          id: `ws-${w.id}`,
          label: `Switch to ${w.label}`,
          icon: typeof w.icon === 'string' ? w.icon : undefined,
          group: 'Workspaces',
        });
      }
      const fa = focusedPaneId();
      const faName = (fa && agentName(fa)) || 'pane';
      items.push({ id: 'pane-split-right', label: 'Split pane right (new column)', description: faName, group: 'Pane' });
      items.push({ id: 'pane-split-down', label: 'Split pane down (new row)', description: faName, group: 'Pane' });
      items.push({ id: 'pane-next-col', label: 'Move pane to next column', group: 'Pane' });
      items.push({ id: 'pane-prev-col', label: 'Move pane to previous column', group: 'Pane' });
      items.push({ id: 'pane-add-col', label: 'New column from pane', group: 'Pane' });
      items.push({ id: 'pane-zoom', label: 'Zoom pane', description: faName, group: 'Pane' });
      items.push({ id: 'pane-rename', label: `Rename ${faName}`, group: 'Pane' });
      items.push({ id: 'broadcast', label: 'Message all agents', group: 'Broadcast' });
      items.push({ id: 'view-agents', label: 'View agents', group: 'View' });
      items.push({
        id: 'open-browser',
        label: browserTabs().length ? `Open browser (${browserTabs().length})` : 'Open browser',
        group: 'View',
      });
      items.push({ id: 'open-preview', label: `Open preview of ${faName}`, group: 'View' });
      return items;
    };

    const onCommandSelect = (id: string) => {
      setCmdOpen(false);
      if (id.startsWith('goto-')) { jumpToAgent(id.slice('goto-'.length)); return; }
      if (id.startsWith('ws-')) {
        const w = id.slice('ws-'.length);
        setWorkspace(w);
        return;
      }
      const fa = focusedPaneId();
      switch (id) {
        case 'pane-split-right': if (fa) splitRight(fa); break;
        case 'pane-split-down': if (fa) splitDown(fa); break;
        case 'pane-next-col': if (fa) moveToColumn(fa, 1); break;
        case 'pane-prev-col': if (fa) moveToColumn(fa, -1); break;
        case 'pane-add-col': addColumn(); break;
        case 'pane-zoom': toggleZoom(); break;
        case 'pane-rename': if (fa) setRenamingId(fa); break;
        case 'broadcast': setBroadcastOpen(true); break;
        case 'view-agents': setTopView('agents'); break;
        case 'open-browser': setTopView('browser'); break;
        case 'open-preview': if (fa) openPreview(fa); break;
      }
    };

    // The terminal-style pane body — one kai-message rendering the agent's markdown.
    const AgentBody = (props: { agent: Agent }) => (
      <div class="flex flex-col gap-2 px-3 py-2.5">
        <kai-message
          ref={(el) => {
            const m = el as El;
            m.message = { id: props.agent.id, role: 'assistant', parts: [{ type: 'text', text: props.agent.body }] };
            m.avatar = 'none';
          }}
          style={{ display: 'block' }}
        ></kai-message>
      </div>
    );

    // The compact per-pane composer (footer slot of every Pane). Registers its
    // prompt input by agent id so ⌥N can focus it the instant the pane mounts.
    const Composer = (props: { agent: Agent }) => (
      <div class="p-1.5">
        <kai-prompt-input
          ref={(el) => { const p = el as El; p.attach = false; promptRefs.set(props.agent.id, p); }}
          class="block"
          placeholder={`Message ${props.agent.name}...`}
        ></kai-prompt-input>
      </div>
    );

    const RestoreAll = () => (
      <div class="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        All agents closed.
        <kai-button ref={(el) => { el.addEventListener('kai-click', resetAll); }} variant="outline" size="sm" icon="rotate-cw">Restore agents</kai-button>
      </div>
    );

    // ── Editor-group tab + its move/split menu ───────────────────────────────
    const TabMenuItem = (props: { onClick: () => void; disabled?: boolean; children: JSX.Element }) => (
      <button
        type="button"
        role="menuitem"
        disabled={props.disabled}
        onClick={() => { if (!props.disabled) props.onClick(); }}
        class="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs text-popover-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
      >
        {props.children}
      </button>
    );

    // A NUMBERED-STATUS-BADGE tab: [tone badge + ⌥number] name ×. The badge color
    // encodes status, the digit is the jump key. The status WORD now lives on the
    // per-pane status line, not the tab (color-only tabs stay compact).
    const Tab = (props: { group: Group; colId: string; agent: Agent }) => {
      const isActive = () => props.group.activeId === props.agent.id;
      const num = agentNumber(props.agent.id);
      const colIdx = () => columns().findIndex((c) => c.id === props.colId);
      const col = () => columns().find((c) => c.id === props.colId);
      const grpIdx = () => col()?.groups.findIndex((g) => g.id === props.group.id) ?? -1;
      const groupCount = () => col()?.groups.length ?? 0;
      return (
        // Button-group, not a tablist: the activator and the close button are
        // sibling <button>s so the strip never owns a non-tab interactive child
        // (aria-required-children fix). group/tab lives here so hover shows the
        // close button.
        <div class="group/tab relative flex shrink-0 items-stretch">
          <button
            type="button"
            ref={(el) => tabRefs.set(`${props.group.id}:${props.agent.id}`, el)}
            aria-current={isActive() ? "true" : undefined}
            onPointerDown={startTabDrag(props.agent.id)}
            onClick={() => { if (dragMoved) { dragMoved = false; return; } selectTab(props.group.id, props.agent.id); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuPos({ x: e.clientX, y: e.clientY }); setMenuFor(props.agent.id); }}
            class={cn(
              'relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-none py-2 pl-1.5 pr-1 text-xs transition-colors',
              isActive()
                ? 'bg-surface text-foreground'
                : 'text-muted-foreground hover:bg-surface/40 hover:text-foreground',
              drag()?.agentId === props.agent.id && 'opacity-40',
            )}
          >
            <span class={cn('size-1.5 shrink-0 rounded-full bg-current', TONE_TEXT[props.agent.status.tone])} aria-hidden="true" />
            <span class="shrink-0 text-[11px] font-bold leading-none tabular-nums text-muted-foreground" aria-hidden="true">{num}</span>
            <span class="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
            <Show
              when={renamingId() === props.agent.id}
              fallback={
                <span class="max-w-[8rem] truncate font-medium">{agentName(props.agent.id)}</span>
              }
            >
              <kai-editable-label
                ref={(el) => {
                  (el as El).value = agentName(props.agent.id);
                  el.addEventListener('kai-rename', (e) =>
                    commitRename(props.agent.id, (e as CustomEvent<{ value: string }>).detail.value),
                  );
                  el.addEventListener('kai-cancel', () => setRenamingId(null));
                  // kai-editable-label stays silent on an unchanged commit, so clear
                  // the controlled renaming state whenever the field loses focus too.
                  el.addEventListener('focusout', () => setRenamingId(null));
                  queueMicrotask(() => (el as unknown as { edit?: () => void }).edit?.());
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                class="min-w-0 max-w-[10rem] text-xs font-medium"
              ></kai-editable-label>
            </Show>
            <Show when={props.agent.runtime} keyed>
              {(rt) => (
                <Show when={rt.kind === 'remote'} fallback={<Laptop class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}>
                  <Cloud class="size-4 shrink-0 text-tool-blue" aria-hidden="true" />
                </Show>
              )}
            </Show>
            <Show when={menuFor() === props.agent.id && menuPos()} keyed>
            {(pos) => (
              <Portal>
                <div
                  role="menu"
                  class="fixed z-50 w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                  style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <TabMenuItem onClick={() => { setMenuFor(null); setRenamingId(props.agent.id); }}>Rename</TabMenuItem>
                  <TabMenuItem onClick={() => { setMenuFor(null); toggleZoom(props.group.id); }}>Maximize section</TabMenuItem>
                  <div class="my-1 h-px bg-border"></div>
                  <TabMenuItem onClick={() => splitRight(props.agent.id)}>Split right</TabMenuItem>
                  <TabMenuItem onClick={() => splitDown(props.agent.id)}>Split down</TabMenuItem>
                  <TabMenuItem disabled={colIdx() >= columns().length - 1} onClick={() => moveToColumn(props.agent.id, 1)}>Move to next column</TabMenuItem>
                  <TabMenuItem disabled={colIdx() <= 0} onClick={() => moveToColumn(props.agent.id, -1)}>Move to previous column</TabMenuItem>
                  <TabMenuItem disabled={grpIdx() >= groupCount() - 1} onClick={() => moveToGroup(props.agent.id, 1)}>Move to group below</TabMenuItem>
                  <TabMenuItem disabled={grpIdx() <= 0} onClick={() => moveToGroup(props.agent.id, -1)}>Move to group above</TabMenuItem>
                  <div class="my-1 h-px bg-border"></div>
                  <TabMenuItem onClick={() => closeTab(props.agent.id)}>Close</TabMenuItem>
                </div>
              </Portal>
            )}
          </Show>
          </button>
          {/* close button is a sibling of the tab activator, not a descendant */}
          <button
            type="button"
            aria-label={`Close ${props.agent.name}`}
            onClick={(e) => { e.stopPropagation(); closeTab(props.agent.id); }}
            class={cn(
              'flex size-5 shrink-0 items-center justify-center self-center rounded text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground',
              isActive() ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
            )}
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      );
    };

    // One editor GROUP (a row): a tab strip + the active agent's Pane below. Its
    // vertical flex weight comes from its column's rowSizes. Pointer-down anywhere
    // focuses the group (paints Pane `focused`).
    const GroupView = (props: { group: Group; colId: string; weight: number }) => {
      const isFocused = () => props.group.id === focusedGroupId();
      const activeAgent = () => agentById(props.group.activeId);
      const isZoomed = () => zoomedId() === props.group.id;
      // The live drop zone if a tab drag is hovering THIS group, else undefined.
      const dropZone = (): DropZone | undefined => {
        const d = drag();
        return d?.target && d.target.groupId === props.group.id ? d.target : undefined;
      };
      const tabsZone = () => { const z = dropZone(); return z?.kind === 'tabs' ? z : undefined; };
      const edgeZone = () => { const z = dropZone(); return z?.kind === 'edge' ? z : undefined; };
      const isCenterZone = () => dropZone()?.kind === 'center';
      return (
        <div
          ref={(el) => groupRefs.set(props.group.id, el)}
          class="relative flex min-h-0 min-w-0 flex-col"
          style={{ flex: String(props.weight) }}
          onPointerDown={() => setFocusedGroupId(props.group.id)}
        >
          {/* The group as ONE unit: a single square-cornered bordered frame holding
              the tab strip flush on top of the pane — no gap, no rounding, no double
              border. Focus + needs-you rings live on this frame, not the inner parts. */}
          <div
            class={cn(
              'flex min-h-0 flex-1 flex-col overflow-hidden border-2',
              isFocused() ? 'border-muted-foreground/50' : 'border-border',
              activeAgent()?.needsAttention && 'border-ring/50',
            )}
          >
            {/* gutter doubles as the header: scrollable tab strip + a pinned right
                control cluster (needs-you pill when relevant + group expand/collapse) */}
            <div class="flex shrink-0 items-stretch bg-surface-strong">
              <div
                ref={(el) => tabStripRefs.set(props.group.id, el)}
                role="group"
                aria-label="Editor tabs"
                class="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto px-1.5"
              >
                <For each={colAgents(props.group)}>
                  {(agent) => (
                    <>
                      <Show when={tabsZone()?.beforeId === agent.id}>
                        <div class="h-5 w-0.5 shrink-0 self-center rounded-full bg-primary" aria-hidden="true" />
                      </Show>
                      <Tab group={props.group} colId={props.colId} agent={agent} />
                    </>
                  )}
                </For>
                <Show when={tabsZone() && tabsZone()!.beforeId === null}>
                  <div class="h-5 w-0.5 shrink-0 self-center rounded-full bg-primary" aria-hidden="true" />
                </Show>
              </div>
              {/* "New agent" button sits outside the tab group, beside it */}
              <div class="flex shrink-0 items-center gap-1 px-1.5">
                <button
                  type="button"
                  aria-label="New agent"
                  title="New agent"
                  onClick={(e) => { e.stopPropagation(); newAgent(props.group.id); }}
                  class="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                >
                  <Plus class="size-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={isZoomed() ? 'Restore section' : 'Maximize section'}
                  onClick={(e) => { e.stopPropagation(); toggleZoom(props.group.id); }}
                  class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-80 transition-colors hover:bg-hover hover:text-foreground hover:opacity-100"
                >
                  <Show when={isZoomed()} fallback={<Maximize2 class="size-5" aria-hidden="true" />}>
                    <Minimize2 class="size-5" aria-hidden="true" />
                  </Show>
                </button>
              </div>
            </div>
            {/* body — the active agent's content (no pane header; the gutter is the header) */}
            <div class="min-h-0 flex-1 overflow-y-auto">
              <Show
                when={activeAgent()}
                keyed
                fallback={
                  <div class="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Empty group
                  </div>
                }
              >
                {(a) => <AgentBody agent={a} />}
              </Show>
            </div>
            {/* composer footer, pinned below the body */}
            <Show when={activeAgent()} keyed>
              {(a) => (
                <div class="shrink-0 border-t border-border">
                  <Composer agent={a} />
                </div>
              )}
            </Show>
            {/* per-pane CONTEXT BAR: run status (left) + working context (right) */}
            <Show when={activeAgent()} keyed>
              {(a) => (
                <div class="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-3 py-1 text-[11px] text-muted-foreground">
                  {/* left: run status */}
                  <span class="flex min-w-0 items-center gap-2">
                    <span class={cn('inline-flex size-1.5 shrink-0 rounded-full bg-current', TONE_TEXT[a.status.tone])} aria-hidden="true" />
                    <Show when={a.status.label}>
                      <span class={cn('shrink-0 font-medium', TONE_TEXT[a.status.tone])}>{a.status.label}</span>
                    </Show>
                  </span>
                  {/* right: working context (only what's present) */}
                  <span class="flex shrink-0 items-center gap-3">
                    <Show when={a.dir}>
                      <span class="inline-flex items-center gap-1"><Folder class="size-3" aria-hidden="true" />{a.dir}</span>
                    </Show>
                    <Show when={a.branch}>
                      <span class="inline-flex items-center gap-1"><GitBranch class="size-3" aria-hidden="true" />{a.branch}</span>
                    </Show>
                    <Show when={a.runtime} keyed>
                      {(rt) => (
                        <span class={cn('inline-flex items-center gap-1', rt.kind === 'remote' && 'text-tool-blue')}>
                          <Show when={rt.kind === 'remote'} fallback={<Laptop class="size-3" aria-hidden="true" />}>
                            <Cloud class="size-3" aria-hidden="true" />
                          </Show>
                          {rt.host ?? rt.kind}
                        </span>
                      )}
                    </Show>
                  </span>
                </div>
              )}
            </Show>
          </div>
          {/* DRAG-TO-SPLIT / move overlay over the whole unit (square, to match). */}
          <Show when={dropZone() && dropZone()!.kind !== 'tabs'}>
            <div
              class={cn(
                'pointer-events-none absolute z-20 bg-primary/15 ring-2 ring-inset ring-primary transition-all',
                isCenterZone() && 'inset-0',
                edgeZone()?.edge === 'left' && 'inset-y-0 left-0 w-1/2',
                edgeZone()?.edge === 'right' && 'inset-y-0 right-0 w-1/2',
                edgeZone()?.edge === 'top' && 'inset-x-0 top-0 h-1/2',
                edgeZone()?.edge === 'bottom' && 'inset-x-0 bottom-0 h-1/2',
              )}
              aria-hidden="true"
            />
          </Show>
        </div>
      );
    };

    // One COLUMN: a slim header (pane count + a CLOSE-COLUMN control) over a
    // VERTICAL stack of its groups, with draggable row dividers between stacked
    // groups. The column's horizontal flex weight comes from colSizes; the inner
    // stack element is captured in colRefs so the row dividers can measure it.
    const ColumnView = (props: { col: Column; index: number }) => {
      const weights = () => rowSizes()[props.col.id] ?? props.col.groups.map(() => 1);
      return (
        <div
          class="flex h-full min-h-0 min-w-[260px] flex-col gap-1"
          style={{ flex: String(colSizes()[props.index] ?? 1) }}
        >
          <div ref={(el) => colRefs.set(props.col.id, el)} class="flex min-h-0 flex-1 flex-col">
            <For each={props.col.groups}>
              {(group, gi) => (
                <>
                  <Show when={gi() > 0}>
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      onPointerDown={startRowDrag(props.col.id, gi() - 1)}
                      class="group/rdiv relative my-0.5 h-1 shrink-0 cursor-row-resize"
                    >
                      <div class="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 rounded-full bg-border transition-colors group-hover/rdiv:bg-ring"></div>
                    </div>
                  </Show>
                  <GroupView group={group} colId={props.col.id} weight={weights()[gi()] ?? 1} />
                </>
              )}
            </For>
          </div>
        </div>
      );
    };

    // A draggable divider between two COLUMNS: shifts horizontal flex weight
    // between the pair as the operator drags. Weight is a fraction of the row
    // width, clamped so neither side collapses past ~12%.
    const startDrag = (pair: number) => (e: PointerEvent) => {
      e.preventDefault();
      const row = rowEl;
      if (!row) return;
      const rect = row.getBoundingClientRect();
      const sizes = [...colSizes()];
      const total = sizes.reduce((s, n) => s + n, 0) || 1;
      const startX = e.clientX;
      const a0 = sizes[pair] ?? 1;
      const b0 = sizes[pair + 1] ?? 1;
      const min = total * 0.12;
      const onMove = (ev: PointerEvent) => {
        const delta = ((ev.clientX - startX) / rect.width) * total;
        let a = a0 + delta;
        let b = b0 - delta;
        if (a < min) { b -= min - a; a = min; }
        if (b < min) { a -= min - b; b = min; }
        const nextSizes = [...colSizes()];
        nextSizes[pair] = a;
        nextSizes[pair + 1] = b;
        setColSizes(nextSizes);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };

    // A draggable divider between two STACKED GROUPS in a column: shifts vertical
    // flex weight between the pair as the operator drags, clamped so neither row
    // collapses past ~12%. Measures the column's group-stack element (colRefs).
    const startRowDrag = (colId: string, pair: number) => (e: PointerEvent) => {
      e.preventDefault();
      const stack = colRefs.get(colId);
      if (!stack) return;
      const rect = stack.getBoundingClientRect();
      const sizes = [...(rowSizes()[colId] ?? [])];
      const total = sizes.reduce((s, n) => s + n, 0) || 1;
      const startY = e.clientY;
      const a0 = sizes[pair] ?? 1;
      const b0 = sizes[pair + 1] ?? 1;
      const min = total * 0.12;
      const onMove = (ev: PointerEvent) => {
        const delta = ((ev.clientY - startY) / rect.height) * total;
        let a = a0 + delta;
        let b = b0 - delta;
        if (a < min) { b -= min - a; a = min; }
        if (b < min) { a -= min - b; b = min; }
        const nextSizes = [...(rowSizes()[colId] ?? [])];
        nextSizes[pair] = a;
        nextSizes[pair + 1] = b;
        setRowSizes({ ...rowSizes(), [colId]: nextSizes });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };

    // The editor-group row: resizable columns with draggable dividers.
    const ColumnsRow = () => (
      <div ref={rowEl} class="flex h-full min-h-0 gap-0 overflow-x-auto p-2">
        <For each={columns()}>
          {(col, i) => (
            <>
              <Show when={i() > 0}>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={startDrag(i() - 1)}
                  class="group/div relative mx-0.5 w-1 shrink-0 cursor-col-resize"
                >
                  <div class="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-border transition-colors group-hover/div:bg-ring"></div>
                </div>
              </Show>
              <ColumnView col={col} index={i()} />
            </>
          )}
        </For>
      </div>
    );

    // The maximized GROUP (⌥Z / the gutter expand control). Renders the whole group
    // full-screen — its tab strip stays, so you can still switch tabs within it.
    const ZoomGroup = (props: { id: string }) => {
      const loc = () => findGroup(props.id);
      return (
        <div class="flex h-full min-h-0 flex-col p-2">
          <Show when={loc()} keyed fallback={<RestoreAll />}>
            {(l) => <GroupView group={l.group} colId={l.col.id} weight={1} />}
          </Show>
        </div>
      );
    };

    // The shell follows the Storybook light/dark toggle — every token flips, and
    // the kai-* shadow roots track the toggle via the preview decorator. The only
    // pinned-dark surfaces are the Browser view's previews (dark apps being
    // previewed, independent of the IDE chrome) — each carries its own dark styles
    // in an isolated `data:` iframe, so it stays dark in either theme.
    return (
      <div class="flex h-screen w-full flex-col bg-background text-foreground">
        {/* desktop chrome */}
        <header class="relative flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div class="flex items-center gap-2">
            <Boxes class="size-5 text-primary" />
            <span class="text-sm font-semibold tracking-tight">AMUX</span>
          </div>
          {/* TOP-LEVEL view toggle: AGENTS or the full-screen BROWSER, centered in the
              bar. Distinct from the within-Agents tier switcher. The Browser side
              carries a count badge of open preview tabs. */}
          <div class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5">
            <button
              type="button"
              aria-pressed={topView() === 'agents'}
              onClick={() => setTopView('agents')}
              class={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                topView() === 'agents' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Boxes class="size-4" aria-hidden="true" /> Agents
            </button>
            <button
              type="button"
              aria-pressed={topView() === 'browser'}
              onClick={() => setTopView('browser')}
              class={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                topView() === 'browser' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Globe class="size-4" aria-hidden="true" /> Browser
              <Show when={browserTabs().length > 0}>
                <span class="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold leading-none text-primary-foreground">
                  {browserTabs().length}
                </span>
              </Show>
            </button>
          </div>
          <div class="flex items-center gap-2">
            {/* command palette: the browser-safe universal entry (⌘K) */}
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              aria-label="Search commands"
              class="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-hover hover:text-foreground sm:min-w-[13rem]"
            >
              <Search class="size-4 shrink-0" aria-hidden="true" />
              <span>Search…</span>
              <kai-kbd keys="Mod+K" platform="mac" class="ml-auto"></kai-kbd>
            </button>
            {/* attention routing: a header count that opens a dropdown of needs-you agents */}
            <Show when={attentionCount() > 0}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={attnOpen()}
                aria-label={`${attentionCount()} agents waiting on you`}
                onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setAttnPos({ x: r.right, y: r.bottom }); setAttnOpen((o) => !o); }}
                class="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
              >
                <Bell class="size-5" aria-hidden="true" />
                <span class="text-xs font-semibold tabular-nums text-tool-blue">{attentionCount()}</span>
              </button>
              <Show when={attnOpen() && attnPos()} keyed>
                {(pos) => (
                  <Portal>
                    <div class="fixed inset-0 z-40" aria-hidden="true" onClick={() => setAttnOpen(false)} />
                    <div
                      role="menu"
                      class="fixed z-50 w-64 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                      style={{ left: `${Math.max(8, pos.x - 256)}px`, top: `${pos.y + 6}px` }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <For each={live().filter((a) => a.needsAttention)}>
                        {(a) => (
                          <button
                            type="button"
                            onClick={() => { setAttnOpen(false); jumpToAgent(a.id); }}
                            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-popover-foreground transition-colors hover:bg-hover"
                          >
                            <span class={cn('inline-flex size-1.5 shrink-0 rounded-full bg-current', TONE_TEXT[a.status.tone])} aria-hidden="true" />
                            <span class="min-w-0 flex-1 truncate font-medium">{agentName(a.id)}</span>
                            <Show when={a.status.label}>
                              <span class={cn('shrink-0', TONE_TEXT[a.status.tone])}>{a.status.label}</span>
                            </Show>
                          </button>
                        )}
                      </For>
                    </div>
                  </Portal>
                )}
              </Show>
            </Show>
            {/* broadcast: opens a mock modal composer that fans out to every agent */}
            <kai-tooltip content="Message all agents">
              <kai-button
                ref={(el) => { el.addEventListener('kai-click', () => setBroadcastOpen(true)); }}
                variant="ghost"
                size="icon"
                label="Message all agents"
              >
                <Megaphone slot="icon" class="size-4" />
              </kai-button>
            </kai-tooltip>
            <kai-tooltip content="Settings">
              <kai-button variant="ghost" size="icon" icon="settings" label="Settings"></kai-button>
            </kai-tooltip>
          </div>
        </header>

        {/* THE SPLIT: a real two-region kai-resizable (rail | center). The center
            holds the TOP-LEVEL Agents / Browser views; the browser is full-screen,
            so there's no third utility region. */}
        <div class="min-h-0 flex-1">
          <kai-resizable orientation="horizontal" class="block h-full">
            {/* LEFT — workspaces rail */}
            <kai-resizable-item size="280px" min="180px" max="340px">
              <aside class="flex h-full flex-col bg-surface">
                <Show when={railTab() === 'agents'}>
                  <div class="flex min-h-0 flex-1 flex-col">
                    <div class="flex shrink-0 items-center justify-between px-3 pt-3 pb-1">
                      <span class="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Workspaces</span>
                      <kai-tooltip content="New workspace">
                        <kai-button variant="ghost" size="icon" icon="plus" label="New workspace"></kai-button>
                      </kai-tooltip>
                    </div>
                    <div class="max-h-[45%] shrink-0 overflow-y-auto px-2 py-1">
                      <For each={workspaces()}>
                        {(w) => (
                          // Outer div carries hover group + visual state; the selectable
                          // area is a plain button so the close button can be a sibling
                          // without triggering nested-interactive a11y violations.
                          <div
                            class="group/ws flex items-center rounded-md text-sm transition-colors"
                            classList={{
                              'bg-accent text-foreground': workspace() === w.id,
                              'text-muted-foreground hover:bg-hover hover:text-foreground': workspace() !== w.id,
                            }}
                          >
                            <button
                              type="button"
                              aria-label={`Select ${w.label}`}
                              onClick={() => setWorkspace(w.id)}
                              class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 bg-transparent px-2 py-1.5 text-left text-inherit"
                            >
                              <span class={cn('size-1.5 shrink-0 rounded-full', w.status ? 'bg-ring' : 'bg-muted-foreground/40')} aria-hidden="true" />
                              <span class="min-w-0 flex-1 truncate">{w.label}</span>
                              <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{w.meta}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`Close ${w.label}`}
                              onClick={(e) => { e.stopPropagation(); setConfirmCloseWs(w.id); }}
                              class="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors hover:bg-hover hover:text-foreground group-hover/ws:opacity-100"
                            >
                              <X class="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                    <div class="mx-3 my-1 h-px shrink-0 bg-border" aria-hidden="true"></div>
                    <div class="shrink-0 px-3 pt-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Agents</div>
                    <div class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
                      <For each={live()}>
                        {(a) => (
                          // Outer div carries hover group + visual state; the selectable
                          // area is a plain button so the close button can be a sibling
                          // without triggering nested-interactive a11y violations.
                          <div
                            class="group/pane flex w-full items-center rounded-md text-sm transition-colors"
                            classList={{
                              'bg-accent text-foreground': focusedPaneId() === a.id,
                              'text-muted-foreground hover:bg-hover hover:text-foreground': focusedPaneId() !== a.id,
                            }}
                          >
                            <button
                              type="button"
                              aria-label={`Focus ${agentName(a.id)}`}
                              onClick={() => jumpToAgent(a.id)}
                              class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 bg-transparent px-2 py-1.5 text-left text-inherit"
                            >
                              <span class={cn('size-1.5 shrink-0 rounded-full bg-current', TONE_TEXT[a.status.tone])} aria-hidden="true" />
                              <span class="w-4 shrink-0 text-center text-[11px] font-bold leading-none tabular-nums text-muted-foreground">{agentNumber(a.id)}</span>
                              <span class="min-w-0 flex-1 truncate">{agentName(a.id)}</span>
                              <Show when={a.runtime} keyed>
                                {(rt) => (
                                  <Show when={rt.kind === 'remote'} fallback={<Laptop class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}>
                                    <Cloud class="size-3.5 shrink-0 text-tool-blue" aria-hidden="true" />
                                  </Show>
                                )}
                              </Show>
                            </button>
                            <button
                              type="button"
                              aria-label={`Close ${agentName(a.id)}`}
                              onClick={(e) => { e.stopPropagation(); closeTab(a.id); }}
                              class="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors hover:bg-hover hover:text-foreground group-hover/pane:opacity-100"
                            >
                              <X class="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
                <Show when={railTab() === 'files'}>
                  <div class="flex min-h-0 flex-1 flex-col">
                    <div class="shrink-0 px-3 pt-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Files</div>
                    <div class="min-h-0 flex-1 overflow-hidden px-1 pb-2">
                      <kai-file-tree ref={(el) => { (el as El).files = SAMPLE_FILES; }}></kai-file-tree>
                    </div>
                  </div>
                </Show>
                <div class="flex shrink-0 items-center gap-1 border-t border-border px-2 py-1.5">
                  <button
                    type="button"
                    aria-label="Workspaces & agents"
                    onClick={() => setRailTab('agents')}
                    class={cn('flex size-8 items-center justify-center rounded-md transition-colors', railTab() === 'agents' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground')}
                  >
                    <Layers class="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Files"
                    onClick={() => setRailTab('files')}
                    class={cn('flex size-8 items-center justify-center rounded-md transition-colors', railTab() === 'files' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground')}
                  >
                    <Folder class="size-4" aria-hidden="true" />
                  </button>
                </div>
              </aside>
            </kai-resizable-item>

            {/* CENTER — fills everything but the rail. The TOP-LEVEL toggle swaps
                between AGENTS (the view-mode area: a Segmented switcher over
                workspace | focus | list) and the full-screen BROWSER. */}
            <kai-resizable-item min="460px">
              <Switch>
                {/* AGENTS — the editor-group tiering, now full-width. */}
                <Match when={topView() === 'agents'}>
                  <div class="flex h-full flex-col">
                {/* the active view — the editor-group: resizable columns, each a tab
                    strip + the active agent's Pane. Zoom replaces the row with a
                    single maximized Pane. */}
                <div class="min-h-0 flex-1">
                  <Show when={columns().length > 0} fallback={<RestoreAll />}>
                    <Show when={zoomedId()} keyed fallback={<ColumnsRow />}>
                      {(id) => <ZoomGroup id={id} />}
                    </Show>
                  </Show>
                </div>
                  </div>
                </Match>

                {/* BROWSER — a FULL-SCREEN kai-artifact (address bar / back-forward
                    / reload / displayUrl) with a hand-rolled preview TAB STRIP above
                    it: one tab per open preview, owned by whichever agent opened it.
                    Composition (artifact + strip), not a monolith. The previewed
                    apps are themselves DARK, carried in isolated `data:` iframes. */}
                <Match when={topView() === 'browser'}>
                  <div class="flex h-full min-h-0 flex-col">
                    {/* Outer strip: a tab group + "Open preview" button as siblings so the
                        group never owns a non-tab interactive child (aria-required-children
                        fix). overflow-x-auto scopes to just the group so the add button stays pinned. */}
                    <div class="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
                    <div role="group" aria-label="Browser tabs" class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                      <For each={browserTabs()}>
                        {(tab) => (
                          // Button-group: the activator and the close button are sibling
                          // <button>s, so the strip never owns a non-tab interactive child.
                          <div class="group/btab flex shrink-0 items-stretch">
                            <button
                              type="button"
                              aria-current={tab.id === activeBrowserTab() ? "true" : undefined}
                              onClick={() => setActiveBrowserTab(tab.id)}
                              class={cn(
                                'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md py-1 pl-2 pr-1 text-xs transition-colors',
                                tab.id === activeBrowserTab()
                                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                                  : 'text-muted-foreground hover:bg-hover hover:text-foreground',
                              )}
                            >
                              <Globe class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                              <span class="max-w-[12rem] truncate font-medium">{tab.title}</span>
                            </button>
                            {/* close button is a sibling of the tab activator, not a descendant */}
                            <button
                              type="button"
                              aria-label={`Close ${tab.title}`}
                              onClick={(e) => { e.stopPropagation(); closeBrowserTab(tab.id); }}
                              class={cn(
                                'ml-0.5 flex size-5 shrink-0 items-center justify-center self-center rounded text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground',
                                tab.id === activeBrowserTab() ? 'opacity-100' : 'opacity-0 group-hover/btab:opacity-100',
                              )}
                            >
                              <X class="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                    {/* "Open preview" button sits outside the tab group, beside it */}
                    <kai-tooltip content="Open a preview for the focused agent">
                      <button
                        type="button"
                        aria-label="Open preview"
                        onClick={() => openPreview()}
                        class="ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-ring hover:bg-hover hover:text-foreground"
                      >
                        <Plus class="size-4" aria-hidden="true" />
                      </button>
                    </kai-tooltip>
                    </div>
                    <div class="min-h-0 flex-1">
                      <Show
                        when={activeBrowserTabData()}
                        keyed
                        fallback={
                          <div class="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                            No previews open.
                            <kai-button ref={(el) => { el.addEventListener('kai-click', () => openPreview()); }} variant="outline" size="sm" icon="plus">Open preview</kai-button>
                          </div>
                        }
                      >
                        {(tab) => (
                          <kai-artifact
                            ref={(el) => {
                              const art = el as El;
                              art.src = tab.src;
                              art.displayUrl = tab.url;
                              art.iframeTitle = tab.title;
                              art.noTabs = true;
                              art.openInTab = true;
                            }}
                            style={{ display: 'block', height: '100%' }}
                          ></kai-artifact>
                        )}
                      </Show>
                    </div>
                  </div>
                </Match>
              </Switch>
            </kai-resizable-item>
          </kai-resizable>
        </div>

        {/* status bar — key commands + live counts */}
        <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-3 py-2 text-[13px] text-muted-foreground">
          <button type="button" onClick={() => setShortcutsOpen(true)} class="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
            <Keyboard class="size-3.5" aria-hidden="true" />
            Keyboard shortcuts
          </button>
          <span class="flex shrink-0 items-center gap-3">
            <Show when={live().filter((a) => a.needsAttention).length > 0}>
              <span class="font-medium text-tool-blue">
                {live().filter((a) => a.needsAttention).length} waiting on you
              </span>
            </Show>
            <span>{live().length} {live().length === 1 ? 'agent' : 'agents'}</span>
          </span>
        </footer>

        {/* command palette: a light-DOM overlay hosting kai-command. Opened by ⌘K or
            the header button; closes on backdrop click, Escape, or a selection. */}
        <Show when={cmdOpen()}>
          <div
            class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[14vh]"
            onClick={() => setCmdOpen(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') setCmdOpen(false); }}
          >
            <div
              class="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <kai-command
                ref={(el) => {
                  (el as El).items = commandItems();
                  el.addEventListener('kai-select', (e) => onCommandSelect((e as CustomEvent).detail.id));
                  queueMicrotask(() => (el as El).focus?.());
                }}
                placeholder="Search agents, workspaces, actions..."
              ></kai-command>
            </div>
          </div>
        </Show>

        {/* broadcast composer — dogfoods kai-dialog (it owns the backdrop, focus-trap, and Escape) */}
        <kai-dialog
          ref={(el: HTMLElement & { open?: boolean }) => {
            createEffect(() => { el.open = broadcastOpen(); });
            el.addEventListener('kai-open-change', (e) =>
              setBroadcastOpen((e as CustomEvent<{ open: boolean }>).detail.open),
            );
          }}
        >
          <span slot="header" class="inline-flex items-center gap-2 text-sm font-semibold">
            <Megaphone class="size-4 text-primary" /> Message all agents
          </span>
          <kai-prompt-input
            ref={(el) => { (el as El).attach = false; }}
            class="block"
            placeholder={`Message all ${live().length} agents...`}
          ></kai-prompt-input>
          <div slot="footer" class="flex justify-end">
            <kai-button
              ref={(el) => { el.addEventListener('kai-click', () => setBroadcastOpen(false)); }}
              variant="default"
              size="sm"
            >
              Send to all {live().length} agents
            </kai-button>
          </div>
        </kai-dialog>

        {/* keyboard shortcuts — dogfoods kai-dialog (backdrop, focus-trap, Escape) */}
        <kai-dialog
          ref={(el: HTMLElement & { open?: boolean }) => {
            createEffect(() => { el.open = shortcutsOpen(); });
            el.addEventListener('kai-open-change', (e) =>
              setShortcutsOpen((e as CustomEvent<{ open: boolean }>).detail.open),
            );
          }}
        >
          <span slot="header" class="inline-flex items-center gap-2 text-sm font-semibold">
            <Keyboard class="size-4 text-primary" /> Keyboard shortcuts
          </span>
          <div class="flex flex-col gap-4">
            <For each={([
              { title: 'Navigation', items: [
                { combo: 'Mod+K', label: 'Search / command palette' },
                { text: '⌥1–8', label: 'Jump to agent' },
              ] },
              { title: 'Layout', items: [
                { text: '⌥⇧←/→', label: 'Move pane to column (new column at the edge)' },
                { text: '⌥⇧↑/↓', label: 'Move pane to row (new row at the edge)' },
                { combo: 'Alt+Z', label: 'Maximize / restore group' },
              ] },
              { title: 'View', items: [
                { combo: 'Alt+B', label: 'Toggle Browser' },
              ] },
              { title: 'Tabs', items: [
                { text: 'Right-click', label: 'Rename / Split / Move / Close' },
                { text: 'Esc', label: 'Close menu / restore' },
              ] },
            ] as { title: string; items: { combo?: string; text?: string; label: string }[] }[])}>
              {(group) => (
                <div class="flex flex-col gap-0.5">
                  <h3 class="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</h3>
                  <For each={group.items}>
                    {(item) => (
                      <div class="flex items-center justify-between gap-4 py-1 text-sm">
                        <span>{item.label}</span>
                        <Show when={item.combo} fallback={<kai-kbd>{item.text}</kai-kbd>}>
                          {(combo) => <kai-kbd keys={combo()} platform="mac"></kai-kbd>}
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </kai-dialog>

        {/* confirm closing a workspace — dogfoods kai-dialog */}
        <kai-dialog
          ref={(el) => {
            createEffect(() => { (el as El).open = confirmCloseWs() != null; });
            el.addEventListener('kai-open-change', (e) => { if (!(e as CustomEvent).detail.open) setConfirmCloseWs(null); });
          }}
        >
          <span slot="header" class="text-sm font-semibold">Close workspace?</span>
          <p class="text-sm text-muted-foreground">
            {workspaces().find((w) => w.id === confirmCloseWs())?.label ?? 'This workspace'} will be removed from your workspaces.
          </p>
          <div slot="footer" class="flex justify-end gap-2">
            <kai-button ref={(el) => el.addEventListener('kai-click', () => setConfirmCloseWs(null))} variant="ghost" size="sm">Cancel</kai-button>
            <kai-button ref={(el) => el.addEventListener('kai-click', () => { const id = confirmCloseWs(); if (id) closeWorkspace(id); setConfirmCloseWs(null); })} variant="default" size="sm">Close workspace</kai-button>
          </div>
        </kai-dialog>

        {/* drag ghost: a floating mini-tab that trails the pointer during a tab drag */}
        <Show when={drag()}>
          {(d) => (
            <Show when={agentById(d().agentId)}>
              {(agent) => (
                <div
                  class="pointer-events-none fixed z-[60] flex items-center gap-1.5 rounded-none border border-border bg-background px-2 py-1 text-xs shadow-lg"
                  style={{ left: `${d().x + 12}px`, top: `${d().y + 12}px` }}
                >
                  <span
                    class={cn('shrink-0 text-[11px] font-bold leading-none tabular-nums', TONE_TEXT[agent().status.tone])}
                    aria-hidden="true"
                  >
                    {agentNumber(agent().id)}
                  </span>
                  <span class="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
                  <span class="font-medium">{agentName(agent().id)}</span>
                </div>
              )}
            </Show>
          )}
        </Show>
      </div>
    );
  },
  play: async () => {
    // Let the onMount toasts' fade-in (animate-in fade-in-0) settle before the
    // a11y/axe pass; otherwise axe samples them mid-fade and reads the near-black
    // toast text as a low-contrast ~#a8a8a9 (black composited at partial opacity).
    const settled = () => {
      const region = document.querySelector('kai-toast-region');
      const toastEls = region?.shadowRoot?.querySelectorAll('[role="status"]') ?? [];
      if (!toastEls.length) return false;
      return Array.from(toastEls).every(
        (el) => Number(getComputedStyle(el as HTMLElement).opacity) > 0.99,
      );
    };
    const start = Date.now();
    while (!settled() && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // Safety margin in case the region/shadow isn't queryable in the test env.
    await new Promise((r) => setTimeout(r, 150));
  },
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        // A representative COMPOSITION skeleton (not the full interactive render). An
        // IDE-style shell: a header (centered Agents/Browser toggle + ⌘K search + needs-you
        // bell) over a kai-resizable [ activity-bar rail | center ]. The center tiles editor
        // GROUPS — a tab gutter that doubles as the header, the active agent's body, a
        // composer, and a context bar; Browser is a full-screen kai-artifact. The 2-level
        // tiling, drag-to-split, tab reorder + rename are the app's own logic. kai-command
        // (⌘K), kai-dialog (modals), kai-file-tree (explorer) + toast() round it out.
        code: `// AMUX — an IDE-style shell COMPOSED from kit elements.
// The kit provides the building blocks; the 2-level tiling, drag-to-split, tab
// reorder + rename are your app's own logic (abbreviated here as <Group>/<Tab>/…).
import '@kitn.ai/ui/elements';                 // registers the kai-* elements
import { toast } from '@kitn.ai/ui/elements';  // imperative notifications

// Agents carry their own working context; the UI just reflects it.
type Agent = {
  id: string; name: string;
  status: { tone: 'working'|'idle'|'done'|'error'|'blocked'; label?: string };
  dir?: string; branch?: string; runtime?: { kind: 'local'|'remote'; host?: string };
};

<div class="flex h-screen flex-col">
  {/* HEADER: brand · centered Agents⇄Browser toggle · needs-you bell · ⌘K search · broadcast */}
  <header class="relative flex items-center justify-between">
    <Brand />
    <ViewToggle value={topView()} onChange={setTopView} />            {/* absolutely centered */}
    <div class="flex items-center gap-2">
      <NeedsYouBell count={needsYou().length} onPick={jumpToAgent} /> {/* dropdown to pick one */}
      <SearchButton onClick={() => setCmdOpen(true)} />               {/* opens kai-command */}
      <kai-button icon="megaphone" onkai-click={() => setBroadcastOpen(true)} />
    </div>
  </header>

  {/* BODY: resizable [ activity-bar rail | center ] */}
  <kai-resizable orientation="horizontal" class="flex-1">
    <kai-resizable-item size="280px" min="180px">
      <Show when={railTab() === 'agents'}>
        <WorkspaceList />    {/* name · status dot · count · hover-× → close-confirm kai-dialog */}
        <OpenPanesList />    {/* dot · key# · name · local/remote · click jumps, × closes */}
      </Show>
      <Show when={railTab() === 'files'}>
        <kai-file-tree files={files} onkai-select={(e) => openFile(e.detail.path)} />
      </Show>
      <RailTabs value={railTab()} onChange={setRailTab} />            {/* bottom icon strip: Layers | Files */}
    </kai-resizable-item>

    <kai-resizable-item min="460px">
      <Switch>
        {/* AGENTS — resizable COLUMNS, each a stack of editor GROUPS (your tiling logic) */}
        <Match when={topView() === 'agents'}>
          <For each={columns()}>{(col) =>
            <Column>
              <For each={col.groups}>{(group) =>
                <Group focused={group.id === focusedGroupId()}>
                  {/* the tab gutter IS the header */}
                  <Gutter>
                    <For each={group.agentIds}>{(id) =>
                      <Tab agent={byId(id)} onContextMenu={openTabMenu} />  {/* rename·split·move·close */}
                    }</For>
                    <button onClick={() => spawnAgent(group.id)}>＋</button>  {/* new agent */}
                    <button onClick={() => toggleZoom(group.id)}>⤢</button>   {/* maximize group */}
                  </Gutter>
                  <AgentBody agent={active(group)} />
                  <kai-prompt-input />                                  {/* the composer */}
                  <ContextBar agent={active(group)} />                  {/* status · dir · branch · runtime */}
                </Group>
              }</For>
            </Column>
          }</For>
        </Match>

        {/* BROWSER — full-screen kai-artifact + your own preview tab strip */}
        <Match when={topView() === 'browser'}>
          <PreviewTabs tabs={browserTabs()} />
          <kai-artifact src={activeTab().src} displayUrl={activeTab().url} noTabs />
        </Match>
      </Switch>
    </kai-resizable-item>
  </kai-resizable>

  {/* STATUS BAR — "Keyboard shortcuts" opens a kai-dialog; live counts */}
  <StatusBar onShortcuts={() => setShortcutsOpen(true)} agents={live().length} needsYou={needsYou().length} />
</div>

{/* Every modal is a kai-dialog: broadcast composer · shortcuts reference · close-workspace confirm */}
<kai-dialog open={broadcastOpen()}> … </kai-dialog>

{/* ⌘K palette covers every nav + pane op (go to agent, switch workspace, split/move, zoom, …) */}
<kai-command items={commandItems()} onkai-select={(e) => run(e.detail.id)} />

// Browser-safe keyboard (browsers reserve Cmd/Ctrl+number):
//   ⌘K palette · ⌥1–9 jump · ⌥Z maximize group · ⌥B browser
//   ⌥⇧←→ move pane across columns (split at edge) · ⌥⇧↑↓ across rows · Esc restore/close
// Notifications via the imperative toast() store.`,
      },
    },
  },
};
