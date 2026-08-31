/**
 * `BuilderHeader` — the full-width top bar for the `kai dev --builder` page
 * (story-first, stub round 2026-08-31; wired into `builder-app/App.tsx` the
 * same day — the page is the one real caller, the story keeps the stub).
 *
 * WHY NOT `AppHeader`: that component's arrangement is a fixed owner ruling
 * for the WORKSPACE app strip (title · search/theme · authored actions ·
 * user cluster) and its own doc comment forbids reconfiguring it. The
 * builder's chrome is a different surface with different verbs — switch the
 * template, open the theme builder, flip the preview canvas's mode, save —
 * so this is a sibling built from the same primitives (`ui/button`,
 * `ui/separator`, `ui/tooltip`, lucide-solid icons) at the same scale
 * (h-12 strip, border-b, own bg-background floor — see AppHeader's note on
 * why the strip paints its own floor).
 *
 * Left to right:
 *
 *     [ title · Switch template ]        [ Theme builder · sun/moon ] | [ Save ]
 *
 *  - the construct/template TITLE on the left;
 *  - "Switch template" beside it as an OBVIOUS button — outline variant with
 *    an icon + label. The defect being fixed: the panel's old control was a
 *    bare ghost button that did not read as a button at all;
 *  - a theme-builder button (icon + label) that opens a modal — the modal is
 *    the CALLER's (menu-honesty: this component only reports the click);
 *  - the canvas light/dark toggle: icon-only, showing the mode you would
 *    switch TO (AppHeader's own rule — Sun while dark, Moon while light).
 *    This flips the PREVIEW CANVAS's theme so an author can test a design in
 *    both modes; it is CONTROLLED here, never owned — the builder page owns
 *    what "the canvas theme" means;
 *  - a divider, then the primary Save button, rightmost.
 *
 * MENU-HONESTY (the repo's standing rule, same shape as AppHeader): every
 * affordance is gated on its mechanism. No `onSwitchTemplate` → no Switch
 * button; no `onOpenThemeBuilder` → no theme-builder button; no
 * `onToggleCanvasDark` → no mode toggle; no `onSave` → no Save. Dividers
 * render only between two groups that both have visible content.
 */
import { type JSX, Show } from 'solid-js';
import { LayoutTemplate, Palette, Sun, Moon } from 'lucide-solid';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { Tooltip } from '../ui/tooltip';

export interface BuilderHeaderProps {
  /** The construct/template name, rendered on the LEFT. */
  title?: string;
  /** Optional small status chip beside the title (e.g. "preview starting…"). */
  status?: string;

  /** Opens the switch-template overlay. Renders the button only when given. */
  onSwitchTemplate?: () => void;

  /** Opens the theme-builder modal. Renders the button only when given. */
  onOpenThemeBuilder?: () => void;

  /** Current resolved mode of the PREVIEW CANVAS — controlled, never owned
   *  here. Drives which icon shows (the mode you would switch TO) and the
   *  accessible name. */
  canvasDark?: boolean;
  /** Flips the preview canvas's theme. Renders the toggle only when given. */
  onToggleCanvasDark?: () => void;

  /** The primary Save action, rightmost. Renders only when given. */
  onSave?: () => void;
  /** Disables Save and swaps its label (e.g. mid-write). */
  saving?: boolean;
  /** Everything already persisted: disables Save and labels it "Saved" —
   *  the honest state for a page that autosaves (the builder debounces its
   *  POSTs; Save is only ACTIVE while a write is pending, and clicking it
   *  flushes the debounce, never a second persistence path). `saving`
   *  takes precedence. */
  saved?: boolean;

  class?: string;
}

export function BuilderHeader(props: BuilderHeaderProps): JSX.Element {
  const themeVisible = (): boolean => !!props.onOpenThemeBuilder;
  const toggleVisible = (): boolean => !!props.onToggleCanvasDark;
  const utilityVisible = (): boolean => themeVisible() || toggleVisible();
  const saveVisible = (): boolean => !!props.onSave;

  const toggleLabel = (): string =>
    props.canvasDark ? 'Preview canvas: switch to light mode' : 'Preview canvas: switch to dark mode';

  return (
    <header
      class={cn(
        'flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4',
        props.class,
      )}
      data-kai-builder-header
    >
      <div class="flex min-w-0 items-center gap-3">
        <Show when={props.title}>
          <span class="truncate text-sm font-semibold text-foreground" data-kai-builder-header-title>
            {props.title}
          </span>
        </Show>
        <Show when={props.status}>
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{props.status}</span>
        </Show>
        <Show when={props.onSwitchTemplate}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => props.onSwitchTemplate?.()}
            data-kai-builder-header-switch
          >
            <LayoutTemplate size={14} aria-hidden="true" />
            Switch template
          </Button>
        </Show>
      </div>

      <div class="flex items-center gap-2">
        <Show when={utilityVisible()}>
          <div class="flex items-center gap-1" data-kai-builder-header-utility>
            <Show when={themeVisible()}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => props.onOpenThemeBuilder?.()}
                data-kai-builder-header-theme
              >
                <Palette size={14} aria-hidden="true" />
                Theme builder
              </Button>
            </Show>
            <Show when={toggleVisible()}>
              <Tooltip content={toggleLabel()}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={toggleLabel()}
                  onClick={() => props.onToggleCanvasDark?.()}
                  data-kai-builder-header-canvas-toggle
                >
                  {props.canvasDark ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
                </Button>
              </Tooltip>
            </Show>
          </div>
        </Show>

        <Show when={utilityVisible() && saveVisible()}>
          <Separator orientation="vertical" class="h-5" />
        </Show>

        <Show when={saveVisible()}>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={props.saving || props.saved}
            onClick={() => props.onSave?.()}
            data-kai-builder-header-save
          >
            {props.saving ? 'Saving…' : props.saved ? 'Saved' : 'Save'}
          </Button>
        </Show>
      </div>
    </header>
  );
}
