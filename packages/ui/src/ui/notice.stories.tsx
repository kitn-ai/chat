import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Notice } from './notice';
import { Button } from './button';
import { renderIcon } from './icon';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Notice',
  component: Notice,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['iconSlot', 'onDismiss', 'children', 'action', 'class', 'use:eventListener'] },
      description: componentDescription([
        'An inline notice / alert: a leading severity icon, a message, an optional trailing `action`, and an optional dismiss. `severity` picks the hue and default glyph. Carries the right a11y role (`alert` for errors, `status` otherwise).',
      ]),
    },
  },
  argTypes: {
    severity: {
      control: 'select',
      options: ['neutral', 'info', 'warning', 'error', 'success'],
      description: 'Hue and default leading glyph.',
      table: { defaultValue: { summary: 'neutral' } },
    },
    icon: {
      control: 'text',
      description: 'Leading icon: a named icon to override, `"none"` to hide it, or omit for the severity default.',
    },
    dismissible: {
      control: 'boolean',
      description: 'Show a dismiss (×) that hides the notice and fires `onDismiss`.',
    },
  },
  args: {
    severity: 'info',
    dismissible: false,
  },
  render: (args) => <Notice {...args} class="max-w-md">Your draft was saved automatically.</Notice>,
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Notice } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: pick a severity and toggle the dismiss. */
export const Playground: Story = {
  ...src(`<Notice severity="info">Your draft was saved automatically.</Notice>`),
};

/** The muted default, no hue. */
export const Neutral: Story = {
  render: () => <Notice severity="neutral" class="max-w-md">Drafts are kept for 30 days.</Notice>,
  ...src(`<Notice severity="neutral">Drafts are kept for 30 days.</Notice>`),
};

export const Info: Story = {
  render: () => <Notice severity="info" class="max-w-md">A new model is available. Switch any time.</Notice>,
  ...src(`<Notice severity="info">A new model is available. Switch any time.</Notice>`),
};

export const Warning: Story = {
  render: () => <Notice severity="warning" class="max-w-md">You are near your monthly usage limit.</Notice>,
  ...src(`<Notice severity="warning">You are near your monthly usage limit.</Notice>`),
};

export const Error: Story = {
  render: () => <Notice severity="error" class="max-w-md">Your last message failed to send.</Notice>,
  ...src(`<Notice severity="error">Your last message failed to send.</Notice>`),
};

export const Success: Story = {
  render: () => <Notice severity="success" class="max-w-md">Settings saved.</Notice>,
  ...src(`<Notice severity="success">Settings saved.</Notice>`),
};

/** All five severities stacked. */
export const Severities: Story = {
  render: () => (
    <div class="flex max-w-md flex-col gap-2">
      <Notice severity="neutral">Drafts are kept for 30 days.</Notice>
      <Notice severity="info">A new model is available.</Notice>
      <Notice severity="warning">You are near your usage limit.</Notice>
      <Notice severity="error">Your last message failed to send.</Notice>
      <Notice severity="success">Settings saved.</Notice>
    </div>
  ),
  ...src(`<Notice severity="neutral">…</Notice>
<Notice severity="info">…</Notice>
<Notice severity="warning">…</Notice>
<Notice severity="error">…</Notice>
<Notice severity="success">…</Notice>`),
};

/** Dismissible: shows a × that hides the notice and fires `onDismiss`. */
export const Dismissible: Story = {
  render: () => (
    <Notice severity="info" dismissible class="max-w-md" onDismiss={() => {}}>
      We refreshed the home page. Tell us what you think.
    </Notice>
  ),
  ...src(`<Notice severity="info" dismissible onDismiss={() => {}}>
  We refreshed the home page. Tell us what you think.
</Notice>`),
};

/** A trailing action sits after the message, before any dismiss. */
export const WithAction: Story = {
  render: () => (
    <Notice
      severity="error"
      class="max-w-md"
      action={<Button variant="ghost" size="sm">Retry</Button>}
    >
      Your last message failed to send.
    </Notice>
  ),
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: `import { Notice, Button } from '@kitn.ai/ui/solid';

<Notice
  severity="error"
  action={<Button variant="ghost" size="sm">Retry</Button>}
>
  Your last message failed to send.
</Notice>`,
      },
    },
  },
};

/** Override the leading glyph with any named icon. Pass `icon="none"` to hide it. */
export const CustomIcon: Story = {
  render: () => (
    <Notice severity="info" icon="sparkles" class="max-w-md">
      Generative UI is now on by default.
    </Notice>
  ),
  ...src(`<Notice severity="info" icon="sparkles">
  Generative UI is now on by default.
</Notice>`),
};

/** Replace the icon region entirely with `iconSlot` (the `kai-notice` slot="icon" escape hatch). */
export const CustomIconSlot: Story = {
  render: () => (
    <Notice
      severity="neutral"
      iconSlot={renderIcon('github', { class: 'size-4 shrink-0 text-foreground' })}
      class="max-w-md"
    >
      Connected to your GitHub account.
    </Notice>
  ),
  ...src(`<Notice severity="neutral" iconSlot={renderIcon('github', { class: 'size-4' })}>
  Connected to your GitHub account.
</Notice>`),
};
