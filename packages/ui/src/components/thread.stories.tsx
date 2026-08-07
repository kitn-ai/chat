import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { Thread } from './thread';
import { ChatConfig } from '../primitives/chat-config';
import { componentDescription } from '../stories/docs/element-controls';
import { textMessage } from '../state';
import type { ChatMessage } from '../elements/chat-types';

const conversation: ChatMessage[] = [
  textMessage('user', 'What is SolidJS in one line?', { id: 'u1' }),
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: '**SolidJS** is a reactive UI library that compiles your components away and updates the DOM with fine-grained signals — no virtual DOM.',
      },
    ],
    actions: ['copy', 'like', 'dislike'],
  },
  textMessage('user', 'Show me a signal.', { id: 'u2' }),
  {
    id: 'a2',
    role: 'assistant',
    parts: [
      { type: 'reasoning', text: 'The user wants the smallest possible signal example, so keep it to a counter.' },
      {
        type: 'text',
        text: `Here's a counter:

\`\`\`tsx
import { createSignal } from 'solid-js';

function Counter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount((c) => c + 1)}>Count: {count()}</button>;
}
\`\`\`

\`count\` is a getter — reading it inside JSX subscribes just that node.`,
      },
    ],
    actions: ['copy', 'like', 'dislike', 'regenerate'],
  },
];

const meta = {
  title: 'Components/Elements/Thread',
  component: Thread,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      controls: { exclude: ['use:eventListener', 'messages', 'empty', 'controllerRef', 'onMessageAction'] },
      description: componentDescription([
        'The message-list slice of a chat, standalone: the scrolling list of messages with per-message markdown, code highlight, reasoning + tool panels, avatars, and the action row — plus stick-to-bottom scroll, a scroll-to-bottom button, an optional typing indicator, and an empty state.',
        'No composer, header, suggestions, or sidebar — compose it with `kai-prompt-input` and your own layout, or use the batteries-included `kai-chat`. Fills the height its parent gives it (`h-full`) and scrolls internally. This is the SolidJS component behind the `<kai-thread>` web component.',
      ]),
    },
  },
  argTypes: {
    loading: { control: 'boolean', description: 'Show a typing indicator on the pending assistant turn.' },
    proseSize: { control: 'select', options: ['xs', 'sm', 'base', 'lg'], description: 'Body/prose font scale for markdown.' },
    actionsReveal: { control: 'inline-radio', options: ['always', 'hover'], description: 'Keep each action bar visible, or reveal it on row hover.' },
    scrollButton: { control: 'boolean', description: 'Show the scroll-to-bottom button.' },
  },
  render: (args) => (
    <div style={{ height: '520px' }} class="overflow-hidden rounded-lg border border-border">
      <Thread {...args} />
    </div>
  ),
} satisfies Meta<typeof Thread>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Thread } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** A full conversation: user + assistant turns, markdown, a code block, reasoning,
 *  and per-message action bars. Tweak `proseSize` / `actionsReveal` via controls. */
export const Playground: Story = {
  args: { messages: conversation, actionsReveal: 'always', proseSize: 'sm', scrollButton: true, loading: false },
  ...src(`<div style={{ height: '520px' }}>
  <Thread messages={messages} />
</div>`),
};

/** The pending assistant turn: `loading` renders a typing indicator at the end. */
export const Loading: Story = {
  args: { messages: conversation, loading: true },
  ...src(`<Thread messages={messages} loading />`),
};

/** Empty thread: the built-in zero-state renders when there are no messages. */
export const EmptyDefault: Story = {
  args: { messages: [] },
  ...src(`<Thread messages={[]} />`),
};

/** Custom zero-state via the `empty` prop (the `<kai-thread>` `slot="empty"`). */
export const EmptyCustom: Story = {
  args: {
    messages: [],
    empty: (
      <div class="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <div class="text-2xl">💬</div>
        <p class="text-sm font-medium text-foreground">Ask me anything</p>
        <p class="text-xs text-muted-foreground">Your conversation will show up here.</p>
      </div>
    ),
  },
  ...src(`<Thread messages={[]} empty={<YourZeroState />} />`),
};

/** Avatars: entries with an `avatar` render an avatar rail beside the body. */
export const WithAvatars: Story = {
  args: {
    messages: [
      textMessage('user', 'Morning — any blockers?', { id: 'u1', avatar: { fallback: 'RT' } }),
      textMessage('assistant', 'None. The build is green and the release is queued.', {
        id: 'a1',
        avatar: { fallback: 'AI' },
        actions: ['copy'],
      }),
    ],
  },
  ...src(`<Thread messages={messagesWithAvatars} />`),
};

/** Ordering: `parts` render in a single pass, in array order — reasoning, then
 *  plain text, then a tool call, then more text. Every other fixture on this page
 *  is single-type (all text, or all-with-avatar), so this is the one story that
 *  would actually catch an ordering regression (e.g. a render path that groups by
 *  part type instead of preserving array order). */
export const Interleaved: Story = {
  args: {
    messages: [
      textMessage('user', 'Weather in Paris?', { id: 'u1' }),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'I should call the weather tool.', index: 0 },
          { type: 'text', text: 'Checking that for you.' },
          {
            type: 'tool',
            tool: {
              type: 'get_weather',
              kind: 'generic',
              state: 'output-available',
              input: { city: 'Paris' },
              output: { c: 18 },
              toolCallId: 'tc1',
            },
          },
          { type: 'text', text: 'It is 18C and partly cloudy.' },
        ],
      },
    ],
  },
  ...src(`<Thread messages={[
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Weather in Paris?' }] },
  { id: 'a1', role: 'assistant', parts: [
    { type: 'reasoning', text: 'I should call the weather tool.', index: 0 },
    { type: 'text', text: 'Checking that for you.' },
    { type: 'tool', tool: { type: 'get_weather', kind: 'generic', state: 'output-available', input: { city: 'Paris' }, output: { c: 18 }, toolCallId: 'tc1' } },
    { type: 'text', text: 'It is 18C and partly cloudy.' },
  ] },
]} />`),
};

/** Streaming: hand the thread a NEW array reference per chunk and it sticks to the
 *  bottom. Click to simulate a token stream. */
export const Streaming: Story = {
  render: () => {
    const base: ChatMessage[] = [textMessage('user', 'Stream a reply.', { id: 'u1' })];
    const full = 'Streaming works by handing the thread a brand-new messages array on every chunk. Mutating the same array in place would not re-render — a fresh reference does, and the list auto-scrolls to follow.';
    const [messages, setMessages] = createSignal<ChatMessage[]>(base);
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer) return;
      let i = 0;
      timer = setInterval(() => {
        i += 4;
        setMessages([...base, textMessage('assistant', full.slice(0, i), { id: 'a1' })]);
        if (i >= full.length) { clearInterval(timer); timer = undefined; }
      }, 40);
    };
    return (
      <ChatConfig>
        <div style={{ height: '420px' }} class="flex flex-col overflow-hidden rounded-lg border border-border">
          <div class="shrink-0 border-b border-border p-2">
            <button type="button" class="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground" onClick={start}>
              Simulate stream
            </button>
          </div>
          <Thread messages={messages()} loading={messages().length === 1} />
        </div>
      </ChatConfig>
    );
  },
  ...src(`const [messages, setMessages] = createSignal(base);
// per chunk: setMessages([...base, { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: next }] }]);
<Thread messages={messages()} />`),
};
