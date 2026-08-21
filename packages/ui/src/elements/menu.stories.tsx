import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onMount, onCleanup } from 'solid-js';
import { Plus } from 'lucide-solid';
import './register'; // side effect: registers all kai-* custom elements (incl. kai-menu)
import { attachKaiActions } from '../stories/docs/story-actions';
import type { KaiMenuItem } from './menu';

// Declare the custom element tag for SolidJS JSX.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-menu': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'trigger-icon'?: string; 'trigger-label'?: string; 'trigger-icon-trailing'?: string; label?: string; full?: boolean };
    }
  }
}

interface MenuEl extends HTMLElement {
  items?: KaiMenuItem[];
}

const meta = {
  title: 'Labs/Menu',
  parameters: { layout: 'padded' },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/**
 * Reproduces the `+` action menu from the design screenshot via the `kai-menu`
 * JSON-driven web component. Items are set as a JS property (array ref) in
 * `onMount`. Every declared event (`kai-select`, `kai-open-change`) logs to the
 * Actions panel via the shared helper; the dedicated `kai-select` handler keeps
 * ONLY its side-effect (flipping the "Web search" checkbox and reassigning
 * `el.items` with a fresh array reference so the checkmark updates reactively).
 */
function PlusMenuDemo() {
  let el: MenuEl | undefined;

  const initialItems: KaiMenuItem[] = [
    { heading: true, label: 'Actions' },
    {
      id: 'add-files',
      label: 'Add files or photos',
      icon: 'paperclip',
      shortcut: 'Mod+U',
    },
    {
      id: 'add-github',
      label: 'Add from GitHub',
      icon: 'github',
    },
    {
      label: 'Skills',
      icon: 'sparkles',
      items: [
        { id: 'skill-creator', label: 'skill-creator', icon: 'sparkles' },
        { id: 'manage-skills', label: 'Manage skills', icon: 'settings' },
        { id: 'add-skill', label: 'Add skill', icon: 'file-text' },
      ],
    },
    { separator: true },
    { id: 'web-search', label: 'Web search', icon: 'globe', checked: true },
    { id: 'coming-soon', label: 'Coming soon', disabled: true },
  ];

  onMount(() => {
    if (!el) return;
    el.items = [...initialItems];

    // Log every declared event (kai-select, kai-open-change) to the Actions panel.
    onCleanup(attachKaiActions(el));

    // Dedicated kai-select handler keeps ONLY its side-effect (logging is done by
    // the helper above): for the checkbox item, flip its state and reassign a
    // fresh array ref so the checkmark updates reactively.
    el.addEventListener('kai-select', (e) => {
      const detail = (e as CustomEvent<{ id: string; checked?: boolean }>).detail;
      if (detail.id === 'web-search' && detail.checked !== undefined) {
        el!.items = el!.items!.map((item) =>
          item.id === 'web-search' ? { ...item, checked: detail.checked } : item,
        );
      }
    });
  });

  return (
    <div style={{ padding: '48px' }}>
      <kai-menu ref={(e) => (el = e as MenuEl)}>
        <span slot="trigger" style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center' }}>
          <Plus size={18} />
        </span>
      </kai-menu>
    </div>
  );
}

export const PlusMenu: Story = {
  name: 'Cascading menu',
  render: () => <PlusMenuDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Click the + icon to open the cascading menu (submenus on hover, a checkbox item, a disabled item). Watch the Actions panel for `kai-select` and `kai-open-change` events.',
      },
      source: {
        language: 'html',
        code: `<kai-menu trigger-icon="plus"></kai-menu>

<script type="module">
  const menu = document.querySelector('kai-menu');
  // Items, including submenus, separators, and checkboxes, are a JS property.
  menu.items = [
    { heading: true, label: 'Actions' },
    { id: 'add-files', label: 'Add files or photos', icon: 'paperclip', shortcut: 'Mod+U' },
    { label: 'Skills', icon: 'sparkles', items: [
      { id: 'skill-creator', label: 'skill-creator', icon: 'sparkles' },
    ] },
    { separator: true },
    { id: 'web-search', label: 'Web search', icon: 'globe', checked: true },
  ];
  menu.addEventListener('kai-select', (e) => console.log(e.detail));
</script>`,
      },
    },
  },
};

