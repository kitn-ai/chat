import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show, For, type Component } from 'solid-js';
import { Code2, FileText, Globe, MessageSquare } from 'lucide-solid';
import { expect, userEvent, waitFor } from 'storybook/test';
import './register'; // every kai-* element used below
import type { KaiNavItem } from '../ui/nav';
import type { KaiCommandItem } from './command';
import type { KaiMenuItem } from './menu';
import { textMessage } from '../state';
import type { ChatMessage } from './chat-types';
import { relativeTimeShort } from '../components/conversation-item';

// Labs/Apps: "Wisp" - an invented general-chat product (no real app; it just
// looks like one) whose whole job is to be the living demo of CONSTRUCTION over
// configuration. Where the ChatGPT replica hands its rail a conversations ARRAY
// (batteries mode), Wisp's rail is COMPOSED: the consumer owns the loop, and
// each recent is a real <kai-conversation-item> row - a slotted leading icon, a
// derived meta timestamp, and a working per-row kai-menu kebab (Rename /
// Archive / Delete really mutate the rows). The container detects the slotted
// items, skips its data rendering, and runs the parent-item contract over them
// (selection, roving tabindex, the list/row ARIA relationship). The shell
// (kai-workspace), the thread + composer, the canvas split and the command
// palette are kept from the base app.

// kai-resizable / kai-resizable-item / kai-artifact / kai-avatar are used here as
// JSX elements; the other kai-* tags are declared (identically) by sibling story
// files. TypeScript merges identical global augmentations, so the shared tags are
// copied byte-for-byte from the canonical sibling decls (mismatch errors TS2717).
// 'kai-conversation-item' is declared here first (no sibling declares it yet);
// 'kai-conversations' is canonical in chat-slots.stories.tsx and NOT redeclared.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-workspace': JSX.HTMLAttributes<HTMLElement> & { 'collapse-below'?: string | number; 'drawer-below'?: string | number };
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
      'kai-conversation-item': JSX.HTMLAttributes<HTMLElement> & { 'conversation-id'?: string; active?: boolean; compact?: boolean };
    }
  }
}

