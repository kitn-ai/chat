/**
 * The blocks gallery page (Task 5.1, blocks-and-parts plan 2026-08-31) —
 * rendered by the `kai dev` server's /gallery/ route and, with stub data, by
 * the Labs/Gallery story (story-first: the story is the owner's review
 * surface for this layout).
 *
 * OWNER RULING (spec B-G amendment, 2026-08-31), binding on this layout: the
 * gallery LEADS with the block's FILE TREE — the per-file view + copy and the
 * one-line `npx create-kai add <name>` are the primary affordances, because
 * the shadcn-shaped file tree IS the product. The standalone CDN-paste form
 * is a secondary try-it affordance, never presented as the block itself (it
 * renders as a small labeled row under the code panel).
 *
 * ROUND-2 OWNER FEEDBACK, also binding: the Code view carries a FRAMEWORK
 * selector (the delivery-form axis, derived from the shared renderer's
 * `BLOCK_FORMS`, never hand-listed) — the file tree, per-file contents and
 * every copy/download affordance re-render for the SELECTED form, so what a
 * react consumer copies is the react form `add` would write, byte for byte
 * (one renderer: `@kitn.ai/blocks/forms`). HTML - the
 * authored truth - is the default form. Download (a zip of the selected
 * form, served by the gallery's GET zip route) sits in the code header
 * beside the per-file Copy, which is an icon button with an accessible
 * label; the install one-liner stays primary and says out loud that `add`
 * auto-detects the framework.
 *
 * The grammar mirrors shadcn's /blocks (spec B-G): category nav → live
 * preview iframe sized by `meta.iframeHeight`, viewport toggles,
 * open-in-new-tab → Preview/Code toggle with a collapsible file tree and a
 * per-file syntax-highlighted view with copy → install one-liner →
 * description.
 *
 * DOGFOOD, per the same ruling: the page composes the kit's own pieces —
 * `WorkSurface` (preview frame through the kit's `Artifact` sandbox, device
 * toggles, the Preview|Code segmented toggle, open-in-new-tab), `FileTree`
 * over the selected form's file list, and `CodeBlock`/`CodeBlockCode` per
 * selected file. Gaps this page hits are findings for the round's report,
 * not workarounds.
 */
import { type JSX, For, Show, createMemo, createSignal } from 'solid-js';
import { Check, Copy, Download } from 'lucide-solid';
import { cn } from '../../src/utils/cn';
import { Button } from '../../src/ui/button';
import { WorkSurface } from '../../src/components/work-surface';
import { FileTree, type FileTreeFile } from '../../src/components/file-tree';
import { CodeBlock, CodeBlockCode, CodeBlockGroup } from '../../src/components/code-block';
import { BLOCK_FORMS, type BlockFormId, type FormFile } from '@kitn.ai/blocks/forms';

/** One gallery entry: the registry item's browse fields plus the rendered
 *  DELIVERY FORMS (from the server's /gallery/api/form/ route — the shared
 *  renderer, so each form is byte-identical to what `add` writes).
 *  `previewSrc` is the live preview URL the server generates; the story
 *  leaves it unset and passes a stub `preview` element instead. */
export interface GalleryBlock {
  name: string;
  title: string;
  description: string;
  categories: string[];
  /** `meta.iframeHeight` from the manifest — sizes the preview surface. */
  iframeHeight?: string;
  /** Rendered files per delivery form. Only the forms present are offered
   *  (menu honesty); `html` - the authored truth - is the default tab. */
  forms: Partial<Record<BlockFormId, FormFile[]>>;
  /** The manifest's `docs` string — printed under the block, the same text
   *  the CLI prints on install. */
  docs?: string;
  /** Live preview URL (the server's locally generated form). */
  previewSrc?: string;
  /** Stub preview content for story/offline use, rendered when
   *  `previewSrc` is absent (WorkSurface's own fallback path). */
  preview?: JSX.Element;
  /** The standalone CDN-paste form (secondary try-it affordance). The row
   *  does not render without it. */
  cdnHtml?: string;
}

/** Language id for the code view, from the file extension. */
export function languageFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1);
  switch (ext) {
    case 'html': return 'html';
    case 'css': return 'css';
    case 'js': case 'mjs': return 'javascript';
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'json': return 'json';
    default: return 'text';
  }
}

/** The one-line install command — the primary affordance beside the file
 *  tree (owner ruling). One derivation, shared by the page and its tests. */
export function installCommandFor(name: string): string {
  return `npx create-kai add ${name}`;
}

/** The server's zip route for one block's selected form — one derivation,
 *  shared by the Download button and the tests (the dev server's
 *  `handleGalleryRequest` owns the matching route). */
export function zipHrefFor(name: string, form: BlockFormId): string {
  return `/gallery/api/zip/${name}/${form}`;
}

