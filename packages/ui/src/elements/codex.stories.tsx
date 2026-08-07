import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show, For } from 'solid-js';
import './register'; // every kai-* element used below
import type { FileTreeFile } from '../components/file-tree';
import type { ToolPart } from '../components/tool-types';
import { PromptDock } from '../ui/prompt-dock';
import openaiLogo from './logos/openai.svg';

// Labs/Apps: a faithful replica of OpenAI's Codex WEB (chatgpt.com/codex) - a
// deliberately DIFFERENT shape from the workspace-rail dogfoods (Claude Code,
// ChatGPT, ...) to showcase the kit's range. Codex Web is a COMPOSER-LED, CENTERED
// single column: minimal top chrome, a prominent centered composer card, then a
// vertical feed of async coding tasks below it. There is NO left conversation rail.
//
// KIT vs CUSTOM: the centered LAYOUT, the task ROWS, and the task DETAIL composition
// are the consumer's own layout (correct - the developer composes these). The KIT
// supplies the pieces: kai-prompt-input (composer), kai-menu (repo/branch/settings),
// kai-badge (status + PR chips, tinted via ::part(badge) with the kit's --color-tool-*
// tokens), kai-tasks (plan), kai-file-tree (diff), kai-tool (logs), kai-message
// (summary). The Working/Done/Queued/Failed run chips and the draft/open/merged/closed
// PR chips are real kai-badge elements; a Working row pairs its chip with a pulsing
// kai-status dot, and the Ask/Code dual-button is two kai-buttons.

// kai-tool, kai-icon, and kai-status are used as JSX elements here. The tags are
// declared (identically) by sibling story files; redeclaring them keeps the file
// self-documenting (TypeScript merges identical global augmentations - the types
// must match byte-for-byte across files or it errors TS2717).
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-menu': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'trigger-icon'?: string; 'trigger-label'?: string; 'trigger-icon-trailing'?: string; label?: string };
      'kai-badge': JSX.HTMLAttributes<HTMLElement> & { variant?: string };
      'kai-status': JSX.HTMLAttributes<HTMLElement> & { status?: string; pulse?: boolean; label?: string; size?: string; theme?: string };
      'kai-prompt-input': JSX.HTMLAttributes<HTMLElement> & { theme?: string; placeholder?: string; loading?: boolean; disabled?: boolean; voice?: boolean; search?: boolean; attach?: boolean; submit?: string; 'suggestion-mode'?: string };
      'kai-message': JSX.HTMLAttributes<HTMLElement>;
      'kai-tasks': JSX.HTMLAttributes<HTMLElement>;
      'kai-file-tree': JSX.HTMLAttributes<HTMLElement>;
      'kai-tool': JSX.HTMLAttributes<HTMLElement> & { open?: boolean; 'default-open'?: boolean; disabled?: boolean };
      'kai-avatar': JSX.HTMLAttributes<HTMLElement> & { src?: string; alt?: string; fallback?: string; size?: string };
      'kai-icon': JSX.HTMLAttributes<HTMLElement> & { name?: string; size?: string };
    }
  }
}

const meta = { title: 'Labs/Apps', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;
type El = HTMLElement & Record<string, unknown>;

// A task's run state and (once it has a branch pushed) its PR state.
type Run = 'working' | 'queued' | 'done' | 'failed';
type Pr = 'draft' | 'open' | 'merged' | 'closed';

// Run state -> chip label + tone class. The tone is applied via ::part(badge) (the
// documented restyle hook) in the <style> block below, using the kit's --color-tool-*
// tokens. `muted` keeps the plain default kai-badge.
const RUN: Record<Run, { label: string; tone: string }> = {
  working: { label: 'Working', tone: 'blue' },
  queued: { label: 'Queued', tone: 'muted' },
  done: { label: 'Done', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
};
// PR state -> chip label + tone. draft/open/merged/closed are tinted kai-badges
// (the same ::part(badge) restyle hook).
const PR: Record<Pr, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'muted' },
  open: { label: 'Open', tone: 'green' },
  merged: { label: 'Merged', tone: 'purple' },
  closed: { label: 'Closed', tone: 'red' },
};