/**
 * The Recents Filter / Group-by menu from the Home screen: two single-select
 * (radio) sections in one menu. Items sharing a `radioGroup` are mutually
 * exclusive — the selected one shows a checkmark. Clicking emits
 * `{ id, radioGroup }`; the consumer owns state, moving the checkmark within the
 * group (and clearing the rest) by reassigning a fresh `items` array.
 */
function FilterGroupByDemo() {
  let el: MenuEl | undefined;

  const buildItems = (filter: string, groupBy: string): KaiMenuItem[] => [
    { heading: true, label: 'Filter' },
    { id: 'all', label: 'All', radioGroup: 'filter', checked: filter === 'all' },
    { id: 'chat', label: 'Chat', radioGroup: 'filter', checked: filter === 'chat' },
    { id: 'task', label: 'Task', radioGroup: 'filter', checked: filter === 'task' },
    { separator: true },
    { heading: true, label: 'Group by' },
    { id: 'none', label: 'None', radioGroup: 'groupBy', checked: groupBy === 'none' },
    { id: 'date', label: 'Date', radioGroup: 'groupBy', checked: groupBy === 'date' },
    { id: 'project', label: 'Project', radioGroup: 'groupBy', checked: groupBy === 'project' },
    { id: 'unread', label: 'Unread', radioGroup: 'groupBy', checked: groupBy === 'unread' },
    { id: 'status', label: 'Status', radioGroup: 'groupBy', checked: groupBy === 'status' },
  ];

  let filter = 'all';
  let groupBy = 'date';

  onMount(() => {
    if (!el) return;
    el.items = buildItems(filter, groupBy);

    onCleanup(attachKaiActions(el));

    // Single-select: set the clicked id as the selected one in its group and
    // reassign a fresh array ref so the checkmark moves reactively.
    el.addEventListener('kai-select', (e) => {
      const detail = (e as CustomEvent<{ id: string; radioGroup?: string }>).detail;
      if (detail.radioGroup === 'filter') filter = detail.id;
      else if (detail.radioGroup === 'groupBy') groupBy = detail.id;
      el!.items = buildItems(filter, groupBy);
    });
  });

  return (
    <div style={{ padding: '48px' }}>
      <kai-menu ref={(e) => (el = e as MenuEl)} trigger-label="Filter" trigger-icon-trailing="chevron-down" />
    </div>
  );
}

export const FilterGroupBy: Story = {
  name: 'Single-select (radio) groups',
  render: () => <FilterGroupByDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Two single-select sections in one menu. Items sharing a `radioGroup` are mutually exclusive; the selected one shows a checkmark and the menu stays open. `kai-select` carries `{ id, radioGroup }` — the consumer moves the checkmark within the group.',
      },
      source: {
        language: 'html',
        code: `<kai-menu trigger-label="Filter" trigger-icon-trailing="chevron-down"></kai-menu>

<script type="module">
  const menu = document.querySelector('kai-menu');
  // Items sharing a radioGroup are single-select; checked marks the selected one.
  menu.items = [
    { heading: true, label: 'Filter' },
    { id: 'all', label: 'All', radioGroup: 'filter', checked: true },
    { id: 'chat', label: 'Chat', radioGroup: 'filter' },
    { id: 'task', label: 'Task', radioGroup: 'filter' },
    { separator: true },
    { heading: true, label: 'Group by' },
    { id: 'none', label: 'None', radioGroup: 'groupBy' },
    { id: 'date', label: 'Date', radioGroup: 'groupBy', checked: true },
    { id: 'project', label: 'Project', radioGroup: 'groupBy' },
    { id: 'unread', label: 'Unread', radioGroup: 'groupBy' },
    { id: 'status', label: 'Status', radioGroup: 'groupBy' },
  ];
  menu.addEventListener('kai-select', (e) => {
    const { id, radioGroup } = e.detail; // move the checkmark within radioGroup
  });
</script>`,
      },
    },
  },
};

