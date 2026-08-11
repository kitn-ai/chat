import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { type JSX } from 'solid-js';
import { PromptDock } from './prompt-dock';
import { PromptInput, PromptInputTextarea, PromptInputActions } from '../components/prompt-input';
import { Button } from './button';
import { componentDescription } from '../stories/docs/element-controls';

// --- Story helpers -------------------------------------------------------

/** A real PromptInput, used as the raised card inside the dock for realism. */
const DockedInput = () => (
  <PromptInput>
    <PromptInputTextarea placeholder="Ask anything..." />
    <PromptInputActions class="w-full justify-end px-1 pb-0.5">
      <Button variant="default" size="sm">Send</Button>
    </PromptInputActions>
  </PromptInput>
);

/** A small bordered pill control, the look used by the reference mode rows. */
const Pill = (props: { children: JSX.Element }) => (
  <button
    type="button"
    class="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
  >
    {props.children}
  </button>
);

const meta = {
  title: 'Components/Elements/Prompt Dock',
  component: PromptDock,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A recessed tray that frames a prompt input and can extend with optional "lip" regions above and/or below it. The input stays the prominent, fully-rounded raised card; the lips sit in a slightly darker recessed band that shares the tray rounding, so the whole thing reads as one control. Slot a banner or hint into `top`, a mode / control row into `bottom`; with neither, only the input shows.',
      ]),
    },
  },
  argTypes: {
    top: { control: false, description: 'Recessed band above the input (a notice or hint).' },
    bottom: { control: false, description: 'Recessed band below the input (a mode / control row).' },
    frame: {
      control: 'inline-radio',
      options: ['inset', 'edge', 'none'],
      description:
        'Spatial inset: `inset` (inset on all edges, default), `edge` (top/bottom inset only, input flush left/right), or `none` (no inset).',
    },
    appearance: {
      control: 'inline-radio',
      options: ['soft', 'outlined', 'filled', 'plain'],
      description:
        'Tray surface: `soft` (sunken fill + border, default), `outlined` (border only), `filled` (fill only), or `plain` (bare — no fill, border, or radius).',
    },
    children: { control: false, description: 'The prompt input - the raised card on the tray.' },
    class: { control: 'text', description: 'Extra classes for the outer tray.' },
  },
  render: () => (
    <div class="max-w-xl">
      <PromptDock>
        <DockedInput />
      </PromptDock>
    </div>
  ),
} satisfies Meta<typeof PromptDock>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { PromptDock, PromptInput, PromptInputTextarea, PromptInputActions, Button } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** No top or bottom slotted: the dock collapses to just the input, with the tray
 *  showing only as a thin frame around the card. */
export const InputOnly: Story = {
  name: 'Input Only',
  render: () => (
    <div class="max-w-xl">
      <PromptDock>
        <DockedInput />
      </PromptDock>
    </div>
  ),
  ...src(`<PromptDock>
  <PromptInput>
    <PromptInputTextarea placeholder="Ask anything..." />
    <PromptInputActions class="w-full justify-end px-1 pb-0.5">
      <Button variant="default" size="sm">Send</Button>
    </PromptInputActions>
  </PromptInput>
</PromptDock>`),
};

/** Codex-style: a single bottom lip with a project picker pill. */
export const BottomLip: Story = {
  name: 'Bottom Lip',
  render: () => (
    <div class="max-w-xl">
      <PromptDock
        bottom={
          <div class="flex items-center gap-2">
            <Pill>Work in a project ▾</Pill>
          </div>
        }
      >
        <DockedInput />
      </PromptDock>
    </div>
  ),
  ...src(`<PromptDock
  bottom={
    <div class="flex items-center gap-2">
      <Pill>Work in a project ▾</Pill>
    </div>
  }
>
  <PromptInput>
    <PromptInputTextarea placeholder="Ask anything..." />
    <PromptInputActions class="w-full justify-end px-1 pb-0.5">
      <Button variant="default" size="sm">Send</Button>
    </PromptInputActions>
  </PromptInput>
</PromptDock>`),
};

