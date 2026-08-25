import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onSettled } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import './register'; // registers kai-menu, kai-avatar, kai-status (and the rest)
import type { KaiMenuItem } from './menu';

// Labs: the user menu is a RECIPE, not an element. It is kai-menu with a slotted
// trigger (kai-avatar + name + plan + a chevron + a kai-status dot) and an items
// tree. The kit ships the parts; you compose the account menu. The dropdown
// supports per-item icons, keyboard shortcuts, submenus, and separators already.
// (The account email is a heading item today; a dedicated kai-menu header slot is
// noted as optional polish in the spec.)

const meta = {
  title: 'Labs/User Menu',
} satisfies Meta;
export default meta;
type Story = StoryObj;

const ITEMS: KaiMenuItem[] = [
  { heading: true, label: 'john@example.com' },
  { id: 'settings', label: 'Settings', icon: 'settings', shortcut: 'Mod+,' },
  { id: 'language', label: 'Language', icon: 'globe', items: [
    { id: 'lang-en', label: 'English' },
    { id: 'lang-es', label: 'Espanol' },
  ] },
  { id: 'help', label: 'Get help', icon: 'message-circle' },
  { separator: true },
  { id: 'plans', label: 'View all plans', icon: 'sparkles' },
  { id: 'apps', label: 'Get apps and extensions', icon: 'monitor' },
  { id: 'gift', label: 'Gift Claude', icon: 'share' },
  { id: 'learn', label: 'Learn more', icon: 'book-open', items: [
    { id: 'docs', label: 'Docs' },
    { id: 'blog', label: 'Blog' },
  ] },
  { separator: true },
  { id: 'logout', label: 'Log out' },
];

type MenuEl = HTMLElement & { items?: KaiMenuItem[]; open?: boolean };

function UserMenu(props: { open?: boolean }) {
  let el: MenuEl | undefined;
  onSettled(() => {
    if (!el) return;
    el.items = ITEMS;
    if (props.open) el.open = true;
  });
  return (
    <div style={{ width: '260px', padding: '1rem' }}>
      <kai-menu ref={(e) => (el = e as MenuEl)}>
        <span
          slot="trigger"
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.375rem 0.5rem',
            'border-radius': '0.5rem',
          }}
        >
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <kai-avatar fallback="JD" size="sm"></kai-avatar>
            <kai-status status="new" pulse style={{ position: 'absolute', right: '-2px', bottom: '-2px' }}></kai-status>
          </span>
          <span style={{ 'font-weight': '500', 'font-size': '0.875rem', color: 'var(--color-foreground)' }}>John</span>
          <span style={{ 'font-size': '0.8125rem', color: 'var(--color-muted-foreground)' }}>Max</span>
          <ChevronDown size={16} style={{ 'margin-left': 'auto', color: 'var(--color-muted-foreground)' }} />
        </span>
      </kai-menu>
    </div>
  );
}

export const AccountMenu: Story = {
  name: 'Account menu (open)',
  render: () => <UserMenu open />,
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-menu>
  <span slot="trigger" class="user-menu-trigger">
    <span style="position:relative">
      <kai-avatar fallback="JD" size="sm"></kai-avatar>
      <kai-status status="new" pulse style="position:absolute;right:-2px;bottom:-2px"></kai-status>
    </span>
    <span>John</span><span class="muted">Max</span>
  </span>
</kai-menu>
<script type="module">
  const menu = document.querySelector('kai-menu');
  menu.items = [
    { heading: true, label: 'you@example.com' },
    { id: 'settings', label: 'Settings', icon: 'settings', shortcut: 'Mod+,' },
    { id: 'language', label: 'Language', icon: 'globe', items: [/* submenu */] },
    { separator: true },
    { id: 'logout', label: 'Log out' },
  ];
  menu.addEventListener('kai-select', (e) => console.log(e.detail.id));
</script>`,
      },
    },
  },
};

export const Trigger: Story = {
  name: 'Trigger (closed)',
  render: () => <UserMenu />,
};
