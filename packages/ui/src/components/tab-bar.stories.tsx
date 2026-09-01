import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { TabBar, type TabBarItem } from './tab-bar';

/** The widget's Home/Messages pair, with the unread dot on Messages: the exact
 *  shape the facade's `WidgetTabBar` renders (ruling P-2's first acceptance
 *  state). */
const widgetPair: TabBarItem[] = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'messages', icon: 'message-square', label: 'Messages', dot: true },
];

const threeTabs: TabBarItem[] = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'messages', icon: 'message-square', label: 'Messages', badge: 3 },
  { id: 'help', icon: 'book-open', label: 'Help' },
];

const frame = (children: any) => (
  <div class="flex h-40 w-[380px] flex-col justify-end overflow-hidden rounded-2xl border border-border bg-background">
    {children}
  </div>
);

const meta = {
  title: 'Components/Elements/TabBar',
  component: TabBar,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TabBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Icon-over-label columns with the unread dot on Messages: the facade's
 *  `WidgetTabBar` shape. Click or arrow between tabs; the active tab retints
 *  with the primary token. */
export const IconOverLabel: Story = {
  render: () => {
    const [tab, setTab] = createSignal('home');
    return frame(<TabBar items={widgetPair} value={tab()} onChange={setTab} label="Widget navigation" />);
  },
};

/** Icon-only mode: labels feed each tab's accessible name but never render. */
export const IconOnly: Story = {
  render: () => {
    const [tab, setTab] = createSignal('home');
    return frame(<TabBar items={threeTabs} value={tab()} onChange={setTab} iconOnly />);
  },
};

/** A count badge on Messages (wins over the dot), plus a third tab. */
export const CountBadge: Story = {
  render: () => {
    const [tab, setTab] = createSignal('messages');
    return frame(<TabBar items={threeTabs} value={tab()} onChange={setTab} />);
  },
};

/** A disabled tab is skipped by arrow keys and cannot be clicked. */
export const DisabledTab: Story = {
  render: () => {
    const [tab, setTab] = createSignal('home');
    return frame(
      <TabBar
        items={[
          { id: 'home', icon: 'home', label: 'Home' },
          { id: 'search', icon: 'search', label: 'Search', disabled: true },
          { id: 'messages', icon: 'message-square', label: 'Messages', dot: true },
        ]}
        value={tab()}
        onChange={setTab}
      />,
    );
  },
};

/** The same states on the dark tokens (an explicit `.dark` wrapper, so this
 *  story shows dark regardless of the Storybook toggle). */
export const DarkPreview: Story = {
  render: () => {
    const [tab, setTab] = createSignal('home');
    const [iconTab, setIconTab] = createSignal('messages');
    return (
      <div class="dark flex flex-col gap-4 rounded-2xl bg-background p-4">
        <div class="flex h-32 w-[380px] flex-col justify-end overflow-hidden rounded-2xl border border-border bg-background">
          <TabBar items={widgetPair} value={tab()} onChange={setTab} label="Widget navigation" />
        </div>
        <div class="flex h-32 w-[380px] flex-col justify-end overflow-hidden rounded-2xl border border-border bg-background">
          <TabBar items={threeTabs} value={iconTab()} onChange={setIconTab} iconOnly />
        </div>
      </div>
    );
  },
};
