import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { Nav, type KaiNavItem } from './nav';
import { componentDescription } from '../stories/docs/element-controls';

const ITEMS: KaiNavItem[] = [
  { id: 'new', label: 'New task', icon: 'plus', trailing: 'pencil' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'artifacts', label: 'Artifacts', icon: 'sparkles' },
  { id: 'dispatch', label: 'Dispatch', icon: 'share', badge: 'Beta' },
  { id: 'customize', label: 'Customize', icon: 'book-open' },
  { id: 'archived', label: 'Archived', icon: 'box', disabled: true },
];

const meta = {
  title: 'Components/Elements/Nav',
  component: Nav,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A vertical sidebar nav. Pass `items` (`id`, `label`, optional `icon` / `badge` / `trailing` / `disabled`); `value` is the active id (drives `aria-current`), and `onItemSelect` fires with the clicked id.',
        'Items nest via `children` (a collapsible group with a disclosure chevron; `defaultCollapsed` seeds the closed set). A `status` (`{ tone, label?, pulse? }`) draws a colored dot, and `meta` adds right-aligned muted trailing text such as a relative time.',
      ]),
    },
  },
  argTypes: {
    value: {
      control: 'select',
      options: ITEMS.map((i) => i.id),
      description: 'Active item id.',
    },
    onItemSelect: {
      action: 'item-select',
      description: 'Fired with the selected item id.',
      table: { category: 'Events' },
    },
  },
  args: {
    value: 'new',
  },
  render: (args) => {
    const [value, setValue] = createSignal(args.value ?? 'new');
    return (
      <div class="w-60">
        <Nav
          items={ITEMS}
          value={value()}
          onItemSelect={(id) => { setValue(id); args.onItemSelect?.(id); }}
        />
      </div>
    );
  },
} satisfies Meta<typeof Nav>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Nav } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: click an item; the selected look follows. */
export const Playground: Story = {
  ...src(`const [active, setActive] = createSignal('new');

<Nav
  items={[
    { id: 'new', label: 'New task', icon: 'plus', trailing: 'pencil' },
    { id: 'projects', label: 'Projects', icon: 'folder' },
    { id: 'dispatch', label: 'Dispatch', icon: 'share', badge: 'Beta' },
  ]}
  value={active()}
  onItemSelect={setActive}
/>`),
};

/** A sidebar showing icons, a badge, a trailing affordance, and a disabled row. */
export const Sidebar: Story = {
  render: () => {
    const [value, setValue] = createSignal('projects');
    return (
      <div class="w-60 rounded-lg border border-border p-2">
        <Nav items={ITEMS} value={value()} onItemSelect={setValue} />
      </div>
    );
  },
  ...src(`<Nav
  items={[
    { id: 'new', label: 'New task', icon: 'plus', trailing: 'pencil' },
    { id: 'projects', label: 'Projects', icon: 'folder' },
    { id: 'artifacts', label: 'Artifacts', icon: 'sparkles' },
    { id: 'dispatch', label: 'Dispatch', icon: 'share', badge: 'Beta' },
    { id: 'archived', label: 'Archived', icon: 'box', disabled: true },
  ]}
  value={active()}
  onItemSelect={setActive}
/>`),
};

const NESTED: KaiNavItem[] = [
  { id: 'new', label: 'New task', icon: 'plus', trailing: 'pencil' },
  {
    id: 'acme',
    label: 'Acme web',
    icon: 'folder',
    children: [
      { id: 'auth', label: 'Refactor auth', status: { tone: 'info', label: 'Working', pulse: true }, meta: '2m' },
      { id: 'land', label: 'Landing page', status: { tone: 'success', label: 'Done' }, meta: '1d' },
      { id: 'docs', label: 'API docs', meta: '3d' },
    ],
  },
  {
    id: 'kitn',
    label: 'Kitn UI',
    icon: 'folder',
    children: [
      { id: 'theme', label: 'Theme tokens', status: { tone: 'warning', label: 'Review' }, meta: '5d' },
      { id: 'a11y', label: 'A11y audit', status: { tone: 'error', label: 'Failed' }, meta: '24d' },
    ],
  },
];

/** Nested projects -> threads: collapsible groups, a per-thread status dot, and a
 *  relative-time `meta`. Click a project to collapse it; click a thread to select. */
