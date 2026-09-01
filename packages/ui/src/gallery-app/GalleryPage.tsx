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
 * is a secondary try-it/download affordance, never presented as the block
 * itself (it renders as a small labeled row under the code panel).
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
 * over the block's add-form file list, and `CodeBlock`/`CodeBlockCode` per
 * selected file with the copy header. Gaps this page hits are findings for
 * the round's report, not workarounds.
 */
import { type JSX, For, Show, createMemo, createSignal } from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { WorkSurface } from '../components/work-surface';
import { FileTree, type FileTreeFile } from '../components/file-tree';
import { CodeBlock, CodeBlockCode } from '../components/code-block';

/** One gallery entry: the registry item's browse fields plus the add-form
 *  file contents (from the per-block item JSON, `dist/blocks/r/<name>.json`
 *  — the public integration surface). `previewSrc` is the live preview URL
 *  the server generates; the story leaves it unset and passes a stub
 *  `preview` element instead. */
export interface GalleryBlock {
  name: string;
  title: string;
  description: string;
  categories: string[];
  /** `meta.iframeHeight` from the manifest — sizes the preview surface. */
  iframeHeight?: string;
  files: { path: string; content: string }[];
  /** The manifest's `docs` string — printed under the block, the same text
   *  the CLI prints on install. */
  docs?: string;
  /** Live preview URL (the server's locally generated form). */
  previewSrc?: string;
  /** Stub preview content for story/offline use, rendered when
   *  `previewSrc` is absent (WorkSurface's own fallback path). */
  preview?: JSX.Element;
  /** The standalone CDN-paste form (secondary try-it/download affordance).
   *  The row does not render without it. */
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
    case 'json': return 'json';
    default: return 'text';
  }
}

/** The one-line install command — the primary affordance beside the file
 *  tree (owner ruling). One derivation, shared by the page and its tests. */
export function installCommandFor(name: string): string {
  return `npx create-kai add ${name}`;
}

const COPIED_MS = 2000;

/** A small copy-to-clipboard button used by the install one-liner and the
 *  CDN-form row. The acknowledged state swaps the label so a screen reader
 *  hears the same confirmation a sighted user sees. */
function CopyTextButton(props: { text: string; label: string; variant?: 'outline' | 'ghost' }): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (
    <Button
      variant={props.variant ?? 'outline'}
      size="sm"
      onClick={() => {
        void Promise.resolve(navigator.clipboard?.writeText(props.text)).catch(() => {});
        setCopied(true);
        clearTimeout(timer);
        timer = setTimeout(() => setCopied(false), COPIED_MS);
      }}
    >
      {copied() ? 'Copied' : props.label}
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
  // Per-block selected file, keyed by block name so switching blocks and
  // coming back keeps the reader's place.
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

  const activeFile = (block: GalleryBlock): { path: string; content: string } => {
    const wanted = activeFiles()[block.name];
    return block.files.find((f) => f.path === wanted) ?? block.files[0];
  };

  const treeFiles = (block: GalleryBlock): FileTreeFile[] =>
    block.files.map((f) => ({ path: f.path, code: f.content, language: languageFor(f.path) }));

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
                  <div class="flex items-center gap-2">
                    <code class="rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-foreground">
                      {installCommandFor(block().name)}
                    </code>
                    <CopyTextButton text={installCommandFor(block().name)} label="Copy" />
                  </div>
                </div>

                {/* Preview / Code — WorkSurface's own toggle. The Code tab is
                    the file tree + per-file code view (the add form: the
                    block as the consumer receives it). */}
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
                      <div class="flex h-full min-h-0">
                        <div class="w-60 shrink-0 overflow-y-auto border-r border-border p-2">
                          <FileTree
                            files={treeFiles(block())}
                            activeFile={activeFile(block()).path}
                            onSelect={(path) =>
                              setActiveFiles((prev) => ({ ...prev, [block().name]: path }))
                            }
                          />
                        </div>
                        <div class="min-w-0 flex-1 overflow-auto p-3">
                          <CodeBlock copy copyText={activeFile(block()).content}>
                            <CodeBlockCode
                              code={activeFile(block()).content}
                              language={languageFor(activeFile(block()).path)}
                            />
                          </CodeBlock>
                        </div>
                      </div>
                    }
                  />
                </div>

                {/* The standalone CDN-paste form — SECONDARY, labeled as the
                    try-it/download affordance, never presented as the block. */}
                <Show when={block().cdnHtml}>
                  {(cdn) => (
                    <div class="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                      <span>
                        Try it standalone: a single generated HTML file running this block off the CDN.
                      </span>
                      <CopyTextButton text={cdn()} label="Copy CDN form" variant="ghost" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const url = URL.createObjectURL(new Blob([cdn()], { type: 'text/html' }));
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${block().name}.html`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        Download
                      </Button>
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
