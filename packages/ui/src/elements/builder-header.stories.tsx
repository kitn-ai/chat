import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show, For } from 'solid-js';
import { SlidersHorizontal } from 'lucide-solid';
import { BuilderHeader } from '../components/builder-header';
import { Button } from '../ui/button';

// Labs/Builder: "Header" — story-first (owner policy: new visual surfaces
// get a stub-data story before any wiring). The full-width top bar for the
// `kai dev --builder` page: title · an obvious outline Switch-template
// button on the left, then the canvas light/dark toggle · primary Save on
// the right. The real wiring lives in `builder-app/App.tsx`; HERE the
// canvas toggle flips a stubbed preview region and Save just reports.
//
// The theme-builder entry point moved OUT of this header into the panel's
// Theme section (owner ruling 2026-08-31) — the stub panel column below
// shows it where it lives now: a subtle "Advanced" action right of the
// Theme section's title, opening the theme-studio takeover in the real app.
//
// Sits in Labs/Builder with the rest of the builder design suite (Start,
// Workspace, …) — the SolidJS-authored story, same as its siblings.
const meta = { title: 'Labs/Builder/Header', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// BuilderHeader is internal to the builder app (src/components/builder-header.tsx) -- it ships
// in no public @kitn.ai/ui entry point, so the snippet below shows real usage of the component
// itself rather than a package import.
const src = (code: string) => ({
  parameters: { docs: { source: { code, language: 'tsx' } } },
});

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
function HeaderDemo(props: { canvasDark?: boolean; saving?: boolean; saved?: boolean }) {
  const [canvasDark, setCanvasDark] = createSignal(props.canvasDark ?? false);
  const [lastAction, setLastAction] = createSignal<string | undefined>();

  return (
    <div class="flex h-dvh flex-col bg-background text-foreground" style={BRAND_STYLE}>
      <BuilderHeader
        title="Support workspace"
        onSwitchTemplate={() => setLastAction('switch-template (opens the template overlay)')}
        canvasDark={canvasDark()}
        onToggleCanvasDark={() => setCanvasDark((d) => !d)}
        onSave={() => setLastAction('save')}
        saving={props.saving}
        saved={props.saved}
      />
      <div class="grid min-h-0 flex-1 grid-cols-[320px_1fr]">
        {/* Panel stub — enough rows to read as the derived panel beside the canvas. */}
        <div class="flex flex-col gap-3 overflow-y-auto border-r border-border p-4">
          <For each={['Identity', 'Theme', 'Header', 'Capabilities', 'Provider']}>
            {(section) => (
              <div class="flex flex-col gap-2 rounded-md border border-border p-3">
                <div class="flex min-h-5 items-center justify-between gap-2">
                  <span class="text-xs font-semibold text-foreground">{section}</span>
                  {/* Where the theme-builder entry point lives now: the Theme
                      section's own header action, not the page chrome. */}
                  <Show when={section === 'Theme'}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="-my-1 h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => setLastAction('advanced (opens the theme-studio takeover)')}
                      data-builder-theme-advanced
                    >
                      <SlidersHorizontal size={12} aria-hidden="true" />
                      Advanced
                    </Button>
                  </Show>
                </div>
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
    </div>
  );
}

/** The full header over the stubbed builder body. Click the moon to flip the
 *  preview canvas to dark while the chrome stays put; the Theme section's
 *  "Advanced" (in the stub panel column) is where the theme builder opens. */
export const Header: Story = {
  render: () => <HeaderDemo />,
  ...src(`<BuilderHeader
  title="Support workspace"
  onSwitchTemplate={() => openTemplateOverlay()}
  canvasDark={canvasDark}
  onToggleCanvasDark={() => setCanvasDark((d) => !d)}
  onSave={() => save()}
/>`),
};

/** The canvas pre-flipped to dark — the state the toggle exists for, shown
 *  without needing to click first. The header shows the Sun ("tap for
 *  light"). */
export const DarkCanvas: Story = {
  render: () => <HeaderDemo canvasDark />,
  ...src(`<BuilderHeader title="Support workspace" canvasDark onToggleCanvasDark={() => setCanvasDark((d) => !d)} onSave={save} />`),
};

/** Save mid-write: disabled, label swapped. */
export const Saving: Story = {
  render: () => <HeaderDemo saving />,
  ...src(`<BuilderHeader title="Support workspace" saving onSave={save} />`),
};

/** Everything persisted: Save disabled and labeled "Saved" — the honest
 *  resting state for a page that autosaves (the real builder debounces its
 *  writes; Save only arms while one is pending, and clicking it flushes the
 *  debounce early). */
export const Saved: Story = {
  render: () => <HeaderDemo saved />,
  ...src(`<BuilderHeader title="Support workspace" saved onSave={save} />`),
};
