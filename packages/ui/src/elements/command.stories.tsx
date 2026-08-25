import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onSettled, onCleanup } from 'solid-js';
import './register'; // side effect: registers all kai-* custom elements (incl. kai-command)
import { attachKaiActions } from '../stories/docs/story-actions';
import type { KaiCommandItem } from './command';

// Declare the custom element tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-command': JSX.HTMLAttributes<HTMLElement> & {
        placeholder?: string;
        'empty-label'?: string;
        theme?: string;
      };
    }
  }
}

interface CommandEl extends HTMLElement {
  items?: KaiCommandItem[];
}

const meta = {
  title: 'Labs/Command',
  parameters: { layout: 'padded' },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/**
 * Reproduces a @-mention or slash-command picker backed by `<kai-command>`.
 * Items are grouped under "Mac apps", "Chats", and "Files". Set as a JS property
 * in `onSettled`. Every declared event (`kai-select`, `kai-query-change`,
 * `kai-active-change`) is logged to the Actions panel.
 */
function MentionPickerDemo() {
  let el: CommandEl | undefined;

  const items: KaiCommandItem[] = [
    // Mac apps
    { id: 'ss', label: 'Screen Studio', icon: 'monitor', description: 'Computer use', group: 'Mac apps' },
    { id: 'ssb', label: 'Screen Studio Beta', icon: 'monitor', description: 'Computer use', group: 'Mac apps' },
    // Chats
    { id: 'rs', label: 'Record screen', icon: 'message-circle', description: 'Building ScreenOverlay', group: 'Chats' },
    { id: 'bso', label: 'Building ScreenOverlay', icon: 'message-circle', group: 'Chats' },
    // Files
    { id: 'screens', label: 'screens', icon: 'folder', group: 'Files' },
    { id: 'screen9', label: 'screen9.py', icon: 'file-text', description: '/Users/rob/screen9.py', group: 'Files' },
    { id: 'screenrec', label: 'screenrec.py', icon: 'file-text', description: '/Users/rob/screenrec.py', group: 'Files' },
  ];

  // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
  // and register them once at the owner scope (same lifecycle as 1.x).
  const settledDisposers: (() => void)[] = [];
  onCleanup(() => { for (const d of settledDisposers) d(); });
  onSettled(() => {
    if (!el) return;
    el.items = [...items];
    // Auto-wire every CustomEvent the element declares to the Actions panel.
    settledDisposers.push(attachKaiActions(el));
  });

  return (
    <div style={{ padding: '48px', display: 'flex', 'justify-content': 'center' }}>
      <div style={{ width: '320px', border: '1px solid var(--color-border)', 'border-radius': '12px', overflow: 'hidden' }}>
        <kai-command
          ref={(e) => (el = e as CommandEl)}
          placeholder="Search…"
        />
      </div>
    </div>
  );
}

export const MentionPicker: Story = {
  name: 'Mention & command picker',
  render: () => <MentionPickerDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Type to filter across all groups. Arrow keys move the selection; Enter picks; Escape clears. Watch the Actions panel for `kai-select`, `kai-query-change`, and `kai-active-change`.',
      },
      source: {
        language: 'html',
        code: `<kai-command placeholder="Search…"></kai-command>

<script type="module">
  const cmd = document.querySelector('kai-command');
  // Grouped items are set as a JS property (array ref), never an attribute.
  cmd.items = [
    { id: 'ss', label: 'Screen Studio', icon: 'monitor', description: 'Computer use', group: 'Mac apps' },
    { id: 'rs', label: 'Record screen', icon: 'message-circle', group: 'Chats' },
    { id: 'screen9', label: 'screen9.py', icon: 'file-text', group: 'Files' },
  ];
  cmd.addEventListener('kai-select', (e) => console.log(e.detail));
  cmd.addEventListener('kai-query-change', (e) => console.log(e.detail));
</script>`,
      },
    },
  },
};

