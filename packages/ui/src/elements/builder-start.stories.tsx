import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show } from 'solid-js';
import { BuilderStart, type BuilderTemplateId } from '../components/builder-start';
import { WorkspaceVariantPicker, type WorkspaceVariantId } from '../components/builder-workspace-variants';

// Labs/Builder: "Start" - T-7
// (docs/superpowers/specs/2026-08-28-template-builder-design.md): the
// builder's opening screen, and per T-7's own framing, the shared entry
// surface the wizard, the builder, and the commercial lay-person flow are
// all meant to CONVERGE on eventually (one template registry, one picker —
// not three separately-invented ones). Story-first, like every round on
// this branch: nothing here is wired to a real template's control panel yet
// (that's Round W onward, per template, per T-6) — this round's whole job is
// to make the template identities (names, one-liners, illustrations) exist
// and feel like part of the kitn brand before any controls get built
// against them. Round P2 grew the set to six and removed the selection
// readout below the grid — the card's own ring/highlight is the only
// selection statement now, per owner direction.
const meta = { title: 'Labs/Builder/Start', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// The AI/UI brand magenta — the exact value `.storybook/preview.ts`'s own
// manager brandmark uses, and the one T-7 means by "the magenta accent".
// `builder-start.tsx` itself stays token-only (`var(--color-primary)`
// inside the illustrations, `border-primary`/`ring-primary` on the card) —
// the kit's own default `--color-primary` is a NEUTRAL near-black/near-white
// (this is a white-label component library; a consumer's own construct sets
// its own accent), so it renders correctly but not brand-colored on its
// own. This story is the one place that gets to say "and here, brand it".
//
// Sets `--color-primary` DIRECTLY, not `--kai-color-primary` — found live,
// on THIS round: `builder.stories.tsx`'s `ChatPanel`/`DeviceFrame` set
// `--kai-color-primary` on a nested wrapper div expecting it to flow
// through to `--color-primary` (`theme.css`'s `@theme` block declares
// `--color-primary: var(--kai-color-primary, <fallback>)`), the same way a
// REAL emitted construct's host element does. It doesn't, in this
// bare-light-DOM Storybook context: that `var()` indirection is resolved
// once, wherever `--color-primary` itself is DECLARED (`:root`/`:host`) —
// setting `--kai-color-primary` on a plain descendant div never re-triggers
// that resolution, so the accent color picker in the existing `Labs/Apps`
// Builder story has never actually recolored the preview (confirmed by
// screenshot: the accent swatch reads #e91e63, the composer's send button
// and the widget FAB both render neutral black regardless). That's a
// pre-existing gap from earlier rounds, out of scope to fix here — flagged
// in this round's report instead of silently patched. The one-line, honest
// workaround for this NEW story: skip the indirection and set
// `--color-primary` itself, which — being a plain custom property with no
// further indirection between here and the illustrations/Card classes that
// read it — inherits normally and actually renders.
const BRAND_STYLE = { '--color-primary': '#EC2295' } as const;

/** A page heading + the picker — reads as a real screen rather than an
 *  isolated component. No selection readout below the grid (Round P2): the
 *  card's own ring/highlight is the only selection statement; a real build
 *  routes straight into that template's `Labs/Builder/<Template>` story
 *  instead (T-6). Click a card to see the selected ring; hover any card to
 *  see its hover border/shadow. */
function StartDemo() {
  const [selected, setSelected] = createSignal<BuilderTemplateId | undefined>(undefined);
  return (
    <div class="mx-auto flex max-w-6xl flex-col gap-6 py-10" style={BRAND_STYLE}>
      <div class="flex flex-col gap-1">
        <h1 class="text-xl font-semibold text-foreground">Choose a starting point</h1>
        <p class="text-sm text-muted-foreground">Pick the kind of chat you are building. You can change this later.</p>
      </div>
      <BuilderStart value={selected()} onSelect={setSelected} />
    </div>
  );
}

/** The picker at a realistic viewport. */
export const Start: Story = {
  render: () => <StartDemo />,
};

/** The selected-ring state, shown without needing to click first — useful
 *  for reviewing that state on its own rather than only mid-interaction. */
export const Preselected: Story = {
  render: () => {
    const [selected, setSelected] = createSignal<BuilderTemplateId | undefined>('research');
    return (
      <div class="mx-auto max-w-6xl py-10" style={BRAND_STYLE}>
        <BuilderStart value={selected()} onSelect={setSelected} />
      </div>
    );
  },
};

/**
 * The two-step flow for a template family with a real second screen —
 * Workspace, per the owner's ruling this round: a family gets a second
 * screen only once it has >=2 genuinely different starting points, and
 * Workspace's own owner-feedback round shipped exactly two (an artifact/
 * code pane beside chat, v0's shape; a full app preview with device
 * toggles, Lovable's shape — see `components/builder-workspace-variants.tsx`'s
 * own module doc comment for the "why not a third card" reasoning re:
 * Multi-mode's "Switchable views").
 *
 * ADDED HERE, in `Labs/Builder/Start`, rather than as a new top-level Labs
 * sidebar entry — this story is a CONTINUATION of the Start flow (picking
 * "Workspace" advances into it), not an independent screen someone would
 * navigate to directly, and Storybook already groups every export under one
 * `title` together in the sidebar, so a reader on the Start page finds this
 * one story below it for free.
 *
 * Selecting a non-Workspace card advances straight to a stub "Continuing to
 * <template>..." readout, same as every other template already does
 * (T-6: each has its own full `Labs/Builder/<Template>` story to route to,
 * out of scope for this flow demo). Selecting "Workspace" advances to
 * `WorkspaceVariantPicker`; picking a variant there shows which family +
 * variant id fired — an honest STUB rather than mounting the real
 * `Labs/Builder/Workspace` story's own demo component, which is
 * module-private to that file and not designed to be re-parented into a
 * second story. Back returns to step one with the original selection
 * preserved.
 */
export const TwoStepFlow: Story = {
  render: () => {
    const [step, setStep] = createSignal<'start' | 'workspaceVariants'>('start');
    const [template, setTemplate] = createSignal<BuilderTemplateId | undefined>(undefined);
    const [variant, setVariant] = createSignal<WorkspaceVariantId | undefined>(undefined);

    const selectTemplate = (id: BuilderTemplateId): void => {
      setTemplate(id);
      if (id === 'workspace') setStep('workspaceVariants');
    };

    return (
      <div class="mx-auto flex max-w-6xl flex-col gap-6 py-10" style={BRAND_STYLE}>
        <Show when={step() === 'start'}>
          <div class="flex flex-col gap-1">
            <h1 class="text-xl font-semibold text-foreground">Choose a starting point</h1>
            <p class="text-sm text-muted-foreground">Pick the kind of chat you are building. You can change this later.</p>
          </div>
          <BuilderStart value={template()} onSelect={selectTemplate} />
          <Show when={template() && template() !== 'workspace'}>
            <p class="text-sm text-muted-foreground">Continuing to {template()}...</p>
          </Show>
        </Show>

        <Show when={step() === 'workspaceVariants'}>
          <WorkspaceVariantPicker
            value={variant()}
            onSelect={setVariant}
            onBack={() => setStep('start')}
          />
          <Show when={variant()}>
            <p class="text-sm text-muted-foreground">Continuing to workspace / {variant()}...</p>
          </Show>
        </Show>
      </div>
    );
  },
};