export const Nested: Story = {
  render: () => {
    const [value, setValue] = createSignal('auth');
    return (
      <div class="w-64 rounded-lg border border-border p-2">
        <Nav items={NESTED} value={value()} onItemSelect={setValue} />
      </div>
    );
  },
  ...src(`<Nav
  items={[
    { id: 'new', label: 'New task', icon: 'plus', trailing: 'pencil' },
    { id: 'acme', label: 'Acme web', icon: 'folder', children: [
      { id: 'auth', label: 'Refactor auth', status: { tone: 'info', label: 'Working', pulse: true }, meta: '2m' },
      { id: 'land', label: 'Landing page', status: { tone: 'success', label: 'Done' }, meta: '1d' },
    ] },
  ]}
  value={active()}
  onItemSelect={setActive}
/>`),
};

const RUNS: KaiNavItem[] = [
  { id: 'r1', label: 'Build release', status: { tone: 'neutral', label: 'Queued' } },
  { id: 'r2', label: 'Run test suite', status: { tone: 'info', label: 'Running', pulse: true } },
  { id: 'r3', label: 'Typecheck', status: { tone: 'success', label: 'Done' } },
  { id: 'r4', label: 'Deploy preview', status: { tone: 'error', label: 'Failed' } },
];

/** Task-run states expressed with the status dot: queued (neutral), running
 *  (info + pulse), done (success), failed (error). */
export const TaskRuns: Story = {
  render: () => {
    const [value, setValue] = createSignal('r2');
    return (
      <div class="w-60 rounded-lg border border-border p-2">
        <Nav items={RUNS} value={value()} onItemSelect={setValue} />
      </div>
    );
  },
  ...src(`<Nav
  items={[
    { id: 'r1', label: 'Build release', status: { tone: 'neutral', label: 'Queued' } },
    { id: 'r2', label: 'Run test suite', status: { tone: 'info', label: 'Running', pulse: true } },
    { id: 'r3', label: 'Typecheck', status: { tone: 'success', label: 'Done' } },
    { id: 'r4', label: 'Deploy preview', status: { tone: 'error', label: 'Failed' } },
  ]}
  value={active()}
  onItemSelect={setActive}
/>`),
};

const ACTIONS: KaiNavItem[] = [
  { id: 'auth', label: 'Refactor auth', icon: 'file-text', closable: true },
  { id: 'land', label: 'Landing page', icon: 'file-text', action: { icon: 'pencil', label: 'Rename' } },
  { id: 'docs', label: 'API docs', icon: 'file-text', closable: true, action: { icon: 'pencil', label: 'Rename' } },
];

/** Per-item trailing controls. `action` ({ icon, label }) renders a hover button
 *  that fires `onItemAction`; `closable` renders a × that fires `onItemClose`.
 *  Both are separate from the row's select — and rendered as siblings of the
 *  item button (never nested), so they pass the a11y nested-interactive check. */
export const TrailingActions: Story = {
  render: () => {
    const [value, setValue] = createSignal('auth');
    const [items, setItems] = createSignal(ACTIONS);
    return (
      <div class="w-64 rounded-lg border border-border p-2">
        <Nav
          items={items()}
          value={value()}
          onItemSelect={setValue}
          // The action must NOT select the row — it does something else. Here it
          // toggles a "Pinned" badge on the item; the selection (value) is untouched.
          onItemAction={(id) =>
            setItems((prev) =>
              prev.map((i) => (i.id === id ? { ...i, badge: i.badge ? undefined : 'Pinned' } : i)),
            )
          }
          onItemClose={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
        />
      </div>
    );
  },
  ...src(`const [items, setItems] = createSignal([
  { id: 'auth', label: 'Refactor auth', icon: 'file-text', closable: true },
  { id: 'land', label: 'Landing page', icon: 'file-text', action: { icon: 'pencil', label: 'Rename' } },
]);

<Nav
  items={items()}
  value={active()}
  onItemSelect={setActive}
  // The action does a non-select side effect (here: toggle a pin marker).
  onItemAction={(id) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, badge: i.badge ? undefined : 'Pinned' } : i)),
    )
  }
  onItemClose={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
/>`),
};
