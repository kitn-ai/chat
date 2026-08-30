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
import { BuilderStart, BUILDABLE_BUILDER_TEMPLATES, type BuilderTemplateId } from '../components/builder-start';
import { WorkspaceVariantPicker, type WorkspaceVariantId } from '../components/builder-workspace-variants';
import { DerivedBuilderPanel } from '../components/builder-panel-derived';
import { buildableTemplates, templateById, inferTemplateId, type BuildableTemplate } from '../agent-tooling/construct/templates';
import type { Construct, ConstructProblem } from '../agent-tooling/construct/schema';
import { createEditGuard } from './edit-guard';
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

export function App() {
  const [screen, setScreen] = createSignal<Screen>({ step: 'start' });
  const [template, setTemplate] = createSignal<BuildableTemplate>(SCRATCH_TEMPLATE);
  const [construct, setConstruct] = createSignal<Construct | undefined>();
  const [previewUrl, setPreviewUrl] = createSignal<string | undefined>();
  const [problems, setProblems] = createSignal<readonly ConstructProblem[]>([]);
  const [pickedId, setPickedId] = createSignal<BuilderTemplateId | undefined>();
  const [name, setName] = createSignal('');
  const [confirmSwitch, setConfirmSwitch] = createSignal(false);
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
      setPreviewUrl(body.previewUrl);
      setProblems([]);
      setServerError(undefined);
      setScreen({ step: 'panel' });
    } catch {
      setServerError('save failed');
    }
  };

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
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
  const onEdit = (next: Construct) => {
    setConstruct(next); // optimistic — the panel stays live while typing
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const outcome = await submitEdit(next);
      if (!outcome) return; // stale — a newer edit's outcome already applied
      setProblems(outcome.problems);
      setServerError(outcome.serverError);
    }, 300);
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
                <Button onClick={() => create(s.variantId)}>Create</Button>
              </div>
            </main>
          );
        }}
      </Show>
      <Show when={screen().step === 'panel' && construct()}>
        <div class="grid h-dvh grid-cols-[380px_1fr]">
          <div class="flex flex-col overflow-y-auto border-r border-border">
            <div class="flex items-center justify-between border-b border-border p-3">
              <span class="text-sm font-semibold">{template().name}</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirmSwitch(true)}>Switch template</Button>
            </div>
            <DerivedBuilderPanel value={construct()!} onChange={onEdit} template={template()} problems={problems()} />
          </div>
          <Show when={previewUrl()} fallback={<p class="p-8 text-sm text-muted-foreground">Preview starting…</p>}>
            <iframe title="preview" src={previewUrl()} class="h-full w-full border-0" />
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
    </div>
  );
}
