/**
 * The kai dev --builder page (B-22/B-23): Start screen over the registry
 * (buildable cards + the scratch row), WorkspaceVariantPicker for the one
 * multi-variant family, a constructTagName prompt, then the derived panel
 * beside an iframe of the generated project's own Vite dev server. The
 * construct FILE is the single source of truth: every edit POSTs to the
 * validate-then-write endpoint (a rejection reports pathed problems and
 * writes nothing — the last-good preview stands), and external hand-edits
 * flow back in through the SSE 'construct' event the watcher broadcasts.
 */
import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { SlidersHorizontal } from 'lucide-solid';
import { BuilderStart, BUILDABLE_BUILDER_TEMPLATES, type BuilderTemplateId } from '../components/builder-start';
import { WorkspaceVariantPicker, type WorkspaceVariantId } from '../components/builder-workspace-variants';
import { DerivedBuilderPanel } from '../components/builder-panel-derived';
import { BuilderHeader } from '../components/builder-header';
import { buildableTemplates, templateById, inferTemplateId, type BuildableTemplate } from '../agent-tooling/construct/templates';
import type { Construct, ConstructProblem } from '../agent-tooling/construct/schema';
import { createEditGuard } from './edit-guard';
import { ToastRegion, type ToastItem, type ToastVariant } from '../components/toast';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

// The AI/UI brand magenta — matches builder-start.stories.tsx's own
// BRAND_STYLE exactly (design-parity fix wave, 2026-08-29 audit item 3a).
// `builder-start.tsx` stays token-only (`var(--color-primary)` inside the
// illustrations, `border-primary`/`ring-primary` on the card) — the kit's
// own default `--color-primary` is a neutral near-black/near-white (a
// white-label component library; a real construct sets its own accent), so
// wherever BuilderStart renders as a standalone "pick a template" screen
// (this page's Start screen AND its Switch-template overlay) it needs the
// same one-off "and here, brand it" the story already does. Setting
// `--color-primary` directly, not `--kai-color-primary`: the indirection
// (`theme.css`'s `--color-primary: var(--kai-color-primary, <fallback>)`)
// only re-resolves where `--color-primary` itself is DECLARED
// (`:root`/`:host`/`.dark`), so setting the indirection var on a descendant
// div never reaches it — see the story's own comment for the full story.
export const BRAND_STYLE = { '--color-primary': '#EC2295' } as const;

/** The pre-panel canvas, shared by every step before the panel takes over the
 *  viewport. It exists as ONE function because the variant and name steps
 *  shipped without it: the variant picker was `max-w-4xl p-8` with no brand
 *  style, so the owner's own run showed a black-and-white picker whose cards
 *  were visibly narrower than the Start screen's — the picker component is
 *  already at Step 1's scale (`builder-workspace-variants.tsx`: same `h-44`
 *  media, same `sm:grid-cols-2 lg:grid-cols-3` grid, per an explicit owner
 *  correction recorded there), so the smaller cards were purely this page's
 *  narrower container squeezing a 3-column grid. Restating the classes per
 *  step is what let them drift; deriving them cannot. */
const canvas = (width: 'max-w-6xl' | 'max-w-md'): string => `mx-auto flex ${width} flex-col gap-6 py-10`;

/** The honest version of a preview that is not up yet. Exported so the test
 *  asserts the string the page actually renders rather than a copy of it. */
export const PREVIEW_STARTING_MESSAGE =
  'Starting the preview — installing dependencies, this can take a minute on the first run.';

type Screen =
  | { step: 'start' }
  | { step: 'variant'; templateId: 'workspace' }
  | { step: 'name'; templateId: BuilderTemplateId; variantId?: WorkspaceVariantId }
  | { step: 'panel' };

/** Scratch is not a registry template (builder-start.tsx's own rule): a bare
 *  fullscreen mock chat, edited through a default manifest of every
 *  non-layout-scoped section. */
