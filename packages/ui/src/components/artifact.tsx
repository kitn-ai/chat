import {
  type JSX,
  splitProps,
  mergeProps,
  createSignal,
  createEffect,
  createMemo,
  on,
  onMount,
  onCleanup,
  Show,
} from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { CodeBlock, CodeBlockCode } from './code-block';
import { FileTree, type FileTreeFile } from './file-tree';
import { Loader } from './loader';
import { isPdfPreviewEnabled, renderPdfInto } from '../primitives/pdf-preview';
import { isSafeUrl, isScriptUrl } from '../primitives/card-routing';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  House,
  Eye,
  Code as CodeIcon,
  FileText,
  ExternalLink,
  Download,
  Maximize2,
  Minimize2,
} from 'lucide-solid';

export type ArtifactTab = 'preview' | 'code';

/** A file the artifact can preview + show source for. */
export type ArtifactFile = FileTreeFile;

/** Imperative handle exposed via `controllerRef` — surfaces the artifact's latent
 *  toolbar capabilities (history back/forward/reload/home, programmatic navigate,
 *  file selection, open-in-new-tab, maximize/restore) so the `<kai-artifact>`
 *  facade can forward them as instance methods. Each delegates to the SAME internal
 *  handler the toolbar buttons use, so every existing event still fires. */
export interface ArtifactController {
  /** Go back in the artifact's own history stack (no-op when there's no prior entry). */
  back(): void;
  /** Go forward in the history stack (no-op when there's no forward entry). */
  forward(): void;
  /** Force-reload the current preview url (also re-renders an inline PDF). */
  reload(): void;
  /** Navigate to the `src` home url (no-op when there's no `src`). */
  home(): void;
  /** Push + load a url in the preview (the path-field submit path). */
  navigate(url: string): void;
  /** Select a file by path: highlights the tree, shows its source, navigates the preview. */
  selectFile(path: string): void;
  /** Open the current url in a new browser tab (no-op when there's no concrete url). */
  openExternal(): void;
  /** Enter the maximized view-state (fires onMaximizeChange/kai-maximize-change). */
  maximize(): void;
  /** Exit the maximized view-state. */
  restore(): void;
}

export interface ArtifactProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** URL the preview iframe frames. */
  src?: string;
  /** Files for the Code tab's tree (+ each file's preview `url`). */
  files?: ArtifactFile[];
  /** Controlled active tab — when set, the artifact follows it (re-asserted on
   *  every change). When undefined the tab is uncontrolled (see `defaultTab`). */
  tab?: ArtifactTab;
  /** Uncontrolled INITIAL tab (used only when `tab` is undefined). The user can
   *  then freely switch tabs; defaults to `preview`. */
  defaultTab?: ArtifactTab;
  /** Selected file path (syncs tree highlight + Code source + preview). */
  activeFile?: string;
  /** iframe `sandbox` override. Default `allow-scripts allow-forms`. */
  sandbox?: string;
  /** Accessible iframe title. */
  iframeTitle?: string;
  /** Fired when the preview navigates (back/forward/reload/path-edit/file-click). */
  onNavigate?: (url: string) => void;
  /** Fired when the Preview|Code tab changes. */
  onTabChange?: (tab: ArtifactTab) => void;
  /** Fired when a file is selected in the tree. */
  onFileSelect?: (path: string) => void;
  // view-state
  /** Controlled maximize view-state (drives the expand/restore button). */
  maximized?: boolean;
  /** Fired when the expand/restore button toggles the maximize view-state. */
  onMaximizeChange?: (maximized: boolean) => void;
  // toolbar composition — existing five default SHOWN (no-* flags invert in the facade)
  /** Show the back/forward nav buttons. Default `true`. */
  showNav?: boolean;
  /** Show the reload button. Default `true`. */
  showReload?: boolean;
  /** Show the home button. Default `true`. */
  showHome?: boolean;
  /** Show the editable path/address field. Default `true`. */
  showPathField?: boolean;
  /** Show the Preview|Code tab toggle. Default `true`. */
  showTabs?: boolean;
  // new affordances — OPT-IN (default hidden; see resolved decision #2)
  /** Show the expand-to-fill button. Default `false` (opt-in). */
  expandable?: boolean;
  /** Show the open-in-new-tab button. Default `false` (opt-in). */
  openInTab?: boolean;
  // chrome
  /** Standalone chrome: rounded + bordered (default in-panel = square, borderless). */
  standalone?: boolean;
  /** Make the path field read-only (visible, nav-tracking, non-editable). */
  readonlyPath?: boolean;
  /** Friendly address shown in the path field INSTEAD of the real current url
   *  (read-only, non-navigable). Use when the framed url is not consumer-facing
   *  (e.g. a `data:` blob) so a clean address is shown instead of leaking it.
   *  Unset = show the real url (editable per `readonlyPath`). */
  displayUrl?: string;
  /** Receive the imperative controller once mounted. The `<kai-artifact>` facade
   *  forwards these as element methods (back/forward/reload/home/navigate/
   *  selectFile/openExternal/maximize/restore). */
  controllerRef?: (controller: ArtifactController) => void;
}