/** Claude Code-style: a top notice banner and a bottom mode row with a trailing
 *  usage hint. The two lips are styled INDEPENDENTLY via `topClass` / `bottomClass`
 *  - a warning-tinted attention surface up top over a neutral control row below -
 *  while both still tuck around the raised input. */
export const TopAndBottom: Story = {
  name: 'Top And Bottom',
  render: () => (
    <div class="max-w-xl">
      <PromptDock
        topClass="rounded-2xl bg-tool-amber/10 text-tool-amber"
        bottomClass="rounded-2xl bg-surface"
        top={
          <div class="flex items-center gap-2">
            <span>Claude Fable 5 is currently unavailable.</span>
            <a href="#" class="font-medium underline-offset-2 hover:underline">Learn more</a>
            <button type="button" aria-label="Dismiss" class="ml-auto rounded p-0.5 text-muted-foreground opacity-70 hover:text-foreground hover:opacity-100">✕</button>
          </div>
        }
        bottom={
          <div class="flex items-center gap-2">
            <Pill>Project or folder ▾</Pill>
            <Pill>Ask ▾</Pill>
            <span class="ml-auto text-xs text-muted-foreground">⚡ 2x more usage until July 5</span>
          </div>
        }
      >
        <DockedInput />
      </PromptDock>
    </div>
  ),
  ...src(`<PromptDock
  // A warning-tinted attention surface up top, a neutral control row below -
  // each lip is styled independently via topClass / bottomClass (theme tokens only).
  topClass="rounded-2xl bg-tool-amber/10 text-tool-amber"
  bottomClass="rounded-2xl bg-surface"
  top={
    <div class="flex items-center gap-2">
      <span>Claude Fable 5 is currently unavailable.</span>
      <a href="#" class="font-medium hover:underline">Learn more</a>
      <button type="button" aria-label="Dismiss" class="ml-auto text-muted-foreground hover:text-foreground">✕</button>
    </div>
  }
  bottom={
    <div class="flex items-center gap-2">
      <Pill>Project or folder ▾</Pill>
      <Pill>Ask ▾</Pill>
      <span class="ml-auto text-xs text-muted-foreground">⚡ 2x more usage until July 5</span>
    </div>
  }
>
  <PromptInput>
    <PromptInputTextarea placeholder="Ask anything..." />
    <PromptInputActions class="w-full justify-end px-1 pb-0.5">
      <Button variant="default" size="sm">Send</Button>
    </PromptInputActions>
  </PromptInput>
</PromptDock>`),
};

/** The three `frame` variants stacked, each with a top notice and a bottom control
 *  row so the difference is obvious: `inset` frames the input on every edge, `edge`
 *  runs the lips full-width with the input flush left/right, and `none` drops the
 *  tray chrome entirely for a plain stack. */
export const Frames: Story = {
  render: () => {
    const Notice = () => (
      <div class="flex items-center gap-2">
        <span>Heads up - context is getting long.</span>
      </div>
    );
    const Controls = () => (
      <div class="flex items-center gap-2">
        <Pill>Project or folder ▾</Pill>
        <Pill>Ask ▾</Pill>
      </div>
    );
    const Caption = (props: { children: JSX.Element }) => (
      <p class="mb-1.5 text-xs font-medium text-muted-foreground">{props.children}</p>
    );
    return (
      <div class="flex max-w-xl flex-col gap-8">
        <div>
          <Caption>frame="inset" - recessed frame on every edge (default)</Caption>
          <PromptDock frame="inset" top={<Notice />} bottom={<Controls />}>
            <DockedInput />
          </PromptDock>
        </div>
        <div>
          <Caption>frame="edge" - full-width lips, input flush left/right</Caption>
          <PromptDock frame="edge" top={<Notice />} bottom={<Controls />}>
            <DockedInput />
          </PromptDock>
        </div>
        <div>
          <Caption>frame="none" appearance="plain" - no inset, no chrome (a bare stack)</Caption>
          <PromptDock frame="none" appearance="plain" top={<Notice />} bottom={<Controls />}>
            <DockedInput />
          </PromptDock>
        </div>
      </div>
    );
  },
  ...src(`// frame is the SPATIAL axis (inset only); pair frame="none" with appearance="plain"
// for a truly bare stack. inset (default): inset on every edge - edge: top/bottom only,
// input flush left/right - none: no inset.
<PromptDock frame="inset" top={<Notice />} bottom={<Controls />}>
  <PromptInput>
    <PromptInputTextarea placeholder="Ask anything..." />
    <PromptInputActions class="w-full justify-end px-1 pb-0.5">
      <Button variant="default" size="sm">Send</Button>
    </PromptInputActions>
  </PromptInput>
</PromptDock>

<PromptDock frame="edge" top={<Notice />} bottom={<Controls />}>
  {/* ...same PromptInput... */}
</PromptDock>

<PromptDock frame="none" appearance="plain" top={<Notice />} bottom={<Controls />}>
  {/* ...same PromptInput... */}
</PromptDock>

// Fine-tune the chrome from outside via CSS custom properties:
//   --kai-prompt-dock-surface  (tray background, default var(--color-surface-sunken))
//   --kai-prompt-dock-border   (tray border color, default var(--color-border))
//   --kai-prompt-dock-radius   (outer radius, default 1.25rem)
//   --kai-prompt-dock-inset    (frame thickness, default 0.375rem)`),
};