/** The delivery forms this block actually carries, in BLOCK_FORMS order —
 *  derived from the shared axis, offered only when present (menu honesty). */
export function formsAvailable(block: Pick<GalleryBlock, 'forms'>): { id: BlockFormId; label: string }[] {
  return BLOCK_FORMS.filter((form) => (block.forms[form.id]?.length ?? 0) > 0).map((f) => ({ ...f }));
}

const COPIED_MS = 2000;

/** Icon copy button (round-2 owner feedback: icons, not text labels). The
 *  accessible name carries the acknowledged state, so a screen reader hears
 *  the same confirmation the icon swap shows. */
function CopyIconButton(props: { text: string; label: string }): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied() ? 'Copied' : props.label}
      onClick={() => {
        void Promise.resolve(navigator.clipboard?.writeText(props.text)).catch(() => {});
        setCopied(true);
        clearTimeout(timer);
        timer = setTimeout(() => setCopied(false), COPIED_MS);
      }}
    >
      <Show when={copied()} fallback={<Copy size={14} aria-hidden="true" />}>
        <Check size={14} aria-hidden="true" class="text-emerald-500" />
      </Show>
    </Button>
  );
}

export interface GalleryPageProps {
  blocks: GalleryBlock[];
  /** Initially selected block name. Defaults to the first block. */
  initial?: string;
  /** Initial Preview|Code tab. Preview-first by default (WorkSurface's own
   *  recorded contract); the story's code-view state passes 'code'. */
  defaultTab?: 'preview' | 'code';
}

