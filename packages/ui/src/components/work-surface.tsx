/**
 * `WorkSurface` — the work pane's chrome, PROMOTED from
 * `src/elements/builder-workspace.stories.tsx`'s `WorkPane`/`WorkPaneToolbar`
 * (2026-08-30). That story is the APPROVED DESIGN and was already a working
 * implementation carrying many rounds of recorded owner feedback; the story now
 * renders THIS component instead of its own copy, so the design contract and the
 * product cannot drift apart again.
 *
 * The reasoning below is the story's, carried over verbatim in substance —
 * read `builder-workspace.stories.tsx`'s module comment for the full record:
 *
 *  - The toolbar mirrors Lovable's browser chrome (`elements/lovable.stories.tsx`,
 *    read line by line in that round): a device toggle · a READ-ONLY URL bar
 *    (lock icon + address text, never an editable field) · an open-in-new-tab
 *    button · an expand toggle · a Preview|Code segmented toggle with PREVIEW
 *    FIRST (Lovable's own `TABS` order).
 *  - Every affordance is independently optional. `showCodeView={false}` REMOVES
 *    the Preview|Code toggle entirely rather than disabling it — "someone may
 *    want preview-only" (owner's brief) — and the surface then always renders
 *    its preview branch.
 *  - The device toggle scales the PREVIEW canvas only, NEVER the Code view,
 *    mirroring Lovable, whose device toggle only ever wraps its
 *    `tab() === 'preview'` branch.
 *  - `expanded` is CONTROLLED, never owned here. The story checked v0's
 *    kai-resizable maximize protocol first and found `WorkspaceShell` does not
 *    forward `maximizedIndex`/`onMaximizeChange`; it wires expand to
 *    `WorkspaceShell`'s real controlled `startCollapsed` instead (collapse the
 *    chat rail, click again to restore). This component therefore reports the
 *    toggle and lets its host own the shell — codegen wires
 *    `startCollapsed={...}` on the emitted `WorkspaceShell`.
 *
 * TWO DELIBERATE CHANGES FROM THE STORY, both decided loudly:
 *  1. The preview branch frames `src` through the kit's own `Artifact` with
 *     every Artifact toolbar flag OFF — Artifact is the bare sandboxed frame
 *     here, this component is the chrome. That reuses ONE iframe sandbox
 *     (`allow-scripts allow-forms`, no `allow-same-origin`) and ONE url policy
 *     (`isSafeUrl`, inside Artifact) rather than authoring a second of either.
 *     With no `src`, `preview` renders instead — which is the path the story
 *     takes with its stub tiles.
 *  2. Open-in-new-tab is WIRED, through `ArtifactController.openExternal()`
 *     (which already filters the scheme and warns on a refusal). The story's
 *     button had no `onClick` at all; a button that does nothing is exactly the
 *     dead affordance this repo's menu-honesty rule rejects.
 *
 * STYLING: plain inline `color-mix()`, not a Tailwind opacity-modifier class.
 * That is the story's own precedent and `components/builder-skeleton.tsx`'s
 * `mix()` doc comment explains why (a fresh opacity-modifier combination proved
 * non-deterministic under the Storybook dev server's JIT pass). The helper is
 * inlined rather than imported: `builder-skeleton.tsx` is builder-story
 * furniture and this is a public component.
 */
import { type JSX, Show, For, createMemo, createSignal } from 'solid-js';
import { Code2, Globe, Monitor, Tablet, Smartphone, Lock, ExternalLink, Maximize2, Minimize2 } from 'lucide-solid';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Artifact, type ArtifactController, type ArtifactTab } from './artifact';

/** The pane's own device canvas. Independent of `builder-layout.tsx`'s
 *  `BuilderViewport`, which scales the whole BUILDER frame. */
export type WorkSurfaceDevice = 'desktop' | 'tablet' | 'mobile';

const DEVICES: readonly { id: WorkSurfaceDevice; label: string; Icon: typeof Monitor }[] = [
  { id: 'desktop', label: 'Desktop', Icon: Monitor },
  { id: 'tablet', label: 'Tablet', Icon: Tablet },
  { id: 'mobile', label: 'Mobile', Icon: Smartphone },
];

/** Lovable's own `DEVICE_W` shape: the preview canvas takes a max-width and
 *  centers. ONE definition — the story reads it from here. */
export const WORK_SURFACE_DEVICE_WIDTHS: Record<WorkSurfaceDevice, string> = {
  desktop: '100%',
  tablet: '834px',
  mobile: '390px',
};

