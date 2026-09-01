import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { HomePanel } from './home-panel';
import { WidgetTabBar } from './widget-tab-bar';
import type { ConversationSummary } from '../types';

const recent: ConversationSummary = {
  id: 'c1',
  title: 'Order #42',
  messageCount: 3,
  updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  lastMessageAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  trailing: "It's on the way — tracking says Thursday.",
};

const frame = (children: any) => (
  <div class="flex h-[600px] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-background">
    {children}
  </div>
);

const meta = {
  title: 'Components/Elements/HomePanel',
  component: HomePanel,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HomePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { HomePanel, WidgetTabBar } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Full home: greeting, recent conversation, new-conversation CTA, links, and
 *  the tab bar chrome with an unread badge on Messages. */
export const FullHome: Story = {
  render: () => {
    const [tab, setTab] = createSignal<'home' | 'messages'>('home');
    return frame(
      <>
        <HomePanel
          greeting={{ title: 'Hi there 👋', subtitle: 'How can we help today?' }}
          recent={recent}
          links={[
            { label: 'Docs', href: 'https://ui.kitn.ai', description: 'Read the guides', icon: 'book-open' },
            { label: 'Talk to sales', description: 'Emits onLink, no href', icon: 'message-circle' },
          ]}
          onNewChat={() => {}}
          onSelectRecent={() => {}}
          onLink={() => {}}
        />
        <WidgetTabBar active={tab()} onChange={setTab} unread />
      </>,
    );
  },
  ...src(`<HomePanel
  greeting={{ title: 'Hi there', subtitle: 'How can we help today?' }}
  recent={recentConversation}
  links={[
    { label: 'Docs', href: 'https://ui.kitn.ai', description: 'Read the guides', icon: 'book-open' },
    { label: 'Talk to sales', description: 'Emits onLink, no href', icon: 'message-circle' },
  ]}
  onNewChat={() => startNewChat()}
  onSelectRecent={(id) => openConversation(id)}
  onLink={(entry) => handleLink(entry)}
/>
<WidgetTabBar active={tab()} onChange={setTab} unread />`),
};

/** `home: {}` — defaults only, no config. */
export const MinimalDefaults: Story = {
  render: () => frame(
    <>
      <HomePanel onNewChat={() => {}} />
      <WidgetTabBar active="home" onChange={() => {}} />
    </>,
  ),
  ...src(`<HomePanel onNewChat={() => startNewChat()} />
<WidgetTabBar active="home" onChange={setTab} />`),
};

/** First visit — no recent conversation to show. */
export const NoRecent: Story = {
  render: () => frame(
    <>
      <HomePanel
        greeting={{ title: 'Welcome to Acme' }}
        links={[{ label: 'Docs', href: 'https://ui.kitn.ai', icon: 'book-open' }]}
        onNewChat={() => {}}
      />
      <WidgetTabBar active="home" onChange={() => {}} />
    </>,
  ),
  ...src(`<HomePanel
  greeting={{ title: 'Welcome to Acme' }}
  links={[{ label: 'Docs', href: 'https://ui.kitn.ai', icon: 'book-open' }]}
  onNewChat={() => startNewChat()}
/>
<WidgetTabBar active="home" onChange={setTab} />`),
};
