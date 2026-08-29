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
import { createSignal, createResource, onMount, onCleanup, Show, For } from 'solid-js';
import { BuilderStart, BUILDABLE_BUILDER_TEMPLATES, type BuilderTemplateId } from '../components/builder-start';
import { WorkspaceVariantPicker, type WorkspaceVariantId } from '../components/builder-workspace-variants';
import { DerivedBuilderPanel } from '../components/builder-panel-derived';
import { buildableTemplates, templateById, inferTemplateId, type BuildableTemplate } from '../agent-tooling/construct/templates';
import type { Construct, ConstructProblem } from '../agent-tooling/construct/schema';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

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

  onMount(async () => {
    const state = await (await fetch('/api/state')).json();
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
    const events = new EventSource('/api/events');
    events.addEventListener('construct', async () => {
      const raw = (await (await fetch('/api/construct')).json()) as Construct;
      setConstruct(raw);
      setTemplate(templateForLoadedConstruct(raw));
      setProblems([]);
    });
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
    const res = await fetch('/api/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId: pickedId(), variantId, name: name() }),
    });
    const body = await res.json();
    if (!res.ok) { setProblems(body.problems ?? []); return; }
    setTemplate(templateFor(pickedId()!));
    setConstruct(body.construct as Construct);
    setPreviewUrl(body.previewUrl);
    setProblems([]);
    setScreen({ step: 'panel' });
  };

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const onEdit = (next: Construct) => {
    setConstruct(next); // optimistic — the panel stays live while typing
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const res = await fetch('/api/construct', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.status === 422) setProblems((await res.json()).problems ?? []);
      else setProblems([]);
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
      <Show when={screen().step === 'start'}>
        <main class="mx-auto max-w-4xl p-8">
          <h1 class="mb-1 text-lg font-semibold">Start a construct</h1>
          <p class="mb-6 text-sm text-muted-foreground">Pick a template. You will get a live preview and a construct file you own.</p>
          <BuilderStart templates={BUILDABLE_BUILDER_TEMPLATES} value={pickedId()} onSelect={onPick} />
        </main>
      </Show>
      <Show when={screen().step === 'variant'}>
        <main class="mx-auto max-w-4xl p-8">
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
            <main class="mx-auto flex max-w-md flex-col gap-3 p-8">
              <label for="construct-name" class="text-sm font-medium">Element name</label>
              <Input id="construct-name" value={name()} onValueInput={setName} placeholder="acme-support" />
              <p class="text-xs text-muted-foreground">The emitted custom-element tag: lowercase, with a hyphen (e.g. acme-support).</p>
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
            <Show when={confirmSwitch()}>
              <div class="flex flex-col gap-2 border-b border-border bg-muted p-3" role="alertdialog" aria-label="Switch template">
                <p class="text-xs">Switching resets this construct to the new template's starter. Your name is kept; everything else is replaced.</p>
                <BuilderStart templates={BUILDABLE_BUILDER_TEMPLATES} onSelect={(id) => switchTemplate(id)} />
                <Button variant="outline" size="sm" onClick={() => setConfirmSwitch(false)}>Cancel</Button>
              </div>
            </Show>
            <DerivedBuilderPanel value={construct()!} onChange={onEdit} template={template()} problems={problems()} />
          </div>
          <Show when={previewUrl()} fallback={<p class="p-8 text-sm text-muted-foreground">Preview starting…</p>}>
            <iframe title="preview" src={previewUrl()} class="h-full w-full border-0" />
          </Show>
        </div>
      </Show>
    </div>
  );
}
