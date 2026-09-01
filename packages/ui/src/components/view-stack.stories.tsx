import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, For, Show } from 'solid-js';
import { ViewStack, View, type ViewStackController, type ViewStackState } from './view-stack';
import { componentDescription } from '../stories/docs/element-controls';

/**
 * Stub story for the P-3 view navigator: three views (two tab roots and a
 * drill view), a FAKE tab bar and a FAKE header owned by the story itself.
 * The point on show is the one rule the spike got wrong twice: a drilled
 * view hides the tab bar and shows a back arrow; a tab root shows the tab
 * bar and no back arrow. Both pieces of chrome here are driven purely off
 * the navigator's reported state, never their own.
 */

const meta = {
  title: 'Components/Elements/ViewStack',
  component: ViewStack,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: componentDescription([
        'The mobile-stack view navigator: tab-root views behind a tab bar, drill views pushed on top. The navigator owns the rule that a drilled view hides the tab bar and shows a back affordance, and exposes `view` / `root` / `drilled` so the chrome follows instead of reimplementing it.',
        'Views stay mounted while hidden, so switching tabs resets nothing by default.',
      ]),
    },
  },
  argTypes: {
    view: { control: 'text', description: 'Deep link / initial view name.' },
    onViewChange: {
      action: 'view-change',
      control: false,
      description: 'Fires with `{ view, root, drilled, stack }` after each navigation.',
      table: { category: 'Events' },
    },
    controller: { control: false, description: 'Ref callback receiving the imperative controller (`push`, `back`, `replace`, `selectTab`, `navigate`).' },
    children: { control: false, description: '`View` children; one `tabRoot` per tab, plain views drill.' },
  },
} satisfies Meta<typeof ViewStack>;

export default meta;
type Story = StoryObj<typeof meta>;

// Not yet part of the public export surface (blocks-and-parts phase 1) --
// this mirrors the file's own relative import rather than a package path.
const IMPORT = `import { ViewStack, View, type ViewStackController } from './view-stack';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

function Widget(props: { initialView?: string }) {
  let controller!: ViewStackController;
  const [state, setState] = createSignal<ViewStackState | undefined>();
  const drilled = () => state()?.drilled ?? props.initialView === 'chat';
  const activeTab = () => state()?.root ?? (props.initialView === 'messages' ? 'messages' : 'home');

  const conversations = ['Refund for order 4821', 'Where is my invoice?', 'API key rotation'];

  return (
    <div class="w-80 h-96 flex flex-col rounded-xl border border-border bg-background text-foreground shadow-sm overflow-hidden">
      {/* Stub header: back arrow only while drilled (the navigator's rule). */}
      <div class="flex items-center gap-2 border-b border-border px-3 py-2">
        <Show when={drilled()}>
          <button
            type="button"
            aria-label="Back"
            class="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
            onClick={() => controller.back()}
          >
            &#8592;
          </button>
        </Show>
        <span class="text-sm font-medium">
          {drilled() ? 'Conversation' : activeTab() === 'home' ? 'Support' : 'Messages'}
        </span>
      </div>

      <ViewStack
        class="flex-1 min-h-0 overflow-y-auto"
        view={props.initialView}
        controller={(c) => (controller = c)}
        onViewChange={setState}
      >
        <View name="home" tabRoot class="p-3 space-y-2">
          <p class="text-sm text-muted-foreground">Hi there. How can we help?</p>
          <button
            type="button"
            class="w-full rounded-lg bg-primary px-3 py-2 text-left text-sm text-primary-foreground"
            onClick={() => controller.push('chat')}
          >
            Start a conversation
          </button>
          <label class="block text-xs text-muted-foreground pt-2">
            Search help articles
            <input
              class="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
              placeholder="Type to search"
            />
          </label>
        </View>

        <View name="messages" tabRoot class="p-3">
          <ul class="divide-y divide-border">
            <For each={conversations}>
              {(title) => (
                <li>
                  <button
                    type="button"
                    class="w-full px-1 py-2 text-left text-sm hover:bg-muted rounded-md"
                    onClick={() => controller.push('chat')}
                  >
                    {title}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </View>

        <View name="chat" class="flex h-full flex-col p-3">
          <div class="flex-1 space-y-2 text-sm">
            <div class="max-w-[85%] rounded-lg bg-muted px-3 py-2">Hello, what can I do for you?</div>
            <div class="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground">
              My invoice never arrived.
            </div>
          </div>
          <input
            class="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            placeholder="Write a message"
          />
        </View>
      </ViewStack>

      {/* Stub tab bar: HIDES while drilled, driven only by the reported state. */}
      <Show when={!drilled()}>
        <div class="flex border-t border-border">
          <button
            type="button"
            class="flex-1 px-3 py-2 text-sm"
            classList={{
              'text-primary font-medium': activeTab() === 'home',
              'text-muted-foreground': activeTab() !== 'home',
            }}
            onClick={() => controller.selectTab('home')}
          >
            Home
          </button>
          <button
            type="button"
            class="flex-1 px-3 py-2 text-sm"
            classList={{
              'text-primary font-medium': activeTab() === 'messages',
              'text-muted-foreground': activeTab() !== 'messages',
            }}
            onClick={() => controller.selectTab('messages')}
          >
            Messages
          </button>
        </div>
      </Show>
    </div>
  );
}

/** The default landing: the Home tab root — tab bar showing, no back arrow. */
export const TabRoots: Story = {
  render: () => <Widget />,
  ...src(`let controller!: ViewStackController;

// The chrome follows the reported state; it never owns the rule itself.
<ViewStack controller={(c) => (controller = c)} onViewChange={(s) => setState(s)}>
  <View name="home" tabRoot>
    <button onClick={() => controller.push('chat')}>Start a conversation</button>
  </View>
  <View name="messages" tabRoot>...</View>
  <View name="chat">...</View>
</ViewStack>`),
};

/** Deep-linked straight into the drill view: back arrow present, tab bar
 *  hidden, from the first frame. */
export const Drilled: Story = {
  render: () => <Widget initialView="chat" />,
  ...src(`<ViewStack view="chat" controller={(c) => (controller = c)} onViewChange={(s) => setState(s)}>
  <View name="home" tabRoot>...</View>
  <View name="messages" tabRoot>...</View>
  <View name="chat">...</View>
</ViewStack>`),
};

/** Deep-linked to the second tab root: Messages active, still un-drilled. */
export const MessagesRoot: Story = {
  render: () => <Widget initialView="messages" />,
  ...src(`<ViewStack view="messages" controller={(c) => (controller = c)} onViewChange={(s) => setState(s)}>
  <View name="home" tabRoot>...</View>
  <View name="messages" tabRoot>...</View>
  <View name="chat">...</View>
</ViewStack>`),
};
