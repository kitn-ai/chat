// THE ONE SCREEN.
//
// A verdict line and a list of calls. No tab bar, no shell, no panel switcher,
// no waterfall, no trace timeline. The tool's job is TRIAGE -- deciding whether
// anything needs attention, and if so which call -- not completeness. Too much
// information is the same as not having enough.
//
// COLOUR IS A SIGNAL, NOT DECORATION, and the rules are absolute:
//   · NO GREEN ANYWHERE. Absence of red is the healthy signal. A green badge on
//     every fine thing is precisely the noise that made earlier attempts
//     unreadable.
//   · Red means a finding. Amber means in flight. Everything else is greyscale.
//   · Colour NEVER encodes format, variant, phase, model or category.
//
// Monospace carries ids, numbers and field names; the kit's UI face carries
// prose. That split is the other half of the legibility.
import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@kitn.ai/ui/solid';
import { findingsFor, foldStreams, streamStatus, type StreamSummary } from './streams';
import { hasFinding, verdictFor } from './verdict';
import { phasesFor } from './observability';
import type { WireDiagnosticEvent } from './contract';
import { loadUi, maxHeight, MIN_HEIGHT, saveUi, type UiState } from './panel-state';

const MAX_ROWS = 100;
const MAX_RAW = 200;

export interface PanelAppProps {
  events: () => WireDiagnosticEvent[];
  hookVersion: () => number | undefined;
  /** Content capture armed. Privacy-relevant, so it is stated persistently. */
  payload: () => boolean;
}