/** The story's own recorded reasoning, carried over: the surrounding viewport —
 *  behind BOTH the preview and the code branch, which share one root — sits on a
 *  MUTED backdrop, matching `elements/lovable.stories.tsx`'s real preview surface
 *  (its right `<section>`, read line by line: the muted token at 30% around
 *  toolbar + canvas, the toolbar bar itself lighter, and the previewed content
 *  card bordered ON TOP of the muted backdrop). The literal Tailwind
 *  opacity-modifier class for that is deliberately NOT used even though it is
 *  the token Lovable uses — see this module's STYLING note. (Not spelled out
 *  here either: `tests/styles/shadow-sheet-scan.test.ts` extracts class tokens
 *  from shipped source as TEXT, so naming one in a comment makes the sheet
 *  compile a utility nothing renders.) */
const TOOLBAR_BG = 'color-mix(in oklab, var(--color-muted) 20%, transparent)';
const CANVAS_BG = 'color-mix(in oklab, var(--color-muted) 30%, transparent)';

/** What the Code tab shows when nothing has been pointed at it — the state a
 *  construct reaches with `chrome.codeView: true` and no `codeUrl`, which is
 *  VALID vocabulary (owner ruling, 2026-08-30: the toggle has to be reachable
 *  out of the box, so an unset source is an empty state and not an authoring
 *  error).
 *
 *  Deliberately the same shape and voice as the preview placeholder codegen
 *  emits (`emitWorkSurfacePage` in `agent-tooling/construct/codegen.ts`): a
 *  short headline, what the surface is, and the one key that replaces it. The
 *  difference is that this one is a COMPONENT, not an emitted HTML file — it
 *  renders in the host document with the kit's tokens available, and it lives
 *  here so the story and the emitted app share one copy of it. */
function CodeTabEmpty(): JSX.Element {
  return (
    <div
      class="mx-auto flex h-full max-w-lg flex-col justify-center gap-2 px-2 text-sm"
      data-kai-work-surface-code-empty
    >
      <h2 class="text-base font-semibold text-foreground">Nothing to read yet</h2>
      <p class="text-muted-foreground">
        This tab frames the source behind the preview. Nothing has been pointed at it, so there is nothing to show.
      </p>
      <p class="text-muted-foreground">
        Point <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">workSurface.codeUrl</code> at
        the file you want read here, and it loads in place of this message.
      </p>
    </div>
  );
}

export interface WorkSurfaceProps {
  /** URL the preview frames, through `Artifact`'s sandboxed iframe. Omit to
   *  render `preview` instead (the story's stub path). */
  src?: string;
  /** Preview content used when `src` is absent. */
  preview?: JSX.Element;
  /** URL the Code tab frames. The Preview|Code toggle needs `showCodeView`;
   *  what it SHOWS is this, or `code`. */
  codeSrc?: string;
  /** Code-tab content used when `codeSrc` is absent. With neither, the tab
   *  renders `CodeTabEmpty` — see its doc comment. */
  code?: JSX.Element;
  /** Address text shown in the read-only URL bar. Defaults to `src`. */
  urlLabel?: string;
  /** Accessible title for the framed document. */
  iframeTitle?: string;
  /** `'preview'` fills the canvas edge to edge (a browser preview);
   *  `'artifact'` centers the content in a bordered card on the muted
   *  backdrop (a framed artifact). Default `'preview'` — the story's look. */
  variant?: 'artifact' | 'preview';

  /** Controlled tab. Reuses `ArtifactTab` — one union, never a second. */
  tab?: ArtifactTab;
  /** Uncontrolled initial tab. Default `'preview'`. */
  defaultTab?: ArtifactTab;
  onTabChange?: (tab: ArtifactTab) => void;

  /** Controlled device. Uncontrolled (internal signal) when omitted. */
  device?: WorkSurfaceDevice;
  onDeviceChange?: (device: WorkSurfaceDevice) => void;

  /** Controlled expand state — this component never owns it; the host wires it
   *  to `WorkspaceShell`'s `startCollapsed`. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;

  showDeviceToggle?: boolean;
  showUrlBar?: boolean;
  /** Asks for the open-in-new-tab button. It renders only when there is also
   *  a `src` to open — see the Show at its site. */
  showOpenInNewTab?: boolean;
  showExpand?: boolean;
  /** `false` REMOVES the Preview|Code toggle entirely (the story's own rule),
   *  and the surface always renders its preview branch. */
  showCodeView?: boolean;

  class?: string;
}

