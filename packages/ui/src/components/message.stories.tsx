import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Message, MessageAvatar, MessageContent, MessageActions, MessageBody } from './message';
import type { MessagePart } from '../elements/chat-types';
import { Button } from '../ui/button';
import { Copy, ThumbsUp, ThumbsDown, RefreshCw, Pencil } from 'lucide-solid';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Elements/Message',
  component: Message,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A message row for any chat turn, composing an optional `MessageAvatar`, a `MessageContent` body (set `markdown` to render markdown), and an optional `MessageActions` toolbar.',
        'Layout is driven by `class`: a bubble plus right alignment for user turns; an avatar plus transparent content for assistant turns.',
      ]),
    },
  },
  argTypes: {
    children: {
      control: false,
      description: 'The composed message parts (avatar, content, actions).',
    },
    class: {
      control: 'text',
      description: 'Layout classes, e.g. `flex flex-col items-end` for right-aligned user turns.',
    },
  },
  args: {
    class: '',
  },
  render: (args) => (
    <div class="max-w-2xl">
      <Message {...args}>
        <MessageAvatar src="" fallback="AI" alt="Assistant" />
        <MessageContent>
          I can help with a variety of tasks: answering questions, providing
          information, assisting with coding, and generating creative content.
          What would you like help with today?
        </MessageContent>
      </Message>
    </div>
  ),
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Message, MessageAvatar, MessageContent, MessageActions } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: an assistant turn; tweak `class` to change layout. */
export const Playground: Story = {
  ...src(`<Message>
  <MessageAvatar src="" fallback="AI" alt="Assistant" />
  <MessageContent>I can help with a variety of tasks...</MessageContent>
</Message>`),
};

/** A user turn: right-aligned bubble, no avatar. */
export const UserMessage: Story = {
  render: () => (
    <div class="max-w-2xl">
      <Message class="flex flex-col items-end">
        <MessageContent class="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5">
          Hello! How can I help you today?
        </MessageContent>
      </Message>
    </div>
  ),
  ...src(`<Message class="flex flex-col items-end">
  <MessageContent class="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5">
    Hello! How can I help you today?
  </MessageContent>
</Message>`),
};

/** An assistant turn: avatar plus a secondary-background content block. */
export const AssistantMessage: Story = {
  render: () => (
    <div class="max-w-2xl">
      <Message>
        <MessageAvatar src="" fallback="AI" alt="Assistant" />
        <MessageContent>
          I can help with a variety of tasks: answering questions, providing information,
          assisting with coding, generating creative content. What would you like help with today?
        </MessageContent>
      </Message>
    </div>
  ),
  ...src(`<Message>
  <MessageAvatar src="" fallback="AI" alt="Assistant" />
  <MessageContent>I can help with a variety of tasks...</MessageContent>
</Message>`),
};

/** Assistant turn with a transparent, flush content block (no bubble). */
export const AssistantNoBg: Story = {
  name: 'Assistant (No Background)',
  render: () => (
    <div class="max-w-2xl">
      <Message>
        <MessageAvatar src="" fallback="AI" alt="Assistant" />
        <MessageContent class="bg-transparent p-0">
          I can help with a variety of tasks: answering questions, providing information,
          assisting with coding, generating creative content. What would you like help with today?
        </MessageContent>
      </Message>
    </div>
  ),
  ...src(`<Message>
  <MessageAvatar src="" fallback="AI" alt="Assistant" />
  <MessageContent class="bg-transparent p-0">...</MessageContent>
</Message>`),
};

