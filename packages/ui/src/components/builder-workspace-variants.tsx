import { type JSX, For } from 'solid-js';
import { cn } from '../utils/cn';
import { Card } from '../ui/card';
import { BLUEPRINT_BG, STROKE, LINE, BORDER, ACCENT } from './builder-start';

// The Workspace template's SECOND screen — owner-approved addition (T-1
// build-out, final round). Ruling: a template family gets a second screen
// only when it has >=2 GENUINELY different starting points; Workspace
// qualifies now that its own owner-feedback round (see `elements/
// builder-workspace.stories.tsx`'s module doc comment) shipped two real,
// distinct anatomies — an artifact/code pane beside chat (v0's own shape)
// and a full browser-chrome app preview with a device toggle (Lovable's own
// shape). Reuses `builder-start.tsx`'s own `Card`-based card pattern and
// blueprint-illustration language (`BLUEPRINT_BG`/`STROKE`/`LINE`/`BORDER`/
// `ACCENT`, exported from that module for exactly this reuse) AT THE SAME
// SCALE as Step 1's own cards — same `h-44` media height, same grid classes
// (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, the third column simply
// empty with only two variants). The original brief asked for "a smaller
// scale"; live review overrode that once the smaller cards sat next to
// Step 1's and read as too small/elongated by comparison — matching
// proportions won.
//
// "SWITCHABLE VIEWS" (the Multi-mode mechanism) IS NOT A THIRD CARD HERE —
// decided and recorded, per the assignment's own conditional. Multi-mode's
// own module doc comment (`elements/builder-multi-mode.stories.tsx`)
// concluded two things that both point away from "just a Workspace
// variant": (1) its mode-swap mechanism generalizes ACROSS template shapes
// (an `assistant` mode and a `workspace` mode are both first-class
// supported shapes, not two flavors of Workspace specifically), and (2) T-5
// flags `modes: [...]` as possibly the construct-vocabulary CEILING itself
// — a question bigger than "which Workspace starter construct to seed,"
// which is all a variant is (see the data-model note below). A family
// member needs to be a DATA-ONLY starting point within one template; Multi-
// mode is closer to its own template than a data variant of this one. So
// this screen ships with exactly the two cards the assignment named as the
// minimum, not three.
//
// DATA MODEL: a variant is a DIFFERENT STARTER CONSTRUCT within the
// Workspace family — which panel defaults and which stub content
// `WorkspaceBuilderDemo` seeds itself with — not a schema change.
// `construct.v1` needs nothing new for this screen to exist: T-3's own
// rule ("a template is a starter construct, not vocabulary... the picker
// writes the starting JSON") already covers a variant, one level down.

export type WorkspaceVariantId = 'artifactPreview' | 'appPreview';

export interface WorkspaceVariant {
  id: WorkspaceVariantId;
  name: string;
  description: string;
}

export const WORKSPACE_VARIANTS: readonly WorkspaceVariant[] = [
  {
    id: 'artifactPreview',
    name: 'Artifact preview beside chat',
    description: 'A code or rendered-output pane grows beside the conversation as you build.',
  },
  {
    id: 'appPreview',
    name: 'App preview with device toggles',
    description: 'A full browser-chrome preview of the running app, with desktop, tablet, and mobile views.',
  },
];

export interface WorkspaceVariantPickerProps {
  value?: WorkspaceVariantId;
  onSelect: (id: WorkspaceVariantId) => void;
  onBack: () => void;
  class?: string;
}

function ArtifactPreviewIllustration(): JSX.Element {
  return (
    <svg viewBox="0 0 160 100" class="h-full w-full" aria-hidden="true">
      <rect x="4" y="4" width="152" height="92" rx="6" style={BORDER} stroke-width={STROKE} />
      {/* the chat rail — the chat surface, accented */}
      <rect x="12" y="12" width="44" height="76" rx="6" style={ACCENT} stroke-width={STROKE} />
      <line x1="20" y1="24" x2="48" y2="24" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="20" y1="32" x2="40" y2="32" style={ACCENT} stroke-width={STROKE} stroke-linecap="round" />
      {/* the artifact pane — code lines, not app chrome */}
      <rect x="64" y="12" width="84" height="76" rx="6" style={BORDER} stroke-width={STROKE} />
      <line x1="74" y1="24" x2="128" y2="24" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="74" y1="32" x2="112" y2="32" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="74" y1="40" x2="122" y2="40" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="74" y1="48" x2="100" y2="48" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      <line x1="74" y1="56" x2="118" y2="56" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
    </svg>
  );
}

