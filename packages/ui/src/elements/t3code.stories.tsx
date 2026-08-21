import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import './register'; // every kai-* element used below
import t3Favicon from './logos/t3.ico'; // the gathered t3 brand mark, for the real-domain project rows
import type { KaiNavItem } from '../ui/nav';
import type { KaiCommandItem } from './command';

// Labs/Apps: a second dogfood — "T3 Code", a desktop control plane for coding
// agents (think an Electron shell). Built on the re-cast kai-workspace SHELL
// (five layout slots; the whole rail is the consumer's own column in `start` —
// a projects -> threads kai-nav, not a conversation list, which is exactly what
// the chat-agnostic shell allows) + the kai-* elements exactly as a consumer
// would: a projects -> threads tree, an agent thread, and a composer. It is
// INTERACTIVE (like the Claude Code Desktop story): createSignal state +
// ref-callback wiring. Search opens a kai-command palette, the action-bar
// carets open real kai-menus, the single rail toggle drives the shell's
// toggleAside API, and selecting a thread swaps the header. Every surface is
// assembled from real kai-* elements the way a consumer would wire them.

// kai-file-tree, kai-command, and kai-tooltip are used here as JSX elements
// without their own story facades, so declare their tags locally. The other kai-*
// tags are declared (identically) by sibling story files; redeclaring them here
// keeps the file self-documenting (TypeScript merges identical global
// augmentations — the types must match byte-for-byte across files or it errors
// TS2717).
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-workspace': JSX.HTMLAttributes<HTMLElement> & { 'collapse-below'?: string | number; 'drawer-below'?: string | number };
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-nav': JSX.HTMLAttributes<HTMLElement> & { value?: string; 'default-value'?: string; theme?: string };
      'kai-menu': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'trigger-icon'?: string; 'trigger-label'?: string; 'trigger-icon-trailing'?: string; label?: string; full?: boolean };
      'kai-badge': JSX.HTMLAttributes<HTMLElement> & { variant?: string };
      'kai-message': JSX.HTMLAttributes<HTMLElement>;
      'kai-prompt-input': JSX.HTMLAttributes<HTMLElement> & { theme?: string; placeholder?: string; loading?: boolean; disabled?: boolean; voice?: boolean; 'web-search'?: boolean; attach?: boolean; submit?: string; 'suggestion-mode'?: string };
      'kai-model-switcher': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'current-model'?: string };
      'kai-separator': JSX.HTMLAttributes<HTMLElement> & { orientation?: string };
      'kai-file-tree': JSX.HTMLAttributes<HTMLElement>;
      'kai-command': JSX.HTMLAttributes<HTMLElement> & { placeholder?: string; 'empty-label'?: string; theme?: string };
      'kai-tooltip': JSX.HTMLAttributes<HTMLElement> & { content?: string; 'open-delay'?: number | string };
    }
  }
}

