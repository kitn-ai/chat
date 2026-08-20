import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show, For } from 'solid-js';
import './register'; // every kai-* element used below
import type { KaiNavItem } from '../ui/nav';
import type { KaiCommandItem } from './command';
import type { ConversationSummary } from '../types';
import { textMessage } from '../state';
import type { ChatMessage } from './chat-types';

// Labs/Apps: a fourth dogfood - "ChatGPT", a replica of chatgpt.com, the
// general-chat flagship. Its whole job is to validate the kit's CORE chat
// surface (the thread, the composer, the model picker, the canvas) the way a
// consumer would wire it. Built on kai-workspace + the kai-* elements;
// INTERACTIVE via createSignal + ref-callback wiring (Search opens a kai-command
// palette, the composer Tools menu + a header button open the kai-artifact canvas
// in a kai-resizable split).

// kai-resizable / kai-resizable-item / kai-artifact / kai-avatar are used here as
// JSX elements; the other kai-* tags are declared (identically) by sibling story
// files. TypeScript merges identical global augmentations, so the shared tags are
// copied byte-for-byte from the canonical sibling decls (mismatch errors TS2717).
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-workspace': JSX.HTMLAttributes<HTMLElement> & { 'sidebar-min-width'?: string | number; 'collapse-below'?: string | number };
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-nav': JSX.HTMLAttributes<HTMLElement> & { value?: string; 'default-value'?: string; theme?: string };
      'kai-menu': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'trigger-icon'?: string; 'trigger-label'?: string; 'trigger-icon-trailing'?: string; label?: string };
      'kai-badge': JSX.HTMLAttributes<HTMLElement> & { variant?: string };
      'kai-message': JSX.HTMLAttributes<HTMLElement>;
      'kai-prompt-input': JSX.HTMLAttributes<HTMLElement> & { theme?: string; placeholder?: string; loading?: boolean; disabled?: boolean; voice?: boolean; 'web-search'?: boolean; attach?: boolean; submit?: string; 'suggestion-mode'?: string };
      'kai-model-switcher': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'current-model'?: string };
      'kai-separator': JSX.HTMLAttributes<HTMLElement> & { orientation?: string };
      'kai-command': JSX.HTMLAttributes<HTMLElement> & { placeholder?: string; 'empty-label'?: string; theme?: string };
      'kai-tooltip': JSX.HTMLAttributes<HTMLElement> & { content?: string; 'open-delay'?: number | string };
      'kai-avatar': JSX.HTMLAttributes<HTMLElement> & { src?: string; alt?: string; fallback?: string; size?: string };
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
    }
  }
}

