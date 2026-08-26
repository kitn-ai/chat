import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { For } from 'solid-js';
import { ScrollButton } from './scroll-button';
import { ChatContainerRoot, ChatContainerContent } from './chat-container';
import { componentDescription } from '../stories/docs/element-controls';

/**
 * `ScrollButton` reads scroll state from the surrounding `ChatContainerRoot`
 * context, so every story wraps it in a scrollable container of real message
 * content: that is the only way to judge the opaque fill and the elevation,
 * since both exist to make the button read as ABOVE the thread. It is hidden
 * (faded out) while pinned to the bottom and appears once you scroll up.
 */
function ScrollDemo(props: {
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
  class?: string;
  label?: string;
  showLabel?: boolean;
  /** Classes on the POSITIONING wrapper, not on the button. See `Positioning`. */
  holderClass?: string;
  /** Draw a fake composer under the thread, to show clearance above it. */
  composer?: boolean;
}) {
  return (
    <div class="relative h-64 w-80 overflow-hidden rounded-lg border bg-background text-foreground">
      <ChatContainerRoot class="h-full p-4">
        <ChatContainerContent class="gap-2">
          <For each={Array.from({ length: 20 })}>
            {(_, i) => (
              <div class="rounded-md bg-muted/40 px-3 py-2 text-sm">
                Message {i() + 1}: a line of thread content for the button to float over.
              </div>
            )}
          </For>
        </ChatContainerContent>
        {/* ScrollButton must live INSIDE ChatContainerRoot (it reads that
            context); it's absolutely positioned relative to the outer .relative
            box, so it stays pinned and doesn't scroll with the content. */}
        <div class={props.holderClass ?? 'absolute inset-x-0 bottom-3 flex justify-center'}>
          <ScrollButton
            variant={props.variant}
            size={props.size}
            class={props.class}
            label={props.label}
            showLabel={props.showLabel}
          />
        </div>
      </ChatContainerRoot>
      {props.composer ? (
        <div class="absolute inset-x-0 bottom-0 border-t border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          Send a message...
        </div>
      ) : null}
    </div>
  );
}

const meta = {
  title: 'Components/Elements/ScrollButton',
  component: ScrollButton,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A floating "scroll to bottom" button that reads scroll state from the enclosing `ChatContainerRoot`. Render it inside that context; it fades out while pinned to the bottom and reappears once the user scrolls up. Position it with absolute layout.',
        'It is an opaque rounded square with the kit\'s themeable elevation (`--kai-shadow-color`), so it stays legible over scrolling messages instead of letting them show through.',
        '`label` sets the accessible name (default `"Scroll to bottom"`) and is announced whether or not it is visible; `showLabel` also renders it beside the arrow. Set `label` on its own to localise the icon-only button.',
        'There is no `placement` prop. You position it with your own absolutely positioned wrapper inside the `ChatContainerRoot`, anchored to a non-scrolling parent. See the `Positioning` story for the four arrangements and the one gotcha.',
      ]),
      controls: { exclude: ['use:eventListener'] },
    },
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Accessible name for the button. Announced in both `showLabel` states.',
      table: { defaultValue: { summary: 'Scroll to bottom' } },
    },
    showLabel: {
      control: 'boolean',
      description: 'Render `label` visibly beside the arrow.',
      table: { defaultValue: { summary: 'false' } },
    },
    variant: {
      control: 'select',
      options: ['default', 'ghost', 'outline'],
      description: 'Underlying button visual emphasis. `outline` is the opaque floating chip.',
      table: { defaultValue: { summary: 'outline' } },
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'icon', 'icon-sm'],
      description: 'Underlying button size preset.',
      table: { defaultValue: { summary: 'sm' } },
    },
    class: {
      control: 'text',
      description: 'Additional classes merged onto the button.',
    },
  },
  args: {
    variant: 'outline',
    size: 'sm',
    label: 'Scroll to bottom',
    showLabel: false,
  },
  render: (args) => (
    <ScrollDemo
      variant={args.variant}
      size={args.size}
      class={args.class}
      label={args.label}
      showLabel={args.showLabel}
    />
  ),
} satisfies Meta<typeof ScrollButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { ScrollButton, ChatContainerRoot, ChatContainerContent } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: scroll up to reveal the button; toggle `showLabel`. */
export const Playground: Story = {
  ...src(`<div class="relative">
  <ChatContainerRoot class="h-full overflow-y-auto">
    <ChatContainerContent>{/* messages */}</ChatContainerContent>
    {/* inside the Root (reads its context); absolutely positioned to stay pinned */}
    <div class="absolute inset-x-0 bottom-3 flex justify-center">
      <ScrollButton />
    </div>
  </ChatContainerRoot>
</div>`),
};

/** Icon only, the default. Scroll up to reveal it over the messages. */
export const IconOnly: Story = {
  args: { showLabel: false },
  ...src(`<ScrollButton />`),
};

/** Labelled: the visible text is the accessible name, so it is not announced twice. */
export const Labelled: Story = {
  args: { showLabel: true },
  ...src(`<ScrollButton showLabel />`),
};

/** A localised name. `label` alone changes what is announced without showing it. */
export const CustomLabel: Story = {
  args: { showLabel: true, label: 'Jump to latest' },
  ...src(`<ScrollButton show-label label="Jump to latest" />`),
};

