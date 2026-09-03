import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onMount } from 'solid-js';
import './register'; // registers kai-workspace, kai-nav, kai-notice, kai-prompt-input, kai-suggestions, kai-card
import type { KaiNavItem } from '../ui/nav';
import type { KaiNavElement, KaiSuggestionsElement, KaiNoticeElement, KaiPromptInputElement, KaiCardElement } from './element-types';

// Labs: the home/dashboard assembly on the re-cast shell. The workspace is a
// chat-agnostic layout element now: the consumer composes the rail themselves
// in the `start` slot (nav + upgrade card), and the Home screen is plain
// default-slot content in the main region. Nothing here is a workspace prop;
// every piece is the consumer's own markup.

const meta = { title: 'Labs/Workspace Home', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

const NAV: KaiNavItem[] = [
  { id: 'new', label: 'New task', icon: 'plus', trailing: 'pencil' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'artifacts', label: 'Artifacts', icon: 'sparkles' },
  { id: 'customize', label: 'Customize', icon: 'settings' },
];
const IDEAS = [
  { label: 'Send me a daily briefing', icon: 'sparkles', value: 'brief' },
  { label: 'Organize my inbox', icon: 'folder', value: 'inbox' },
  { label: 'Customize Cowork for me', icon: 'settings', value: 'customize' },
];

export const Home: Story = {
  render: () => {
    let nav!: KaiNavElement, sugg!: KaiSuggestionsElement, notice!: KaiNoticeElement, input!: KaiPromptInputElement, card!: KaiCardElement;
    onMount(() => {
      nav.items = NAV as KaiNavElement['items'];
      nav.defaultValue = 'new';
      sugg.suggestions = IDEAS;
      sugg.layout = 'list';
      notice.severity = 'neutral';
      input.placeholder = 'How can I help you today?';
    });
    return (
      <div style={{ height: '680px', width: '100%' }}>
        <kai-workspace collapse-below="720">
          {/* start: the consumer-owned rail column (nav on top, upgrade card pinned below). */}
          <div slot="start" style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
            <div style={{ padding: '0.75rem 0.5rem 0.25rem', flex: '1', 'min-height': '0' }}>
              <kai-nav ref={nav}></kai-nav>
            </div>
            <kai-card ref={card} clickable style={{ display: 'block', margin: '0.75rem' }}>
              <h3 slot="header">Upgrade to Pro</h3>
              Unlock higher limits and Fable 5.
            </kai-card>
          </div>
          <div
            style={{
              display: 'flex',
              'flex-direction': 'column',
              'align-items': 'center',
              'justify-content': 'center',
              height: '100%',
              gap: '1.5rem',
              padding: '1.5rem',
            }}
          >
            <h1 style={{ 'font-size': '2rem', 'font-weight': '400', color: 'var(--color-foreground)' }}>Good evening, John</h1>
            <div style={{ width: '100%', 'max-width': '640px', display: 'flex', 'flex-direction': 'column', gap: '1rem' }}>
              <kai-notice ref={notice}>Claude Fable 5 is currently unavailable.</kai-notice>
              <kai-prompt-input ref={input}></kai-prompt-input>
              <kai-suggestions ref={sugg}></kai-suggestions>
            </div>
          </div>
        </kai-workspace>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-workspace collapse-below="720">
  <!-- start: the rail column is YOURS (nav, card, whatever your app needs) -->
  <div slot="start">
    <kai-nav></kai-nav>
    <kai-card clickable>
      <h3 slot="header">Upgrade to Pro</h3>
      Unlock higher limits and Fable 5.
    </kai-card>
  </div>

  <!-- main: unnamed children land in the main region -->
  <div>
    <h1>Good evening, John</h1>
    <kai-notice severity="neutral">Claude Fable 5 is currently unavailable.</kai-notice>
    <kai-prompt-input placeholder="How can I help you today?"></kai-prompt-input>
    <kai-suggestions></kai-suggestions>
  </div>
</kai-workspace>

<script type="module">
  // Array/object props are set as JS properties, never attributes.
  const nav = document.querySelector('kai-nav');
  nav.items = [/* KaiNavItem[] */];
  nav.defaultValue = 'new';

  const sugg = document.querySelector('kai-suggestions');
  sugg.suggestions = [/* { label, icon, value }[] */];
  sugg.layout = 'list';

  // kai-card content is slotted, not set via JS properties.
</script>`,
      },
    },
  },
};
