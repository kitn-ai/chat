import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onSettled } from 'solid-js';
import './nav';
import type { KaiNavItem } from '../ui/nav';

// Declare the custom element tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-nav': JSX.HTMLAttributes<HTMLElement> & { value?: string; 'default-value'?: string; theme?: string };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/Nav',
};
export default meta;

const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

const ITEMS: KaiNavItem[] = [
  { id: 'new', label: 'New task', icon: 'plus', trailing: 'pencil' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'artifacts', label: 'Artifacts', icon: 'sparkles' },
  { id: 'scheduled', label: 'Scheduled', icon: 'settings' },
  { id: 'dispatch', label: 'Dispatch', icon: 'share', badge: 'Beta' },
  { id: 'customize', label: 'Customize', icon: 'book-open' },
];

export const Sidebar: StoryObj = {
  render: () => {
    let el!: HTMLElement & { items?: KaiNavItem[] };
    onSettled(() => { el.items = ITEMS; });
    return (
      <div style={{ width: '240px', padding: '1rem' }}>
        <kai-nav ref={el} default-value="new"></kai-nav>
      </div>
    );
  },
  parameters: src(`<kai-nav default-value="new"></kai-nav>

<script type="module">
  const nav = document.querySelector('kai-nav');
  // items is a JS property (array), never an attribute.
  nav.items = [
    { id: 'new', label: 'New task', icon: 'plus', trailing: 'pencil' },
    { id: 'dispatch', label: 'Dispatch', icon: 'share', badge: 'Beta' },
    /* { id, label, icon, badge, trailing } ... */
  ];
  nav.addEventListener('kai-nav-select', (e) => console.log(e.detail.id));
</script>`),
};
