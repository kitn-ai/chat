import { type JSX, createSignal, createMemo, For } from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Monitor, Tablet, Smartphone, Download } from 'lucide-solid';

export type BuilderViewport = 'desktop' | 'tablet' | 'mobile';

/** Frame widths for the constrained viewports. `desktop` has no entry —
 *  it fills the preview pane exactly as before (no wrapper width at all),
 *  matching the pre-Round-A4 "stub, does nothing" behavior for that case. */
const FRAME_WIDTH: Record<Exclude<BuilderViewport, 'desktop'>, string> = {
  tablet: '768px',
  mobile: '390px',
};

export interface BuilderLayoutProps {
  /** The construct's display name, shown in the toolbar. */
  name: string;
  /** The inspector panel content — typically `<BuilderPanel>`. */
  panel: JSX.Element;
  /** The preview content — typically a device frame wrapping `<ChatThread>`.
   *  Callers that need to reflow their OWN preview at narrower widths (e.g.
   *  a docked-rail template collapsing to full-bleed on `mobile`, matching
   *  `ui/dock.tsx`'s own <=480px takeover) should read `viewport`/
   *  `defaultViewport`/`onViewportChange` below and drive their preview's
   *  shape from the same signal they hand this component — see
   *  `builder-in-app-assistant.stories.tsx` and `builder.stories.tsx` for
   *  the pattern. */
  preview: JSX.Element;
  /** Controlled viewport selection. Omit for uncontrolled (internal) state,
   *  same controlled/uncontrolled convention as `Switch`'s
   *  `checked`/`defaultChecked` and `ToggleChip`'s `pressed`/
   *  `defaultPressed`. A caller that needs to reflow its own `preview` JSX
   *  per viewport (see the doc comment on `preview`) should lift this to a
   *  signal of its own and pass both this and `onViewportChange`. */
  viewport?: BuilderViewport;
  /** Initial viewport when uncontrolled. Defaults to `'desktop'`. */
  defaultViewport?: BuilderViewport;
  /** Fires with the next viewport on chip selection (controlled or not). */
  onViewportChange?: (viewport: BuilderViewport) => void;
  /** Stub export/save action; the real seam (a file write, per the spike) isn't
   *  built here. */
  onSave?: () => void;
  class?: string;
}

const VIEWPORTS: readonly { id: BuilderViewport; label: string; icon: typeof Monitor }[] = [
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'tablet', label: 'Tablet', icon: Tablet },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
];

/**
 * `BuilderLayout` — the two-pane builder shell: a fixed-width scrollable
 * inspector on the left, a live preview on the right over a dotted canvas
 * background (a deliberate "this is a design tool" cue, not a real device
 * emulator). A thin toolbar strip carries the construct name, a viewport
 * toggle, and a stub Export action.
 *
 * The viewport toggle (Round A4 — was a round-1 visual stub) constrains the
 * PREVIEW FRAME's width: `desktop` fills the pane exactly as before (no
 * wrapper, no width style — the historical "stub" behavior for that one
 * case); `tablet`/`mobile` wrap `preview` in a centered frame sized to
 * `FRAME_WIDTH` above (768px / 390px), letting whatever `preview` renders
 * reflow inside it. This is still not a real device emulator — no bezel,
 * no user-agent spoofing, no touch simulation — just a width constraint,
 * consistent with the doc comment this replaced.
 *
 * Pure shell: `panel` and `preview` are handed in as JSX so this component
 * carries no opinion about what fills them; reflowing the CONTENT of
 * `preview` at a given width (rather than just its outer box) is the
 * caller's job — see the `preview` prop's own doc comment.
 */
export function BuilderLayout(props: BuilderLayoutProps): JSX.Element {
  const [internalViewport, setInternalViewport] = createSignal<BuilderViewport>(props.defaultViewport ?? 'desktop');
  const viewport = createMemo(() => props.viewport ?? internalViewport());

  const selectViewport = (id: BuilderViewport): void => {
    if (props.viewport === undefined) setInternalViewport(id);
    props.onViewportChange?.(id);
  };

  const frameStyle = createMemo<JSX.CSSProperties | undefined>(() => {
    const vp = viewport();
    if (vp === 'desktop') return undefined;
    return { width: FRAME_WIDTH[vp], 'max-width': '100%' };
  });

  return (
    <div class={cn('flex h-full w-full flex-col bg-background text-foreground', props.class)} data-builder-layout>
      <header class="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <div class="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span class="inline-block size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span class="truncate">{props.name}</span>
        </div>
        <div class="flex items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Preview viewport">
          <For each={VIEWPORTS}>
            {(vp) => (
              <button
                type="button"
                class={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  viewport() === vp.id
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={viewport() === vp.id}
                onClick={() => selectViewport(vp.id)}
              >
                <vp.icon size={14} aria-hidden="true" />
                <span class="hidden sm:inline">{vp.label}</span>
              </button>
            )}
          </For>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => props.onSave?.()}>
          <Download size={14} aria-hidden="true" />
          Export
        </Button>
      </header>
      <div class="flex flex-1 overflow-hidden">
        <aside class="w-[360px] shrink-0 overflow-y-auto border-r border-border bg-surface/40" data-builder-panel-rail>
          {props.panel}
        </aside>
        <main
          class="flex flex-1 items-center justify-center overflow-auto p-10"
          data-builder-preview
          style={{
            'background-image': 'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
            'background-size': '20px 20px',
          }}
        >
          {/* `display: contents` at `desktop` keeps this wrapper transparent
           *  to `main`'s flex layout — the child preview becomes the flex
           *  item directly, byte-identical to having no wrapper at all — so
           *  the width constraint below only ever changes anything for
           *  `tablet`/`mobile`. */}
          <div
            data-builder-preview-frame
            data-builder-viewport={viewport()}
            class={viewport() === 'desktop' ? 'contents' : 'mx-auto'}
            style={frameStyle()}
          >
            {props.preview}
          </div>
        </main>
      </div>
    </div>
  );
}