/** User bubble with hover-revealed edit/copy actions. */
export const UserAlignedRight: Story = {
  name: 'User (Right-Aligned)',
  render: () => (
    <div class="max-w-2xl">
      <Message class="flex flex-col items-end">
        <div class="group flex flex-col items-end gap-1">
          <MessageContent class="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5">
            Can you explain how SolidJS reactivity differs from React hooks?
          </MessageContent>
          <MessageActions class="flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Edit message">
              <Pencil class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Copy message">
              <Copy class="size-3.5" />
            </Button>
          </MessageActions>
        </div>
      </Message>
    </div>
  ),
  ...src(`<Message class="flex flex-col items-end">
  <div class="group flex flex-col items-end gap-1">
    <MessageContent class="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5">
      Can you explain how SolidJS reactivity differs from React hooks?
    </MessageContent>
    <MessageActions class="opacity-0 group-hover:opacity-100">
      <Button variant="ghost" size="icon-sm"><Pencil class="size-3.5" /></Button>
      <Button variant="ghost" size="icon-sm"><Copy class="size-3.5" /></Button>
    </MessageActions>
  </div>
</Message>`),
};

/** Markdown body: set `markdown` on `MessageContent` and pass a markdown string. */
export const MarkdownMessage: Story = {
  render: () => (
    <div class="max-w-2xl">
      <Message>
        <MessageAvatar src="" fallback="AI" alt="Assistant" />
        <MessageContent markdown class="bg-transparent p-0">
          {`Here's a **bold** statement with some \`inline code\` and a list:

- First item
- Second item
- Third item

And a code block:

\`\`\`typescript
const greeting = "Hello, world!";
console.log(greeting);
\`\`\``}
        </MessageContent>
      </Message>
    </div>
  ),
  ...src(`<Message>
  <MessageAvatar src="" fallback="AI" alt="Assistant" />
  <MessageContent markdown class="bg-transparent p-0">
    {markdownString}
  </MessageContent>
</Message>`),
};

/** Assistant turn with a hover action row (copy / feedback / regenerate). */
export const WithActions: Story = {
  render: () => (
    <div class="max-w-2xl">
      <Message>
        <MessageAvatar src="" fallback="AI" alt="Assistant" />
        <div class="group flex w-full flex-col gap-0">
          <MessageContent class="bg-transparent p-0">
            Here is a response with hover actions below it.
          </MessageContent>
          <MessageActions class="-ml-2.5 flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Copy message">
              <Copy class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Good response">
              <ThumbsUp class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Bad response">
              <ThumbsDown class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Regenerate response">
              <RefreshCw class="size-3.5" />
            </Button>
          </MessageActions>
        </div>
      </Message>
    </div>
  ),
  ...src(`<Message>
  <MessageAvatar src="" fallback="AI" alt="Assistant" />
  <div class="group flex w-full flex-col gap-0">
    <MessageContent class="bg-transparent p-0">Here is a response...</MessageContent>
    <MessageActions class="opacity-0 group-hover:opacity-100">
      <Button variant="ghost" size="icon-sm"><Copy class="size-3.5" /></Button>
      <Button variant="ghost" size="icon-sm"><ThumbsUp class="size-3.5" /></Button>
      <Button variant="ghost" size="icon-sm"><ThumbsDown class="size-3.5" /></Button>
      <Button variant="ghost" size="icon-sm"><RefreshCw class="size-3.5" /></Button>
    </MessageActions>
  </div>
</Message>`),
};

/** A user + assistant pair showing both layouts together (showcase). */
export const Conversation: Story = {
  render: () => (
    <div class="max-w-2xl space-y-4">
      <Message class="flex flex-col items-end">
        <MessageContent class="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5">
          What is TypeScript?
        </MessageContent>
      </Message>

      <Message>
        <MessageAvatar src="" fallback="AI" alt="Assistant" />
        <div class="group flex w-full flex-col gap-0">
          <MessageContent markdown class="bg-transparent p-0">
            {`**TypeScript** is a strongly typed programming language that builds on JavaScript. It adds optional static type checking and other features like interfaces, enums, and generics.

Key benefits:
- Catches errors at compile time
- Better IDE support and autocompletion
- Makes large codebases more maintainable`}
          </MessageContent>
          <MessageActions class="-ml-2.5 flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Copy message">
              <Copy class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Good response">
              <ThumbsUp class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Bad response">
              <ThumbsDown class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="Regenerate response">
              <RefreshCw class="size-3.5" />
            </Button>
          </MessageActions>
        </div>
      </Message>
    </div>
  ),
  ...src(`<div class="space-y-4">
  <Message class="flex flex-col items-end">
    <MessageContent class="bg-muted text-primary rounded-3xl px-5 py-2.5">
      What is TypeScript?
    </MessageContent>
  </Message>
  <Message>
    <MessageAvatar src="" fallback="AI" alt="Assistant" />
    <MessageContent markdown class="bg-transparent p-0">{answerMarkdown}</MessageContent>
  </Message>
</div>`),
};