interface Task {
  id: string;
  title: string;
  repo: string;
  branch: string;
  run: Run;
  time: string;
  additions?: number;
  deletions?: number;
  pr?: Pr;
}

// The async task feed - parallel coding tasks, each in its own cloud sandbox. Mixed
// run states + diff stats + PR states so the row anatomy is exercised end to end.
const TASKS: Task[] = [
  { id: 't-device-code', title: 'Add an OAuth device-code flow for headless sandboxes', repo: 'openai/codex', branch: 'codex/device-code', run: 'working', time: '2m' },
  { id: 't-upload-flake', title: 'Fix the flaky attachment-upload test', repo: 'openai/codex', branch: 'codex/upload-flake', run: 'working', time: '47s' },
  { id: 't-vitest-3', title: 'Migrate the test runner to Vitest 3', repo: 'openai/codex', branch: 'codex/vitest-3', run: 'queued', time: 'queued' },
  { id: 't-theme-tokens', title: 'Refactor the theme token names to a flat scale', repo: 'openai/codex', branch: 'codex/theme-tokens', run: 'done', time: '18m', additions: 131, deletions: 51, pr: 'open' },
  { id: 't-sitemap', title: 'Add a sitemap and robots.txt to the docs site', repo: 'openai/openai-cookbook', branch: 'codex/sitemap', run: 'done', time: '1h', additions: 42, deletions: 3, pr: 'merged' },
  { id: 't-stream-docs', title: 'Document the streaming contract', repo: 'openai/openai-cookbook', branch: 'codex/stream-docs', run: 'done', time: '3h', additions: 88, deletions: 0, pr: 'draft' },
  { id: 't-esbuild', title: 'Bump esbuild past the CVE', repo: 'openai/codex', branch: 'codex/esbuild-cve', run: 'failed', time: '26m', pr: 'closed' },
];

// Top-chrome environments/settings menu.
const SETTINGS = [
  { heading: true, label: 'Environments' },
  { id: 'codex', label: 'openai/codex', icon: 'box', checked: true },
  { id: 'cookbook', label: 'openai/openai-cookbook', icon: 'book-open' },
  { separator: true },
  { id: 'new-env', label: 'New environment', icon: 'plus' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'docs', label: 'Documentation', icon: 'external-link' },
];
// Composer environment pills (repo + branch), set as kai-menu items.
const REPOS = [
  { id: 'codex', label: 'openai/codex', icon: 'box', checked: true },
  { id: 'cookbook', label: 'openai/openai-cookbook', icon: 'book-open' },
  { id: 'evals', label: 'openai/evals', icon: 'book' },
];
const BRANCHES = [
  { id: 'main', label: 'main', checked: true },
  { id: 'next', label: 'next' },
  { id: 'release', label: 'release' },
];
const FILTERS = [
  { id: 'all', label: 'All tasks', checked: true },
  { id: 'working', label: 'Working' },
  { id: 'queued', label: 'Queued' },
  { id: 'done', label: 'Done' },
  { id: 'failed', label: 'Failed' },
];

// --- Opened-task detail fixtures (one coherent set, headed by the active task) ---

// The agent plan - kai-tasks in PROGRESS (checklist) mode.
const PLAN = {
  mode: 'progress',
  heading: 'Plan',
  tasks: [
    { id: 'read', label: 'Read the auth module and existing token store', checked: true },
    { id: 'flow', label: 'Implement the device-code request + polling loop', checked: true },
    { id: 'persist', label: 'Persist and refresh the access token', checked: false },
    { id: 'tests', label: 'Add unit tests for the polling backoff', checked: false },
    { id: 'docs', label: 'Document the new env vars', checked: false },
  ],
};

