import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { type JSX, createSignal, createMemo, createEffect, onCleanup } from 'solid-js';
import { Mic, PanelLeftOpen, PanelRightOpen, X, Download } from 'lucide-solid';
import { BuilderPanel, type BuilderConstruct } from '../components/builder-panel';
import { BuilderLayout, type BuilderViewport } from '../components/builder-layout';
import { resolveAccentWrapperStyle } from '../components/builder-preview';
import { AudioVisualizer, type VisualizerVariant } from '../components/audio-visualizer';
import { ChatThread } from '../components/chat-thread';
import { WorkspaceShell } from '../components/workspace-shell';
import { Captions, type CaptionSegment, type CaptionsVariant } from '../components/captions';
import { Switch } from '../ui/switch';
import { Select } from '../ui/select';
import { RadioGroup, type RadioOption } from '../ui/radio';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { Kbd } from '../ui/kbd';
import { cn } from '../utils/cn';
import type { ChatMessage } from './chat-types';

// Labs/Builder/Voice — T-1/T-1a build-out (docs/superpowers/specs/
// 2026-08-28-template-builder-design.md), reshaped in an owner design
// round to a workspace-like layout. Reused `components/workspace-shell.tsx`'s
// `WorkspaceShell` (the SAME real collapse mechanism the Workspace
// template's Expand control found — controlled `startCollapsed`/
// `endCollapsed`, confirmed by reading `WorkspaceShell` again rather than
// re-deriving it) for the split, and the kit's real `ChatThread` for the
// transcript panel's content, per the owner's own instruction.
//
// 1. LAYOUT: a TRANSCRIPT PANEL, dockable `start` or `end` (a panel radio,
//    same shape as In-app assistant's rail-placement control) — a full
//    chat surface, message history AND a text composer, typing alongside
//    voice. It COLLAPSES COMPLETELY: collapsed (the DEFAULT, so the
//    standalone-visualizer look is the first impression) means the aside
//    is not rendered at all — `WorkspaceShell`'s own `showAside` check
//    (`!!asideContent(side) && !collapsed(side)`) already drops BOTH the
//    aside and its resize handle when collapsed, confirmed by reading it —
//    so this is a real "gone", not a width-0 hide. A corner button (top-
//    start or top-end, matching the dock side) sits ABOVE the shell,
//    absolutely positioned against the frame, and is the only affordance
//    to open the panel while collapsed — `WorkspaceShell` renders no such
//    button itself (it is "chat-agnostic", the same doc comment the
//    Workspace round already quoted), so this story supplies one, same as
//    it supplies its own Expand button on the Workspace template.
//
//    DOWNLOAD (owner feedback round): the transcript rail header also carries
//    a download icon button (Tooltip + ghost icon-sm Button, the kit's real
//    icon-button idiom — see `voice-output.tsx` for the same pairing) that
//    performs a real client-side download of the stub transcript as plain
//    text (Blob + object URL + a throwaway `<a download>`). On by default
//    (a panel switch in the Layout section can turn it off) — an export
//    affordance is the kind of thing most builds want, and there's no
//    argument here for defaulting it off. A real emitted build would format
//    the export properly (timestamps, real names, maybe VTT/JSON); this
//    story only proves the mechanism.
//
//    TEXT INPUT ("typing to the agent alongside voice, optional toggle"):
//    a REAL mechanism, not a new one. `ChatThread`'s `composer` prop is a
//    REPLACE flag — `<Show when={props.composer} fallback={
//    <DefaultPromptInput .../>}><slot name="composer" /></Show>`
//    (`chat-thread.tsx`, read again before using it this way). A bare
//    Solid `<ChatThread>` usage (this story, like every other template)
//    projects no `slot="composer"` content, so setting `composer={true}`
//    with nothing to replace it WITH renders an empty slot — the built-in
//    prompt input disappears with nothing replacing it. That is exactly
//    "no typed input, transcript only," achieved through a prop `Chat
//    Thread` already has for a different stated purpose, not a new one
//    invented for this story.
//
// 2. CAPTIONS: `components/captions.tsx` (NEW kit component this round —
//    see its own doc comment for the full contract: presence-gated
//    appear/fade via the kit's REAL `createPresence` primitive, speaker-
//    aware styling, `motion-reduce:animate-none`, empty renders nothing).
//    Replaces the old bottom-center "Idle"/state-name text entirely — a
//    caption is model output (or the user's own live words), not a status
//    label. Placed directly below the visualizer (this story's own
//    "lower third," relative to the visualizer's own box — the whole
//    preview canvas has no single fixed viewport to anchor a page-level
//    lower third against). Driven here by the demo-state select: only
//    `listening` (a stub user caption) and `speaking` (a stub assistant
//    caption) produce any caption text; `idle`/`thinking` show nothing,
//    same as a real live-captioning surface would show nothing between
//    utterances.
//
// 3. MIC BUTTON: a round, semi-large circle, explicitly NOT accent-tinted
//    — the owner's own instruction: accent stays reserved for the
//    visualizer. Restyled from `bg-primary`/`text-primary-foreground` to
//    the kit's real `outline` Button variant's own color classes
//    (`ui/button.tsx`: `bg-muted/50 text-foreground hover:bg-muted` — the
//    closest existing "secondary/neutral" look; there is no literal
//    `secondary` variant, same mapping the Workspace round's header-action
//    editor already had to make and documented there). Kept as bespoke
//    markup rather than `<Button>` itself, since `Button`'s size scale
//    tops out at `size-9`/`icon` and this wants a genuinely bigger circle
//    (`size-16`) — only the color TREATMENT is reused, not the component.
//
// 4. Removed the "Voice" / demo-state label entirely. In its place: an
//    OPTIONAL header (a panel switch, off by default per the owner's
//    "off-capable" instruction — wait, re-read: the brief says add an
//    optional header, doesn't state a default; this story defaults it
//    OFF, matching "the standalone visualizer look is the first
//    impression" already governing the transcript panel's own default, so
//    the whole page opens as visualizer + mic + nothing else). When on, it
//    shows ONLY the product title — reusing `header.title`, the same real,
//    already-existing construct field every other template reuses, not a
//    new one.
//
// T-5 (unchanged verdict, reshaped detail): `construct.v1` still has ZERO
// voice keys. The widened proposal (see docs/superpowers/research/
// 2026-08-28-builder-t5-vocabulary-proposals.md, item 9) now names: the
// transcript rail (dock side + default-open + text-input-enabled),
// visualizer variant, voice in/out, and the NEW captions concept — plus
// the one piece of this round that is KIT work, not construct work: the
// `Captions` component itself, real and shipped in `components/`, feeding
// the voice vocabulary proposal rather than waiting on it. Per T-1a, this
// template's SHIP gate — a genuine Labs voice-app surface existing first —
// is unchanged by this round.
//
// TALK MODES (owner amendment, this round): `mode: 'push' | 'space' |
// 'open'` joins the proposal. `push` (the original "Hold to talk") and
// `space` are both real interactions — the mic button visibly presses on a
// real mouse press, and a real `window` keydown/keyup pair toggles the same
// pressed state while Space is held, cleaned up via `onCleanup` when
// `talkMode` changes or the component unmounts. `open` is an HONEST STUB:
// checked `components/voice-input.tsx` and `primitives/use-voice-
// recorder.ts` for a VAD/continuous-listening API before adding this
// option, and neither has one, so "open mic" here renders the INDICATOR a
// real continuous-listen mode would need (a pulsing ring, no press
// affordance) without any live wire-up behind it — named honestly in the
// panel's own hint text, not silently faked as working.