const DEFAULT_SANDBOX = 'allow-scripts allow-forms';

/** Refuse loudly. `src` and `files[].url` are MODEL-REACHABLE -- they arrive on
 *  an `artifact` card envelope produced by a tool call, and the card schema
 *  validates them only as `format: "uri"`, which constrains no scheme -- so
 *  every url this component puts in an href, hands to `window.open`, or frames
 *  is filtered. A refusal without a trace would be a decision made while hiding
 *  that it happened; the component has no error channel of its own, so it warns
 *  the way `card-routing` does. */
function warnBlockedUrl(sink: string, url: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[kai-artifact] blocked unsafe url in ${sink}: ${url}`);
}

/** Resolve a file's preview URL: explicit `url`, else `<src-origin> + /path`. */
function resolveFileUrl(file: ArtifactFile, src: string | undefined): string {
  if (file.url) return file.url;
  if (!src) return file.path;
  try {
    return new URL(file.path, src).href;
  } catch {
    return file.path;
  }
}

/** True when `url` should render as a PDF: a matching `files` entry is typed
 *  `'pdf'`, or the URL path (query/hash stripped) ends in `.pdf`. */
export function isPdfUrl(url: string, files: ArtifactFile[]): boolean {
  if (!url) return false;
  const match = files.find((f) => f.url === url || f.path === url);
  if (match?.type === 'pdf') return true;
  const path = url.split(/[?#]/)[0];
  return /\.pdf$/i.test(path);
}

/**
 * `Artifact` — a framed, switchable generated-artifact viewer. A functional nav
 * toolbar (back · forward · reload · home + editable path field + Preview|Code
 * toggle) over a sandboxed `<iframe>` (Preview) or a file-tree + `<kai-code-block>`
 * (Code). The component self-navigates the iframe and emits `kai-navigate` /
 * `kai-tab-change` / `kai-file-select` so a consumer can observe/sync.
 */
export function Artifact(props: ArtifactProps): JSX.Element {
  const merged = mergeProps(
    {
      files: [] as ArtifactFile[],
      // No `tab` default: a present `tab` means controlled. The uncontrolled
      // initial tab comes from `defaultTab` (seeded into the internal signal below).
      defaultTab: 'preview' as ArtifactTab,
      sandbox: DEFAULT_SANDBOX,
      showNav: true,
      showReload: true,
      showHome: true,
      showPathField: true,
      showTabs: true,
      expandable: false,
      openInTab: false,
      standalone: false,
      readonlyPath: false,
      maximized: false,
    },
    props,
  );
  const [local, rest] = splitProps(merged, [
    'src',
    'files',
    'tab',
    'defaultTab',
    'activeFile',
    'sandbox',
    'iframeTitle',
    'onNavigate',
    'onTabChange',
    'onFileSelect',
    'maximized',
    'onMaximizeChange',
    'showNav',
    'showReload',
    'showHome',
    'showPathField',
    'showTabs',
    'expandable',
    'openInTab',
    'standalone',
    'readonlyPath',
    'displayUrl',
    'controllerRef',
    'class',
  ]);

  // A sandboxed iframe WITHOUT `allow-same-origin` makes the framed document's
  // `contentWindow.history`/`location` opaque (a deliberate security property —
  // see the spec). So the component keeps its OWN history stack for the
  // navigations it initiates (path-edit, file-click, home, src changes) and
  // back/forward/reload operate on that. (In-frame relative-link clicks navigate
  // the iframe itself but can't be observed cross-origin — a known, accepted
  // sandbox limitation.)
  //
  // DO NOT add `allow-same-origin` to get those clicks tracked. This comment
  // used to suggest exactly that "if the consumer trusts the artifact", and it
  // was the worst advice in the file: `allow-same-origin` gives the framed
  // document the HOST's origin, so a hostile `src` runs with full access to the
  // embedding page, zero clicks -- confirmed executing in Chromium. And "the
  // artifact is trusted" is not a premise you get to hold when the url can come
  // from tool output: on the card path `src` and `files[].url` are
  // model-supplied. The scheme filter below is a backstop, not a licence --
  // `allow-same-origin` still hands the framed document the host's cookies,
  // storage and DOM for everything else it does. Losing in-frame click tracking
  // is the correct trade.
  const [history, setHistory] = createSignal<string[]>(local.src ? [local.src] : []);
  const [cursor, setCursor] = createSignal(local.src ? 0 : -1);
  const currentUrl = () => history()[cursor()] ?? '';
  const canBack = () => cursor() > 0;
  const canForward = () => cursor() < history().length - 1;

  /** What the iframe is actually pointed at.
   *
   *  Separate from `currentUrl()` on purpose: the history stack and the address
   *  field keep reporting what ARRIVED (a reader looking at a refused artifact
   *  should see the address that was refused, not a blank), while this is the
   *  only value that reaches the `src` sink.
   *
   *  `isScriptUrl` and not `isSafeUrl`: a `data:`/`blob:` src is a legitimate
   *  artifact -- see the note on `displayUrl` -- and gets an opaque origin, so
   *  it cannot touch the host page. `javascript:`/`vbscript:` run in the
   *  EMBEDDER's origin, which the default sandbox already refuses but a
   *  consumer-set `allow-same-origin` re-enables (see the note on the history
   *  stack above for why nothing here recommends that setting). */
  const framedUrl = createMemo(() => {
    const u = currentUrl();
    if (u && isScriptUrl(u)) {
      warnBlockedUrl('preview', u);
      return '';
    }
    return u;
  });

  // Seed the internal tab: a present `tab` (controlled) wins; otherwise the
  // uncontrolled `defaultTab` (which merges to 'preview'). The user can then
  // switch freely unless `tab` is set (the effect below re-asserts the controlled
  // value on each change).
  const [tab, setTab] = createSignal<ArtifactTab>(local.tab ?? local.defaultTab);
  const [activeFile, setActiveFile] = createSignal<string | undefined>(local.activeFile);
  const [reloadKey, setReloadKey] = createSignal(0);

  // Maximize view-state — controlled by `local.maximized`, toggled by the button.
  const [maximized, setMaximized] = createSignal<boolean>(local.maximized ?? false);
  createEffect(() => setMaximized(local.maximized ?? false));
  const toggleMaximize = () => {
    const next = !maximized();
    setMaximized(next);
    local.onMaximizeChange?.(next);
  };

  // Open-in-tab — only enabled when there's a concrete SAFE url to open. The
  // scheme filter is part of `canOpenInTab` rather than only of the handler so
  // the button renders DISABLED for a url that would be refused: a control that
  // looks live and does nothing is the worse failure.
  const canOpenInTab = createMemo(() => {
    const u = currentUrl();
    return !!u && u !== 'about:blank' && isSafeUrl(u);
  });
  const openInNewTab = () => {
    const u = currentUrl();
    if (!canOpenInTab()) {
      // `openExternal()` on the controller reaches this without any button, so
      // the refusal has to be stated here and not only in the disabled state.
      if (u && u !== 'about:blank') warnBlockedUrl('openExternal', u);
      return;
    }
    window.open(u, '_blank', 'noopener,noreferrer');
  };

  // The expand button is suppressed in standalone (no enclosing resizable).
  const showExpand = createMemo(() => local.expandable && !local.standalone);
  // Omit the whole toolbar when nothing is shown.
  const showAnyToolbar = createMemo(
    () =>
      local.showNav ||
      local.showReload ||
      local.showHome ||
      local.showPathField ||
      local.showTabs ||
      showExpand() ||
      local.openInTab,
  );

  let iframeEl: HTMLIFrameElement | undefined;

  // Controlled syncing: when the consumer changes the props, follow them. `tab` is
  // followed ONLY when it's actually set — an undefined `tab` means uncontrolled,
  // so the internal signal (seeded from defaultTab) is left for the user to drive.
  createEffect(() => {
    if (local.tab !== undefined) setTab(local.tab);
  });
  createEffect(() => setActiveFile(local.activeFile));
  // `src` change → navigate. Use `on(local.src, …)` so the effect tracks ONLY
  // the `src` prop — NOT `currentUrl()` — otherwise navigating away (file click,
  // path edit) would re-trigger it and snap the iframe back to `src`. Skip the
  // initial run: history is already seeded with `src` and the iframe binds it.
  createEffect(
    on(
      () => local.src,
      (next) => {
        if (next && next !== currentUrl()) navigate(next);
      },
      { defer: true },
    ),
  );

  const fileFor = (path: string | undefined): ArtifactFile | undefined =>
    path === undefined ? undefined : local.files.find((f) => f.path === path);

  const activeFileObj = createMemo(() => fileFor(activeFile()));
  // Code applies only to text-ish files that carry source.
  const hasSource = createMemo(() => {
    const f = activeFileObj();
    return !!f && f.type !== 'image' && f.type !== 'pdf' && typeof f.code === 'string';
  });

  /** Push a new entry (truncating any forward history) and load it. */
  function navigate(url: string) {
    if (url === currentUrl()) {
      reload();
      return;
    }
    setHistory((h) => [...h.slice(0, cursor() + 1), url]);
    setCursor((c) => c + 1);
    loadCurrent();
  }

  /** Point the iframe at the current cursor entry + emit `navigate`. */
  function loadCurrent() {
    if (iframeEl) iframeEl.src = framedUrl() || 'about:blank';
    // Reports the REAL url, not the framed one: a consumer observing navigation
    // (or a card patching `src` back into its envelope) must not be told the
    // model sent something it did not.
    local.onNavigate?.(currentUrl());
  }

  function selectTab(next: ArtifactTab) {
    if (next === tab()) return;
    setTab(next);
    local.onTabChange?.(next);
  }

  function selectFile(path: string, file: ArtifactFile) {
    setActiveFile(path);
    local.onFileSelect?.(path);
    navigate(resolveFileUrl(file, local.src));
  }

  // Toolbar actions — operate on the component's own history stack (see above).
  const goBack = () => {
    if (!canBack()) return;
    setCursor((c) => c - 1);
    loadCurrent();
  };
  const goForward = () => {
    if (!canForward()) return;
    setCursor((c) => c + 1);
    loadCurrent();
  };
  function reload() {
    if (iframeEl) {
      // Force a real reload even when the src is unchanged.
      iframeEl.src = 'about:blank';
      iframeEl.src = framedUrl() || 'about:blank';
    }
    setReloadKey((k) => k + 1); // re-render the inline PDF viewer too
    local.onNavigate?.(currentUrl());
  }
  const goHome = () => {
    if (local.src) navigate(local.src);
  };

  // Explicitly drive the maximize view-state to a target (the imperative twin of
  // the toggle button). Fires onMaximizeChange only when the value actually flips,
  // matching toggleMaximize's "report on change" contract.
  const setMaximizeState = (next: boolean) => {
    if (maximized() === next) return;
    setMaximized(next);
    local.onMaximizeChange?.(next);
  };

  // --- Imperative controller (Pattern C): hand the facade a handle over the
  //     artifact's latent toolbar capabilities. Every method delegates to the
  //     SAME internal handler the toolbar buttons use, so navigate/tab-change/
  //     file-select/maximize-change all still fire. ---
  onMount(() => {
    local.controllerRef?.({
      back: () => goBack(),
      forward: () => goForward(),
      reload: () => reload(),
      home: () => goHome(),
      navigate: (url) => navigate(url),
      // Resolve the file for the path so highlight + source + preview all sync;
      // a path with no matching file entry is a no-op (nothing to show).
      selectFile: (path) => {
        const file = fileFor(path);
        if (file) selectFile(path, file);
      },
      openExternal: () => openInNewTab(),
      maximize: () => setMaximizeState(true),
      restore: () => setMaximizeState(false),
    });
  });

  // Best-effort: if the consumer opted into `allow-same-origin`, keep the path
  // field truthful as the framed doc navigates itself. Cross-origin (the secure
  // default) throws and we keep our own stack.
  const onIframeLoad = () => {
    try {
      const href = iframeEl?.contentWindow?.location.href;
      if (href && href !== 'about:blank' && href !== currentUrl()) {
        setHistory((h) => [...h.slice(0, cursor() + 1), href]);
        setCursor((c) => c + 1);
        local.onNavigate?.(href);
      }
    } catch {
      /* cross-origin (sandboxed without allow-same-origin): keep our own url */
    }
  };

  const submitPath = (e: Event) => {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).elements.namedItem(
      'kai-artifact-path',
    ) as HTMLInputElement | null;
    if (local.readonlyPath || local.displayUrl != null) {
      // Submit is a no-op while read-only or showing a friendly displayUrl; keep
      // the field reflecting the shown value (never push the real, possibly data:, url).
      if (input) input.value = local.displayUrl ?? currentUrl();
      return;
    }
    if (input && input.value) navigate(input.value);
  };

  return (
    <div
      class={cn(
        'flex h-full w-full flex-col overflow-hidden bg-card text-card-foreground',
        local.standalone && 'rounded-xl border border-border',
        local.class,
      )}
      {...rest}
    >
      <Show when={showAnyToolbar()}>
        <ArtifactToolbar
          url={() => local.displayUrl ?? currentUrl()}
          tab={tab}
          canBack={canBack}
          canForward={canForward}
          canHome={() => !!local.src}
          onBack={goBack}
          onForward={goForward}
          onReload={reload}
          onHome={goHome}
          onSubmitPath={submitPath}
          onTab={selectTab}
          showNav={() => local.showNav}
          showReload={() => local.showReload}
          showHome={() => local.showHome}
          showPathField={() => local.showPathField}
          showTabs={() => local.showTabs}
          showExpand={showExpand}
          showOpenInTab={() => local.openInTab}
          maximized={maximized}
          onToggleMaximize={toggleMaximize}
          canOpenInTab={canOpenInTab}
          onOpenInTab={openInNewTab}
          readonlyPath={() => local.readonlyPath || local.displayUrl != null}
        />
      </Show>
      <div class="relative min-h-0 flex-1">
        <Show
          when={tab() === 'preview'}
          fallback={
            <ArtifactCode
              files={local.files}
              activeFile={activeFile}
              activeFileObj={activeFileObj}
              hasSource={hasSource}
              onSelect={selectFile}
            />
          }
        >
          <Show
            when={isPdfUrl(currentUrl(), local.files)}
            fallback={
              <ArtifactPreview
                ref={(el) => (iframeEl = el)}
                src={framedUrl}
                sandbox={local.sandbox}
                title={local.iframeTitle ?? 'Artifact preview'}
                onLoad={onIframeLoad}
              />
            }
          >
            <ArtifactPdfPreview url={currentUrl()} reloadKey={reloadKey()} />
          </Show>
        </Show>
      </div>
    </div>
  );
}

// --- ArtifactToolbar (internal) -------------------------------------------

interface ToolbarProps {
  url: () => string;
  tab: () => ArtifactTab;
  canBack: () => boolean;
  canForward: () => boolean;
  canHome: () => boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onSubmitPath: (e: Event) => void;
  onTab: (tab: ArtifactTab) => void;
  showNav: () => boolean;
  showReload: () => boolean;
  showHome: () => boolean;
  showPathField: () => boolean;
  showTabs: () => boolean;
  showExpand: () => boolean;
  showOpenInTab: () => boolean;
  maximized: () => boolean;
  onToggleMaximize: () => void;
  canOpenInTab: () => boolean;
  onOpenInTab: () => void;
  readonlyPath: () => boolean;
}

function ArtifactToolbar(props: ToolbarProps): JSX.Element {
  return (
    <div
      data-artifact-toolbar
      class="flex shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 py-1.5"
    >
      <Show when={props.showNav()}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          disabled={!props.canBack()}
          onClick={() => props.onBack()}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          disabled={!props.canForward()}
          onClick={() => props.onForward()}
        >
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </Show>
      <Show when={props.showReload()}>
        <Button variant="ghost" size="icon-sm" aria-label="Reload" onClick={() => props.onReload()}>
          <RotateCw size={15} aria-hidden="true" />
        </Button>
      </Show>
      <Show when={props.showHome()}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Home"
          disabled={!props.canHome()}
          onClick={() => props.onHome()}
        >
          <House size={15} aria-hidden="true" />
        </Button>
      </Show>
      <Show when={props.showPathField()}>
        <form class="min-w-0 flex-1" onSubmit={(e) => props.onSubmitPath(e)}>
          <label class="sr-only" for="kai-artifact-path">
            Address
          </label>
          <input
            id="kai-artifact-path"
            name="kai-artifact-path"
            type="text"
            spellcheck={false}
            autocomplete="off"
            readonly={props.readonlyPath() || undefined}
            aria-readonly={props.readonlyPath() ? 'true' : undefined}
            value={props.url()}
            class={cn(
              'h-7 w-full rounded-md border border-border px-2.5 text-xs text-foreground font-mono outline-none',
              props.readonlyPath()
                ? 'bg-muted/40 cursor-default'
                : 'bg-background focus-visible:ring-2 focus-visible:ring-ring',
            )}
            placeholder="Enter a path or URL…"
          />
        </form>
      </Show>
      <Show when={!props.showPathField()}>
        <div class="flex-1" aria-hidden="true" />
      </Show>
      <Show when={props.showExpand()}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={props.maximized() ? 'Collapse' : 'Expand'}
          aria-expanded={props.maximized()}
          onClick={() => props.onToggleMaximize()}
        >
          <Show when={props.maximized()} fallback={<Maximize2 size={15} aria-hidden="true" />}>
            <Minimize2 size={15} aria-hidden="true" />
          </Show>
        </Button>
      </Show>
      <Show when={props.showOpenInTab()}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open in new tab"
          disabled={!props.canOpenInTab()}
          onClick={() => props.onOpenInTab()}
        >
          <ExternalLink size={15} aria-hidden="true" />
        </Button>
      </Show>
      <Show when={props.showTabs()}>
        <div
          role="tablist"
          aria-label="View"
          class="flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5"
        >
          <SegmentButton
            label="Preview"
            icon={<Eye size={14} aria-hidden="true" />}
            selected={props.tab() === 'preview'}
            onClick={() => props.onTab('preview')}
          />
          <SegmentButton
            label="Code"
            icon={<CodeIcon size={14} aria-hidden="true" />}
            selected={props.tab() === 'code'}
            onClick={() => props.onTab('code')}
          />
        </div>
      </Show>
    </div>
  );
}

function SegmentButton(props: {
  label: string;
  icon: JSX.Element;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.selected}
      class={cn(
        'inline-flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        props.selected
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={() => props.onClick()}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

// --- ArtifactPreview (internal) -------------------------------------------

interface PreviewProps {
  ref: (el: HTMLIFrameElement) => void;
  src: () => string;
  sandbox: string;
  title: string;
  onLoad: () => void;
}

function ArtifactPreview(props: PreviewProps): JSX.Element {
  return (
    <iframe
      ref={props.ref}
      src={props.src() || 'about:blank'}
      sandbox={props.sandbox}
      title={props.title}
      class="absolute inset-0 h-full w-full border-0 bg-white"
      onLoad={() => props.onLoad()}
    />
  );
}

// --- ArtifactCode (internal) ----------------------------------------------

interface CodeProps {
  files: ArtifactFile[];
  activeFile: () => string | undefined;
  activeFileObj: () => ArtifactFile | undefined;
  hasSource: () => boolean;
  onSelect: (path: string, file: ArtifactFile) => void;
}

function ArtifactCode(props: CodeProps): JSX.Element {
  return (
    <div class="absolute inset-0 flex">
      <div class="w-56 shrink-0 overflow-auto border-r border-border bg-surface-sunken py-1.5 scrollbar-thin">
        <FileTree
          files={props.files}
          activeFile={props.activeFile()}
          onSelect={(path, file) => props.onSelect(path, file)}
        />
      </div>
      <div class="min-w-0 flex-1 overflow-auto scrollbar-thin">
        <Show
          when={props.activeFileObj()}
          fallback={
            <div class="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              Select a file to view its source.
            </div>
          }
        >
          <Show
            when={props.hasSource()}
            fallback={
              <div class="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                No source — this file ({props.activeFileObj()!.type ?? 'binary'}) has no code view.
              </div>
            }
          >
            <CodeBlock class="h-full rounded-none border-0">
              <CodeBlockCode
                code={props.activeFileObj()!.code ?? ''}
                language={props.activeFileObj()!.language}
              />
            </CodeBlock>
          </Show>
        </Show>
      </div>
    </div>
  );
}

// --- ArtifactPdfFallback (internal) ---------------------------------------

/** Shown when inline PDF rendering is disabled or fails (CORS / load / parse).
 *
 *  THIS IS THE DEFAULT VIEW FOR A HOSTILE URL, not an edge case: pdf.js has to
 *  FETCH the document to render it inline, and it cannot fetch a `javascript:`
 *  or `data:` one, so every such url fails straight through to here -- where two
 *  anchors used to put it in an `href`, one click from executing in the host
 *  page's origin. The url is model-reachable (`artifact` card `src` /
 *  `files[].url`, schema-validated only as `format: "uri"`), so it is filtered
 *  with the same `isSafeUrl` the markdown renderer and the card `open` verb use.
 *  Relative paths pass, which matters here: `resolveFileUrl` returns a bare
 *  `path` when the artifact has no `src`. */
function ArtifactPdfFallback(props: { url: string }): JSX.Element {
  const name = () => {
    const path = props.url.split(/[?#]/)[0];
    return path.slice(path.lastIndexOf('/') + 1) || 'document.pdf';
  };
  /** The url actually put in `href`, or `undefined` -- which OMITS the attribute.
   *  Never `''`: an empty href navigates to the current page. */
  const href = createMemo(() => {
    if (!props.url) return undefined;
    if (isSafeUrl(props.url)) return props.url;
    warnBlockedUrl('pdf fallback', props.url);
    return undefined;
  });
  const linkClass =
    'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div
      role="region"
      aria-label="PDF preview unavailable"
      class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card p-6 text-center"
    >
      <FileText size={40} class="text-muted-foreground" aria-hidden="true" />
      <div class="text-sm font-medium text-foreground">{name()}</div>
      <div class="text-xs text-muted-foreground">Can't preview this PDF inline.</div>
      {/* No safe address, no controls. Two buttons that silently do nothing
          would be worse than saying what happened -- and a bare `<a>` with the
          href dropped is exactly that. */}
      <Show
        when={href()}
        fallback={
          <div class="text-xs text-muted-foreground">
            Blocked: that address uses a scheme this viewer won't open.
          </div>
        }
      >
        <div class="flex flex-wrap items-center justify-center gap-2">
          <a class={linkClass} href={href()} target="_blank" rel="noopener noreferrer">
            Open in new tab
            <ExternalLink size={13} aria-hidden="true" />
          </a>
          <a class={linkClass} href={href()} download="">
            <Download size={13} aria-hidden="true" />
            Download
          </a>
        </div>
      </Show>
    </div>
  );
}

// --- ArtifactPdfPreview (internal) ----------------------------------------

/**
 * Renders a PDF inline via pdf.js (loaded on demand). Four states:
 * disabled → fallback (no network); loading → spinner; success → stacked
 * fit-width canvases; error (load/CORS/parse) → fallback card. Re-renders when
 * the url or `reloadKey` changes, and (debounced) when the panel resizes.
 */
function ArtifactPdfPreview(props: { url: string; reloadKey: number }): JSX.Element {
  const [state, setState] = createSignal<'loading' | 'success' | 'error'>('loading');
  let container: HTMLDivElement | undefined;
  let token = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  const renderNow = async () => {
    if (!isPdfPreviewEnabled() || !container) {
      setState('error');
      return;
    }
    const mine = ++token;
    setState('loading');
    try {
      const width = container.clientWidth || 600;
      await renderPdfInto(props.url, container, width);
      if (mine === token) setState('success');
    } catch {
      if (mine === token) setState('error');
    }
  };

  createEffect(
    on(
      () => [props.url, props.reloadKey] as const,
      () => {
        void renderNow();
      },
    ),
  );

  onMount(() => {
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (state() !== 'success') return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void renderNow(), 200);
    });
    ro.observe(container);
    onCleanup(() => {
      ro.disconnect();
      clearTimeout(resizeTimer);
      token++; // cancel any in-flight render
    });
  });

  return (
    <div class="absolute inset-0">
      {/* Always present so clientWidth is the real panel width. */}
      <div
        ref={(el) => (container = el)}
        role="region"
        aria-label="PDF preview"
        aria-busy={state() === 'loading'}
        tabindex="0"
        class="absolute inset-0 flex flex-col items-center gap-3 overflow-auto bg-surface-sunken p-3 scrollbar-thin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      />
      <Show when={isPdfPreviewEnabled() && state() === 'loading'}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader variant="circular" size="md" />
        </div>
      </Show>
      <Show when={!isPdfPreviewEnabled() || state() === 'error'}>
        <ArtifactPdfFallback url={props.url} />
      </Show>
    </div>
  );
}