const meta = { title: 'Labs/Apps', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;
type El = HTMLElement & Record<string, unknown>;

// The flat primary rows above the chat list.
const PRIMARY: KaiNavItem[] = [
  { id: 'library', label: 'Library', icon: 'book-open' },
  { id: 'spaces', label: 'Spaces', icon: 'box' },
];

// The composed rail's records: the CONSUMER's own shape, not ConversationSummary.
// Timestamps are offsets from now so the meta region derives honest relative
// labels at render time (relativeTimeShort is a render-time snapshot).
interface Recent {
  id: string;
  title: string;
  icon: keyof typeof ROW_ICONS;
  at: number;
  archived?: boolean;
}
const HOUR = 3_600_000;
const NOW = Date.now();
const INITIAL_RECENTS: Recent[] = [
  { id: 'c0', title: 'Debounce vs throttle in TS', icon: 'code', at: NOW - 2 * HOUR },
  { id: 'c1', title: 'Postgres EXPLAIN ANALYZE help', icon: 'code', at: NOW - 9 * HOUR },
  { id: 'c2', title: 'Trip plan, 4 days in Lisbon', icon: 'globe', at: NOW - 30 * HOUR },
  { id: 'c3', title: 'Summarize a 30-page PDF', icon: 'file', at: NOW - 3 * 24 * HOUR },
  { id: 'c4', title: 'Regex for ISO timestamps', icon: 'chat', at: NOW - 6 * 24 * HOUR },
  { id: 'c5', title: 'Dockerfile multi-stage build', icon: 'code', at: NOW - 12 * 24 * HOUR },
];
const ROW_ICONS: Record<string, Component<{ size?: number | string }>> = {
  code: Code2,
  globe: Globe,
  file: FileText,
  chat: MessageSquare,
};

// The per-row kebab: the kit's own kai-menu, one per row, slotted into the
// item's menu region. Leaf ids are the action verbs the kai-select handler
// switches on.
const ROW_MENU_ITEMS: KaiMenuItem[] = [
  { id: 'rename', label: 'Rename', icon: 'pencil' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { separator: true },
  { id: 'delete', label: 'Delete', icon: 'x' },
];

// The composer model picker.
const MODELS = [
  { id: 'auto', name: 'Auto' },
  { id: 'swift', name: 'Swift' },
  { id: 'deep', name: 'Deep' },
];

// Command-palette contents (the kai-command `items` prop).
const COMMANDS: KaiCommandItem[] = [
  { id: 'new-chat', label: 'New chat', icon: 'square-pen', group: 'Quick actions' },
  { id: 'search-chats', label: 'Search chats', icon: 'search', group: 'Quick actions' },
  { id: 'library', label: 'Library', icon: 'book-open', group: 'Quick actions' },
  { id: 'rc-debounce', label: 'Debounce vs throttle in TS', icon: 'message-square', group: 'Recents' },
  { id: 'rc-explain', label: 'Postgres EXPLAIN ANALYZE help', icon: 'message-square', group: 'Recents' },
  { id: 'rc-lisbon', label: 'Trip plan, 4 days in Lisbon', icon: 'message-square', group: 'Recents' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'Settings' },
  { id: 'help', label: 'Get help', icon: 'message-circle', group: 'Settings' },
];

// Account menu (kai-menu items), pinned at the sidebar bottom.
const ACCOUNT_ITEMS: KaiMenuItem[] = [
  { heading: true, label: 'sam@example.com' },
  { id: 'upgrade', label: 'Upgrade plan', icon: 'sparkles' },
  { id: 'customize', label: 'Customize Wisp', icon: 'square-pen' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { separator: true },
  { id: 'help', label: 'Help', icon: 'message-circle' },
  { id: 'logout', label: 'Log out' },
];

// A two-turn thread. The assistant turn carries the BUILT-IN action row.
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

// The canvas document - kai-artifact's Code tab.
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
];

export const Wisp: Story = {
  name: 'Wisp',
  render: () => {
    const [cmdOpen, setCmdOpen] = createSignal(false);
    const [canvasOpen, setCanvasOpen] = createSignal(false);
    const [railCollapsed, setRailCollapsed] = createSignal(false);
    // The composed rail's state: the consumer owns the records AND the loop.
    const [recents, setRecents] = createSignal<Recent[]>(INITIAL_RECENTS);
    const [activeId, setActiveId] = createSignal('c0');
    let ws: El | undefined;
    const toggleRail = () => (ws?.toggleAside as ((side: string) => void) | undefined)?.('start');

    // The kebab actions really mutate the rows. Reference-keyed <For>: a fresh
    // array notifies, a fresh object per changed row makes the change visible.
    const applyAction = (action: string, id: string) => {
      if (action === 'rename') {
        setRecents((prev) => prev.map((r) => (r.id === id ? { ...r, title: `${r.title} (renamed)` } : r)));
      } else if (action === 'archive') {
        setRecents((prev) => {
          const row = prev.find((r) => r.id === id);
          return row ? [...prev.filter((r) => r.id !== id), { ...row, archived: true }] : prev;
        });
      } else if (action === 'delete') {
        setRecents((prev) => prev.filter((r) => r.id !== id));
      }
    };

    return (
      <div class="relative h-screen w-full">
        <kai-workspace
          ref={(el) => {
            ws = el as El;
            ws.compact = true;
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
          {/* start: the COMPOSED rail. No conversations array anywhere - the
              consumer-owned <For> renders one <kai-conversation-item> per
              record (leading icon, meta timestamp, kebab menu all slotted); the
              container detects the items, skips its data rendering, and runs
              the parent-item contract (selection, roving tabindex, list ARIA).
              Activation surfaces as kai-conversation-select on the CONTAINER,
              and a click in a row's menu region never selects the row. */}
          <kai-conversations
            slot="start"
            ref={(el) => {
              el.addEventListener('kai-conversation-select', (e) => {
                setActiveId((e as CustomEvent<{ id: string }>).detail.id);
              });
            }}
            style={{ display: 'block', height: '100%' }}
          >
            <div slot="header" class="flex flex-col gap-2 px-2.5 pt-2.5 pb-1">
              <div class="flex justify-between">
                <kai-tooltip content="Toggle sidebar">
                  <kai-button
                    ref={(el) => { el.addEventListener('kai-click', toggleRail); }}
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
            </div>

            {/* the consumer-owned loop: one composed row per record */}
            <For each={recents()}>
              {(row) => {
                const Icon = ROW_ICONS[row.icon];
                return (
                  <kai-conversation-item conversation-id={row.id} active={activeId() === row.id}>
                    <span slot="leading" aria-hidden="true"><Icon size={14} /></span>
                    {row.title}
                    <span slot="meta">{row.archived ? 'Archived' : relativeTimeShort(new Date(row.at).toISOString())}</span>
                    <kai-menu
                      slot="menu"
                      label={`Actions for ${row.title}`}
                      ref={(el) => {
                        (el as El).items = ROW_MENU_ITEMS;
                        el.addEventListener('kai-select', (e) => {
                          applyAction((e as CustomEvent<{ id: string }>).detail.id, row.id);
                        });
                      }}
                    >
                      {/* Trigger content is NON-interactive: kai-menu supplies
                          the focusable button, named by `label`. */}
                      <span slot="trigger" aria-hidden="true">&#8942;</span>
                    </kai-menu>
                  </kai-conversation-item>
                );
              }}
            </For>

            <div slot="footer" class="px-2 py-1.5">
              <kai-menu ref={(el) => { (el as El).items = ACCOUNT_ITEMS; }} label="Account menu">
                <div slot="trigger" class="flex w-full items-center gap-2 text-left">
                  <kai-avatar fallback="S" size="sm"></kai-avatar>
                  <span class="text-sm font-medium">Sam</span>
                  <span class="ml-auto text-[0.8125rem] text-muted-foreground">Plus</span>
                </div>
              </kai-menu>
            </div>
          </kai-conversations>

          {/* main: the thread top bar above the thread + canvas split. */}
          <div slot="main" class="flex h-full flex-col">
          <div class="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
            <div class="flex items-center gap-1.5">
            <Show when={railCollapsed()}>
              <kai-tooltip content="Open sidebar">
                <kai-button
                  ref={(el) => { el.addEventListener('kai-click', toggleRail); }}
                  variant="ghost"
                  size="icon-sm"
                  icon="panel-left"
                  label="Open sidebar"
                ></kai-button>
              </kai-tooltip>
            </Show>
            <kai-menu
              ref={(el) => { (el as El).items = [
                { id: 'wisp-2', label: 'Wisp 2', checked: true },
                { id: 'wisp-2-deep', label: 'Wisp 2 Deep' },
                { id: 'wisp-1', label: 'Wisp 1' },
                { separator: true },
                { id: 'temp', label: 'Temporary chat', icon: 'circle' },
              ]; }}
              trigger-label="Wisp 2"
              trigger-icon-trailing="chevron-down"
              label="Switch model"
            ></kai-menu>
            </div>
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

          {/* the thread + composer beside the canvas, in a resizable split. */}
          <div class="min-h-0 flex-1">
            <kai-resizable orientation="horizontal" class="block h-full">
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
                          <kai-menu
                            ref={(el) => { (el as El).items = [
                              { id: 'files', label: 'Add photos & files', icon: 'paperclip' },
                              { id: 'apps', label: 'Add from apps', icon: 'box' },
                            ]; }}
                            trigger-icon="plus"
                            label="Add"
                          ></kai-menu>
                          <kai-menu
                            ref={(el) => {
                              (el as El).items = [
                                { id: 'image', label: 'Create an image', icon: 'sparkles' },
                                { id: 'web', label: 'Search the web', icon: 'globe' },
                                { id: 'canvas', label: 'Write or code', icon: 'code' },
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
                          <kai-model-switcher ref={(el) => { const s = el as El; s.models = MODELS; s.currentModel = 'auto'; }}></kai-model-switcher>
                          <kai-tooltip content="Dictate">
                            <kai-button variant="subtle" size="icon-sm" icon="mic" label="Dictate"></kai-button>
                          </kai-tooltip>
                        </div>
                      </kai-prompt-input>
                      <div class="text-center text-[0.6875rem] text-muted-foreground">Wisp can make mistakes. Check important info.</div>
                    </div>
                  </div>
                </div>
              </kai-resizable-item>

              {/* the canvas: starts collapsed; the header button or the Tools
                  menu opens it. */}
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
          </div>
        </kai-workspace>

        {/* Command palette overlay, opened by the sidebar Search button. */}
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
                placeholder="Search chats, spaces, settings..."
              ></kai-command>
            </div>
          </div>
        </Show>
      </div>
    );
  },
  // The composed rail's kebab really works: open the first row's menu, pick
  // Rename, and the row title visibly changes in the rail's light DOM.
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const firstItem = canvasElement.querySelector('kai-conversation-item');
    expect(firstItem).toBeTruthy();
    const menuHost = firstItem!.querySelector('kai-menu') as HTMLElement | null;
    expect(menuHost).toBeTruthy();
    const shadow = menuHost!.shadowRoot!;
    const trigger = shadow.querySelector<HTMLElement>('button');
    expect(trigger).toBeTruthy();

    await userEvent.click(trigger!);
    await waitFor(() => expect(shadow.querySelector('[role="menu"]')).toBeTruthy());
    const rename = [...shadow.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
      el.textContent?.includes('Rename'),
    );
    expect(rename).toBeTruthy();
    await userEvent.click(rename!);
    await waitFor(() => {
      expect(canvasElement.textContent).toContain('Debounce vs throttle in TS (renamed)');
      expect(shadow.querySelector('[role="menu"]')).toBeNull();
    });
  },
  parameters: {
    docs: {
      description: {
        story:
          'The living demo of construction over configuration. Wisp is an invented product; the point is its rail. Nothing hands the sidebar a conversations array: the app owns the loop and renders one kai-conversation-item per record, slotting a leading icon, a derived timestamp into the meta region, and a working kai-menu kebab into the menu region (Rename, Archive and Delete really mutate the rows). The container detects the slotted items and runs the parent-item contract over them - selection, roving tabindex, the accessible list rows - while the shell, thread, composer and canvas are the same composed kit parts as the sibling apps.',
      },
      source: {
        language: 'html',
        // A representative skeleton of the composition (not the full interactive
        // render). The rail is CONSTRUCTED: your loop emits one
        // <kai-conversation-item> per record, with the leading icon, the meta
        // timestamp and your own kai-menu slotted into the item's regions.
        code: `<kai-workspace collapse-below="720">
  <!-- start: the COMPOSED rail. No conversations array anywhere. -->
  <kai-conversations slot="start">
    <div slot="header">
      <kai-button variant="ghost" icon="square-pen">New chat</kai-button>
      <kai-button variant="ghost" icon="search">Search chats ⌘K</kai-button>
      <kai-nav></kai-nav> <!-- Library, Spaces (flat rows) -->
    </div>

    <!-- YOUR loop (map / <For> / v-for) emits one composed row per record.
         The container detects the items, skips its data rendering, and runs
         the parent-item contract: selection, roving tabindex, list ARIA. -->
    <kai-conversation-item conversation-id="c0" active>
      <span slot="leading"><!-- your icon --></span>
      Debounce vs throttle in TS
      <span slot="meta">2h ago</span>
      <!-- your OWN menu in the menu region; a click here never selects the row -->
      <kai-menu slot="menu" label="Actions for Debounce vs throttle in TS">
        <span slot="trigger" aria-hidden="true">&#8942;</span>
      </kai-menu>
    </kai-conversation-item>
    <!-- ...one per record -->

    <div slot="footer">
      <kai-menu label="Account menu">
        <div slot="trigger"><kai-avatar fallback="S"></kai-avatar> Sam</div>
      </kai-menu>
    </div>
  </kai-conversations>

  <!-- main: thread + composer beside a collapsible canvas -->
  <div slot="main">
    <kai-resizable orientation="horizontal">
      <kai-resizable-item min="420px">
        <kai-message><!-- one per turn --></kai-message>
        <kai-prompt-input placeholder="Ask anything"></kai-prompt-input>
      </kai-resizable-item>
      <kai-resizable-item size="44%" min="360px" collapsed>
        <kai-artifact expandable></kai-artifact>
      </kai-resizable-item>
    </kai-resizable>
  </div>
</kai-workspace>

<script type="module">
  import '@kitn.ai/ui/elements';
  // Selection flows container -> item: listen on the CONTAINER, drive each
  // item's \`active\`. Array/object props are JS properties (the kai- contract).
  const rail = document.querySelector('kai-conversations');
  rail.addEventListener('kai-conversation-select', (e) => setActive(e.detail.id));
  // Each row's kebab is a real kai-menu: items as a property, actions on kai-select.
  for (const menu of document.querySelectorAll('kai-conversation-item kai-menu')) {
    menu.items = [
      { id: 'rename', label: 'Rename', icon: 'pencil' },
      { id: 'archive', label: 'Archive', icon: 'archive' },
      { separator: true },
      { id: 'delete', label: 'Delete', icon: 'x' },
    ];
    menu.addEventListener('kai-select', (e) => applyAction(e.detail.id, rowIdOf(menu)));
  }
</script>`,
      },
    },
  },
};
