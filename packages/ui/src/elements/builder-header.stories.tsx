import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show, For } from 'solid-js';
import { BuilderHeader } from '../components/builder-header';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

// Labs/Builder: "Header" — story-first (owner policy: new visual surfaces
// get a stub-data story before any wiring). The full-width top bar for the
// `kai dev --builder` page. Today the panel's chrome is a 380px-column
// header row whose "Switch template" is a bare ghost button that does not
// read as a button; this design moves the chrome into ONE strip across the
// whole builder: title · an obvious outline Switch-template button on the
// left, then theme-builder · canvas light/dark toggle · primary Save on the
// right. Nothing here is wired into `builder-app/App.tsx` yet — the theme
// builder opens a stub modal, the canvas toggle flips a stubbed preview
// region, Save just reports.
//
// Sits in Labs/Builder with the rest of the builder design suite (Start,
// Workspace, …) — the SolidJS-authored story, same as its siblings.
const meta = { title: 'Labs/Builder/Header', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// The AI/UI brand magenta — the same one-off "and here, brand it" every
// builder story applies (see builder-start.stories.tsx for why it sets
// `--color-primary` directly rather than the `--kai-color-primary`
// indirection: the indirection only re-resolves where `--color-primary`
// itself is declared, so setting it on a descendant div never lands).
const BRAND_STYLE = { '--color-primary': '#EC2295' } as const;

/** The header over a stubbed builder body: a fixed panel column and a
 *  preview CANVAS. The canvas is the thing the light/dark toggle flips —
 *  `classList={{ dark }}` scopes `theme.css`'s `.dark` token block to just
 *  that region (the same move builder-workspace.stories.tsx's preview frame
 *  makes), so an author can test a design in both modes while the builder
 *  chrome around it stays in the page theme. */
function HeaderDemo(props: { canvasDark?: boolean; saving?: boolean }) {
  const [canvasDark, setCanvasDark] = createSignal(props.canvasDark ?? false);
  const [themeOpen, setThemeOpen] = createSignal(false);
  const [lastAction, setLastAction] = createSignal<string | undefined>();

  return (
    <div class="flex h-dvh flex-col bg-background text-foreground" style={BRAND_STYLE}>
      <BuilderHeader
        title="Support workspace"
        onSwitchTemplate={() => setLastAction('switch-template (opens the template overlay)')}
        onOpenThemeBuilder={() => setThemeOpen(true)}
        canvasDark={canvasDark()}
        onToggleCanvasDark={() => setCanvasDark((d) => !d)}
        onSave={() => setLastAction('save')}
        saving={props.saving}
      />
      <div class="grid min-h-0 flex-1 grid-cols-[320px_1fr]">
        {/* Panel stub — enough rows to read as the derived panel beside the canvas. */}
        <div class="flex flex-col gap-3 overflow-y-auto border-r border-border p-4">
          <For each={['Identity', 'Theme', 'Header', 'Capabilities', 'Provider']}>
            {(section) => (
              <div class="flex flex-col gap-2 rounded-md border border-border p-3">
                <span class="text-xs font-semibold text-foreground">{section}</span>
                <div class="h-2 w-2/3 rounded bg-muted" />
                <div class="h-2 w-1/2 rounded bg-muted" />
              </div>
            )}
          </For>
          <Show when={lastAction()}>
            <p class="text-xs text-muted-foreground" data-last-action>last action: {lastAction()}</p>
          </Show>
        </div>
        {/* The preview CANVAS — the region the header's sun/moon flips.
            BRAND_STYLE repeats INLINE on this node deliberately: theme.css's
            `.dark` block re-declares `--color-primary` on whatever carries
            the class, which beats the value inherited from the frame — found
            live in this story's first capture (a neutral-black user bubble in
            the dark canvas). Inline style outranks the class, both modes stay
            magenta. */}
        <div classList={{ dark: canvasDark() }} class="min-h-0" style={BRAND_STYLE}>
          <div class="flex h-full flex-col bg-background p-6 text-foreground">
            <div class="mx-auto flex w-full max-w-xl flex-1 flex-col justify-end gap-3">
              <div class="self-start rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                Hi! How can I help you today?
              </div>
              <div class="self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                Where is my order?
              </div>
              <div class="self-start rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                Let me look that up for you.
              </div>
              <div class="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <span class="flex-1 text-sm text-muted-foreground">Type a message…</span>
                <Button size="sm">Send</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Theme-builder modal — stub open state only; the controls land in a
          later round. */}
      <Dialog
        open={themeOpen()}
        onOpenChange={setThemeOpen}
        header="Theme builder"
        class="max-w-2xl"
        footer={<Button variant="outline" size="sm" onClick={() => setThemeOpen(false)}>Close</Button>}
      >
        <p class="text-sm text-muted-foreground">Theme controls land here — accent, mode, radius, typography.</p>
      </Dialog>
    </div>
  );
}

/** The full header over the stubbed builder body. Click the moon to flip the
 *  preview canvas to dark while the chrome stays put; "Theme builder" opens
 *  the stub modal. */
export const Header: Story = {
  render: () => <HeaderDemo />,
};

/** The canvas pre-flipped to dark — the state the toggle exists for, shown
 *  without needing to click first. The header shows the Sun ("tap for
 *  light"). */
export const DarkCanvas: Story = {
  render: () => <HeaderDemo canvasDark />,
};

/** Save mid-write: disabled, label swapped. */
export const Saving: Story = {
  render: () => <HeaderDemo saving />,
};
