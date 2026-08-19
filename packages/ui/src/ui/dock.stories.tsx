import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn } from 'storybook/test';
import { Dock } from './dock';
import { componentDescription } from '../stories/docs/element-controls';

/**
 * The SolidJS story for the Dock primitive — the only story layer this element has,
 * matching its siblings in this directory (`prompt-dock.stories.tsx` is titled the
 * same way; `dialog.tsx` carries no story at all). The `<kai-dock>` facade has no
 * separate Labs story, because neither of the ui-layer components it sits beside does.
 *
 * EVERY STORY IS A DEMO PAGE, not a bare component. A dock is `position: fixed` and
 * corner-pinned, so a story that rendered it alone would put a button in the corner of
 * an empty canvas and tell you nothing about the thing it is for: floating over
 * somebody else's page without taking it over.
 */
const meta = {
  title: 'Components/Elements/Dock',
  component: Dock,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: componentDescription([
        'A corner-docked launcher button with a floating panel above it — the "chat bubble in the bottom-right" affordance. The panel is content-agnostic: slot a chat, a form, or your own component; the dock owns the button, `aria-expanded`, the focus return, Escape and the hide semantics, and nothing else.',
        'Closed does not mean gone. The panel keeps its layout box (`visibility: hidden` + `inert`) and is never unmounted, so a thread inside it never re-measures from zero and a reply that arrives while closed is really there — which is what makes the `unread` dot honest. `unread` is yours: the dock renders it while closed and never writes it back.',
        'Geometry is CSS custom properties, not props: `--kai-dock-width` · `--kai-dock-height` · `--kai-dock-inset` · `--kai-dock-gap` · `--kai-dock-radius` · `--kai-dock-z` · `--kai-dock-launcher-size`. Narrow viewports take the panel full-bleed by default.',
      ]),
    },
  },
  argTypes: {
    onOpenChange: {
      action: 'openChange',
      description: 'Fires with the next open state whenever the dock opens or closes.',
      table: { category: 'Events' },
    },
  },
  args: {
    onOpenChange: fn(),
  },
} satisfies Meta<typeof Dock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The args each story's `render` receives. Spelled out because `satisfies Meta<…>`
 *  keeps `typeof meta` a literal type, which Storybook cannot map back to the
 *  component's props for a per-story `render`. */
type DockArgs = { onOpenChange: (open: boolean) => void };

const IMPORT = "import { Dock } from '@kitn.ai/ui/solid';";
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** A stand-in for the host page the dock floats over. */
function HostPage(props: { children?: import('solid-js').JSX.Element; note?: string }) {
  return (
    <div class="min-h-[32rem] bg-background p-8 text-foreground">
      <h1 class="text-xl font-semibold">Aurora — Pricing</h1>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        The page underneath stays usable: the dock does not trap focus, does not dim
        anything, and does not swallow the Escape key this page's own controls want.
      </p>
      <button type="button" class="mt-4 rounded-md border border-border px-3 py-1.5 text-sm">
        A control on the host page
      </button>
      {props.note ? <p class="mt-6 text-sm text-muted-foreground">{props.note}</p> : null}
      {props.children}
    </div>
  );
}

/** The panel body — deliberately not a chat, to show the dock knows nothing about it. */
function PanelBody() {
  return (
    <div class="flex h-full flex-col">
      <header class="border-b border-border px-4 py-3 text-sm font-semibold">Aurora Support</header>
      <div class="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm text-muted-foreground">
        Anything goes in here — a `kai-chat`, a form, your own component.
      </div>
      <footer class="border-t border-border px-4 py-3">
        <input
          class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          placeholder="Ask a question"
          aria-label="Ask a question"
        />
      </footer>
    </div>
  );
}

export const Default: Story = {
  ...src(`<Dock label="Aurora support">
  <PanelBody />
</Dock>`),
  render: (args: DockArgs) => (
    <HostPage>
      <Dock label="Aurora support" onOpenChange={args.onOpenChange}>
        <PanelBody />
      </Dock>
    </HostPage>
  ),
};

export const OpenWithUnread: Story = {
  ...src(`{/* \`unread\` is the consumer's: the dot shows while closed and the dock never clears it. */}
<Dock label="Aurora support" unread defaultOpen>
  <PanelBody />
</Dock>`),
  render: (args: DockArgs) => (
    <HostPage note="Opened at mount via defaultOpen — note that it took no focus doing so.">
      <Dock label="Aurora support" unread defaultOpen onOpenChange={args.onOpenChange}>
        <PanelBody />
      </Dock>
    </HostPage>
  ),
};

export const BottomStart: Story = {
  ...src(`{/* Logical, so an RTL page docks on the opposite side with no extra work. */}
<Dock label="Aurora support" position="bottom-start">
  <PanelBody />
</Dock>`),
  render: (args: DockArgs) => (
    <HostPage note={'position="bottom-start" — logical, so RTL flips it for free.'}>
      <Dock label="Aurora support" position="bottom-start" onOpenChange={args.onOpenChange}>
        <PanelBody />
      </Dock>
    </HostPage>
  ),
};

export const Tokenized: Story = {
  ...src(`{/* Geometry is CSS custom properties, never props. */}
<div style={{ '--kai-dock-width': '320px', '--kai-dock-height': '420px', '--kai-dock-radius': '28px' }}>
  <Dock label="Aurora support">
    <PanelBody />
  </Dock>
</div>`),
  render: (args: DockArgs) => (
    <HostPage note="Resized entirely through --kai-dock-* tokens; no prop changed.">
      <div
        style={{
          '--kai-dock-width': '320px',
          '--kai-dock-height': '420px',
          '--kai-dock-radius': '28px',
          '--kai-dock-launcher-size': '48px',
        }}
      >
        <Dock label="Aurora support" onOpenChange={args.onOpenChange}>
          <PanelBody />
        </Dock>
      </div>
    </HostPage>
  ),
};
