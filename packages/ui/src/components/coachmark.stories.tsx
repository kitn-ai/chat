import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { Placement } from '@floating-ui/dom';
import { createSignal, Show } from 'solid-js';
import { Coachmark } from './coachmark';
import { Button } from '../ui/button';
import { ChatConfig } from '../primitives/chat-config';
import { componentDescription } from '../stories/docs/element-controls';

/**
 * Story for the presentational `Coachmark`: an onboarding hint bubble anchored to
 * a trigger. It wraps the anchor (the default child) and points a tinted bubble
 * with an arrow at it; the developer owns when it shows (`open` / `defaultOpen`)
 * and the `×` fires `onDismiss`. The stories render with `defaultOpen` so the
 * bubble is visible, inside a padded canvas so it has room to sit below the anchor.
 */
const meta = {
  title: 'Components/Elements/Coachmark',
  component: Coachmark,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'An anchored onboarding hint: a tinted bubble with an arrow that points at a trigger. Wrap the trigger as the default child; the bubble carries a `headline`, body `content`, and an optional `badge`.',
        'Set `tone` to `primary` (the theme accent), `info` (blue), `success` (green), `warning` (amber), or `error` (red) — the kit tool hues. You own visibility via `open` / `defaultOpen`; the `×` fires `onDismiss` so you can record that the hint was seen.',
      ]),
    },
  },
  argTypes: {
    headline: { control: 'text', description: 'Bold title (the `title` slot is reserved, so this is `headline`).' },
    content: { control: 'text', description: 'Bubble body text.' },
    badge: { control: 'text', description: 'Small pill beside the headline (e.g. "New").' },
    tone: {
      control: 'select',
      options: ['primary', 'info', 'success', 'warning', 'error'],
      description: 'Color tone.',
      table: { defaultValue: { summary: 'primary' } },
    },
    placement: {
      control: 'select',
      options: ['top', 'bottom', 'left', 'right'],
      description: 'Bubble placement relative to the anchor.',
      table: { defaultValue: { summary: 'bottom' } },
    },
  },
  render: (args: {
    headline?: string;
    content?: string;
    badge?: string;
    tone?: 'primary' | 'info' | 'success' | 'warning' | 'error';
    placement?: Placement;
  }) => (
    <div class="flex min-h-[260px] items-center justify-center">
      <Coachmark
        defaultOpen
        tone={args.tone}
        placement={args.placement}
        headline={args.headline}
        badge={args.badge}
        content={args.content}
      >
        <Button variant="outline">Cowork</Button>
      </Coachmark>
    </div>
  ),
} satisfies Meta<typeof Coachmark>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Coachmark } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: edit headline, content, badge, tone, and placement. */
export const Playground: Story = {
  args: {
    headline: 'Cowork has a new home',
    content: 'Chat with Claude here, or switch to Cowork to build alongside it.',
    badge: 'New',
    tone: 'primary',
    placement: 'bottom',
  },
  ...src(`<Coachmark headline="Cowork has a new home" badge="New" defaultOpen
  content="Chat with Claude here, or switch to Cowork to build alongside it.">
  <Button variant="outline">Cowork</Button>
</Coachmark>`),
};

/** The default `primary` tone: the theme accent on accent-foreground text. */
export const Primary: Story = {
  args: {
    tone: 'primary',
    headline: 'Cowork has a new home',
    content: 'Chat with Claude here, or switch to Cowork to build alongside it.',
    badge: 'New',
  },
  ...src(`<Coachmark tone="primary" headline="Cowork has a new home" badge="New" defaultOpen
  content="Chat with Claude here, or switch to Cowork to build alongside it.">
  <Button variant="outline">Cowork</Button>
</Coachmark>`),
};

/** The `info` tone: the blue onboarding look with white text. */
export const Info: Story = {
  args: {
    tone: 'info',
    headline: 'New: shared workspaces',
    content: 'Invite teammates into a workspace to build together.',
    badge: 'Beta',
  },
  ...src(`<Coachmark tone="info" headline="New: shared workspaces" badge="Beta" defaultOpen
  content="Invite teammates into a workspace to build together.">
  <Button variant="outline">Workspaces</Button>
</Coachmark>`),
};