type VisualizerVariantOption = { value: VisualizerVariant; label: string };
const VARIANT_OPTIONS: readonly VisualizerVariantOption[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'grid', label: 'Grid' },
  { value: 'radial', label: 'Radial' },
  { value: 'wave', label: 'Wave' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'custom', label: 'Custom (needs a shader)' },
];

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
type DockSide = 'start' | 'end';

// TALK MODES (owner amendment). 'push' and 'space' are both real
// interactions this story wires for real (a mouse/keyboard press,
// respectively). 'open' is an HONEST STUB — grepped `components/
// voice-input.tsx` and `primitives/use-voice-recorder.ts` for any VAD/
// continuous-listening API before adding this option, and neither has one,
// so "open mic" here is a demo STATE (the indicator UI a real one would
// need) rather than a wired continuous-listen path. See the module doc
// comment's T-5 note.
type TalkMode = 'push' | 'space' | 'open';

const TALK_MODE_OPTIONS: readonly { value: TalkMode; label: string }[] = [
  { value: 'push', label: 'Hold to talk' },
  { value: 'space', label: 'Hold Space to talk' },
  { value: 'open', label: 'Open mic (real-time)' },
];

/** Only `listening`/`speaking` produce a live caption — the same silence
 *  a real closed-captioning surface would show between utterances. */
