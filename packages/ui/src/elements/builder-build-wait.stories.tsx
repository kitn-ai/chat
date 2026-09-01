import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { For, createSignal, onCleanup } from 'solid-js';
import { BuildWait, BUILD_WAIT_STEPS } from '../components/build-wait';
import { BUILDER_TEMPLATES, type BuilderCardTemplateId } from '../components/builder-start';

// Labs/Builder/Build wait — the screen the builder shows while a construct's
// preview boots. It replaces one line of small text, which the owner called
// boring and non-inspiring and asked to be something that depicts BUILDING.
// The approved shape (their idea, signed off after scoping): a NON-INTERACTIVE
// blueprint assembly — the chosen template's own drawing assembling itself —
// with the real boot phases reported underneath. The game idea was explicitly
// dropped: a game turns a wait into something to watch instead of something
// to get through.
//
// Story-first, like every round on this branch: nothing here is wired into the
// builder page yet. This file IS the design surface for that review, so it
// shows one story per template blueprint (the drawing differs per template, so
// there is no single story that reviews the thing), plus the two states that
// are not the happy path — reduced motion and a boot failure.
//
// The wait is REAL: a first run installing dependencies is minutes. So each
// story here advances its own phases on a timer, at roughly the pace a warm
// boot moves, and then STOPS on the last phase and stays there — which is what
// a long boot looks like, and the state worth staring at while judging whether
// the screen holds up at three minutes as well as at three.
const meta = { title: 'Labs/Builder/Build wait', parameters: { layout: 'centered' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// BuildWait is internal to the builder app (src/components/build-wait.tsx) -- it ships in no
// public @kitn.ai/ui entry point, so the snippet below shows real usage of the component itself
// rather than a package import.
const src = (code: string) => ({
  parameters: { docs: { source: { code, language: 'tsx' } } },
});

// The AI/UI brand magenta, set the same way every other builder story on this
// branch sets it, and for the same reason recorded in `builder-start.stories`:
// `--color-primary` DIRECTLY, because the `--kai-color-primary` indirection
// only re-resolves where `--color-primary` is declared, so setting it on a
// descendant never reaches the accent. The component itself stays token-only.
const BRAND_STYLE = { '--color-primary': '#EC2295' } as const;

/** How long each phase is held before the story moves on. Deliberately not
 *  uniform — the install step is the long one in a real boot, and a wait that
 *  ticks at a metronome pace reads as a progress bar, which this is not. */
const PACE = [5200, 3400];

/** Runs the phases forward on a timer and stops on the last one, which is
 *  where a long boot actually sits. Story-local: the component itself never
 *  advances anything — every claim it makes comes from its props. */
function useBootPhases() {
  const [index, setIndex] = createSignal(0);
  const timers: ReturnType<typeof setTimeout>[] = [];
  let at = 0;
  PACE.forEach((hold, i) => {
    at += hold;
    timers.push(setTimeout(() => setIndex(i + 1), at));
  });
  onCleanup(() => timers.forEach(clearTimeout));
  return () => BUILD_WAIT_STEPS[index()]!.id;
}

/** The wait as the builder would actually frame it: a heading that names what
 *  is being built, then the blueprint and its phases. */
function WaitScreen(props: { templateId: BuilderCardTemplateId; error?: string; reduceMotion?: boolean }) {
  const current = useBootPhases();
  const name = () => BUILDER_TEMPLATES.find((t) => t.id === props.templateId)?.name ?? props.templateId;
  return (
    <div class="flex w-full flex-col items-center gap-6 py-10" style={BRAND_STYLE}>
      {/* The template's name goes in the sentence, not the heading: the six
          registry names do not all slot into "Building your …" (a widget and
          an assistant do, Research and Voice do not), and a heading that only
          reads for four of six is the kind of thing that gets noticed once
          per template forever. */}
      <div class="flex flex-col items-center gap-1 text-center">
        <h1 class="text-xl font-semibold text-foreground">Building your app</h1>
        <p class="text-sm text-muted-foreground">
          Starting from the {name()} template. This can take a minute on the first run.
        </p>
      </div>
      <BuildWait
        templateId={props.templateId}
        current={props.error ? 'generate' : current()}
        error={props.error}
        reduceMotion={props.reduceMotion}
      />
    </div>
  );
}

const templateStory = (templateId: BuilderCardTemplateId): Story => ({
  render: () => <WaitScreen templateId={templateId} />,
  ...src(`<BuildWait templateId="${templateId}" current={currentPhase} />`),
});

/** Support widget — the floating panel is the accented surface, so it is the
 *  shape that keeps breathing once the drawing has settled. */
export const Widget: Story = templateStory('widget');

/** In-app assistant — the docked rail lands last of the big shapes, after the
 *  host app's own content it attaches to. */
export const InAppAssistant: Story = templateStory('inAppAssistant');

/** Assistant — conversation sidebar first, then the thread it frames. */
export const Assistant: Story = templateStory('assistant');

/** Research — sources rail, then the prompt bar and answer column together,
 *  which are one surface and land as one step. */
export const Research: Story = templateStory('research');

/** Workspace — the work pane goes down as structure, then the chat rail that
 *  is this kit's part of it. */
export const Workspace: Story = templateStory('workspace');

/** Voice — the one drawing with no page outline at all (the original
 *  illustration's deliberate departure, kept). The push-to-talk ring is the
 *  anchor and the hero; the waveform assembles left to right. */
export const Voice: Story = templateStory('voice');

/** All six side by side — for judging that they read as one family mid-draw,
 *  which is the thing a single story cannot show.
 *
 *  The gap here is the six-step, not the roomier one above it: that one is not
 *  in the checked-in compiled sheet this live Storybook serves, and only whole
 *  utilities already present in it render without a rebuild — the same
 *  constraint `builder-start.tsx` records at every class it picks. */
const ALL_TEMPLATES_SRC = src(`{BUILDER_TEMPLATES.map((template) => (
  <BuildWait templateId={template.id} current="generate" />
))}`);

export const AllTemplates: Story = {
  render: () => (
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" style={BRAND_STYLE}>
      <For each={BUILDER_TEMPLATES}>
        {(template) => (
          <div class="flex flex-col gap-3">
            <h2 class="text-sm font-semibold text-foreground">{template.name}</h2>
            <BuildWait templateId={template.id} current="generate" />
          </div>
        )}
      </For>
    </div>
  ),
  parameters: { layout: 'padded', docs: ALL_TEMPLATES_SRC.parameters.docs },
};

/**
 * Reduced motion, forced. The completed blueprint is there immediately, with
 * no stroke animation and no heartbeat — and the phases still advance, because
 * the motion was never what was carrying the information.
 *
 * The prop is a story affordance, not the mechanism: the component reads
 * `prefers-reduced-motion` itself AND ships a media rule that switches every
 * animation off, either of which is enough on its own. This story exists so
 * the rendering can be reviewed without changing the reviewer's OS setting.
 */
export const ReducedMotion: Story = {
  render: () => <WaitScreen templateId="workspace" reduceMotion />,
  ...src(`<BuildWait templateId="workspace" current={currentPhase} reduceMotion />`),
};

/**
 * A boot that failed. The drawing holds finished and goes quiet rather than
 * animating over a build that is not happening, the phase that broke is marked
 * as broken, and the reason is stated. Nothing here is a spinner that would
 * have kept turning forever.
 */
export const Failed: Story = {
  render: () => (
    <WaitScreen
      templateId="assistant"
      error="The preview server exited before it came up: EADDRINUSE, port 5173 is already in use."
    />
  ),
  ...src(`<BuildWait
  templateId="assistant"
  current="generate"
  error="The preview server exited before it came up: EADDRINUSE, port 5173 is already in use."
/>`),
};