/** The four `appearance` variants stacked, each with `frame="inset"` and a top notice
 *  + a bottom control row, so the surface differences read clearly: `soft` (fill +
 *  border), `outlined` (border only), `filled` (fill only), and `plain` (bare). The
 *  inset is held constant - this axis is orthogonal to `frame`. */
export const Appearances: Story = {
  render: () => {
    const Notice = () => (
      <div class="flex items-center gap-2">
        <span>Heads up - context is getting long.</span>
      </div>
    );
    const Controls = () => (
      <div class="flex items-center gap-2">
        <Pill>Project or folder ▾</Pill>
        <Pill>Ask ▾</Pill>
      </div>
    );
    const Caption = (props: { children: JSX.Element }) => (
      <p class="mb-1.5 text-xs font-medium text-muted-foreground">{props.children}</p>
    );
    return (
      <div class="flex max-w-xl flex-col gap-8">
        <div>
          <Caption>appearance="soft" - sunken fill + border (default)</Caption>
          <PromptDock frame="inset" appearance="soft" top={<Notice />} bottom={<Controls />}>
            <DockedInput />
          </PromptDock>
        </div>
        <div>
          <Caption>appearance="outlined" - border only, transparent fill</Caption>
          <PromptDock frame="inset" appearance="outlined" top={<Notice />} bottom={<Controls />}>
            <DockedInput />
          </PromptDock>
        </div>
        <div>
          <Caption>appearance="filled" - sunken fill, no border</Caption>
          <PromptDock frame="inset" appearance="filled" top={<Notice />} bottom={<Controls />}>
            <DockedInput />
          </PromptDock>
        </div>
        <div>
          <Caption>appearance="plain" - bare: no fill, border, or radius</Caption>
          <PromptDock frame="inset" appearance="plain" top={<Notice />} bottom={<Controls />}>
            <DockedInput />
          </PromptDock>
        </div>
      </div>
    );
  },
  ...src(`// appearance is the SURFACE axis (background / border / radius), orthogonal to frame.
// soft (default): fill + border - outlined: border only - filled: fill only - plain: bare
<PromptDock frame="inset" appearance="soft" top={<Notice />} bottom={<Controls />}>
  <PromptInput>
    <PromptInputTextarea placeholder="Ask anything..." />
    <PromptInputActions class="w-full justify-end px-1 pb-0.5">
      <Button variant="default" size="sm">Send</Button>
    </PromptInputActions>
  </PromptInput>
</PromptDock>

<PromptDock frame="inset" appearance="outlined" top={<Notice />} bottom={<Controls />}>
  {/* ...same PromptInput... */}
</PromptDock>

<PromptDock frame="inset" appearance="filled" top={<Notice />} bottom={<Controls />}>
  {/* ...same PromptInput... */}
</PromptDock>

<PromptDock frame="inset" appearance="plain" top={<Notice />} bottom={<Controls />}>
  {/* ...same PromptInput... */}
</PromptDock>`),
};