const SCRATCH_TEMPLATE: BuildableTemplate = {
  id: 'assistant', // manifest/type anchor only; the id is never shown for scratch
  name: 'Scratch',
  description: 'A bare chat, everything off.',
  availability: 'buildable',
  starter: { name: 'my-chat', layout: 'fullscreen', provider: { mode: 'mock' } },
  controls: [
    { id: 'identity', paths: ['name'] },
    { id: 'theme', paths: ['theme.accent', 'theme.mode', 'theme.unreadColor'] },
    { id: 'header', paths: ['header.title'] },
    { id: 'capabilities', paths: ['capabilities.starters', 'capabilities.attachments', 'capabilities.history', 'capabilities.conversations', 'capabilities.reasoning', 'capabilities.reasoningOpen'] },
    { id: 'provider', paths: ['provider'] },
  ],
};

/** SSE frames carry JSON; a malformed one must not take the listener (and with
 *  it every later event) down. */
function readEventData<T>(e: Event): Partial<T> {
  try {
    return JSON.parse((e as MessageEvent).data || '{}') as Partial<T>;
  } catch {
    return {};
  }
}

export function App() {
  const [screen, setScreen] = createSignal<Screen>({ step: 'start' });
  const [template, setTemplate] = createSignal<BuildableTemplate>(SCRATCH_TEMPLATE);
  const [construct, setConstruct] = createSignal<Construct | undefined>();
  const [previewUrl, setPreviewUrl] = createSignal<string | undefined>();
  // The preview boots in the BACKGROUND now (dev.ts: POST /api/create responds
  // as soon as the construct file exists), so the panel has to be able to say
  // "not yet, and here is why" rather than showing a blank pane for ~28s.
  const [previewPending, setPreviewPending] = createSignal(false);
  const [previewError, setPreviewError] = createSignal<string | undefined>();
  const [creating, setCreating] = createSignal(false);
  const [problems, setProblems] = createSignal<readonly ConstructProblem[]>([]);
  const [pickedId, setPickedId] = createSignal<BuilderTemplateId | undefined>();
  const [name, setName] = createSignal('');
  const [confirmSwitch, setConfirmSwitch] = createSignal(false);
  // The theme-studio takeover (owner's choice: the studio replaces the ENTIRE
  // canvas + sidebar under the header, not a cramped modal). `available` is a
  // three-state probe: undefined = checking, false = the /theme-studio/ route
  // isn't in this build (friendly placeholder), true = iframe it.
  const [themeStudio, setThemeStudio] = createSignal(false);
  const [themeStudioAvailable, setThemeStudioAvailable] = createSignal<boolean | undefined>();
  // The kit's own Toast (F-48 adopt-if-present), bottom-right. The builder page
  // is light-DOM Solid with no kai-* elements registered, so the imperative
  // `toast()` singleton (which mounts a <kai-toast-region> custom element) has
  // nothing to upgrade it — the ToastRegion COMPONENT with a local list is the
  // same kit toast without the element dependency.
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);
  let toastCounter = 0;
  const raiseToast = (message: string, variant: ToastVariant, description?: string): void => {
    toastCounter += 1;
    setToasts((list) => [...list, {
      id: `builder-toast-${toastCounter}`,
      message,
      variant,
      description,
      // A bare confirmation reads fine as a pill; anything carrying a server
      // message needs the card's description line.
      appearance: description ? 'card' : 'pill',
    }]);
  };
  const dismissToast = (id: string): void => { setToasts((list) => list.filter((t) => t.id !== id)); };
  // F1: one persistent banner across every server round-trip site (load,
  // SSE refetch, create, edit). Server-down (fetch throws) or a non-422
  // non-2xx response sets it; the NEXT successful round-trip on ANY of
  // those sites clears it — a 422 is a validation rejection, not a server
  // problem, so it never touches this signal.
  const [serverError, setServerError] = createSignal<string | undefined>();

  onMount(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`GET /api/state → ${res.status}`);
      const state = await res.json();
      if (state.phase === 'panel') {
        const loaded = state.construct as Construct;
        setConstruct(loaded);
        setPreviewUrl(state.previewUrl);
        setPreviewPending(Boolean(state.previewPending));
        setPreviewError(state.previewError);
        // The header label is DERIVED from the loaded construct's own shape
        // (inferTemplateId) rather than defaulting to the scratch manifest —
        // a construct file carries no template id, but its layout/capabilities
        // shape is enough to place it back into its family (or fall back to a
        // neutral label built from its own name, never "Scratch").
        setTemplate(templateForLoadedConstruct(loaded));
        setScreen({ step: 'panel' });
      }
      setServerError(undefined);
    } catch {
      setServerError("can't reach the builder server");
    }

    const events = new EventSource('/api/events');
    events.onopen = () => setServerError(undefined);
    events.addEventListener('construct', async () => {
      try {
        const res = await fetch('/api/construct');
        if (!res.ok) throw new Error(`GET /api/construct → ${res.status}`);
        const body = (await res.json()) as (Construct & { problems?: ConstructProblem[] });
        // F5: the file on disk can be invalid mid external-hand-edit. The
        // SERVER validates (dev.ts already carries zod; the page bundle does
        // not) and adds a `problems` field rather than the page pulling in
        // validateConstruct itself. On an invalid file, surface the problems
        // and keep the last-good construct/preview standing instead of
        // clobbering them with the bad shape.
        if (body.problems) {
          setProblems(body.problems);
        } else {
          setConstruct(body as Construct);
          setTemplate(templateForLoadedConstruct(body as Construct));
          setProblems([]);
        }
        setServerError(undefined);
      } catch {
        setServerError("can't reach the builder server");
      }
    });
    // The other half of the background boot: the server announces the preview
    // when Vite is genuinely listening, over the same hub the 'construct'
    // event already uses. Until then the panel is live and the preview pane
    // says so.
    events.addEventListener('preview', (e) => {
      const url = readEventData<{ previewUrl?: string }>(e).previewUrl;
      if (!url) return;
      setPreviewUrl(url);
      setPreviewPending(false);
      setPreviewError(undefined);
    });
    events.addEventListener('preview-error', (e) => {
      const message = readEventData<{ message?: string }>(e).message ?? 'the preview server failed to start';
      setPreviewPending(false);
      setPreviewError(message);
      setServerError(`preview failed to start — ${message}`);
    });
    events.onerror = () => setServerError("can't reach the builder server");
    onCleanup(() => events.close());
  });

  /** A loaded construct carries no template id (T-3), so the header label is
   *  derived from the construct's own shape via inferTemplateId — fixing the
   *  reload bug where the panel kept showing the in-memory Start-screen pick
   *  ("Scratch") regardless of what was actually loaded. An unrecognized
   *  shape (layout: 'custom', or anything inferTemplateId can't place) falls
   *  back to a neutral label built from the construct's own name rather than
   *  guessing — SCRATCH_TEMPLATE's controls manifest still applies since it
   *  is the generic common-sections editor. */
  const templateForLoadedConstruct = (c: Construct): BuildableTemplate => {
    const id = inferTemplateId(c);
    if (id) {
      const entry = templateById(id);
      if (entry && entry.availability === 'buildable') return entry;
    }
    return { ...SCRATCH_TEMPLATE, name: c.name };
  };

  const templateFor = (id: BuilderTemplateId): BuildableTemplate =>
    id === 'scratch' ? SCRATCH_TEMPLATE : buildableTemplates().find((t) => t.id === id) ?? SCRATCH_TEMPLATE;

  const onPick = (id: BuilderTemplateId) => {
    setPickedId(id);
    if (id === 'workspace') setScreen({ step: 'variant', templateId: 'workspace' });
    else {
      setName(templateFor(id).starter.name);
      setScreen({ step: 'name', templateId: id });
    }
  };

  const create = async (variantId?: WorkspaceVariantId) => {
    if (creating()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: pickedId(), variantId, name: name() }),
      });
      if (res.status === 422) {
        setProblems(((await res.json()).problems as ConstructProblem[] | undefined) ?? []);
        setServerError(undefined); // reachable — this is a validation rejection, not a server problem
        return;
      }
      if (!res.ok) throw new Error(`POST /api/create → ${res.status}`);
      const body = await res.json();
      setTemplate(templateFor(pickedId()!));
      setConstruct(body.construct as Construct);
      // The server responds the moment the construct file exists, so
      // previewUrl is normally absent here and `previewPending` is the truth:
      // go STRAIGHT to the panel (the file is the state — B-22) and let the
      // preview pane be honest about what is still happening behind it.
      setPreviewUrl(body.previewUrl);
      setPreviewPending(Boolean(body.previewPending));
      setPreviewError(undefined);
      setProblems([]);
      setServerError(undefined);
      setScreen({ step: 'panel' });
    } catch {
      setServerError('save failed');
    } finally {
      setCreating(false);
    }
  };

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  // The write that has been SCHEDULED but not yet handed to submitEdit. The
  // header's Save button is honest about this exact window: `dirty` is true
  // from the keystroke until the debounce (or an explicit Save click) flushes
  // it, and false once the file write round-tripped. There is ONE persistence
  // path — the debounced POST — and Save merely flushes it early.
  let pendingConstruct: Construct | undefined;
  const [dirty, setDirty] = createSignal(false);
  const [savingNow, setSavingNow] = createSignal(false);
  // F2: each edit's POST can outlive the next one (slow network, a burst of
  // keystrokes past the debounce). createEditGuard's monotonic request id,
  // bumped the instant a new submit() starts, drops a response that arrives
  // after a newer edit already superseded it — see edit-guard.ts and its
  // test for the out-of-order case this guards against.
  const submitEdit = createEditGuard((next) =>
    fetch('/api/construct', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    }),
  );
  const flushSave = async () => {
    clearTimeout(debounceTimer);
    const next = pendingConstruct;
    if (!next) return; // nothing pending — Save is disabled here anyway
    pendingConstruct = undefined;
    setSavingNow(true);
    const outcome = await submitEdit(next);
    setSavingNow(false);
    if (!outcome) return; // stale — a newer edit's own flush owns the signals
    if (pendingConstruct === undefined) setDirty(false); // no newer edit arrived mid-POST
    setProblems(outcome.problems);
    setServerError(outcome.serverError);
  };
  const onEdit = (next: Construct) => {
    setConstruct(next); // optimistic — the panel stays live while typing
    pendingConstruct = next;
    setDirty(true);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void flushSave(), 300);
  };

  const switchTemplate = async (id: BuilderTemplateId) => {
    // T-2: switching templates resets the construct to the new starter —
    // confirmed by the dialog that opened this path. The NAME is preserved
    // (it is the author's identity choice, not template data).
    const starter = templateFor(id).starter;
    const next = { ...starter, name: construct()?.name ?? starter.name } as Construct;
    setTemplate(templateFor(id));
    setConfirmSwitch(false);
    onEdit(next);
  };

  // ---- Preview canvas mode (the header's sun/moon) -------------------------
  // The preview is a cross-origin iframe of the GENERATED app, so its theme
  // is not a class this page can toggle: theme.mode lives in the construct
  // file, and the toggle writes 'light'|'dark' through the same onEdit →
  // POST /api/construct path every panel control uses — the preview follows
  // via the normal file→HMR loop. The builder's own chrome stays dark
  // (index.html's class="dark") regardless.
  const prefersDark = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const canvasDark = (): boolean => {
    const mode = construct()?.theme?.mode ?? 'system';
    // 'system' resolves the way the generated app resolves it: the OS
    // preference (sampled once at load — good enough for an icon).
    return mode === 'dark' || (mode === 'system' && prefersDark);
  };
  const toggleCanvasMode = () => {
    const c = construct();
    if (!c) return;
    onEdit({ ...c, theme: { ...c.theme, mode: canvasDark() ? 'light' : 'dark' } });
  };

  // ---- Theme-studio takeover ----------------------------------------------
  const openThemeStudio = async () => {
    setThemeStudio(true);
    if (themeStudioAvailable()) return; // probed good earlier this session
    try {
      const res = await fetch('/theme-studio/');
      setThemeStudioAvailable(res.ok);
    } catch {
      setThemeStudioAvailable(false);
    }
  };
  /** 'kai-theme-apply' hands us full light/dark --kai-* token maps. The
   *  construct schema's `theme.tokens` (landing in this same round) holds the
   *  whole payload; `theme.accent` keeps getting the applied primary for
   *  back-compat (tokens win over accent downstream). The flush is awaited so
   *  the toast reports what actually happened: on a rejection (a dist whose
   *  schema predates theme.tokens, or an invalid payload) fall back to the
   *  accent-only write and SAY the full palette wasn't saved — decide loudly. */
  const applyStudioTheme = async (payload: { light?: Record<string, string>; dark?: Record<string, string>; radius?: string; fonts?: Record<string, string> }) => {
    const c = construct();
    if (!c) return;
    const accent = payload.light?.['--kai-color-primary'];
    const tokens = {
      ...(payload.light && Object.keys(payload.light).length ? { light: payload.light } : {}),
      ...(payload.dark && Object.keys(payload.dark).length ? { dark: payload.dark } : {}),
      ...(payload.radius ? { radius: payload.radius } : {}),
      ...(payload.fonts && Object.keys(payload.fonts).length ? { fonts: payload.fonts } : {}),
    };
    // The cast keeps this compiling on either side of the schema round that
    // adds `tokens` to Construct['theme']; the server's validation is the real
    // gate, and its rejection is handled below rather than swallowed.
    const fullTheme = { ...c.theme, mode: c.theme?.mode ?? 'system', ...(accent ? { accent } : {}), tokens } as Construct['theme'];
    onEdit({ ...c, theme: fullTheme });
    await flushSave();
    if (problems().length === 0 && !serverError()) {
      raiseToast('Theme applied', 'success');
      return;
    }
    const detail = problems().map((p) => `${p.path}: ${p.message}`).join('; ') || serverError() || 'the server rejected the write';
    if (accent) {
      // Accent-only retry — the pre-tokens construct shape every dist accepts.
      onEdit({ ...c, theme: { ...c.theme, mode: c.theme?.mode ?? 'system', accent } });
      await flushSave();
      if (problems().length === 0 && !serverError()) {
        raiseToast("Couldn't save the full palette — kept the accent color", 'warning', detail);
      } else {
        raiseToast('Theme not saved', 'error', detail);
      }
    } else {
      raiseToast('Theme not saved', 'error', detail);
    }
  };
  onMount(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return; // the studio is same-origin; everything else is noise
      const data = e.data as { type?: unknown } | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'kai-theme-close') setThemeStudio(false);
      else if (data.type === 'kai-theme-apply') void applyStudioTheme(data as Parameters<typeof applyStudioTheme>[0]);
      // 'kai-theme-change' (the studio's live-preview stream) has nowhere to
      // land here: the preview iframe is the generated app on its own origin
      // and follows the construct FILE, so unpersisted changes stay the
      // studio's own preview. Apply is the moment anything persists.
    };
    // Captured at setup: teardown can run after the test harness tore the DOM
    // globals down, so the cleanup must not reach for bare `window` (same
    // class the teardown-without-dom-globals test pins across components).
    const win = window;
    win.addEventListener('message', onMessage);
    onCleanup(() => win.removeEventListener('message', onMessage));
  });

  return (
    <div class="min-h-dvh bg-background text-foreground">
      {/* F1: one persistent banner over every screen — server-down or a
       *  non-422 write failure needs to be visible no matter which step the
       *  page is on, not just inside the panel. */}
      <Show when={serverError()}>
        <div role="alert" class="sticky top-0 z-10 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive dark:bg-destructive/15 dark:text-red-400">
          {serverError()}
        </div>
      </Show>
      <Show when={screen().step === 'start'}>
        {/* Layout/spacing/grid matched to builder-start.stories.tsx's
            `StartDemo` (design-parity fix wave item 3a): max-w-6xl (was
            max-w-4xl — the story's wider canvas is what lets the 3-column
            grid breathe instead of feeling squeezed), the same
            flex-col/gap-6/py-10 rhythm instead of ad hoc mb-* spacing, and
            the brand accent below. BuilderStart itself is unchanged —
            already shared with the story; this was page-level CSS only. */}
        <main class={canvas('max-w-6xl')} style={BRAND_STYLE} data-builder-step="start">
          <div class="flex flex-col gap-1">
            <h1 class="text-xl font-semibold text-foreground">Start a construct</h1>
            <p class="text-sm text-muted-foreground">Pick a template. You will get a live preview and a construct file you own.</p>
          </div>
          <BuilderStart templates={BUILDABLE_BUILDER_TEMPLATES} value={pickedId()} onSelect={onPick} />
        </main>
      </Show>
      <Show when={screen().step === 'variant'}>
        {/* Same canvas and same brand accent as Start (owner-found, live run:
            "just black and white, no design colors like the first screen and
            the panels looked smaller"). It was `max-w-4xl p-8` with no
            BRAND_STYLE — a 3-column grid in a 4xl container is what shrank the
            cards; the picker itself was already at Step 1's scale. */}
        <main class={canvas('max-w-6xl')} style={BRAND_STYLE} data-builder-step="variant">
          <WorkspaceVariantPicker
            onBack={() => setScreen({ step: 'start' })}
            onSelect={(variantId) => { setName(templateFor('workspace').starter.name); setScreen({ step: 'name', templateId: 'workspace', variantId }); }}
          />
        </main>
      </Show>
      <Show when={screen().step === 'name'}>
        {(_) => {
          const s = screen() as Extract<Screen, { step: 'name' }>;
          return (
            // No design story models this step (it exists only because the
            // real builder writes an actual file to disk and needs a name
            // up front — audit item 4). Item 3c: give it the Start screen's
            // own title/description rhythm and tokens rather than a bare
            // label, kept minimal since there's a single field. The WIDTH
            // stays max-w-md deliberately (one input; a 6xl canvas around a
            // lone text field reads as a mistake) — the brand accent was the
            // real omission here, and it is what colors the field's focus
            // ring and the Create button to match the two screens before it.
            <main class={canvas('max-w-md')} style={BRAND_STYLE} data-builder-step="name">
              <div class="flex flex-col gap-1">
                <h1 class="text-xl font-semibold text-foreground">Name your element</h1>
                <p class="text-sm text-muted-foreground">The emitted custom-element tag: lowercase, with a hyphen (e.g. acme-support).</p>
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="construct-name" class="text-xs font-medium text-foreground">Element name</label>
                <Input id="construct-name" value={name()} onValueInput={setName} placeholder="acme-support" />
              </div>
              <For each={problems()}>{(p) => <p role="alert" class="text-xs text-destructive">{p.path}: {p.message}</p>}</For>
              <div class="flex gap-2">
                <Button variant="outline" onClick={() => setScreen({ step: 'start' })}>Back</Button>
                <Button disabled={creating()} onClick={() => create(s.variantId)}>
                  {creating() ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </main>
          );
        }}
      </Show>
      <Show when={screen().step === 'panel' && construct()}>
        {/* BRAND_STYLE inline on the panel step's own wrapper, same defect
            the header story hit live: index.html carries class="dark", and
            theme.css's `.dark` block re-declares `--color-primary` on the
            node carrying the class, clobbering any inherited brand value —
            so the brand has to be an INLINE declaration on a descendant,
            where it outranks the class. Without it the header's primary
            Save button renders the kit's neutral near-white. */}
        <div class="flex h-dvh flex-col" style={BRAND_STYLE}>
          <BuilderHeader
            title={template().name}
            /* The panel is usable before the preview exists, so the fact
               that one is still coming belongs up here, next to the things
               that ARE ready — not only in the empty pane below. */
            status={previewPending() ? 'preview starting…' : undefined}
            onSwitchTemplate={() => setConfirmSwitch(true)}
            canvasDark={canvasDark()}
            onToggleCanvasDark={toggleCanvasMode}
            onSave={() => void flushSave()}
            saving={savingNow()}
            saved={!dirty()}
          />
          <Show
            when={!themeStudio()}
            fallback={
              /* Full takeover (owner's choice): the studio replaces the whole
                 canvas + sidebar under the header; Back returns to the builder.
                 The studio also closes itself via postMessage 'kai-theme-close'. */
              <div class="flex min-h-0 flex-1 flex-col" data-theme-studio-takeover>
                <div class="flex items-center justify-between border-b border-border px-4 py-2">
                  <span class="text-sm font-medium">Theme builder</span>
                  <Button variant="outline" size="sm" onClick={() => setThemeStudio(false)}>Back to builder</Button>
                </div>
                <Show
                  when={themeStudioAvailable() !== false}
                  fallback={
                    <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                      <p class="text-sm text-muted-foreground">The theme studio isn't in this build yet.</p>
                      <p class="max-w-sm text-xs text-muted-foreground">
                        Rebuild the kit and restart <code>kai dev --builder</code> — the studio is served at <code>/theme-studio/</code> on this same server once it ships.
                      </p>
                    </div>
                  }
                >
                  <Show when={themeStudioAvailable()} fallback={<div class="flex flex-1 items-center justify-center"><p class="text-sm text-muted-foreground">Opening theme studio…</p></div>}>
                    <iframe
                      title="theme studio"
                      src="/theme-studio/?embed=1"
                      class="min-h-0 w-full flex-1 border-0"
                      /* Seed the studio with the construct's current theme once
                         it is listening. Same-origin route, explicit origin. */
                      on:load={(e) => e.currentTarget.contentWindow?.postMessage({ type: 'kai-theme-init', theme: construct()?.theme ?? {} }, window.location.origin)}
                    />
                  </Show>
                </Show>
              </div>
            }
          >
            <div class="grid min-h-0 flex-1 grid-cols-[380px_1fr]">
              <div class="flex flex-col overflow-y-auto border-r border-border">
                <DerivedBuilderPanel
                  value={construct()!}
                  onChange={onEdit}
                  template={template()}
                  problems={problems()}
                  /* The theme-studio entry point lives IN the Theme section now
                     (owner ruling 2026-08-31), not the header: a subtle
                     "Advanced" action right of the section title, opening the
                     same full takeover. The panel only places the element; the
                     takeover is this page's. */
                  sectionActions={{
                    theme: (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        class="-my-1 h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => void openThemeStudio()}
                        data-builder-theme-advanced
                      >
                        <SlidersHorizontal size={12} aria-hidden="true" />
                        Advanced
                      </Button>
                    ),
                  }}
                />
              </div>
              {/* The preview boots behind the panel, so this pane has to SAY what
                  is happening rather than sit blank for the length of an npm
                  install — and it has to say it while the panel beside it stays
                  fully editable (edits go to the construct file; the watcher picks
                  them up the moment Vite is up). */}
              <Show
                when={previewUrl()}
                fallback={
                  <div class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center" data-preview-placeholder>
                    <Show
                      when={previewError()}
                      fallback={
                        <>
                          <p class="text-sm text-muted-foreground">{PREVIEW_STARTING_MESSAGE}</p>
                          <p class="max-w-sm text-xs text-muted-foreground">
                            Keep editing — every change is written to your construct file and shows up as soon as the preview is running.
                          </p>
                        </>
                      }
                    >
                      <p role="alert" class="text-sm text-destructive dark:text-red-400">Preview failed to start — {previewError()}</p>
                      <p class="max-w-sm text-xs text-muted-foreground">Your construct file is safe on disk. Check the terminal running <code>kai dev --builder</code> for the full output.</p>
                    </Show>
                  </div>
                }
              >
                <iframe title="preview" src={previewUrl()} class="h-full w-full border-0" />
              </Show>
            </div>
          </Show>
        </div>
      </Show>
      {/* Switch-template overlay (design-parity fix wave item 3b): was the
          exact same 6-card grid squeezed into the 280px sidebar column,
          descriptions clipping off the right edge — an oversight, not a
          deliberate compact variant (builder-start.tsx's own module comment
          says Start IS meant to be the shared entry surface everywhere it's
          reused). Reuses BuilderStart at the Start screen's own story-scale
          treatment via `ui/dialog`'s Dialog, same brand accent, instead of
          a second cramped layout invented for this one spot. */}
      <Dialog
        open={confirmSwitch()}
        onOpenChange={setConfirmSwitch}
        header="Switch template"
        class="max-w-5xl"
        footer={<Button variant="outline" size="sm" onClick={() => setConfirmSwitch(false)}>Cancel</Button>}
      >
        <p class="mb-4 text-sm text-muted-foreground">Switching resets this construct to the new template's starter. Your name is kept; everything else is replaced.</p>
        <div style={BRAND_STYLE}>
          <BuilderStart templates={BUILDABLE_BUILDER_TEMPLATES} onSelect={(id) => switchTemplate(id)} />
        </div>
      </Dialog>
      {/* The kit's toast stack, bottom-right (F-48). Renders nothing while the
          list is empty; auto-dismisses on the component's own default timer. */}
      <ToastRegion toasts={toasts()} position="bottom-right" onDismiss={dismissToast} />
    </div>
  );
}
