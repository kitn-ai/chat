import { type JSX, For } from 'solid-js';
import { cn } from '../utils/cn';
import { Card } from '../ui/card';
import { TEMPLATES, type TemplateId } from '../../mcp/construct/templates';

// ─────────────────────────────────────────────────────────────────────────────
// The template picker's data — T-3/T-4 (docs/superpowers/specs/
// 2026-08-28-template-builder-design.md): a template is DATA (a starter
// construct + a control manifest), not schema vocabulary, and its public
// name is a NEUTRAL one — "Support widget", not "Intercom-style widget". The
// starter-construct/control-manifest half doesn't exist yet (that's Round W
// onward, per-template); this round only needs the identity — id, name,
// one-liner — for the picker to be real.
// ─────────────────────────────────────────────────────────────────────────────

// 'scratch' is NOT a template — no illustration, no card, no entry in
// `BUILDER_TEMPLATES` below. It's the "Start from scratch" row rendered
// under the grid (owner amendment, live review): visually a quiet, link-
// weight text action rather than a seventh card, but it fires `onSelect`
// with this id the same way a card fires with its own, so the id belongs
// in the same union `onSelect` is typed over.
// 'scratch' is NOT a template — no illustration, no card, no registry entry.
export type BuilderTemplateId = TemplateId | 'scratch';

/** The template ids that DO have a card — every registry id. */
export type BuilderCardTemplateId = TemplateId;

export interface BuilderTemplate {
  id: BuilderCardTemplateId;
  name: string;
  description: string;
}

/** All six cards, DERIVED from the template registry (B-17b) — id, name and
 *  one-liner are the registry's own; this module adds only the
 *  illustrations, which stay component-side keyed by id (SVGs are not
 *  registry data). The Labs story renders all six (T-1a); a real product
 *  surface renders BUILDABLE_BUILDER_TEMPLATES instead (menu-honesty). */
export const BUILDER_TEMPLATES: readonly BuilderTemplate[] = TEMPLATES.map(
  ({ id, name, description }) => ({ id, name, description }),
);

export const BUILDABLE_BUILDER_TEMPLATES: readonly BuilderTemplate[] = TEMPLATES.filter(
  (t) => t.availability === 'buildable',
).map(({ id, name, description }) => ({ id, name, description }));

export interface BuilderStartProps {
  /** The currently selected template id, or unset for none yet. Controlled —
   *  this component holds no selection state of its own. */
  value?: BuilderTemplateId;
  /**
   * Fires with a template's id when its card is chosen. Click-to-advance
   * (design choice, this round): T-7 says "selection advances to that
   * template's builder", and there is nothing a second "Continue" step
   * would add here that the click itself doesn't already mean — a
   * disambiguating confirm step belongs to T-2's SWITCHING-template case
   * (control set changes, so a re-pick needs a confirm), not to picking a
   * template for the first time. So `onSelect` fires on the same click that
   * shows the selected ring; the story's Continue readout below just proves
   * the callback fired, since there's no template builder screen yet to
   * navigate to.
   */
  onSelect: (id: BuilderTemplateId) => void;
  /** Which cards to render. Defaults to BUILDABLE_BUILDER_TEMPLATES
   *  (menu-honest by default). The Labs story passes BUILDER_TEMPLATES (all
   *  six) explicitly to show the full catalog. */
  templates?: readonly BuilderTemplate[];
  class?: string;
}

// The dotted-canvas motif from `builder-layout.tsx`'s preview pane, reused at
// a smaller scale behind each illustration — a deliberate, cheap echo of the
// "blueprint" idea (a technical drawing over graph paper) rather than a new
// texture invented for this screen alone.
export const BLUEPRINT_BG = {
  'background-image': 'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
  'background-size': '14px 14px',
} as const;

