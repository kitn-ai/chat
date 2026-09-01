import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { X, ArrowLeft } from 'lucide-solid';
import { Panel, PanelHeader, PanelBody, PanelFooter } from './panel';
import { Button } from '../ui/button';
import { componentDescription } from '../stories/docs/element-controls';

/**
 * The widget panel chrome as public parts (blocks-and-parts ruling P-1).
 * Stub data throughout: these stories exist to iterate the LOOK of the
 * chrome, per the story-first policy.
 */
const meta = {
  title: 'Components/Elements/Panel',
  component: Panel,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: componentDescription([
        'The widget panel frame and chrome, public: surface, optional standalone frame (border, radius, shadow), the header row (leading controls, title, trailing controls), the view container, and a footer strip. Painted entirely from kit tokens, so a `--kai-color-*` override retints the chrome with the elements inside it. Back and close are slotted content in the header, never props.',
      ]),
    },
  },
  argTypes: {
    frame: {
      control: 'boolean',
      description: 'Standalone widget-box chrome (border, radius, shadow). Off, the panel inherits its container radius, the inside-a-dock posture.',
    },
  },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

// Not yet part of the public export surface (blocks-and-parts phase 1) --
// this mirrors the file's own relative import rather than a package path.
const IMPORT = `import { Panel, PanelHeader, PanelBody, PanelFooter } from './panel';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Shared stub body: token-painted placeholder content standing in for a
 *  home screen / thread view. */
function StubBody() {
  return (
    <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
      <div class="flex flex-col gap-1">
        <h2 class="m-0 text-xl font-semibold">Hi there</h2>
        <p class="m-0 text-sm text-muted-foreground">How can we help today?</p>
      </div>
      <div class="rounded-xl border border-border p-3">
        <div class="text-sm font-medium">Recent conversation</div>
        <div class="mt-1 text-sm text-muted-foreground">Where is my order?</div>
      </div>
      <Button class="w-full">Send us a message</Button>
    </div>
  );
}

function CloseButton() {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Close">
      <X size={24} aria-hidden="true" />
    </Button>
  );
}

/**
 * The widget box, standalone (`frame`): header with title and close, stub
 * body, footer slot in use. This is the P-1 acceptance "level" header
 * variant: title + close, no back arrow.
 */
export const WidgetBox: Story = {
  args: { frame: true },
  render: (args: { frame?: boolean }) => (
    <div style={{ width: '380px', height: '560px' }}>
      <Panel frame={args.frame}>
        <PanelHeader end={<CloseButton />}>Aurora Support</PanelHeader>
        <PanelBody>
          <StubBody />
        </PanelBody>
        <PanelFooter>
          <div class="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
            Powered by Aurora
          </div>
        </PanelFooter>
      </Panel>
    </div>
  ),
  ...src(`<Panel frame>
  <PanelHeader end={<CloseButton />}>Aurora Support</PanelHeader>
  <PanelBody>...</PanelBody>
  <PanelFooter>Powered by Aurora</PanelFooter>
</Panel>`),
};

/**
 * The P-1 acceptance "drilled" header variant: back arrow (leading, slotted
 * content) + title + close. What a drilled-into chat shows while the tab bar
 * is hidden (rulings P-1/P-3).
 */
export const DrilledHeader: Story = {
  args: { frame: true },
  render: (args: { frame?: boolean }) => (
    <div style={{ width: '380px', height: '560px' }}>
      <Panel frame={args.frame}>
        <PanelHeader
          start={
            <Button variant="ghost" size="icon-sm" aria-label="Back">
              <ArrowLeft size={24} aria-hidden="true" />
            </Button>
          }
          end={<CloseButton />}
        >
          Aurora Support
        </PanelHeader>
        <PanelBody>
          <div class="flex flex-1 items-center justify-center p-5 text-sm text-muted-foreground">
            Thread view goes here
          </div>
        </PanelBody>
      </Panel>
    </div>
  ),
  ...src(`<Panel frame>
  <PanelHeader start={<BackButton />} end={<CloseButton />}>Aurora Support</PanelHeader>
  <PanelBody>Thread view goes here</PanelBody>
</Panel>`),
};

/**
 * Frameless (the default posture): the panel inherits its container's
 * radius and clips to it, exactly the shape the facade has inside
 * `<kai-dock>`'s already-framed floating panel. The wrapper here stands in
 * for the dock: it owns border, radius and shadow.
 */
export const FramelessInDock: Story = {
  render: () => (
    <div
      class="border border-border shadow-xl"
      style={{ width: '380px', height: '560px', 'border-radius': '16px' }}
    >
      <Panel>
        <PanelHeader end={<CloseButton />}>Aurora Support</PanelHeader>
        <PanelBody>
          <StubBody />
        </PanelBody>
      </Panel>
    </div>
  ),
  ...src(`{/* the wrapper owns border, radius, and shadow -- Panel just clips to it */}
<div class="rounded-2xl border border-border shadow-xl">
  <Panel>
    <PanelHeader end={<CloseButton />}>Aurora Support</PanelHeader>
    <PanelBody>...</PanelBody>
  </Panel>
</div>`),
};

/**
 * The chrome under an accent override: the CTA retints while the panel
 * surface stays on the neutral tokens, the outcome the spike's accent probe
 * measured once the chrome used kit tokens (phase 3, observation 12). For a
 * light-DOM subtree the documented knob is the `--color-*` value itself
 * (theme.css: "rebrand by overriding the --color-* values, optionally
 * scoped to a subtree"); the `--kai-color-*` spelling re-resolves inside
 * the shadow roots of the `kai-*` element facades, which is the phase-2
 * block driver's probe.
 *
 * The accent's LIGHTNESS is measured, not decorative. This story ships a
 * copy-pasteable accent recipe (it IS the Code tab's snippet), so the pair it
 * demonstrates has to be one a consumer can actually adopt. At the original
 * `oklch(0.62 0.25 330)` = #d231cb the near-white foreground declared beside
 * it is 3.99:1 — under WCAG AA's 4.5:1 for normal text, and axe failed the
 * CTA on exactly that. Same hue and chroma, four hundredths darker:
 * `oklch(0.58 0.25 330)` = #c41cbe measures 4.73:1. L=0.59 (4.52:1) is the
 * lightest that clears at all, so do not nudge this back up.
 */
export const AccentOverride: Story = {
  args: { frame: true },
  render: (args: { frame?: boolean }) => (
    <div style={{ width: '380px', height: '560px', '--color-primary': 'oklch(0.58 0.25 330)', '--color-primary-foreground': 'oklch(0.985 0 0)' }}>
      <Panel frame={args.frame}>
        <PanelHeader end={<CloseButton />}>Aurora Support</PanelHeader>
        <PanelBody>
          <StubBody />
        </PanelBody>
      </Panel>
    </div>
  ),
  ...src(`<div style={{ '--color-primary': 'oklch(0.58 0.25 330)', '--color-primary-foreground': 'oklch(0.985 0 0)' }}>
  <Panel frame>
    <PanelHeader end={<CloseButton />}>Aurora Support</PanelHeader>
    <PanelBody>...</PanelBody>
  </Panel>
</div>`),
};