const CAPTION_BY_STATE: Partial<Record<VoiceState, { text: string; speaker: 'user' | 'assistant' }>> = {
  listening: { text: "What's on my calendar today?", speaker: 'user' },
  speaking: { text: 'Three meetings — standup at 10, a design review at 1, and a 1:1 at 4.', speaker: 'assistant' },
};

const DOCK_SIDE_OPTIONS: readonly RadioOption<DockSide>[] = [
  { value: 'start', label: 'Start', description: 'Docked left' },
  { value: 'end', label: 'End', description: 'Docked right' },
];

const TRANSCRIPT_MESSAGES: ChatMessage[] = [
  { id: 't1', role: 'user', parts: [{ type: 'text', text: "What's on my calendar today?" }] },
  { id: 't2', role: 'assistant', parts: [{ type: 'text', text: 'Three meetings — standup at 10, a design review at 1, and a 1:1 at 4.' }] },
];

/** Plain-text rendering of the stub transcript for the download affordance.
 *  A real builder-emitted app would format this properly (timestamps, real
 *  speaker names, maybe a structured export like JSON/VTT) — this story only
 *  proves the download MECHANISM (a real client-side file, not a stub click
 *  handler that does nothing), so a flat "Role: text" join is enough. */
function transcriptText(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const text = m.parts
        .filter((p): p is Extract<(typeof m.parts)[number], { type: 'text' }> => p.type === 'text')
        .map((p) => p.text)
        .join(' ');
      return `${m.role === 'user' ? 'You' : 'Assistant'}: ${text}`;
    })
    .join('\n\n');
}

/** Owner feedback round: a download affordance on the transcript panel's rail
 *  header, real client-side download (Blob + object URL + a throwaway `<a
 *  download>`, revoked immediately after) — not a stub click handler. */