const meta = { title: 'Labs/Apps', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;
type El = HTMLElement & Record<string, unknown>;

// The sidebar is ONE nested kai-nav: each project is a collapsible group and its
// threads are `children`. Per thread, `meta` is a right-aligned relative time, and
// `status` (a colored dot + label) marks the two LIVE threads only — t3chat's top
// row is Completed (success) and lawn's is Working (info + pulse); every other
// thread is just a title + time. kai-nav's `icon` accepts a named icon, an image
// URL/data-URI, or plain text, so the real-domain projects (t3chat, t3.gg) pass the
// gathered t3 brand favicon (imported via Vite) and the fictional projects keep the
// closest curated lucide glyph.
const PROJECTS: KaiNavItem[] = [
  { id: 't3chat', label: 't3chat', icon: t3Favicon, children: [
    { id: 'streaming-md', label: 'Streaming markdown fix', status: { tone: 'success', label: 'Completed' }, meta: 'just now' },
    { id: 'model-picker', label: 'Model picker polish', meta: '1m ago' },
  ] },
  { id: 'lawn', label: 'lawn', icon: 'box', children: [
    { id: 'lawn-schedule', label: 'Fix watering schedule', status: { tone: 'info', label: 'Working', pulse: true }, meta: 'just now' },
    { id: 'lawn-zones', label: 'Zone calibration', meta: '16h ago' },
  ] },
  { id: 't3-gg', label: 't3.gg', icon: t3Favicon, children: [
    { id: 'codebase-overview', label: 'Codebase overview', meta: '24d ago' },
    { id: 'add-sitemap', label: 'Add sitemap and robots.txt', meta: '24d ago' },
    { id: 'astro-5', label: 'Upgrade to Astro 5', meta: '23d ago' },
    { id: 'og-images', label: 'OG image generation', meta: '23d ago' },
    { id: 'social-links', label: 'Shared social links module', meta: '25d ago' },
    { id: 'rss-feed', label: 'Add RSS feed', meta: '26d ago' },
    { id: 't3-gg-more', label: 'Show more', icon: 'chevron-down' },
  ] },
  { id: 'quickpic', label: 'quickpic', icon: 'monitor', children: [
    { id: 'crop-preview', label: 'Crop preview regression', meta: '3d ago' },
  ] },
  { id: 'azure-bench', label: 'azure-bench', icon: 'briefcase', children: [
    { id: 'cold-starts', label: 'Benchmark azure cold starts', meta: '24d ago' },
  ] },
  { id: 'dumb-harness', label: 'dumb-harness', icon: 'workflow', children: [
    { id: 'harness-retry', label: 'Harness retry backoff', meta: '5d ago' },
  ] },
  { id: 't3code-1', label: 't3code-1', icon: 'code', children: [
    { id: 't3code1-boot', label: 'Bootstrap workspace', meta: '30d ago' },
  ] },
  { id: 'fishslop-gpt-5-4', label: 'fishslop-gpt-5-4', icon: 'sparkles', children: [
    { id: 'fishslop-eval-51', label: 'Eval run 51', meta: '2h ago' },
  ] },
  { id: 'fishslop-opus-4-7', label: 'fishslop-opus-4-7', icon: 'smile', children: [
    { id: 'opus-eval-47', label: 'Opus eval run 47', meta: '1d ago' },
  ] },
  { id: 't3code-2', label: 't3code-2', icon: 'code', children: [
    { id: 't3code2-retry', label: 'Retry backoff tuning', meta: '1d ago' },
  ] },
];

// Projects that start collapsed (kai-nav `defaultCollapsed` seeds the closed set;
// groups otherwise default to expanded).
const COLLAPSED_PROJECTS = ['quickpic', 'azure-bench', 'dumb-harness', 't3code-1'];

// Thread id -> { title, project } for the action bar. Only real threads (leaves
// with a `meta` time) go in the map; the "Show more" affordance is excluded, so
// selecting it never swaps the header.
const THREAD_INFO = new Map<string, { title: string; project: string }>();
for (const project of PROJECTS) {
  for (const thread of project.children ?? []) {
    if (thread.meta) THREAD_INFO.set(thread.id, { title: thread.label ?? thread.id, project: project.label ?? project.id });
  }
}

// The agent turn: a markdown table + a prose line, rendered by the kit's own
// markdown (kai-message). GFM tables are supported, so this is real content,
// not a faked table.
const OVERVIEW_MD = `| Change | File | Notes |
| --- | --- | --- |
| robots.txt | public/robots.txt | allows all crawlers |
| Sitemap | astro.config.mjs | added @astrojs/sitemap |
| Shared socialLinks | src/lib/constants.ts | single source of truth |

Wired the sitemap integration and pulled the shared social links into one constants module, so every layout now reads them from a single place.`;

// The changed files. kai-file-tree builds a real collapsible folder/file tree
// from these `/`-delimited paths AND now decorates each with diff metadata:
// `additions` / `deletions` render as trailing +N / -N stats, and `status`
// ('added'|'modified'|'deleted'|'renamed'|'untracked') paints the conventional
// VCS status letter. With the `summary` flag (set in the ref) the element draws
// its own header: the changed-file count, the summed +/- totals, and a
// Collapse-all toggle. The per-file numbers below sum to +31 / -17.
const CHANGED_FILES = [
  { path: 'public/robots.txt', additions: 4, deletions: 0, status: 'added' as const },
  { path: 'src/layouts/BaseLayout.astro', additions: 6, deletions: 4, status: 'modified' as const },
  { path: 'src/lib/constants.ts', additions: 8, deletions: 2, status: 'modified' as const },
  { path: 'src/pages/index.astro', additions: 3, deletions: 5, status: 'modified' as const },
  { path: 'astro.config.mjs', additions: 5, deletions: 1, status: 'modified' as const },
  { path: 'bun.lock', additions: 4, deletions: 5, status: 'modified' as const },
  { path: 'package.json', additions: 1, deletions: 0, status: 'modified' as const },
];

// Command-palette contents (the kai-command `items` prop). A flat
// KaiCommandItem[]; the element buckets them into sections by `group`.
const COMMANDS: KaiCommandItem[] = [
  { id: 'new-thread', label: 'New thread', icon: 'square-pen', group: 'Quick actions' },
  { id: 'add-folder', label: 'Add folder', icon: 'plus', group: 'Quick actions' },
  { id: 'commit-push', label: 'Commit & push', icon: 'github', group: 'Quick actions' },
  { id: 'open-editor', label: 'Open in editor', icon: 'code', group: 'Quick actions' },
  { id: 'pr-t3gg', label: 't3.gg', icon: 'globe', group: 'Projects' },
  { id: 'pr-t3chat', label: 't3chat', icon: 'message-square', group: 'Projects' },
  { id: 'pr-quickpic', label: 'quickpic', icon: 'monitor', group: 'Projects' },
  { id: 'th-overview', label: 'Codebase overview', icon: 'message-square', group: 'Recent threads' },
  { id: 'th-sitemap', label: 'Add sitemap and robots.txt', icon: 'message-square', group: 'Recent threads' },
  { id: 'th-retry', label: 'Harness retry backoff', icon: 'message-square', group: 'Recent threads' },
  { id: 'go-settings', label: 'Settings', icon: 'settings', group: 'Go to' },
  { id: 'go-build', label: 'Build', icon: 'workflow', group: 'Go to' },
];

export const T3Code: Story = {
  name: 'T3 Code',
  render: () => {
    const [activeThread, setActiveThread] = createSignal('codebase-overview');
    const [cmdOpen, setCmdOpen] = createSignal(false);
    // Mirrors the start aside's collapsed state (fed by kai-aside-toggle) so the
    // action bar can show the matching expand button while the rail is away.
    const [railCollapsed, setRailCollapsed] = createSignal(false);
    // The selected thread's title + project, shown in the action bar — selecting a
    // thread row in the projects tree swaps them.
    const activeTitle = () => THREAD_INFO.get(activeThread())?.title ?? 'Codebase overview';
    const activeProject = () => THREAD_INFO.get(activeThread())?.project ?? 't3.gg';
    // Captured in the workspace ref so the rail toggle can drive its exposed
    // imperative API (toggleAside); the nav is captured so thread selection can
    // drive its controlled `value` (so the "Show more" row never looks selected).
    let ws: El | undefined;
    let projectsNav: El | undefined;
    const toggleRail = () => (ws?.toggleAside as ((side: string) => void) | undefined)?.('start');

    // Array/object props (and event wiring) are applied in each element's ref
    // callback, NOT a one-shot onMount, so they survive remounts.
    return (
      <div class="relative h-screen w-full">
        <kai-workspace
          ref={(el) => {
            ws = el as El;
            // Rail geometry is CSS custom properties on the shell (the kai-dock
            // rule), not props. The re-cast shell has no built-in conversation
            // pane, so nothing needs suppressing: the start slot IS the rail.
            el.style.setProperty('--kai-workspace-start-min-width', '240px');
            el.style.setProperty('--kai-workspace-start-max-width', '420px');
            el.addEventListener('kai-aside-toggle', (e) => {
              const d = (e as CustomEvent).detail as { side: string; collapsed: boolean };
              if (d.side === 'start') setRailCollapsed(d.collapsed);
            });
          }}
          class="block h-full"
          collapse-below="720"
        >
          {/* start: a single collapse toggle, command search, the PROJECTS
              header, then the projects -> threads tree as ONE nested kai-nav (the
              scrollable region), with Settings pinned at the bottom. The rail is
              the consumer's own column — the shell never reads it. */}
          <div slot="start" class="flex h-full flex-col px-2.5 pt-2.5">
            <div class="flex shrink-0 flex-col gap-2">
              {/* The rail-side panel control: collapses the rail. While collapsed
                  the action bar (below) shows the matching expand button, since a
                  collapsed aside renders nothing. */}
              <div class="flex">
                <kai-tooltip content="Collapse sidebar">
                  <kai-button
                    ref={(el) => { el.addEventListener('kai-click', toggleRail); }}
                    variant="ghost"
                    size="icon-sm"
                    icon="panel-left"
                    label="Collapse sidebar"
                  ></kai-button>
                </kai-tooltip>
              </div>
              <kai-button
                ref={(el) => { el.addEventListener('kai-click', () => setCmdOpen(true)); }}
                variant="ghost"
                size="sm"
                full
                align="start"
                icon="search"
              >
                Search
                <span class="ml-auto rounded border border-border px-1 text-[0.6875rem] text-muted-foreground">⌘K</span>
              </kai-button>
              <div class="flex items-center justify-between pl-2.5">
                <span class="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Projects</span>
                <div class="flex items-center">
                  <kai-tooltip content="Sort projects">
                    <kai-button variant="ghost" size="icon-sm" icon="sliders-horizontal" label="Sort projects"></kai-button>
                  </kai-tooltip>
                  <kai-tooltip content="Add folder">
                    <kai-button variant="ghost" size="icon-sm" icon="plus" label="Add folder"></kai-button>
                  </kai-tooltip>
                </div>
              </div>
            </div>
            {/* the nested projects -> threads tree (scrolls within the rail) */}
            <div class="-mx-2.5 mt-1 min-h-0 flex-1 overflow-y-auto px-2.5">
              <kai-nav
                ref={(el) => {
                  const n = el as El;
                  projectsNav = n;
                  n.items = PROJECTS;
                  n.value = activeThread();
                  n.defaultCollapsed = COLLAPSED_PROJECTS;
                  el.addEventListener('kai-nav-select', (e) => {
                    const id = (e as CustomEvent).detail.id as string;
                    if (THREAD_INFO.has(id)) { setActiveThread(id); if (projectsNav) projectsNav.value = id; }
                  });
                }}
              ></kai-nav>
            </div>
            {/* Settings, pinned at the bottom */}
            <div class="shrink-0 pb-1.5">
              <kai-separator></kai-separator>
              <div class="py-1.5">
                <kai-button variant="ghost" full align="start" icon="settings">Settings</kai-button>
              </div>
            </div>
          </div>

          {/* main: the thread action bar is plain markup at the top of the main
              column (the shell has no main-header slot), above the agent thread
              (scrolls) and the composer (pinned). */}
          <div slot="main" class="flex h-full flex-col">
          <div class="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
            <div class="flex min-w-0 items-center gap-2">
              <Show when={railCollapsed()}>
                <kai-tooltip content="Expand sidebar">
                  <kai-button
                    ref={(el) => { el.addEventListener('kai-click', toggleRail); }}
                    variant="ghost"
                    size="icon-sm"
                    icon="panel-left"
                    label="Expand sidebar"
                  ></kai-button>
                </kai-tooltip>
              </Show>
              <span class="truncate text-sm font-medium">{activeTitle()}</span>
              <kai-badge>{activeProject()}</kai-badge>
            </div>
            <div class="flex items-center gap-1.5">
              <kai-menu
                ref={(el) => { (el as El).items = [
                  { id: 'rule', label: 'Add rule', icon: 'plus' },
                  { id: 'hook', label: 'Add hook', icon: 'workflow' },
                  { id: 'mcp', label: 'Add MCP server', icon: 'box' },
                ]; }}
                trigger-icon="plus"
                trigger-label="Add action"
              ></kai-menu>
              <kai-menu
                ref={(el) => { (el as El).items = [
                  { id: 'editor', label: 'Open in editor', icon: 'code' },
                  { id: 'terminal', label: 'Open in terminal', icon: 'square-pen' },
                  { id: 'finder', label: 'Reveal in Finder', icon: 'folder' },
                ]; }}
                trigger-label="Open"
                trigger-icon-trailing="chevron-down"
              ></kai-menu>
              {/* Commit & push: a REAL kai-menu (caret opens the actions). The
                  trigger is slotted as a NON-interactive outline span (a kai-button
                  here would double-nest, since kai-menu supplies its own button).
                  The -m-1.5 cancels the menu trigger's own padding so the border
                  sits flush; the OUTLINE look keeps it unobtrusive (not a filled
                  primary that pulls focus). */}
              <kai-menu
                ref={(el) => { (el as El).items = [
                  { id: 'commit-push', label: 'Commit & push', icon: 'github' },
                  { id: 'commit', label: 'Commit only', icon: 'pencil' },
                  { id: 'amend', label: 'Amend last commit', icon: 'square-pen' },
                  { separator: true },
                  { id: 'pr', label: 'Create pull request', icon: 'workflow' },
                  { id: 'discard', label: 'Discard changes', icon: 'x' },
                ]; }}
                label="Commit and push actions"
              >
                <span
                  slot="trigger"
                  class="-m-1.5 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-foreground"
                >
                  Commit &amp; push
                  <ChevronDown class="size-3.5 opacity-60" />
                </span>
              </kai-menu>
              <kai-tooltip content="Window">
                <kai-button variant="ghost" size="icon-sm" icon="monitor" label="Window"></kai-button>
              </kai-tooltip>
            </div>
          </div>

          {/* the agent thread (scrolls) above the composer (pinned) */}
          <div class="flex min-h-0 flex-1 flex-col">
            <div class="min-h-0 flex-1 overflow-y-auto">
              <div class="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
                <kai-message
                  ref={(el) => {
                    const m = el as El;
                    m.message = { id: 't3code-overview', role: 'assistant', parts: [{ type: 'text', text: OVERVIEW_MD }] };
                    m.avatar = 'none';
                  }}
                  style={{ display: 'block' }}
                ></kai-message>

                {/* CHANGED FILES — kai-file-tree carries per-file diff stats AND its
                    own summary header (count + summed +/- + Collapse-all). The footer
                    keeps a View-diff affordance + the run timestamp. */}
                <div class="overflow-hidden rounded-lg border border-border">
                  <div class="h-72">
                    <kai-file-tree ref={(el) => { const t = el as El; t.files = CHANGED_FILES; t.summary = true; }}></kai-file-tree>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                    <span class="text-[0.6875rem] text-muted-foreground">2:40:02 PM · 10s</span>
                    <kai-button variant="outline" size="sm" icon="file-text">View diff</kai-button>
                  </div>
                </div>
              </div>
            </div>

            {/* the composer */}
            <div class="shrink-0 border-t border-border p-3">
              <div class="mx-auto flex max-w-3xl flex-col gap-1.5">
                <kai-prompt-input
                  ref={(el) => { (el as El).attach = false; }}
                  placeholder="Ask for follow-up changes or attach images"
                >
                  <div slot="toolbar-start" class="flex items-center gap-1.5">
                    <kai-model-switcher ref={(el) => { const m = el as El; m.models = [
                      { id: 'opus-4-5', name: 'Claude Opus 4.5' },
                      { id: 'sonnet-4-6', name: 'Claude Sonnet 4.6' },
                      { id: 'haiku-4-5', name: 'Claude Haiku 4.5' },
                    ]; m.currentModel = 'opus-4-5'; }}></kai-model-switcher>
                    <kai-menu
                      ref={(el) => { (el as El).items = [
                        { heading: true, label: 'Effort' },
                        { id: 'high', label: 'High', checked: true },
                        { id: 'medium', label: 'Medium' },
                        { id: 'low', label: 'Low' },
                      ]; }}
                      trigger-label="High · Normal"
                      trigger-icon-trailing="chevron-down"
                    ></kai-menu>
                    <kai-button variant="subtle" size="sm" icon="workflow">Build</kai-button>
                    <kai-menu
                      ref={(el) => { (el as El).items = [
                        { id: 'full', label: 'Full access', checked: true },
                        { id: 'read', label: 'Read only' },
                        { id: 'ask', label: 'Ask each time' },
                      ]; }}
                      trigger-icon="lock"
                      trigger-label="Full access"
                      trigger-icon-trailing="chevron-down"
                    ></kai-menu>
                  </div>
                </kai-prompt-input>
                <div class="flex items-center justify-between px-1 text-xs text-muted-foreground">
                  <span>Local checkout</span>
                  <kai-menu
                    ref={(el) => { (el as El).items = [
                      { id: 'main', label: 'main', checked: true },
                      { id: 'develop', label: 'develop' },
                      { id: 'feat', label: 'feat/sitemap' },
                    ]; }}
                    trigger-label="main"
                    trigger-icon-trailing="chevron-down"
                  ></kai-menu>
                </div>
              </div>
            </div>
          </div>
          </div>
        </kai-workspace>

        {/* Command palette: a light-DOM overlay hosting kai-command. Opened by the
            sidebar Search button; closes on backdrop click, Escape, or a
            selection. The inner panel stops clicks from reaching the scrim. */}
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
                  (el as El).items = COMMANDS;
                  el.addEventListener('kai-select', () => setCmdOpen(false));
                  queueMicrotask(() => (el as El).focus?.());
                }}
                placeholder="Search projects, threads, actions..."
              ></kai-command>
            </div>
          </div>
        </Show>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'html',
        // A representative skeleton of the composition (not the full interactive
        // render). The rail is the consumer's OWN column in the re-cast shell's
        // start slot: ONE nested kai-nav (projects -> threads, with per-thread
        // status dots + relative-time meta) — not a conversation list, which the
        // chat-agnostic shell is fine with. The collapse toggle lives in the
        // rail and drives toggleAside('start'); the action bar shows the
        // matching expand button while collapsed. Search opens a kai-command
        // palette; the action-bar carets are real kai-menus (Commit & push uses an
        // outline trigger); the changed files use kai-file-tree with diff stats + a
        // summary header. Rail geometry is CSS custom properties on the shell.
        code: `<kai-workspace collapse-below="720"
  style="--kai-workspace-start-min-width: 240px; --kai-workspace-start-max-width: 420px">
  <!-- start: one collapse toggle, command search, the projects header, then the
       nested projects -> threads nav, with Settings pinned at the bottom -->
  <div slot="start">
    <kai-tooltip content="Collapse sidebar">
      <kai-button variant="ghost" size="icon-sm" icon="panel-left" label="Collapse sidebar"></kai-button>
    </kai-tooltip>
    <kai-button variant="ghost" size="sm" icon="search">Search ⌘K</kai-button>
    <div>
      Projects
      <kai-tooltip content="Sort projects">
        <kai-button variant="ghost" size="icon-sm" icon="sliders-horizontal" label="Sort projects"></kai-button>
      </kai-tooltip>
      <kai-tooltip content="Add folder">
        <kai-button variant="ghost" size="icon-sm" icon="plus" label="Add folder"></kai-button>
      </kai-tooltip>
    </div>
    <!-- the nested projects -> threads tree (status dots on the live threads, meta times) -->
    <kai-nav></kai-nav>
    <kai-button variant="ghost" icon="settings">Settings</kai-button>
  </div>

  <!-- main: the action bar is plain markup at the top of the main column
       (text-labeled menus + icon-only buttons, tooltip'd). While the rail is
       collapsed it shows the matching expand button. -->
  <div slot="main">
    <div class="action-bar">
    Codebase overview <kai-badge>t3.gg</kai-badge>
    <kai-menu trigger-icon="plus" trigger-label="Add action"></kai-menu>
    <kai-menu trigger-label="Open" trigger-icon-trailing="chevron-down"></kai-menu>
    <!-- Commit & push is a REAL menu; the trigger is a non-interactive OUTLINE
         span (a kai-button would double-nest — kai-menu supplies the button). -->
    <kai-menu label="Commit and push actions">
      <span slot="trigger" class="commit-trigger">Commit &amp; push ▾</span>
    </kai-menu>
    <kai-tooltip content="Window">
      <kai-button variant="ghost" size="icon-sm" icon="monitor" label="Window"></kai-button>
    </kai-tooltip>
    </div>

    <!-- thread + composer -->
    <kai-message><!-- message set as a property: markdown table + prose --></kai-message>
    <div><!-- Changed files: the file tree renders its own summary header -->
      <kai-file-tree summary></kai-file-tree>
      <span>2:40:02 PM · 10s</span>
      <kai-button variant="outline" icon="file-text">View diff</kai-button>
    </div>
    <kai-prompt-input placeholder="Ask for follow-up changes or attach images">
      <div slot="toolbar-start">
        <kai-model-switcher></kai-model-switcher>
        <kai-menu trigger-label="High · Normal" trigger-icon-trailing="chevron-down"></kai-menu>
        <kai-button variant="subtle" icon="workflow">Build</kai-button>
        <kai-menu trigger-icon="lock" trigger-label="Full access" trigger-icon-trailing="chevron-down"></kai-menu>
      </div>
    </kai-prompt-input>
    <div>Local checkout <kai-menu trigger-label="main" trigger-icon-trailing="chevron-down"></kai-menu></div>
  </div>
</kai-workspace>

<!-- the command palette: a light-DOM overlay hosting kai-command, toggled open -->
<div class="cmd-scrim"><kai-command placeholder="Search projects, threads, actions..."></kai-command></div>

<script type="module">
  // Array/object props are JS properties (the kai- contract); scalars are attributes.
  const nav = document.querySelector('kai-nav');
  // ONE nested tree: each project is a group, its threads are \`children\`; a thread
  // carries a relative-time \`meta\` and (only the live ones) a \`status\` dot. A
  // project's \`icon\` is a named glyph OR a favicon URL/data-URI (rendered as an <img>).
  nav.items = [
    { id: 't3chat', label: 't3chat', icon: '/favicons/t3.ico', children: [
      { id: 'streaming-md', label: 'Streaming markdown fix', status: { tone: 'success', label: 'Completed' }, meta: 'just now' },
      { id: 'model-picker', label: 'Model picker polish', meta: '1m ago' },
    ] },
    { id: 'lawn', label: 'lawn', icon: 'box', children: [
      { id: 'lawn-schedule', label: 'Fix watering schedule', status: { tone: 'info', label: 'Working', pulse: true }, meta: 'just now' },
    ] },
    { id: 't3-gg', label: 't3.gg', icon: '/favicons/t3.ico', children: [
      { id: 'codebase-overview', label: 'Codebase overview', meta: '24d ago' }, /* ...selected... */
      { id: 't3-gg-more', label: 'Show more', icon: 'chevron-down' },
    ] },
    /* quickpic / azure-bench / dumb-harness / t3code-1 ... */
  ];
  nav.value = 'codebase-overview';               // selected thread
  nav.defaultCollapsed = ['quickpic', 'azure-bench', 'dumb-harness', 't3code-1'];
  nav.addEventListener('kai-nav-select', (e) => setHeader(e.detail.id));

  document.querySelector('kai-message').message = {
    id: 'overview', role: 'assistant',
    parts: [{ type: 'text', text: '| Change | File | Notes |\\n| --- | --- | --- |\\n...' }],
  };
  // Per-file diff stats + a summary header (count + summed +/- + Collapse-all).
  document.querySelector('kai-file-tree').files = [
    { path: 'public/robots.txt', additions: 4, deletions: 0, status: 'added' },
    { path: 'src/lib/constants.ts', additions: 8, deletions: 2, status: 'modified' }, /* ... */
  ];
  document.querySelector('kai-file-tree').summary = true;
  document.querySelector('kai-command').items = [/* KaiCommandItem[] grouped by 'group' */];
  document.querySelector('kai-model-switcher').models = [{ id: 'opus-4-5', name: 'Claude Opus 4.5' }, /* ... */];

  // Interactions: the rail toggle drives the shell's per-aside API; Search opens
  // the palette; the action-bar carets open menus; selecting a thread swaps the header.
  collapseToggle.addEventListener('kai-click', () => workspace.toggleAside('start'));
  searchButton.addEventListener('kai-click', () => showPalette());
</script>`,
      },
    },
  },
};
