import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { Screen } from './screen';
import { Button } from '../ui/button';
import { componentDescription } from '../stories/docs/element-controls';

/**
 * Story for the presentational `Screen`: a full-bleed overlay surface that fills
 * its mount point while `open`, under a back-header. It owns the takeover (inert
 * siblings, focus capture/restore, Escape -> `onBack`, an enter/exit transition);
 * the developer owns the swap by flipping `open`. The stories mount it in a
 * bounded, positioned canvas so the absolutely-positioned surface has room to fill.
 */
const meta = {
  title: 'Components/Elements/Screen',
  component: Screen,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A full-bleed overlay destination. It fills whatever it is mounted in while `open`, renders a back-header with the `title`, and removes itself from layout when closed.',
        'It handles the takeover details: it inerts sibling elements, captures and restores focus, and fires `onBack` on the back button or Escape. You drive the swap by setting `open` (your own routing); the surface positions itself absolutely, so give it a positioned, bounded parent.',
      ]),
    },
  },
  argTypes: {
    title: { control: 'text', description: 'Header title text.' },
    back: {
      control: 'boolean',
      description: 'Show the back button.',
      table: { defaultValue: { summary: 'true' } },
    },
  },
  render: (args: { title?: string; back?: boolean }) => (
    <div class="relative h-[440px] w-full overflow-hidden rounded-xl border border-border bg-background">
      <Screen defaultOpen title={args.title} back={args.back}>
        <div class="p-6">
          <h3 class="mb-1 text-base font-semibold text-foreground">Design surface</h3>
          <p class="text-sm text-muted-foreground">
            Your own full-bleed surface lives here. Press Back or Escape to return.
          </p>
        </div>
      </Screen>
    </div>
  ),
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Screen } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: edit the title and toggle the back button. */
export const Playground: Story = {
  args: { title: 'Design', back: true },
  ...src(`<Screen open={open()} title="Design" onBack={() => setOpen(false)}>
  <div class="p-6">
    <h3>Design surface</h3>
    <p>Your own full-bleed surface lives here.</p>
  </div>
</Screen>`),
};

/** Open with a header title and body content. */
export const Default: Story = {
  args: { title: 'Design', back: true },
  ...src(`<Screen open={open()} title="Design" onBack={() => setOpen(false)}>
  <div class="p-6">
    <h3>Design surface</h3>
    <p>Your own full-bleed surface lives here. Press Back or Escape to return.</p>
  </div>
</Screen>`),
};

/** A trailing `actions` cluster in the header, beside the title. */
export const WithActions: Story = {
  render: () => (
    <div class="relative h-[440px] w-full overflow-hidden rounded-xl border border-border bg-background">
      <Screen
        defaultOpen
        title="Design"
        actions={
          <>
            <Button variant="ghost" size="sm">Share</Button>
            <Button size="sm">Publish</Button>
          </>
        }
      >
        <div class="p-6">
          <h3 class="mb-1 text-base font-semibold text-foreground">Design surface</h3>
          <p class="text-sm text-muted-foreground">Header actions sit on the trailing edge.</p>
        </div>
      </Screen>
    </div>
  ),
  ...src(`<Screen open={open()} title="Design" onBack={() => setOpen(false)}
  actions={<><Button variant="ghost" size="sm">Share</Button><Button size="sm">Publish</Button></>}>
  <div class="p-6">Design surface</div>
</Screen>`),
};

/** The developer owns the swap: a trigger sets `open`, Back / Escape clears it. */
export const Interactive: Story = {
  render: () => {
    const [open, setOpen] = createSignal(false);
    return (
      <div class="relative h-[440px] w-full overflow-hidden rounded-xl border border-border bg-background">
        <div class="p-6">
          <p class="mb-3 text-sm text-muted-foreground">The Design screen pushes over all of this.</p>
          <Button onClick={() => setOpen(true)}>Open Design</Button>
        </div>
        <Screen open={open()} title="Design" onBack={() => setOpen(false)}>
          <div class="p-6">
            <h3 class="mb-1 text-base font-semibold text-foreground">Design surface</h3>
            <p class="text-sm text-muted-foreground">Press Back or Escape to return.</p>
          </div>
        </Screen>
      </div>
    );
  },
  ...src(`const [open, setOpen] = createSignal(false);

<Button onClick={() => setOpen(true)}>Open Design</Button>
<Screen open={open()} title="Design" onBack={() => setOpen(false)}>
  <div class="p-6">Design surface</div>
</Screen>`),
};