export function GalleryPage(props: GalleryPageProps): JSX.Element {
  const [category, setCategory] = createSignal<string>('all');
  const [selectedName, setSelectedName] = createSignal<string | undefined>(props.initial);
  // Per-block selected form, and per-block-and-form selected file, so
  // switching blocks or forms and coming back keeps the reader's place.
  const [activeForms, setActiveForms] = createSignal<Record<string, BlockFormId>>({});
  const [activeFiles, setActiveFiles] = createSignal<Record<string, string>>({});

  const categories = createMemo(() => {
    const seen = new Set<string>();
    for (const b of props.blocks) for (const c of b.categories) seen.add(c);
    return ['all', ...seen];
  });

  const visible = createMemo(() =>
    category() === 'all' ? props.blocks : props.blocks.filter((b) => b.categories.includes(category())),
  );

  const selected = createMemo<GalleryBlock | undefined>(() => {
    const list = visible();
    return list.find((b) => b.name === selectedName()) ?? list[0];
  });

  const activeForm = (block: GalleryBlock): BlockFormId => {
    const offered = formsAvailable(block);
    const wanted = activeForms()[block.name];
    return offered.find((f) => f.id === wanted)?.id ?? offered[0]?.id ?? 'html';
  };

  const formFiles = (block: GalleryBlock): FormFile[] => block.forms[activeForm(block)] ?? [];

  const activeFile = (block: GalleryBlock): FormFile => {
    const files = formFiles(block);
    const wanted = activeFiles()[`${block.name}:${activeForm(block)}`];
    return files.find((f) => f.path === wanted) ?? files[0] ?? { path: '', content: '', target: '' };
  };

  const treeFiles = (block: GalleryBlock): FileTreeFile[] =>
    formFiles(block).map((f) => ({ path: f.path, code: f.content, language: languageFor(f.path) }));

  const downloadZip = (block: GalleryBlock): void => {
    const a = document.createElement('a');
    a.href = zipHrefFor(block.name, activeForm(block));
    a.download = '';
    a.click();
  };

  return (
    <div class="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header class="flex items-baseline gap-3 border-b border-border px-6 py-4">
        <h1 class="text-lg font-semibold">Blocks</h1>
        <p class="text-sm text-muted-foreground">
          Copy-ready building blocks composed from kai elements. Add one to your project, or try the standalone form.
        </p>
      </header>

      {/* Category nav — the manifest's `categories`, derived from the data. */}
      <nav aria-label="Block categories" class="flex flex-wrap gap-1 border-b border-border px-6 py-2">
        <For each={categories()}>
          {(c) => (
            <button
              type="button"
              class={cn(
                'rounded-md px-2.5 py-1 text-sm capitalize transition-colors',
                category() === c
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={category() === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          )}
        </For>
      </nav>

      <div class="flex min-h-0 flex-1">
        {/* Block list rail. */}
        <aside aria-label="Blocks" class="w-56 shrink-0 overflow-y-auto border-r border-border p-3">
          <ul class="flex flex-col gap-1">
            <For each={visible()}>
              {(b) => (
                <li>
                  <button
                    type="button"
                    class={cn(
                      'w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                      selected()?.name === b.name
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    aria-current={selected()?.name === b.name ? 'true' : undefined}
                    onClick={() => setSelectedName(b.name)}
                  >
                    {b.title}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </aside>

        {/* The selected block. */}
        <main class="min-w-0 flex-1 overflow-y-auto">
          <Show
            when={selected()}
            fallback={<p class="p-6 text-sm text-muted-foreground">No blocks in this category.</p>}
          >
            {(block) => (
              <article class="flex flex-col gap-4 p-6">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="min-w-0">
                    <h2 class="text-base font-semibold">{block().title}</h2>
                    <p class="mt-1 max-w-3xl text-sm text-muted-foreground">{block().description}</p>
                  </div>
                  {/* The install one-liner: a PRIMARY affordance (owner
                      ruling), beside the title so it reads first. */}
                  <div class="flex flex-col items-end gap-1">
                    <div class="flex items-center gap-1">
                      <code class="rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-foreground">
                        {installCommandFor(block().name)}
                      </code>
                      <CopyIconButton text={installCommandFor(block().name)} label="Copy install command" />
                    </div>
                    <p class="text-xs text-muted-foreground">add auto-detects your framework</p>
                  </div>
                </div>

                {/* Preview / Code — WorkSurface's own toggle. The Code tab is
                    the framework selector + file tree + per-file code view:
                    the block as the SELECTED framework's consumer receives it
                    (one shared renderer with `add`). */}
                <div style={{ height: block().iframeHeight ?? '720px' }} class="min-h-0">
                  <WorkSurface
                    src={block().previewSrc}
                    preview={block().preview}
                    urlLabel={block().previewSrc ?? `${block().name} preview`}
                    iframeTitle={`${block().title} live preview`}
                    defaultTab={props.defaultTab}
                    showCodeView
                    showDeviceToggle
                    showUrlBar
                    showOpenInNewTab
                    code={
                      <div class="flex h-full min-h-0 flex-col">
                        {/* The framework axis — derived from BLOCK_FORMS,
                            offered only where the form exists. */}
                        <div
                          role="group"
                          aria-label="Framework"
                          class="flex items-center gap-1 border-b border-border px-2 py-1.5"
                        >
                          <For each={formsAvailable(block())}>
                            {(form) => (
                              <button
                                type="button"
                                class={cn(
                                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                                  activeForm(block()) === form.id
                                    ? 'bg-muted font-medium text-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                                )}
                                aria-pressed={activeForm(block()) === form.id}
                                onClick={() =>
                                  setActiveForms((prev) => ({ ...prev, [block().name]: form.id }))
                                }
                              >
                                {form.label}
                              </button>
                            )}
                          </For>
                        </div>
                        <div class="flex min-h-0 flex-1">
                          <div class="w-60 shrink-0 overflow-y-auto border-r border-border p-2">
                            <FileTree
                              files={treeFiles(block())}
                              activeFile={activeFile(block()).path}
                              onSelect={(path) =>
                                setActiveFiles((prev) => ({
                                  ...prev,
                                  [`${block().name}:${activeForm(block())}`]: path,
                                }))
                              }
                            />
                          </div>
                          <div class="min-w-0 flex-1 overflow-auto p-3">
                            <CodeBlock>
                              {/* The code header: the file's name, its Copy
                                  (icon, accessible label) and Download — the
                                  selected form's files as a zip — side by
                                  side at the top (round-2 owner feedback). */}
                              <CodeBlockGroup class="border-b border-border py-1 pl-3 pr-2">
                                <span class="truncate font-mono text-xs text-muted-foreground">
                                  {activeFile(block()).path}
                                </span>
                                <div class="flex shrink-0 items-center gap-1">
                                  <CopyIconButton text={activeFile(block()).content} label="Copy file" />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Download the ${BLOCK_FORMS.find((f) => f.id === activeForm(block()))?.label ?? ''} files as a zip`}
                                    onClick={() => downloadZip(block())}
                                  >
                                    <Download size={14} aria-hidden="true" />
                                    Download
                                  </Button>
                                </div>
                              </CodeBlockGroup>
                              <CodeBlockCode
                                code={activeFile(block()).content}
                                language={languageFor(activeFile(block()).path)}
                              />
                            </CodeBlock>
                          </div>
                        </div>
                      </div>
                    }
                  />
                </div>

                {/* The standalone CDN-paste form — SECONDARY, labeled as the
                    try-it affordance, never presented as the block. Its
                    download moved up into the code header (select the CDN
                    single-file form there). */}
                <Show when={block().cdnHtml}>
                  {(cdn) => (
                    <div class="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                      <span>
                        Try it standalone: a single generated HTML file running this block off the CDN.
                      </span>
                      <CopyIconButton text={cdn()} label="Copy CDN form" />
                    </div>
                  )}
                </Show>

                <Show when={block().docs}>
                  <p class="max-w-3xl text-sm text-muted-foreground">{block().docs}</p>
                </Show>
              </article>
            )}
          </Show>
        </main>
      </div>
    </div>
  );
}