const group = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function humanBytes(n?: number): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${group(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Absent is an em dash, always, and never inferred from anywhere else. */
const dash = (v: unknown): string =>
  v === undefined || v === null || v === '' ? '—' : String(v);

/** `frames → chunks → parts`. Greyscale: the numbers are the information and
 *  the row's red marker already says whether to care. */
const funnel = (s: StreamSummary): string =>
  `${s.frames ?? '—'} → ${s.chunks} → ${Object.values(s.parts).reduce((a, b) => a + b, 0)}`;

export function PanelApp(props: PanelAppProps): JSX.Element {
  const [ui, setUi] = createSignal<UiState>(loadUi());
  const [selected, setSelected] = createSignal<string | undefined>();

  const patch = (next: Partial<UiState>) => {
    const merged = { ...ui(), ...next };
    setUi(merged);
    saveUi(merged);
  };

  const streams = createMemo(() => foldStreams(props.events()).streams);
  const verdict = createMemo(() => verdictFor(streams()));
  const current = createMemo(() => streams().find((s) => s.streamId === selected()));
  const anyFinding = createMemo(() => streams().some(hasFinding));

  // Drawer resize. Hand-rolled: `Resizable` splits panels inside a layout, and
  // this is a fixed-position drawer's outer edge. (Recorded as a primitive gap.)
  let dragFrom: { y: number; height: number } | undefined;
  const onMove = (e: PointerEvent) => {
    if (!dragFrom) return;
    patch({
      height: Math.max(MIN_HEIGHT, Math.min(maxHeight(), dragFrom.height + (dragFrom.y - e.clientY))),
    });
  };
  const endDrag = () => {
    dragFrom = undefined;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
  };
  const startDrag = (e: PointerEvent) => {
    e.preventDefault();
    dragFrom = { y: e.clientY, height: ui().height };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
  };

  return (
    <Show
      when={ui().open}
      fallback={
        <button
          type="button"
          data-testid="launcher"
          aria-label="Open kai devtools"
          class="fixed right-3 bottom-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground shadow-lg hover:border-foreground/40"
          onClick={() => patch({ open: true })}
        >
          <span class="font-semibold">kai</span>
          <span class="text-muted-foreground">{streams().length}</span>
          {/* The ONE piece of colour out here. */}
          <Show when={anyFinding()}>
            <span data-testid="launcher-alert" class="size-1.5 rounded-full bg-red-500" />
          </Show>
        </button>
      }
    >
      <section
        data-testid="drawer"
        class="fixed inset-x-0 bottom-0 z-[2147483000] flex flex-col border-t border-border bg-background"
        style={{ height: `${ui().height}px` }}
      >
        <div
          class="-mt-[3px] h-1.5 shrink-0 cursor-ns-resize hover:bg-foreground/20"
          onPointerDown={startDrag}
          title="Drag to resize"
        />

        <header class="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
          <span class="font-mono text-xs text-muted-foreground">kai devtools</span>
          <Show when={props.payload()}>
            {/* Privacy-relevant: a developer must never be unaware of it. */}
            <span
              data-testid="payload-indicator"
              class="rounded border border-amber-500/50 px-1.5 py-0.5 font-mono text-[10px] text-amber-500"
            >
              content capture on
            </span>
          </Show>
          <span class="flex-1" />
          <Show when={current()}>
            <Button variant="ghost" size="sm" data-testid="back" onClick={() => setSelected(undefined)}>
              ← All calls
            </Button>
          </Show>
          <Button variant="ghost" size="sm" data-testid="close" onClick={() => patch({ open: false })}>
            Close
          </Button>
        </header>

        <Show
          when={current()}
          fallback={<ColdOpen streams={streams()} verdict={verdict()} onPick={setSelected} />}
        >
          {(s) => <Inspector stream={s()} ui={ui()} patch={patch} events={props.events} />}
        </Show>
      </section>
    </Show>
  );
}

/** The cold open: a verdict, and the calls beneath it.
 *
 *  The list stays even when everything is healthy -- a lone verdict line with
 *  nothing under it reads as broken rather than calm. */
function ColdOpen(props: {
  streams: StreamSummary[];
  verdict: { text: string; anomalous: boolean };
  onPick: (id: string | undefined) => void;
}): JSX.Element {
  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <p
        data-testid="verdict"
        data-anomalous={props.verdict.anomalous}
        class={`px-4 py-4 text-lg leading-snug ${
          props.verdict.anomalous ? 'text-red-500' : 'text-foreground'
        }`}
      >
        {props.verdict.text}
      </p>

      <Show when={props.streams.length > 0}>
        <div class="border-t border-border">
          <For each={props.streams}>
            {(s) => (
              <button
                type="button"
                data-testid="call-row"
                data-stream={s.streamId}
                data-finding={hasFinding(s)}
                onClick={() => props.onPick(s.streamId)}
                class="flex w-full items-center gap-3 border-b border-border px-4 py-1.5 text-left font-mono text-xs text-muted-foreground hover:bg-card"
              >
                {/* The only colour in the list. Red = finding, amber = still
                    open, otherwise an invisible spacer so rows stay aligned. */}
                <span
                  data-testid="row-marker"
                  class={`size-1.5 shrink-0 rounded-full ${
                    hasFinding(s)
                      ? 'bg-red-500'
                      : streamStatus(s) === 'open'
                        ? 'bg-amber-500'
                        : 'bg-transparent'
                  }`}
                />
                {/* The facts read left to right as one unit; only the duration
                    is pushed right, where it stays scannable down a column. */}
                <span class="w-16 shrink-0 text-foreground">{dash(s.streamId)}</span>
                <span class="w-56 shrink-0 truncate">{dash(s.model)}</span>
                <span class="shrink-0">{funnel(s)}</span>
                <span class="flex-1" />
                <span class="w-16 shrink-0 text-right">
                  {s.ms !== undefined ? `${group(s.ms)}ms` : streamStatus(s) === 'open' ? 'live' : '—'}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** A titled evidence section, collapsed until asked for. */
function Evidence(props: {
  id: string;
  title: string;
  count?: number;
  ui: UiState;
  patch: (n: Partial<UiState>) => void;
  children: JSX.Element;
}): JSX.Element {
  const open = () => props.ui.sections[props.id] === true;
  return (
    <Collapsible
      open={open()}
      onOpenChange={() =>
        props.patch({ sections: { ...props.ui.sections, [props.id]: !open() } })
      }
    >
      <CollapsibleTrigger
        data-section={props.id}
        class="flex w-full items-center gap-2 border-b border-border px-4 py-2 text-left font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        <span class="text-[9px]">{open() ? '▾' : '▸'}</span>
        {props.title}
        {props.count === undefined ? '' : ` (${group(props.count)})`}
      </CollapsibleTrigger>
      <CollapsibleContent>{props.children}</CollapsibleContent>
    </Collapsible>
  );
}

const Cell = (props: { k: string; v: string }): JSX.Element => (
  <div class="min-w-0">
    <div class="text-[10px] tracking-wide uppercase text-muted-foreground">{props.k}</div>
    <div class="truncate font-mono text-xs text-foreground">{props.v}</div>
  </div>
);

function Inspector(props: {
  stream: StreamSummary;
  ui: UiState;
  patch: (n: Partial<UiState>) => void;
  events: () => WireDiagnosticEvent[];
}): JSX.Element {
  const s = () => props.stream;
  const scoped = () => props.events().filter((e) => e.streamId === s().streamId);
  // ONLY what needs attention. An `ok` finding is a sentence attesting that
  // something is fine, and a list of those is the same noise as a row of green
  // badges -- absence of a finding is the healthy signal, so a clean call gets
  // one short line instead of a wall of reassurance.
  const actionable = () =>
    findingsFor(s()).filter((f) => f.verdict === 'fail' || f.verdict === 'warn');
  const phases = () => phasesFor(s());

  return (
    <div data-testid="inspector" class="min-h-0 flex-1 overflow-y-auto">
      {/* Findings first, as plain sentences: the observation, then the hedged
          suspicion on its own line. No badges, no severity chips -- the words
          carry it, and only a failure is coloured. */}
      <div class="border-b border-border px-4 py-3">
        <For
          each={actionable()}
          fallback={<p class="text-sm text-muted-foreground">Nothing anomalous on this call.</p>}
        >
          {(f) => (
            <div class="mb-3 last:mb-0" data-testid="finding" data-verdict={f.verdict}>
              <p class={`text-sm ${f.verdict === 'fail' ? 'text-red-500' : 'text-foreground'}`}>
                {f.statement}
              </p>
              <Show when={f.detail}>
                <p class="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
              </Show>
            </div>
          )}
        </For>
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-3 border-b border-border px-4 py-3">
        <Cell k="call" v={dash(s().streamId)} />
        <Cell k="model" v={dash(s().model)} />
        <Cell k="format" v={dash(s().format)} />
        <Cell k="source" v={dash(s().source)} />
        <Cell k="finish" v={dash(s().finishReason)} />
        <Cell k="error" v={dash(s().errorCode)} />
        <Cell k="first frame" v={phases().ttfbMs === undefined ? '—' : `${phases().ttfbMs}ms`} />
        <Cell k="total" v={s().ms === undefined ? '—' : `${group(s().ms!)}ms`} />
        <Show when={phases().thinkToAnswerMs !== undefined}>
          <Cell k="think → answer" v={`${phases().thinkToAnswerMs}ms`} />
        </Show>
        <Show when={s().url}>
          <Cell k="endpoint" v={dash(s().url)} />
        </Show>
      </div>

      <Evidence id="frames" title="Frames" count={s().frameRows.length} ui={props.ui} patch={props.patch}>
        <div class="px-4 py-2 font-mono text-xs">
          <Show
            when={s().frameRows.length > 0}
            fallback={<div class="py-2 text-muted-foreground">No frames decoded.</div>}
          >
            <For each={s().frameRows.slice(-MAX_ROWS)}>
              {(f) => (
                <div class="flex gap-3 py-0.5 text-muted-foreground">
                  <span class="w-8 shrink-0 text-right text-foreground">{f.seq}</span>
                  <span class="w-14 shrink-0 text-right">{f.atMs === undefined ? '—' : `+${f.atMs}ms`}</span>
                  <span class="w-16 shrink-0 text-right">{group(f.bytes)} B</span>
                  <span class="w-8 shrink-0 text-right">{f.chunks}</span>
                  <span class="min-w-0 flex-1 truncate">{f.fields.join(' ') || '—'}</span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Evidence>

      <Evidence
        id="parts"
        title="Parts"
        count={Object.values(s().parts).reduce((a, b) => a + b, 0)}
        ui={props.ui}
        patch={props.patch}
      >
        <div class="px-4 py-2 font-mono text-xs text-muted-foreground">
          {Object.entries(s().parts)
            .map(([k, n]) => `${k} ${n}`)
            .join('  ') || 'No parts produced.'}
        </div>
      </Evidence>

      <Show when={s().request}>
        {(req) => (
          <Evidence id="request" title="Request" ui={props.ui} patch={props.patch}>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-3 px-4 py-3">
              <Cell k="format" v={dash(req().format)} />
              <Cell k="messages" v={dash(req().messages)} />
              <Cell k="body" v={humanBytes(req().bodyBytes)} />
              <Cell
                k="parts sent"
                v={Object.entries(req().parts).map(([k, n]) => `${k} ${n}`).join(' ') || '—'}
              />
            </div>
          </Evidence>
        )}
      </Show>

      <Show when={(s().request?.attachments.length ?? 0) > 0}>
        <Evidence
          id="attachments"
          title="Attachments"
          count={s().request!.attachments.length}
          ui={props.ui}
          patch={props.patch}
        >
          <div class="px-4 py-2 font-mono text-xs">
            <For each={s().request!.attachments}>
              {(a) => (
                <div class="flex gap-3 py-0.5">
                  <span class="min-w-0 flex-1 truncate text-foreground">{dash(a.mediaType)}</span>
                  <span class="w-16 shrink-0 text-right text-muted-foreground">{humanBytes(a.bytes)}</span>
                  <span
                    class={`w-20 shrink-0 ${a.disposition === 'skipped' ? 'text-red-500' : 'text-muted-foreground'}`}
                  >
                    {dash(a.disposition)}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Evidence>
      </Show>

      <Evidence id="raw" title="Raw events" count={scoped().length} ui={props.ui} patch={props.patch}>
        <div class="px-4 py-2 font-mono text-xs text-muted-foreground">
          <For each={scoped().slice(-MAX_RAW)}>
            {(e) => (
              <div class="py-px">
                +{(e.t ?? 0) - (scoped()[0]?.t ?? 0)}ms {e.type}
              </div>
            )}
          </For>
        </div>
      </Evidence>
    </div>
  );
}