/**
 * Both themes side by side, over real content, so the fill and shadow can be
 * judged in situ.
 *
 * The two panels are IDENTICAL apart from the `dark` class, deliberately: this
 * story is a colour comparison and nothing else. Both carry the same
 * `border-border` frame, because when only the dark panel's frame was visible
 * (a white-on-white wrapper in light, a dark panel on a white page in dark) the
 * button looked repositioned between them when it was pixel-identical in both.
 * For placement, see `Positioning`.
 */
export const LightAndDark: Story = {
  args: { showLabel: true },
  render: (args: { label?: string; showLabel?: boolean }) => (
    <div class="flex flex-wrap gap-6">
      <div class="rounded-lg border border-border bg-background p-3">
        <div class="mb-2 text-xs font-medium text-muted-foreground">Light</div>
        <ScrollDemo label={args.label} showLabel={args.showLabel} />
      </div>
      <div class="dark rounded-lg border border-border bg-background p-3">
        <div class="mb-2 text-xs font-medium text-muted-foreground">Dark</div>
        <ScrollDemo label={args.label} showLabel={args.showLabel} />
      </div>
    </div>
  ),
  ...src(`<ScrollButton showLabel />`),
};

/**
 * WHERE the button sits is your layout's call, not a prop.
 *
 * `ScrollButton` has no `placement`: it renders an inline-flex `<button>` and
 * nothing else. You position it by wrapping it in your own absolutely
 * positioned box inside the `ChatContainerRoot` (it has to stay inside, because
 * that is the context it reads scroll state from). Every arrangement below is
 * the SAME button with a different wrapper. That split is deliberate: how the
 * button looks and behaves is the kit's business, where your layout puts it is
 * yours.
 *
 * The last panel is what `thread.tsx:216` and `chat-thread.tsx:415` actually
 * ship, and they agree with each other: `relative` on the non-scrolling box
 * around `ChatContainer`, then `absolute bottom-4 left-1/2 w-full max-w-3xl
 * -translate-x-1/2` on the wrapper. Centring on the message band rather than
 * the full container is what stops the button drifting to the middle of a wide
 * window instead of tracking the messages.
 *
 * Anchor the wrapper to a NON-SCROLLING box. Putting `relative` on the
 * `ChatContainerRoot` itself looks right and is wrong: an absolutely positioned
 * child of a scroll container is placed against its padding box and then
 * scrolls away with the content. Wrap the Root in a `relative` box instead, and
 * position against that.
 */
export const Positioning: Story = {
  args: { showLabel: false },
  render: () => (
    <div class="flex flex-wrap gap-6">
      <div>
        <div class="mb-2 text-xs font-medium text-muted-foreground">
          Bottom centre <code>absolute inset-x-0 bottom-3 flex justify-center</code>
        </div>
        <ScrollDemo holderClass="absolute inset-x-0 bottom-3 flex justify-center" />
      </div>
      <div>
        <div class="mb-2 text-xs font-medium text-muted-foreground">
          Bottom right <code>absolute bottom-3 right-3</code>
        </div>
        <ScrollDemo holderClass="absolute bottom-3 right-3" />
      </div>
      <div>
        <div class="mb-2 text-xs font-medium text-muted-foreground">
          Clear of a composer <code>absolute inset-x-0 bottom-14 flex justify-center</code>
        </div>
        <ScrollDemo composer holderClass="absolute inset-x-0 bottom-14 flex justify-center" />
      </div>
      <div>
        <div class="mb-2 text-xs font-medium text-muted-foreground">
          Labelled, bottom right <code>absolute bottom-3 right-3</code>
        </div>
        <ScrollDemo showLabel holderClass="absolute bottom-3 right-3" />
      </div>
      <div>
        <div class="mb-2 text-xs font-medium text-muted-foreground">
          Centred on a max-width band, the way the kit does it{' '}
          <code>absolute bottom-3 left-1/2 w-full max-w-3xl -translate-x-1/2 flex justify-center</code>
        </div>
        <ScrollDemo holderClass="absolute bottom-3 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-center" />
      </div>
    </div>
  ),
  ...src(`{/* The OUTER box is the positioning context. Do not put \`relative\` on
    ChatContainerRoot: an absolute child of a scroll container scrolls away
    with the content. */}
<div class="relative h-96">
  <ChatContainerRoot class="h-full overflow-y-auto">
    <ChatContainerContent>{/* messages */}</ChatContainerContent>

    {/* The button must stay INSIDE the Root: that is the context it reads
        scroll state from. Only the wrapper changes below. */}

    {/* bottom centre */}
    <div class="absolute inset-x-0 bottom-3 flex justify-center">
      <ScrollButton />
    </div>

    {/* bottom right */}
    <div class="absolute bottom-3 right-3">
      <ScrollButton />
    </div>

    {/* lifted clear of a composer docked at the bottom */}
    <div class="absolute inset-x-0 bottom-14 flex justify-center">
      <ScrollButton />
    </div>
  </ChatContainerRoot>
</div>`),
};

/** Ghost variant overlaid in a chat area (showcase): no fill, elevation only. */
export const Ghost: Story = {
  args: { variant: 'ghost' },
  ...src(`<ScrollButton variant="ghost" />`),
};