function downloadTranscript(): void {
  const blob = new Blob([transcriptText(TRANSCRIPT_MESSAGES)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transcript.txt';
  a.click();
  URL.revokeObjectURL(url);
}

const DEFAULT_CONSTRUCT: BuilderConstruct = {
  name: 'voice-assistant',
  layout: 'fullscreen',
  provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
  header: { title: 'Voice' },
  theme: { accent: '#db2777', mode: 'system' },
};

/** The transcript panel's own content: a small header (title + a collapse
 *  button on the dock side's own edge) over a real `ChatThread` — message
 *  history always on, the composer gated by `textInput` per the module
 *  doc comment's real-mechanism note. */
// Panel surface tone (owner amendment): matched to `elements/t3code.stories.tsx`'s
// own rail/panel background — that story's `slot="start"` carries no bg
// class of its own, so it renders `WorkspaceShell`'s (there, `kai-workspace`'s)
// own default aside token, `bg-surface` (`components/workspace-shell.tsx`'s
// `asideColumn`, read to confirm before reusing it here). `ChatThread`'s own
// root hardcodes `bg-background` on itself, which would otherwise paint over
// that surface tone, so it's overridden explicitly on the `class` prop below
// rather than left to rely on the wrapper underneath it.
function TranscriptPanel(props: { dockSide: DockSide; textInput: boolean; showDownload: boolean; onCollapse: () => void }): JSX.Element {
  return (
    <div class="flex h-full flex-col bg-surface">
      <div class="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transcript</span>
        <div class="flex items-center gap-1">
          {props.showDownload && (
            <Tooltip content="Download transcript">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Download transcript" onClick={downloadTranscript}>
                <Download size={14} aria-hidden="true" />
              </Button>
            </Tooltip>
          )}
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Collapse transcript" onClick={props.onCollapse}>
            <X size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {/* Owner feedback round: the built-in composer (`ui/prompt-input.tsx`'s
          `bg-surface`) collided with this panel's own `bg-surface` toning
          (the round-B fix above, matched to `t3code.stories.tsx`'s rail
          token) — the input frame disappeared into its own background. The
          panel/message area stays uniformly `bg-surface` on purpose (that
          was the whole point of the round-B fix); only the composer itself
          is pushed to a genuinely distinct tier. `--color-surface` is
          declared as `color-mix(muted, background)` (theme.css) — going
          back to the plain `bg-background` base is visually distinct from
          the blended `bg-surface` tone in both themes, and a `border-border`
          edge satisfies the same non-text-contrast note theme.css makes
          about control edges (not just relying on a shadow). Scoped via a
          descendant selector on `[data-prompt-input]` (real light-DOM CSS —
          `ChatThread` here is the bare Solid component, no shadow root) so
          only the input frame changes tier, not the message list. */}
      <ChatThread
        class="h-full min-h-0 flex-1 !bg-surface [&_[data-prompt-input]]:bg-background [&_[data-prompt-input]]:border [&_[data-prompt-input]]:border-border"
        messages={TRANSCRIPT_MESSAGES}
        composer={props.textInput ? undefined : true}
        onSubmit={() => {}}
      />
    </div>
  );
}

function VoicePreview(props: {
  construct: BuilderConstruct;
  variant: VisualizerVariant;
  state: VoiceState;
  voiceIn: boolean;
  voiceOut: boolean;
  headerEnabled: boolean;
  dockSide: DockSide;
  transcriptOpen: boolean;
  onTranscriptOpenChange: (v: boolean) => void;
  textInput: boolean;
  transcriptDownload: boolean;
  talkMode: TalkMode;
  captionVariant: CaptionsVariant;
  viewport: BuilderViewport;
}): JSX.Element {
  const frameStyle = createMemo(() => ({
    ...resolveAccentWrapperStyle(props.construct.theme),
    height: 'calc(100vh - 9rem)',
    width: 'calc(100vw - 27rem)',
    'max-width': '100%',
  }));
  const captionSegments = createMemo<CaptionSegment[] | undefined>(() => {
    if (!props.voiceOut) return undefined;
    const c = CAPTION_BY_STATE[props.state];
    return c ? [{ speaker: c.speaker, text: c.text }] : undefined;
  });
  const CornerIcon = props.dockSide === 'start' ? PanelLeftOpen : PanelRightOpen;

  // The Space-bar affordance (real, working — not decorative): a window
  // keydown/keyup listener toggles a pressed-state signal while `talkMode`
  // is 'space'. `onCleanup` removes it on unmount/mode change, matching the
  // scoped-listener discipline every other real interaction on this branch
  // follows (never a document listener left dangling).
  const [spacePressed, setSpacePressed] = createSignal(false);
  createEffect(() => {
    if (props.talkMode !== 'space') return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !e.repeat) setSpacePressed(true);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  });

  const micPressed = createMemo(() => props.talkMode === 'space' && spacePressed());
  // `open` mode's mic renders as a live LISTENING INDICATOR, not a press
  // affordance — no `kai-voice-input`/component-tier VAD or continuous-
  // listening API exists today (checked `components/voice-input.tsx` and
  // `primitives/use-voice-recorder.ts` before writing this — neither has
  // one), so this is an honest STUB state, not a real continuous-listen
  // wire-up. See the module doc comment's T-5 note.
  const isOpenMic = createMemo(() => props.talkMode === 'open');

  const Main = (): JSX.Element => (
    <div class="flex h-full flex-col">
      {props.headerEnabled && (
        <header class="flex h-10 shrink-0 items-center justify-center border-b border-border px-4">
          <span class="text-sm font-medium text-foreground">{props.construct.header?.title}</span>
        </header>
      )}
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-8">
        <AudioVisualizer variant={props.variant} state={props.state} size="xl" label={`${props.construct.header?.title} voice level`} />

        <Captions segments={captionSegments()} variant={props.captionVariant} />

        {isOpenMic() ? (
          // Open mic: an indicator, not a button — nothing to press.
          <div
            aria-label="Listening"
            role="status"
            class={cn(
              'flex size-16 items-center justify-center rounded-full border shadow-md',
              props.voiceIn ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted/50 text-muted-foreground opacity-40',
            )}
          >
            <span class={cn('absolute size-16 rounded-full', props.voiceIn && 'animate-ping bg-primary/20')} aria-hidden="true" />
            <Mic size={24} aria-hidden="true" class="relative" />
          </div>
        ) : (
          <button
            type="button"
            disabled={!props.voiceIn}
            aria-label="Push to talk"
            aria-pressed={micPressed()}
            class={cn(
              'flex size-16 items-center justify-center rounded-full border shadow-md transition-all hover:bg-muted',
              micPressed() ? 'scale-95 border-primary/50 bg-muted text-foreground' : 'border-border bg-muted/50 text-foreground',
              !props.voiceIn && 'cursor-not-allowed opacity-40',
            )}
          >
            <Mic size={24} aria-hidden="true" />
          </button>
        )}

        <div class="flex flex-col items-center gap-1">
          <p class="text-xs text-muted-foreground">
            {!props.voiceIn ? 'Voice in is off' : isOpenMic() ? 'Listening continuously' : 'Hold to talk'}
          </p>
          {props.talkMode === 'space' && props.voiceIn && (
            <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
              or hold <Kbd keys="Space" size="sm" />
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      class="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      style={frameStyle()}
      data-builder-voice-frame
      data-builder-viewport={props.viewport}
      data-builder-transcript-open={props.transcriptOpen}
    >
      {!props.transcriptOpen && (
        <button
          type="button"
          aria-label="Open transcript"
          onClick={() => props.onTranscriptOpenChange(true)}
          class={cn(
            'absolute top-3 z-10 grid size-8 place-items-center rounded-lg border border-border bg-surface text-muted-foreground shadow-sm hover:text-foreground',
            props.dockSide === 'start' ? 'left-3' : 'right-3',
          )}
        >
          <CornerIcon size={15} aria-hidden="true" />
        </button>
      )}
      <div class="min-h-0 flex-1">
        <WorkspaceShell
          class="h-full"
          startWidth={320}
          startMinWidth={260}
          startMaxWidth={440}
          endWidth={320}
          endMinWidth={260}
          endMaxWidth={440}
          startCollapsed={props.dockSide === 'start' ? !props.transcriptOpen : true}
          endCollapsed={props.dockSide === 'end' ? !props.transcriptOpen : true}
          start={props.dockSide === 'start' ? <TranscriptPanel dockSide={props.dockSide} textInput={props.textInput} showDownload={props.transcriptDownload} onCollapse={() => props.onTranscriptOpenChange(false)} /> : undefined}
          end={props.dockSide === 'end' ? <TranscriptPanel dockSide={props.dockSide} textInput={props.textInput} showDownload={props.transcriptDownload} onCollapse={() => props.onTranscriptOpenChange(false)} /> : undefined}
        >
          <Main />
        </WorkspaceShell>
      </div>
    </div>
  );
}

function VisualizerSection(props: {
  variant: VisualizerVariant;
  onVariantChange: (v: VisualizerVariant) => void;
  state: VoiceState;
  onStateChange: (v: VoiceState) => void;
  voiceIn: boolean;
  onVoiceInChange: (v: boolean) => void;
  voiceOut: boolean;
  onVoiceOutChange: (v: boolean) => void;
  talkMode: TalkMode;
  onTalkModeChange: (v: TalkMode) => void;
  captionVariant: CaptionsVariant;
  onCaptionVariantChange: (v: CaptionsVariant) => void;
}): JSX.Element {
  return (
    <section class="flex flex-col gap-3 border-b border-border p-4">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Visualizer</h3>
      <label class="flex flex-col gap-1 text-xs font-medium text-foreground">
        Caption style
        <Select
          options={[
            { value: 'lower-third', label: 'Lower third' },
            { value: 'floating', label: 'Floating' },
            { value: 'minimal', label: 'Minimal' },
            { value: 'stacked', label: 'Stacked' },
          ]}
          value={props.captionVariant}
          onChange={(e) => props.onCaptionVariantChange(e.currentTarget.value as CaptionsVariant)}
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-medium text-foreground">
        Talk mode
        <Select
          options={TALK_MODE_OPTIONS}
          value={props.talkMode}
          onChange={(e) => props.onTalkModeChange(e.currentTarget.value as TalkMode)}
        />
      </label>
      <p class="text-xs text-muted-foreground">
        "Open mic" is a stub state — no VAD/continuous-listening API exists in the kit today (checked `voice-input.tsx` before adding
        this; T-5, see this file's module doc comment).
      </p>
      <label class="flex flex-col gap-1 text-xs font-medium text-foreground">
        Variant
        <Select
          options={VARIANT_OPTIONS}
          value={props.variant}
          onChange={(e) => props.onVariantChange(e.currentTarget.value as VisualizerVariant)}
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-medium text-foreground">
        Demo state
        <Select
          options={[
            { value: 'idle', label: 'Idle' },
            { value: 'listening', label: 'Listening' },
            { value: 'thinking', label: 'Thinking' },
            { value: 'speaking', label: 'Speaking' },
          ]}
          value={props.state}
          onChange={(e) => props.onStateChange(e.currentTarget.value as VoiceState)}
        />
      </label>
      <div class="flex items-center justify-between gap-3 pt-1">
        <span class="text-xs font-medium text-foreground">Voice in</span>
        <Switch checked={props.voiceIn} label="Voice in" onChange={props.onVoiceInChange} />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Voice out</span>
        <Switch checked={props.voiceOut} label="Voice out" onChange={props.onVoiceOutChange} />
      </div>
      <p class="text-xs text-muted-foreground">
        construct.v1 has no voice vocabulary at all — every control on this page is a T-5 proposal (see this file's module doc comment).
      </p>
    </section>
  );
}

function LayoutSection(props: {
  headerEnabled: boolean;
  onHeaderEnabledChange: (v: boolean) => void;
  dockSide: DockSide;
  onDockSideChange: (v: DockSide) => void;
  transcriptOpen: boolean;
  onTranscriptOpenChange: (v: boolean) => void;
  textInput: boolean;
  onTextInputChange: (v: boolean) => void;
  transcriptDownload: boolean;
  onTranscriptDownloadChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <section class="flex flex-col gap-3 border-b border-border p-4">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Layout</h3>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Header</span>
        <Switch checked={props.headerEnabled} label="Header" onChange={props.onHeaderEnabledChange} />
      </div>
      <p class="text-xs text-muted-foreground">Off by default. When on, shows Identity's Header title field only — no actions, no chrome.</p>

      <div class="flex flex-col gap-1.5 pt-1">
        <span class="text-xs font-medium text-foreground">Transcript dock side</span>
        <RadioGroup<DockSide> options={DOCK_SIDE_OPTIONS} value={props.dockSide} label="Transcript dock side" onChange={props.onDockSideChange} />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Transcript open</span>
        <Switch checked={props.transcriptOpen} label="Transcript open" onChange={props.onTranscriptOpenChange} />
      </div>
      <p class="text-xs text-muted-foreground">Collapsed by default — the standalone visualizer is the first impression. Collapsed = no aside at all, not just hidden.</p>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Text input</span>
        <Switch checked={props.textInput} label="Text input" onChange={props.onTextInputChange} />
      </div>
      <p class="text-xs text-muted-foreground">Typing to the agent alongside voice. Off replaces the transcript's composer with nothing (a real ChatThread `composer` REPLACE-slot mechanism, not a new one).</p>

      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Download button</span>
        <Switch checked={props.transcriptDownload} label="Transcript download" onChange={props.onTranscriptDownloadChange} />
      </div>
      <p class="text-xs text-muted-foreground">
        On by default. Owner feedback round: an icon button on the transcript rail header that downloads the transcript as plain
        text — real client-side download, not a stub (a real builder would format the export properly).
      </p>
    </section>
  );
}

function VoiceBuilderDemo(): JSX.Element {
  const [construct, setConstruct] = createSignal<BuilderConstruct>(DEFAULT_CONSTRUCT);
  const [variant, setVariant] = createSignal<VisualizerVariant>('aurora');
  const [state, setState] = createSignal<VoiceState>('idle');
  const [voiceIn, setVoiceIn] = createSignal(true);
  const [voiceOut, setVoiceOut] = createSignal(true);
  const [headerEnabled, setHeaderEnabled] = createSignal(false);
  const [dockSide, setDockSide] = createSignal<DockSide>('end');
  const [transcriptOpen, setTranscriptOpen] = createSignal(false);
  const [textInput, setTextInput] = createSignal(true);
  const [transcriptDownload, setTranscriptDownload] = createSignal(true);
  const [talkMode, setTalkMode] = createSignal<TalkMode>('push');
  const [captionVariant, setCaptionVariant] = createSignal<CaptionsVariant>('floating');
  const [viewport, setViewport] = createSignal<BuilderViewport>('desktop');

  return (
    <div class="h-screen w-screen">
      <BuilderLayout
        name={construct().name}
        panel={
          <>
            <BuilderPanel value={construct()} onChange={setConstruct} sections={{ layout: false, widget: 'never', provider: true, home: false }} />
            <LayoutSection
              headerEnabled={headerEnabled()}
              onHeaderEnabledChange={setHeaderEnabled}
              dockSide={dockSide()}
              onDockSideChange={setDockSide}
              transcriptOpen={transcriptOpen()}
              onTranscriptOpenChange={setTranscriptOpen}
              textInput={textInput()}
              onTextInputChange={setTextInput}
              transcriptDownload={transcriptDownload()}
              onTranscriptDownloadChange={setTranscriptDownload}
            />
            <VisualizerSection
              variant={variant()}
              onVariantChange={setVariant}
              state={state()}
              onStateChange={setState}
              voiceIn={voiceIn()}
              onVoiceInChange={setVoiceIn}
              voiceOut={voiceOut()}
              onVoiceOutChange={setVoiceOut}
              talkMode={talkMode()}
              onTalkModeChange={setTalkMode}
              captionVariant={captionVariant()}
              onCaptionVariantChange={setCaptionVariant}
            />
          </>
        }
        preview={
          <VoicePreview
            construct={construct()}
            variant={variant()}
            state={state()}
            voiceIn={voiceIn()}
            voiceOut={voiceOut()}
            headerEnabled={headerEnabled()}
            dockSide={dockSide()}
            transcriptOpen={transcriptOpen()}
            onTranscriptOpenChange={setTranscriptOpen}
            textInput={textInput()}
            transcriptDownload={transcriptDownload()}
            talkMode={talkMode()}
            captionVariant={captionVariant()}
            viewport={viewport()}
          />
        }
        viewport={viewport()}
        onViewportChange={setViewport}
      />
    </div>
  );
}

const meta = { title: 'Labs/Builder/Voice', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// BuilderPanel/BuilderLayout are internal to the builder app (src/components/builder-panel.tsx,
// builder-layout.tsx) -- neither ships in a public @kitn.ai/ui entry point. The snippet below
// names the real composition and wiring rather than a package import; AudioVisualizer, Captions
// and ChatThread ARE public (@kitn.ai/ui) and are shown as this preview actually uses them.
const src = (code: string) => ({
  parameters: { docs: { source: { code, language: 'tsx' } } },
});

/**
 * The Voice template's builder, reshaped to a workspace-like layout in an
 * owner design round: a centered `AudioVisualizer` + `Captions` (the new
 * live-caption component) + push-to-talk mic, with a transcript panel
 * (real `ChatThread`, message history + optional text composer) dockable
 * start or end and collapsing completely — a corner button is the only
 * way in while collapsed, which is the default. Panel: Identity, Provider,
 * Theme, Layout (header toggle, dock side, transcript default-open, text-
 * input toggle), Visualizer (variant, demo state, voice in/out). Per T-1a,
 * this template's SHIP gate — a genuine Labs voice-app surface existing
 * first — is unchanged.
 */
export const Voice: Story = {
  render: () => <VoiceBuilderDemo />,
  ...src(`<BuilderLayout
  name={construct.name}
  panel={
    <BuilderPanel
      value={construct}
      onChange={setConstruct}
      sections={{ layout: false, widget: 'never', provider: true, home: false }}
    />
    // ...plus this screen's own Layout and Visualizer sections
  }
  preview={
    <div class="flex h-full flex-col items-center justify-center gap-6">
      <AudioVisualizer variant={variant} state={state} size="xl" label={construct.header?.title + ' voice level'} />
      <Captions segments={captionSegments} variant={captionVariant} />
      {/* transcript: a real ChatThread, dockable start or end, collapsible */}
      <ChatThread class="w-96" messages={messages} chatTitle={construct.header?.title} onSubmit={sendMessage} />
    </div>
  }
  viewport={viewport}
  onViewportChange={setViewport}
/>`),
};