/**
 * `BuilderStart` — the builder's opening screen: six selectable template
 * cards (T-7, grown from four in Round P2). Each card is a real
 * `ui/card.tsx` `Card` (`clickable`,
 * `media` for the illustration, `header` for the name), not a hand-rolled
 * button — the kit's own primitive already gives a `role="button"` with
 * Enter/Space activation, which settles this screen's keyboard-semantics
 * question: a `radiogroup` was the other defensible reading (this IS a
 * single choice among six), but `Card` already implements exactly the
 * button-per-card pattern with no extra wiring, and reusing it beats
 * building a second selection primitive for one screen.
 *
 * Brand alignment (T-7): the kit's own tokens throughout — no new color, no
 * new radius, no new type stack. The illustrations are the one genuinely new
 * visual element this round adds; see `TEMPLATE_ILLUSTRATIONS` below for
 * their shared style rules.
 */
export function BuilderStart(props: BuilderStartProps): JSX.Element {
  const scratchSelected = () => props.value === 'scratch';
  return (
    // A fragment, not a single root, as of the "Start from scratch" row
    // (owner amendment, live review): `data-builder-start` stays on the
    // GRID only (unchanged meaning — the existing tests key off it, and
    // its own "no part= attribute" assertion is about the grid, not this
    // whole screen), with the scratch row as a second, sibling element
    // rather than nested inside the grid it deliberately isn't part of.
    <>
      {/* Three per row on desktop (`lg:grid-cols-3`), two mid-width
          (`sm:grid-cols-2`), one narrow — all three classes confirmed
          present in the checked-in compiled.css this live Storybook serves
          (see the grep note by `TEMPLATE_ILLUSTRATIONS` below); an
          arbitrary-value `minmax()` class would NOT be, so the responsive
          step-down uses the kit's existing breakpoint scale instead of a
          true fluid minmax track. */}
      {/* Ring-color fix (owner flag from Round P2): `Card` itself already
          does the right generic thing — `focus-visible:outline-none
          focus-visible:ring-2 focus-visible:ring-ring` suppresses the
          browser's own outline and substitutes ITS OWN visible ring, never
          removing focus indication. The bug was downstream of that, not in
          it: a SELECTED card here also carries a permanent `ring-primary`,
          and `.focus-visible\:ring-ring:focus-visible` (class + pseudo)
          outranks the plain `.ring-primary` (class only) in specificity,
          so on `:focus-visible` — which Chromium grants to a `clickable`
          `Card` (a `div[role=button]`, not a native `<button>`) on BOTH a
          keyboard Enter/Space AND a script/pointer `.click()`, confirmed
          live via Playwright — Card's own default `--color-ring` (a
          neutral blue, unrelated to this story's brand-magenta
          `--color-primary`) won regardless of selection. `!ring-primary`
          and `focus-visible:ring-primary` are real Tailwind utilities but
          NEITHER is in the checked-in compiled.css this live Storybook
          serves (same constraint as every class-must-already-exist note
          elsewhere in this file), so raw CSS injected the same way Card
          injects its own per-instance rules — not a new Tailwind class —
          is the honest fix here: this rule sits ONLY on `[aria-pressed=
          "true"]`, so it recolors the ring precisely where selection
          already claims it and leaves every other card's focus ring
          (still visible, just the kit's default color) alone. */}
      <style>{'[data-builder-start] [aria-pressed="true"]{--tw-ring-color:var(--color-primary) !important}'}</style>
      <div class={cn('grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3', props.class)} data-builder-start>
      <For each={props.templates ?? BUILDABLE_BUILDER_TEMPLATES}>
        {(template) => {
          const selected = () => props.value === template.id;
          const Illustration = TEMPLATE_ILLUSTRATIONS[template.id];
          return (
            <Card
              appearance="outlined"
              clickable
              aria-pressed={selected()}
              onCardClick={() => props.onSelect(template.id)}
              hasBody
              class={cn(
                'text-left transition-shadow',
                // `ring-primary` bare, NOT `ring-primary/50` — the opacity-
                // modified variant isn't in the checked-in compiled.css this
                // live (not-restarted) Storybook serves, and only whole
                // utility classes ALREADY present in that file render
                // without a rebuild (see the illustrations' own note above).
                selected() ? 'border-primary ring-2 ring-primary' : 'hover:border-ring hover:shadow-md',
              )}
              media={
                // `h-44`, not `h-40`/`h-48` at random — bigger cards (P2)
                // give the illustration more of the card's canvas; `h-44`
                // is confirmed present in the checked-in compiled.css (same
                // class-must-already-exist constraint as everywhere else in
                // this file).
                <div class="flex h-44 items-center justify-center p-4" style={BLUEPRINT_BG}>
                  <Illustration />
                </div>
              }
            >
              {/* Title + one-liner as one `hasBody` block, NOT split across
                  Card's `header`/body slots — those two sections are
                  separated by `var(--kai-card-spacing)` (Card's own,
                  shared-across-the-kit gap), which read as too loose for a
                  name-plus-one-liner pairing that belongs visually
                  together (owner amendment, live review). `gap-1` here is
                  local to this one block, so it tightens only this pairing
                  without touching `ui/card.tsx`'s shared spacing. */}
              <div class="flex flex-col gap-1">
                {/* h2, not h3: the start screen's own page heading is an h1
                    ("Choose a starting point"), and these card titles sit
                    directly under it — h3 skips a level (axe heading-order). */}
                <h2 class="text-sm font-semibold text-foreground">{template.name}</h2>
                {/* `text-sm`, not `text-xs` (owner amendment) — bumped up a
                    notch for readability at the larger card size; `leading-
                    snug` keeps line-height comfortable at the new size
                    rather than the tighter default. Both classes confirmed
                    present in the checked-in compiled.css this live
                    Storybook serves. */}
                <p class="text-sm leading-snug text-muted-foreground">{template.description}</p>
              </div>
            </Card>
          );
        }}
      </For>
      </div>
      {/* "Start from scratch" — link-weight, not a seventh card (owner
          amendment): a plain `<button>`, styled muted/small rather than as
          a `Card`, so it reads as subordinate to the grid above it. Still
          fully keyboard-operable (a real `<button>` needs no extra wiring
          for Enter/Space, unlike `Card`'s hand-rolled `role="button"`) and
          participates in selection the same way a card does — `onSelect`
          fires with `'scratch'`, and `aria-pressed` reflects `value` — it
          just has no ring/illustration of its own to show it, muted text
          turning to foreground text being the one selected-state cue this
          quieter control gets. */}
      <button
        type="button"
        aria-pressed={scratchSelected()}
        onClick={() => props.onSelect('scratch')}
        class={cn(
          'mx-auto mt-6 flex flex-col items-center gap-0.5 rounded text-center transition-colors',
          scratchSelected() ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span class="text-sm font-medium underline-offset-4 hover:underline">Start from scratch</span>
        <span class="text-xs">A bare chat, everything off. You can switch to a template later.</span>
      </button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Illustrations (T-7's actual deliverable) — blueprint/outline line drawings,
// one per template, all sharing:
//  - one consistent 160×100 viewBox and stroke language (1.5px strokes,
//    rounded joins/caps, rounded rect corners at the kit's own small radius);
//  - `--color-border`/`--color-muted-foreground` for every generic shape
//    (page chrome, host content, other UI) — the kit's OWN theme tokens, so
//    these are theme-aware for free and were checked in both light and dark;
//  - `--color-primary` used SPARINGLY, reserved for the one shape that IS
//    this kit's chat surface in each drawing (the floating panel for
//    Support widget, the centered thread for Assistant, the answer column
//    for Research, the chat rail for Workspace) — everything ELSE in a
//    drawing (host page, other app content, a sources list) stays muted on
//    purpose, so the accent visually answers "which part is the kit's."
//  - plain `<rect>`/`<line>`/`<circle>` only, no curves/paths — kept
//    hand-authorable and small, per the brief.
// All six are `aria-hidden` (decorative; the card's own name/description
// carry the meaning) and take no props — static drawings, not data-driven.
//
// STYLED VIA INLINE `style`, NOT Tailwind `stroke-*`/`fill-*` utility
// classes — deliberately, not a style preference. `stroke-border`/
// `fill-primary`/etc. are class names that appear NOWHERE ELSE in the tree,
// so they don't exist in the checked-in `compiled.css` this repo's own
// CLAUDE.md warns about ("stale compiled.css needs a Storybook restart,
// say so instead of restarting yourself" — the exact standing instruction
// on this branch). Confirmed live: the first version of this file used
// those classes and every shape rendered as a solid black rectangle in the
// running (not-restarted) Storybook — unstyled `fill`/`stroke` fall back to
// the SVG default (`fill: black`, `stroke: none`), which reads as "the
// illustration is just a black box." Inline `style` reading the CSS custom
// properties directly needs no Tailwind class to exist in advance, so it
// renders correctly with zero rebuild — the honest fix given the
// don't-restart constraint, not a workaround around it.
// ─────────────────────────────────────────────────────────────────────────────

export const STROKE = 1.5;
export const LINE = { stroke: 'var(--color-muted-foreground)', fill: 'none' };
export const BORDER = { stroke: 'var(--color-border)', fill: 'none' };
export const ACCENT = { stroke: 'var(--color-primary)', fill: 'none' };
export const ACCENT_FILL = { stroke: 'none', fill: 'var(--color-primary)' };

function WidgetIllustration(): JSX.Element {
  return (
    <svg viewBox="0 0 160 100" class="h-full w-full" aria-hidden="true">
      {/* the host page */}
      <rect x="4" y="4" width="152" height="92" rx="6" style={BORDER} stroke-width={STROKE} />
      <line x1="16" y1="20" x2="88" y2="20" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="16" y1="30" x2="64" y2="30" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      {/* the floating chat panel — the chat surface, accented */}
      <rect x="92" y="30" width="56" height="48" rx="6" style={ACCENT} stroke-width={STROKE} />
      <line x1="100" y1="40" x2="130" y2="40" style={ACCENT} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="100" y1="48" x2="118" y2="48" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      {/* the closed-state launcher */}
      <circle cx="138" cy="88" r="7" style={ACCENT_FILL} />
    </svg>
  );
}

function AssistantIllustration(): JSX.Element {
  return (
    <svg viewBox="0 0 160 100" class="h-full w-full" aria-hidden="true">
      {/* the host page */}
      <rect x="4" y="4" width="152" height="92" rx="6" style={BORDER} stroke-width={STROKE} />
      {/* conversation sidebar */}
      <line x1="42" y1="4" x2="42" y2="96" style={BORDER} stroke-width={STROKE} />
      <line x1="14" y1="20" x2="34" y2="20" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="14" y1="30" x2="34" y2="30" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="14" y1="40" x2="34" y2="40" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      {/* the centered thread — the chat surface, accented */}
      <rect x="54" y="16" width="92" height="60" rx="6" style={ACCENT} stroke-width={STROKE} />
      <line x1="64" y1="28" x2="100" y2="28" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="64" y1="38" x2="112" y2="38" style={ACCENT} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="64" y1="48" x2="94" y2="48" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      {/* composer */}
      <rect x="64" y="60" width="72" height="8" rx="4" style={BORDER} stroke-width={STROKE} />
    </svg>
  );
}

function ResearchIllustration(): JSX.Element {
  return (
    <svg viewBox="0 0 160 100" class="h-full w-full" aria-hidden="true">
      <rect x="4" y="4" width="152" height="92" rx="6" style={BORDER} stroke-width={STROKE} />
      {/* prompt-first: the prompt bar sits at the TOP, not the bottom */}
      <rect x="16" y="14" width="128" height="12" rx="6" style={ACCENT} stroke-width={STROKE} />
      {/* the answer column — the chat surface, accented */}
      <rect x="16" y="34" width="94" height="52" rx="6" style={ACCENT} stroke-width={STROKE} />
      <line x1="24" y1="44" x2="92" y2="44" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="24" y1="52" x2="80" y2="52" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="24" y1="60" x2="88" y2="60" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      {/* the sources rail — stays muted, it's not the chat surface */}
      <rect x="118" y="34" width="26" height="52" rx="6" style={BORDER} stroke-width={STROKE} />
      <line x1="124" y1="42" x2="138" y2="42" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="124" y1="50" x2="138" y2="50" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="124" y1="58" x2="138" y2="58" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
    </svg>
  );
}

function WorkspaceIllustration(): JSX.Element {
  return (
    <svg viewBox="0 0 160 100" class="h-full w-full" aria-hidden="true">
      <rect x="4" y="4" width="152" height="92" rx="6" style={BORDER} stroke-width={STROKE} />
      {/* the chat rail — the chat surface, accented */}
      <rect x="12" y="12" width="44" height="76" rx="6" style={ACCENT} stroke-width={STROKE} />
      <line x1="20" y1="24" x2="48" y2="24" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="20" y1="32" x2="40" y2="32" style={ACCENT} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="20" y1="40" x2="44" y2="40" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      {/* the large work pane — your app, stays muted */}
      <rect x="64" y="12" width="84" height="76" rx="6" style={BORDER} stroke-width={STROKE} />
      <line x1="74" y1="24" x2="120" y2="24" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="74" y1="34" x2="138" y2="34" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <rect x="74" y="46" width="30" height="30" rx="4" style={LINE} stroke-width={STROKE} />
      <rect x="110" y="46" width="30" height="30" rx="4" style={LINE} stroke-width={STROKE} />
    </svg>
  );
}

function InAppAssistantIllustration(): JSX.Element {
  return (
    <svg viewBox="0 0 160 100" class="h-full w-full" aria-hidden="true">
      {/* the host app */}
      <rect x="4" y="4" width="152" height="92" rx="6" style={BORDER} stroke-width={STROKE} />
      {/* the host app's own content — stays muted, it's not the kit */}
      <line x1="16" y1="18" x2="80" y2="18" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="16" y1="28" x2="60" y2="28" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <rect x="16" y="42" width="52" height="38" rx="4" style={LINE} stroke-width={STROKE} />
      {/* the right-docked assistant rail — flush to the host's edge, the
          chat surface, accented — narrower than Workspace's rail on
          purpose: "docked into" reads smaller/attached, not "half the
          app". A small protruding tab marks it as a dock, not a sidebar. */}
      <rect x="112" y="4" width="44" height="92" rx="6" style={ACCENT} stroke-width={STROKE} />
      <line x1="120" y1="18" x2="146" y2="18" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="120" y1="28" x2="138" y2="28" style={ACCENT} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="120" y1="38" x2="142" y2="38" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <rect x="120" y="70" width="28" height="8" rx="4" style={BORDER} stroke-width={STROKE} />
      <rect x="102" y="44" width="10" height="16" rx="3" style={ACCENT_FILL} />
    </svg>
  );
}

function VoiceIllustration(): JSX.Element {
  // Visualizer-first, not chrome-first: no page/panel outline at all — the
  // waveform and the push-to-talk affordance ARE the whole drawing, unlike
  // every other template here (deliberate departure, matches "voice-first").
  const bars = [18, 32, 46, 60, 40, 54, 24, 44, 30];
  return (
    <svg viewBox="0 0 160 100" class="h-full w-full" aria-hidden="true">
      {/* centered waveform, bars alternating accent/muted like the other
          drawings' accent-marks-the-chat-surface rule — here the surface
          IS the voice itself, so most bars read accented */}
      <For each={bars}>
        {(h, i) => {
          const x = 20 + i() * 14;
          const y = 30 - h / 2 + 12;
          return (
            <rect
              x={x}
              y={y}
              width="6"
              height={h}
              rx="3"
              style={i() % 3 === 1 ? LINE : ACCENT_FILL}
            />
          );
        }}
      </For>
      {/* push-to-talk affordance, bottom-centered */}
      <circle cx="80" cy="82" r="12" style={ACCENT} stroke-width={STROKE} />
      <circle cx="80" cy="82" r="4" style={ACCENT_FILL} />
    </svg>
  );
}

const TEMPLATE_ILLUSTRATIONS: Record<BuilderCardTemplateId, () => JSX.Element> = {
  widget: WidgetIllustration,
  inAppAssistant: InAppAssistantIllustration,
  assistant: AssistantIllustration,
  research: ResearchIllustration,
  workspace: WorkspaceIllustration,
  voice: VoiceIllustration,
};