/**
 * Citations. A run of consecutive `source` parts renders as ONE wrapped row
 * (`part="citations"`) placed OUTSIDE the message bubble — hover a chip for its
 * title and snippet.
 *
 * The answer's prose also contains a link the model typed itself. That inline
 * anchor is NOT a citation; only the chips below the bubble come from `source`
 * parts. Keeping the two visually distinct is the whole reason the row lives
 * outside the content part.
 */
export const Citations: Story = {
  render: () => {
    const parts: MessagePart[] = [
      {
        type: 'text',
        text: 'Theming is driven by CSS custom properties — see the [theming guide](https://ui.kitn.ai/guides/theming) for the full token list. Override the tokens on any ancestor and every `kai-*` element inherits them.',
      },
      {
        type: 'source',
        source: {
          index: 1,
          url: 'https://ui.kitn.ai/guides/theming',
          title: 'Theming — @kitn.ai/ui',
          snippet: 'Every element reads its colors from design tokens, so a single :root override restyles the whole kit.',
        },
      },
      {
        type: 'source',
        source: {
          index: 2,
          url: 'https://ui.kitn.ai/guides/tokens',
          title: 'Design tokens',
          snippet: 'The full list of custom properties, their defaults, and which elements consume them.',
        },
      },
      {
        type: 'source',
        source: {
          index: 3,
          url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties',
          title: 'Using CSS custom properties',
          snippet: 'MDN reference for declaring and consuming CSS variables.',
        },
      },
    ];
    return (
      <div class="max-w-2xl">
        <Message>
          <MessageAvatar src="" fallback="AI" alt="Assistant" />
          <div class="flex w-full flex-col gap-0">
            <MessageBody parts={parts} isUser={false} markdown />
          </div>
        </Message>
      </div>
    );
  },
  ...src(`<MessageBody
  isUser={false}
  markdown
  parts={[
    { type: 'text', text: 'Theming is driven by CSS custom properties...' },
    { type: 'source', source: { index: 1, url: 'https://ui.kitn.ai/guides/theming', title: 'Theming', snippet: '...' } },
    { type: 'source', source: { index: 2, url: 'https://ui.kitn.ai/guides/tokens', title: 'Design tokens', snippet: '...' } },
  ]}
/>`),
};

/**
 * Every field of a model-produced citation is optional. An unnumbered source
 * falls back to its domain; a source with NO url degrades to a plain, inert chip
 * labelled with its title rather than a broken link.
 */
export const CitationsWithoutNumbers: Story = {
  render: () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Here is what I found.' },
      { type: 'source', source: { url: 'https://ui.kitn.ai/guides/theming', title: 'Theming', snippet: 'Token-driven theming.' } },
      { type: 'source', source: { url: 'https://www.solidjs.com/docs', title: 'SolidJS docs' } },
      { type: 'source', source: { title: 'Internal design note (no public URL)', snippet: 'A citation with no url at all.' } },
    ];
    return (
      <div class="max-w-2xl">
        <Message>
          <MessageAvatar src="" fallback="AI" alt="Assistant" />
          <div class="flex w-full flex-col gap-0">
            <MessageBody parts={parts} isUser={false} markdown />
          </div>
        </Message>
      </div>
    );
  },
};