/** The full semantic set — one bubble per tone, reusing the kit's tool hues
 *  (`success` green, `warning` amber with dark text, `error` red). */
export const Tones: Story = {
  render: () => {
    const tones = ['primary', 'info', 'success', 'warning', 'error'] as const;
    const copy: Record<(typeof tones)[number], string> = {
      primary: 'The theme accent tone.',
      info: 'The blue onboarding tone.',
      success: 'A green confirmation tone.',
      warning: 'An amber caution tone, dark text for contrast.',
      error: 'A red attention tone.',
    };
    return (
      <div class="flex min-h-[360px] flex-col items-start gap-10 pl-4">
        {tones.map((tone) => (
          <Coachmark
            defaultOpen
            tone={tone}
            placement="right"
            headline={`${tone[0].toUpperCase()}${tone.slice(1)} tone`}
            content={copy[tone]}
          >
            <Button variant="outline" class="w-28 capitalize">{tone}</Button>
          </Coachmark>
        ))}
      </div>
    );
  },
  ...src(`<Coachmark tone="success" headline="Success tone" defaultOpen
  content="A green confirmation tone.">
  <Button variant="outline">Saved</Button>
</Coachmark>`),
};

/** A headline plus a `badge` pill. */
export const WithBadge: Story = {
  args: {
    tone: 'primary',
    headline: 'Try the new composer',
    content: 'Mention skills and agents inline with @ and /.',
    badge: 'New',
  },
  ...src(`<Coachmark headline="Try the new composer" badge="New" defaultOpen
  content="Mention skills and agents inline with @ and /.">
  <Button variant="outline">Composer</Button>
</Coachmark>`),
};

/**
 * Recolor purely in CSS via `--kai-coachmark-bg` (bubble + arrow) and
 * `--kai-coachmark-fg` (text). They default to the `tone` palette, so setting them
 * overrides the bubble, arrow, badge, and body in one place — no JS, survives
 * re-mounts. On the element, set them on `kai-coachmark` itself.
 */
export const CustomColor: Story = {
  render: () => {
    // The bubble portals to `config.portalMount` (here, the var-carrying wrapper)
    // so it inherits the custom properties. On `<kai-coachmark>` the portal lives
    // inside the shadow root, so `kai-coachmark { --kai-coachmark-bg: … }` reaches
    // it the same way.
    const [mount, setMount] = createSignal<HTMLElement>();
    return (
      <div
        ref={setMount}
        class="flex min-h-[260px] items-center justify-center"
        style={{
          '--kai-coachmark-bg': 'var(--color-tool-blue)',
          '--kai-coachmark-fg': 'var(--color-background)',
        }}
      >
        <Show when={mount()}>
          <ChatConfig portalMount={mount()}>
            <Coachmark
              defaultOpen
              headline="Now in Cowork"
              badge="New"
              content="Recolored in CSS via --kai-coachmark-bg and --kai-coachmark-fg."
            >
              <Button variant="outline">Cowork</Button>
            </Coachmark>
          </ChatConfig>
        </Show>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-coachmark default-open headline="Now in Cowork" badge="New">
  <button>Cowork</button>
  <span slot="content">Recolored in CSS via the custom properties.</span>
</kai-coachmark>

<style>
  /* Recolor in CSS. The vars default to the tone palette, so this overrides
     the bubble, arrow, and text at once. Persistent, survives re-mounts. */
  kai-coachmark {
    --kai-coachmark-bg: var(--color-tool-blue);
    --kai-coachmark-fg: var(--color-background);
  }
</style>`,
      },
    },
  },
};

/** No badge: just a headline and body. */
export const WithoutBadge: Story = {
  args: {
    tone: 'primary',
    headline: 'Try the new composer',
    content: 'Mention skills and agents inline with @ and /.',
    badge: undefined,
  },
  ...src(`<Coachmark headline="Try the new composer" defaultOpen
  content="Mention skills and agents inline with @ and /.">
  <Button variant="outline">Composer</Button>
</Coachmark>`),
};