// The streamed work-log - each step is a collapsible kai-tool (a command + output
// with a state badge). The per-tool disclosure IS the reference's "Logs" expander.
const LOGS: ToolPart[] = [
  { type: 'clone_repo', state: 'output-available', input: { repo: 'git@github.com:openai/codex.git', depth: 1 }, output: { stdout: "Cloning into 'codex'...\nReceiving objects: 100% (1842/1842), done." } },
  { type: 'read_file', state: 'output-available', input: { path: 'src/auth/token-store.ts' }, output: { lines: 142, language: 'ts' } },
  { type: 'apply_patch', state: 'output-available', input: { path: 'src/auth/device-code.ts', additions: 96, deletions: 0 }, output: { applied: true } },
  { type: 'run_tests', state: 'output-error', input: { command: 'npm test -- device-code' }, output: { failing: 1 }, errorText: 'device-code > refresh: token is not persisted across a sandbox restart' },
];

// The proposed changes - kai-file-tree WITH per-file diff stats + status + the
// `summary` header (file count + summed +/-). Totals: +131 / -51 across 6 files.
const CHANGED_FILES: FileTreeFile[] = [
  { path: 'src/auth/device-code.ts', status: 'added', additions: 96, deletions: 0 },
  { path: 'src/auth/token-store.ts', status: 'modified', additions: 18, deletions: 7 },
  { path: 'src/auth/index.ts', status: 'modified', additions: 3, deletions: 1 },
  { path: 'src/auth/legacy-oauth.ts', status: 'deleted', additions: 0, deletions: 41 },
  { path: 'docs/auth.md', status: 'modified', additions: 12, deletions: 2 },
  { path: '.env.example', status: 'modified', additions: 2, deletions: 0 },
];

const SUMMARY_MD = `Added an OAuth **device-code** flow so a headless sandbox can authenticate without a browser redirect. The token store now refreshes on expiry, and the legacy redirect path is removed.

One test is still failing: the refreshed token is not persisted across a sandbox restart. I have a fix queued.`;

// A tinted kai-badge: the REAL element, recolored via ::part(badge) by a tone class
// (the documented restyle hook). `muted` is the plain default badge.
function ToneBadge(props: { tone: string; children: string }) {
  return <kai-badge class={props.tone === 'muted' ? undefined : `tone-${props.tone}`}>{props.children}</kai-badge>;
}

// A +N / -N diff stat using the kit's tool-* hues (the same colors kai-file-tree
// uses for its per-file stats). Plain consumer text - this is custom layout.
function DiffStat(props: { additions?: number; deletions?: number }) {
  return (
    <Show when={props.additions != null || props.deletions != null}>
      <span class="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
        <span class="text-tool-green">+{props.additions ?? 0}</span>
        <span class="text-tool-red">-{props.deletions ?? 0}</span>
      </span>
    </Show>
  );
}