const meta = { title: 'Labs/Apps', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;
type El = HTMLElement & Record<string, unknown>;

// The flat primary rows above the chat list (Library, GPTs). kai-nav is a FLAT
// list, so these are single entry-point rows.
const PRIMARY: KaiNavItem[] = [
  { id: 'library', label: 'Library', icon: 'book-open' },
  { id: 'gpts', label: 'GPTs', icon: 'box' },
];

// Recents fed to the workspace's built-in conversation pane. Times are spread so
// the kit auto-derives varied relative labels off `updatedAt`. The pane renders
// them as a flat list with a relative-time label per row.
const RECENTS: ConversationSummary[] = ([
  ['Debounce vs throttle in TS', '2026-06-27T09:10:00Z'],
  ['Postgres EXPLAIN ANALYZE help', '2026-06-27T02:00:00Z'],
  ['Refactor a React context', '2026-06-26T15:00:00Z'],
  ['Trip plan, 4 days in Lisbon', '2026-06-25T10:00:00Z'],
  ['Summarize a 30-page PDF', '2026-06-23T10:00:00Z'],
  ['Regex for ISO timestamps', '2026-06-20T10:00:00Z'],
  ['Dockerfile multi-stage build', '2026-06-12T10:00:00Z'],
  ['Explain CAP theorem simply', '2026-06-01T10:00:00Z'],
] as const).map(([title, ts], i) => ({ id: `c${i}`, title, scope: { type: 'document' }, messageCount: 6, lastMessageAt: ts, updatedAt: ts }));

// The composer model picker (Auto / Instant / Thinking). ModelOption = { id, name }.
const MODELS = [
  { id: 'auto', name: 'Auto' },
  { id: 'instant', name: 'Instant' },
  { id: 'thinking', name: 'Thinking' },
];

// Command-palette contents (the kai-command `items` prop). A flat KaiCommandItem[];
// the element buckets them into sections by `group`.
const COMMANDS: KaiCommandItem[] = [
  { id: 'new-chat', label: 'New chat', icon: 'square-pen', group: 'Quick actions' },
  { id: 'search-chats', label: 'Search chats', icon: 'search', group: 'Quick actions' },
  { id: 'library', label: 'Library', icon: 'book-open', group: 'Quick actions' },
  { id: 'rc-debounce', label: 'Debounce vs throttle in TS', icon: 'message-square', group: 'Recents' },
  { id: 'rc-explain', label: 'Postgres EXPLAIN ANALYZE help', icon: 'message-square', group: 'Recents' },
  { id: 'rc-lisbon', label: 'Trip plan, 4 days in Lisbon', icon: 'message-square', group: 'Recents' },
  { id: 'gpt-code', label: 'Code Copilot', icon: 'code', group: 'GPTs' },
  { id: 'gpt-write', label: 'Write For Me', icon: 'pencil', group: 'GPTs' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'Settings' },
  { id: 'help', label: 'Get help', icon: 'message-circle', group: 'Settings' },
];

// Account menu (kai-menu items), pinned at the sidebar bottom.
const ACCOUNT_ITEMS = [
  { heading: true, label: 'sam@example.com' },
  { id: 'upgrade', label: 'Upgrade plan', icon: 'sparkles' },
  { id: 'customize', label: 'Customize ChatGPT', icon: 'square-pen' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { separator: true },
  { id: 'help', label: 'Help', icon: 'message-circle' },
  { id: 'logout', label: 'Log out' },
];

// A two-turn thread. The assistant turn carries the BUILT-IN action row
// (copy / like / dislike / regenerate) - those are real. Content is real markdown:
// a fenced TS code block (Shiki highlight + copy button via kai-code-block) and a
// GFM table.
const ANSWER_MD = `Use \`debounce\` to wait until calls stop; use \`throttle\` to cap the rate. Here is a minimal debounce:

\`\`\`ts
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms = 200) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
\`\`\`

| Helper | Fires | Good for |
| --- | --- | --- |
| debounce | after calls go quiet | search-as-you-type, resize |
| throttle | at most once per window | scroll, pointermove |

Create the wrapper once and reuse the returned function so the timer is shared.`;

const MESSAGES: ChatMessage[] = [
  textMessage('user', 'What is the difference between debounce and throttle, and can you show a tiny debounce in TypeScript?', { id: 'u1' }),
  textMessage('assistant', ANSWER_MD, { id: 'a1', actions: ['copy', 'like', 'dislike', 'regenerate'] }),
];

// The canvas document - kai-artifact's Code tab (real source + tree + copy). Set
// as a JS property; `defaultTab` opens it on Code so no live preview URL is needed.
const CANVAS_FILES = [
  {
    path: 'debounce.ts',
    language: 'ts',
    type: 'other' as const,
    code: `export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms = 200) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}`,
  },
  {
    path: 'usage.ts',
    language: 'ts',
    type: 'other' as const,
    code: `import { debounce } from './debounce';

const onSearch = debounce((q: string) => {
  console.log('searching', q);
}, 300);

input.addEventListener('input', (e) => onSearch((e.target as HTMLInputElement).value));`,
  },
];

export const ChatGPT: Story = {
  name: 'ChatGPT',
  render: () => {
    const [cmdOpen, setCmdOpen] = createSignal(false);
    const [canvasOpen, setCanvasOpen] = createSignal(false);
    // Captured in the workspace ref so the sidebar toggle can drive the exposed
    // imperative API (toggleSidebar) from a sibling element's ref.
    let ws: El | undefined;

    // Array/object props (and event wiring) are applied in each element's ref
    // callback, NOT a one-shot onMount, so they survive remounts. sidebarMaxWidth
    // is set here as a property (not a `sidebar-max-width` attribute) because the
    // shared kai-workspace JSX decl is kept byte-identical across the sibling app
    // stories to avoid TS2717; sidebar-min-width / collapse-below are in that decl.
    return (
      <div class="relative h-screen w-full">
        <kai-workspace
          ref={(el) => { ws = el as El; ws.conversations = RECENTS; ws.compact = true; ws.sidebarMaxWidth = 420; }}
          class="block h-full"
          sidebar-min-width="240"
          collapse-below="720"
        >
          {/* sidebar-header: toggle, New chat, Search, the flat primary rows. */}
          <div slot="sidebar-header" class="flex flex-col gap-2 px-2.5 pt-2.5">
            <div class="flex justify-between">
              <kai-tooltip content="Toggle sidebar">
                <kai-button
                  ref={(el) => { el.addEventListener('kai-click', () => (ws?.toggleSidebar as (() => void) | undefined)?.()); }}
                  variant="ghost"
                  size="icon-sm"
                  icon="panel-left"
                  label="Toggle sidebar"
                ></kai-button>
              </kai-tooltip>
            </div>
            <kai-button variant="ghost" full align="start" icon="square-pen">New chat</kai-button>
            <kai-button
              ref={(el) => { el.addEventListener('kai-click', () => setCmdOpen(true)); }}
              variant="ghost"
              full
              align="start"
              icon="search"
            >
              Search chats
              <span class="ml-auto rounded border border-border px-1 text-[0.6875rem] text-muted-foreground">⌘K</span>
            </kai-button>
            <kai-nav ref={(el) => { (el as El).items = PRIMARY; }}></kai-nav>
            <div class="mt-1 pl-2.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Chats</div>
          </div>

          {/* sidebar-footer: the account entry pinned at the bottom. */}
          <div slot="sidebar-footer">
            <kai-separator></kai-separator>
            <div class="px-2 py-1.5">
              <kai-menu ref={(el) => { (el as El).items = ACCOUNT_ITEMS; }} label="Account menu">
                {/* The trigger content is NON-interactive: kai-menu wraps it in its
                    own <button>, so a button/kai-button here would double-nest. */}
                <div slot="trigger" class="flex w-full items-center gap-2 text-left">
                  <kai-avatar fallback="S" size="sm"></kai-avatar>
                  <span class="text-sm font-medium">Sam</span>
                  <span class="ml-auto text-[0.8125rem] text-muted-foreground">Plus</span>
                </div>
              </kai-menu>
            </div>
          </div>

          {/* main-header: the thread top bar - a title/version menu on the left,
              Share + a Canvas toggle on the right. */}
          <div slot="main-header" class="flex items-center justify-between gap-3 px-4 py-2">
            <kai-menu
              ref={(el) => { (el as El).items = [
                { id: 'gpt5', label: 'ChatGPT 5', checked: true },
                { id: 'gpt5-think', label: 'ChatGPT 5 Thinking' },
                { id: 'gpt4o', label: 'ChatGPT 4o' },
                { separator: true },
                { id: 'temp', label: 'Temporary chat', icon: 'circle' },
              ]; }}
              trigger-label="ChatGPT 5"
              trigger-icon-trailing="chevron-down"
              label="Switch model"
            ></kai-menu>
            <div class="flex items-center gap-1.5">
              <kai-button variant="ghost" size="sm" icon="share">Share</kai-button>
              <kai-tooltip content="Open canvas">
                <kai-button
                  ref={(el) => { el.addEventListener('kai-click', () => setCanvasOpen((v) => !v)); }}
                  variant="ghost"
                  size="icon-sm"
                  icon="code"
                  label="Open canvas"
                ></kai-button>
              </kai-tooltip>
              <kai-menu
                ref={(el) => { (el as El).items = [
                  { id: 'archive', label: 'Archive', icon: 'box' },
                  { id: 'rename', label: 'Rename', icon: 'pencil' },
                  { separator: true },
                  { id: 'delete', label: 'Delete', icon: 'x' },
                ]; }}
                trigger-icon="more-horizontal"
                label="More"
              ></kai-menu>
            </div>
          </div>

          {/* main: the thread + composer beside the canvas, in a resizable split.
              The canvas panel starts COLLAPSED and toggles from the header button
              or the composer Tools menu (Write or code). */}
          <div slot="main" class="h-full">
            <kai-resizable orientation="horizontal" class="block h-full">
              {/* thread column: a scrolling turn list above the pinned composer */}
              <kai-resizable-item min="420px">
                <div class="flex h-full flex-col">
                  <div class="min-h-0 flex-1 overflow-y-auto">
                    <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
                      <For each={MESSAGES}>
                        {(m) => (
                          <kai-message
                            ref={(el) => { const e = el as El; e.message = m; e.avatar = 'none'; }}
                            style={{ display: 'block' }}
                          ></kai-message>
                        )}
                      </For>
                    </div>
                  </div>

                  {/* the composer */}
                  <div class="shrink-0 border-t border-border p-3">
                    <div class="mx-auto flex max-w-3xl flex-col gap-1.5">
                      <kai-prompt-input ref={(el) => { (el as El).attach = false; }} placeholder="Ask anything">
                        <div slot="toolbar-start" class="flex items-center gap-1.5">
                          {/* the "+" attach/upload menu */}
                          <kai-menu
                            ref={(el) => { (el as El).items = [
                              { id: 'files', label: 'Add photos & files', icon: 'paperclip' },
                              { id: 'apps', label: 'Add from apps', icon: 'box' },
                            ]; }}
                            trigger-icon="plus"
                            label="Add"
                          ></kai-menu>
                          {/* the Tools menu; "Write or code" opens the canvas */}
                          <kai-menu
                            ref={(el) => {
                              (el as El).items = [
                                { id: 'image', label: 'Create an image', icon: 'sparkles' },
                                { id: 'web', label: 'Search the web', icon: 'globe' },
                                { id: 'canvas', label: 'Write or code', icon: 'code' },
                                { id: 'research', label: 'Run deep research', icon: 'search' },
                              ];
                              el.addEventListener('kai-select', (e) => {
                                if ((e as CustomEvent).detail.id === 'canvas') setCanvasOpen(true);
                              });
                            }}
                            trigger-icon="sliders-horizontal"
                            trigger-label="Tools"
                          ></kai-menu>
                        </div>
                        <div slot="toolbar-end" class="flex items-center gap-1.5">
                          {/* the model picker - Auto / Instant / Thinking */}
                          <kai-model-switcher ref={(el) => { const s = el as El; s.models = MODELS; s.currentModel = 'auto'; }}></kai-model-switcher>
                          {/* the thinking-effort toggle */}
                          <kai-menu
                            ref={(el) => { (el as El).items = [
                              { heading: true, label: 'Thinking effort' },
                              { id: 'standard', label: 'Standard', checked: true },
                              { id: 'extended', label: 'Extended' },
                            ]; }}
                            trigger-label="Standard"
                            trigger-icon-trailing="chevron-down"
                            label="Thinking effort"
                          ></kai-menu>
                          <kai-tooltip content="Dictate">
                            <kai-button variant="subtle" size="icon-sm" icon="mic" label="Dictate"></kai-button>
                          </kai-tooltip>
                        </div>
                      </kai-prompt-input>
                      <div class="text-center text-[0.6875rem] text-muted-foreground">ChatGPT can make mistakes. Check important info.</div>
                    </div>
                  </div>
                </div>
              </kai-resizable-item>

              {/* the canvas: a side-by-side document/code editor (kai-artifact). It
                  starts collapsed; the header button or the Tools menu opens it. */}
              <kai-resizable-item size="44%" min="360px" collapsed={!canvasOpen()}>
                <div class="flex h-full flex-col border-l border-border">
                  <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <span class="text-sm font-medium">debounce.ts</span>
                    <kai-tooltip content="Close canvas">
                      <kai-button
                        ref={(el) => { el.addEventListener('kai-click', () => setCanvasOpen(false)); }}
                        variant="ghost"
                        size="icon-sm"
                        icon="x"
                        label="Close canvas"
                      ></kai-button>
                    </kai-tooltip>
                  </div>
                  <div class="min-h-0 flex-1">
                    <kai-artifact
                      ref={(el) => { const a = el as El; a.files = CANVAS_FILES; a.defaultTab = 'code'; a.activeFile = 'debounce.ts'; }}
                      expandable
                    ></kai-artifact>
                  </div>
                </div>
              </kai-resizable-item>
            </kai-resizable>
          </div>
        </kai-workspace>

        {/* Command palette: a light-DOM overlay hosting kai-command. Opened by the
            sidebar Search button; closes on backdrop click, Escape, or a selection.
            The inner panel stops clicks from reaching the scrim. */}
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
                placeholder="Search chats, GPTs, settings..."
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
        // render). The recents are the workspace's built-in conversation pane;
        // the thread is a kai-message list; the composer carries the +/Tools
        // menus + the model picker; the canvas is a kai-artifact in a kai-resizable
        // split.
        code: `<kai-workspace sidebar-min-width="240" sidebar-max-width="420" collapse-below="720">
  <!-- rail: toggle, New chat, Search, the flat primary rows -->
  <div slot="sidebar-header">
    <kai-tooltip content="Toggle sidebar">
      <kai-button variant="ghost" size="icon-sm" icon="panel-left" label="Toggle sidebar"></kai-button>
    </kai-tooltip>
    <kai-button variant="ghost" icon="square-pen">New chat</kai-button>
    <kai-button variant="ghost" icon="search">Search chats ⌘K</kai-button>
    <kai-nav></kai-nav> <!-- Library, GPTs (flat rows) -->
  </div>
  <div slot="sidebar-footer">
    <kai-menu label="Account menu">
      <!-- Trigger content is NON-interactive: kai-menu supplies the button. -->
      <div slot="trigger"><kai-avatar fallback="S"></kai-avatar> Sam</div>
    </kai-menu>
  </div>

  <!-- top bar: the model/version menu, Share, and a Canvas toggle -->
  <div slot="main-header">
    <kai-menu trigger-label="ChatGPT 5" trigger-icon-trailing="chevron-down" label="Switch model"></kai-menu>
    <kai-button variant="ghost" icon="share">Share</kai-button>
    <kai-tooltip content="Open canvas">
      <kai-button variant="ghost" size="icon-sm" icon="code" label="Open canvas"></kai-button>
    </kai-tooltip>
    <kai-menu trigger-icon="more-horizontal" label="More"></kai-menu>
  </div>

  <!-- main: the thread + composer beside the canvas, in a resizable split -->
  <div slot="main">
    <kai-resizable orientation="horizontal">
      <kai-resizable-item min="420px">
        <!-- one <kai-message> per turn; assistant carries the built-in action row -->
        <kai-message><!-- message = { role:'user', parts:[{ type:'text', text }] } --></kai-message>
        <kai-message><!-- message = { role:'assistant', parts:[{ type:'text', text }], actions:['copy','like','dislike','regenerate'] } --></kai-message>
        <kai-prompt-input placeholder="Ask anything">
          <div slot="toolbar-start">
            <kai-menu trigger-icon="plus" label="Add"></kai-menu>            <!-- + attach/upload -->
            <kai-menu trigger-icon="sliders-horizontal" trigger-label="Tools"></kai-menu> <!-- Tools; "Write or code" opens the canvas -->
          </div>
          <div slot="toolbar-end">
            <kai-model-switcher></kai-model-switcher>                          <!-- Auto / Instant / Thinking -->
            <kai-menu trigger-label="Standard" trigger-icon-trailing="chevron-down" label="Thinking effort"></kai-menu>
            <kai-tooltip content="Dictate">
              <kai-button variant="subtle" size="icon-sm" icon="mic" label="Dictate"></kai-button>
            </kai-tooltip>
          </div>
        </kai-prompt-input>
      </kai-resizable-item>

      <!-- the canvas: a document/code editor. Starts collapsed; opens from the
           header button or the Tools menu. -->
      <kai-resizable-item size="44%" min="360px" collapsed>
        <kai-artifact expandable></kai-artifact>
      </kai-resizable-item>
    </kai-resizable>
  </div>
</kai-workspace>

<!-- the command palette: a light-DOM overlay hosting kai-command, toggled open -->
<div class="cmd-scrim"><kai-command placeholder="Search chats, GPTs, settings..."></kai-command></div>

<script type="module">
  // Array/object props are JS properties (the kai- contract); scalars are attributes.
  document.querySelector('kai-workspace').conversations = [/* ConversationSummary[] - recents */];
  document.querySelector('kai-workspace').compact = true;
  document.querySelector('kai-nav').items = [{ id: 'library', label: 'Library', icon: 'book-open' }, { id: 'gpts', label: 'GPTs', icon: 'box' }];
  // One message object per turn; the assistant turn carries the action row.
  thread.querySelectorAll('kai-message')[1].message = {
    id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '...markdown...' }], actions: ['copy', 'like', 'dislike', 'regenerate'],
  };
  document.querySelector('kai-model-switcher').models = [{ id: 'auto', name: 'Auto' }, { id: 'instant', name: 'Instant' }, { id: 'thinking', name: 'Thinking' }];
  // The canvas (Code tab) source, set as a property.
  document.querySelector('kai-artifact').files = [{ path: 'debounce.ts', language: 'ts', code: 'export function debounce(...) { ... }' }];
  document.querySelector('kai-artifact').defaultTab = 'code';
  document.querySelector('kai-command').items = [/* KaiCommandItem[] grouped by 'group' */];

  // Interactions: Search opens the palette; the header button + the Tools menu
  // "Write or code" toggle the canvas panel (collapse the kai-resizable-item).
  searchButton.addEventListener('kai-click', () => showPalette());
  canvasButton.addEventListener('kai-click', () => toggleCanvas());
  document.querySelector('kai-menu.tools').addEventListener('kai-select', (e) => { if (e.detail.id === 'canvas') openCanvas(); });
</script>`,
      },
    },
  },
};