function AppPreviewIllustration(): JSX.Element {
  return (
    <svg viewBox="0 0 160 100" class="h-full w-full" aria-hidden="true">
      <rect x="4" y="4" width="152" height="92" rx="6" style={BORDER} stroke-width={STROKE} />
      {/* the chat rail — the chat surface, accented */}
      <rect x="12" y="12" width="40" height="76" rx="6" style={ACCENT} stroke-width={STROKE} />
      <line x1="20" y1="24" x2="44" y2="24" style={LINE} stroke-width={STROKE} stroke-linecap="round" />
      {/* the app preview pane — browser chrome + a device toggle row */}
      <rect x="60" y="12" width="88" height="76" rx="6" style={BORDER} stroke-width={STROKE} />
      <line x1="60" y1="26" x2="148" y2="26" style={BORDER} stroke-width={STROKE} />
      <circle cx="68" cy="19" r="2" style={LINE} stroke-width={STROKE} />
      <circle cx="76" cy="19" r="2" style={LINE} stroke-width={STROKE} />
      {/* device toggle chips, top-right of the chrome */}
      <rect x="118" y="15" width="10" height="8" rx="2" style={LINE} stroke-width={STROKE} />
      <rect x="130" y="15" width="10" height="8" rx="2" style={LINE} stroke-width={STROKE} />
      {/* app content skeleton */}
      <rect x="70" y="36" width="70" height="18" rx="3" style={LINE} stroke-width={STROKE} />
      <rect x="70" y="58" width="70" height="24" rx="3" style={LINE} stroke-width={STROKE} />
    </svg>
  );
}

const VARIANT_ILLUSTRATIONS: Record<WorkspaceVariantId, () => JSX.Element> = {
  artifactPreview: ArtifactPreviewIllustration,
  appPreview: AppPreviewIllustration,
};

/**
 * `WorkspaceVariantPicker` — the Workspace family's second screen: two
 * function-named variant cards (smaller-scale `Card`s, reusing `Builder
 * Start`'s own pattern) plus a back affordance to the template picker.
 * Selection fires `onSelect` with the variant id the same click-to-advance
 * shape `BuilderStart` itself uses (T-7's own reasoning: nothing a second
 * "Continue" step would add here that the click doesn't already mean).
 */
export function WorkspaceVariantPicker(props: WorkspaceVariantPickerProps): JSX.Element {
  return (
    <div class={cn('flex flex-col gap-6', props.class)} data-builder-workspace-variants>
      <button
        type="button"
        onClick={props.onBack}
        class="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-foreground">What kind of workspace?</h2>
        <p class="text-sm text-muted-foreground">Both start from the same split shell. Pick the one closer to what you're building.</p>
      </div>
      {/* Same grid classes as `BuilderStart`'s own six-card grid (owner
          feedback, live review: match Step 1's card proportions exactly,
          not a smaller scale) — at `lg:grid-cols-3` with only two variants
          the third column simply stays empty, which reads better than
          stretching two cards to fill it. */}
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <For each={WORKSPACE_VARIANTS}>
          {(variant) => {
            const selected = () => props.value === variant.id;
            const Illustration = VARIANT_ILLUSTRATIONS[variant.id];
            return (
              <Card
                appearance="outlined"
                clickable
                aria-pressed={selected()}
                onCardClick={() => props.onSelect(variant.id)}
                hasBody
                class={cn(
                  'text-left transition-shadow',
                  selected() ? 'border-primary ring-2 ring-primary' : 'hover:border-ring hover:shadow-md',
                )}
                media={
                  // `h-44`, matching Step 1's own card media height exactly
                  // (owner feedback, live review: the variant cards read too
                  // small/elongated at `h-32` next to Step 1's cards — same
                  // card component, same size class, just fewer of them).
                  <div class="flex h-44 items-center justify-center p-4" style={BLUEPRINT_BG}>
                    <Illustration />
                  </div>
                }
              >
                <div class="flex flex-col gap-1">
                  <h3 class="text-sm font-semibold text-foreground">{variant.name}</h3>
                  <p class="text-sm leading-snug text-muted-foreground">{variant.description}</p>
                </div>
              </Card>
            );
          }}
        </For>
      </div>
    </div>
  );
}