export function WorkSurface(props: WorkSurfaceProps): JSX.Element {
  const [internalDevice, setInternalDevice] = createSignal<WorkSurfaceDevice>('desktop');
  const [internalTab, setInternalTab] = createSignal<ArtifactTab>(props.defaultTab ?? 'preview');
  let controller: ArtifactController | undefined;

  const device = (): WorkSurfaceDevice => props.device ?? internalDevice();
  const setDevice = (next: WorkSurfaceDevice): void => {
    if (props.device === undefined) setInternalDevice(next);
    props.onDeviceChange?.(next);
  };
  const rawTab = (): ArtifactTab => props.tab ?? internalTab();
  // `showCodeView: false` cannot leave the surface stranded on a tab whose
  // toggle no longer exists.
  const tab = createMemo<ArtifactTab>(() => (props.showCodeView ? rawTab() : 'preview'));
  const setTab = (next: ArtifactTab): void => {
    if (props.tab === undefined) setInternalTab(next);
    props.onTabChange?.(next);
  };
  const variant = (): 'artifact' | 'preview' => props.variant ?? 'preview';

  const segment = (active: boolean): string =>
    cn(
      'transition-colors',
      active ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <div
      class={cn('flex h-full min-w-0 flex-1 flex-col', props.class)}
      style={{ 'background-color': CANVAS_BG }}
      data-kai-work-surface
      data-kai-work-surface-tab={tab()}
    >
      <div
        class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3"
        style={{ 'background-color': TOOLBAR_BG }}
        data-kai-work-surface-toolbar
      >
        <Show when={props.showDeviceToggle}>
          <div class="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Pane device">
            <For each={DEVICES}>
              {(d) => (
                <button
                  type="button"
                  aria-label={d.label}
                  aria-pressed={device() === d.id}
                  class={cn('grid size-7 place-items-center rounded-md', segment(device() === d.id))}
                  onClick={() => setDevice(d.id)}
                >
                  <d.Icon size={14} aria-hidden="true" />
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show
          when={props.showUrlBar}
          fallback={<div class="min-w-0 flex-1" />}
        >
          <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
            <Lock size={13} class="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="truncate font-mono text-xs text-muted-foreground">{props.urlLabel ?? props.src ?? ''}</span>
          </div>
        </Show>

        {/* `src` as well as the flag: open-in-new-tab opens the framed
            document, and with no `src` there is no `Artifact`, so no
            `controller` — the button would render and do NOTHING. Asking for
            the affordance is not the same as having something behind it, and
            this repo's menu-honesty rule is that an affordance with nothing
            behind it must not render at all (2026-08-30). The construct
            schema makes `workSurface.url` REQUIRED for the same reason, so
            an emitted app never reaches this branch; the story's stub path
            does. */}
        <Show when={props.showOpenInNewTab && props.src}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Open in new tab"
            onClick={() => controller?.openExternal()}
          >
            <ExternalLink size={14} aria-hidden="true" />
          </Button>
        </Show>

        <Show when={props.showExpand}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={props.expanded ? 'Restore split' : 'Expand work pane'}
            aria-pressed={!!props.expanded}
            onClick={() => props.onExpandedChange?.(!props.expanded)}
          >
            {props.expanded ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
          </Button>
        </Show>

        <Show when={props.showCodeView}>
          <div class="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Pane kind">
            <button
              type="button"
              class={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium', segment(tab() === 'preview'))}
              aria-pressed={tab() === 'preview'}
              onClick={() => setTab('preview')}
            >
              <Globe size={13} aria-hidden="true" />
              Preview
            </button>
            <button
              type="button"
              class={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium', segment(tab() === 'code'))}
              aria-pressed={tab() === 'code'}
              onClick={() => setTab('code')}
            >
              <Code2 size={13} aria-hidden="true" />
              Code
            </button>
          </div>
        </Show>
      </div>

      <div class="min-h-0 flex-1 overflow-auto p-5">
        <Show
          when={tab() === 'preview'}
          fallback={
            // `codeSrc` first, then whatever `code` the host projects (the
            // story's StubCodeBlock), then the honest empty state. Rendering
            // NOTHING here was the third option and it is the one this
            // replaces: a blank pane says the tab is broken, not that no
            // source has been chosen.
            <Show when={props.codeSrc} fallback={props.code ?? <CodeTabEmpty />}>
              {(codeSrc) => (
                <Artifact
                  src={codeSrc()}
                  iframeTitle={props.iframeTitle ? `${props.iframeTitle} — source` : 'Source'}
                  showNav={false}
                  showReload={false}
                  showHome={false}
                  showPathField={false}
                  showTabs={false}
                  expandable={false}
                  openInTab={false}
                />
              )}
            </Show>
          }
        >
          {/* The device toggle scales THIS branch only — never the Code view
              (Lovable's own rule, carried over from the story). */}
          <div
            class={cn(
              'mx-auto h-full transition-all duration-300',
              variant() === 'artifact' && 'overflow-hidden rounded-xl border border-border bg-background',
            )}
            style={{ 'max-width': WORK_SURFACE_DEVICE_WIDTHS[device()] }}
            data-kai-work-surface-canvas
          >
            <Show when={props.src} fallback={props.preview}>
              {(src) => (
                <Artifact
                  src={src()}
                  iframeTitle={props.iframeTitle ?? 'Work surface'}
                  showNav={false}
                  showReload={false}
                  showHome={false}
                  showPathField={false}
                  showTabs={false}
                  expandable={false}
                  openInTab={false}
                  controllerRef={(api) => (controller = api)}
                />
              )}
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