export const Codex: Story = {
  name: 'Codex',
  render: () => {
    // null = the composer-led home (composer + task feed). An id = that task's
    // detail (replaces the home column, with a Back affordance). The top chrome
    // stays put across both.
    const [activeTask, setActiveTask] = createSignal<string | null>(null);
    const active = () => TASKS.find((t) => t.id === activeTask());

    // Array/object props (and event wiring) are applied in each element's ref
    // callback, NOT a one-shot onMount: the home + detail columns live inside <Show>,
    // so they unmount/remount on view swap; a ref runs on every (re)mount.
    return (
      <div class="flex h-screen flex-col bg-background text-foreground">
        {/* Recolor the status/PR chips through the kit's documented ::part(badge)
            hook, using the --color-tool-* tokens. Also hide the composer's built-in
            send button - the Ask/Code buttons are the submit affordance here (the
            prompt-input documents ::part(send)). */}
        <style>{`
          .tone-blue::part(badge){ background:color-mix(in srgb, var(--color-tool-blue) 16%, transparent); color:var(--color-tool-blue); }
          .tone-green::part(badge){ background:color-mix(in srgb, var(--color-tool-green) 16%, transparent); color:var(--color-tool-green); }
          .tone-red::part(badge){ background:color-mix(in srgb, var(--color-tool-red) 16%, transparent); color:var(--color-tool-red); }
          .tone-amber::part(badge){ background:color-mix(in srgb, var(--color-tool-amber) 18%, transparent); color:var(--color-tool-amber); }
          .tone-purple::part(badge){ background:color-mix(in srgb, #8957e5 16%, transparent); color:#6d28d9; }
          .codex-composer::part(send){ display:none; }
        `}</style>

        {/* TOP CHROME: Codex wordmark (with the OpenAI mark) left; environments
            menu + user avatar right. No conversation rail. */}
        <header class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
          <div class="flex items-center gap-2">
            <img src={openaiLogo} alt="OpenAI" class="size-5 dark:invert" />
            <span class="text-[0.9375rem] font-semibold tracking-tight">Codex</span>
            <kai-badge>Cloud</kai-badge>
          </div>
          <div class="flex items-center gap-1.5">
            <kai-menu
              ref={(el) => { (el as El).items = SETTINGS; }}
              trigger-icon="settings"
              label="Environments and settings"
            ></kai-menu>
            <kai-avatar fallback="RT" size="sm"></kai-avatar>
          </div>
        </header>

        {/* BODY: a single centered column that scrolls. This <main> is the bounded
            scroll container (flex column, overflow-y-auto, min-h-0 so it can shrink
            below content height and actually scroll). The HOME wrapper below uses
            `m-auto` (the double-container trick): margin:auto centers the composer
            vertically when there's spare room and collapses to top-aligned + scrollable
            when the content is taller than the column - so the top is never clipped
            (unlike justify/align-center, which would clip + strand the top on overflow). */}
        <main class="flex flex-1 flex-col overflow-y-auto min-h-0">
          {/* HOME: the centered composer + the task feed below it. The `m-auto` here
              is the inner wrapper of the centering trick (py-10 is the comfortable
              top/bottom padding for the overflow case). */}
          <Show when={!activeTask()}>
            <div class="m-auto w-full max-w-3xl px-4 py-10">
              <h1 class="mb-5 text-center text-xl font-semibold tracking-tight">What should Codex work on?</h1>

              {/* The focal composer, framed by a PromptDock: the prompt-input is the
                  raised card; the dock's recessed BOTTOM lip owns the project/control
                  band the real Codex shows just under the input - repo + branch on the
                  left, the Ask/Code dual-button on the right. No top lip is needed. */}
              <PromptDock
                bottom={
                  <div class="flex items-center justify-between gap-2">
                    {/* "Work in a project" - repo + branch environment pills (kai-menu). */}
                    <div class="flex items-center gap-1.5">
                      <kai-menu
                        ref={(el) => { (el as El).items = REPOS; }}
                        trigger-icon="box"
                        trigger-label="openai/codex"
                        trigger-icon-trailing="chevron-down"
                      ></kai-menu>
                      <kai-menu
                        ref={(el) => { (el as El).items = BRANCHES; }}
                        trigger-icon="git-branch"
                        trigger-label="main"
                        trigger-icon-trailing="chevron-down"
                      ></kai-menu>
                    </div>
                    {/* The signature Ask / Code dual-button. Code (primary/accent)
                        dispatches a coding task; Ask (secondary) answers questions with
                        no edits. Rendered as two kai-buttons. */}
                    <div class="flex items-center gap-1.5">
                      <kai-button variant="outline" size="sm" icon="message-circle">Ask</kai-button>
                      <kai-button variant="default" size="sm" icon="code">Code</kai-button>
                    </div>
                  </div>
                }
              >
                <kai-prompt-input
                  ref={(el) => { (el as El).attach = false; }}
                  class="codex-composer block"
                  placeholder="Describe a task. Codex runs it in a parallel cloud sandbox."
                >
                  {/* attach/image affordance stays inline in the input toolbar */}
                  <div slot="toolbar-start" class="flex items-center gap-1.5">
                    <kai-button variant="ghost" size="icon-sm" icon="image" label="Attach an image"></kai-button>
                  </div>
                </kai-prompt-input>
              </PromptDock>

              {/* TASK FEED */}
              <div class="mt-8">
                <div class="mb-1.5 flex items-center justify-between px-1">
                  <span class="text-sm font-medium">Tasks</span>
                  <kai-menu
                    ref={(el) => { (el as El).items = FILTERS; }}
                    trigger-icon="list-filter"
                    trigger-label="All tasks"
                    trigger-icon-trailing="chevron-down"
                    label="Filter tasks"
                  ></kai-menu>
                </div>
                <div class="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
                  <For each={TASKS}>
                    {(t) => (
                      <button
                        type="button"
                        class="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                        onClick={() => setActiveTask(t.id)}
                      >
                        {/* line 1: title (truncated) + diff stat + PR chip + status chip */}
                        <div class="flex items-center gap-3">
                          <span class="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                          <DiffStat additions={t.additions} deletions={t.deletions} />
                          <Show when={t.pr}>{(pr) => <ToneBadge tone={PR[pr()].tone}>{PR[pr()].label}</ToneBadge>}</Show>
                          <span class="inline-flex items-center gap-1.5">
                            {/* Working pairs the chip with a pulsing dot as a
                                secondary accent (the chip carries the label). */}
                            <Show when={t.run === 'working'}>
                              <kai-status status="new" pulse size="sm" label="Working"></kai-status>
                            </Show>
                            <ToneBadge tone={RUN[t.run].tone}>{RUN[t.run].label}</ToneBadge>
                          </span>
                        </div>
                        {/* line 2: repo / branch + relative time */}
                        <div class="flex items-center gap-2 text-xs text-muted-foreground">
                          <span class="truncate">{t.repo}</span>
                          <span class="opacity-40">/</span>
                          <span class="inline-flex items-center gap-1 truncate">
                            <kai-icon name="git-branch" size="sm"></kai-icon>
                            {t.branch}
                          </span>
                          <Show when={t.run !== 'queued'}>
                            <span class="opacity-40">·</span>
                            <span class="shrink-0">{t.time}</span>
                          </Show>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Show>

          {/* TASK DETAIL: replaces the home column. */}
          <Show when={active()}>
            {(t) => (
              <div class="mx-auto w-full max-w-3xl px-4 py-6">
                {/* Back + header: title, repo/branch, run status. */}
                <div class="mb-5 flex flex-col gap-3">
                  <div>
                    <kai-button
                      ref={(el) => { el.addEventListener('kai-click', () => setActiveTask(null)); }}
                      variant="ghost"
                      size="sm"
                      icon="arrow-left"
                    >All tasks</kai-button>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <h1 class="min-w-0 text-lg font-semibold leading-snug">{t().title}</h1>
                    <span class="inline-flex shrink-0 items-center gap-1.5">
                      <Show when={t().run === 'working'}>
                        <kai-status status="new" pulse size="sm" label="Working"></kai-status>
                      </Show>
                      <ToneBadge tone={RUN[t().run].tone}>{RUN[t().run].label}</ToneBadge>
                    </span>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t().repo}</span>
                    <span class="opacity-40">/</span>
                    <span class="inline-flex items-center gap-1">
                      <kai-icon name="git-branch" size="sm"></kai-icon>
                      {t().branch}
                    </span>
                    <span class="opacity-40">·</span>
                    <span>{t().time}</span>
                  </div>
                </div>

                <div class="flex flex-col gap-5">
                  {/* The agent's summary turn (real markdown). */}
                  <kai-message
                    ref={(el) => {
                      const m = el as El;
                      m.message = { id: 'codex-summary', role: 'assistant', parts: [{ type: 'text', text: SUMMARY_MD }] };
                      m.avatar = 'none';
                    }}
                    style={{ display: 'block' }}
                  ></kai-message>

                  {/* The plan / checklist. */}
                  <kai-tasks ref={(el) => { (el as El).data = PLAN; }}></kai-tasks>

                  {/* Logs: each step is a collapsible kai-tool (its disclosure is the
                      per-step "Logs" expander - terminal output / test results). */}
                  <div class="flex flex-col gap-2">
                    <div class="px-0.5 text-sm font-medium">Logs</div>
                    <For each={LOGS}>
                      {(entry, i) => (
                        <kai-tool
                          ref={(el) => { (el as El).tool = entry; }}
                          default-open={i() === LOGS.length - 1}
                        ></kai-tool>
                      )}
                    </For>
                  </div>

                  {/* Diff viewer: kai-file-tree WITH per-file additions/deletions/
                      status + the summary header (affected-file count + summed +/-). */}
                  <div class="flex flex-col gap-2">
                    <div class="px-0.5 text-sm font-medium">Diff</div>
                    <div class="h-72 overflow-hidden rounded-lg border border-border">
                      <kai-file-tree ref={(el) => { const f = el as El; f.files = CHANGED_FILES; f.summary = true; }}></kai-file-tree>
                    </div>
                  </div>

                  {/* PR controls: Push -> Create New PR -> View Pull Request. */}
                  <div class="flex items-center gap-1.5">
                    <kai-button variant="default" size="sm" icon="arrow-up">Push</kai-button>
                    <kai-button variant="outline" size="sm" icon="git-pull-request">Create new PR</kai-button>
                    <kai-button variant="ghost" size="sm" icon="external-link">View pull request</kai-button>
                    <kai-menu
                      ref={(el) => { (el as El).items = [
                        { id: 'copy-branch', label: 'Copy branch name', icon: 'copy' },
                        { id: 'rerun', label: 'Re-run task', icon: 'rotate-cw' },
                        { separator: true },
                        { id: 'archive', label: 'Archive task', icon: 'archive' },
                      ]; }}
                      trigger-icon="ellipsis"
                      label="More actions"
                      class="ml-auto"
                    ></kai-menu>
                  </div>

                  {/* Follow-up: iterate on the task. */}
                  <kai-prompt-input
                    ref={(el) => { (el as El).attach = false; }}
                    class="block"
                    placeholder="Reply to Codex to refine this task..."
                  ></kai-prompt-input>
                </div>
              </div>
            )}
          </Show>
        </main>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'html',
        // A representative skeleton (not the full interactive render). The shape is
        // composer-led + centered: top chrome, a centered composer card with the
        // Ask/Code dual-button + repo/branch pills, then a vertical task feed. Each
        // row carries a status chip + (when done) a diff stat + PR chip. A row opens
        // the detail (plan + logs + diff + PR controls + follow-up).
        code: `<!-- TOP CHROME: Codex wordmark + environments menu + avatar. No left rail. -->
<header>
  <img src="openai.svg" alt="OpenAI" /> Codex <kai-badge>Cloud</kai-badge>
  <kai-menu trigger-icon="settings" label="Environments and settings"></kai-menu>
  <kai-avatar fallback="RT"></kai-avatar>
</header>

<!-- CENTERED column: composer + task feed -->
<main>
  <h1>What should Codex work on?</h1>

  <!-- the focal composer, framed by a PromptDock primitive: the input is the raised
       card; the dock's recessed BOTTOM lip owns the project/control band Codex shows
       just under the input. (The kai-prompt-dock element is forthcoming.) -->
  <div class="prompt-dock">
    <kai-prompt-input class="codex-composer" placeholder="Describe a task. Codex runs it in a parallel cloud sandbox.">
      <div slot="toolbar-start">
        <kai-button variant="ghost" size="icon-sm" icon="image" label="Attach an image"></kai-button>
      </div>
    </kai-prompt-input>
    <!-- BOTTOM lip: repo + branch project pills (left) + the Ask / Code dual-button
         (right). Code (primary) dispatches a coding task; Ask (secondary) answers. -->
    <div class="prompt-dock-bottom">
      <div>
        <kai-menu trigger-icon="box" trigger-label="openai/codex" trigger-icon-trailing="chevron-down"></kai-menu>
        <kai-menu trigger-icon="git-branch" trigger-label="main" trigger-icon-trailing="chevron-down"></kai-menu>
      </div>
      <div>
        <kai-button variant="outline" size="sm" icon="message-circle">Ask</kai-button>
        <kai-button variant="default" size="sm" icon="code">Code</kai-button>
      </div>
    </div>
  </div>

  <!-- TASK FEED: each row = a coding task. Custom consumer layout; the pieces are
       kit. Line 1: title + diff stat + PR chip + status chip. Line 2: repo/branch + time. -->
  <div class="task-row" onclick="openTask('t-theme-tokens')">
    Refactor the theme token names
    <span class="diff">+131 -51</span>
    <kai-badge class="tone-green">Open</kai-badge>      <!-- PR status -->
    <kai-badge class="tone-green">Done</kai-badge>      <!-- run status -->
    <div>openai/codex / <kai-icon name="git-branch"></kai-icon> codex/theme-tokens · 18m</div>
  </div>
  <!-- a Working row pairs its chip with a pulsing kai-status dot -->
  <div class="task-row">
    Add an OAuth device-code flow
    <kai-status status="new" pulse label="Working"></kai-status>
    <kai-badge class="tone-blue">Working</kai-badge>
  </div>
</main>

<!-- TASK DETAIL (replaces the column when a row is opened) -->
<div class="task-detail">
  <kai-button variant="ghost" icon="arrow-left">All tasks</kai-button>
  <h1>Add an OAuth device-code flow</h1> <kai-badge class="tone-blue">Working</kai-badge>
  openai/codex / <kai-icon name="git-branch"></kai-icon> codex/device-code

  <kai-message><!-- agent summary, set as the content property --></kai-message>
  <kai-tasks><!-- the plan: data = { mode:'progress', tasks:[...] } --></kai-tasks>
  <!-- Logs: each step is a collapsible kai-tool (its disclosure = the Logs expander) -->
  <kai-tool default-open></kai-tool>
  <!-- Diff: REAL per-file additions/deletions/status + the summary header -->
  <kai-file-tree summary></kai-file-tree>
  <!-- PR controls: Push -> Create New PR -> View Pull Request -->
  <kai-button variant="default" icon="arrow-up">Push</kai-button>
  <kai-button variant="outline" icon="git-pull-request">Create new PR</kai-button>
  <kai-button variant="ghost" icon="external-link">View pull request</kai-button>
  <!-- follow-up: iterate on the task -->
  <kai-prompt-input placeholder="Reply to Codex to refine this task..."></kai-prompt-input>
</div>

<style>
  /* Tint the chips via the documented ::part(badge) hook + the --color-tool-* tokens. */
  .tone-blue::part(badge){ background:color-mix(in srgb, var(--color-tool-blue) 16%, transparent); color:var(--color-tool-blue) }
  .tone-green::part(badge){ background:color-mix(in srgb, var(--color-tool-green) 16%, transparent); color:var(--color-tool-green) }
  .tone-red::part(badge){ background:color-mix(in srgb, var(--color-tool-red) 16%, transparent); color:var(--color-tool-red) }
  .tone-purple::part(badge){ background:color-mix(in srgb, #8957e5 16%, transparent); color:#6d28d9 }
  /* the Ask/Code buttons are the submit affordance, so hide the built-in send */
  .codex-composer::part(send){ display:none }
</style>

<script type="module">
  // Array/object props are JS properties (the kai- contract); scalars are attributes.
  document.querySelector('.codex-composer').attach = false;
  document.querySelectorAll('kai-menu')[0].items = [/* environments + settings */];
  document.querySelector('kai-tasks').data = { mode: 'progress', heading: 'Plan', tasks: [/* { id, label, checked } */] };
  document.querySelector('kai-tool').tool = { type: 'run_tests', state: 'output-error', input: { command: 'npm test' }, errorText: '1 failing' };
  document.querySelector('kai-file-tree').files = [
    { path: 'src/auth/device-code.ts', status: 'added', additions: 96, deletions: 0 },
    { path: 'src/auth/token-store.ts', status: 'modified', additions: 18, deletions: 7 },
    /* ... */
  ];
  document.querySelector('kai-file-tree').summary = true;
</script>`,
      },
    },
  },
};
