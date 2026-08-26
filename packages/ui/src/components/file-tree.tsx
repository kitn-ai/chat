import {
  type JSX,
  For,
  Show,
  splitProps,
  createSignal,
  createMemo,
} from 'solid-js';
import { cn } from '../utils/cn';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  FileType,
  File as FileIcon,
} from 'lucide-solid';

/** A single artifact file the tree can show + the preview can load.
 *
 *  AUTHORED IN ../primitives/card-data-types.ts as `ArtifactCardFile`, and aliased
 *  here rather than declared, so there is ONE shape and not a copy of one. It has
 *  to live in that `.ts` because `ArtifactCardData.files` reaches it: a type import
 *  still has to RESOLVE, and a Node/no-DOM project (tsconfig.mcp.json has no `jsx`
 *  on purpose) cannot resolve a `.tsx` at all — so leaving this declaration here
 *  would put TS6142 back on any backend that names an artifact card payload. See
 *  that file's header. */
export type { ArtifactCardFile as FileTreeFile } from '../primitives/card-data-types';
import type { ArtifactCardFile as FileTreeFile } from '../primitives/card-data-types';

/** A change status a file can carry. */
export type FileStatus = NonNullable<FileTreeFile['status']>;

/** Per-status letter, accessible word, and tool-hue text class. Conventional VCS
 *  colors so a changed-files view reads at a glance. */
const STATUS_META: Record<FileStatus, { letter: string; label: string; class: string }> = {
  added: { letter: 'A', label: 'added', class: 'text-tool-green' },
  modified: { letter: 'M', label: 'modified', class: 'text-tool-amber' },
  deleted: { letter: 'D', label: 'deleted', class: 'text-tool-red' },
  renamed: { letter: 'R', label: 'renamed', class: 'text-tool-blue' },
  untracked: { letter: 'U', label: 'untracked', class: 'text-muted-foreground' },
};

/** A folder node in the built tree. */
export interface FileTreeFolderNode {
  kind: 'folder';
  /** Last path segment (the folder's display name). */
  name: string;
  /** Full `/`-joined path to this folder (stable key). */
  path: string;
  children: FileTreeNode[];
}

/** A leaf (file) node in the built tree. */
export interface FileTreeFileNode {
  kind: 'file';
  name: string;
  path: string;
  file: FileTreeFile;
}

export type FileTreeNode = FileTreeFolderNode | FileTreeFileNode;

/**
 * Build a nested folder/file tree from a flat list of `/`-delimited paths.
 *
 * - `a/b/c.html` nests `c.html` under `b` under `a`.
 * - Folders are de-duplicated and reused across files.
 * - Insertion order is preserved per level, with folders sorted before files
 *   and each group sorted alphabetically (case-insensitive) for a stable,
 *   readable tree regardless of input order.
 */
export function buildFileTree(files: FileTreeFile[]): FileTreeNode[] {
  const root: FileTreeFolderNode = { kind: 'folder', name: '', path: '', children: [] };

  for (const file of files) {
    const segments = file.path.split('/').filter((s) => s.length > 0);
    if (segments.length === 0) continue;

    let cursor = root;
    // Walk/create folder nodes for every segment except the last (the file).
    for (let i = 0; i < segments.length - 1; i++) {
      const name = segments[i];
      const folderPath = segments.slice(0, i + 1).join('/');
      let next = cursor.children.find(
        (c): c is FileTreeFolderNode => c.kind === 'folder' && c.name === name,
      );
      if (!next) {
        next = { kind: 'folder', name, path: folderPath, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    }

    const leafName = segments[segments.length - 1];
    // De-dupe by path: last write wins (a re-declared file updates its node).
    const existing = cursor.children.find(
      (c): c is FileTreeFileNode => c.kind === 'file' && c.name === leafName,
    );
    if (existing) {
      existing.file = file;
    } else {
      cursor.children.push({ kind: 'file', name: leafName, path: file.path, file });
    }
  }

  sortTree(root.children);
  return root.children;
}

/** Folders first, then files; each group alphabetical (case-insensitive). */
function sortTree(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  for (const n of nodes) if (n.kind === 'folder') sortTree(n.children);
}

/** Flatten the visible (expanded-aware) leaves in render order — used for keyboard nav. */
function flattenVisible(
  nodes: FileTreeNode[],
  isOpen: (path: string) => boolean,
  out: FileTreeNode[] = [],
): FileTreeNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.kind === 'folder' && isOpen(n.path)) flattenVisible(n.children, isOpen, out);
  }
  return out;
}

function iconFor(type: FileTreeFile['type']) {
  switch (type) {
    case 'image':
      return FileImage;
    case 'pdf':
      return FileType;
    case 'html':
      return FileText;
    default:
      return FileIcon;
  }
}

/** Every folder path in the tree (render order) — drives collapse-all/expand-all. */
function collectFolderPaths(nodes: FileTreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.kind === 'folder') {
      out.push(n.path);
      collectFolderPaths(n.children, out);
    }
  }
  return out;
}

/** Every leaf file in the tree — drives the summary header totals. */
function collectFiles(nodes: FileTreeNode[], out: FileTreeFile[] = []): FileTreeFile[] {
  for (const n of nodes) {
    if (n.kind === 'folder') collectFiles(n.children, out);
    else out.push(n.file);
  }
  return out;
}

/** Whether a file carries any diff metadata (status / additions / deletions). */
function hasDiffMeta(file: FileTreeFile): boolean {
  return file.status !== undefined || file.additions !== undefined || file.deletions !== undefined;
}

/**
 * Accessible name for a changed-file row: the file name plus its status and diff
 * stats, e.g. `App.tsx, modified, 3 additions, 1 deletion`. Returns `undefined`
 * when the file has no diff metadata, so a plain row keeps its text content as
 * the accessible name (unchanged behavior).
 */
function fileAccessibleName(name: string, file: FileTreeFile): string | undefined {
  if (!hasDiffMeta(file)) return undefined;
  const parts: string[] = [];
  if (file.status) parts.push(STATUS_META[file.status].label);
  if (file.additions !== undefined)
    parts.push(`${file.additions} addition${file.additions === 1 ? '' : 's'}`);
  if (file.deletions !== undefined)
    parts.push(`${file.deletions} deletion${file.deletions === 1 ? '' : 's'}`);
  return [name, ...parts].join(', ');
}

export interface FileTreeProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** Flat file list; folders are derived from `/`-delimited paths. */
  files: FileTreeFile[];
  /** Currently-selected file path (highlighted). */
  activeFile?: string;
  /** Called with a file's path when the user selects it. */
  onSelect?: (path: string, file: FileTreeFile) => void;
  /** Folder paths expanded by default. When omitted, all folders start open. */
  defaultExpanded?: string[];
  /** Show a summary header above the tree: the changed-file count, the summed
   *  `+additions / -deletions`, and a Collapse-all/Expand-all toggle wired to the
   *  folder-expand state. Off by default (no header — unchanged behavior). */
  summary?: boolean;
}

/**
 * `FileTree` — a collapsible, keyboard-navigable file explorer built from a flat
 * list of `/`-delimited paths. ARIA `tree`/`treeitem`/`group`. Selecting a file
 * calls `onSelect(path, file)`.
 */
export function FileTree(props: FileTreeProps): JSX.Element {
  // `files` is REQUIRED, so it is read straight off `props` — no `mergeProps`
  // default. Defaulting it to `[]` here would turn a caller who forgot it into a
  // silently empty tree, which fails far from the mistake. The `<kai-file-tree>`
  // facade declares its own `files: []` default (elements/file-tree.tsx), so the
  // web-component path is covered where the property genuinely arrives late.
  // Same shape as `Segmented`, which reads `merged.options` directly.
  const [local, rest] = splitProps(props, [
    'files',
    'activeFile',
    'onSelect',
    'defaultExpanded',
    'summary',
    'class',
  ]);

  const tree = createMemo(() => buildFileTree(local.files));

  // Open-state semantics differ by mode so the default is robust to files that
  // arrive AFTER mount (the element sets `files` as a property post-construction):
  //   - explicit `defaultExpanded` → an OPEN set (only listed folders open).
  //   - no `defaultExpanded` (default = all open) → a CLOSED set: every folder is
  //     open unless the user explicitly collapsed it, so late-discovered nested
  //     folders are open by default without re-seeding on each `files` change.
  const defaultAllOpen = () => local.defaultExpanded === undefined;
  const [openSet, setOpenSet] = createSignal<Set<string>>(
    new Set(local.defaultExpanded ?? []),
    { equals: false },
  );
  const [closedSet, setClosedSet] = createSignal<Set<string>>(new Set(), { equals: false });

  const isOpen = (path: string) =>
    defaultAllOpen() ? !closedSet().has(path) : openSet().has(path);

  const toggle = (path: string) => {
    if (defaultAllOpen()) {
      setClosedSet((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    } else {
      setOpenSet((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    }
  };

  // Summary header derivations (only read when `summary` is set).
  const folderPaths = createMemo(() => collectFolderPaths(tree()));
  const leafFiles = createMemo(() => collectFiles(tree()));
  const fileCount = () => leafFiles().length;
  const totalAdds = () => leafFiles().reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const totalDels = () => leafFiles().reduce((sum, f) => sum + (f.deletions ?? 0), 0);
  const anyOpen = () => folderPaths().some((p) => isOpen(p));
  const collapseAll = () => {
    if (defaultAllOpen()) setClosedSet(new Set<string>(folderPaths()));
    else setOpenSet(new Set<string>());
  };
  const expandAll = () => {
    if (defaultAllOpen()) setClosedSet(new Set<string>());
    else setOpenSet(new Set<string>(folderPaths()));
  };
  const toggleAll = () => (anyOpen() ? collapseAll() : expandAll());

  const [focusedPath, setFocusedPath] = createSignal<string | undefined>();

  const selectFile = (node: FileTreeFileNode) => {
    setFocusedPath(node.path);
    local.onSelect?.(node.path, node.file);
  };

  const onKeyDown = (e: KeyboardEvent, node: FileTreeNode) => {
    const visible = flattenVisible(tree(), isOpen);
    const idx = visible.findIndex((n) => n.path === node.path && n.kind === node.kind);
    const focus = (n: FileTreeNode | undefined) => {
      if (!n) return;
      setFocusedPath(n.path);
      const sel = `[data-tree-path="${cssEscape(n.path)}"][data-tree-kind="${n.kind}"]`;
      (e.currentTarget as HTMLElement)
        .closest('[role="tree"]')
        ?.querySelector<HTMLElement>(sel)
        ?.focus();
    };
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focus(visible[idx + 1]);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focus(visible[idx - 1]);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (node.kind === 'folder') {
          if (!isOpen(node.path)) toggle(node.path);
          else focus(visible[idx + 1]);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (node.kind === 'folder' && isOpen(node.path)) {
          toggle(node.path);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (node.kind === 'folder') toggle(node.path);
        else selectFile(node);
        break;
    }
  };

  return (
    <>
      <Show when={local.summary}>
        <div
          part="summary"
          class="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground border-b border-border"
        >
          <span class="font-medium text-foreground">
            {fileCount()} {fileCount() === 1 ? 'file' : 'files'} changed
          </span>
          <Show when={totalAdds() > 0}>
            <span class="text-tool-green tabular-nums">+{totalAdds()}</span>
          </Show>
          <Show when={totalDels() > 0}>
            <span class="text-tool-red tabular-nums">-{totalDels()}</span>
          </Show>
          <Show when={folderPaths().length > 0}>
            <button
              type="button"
              class={cn(
                'ml-auto rounded-md px-1.5 py-0.5 font-medium text-muted-foreground outline-none',
                'hover:bg-muted hover:text-foreground',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              )}
              aria-label={anyOpen() ? 'Collapse all folders' : 'Expand all folders'}
              onClick={toggleAll}
            >
              {anyOpen() ? 'Collapse all' : 'Expand all'}
            </button>
          </Show>
        </div>
      </Show>
      <div
        role="tree"
        aria-label="Files"
        class={cn('text-sm select-none', local.class)}
        {...rest}
      >
        <For each={tree()}>
          {(node) => (
            <TreeNode
              node={node}
              depth={0}
              isOpen={isOpen}
              toggle={toggle}
              activeFile={() => local.activeFile}
              focusedPath={focusedPath}
              onSelectFile={selectFile}
              onKeyDown={onKeyDown}
            />
          )}
        </For>
      </div>
    </>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  isOpen: (path: string) => boolean;
  toggle: (path: string) => void;
  activeFile: () => string | undefined;
  focusedPath: () => string | undefined;
  onSelectFile: (node: FileTreeFileNode) => void;
  onKeyDown: (e: KeyboardEvent, node: FileTreeNode) => void;
}

function TreeNode(props: TreeNodeProps): JSX.Element {
  const node = () => props.node;
  const open = () => props.node.kind === 'folder' && props.isOpen(props.node.path);
  const isActive = () =>
    props.node.kind === 'file' && props.activeFile() === props.node.path;
  // Roving tabindex: the focused row (or the active file as a fallback) is the
  // single tab stop into the tree.
  const tabIndex = () => {
    const focused = props.focusedPath();
    if (focused !== undefined) return props.node.path === focused ? 0 : -1;
    return isActive() ? 0 : -1;
  };

  const indent = () => ({ 'padding-left': `${props.depth * 12 + 8}px` });

  return (
    <Show
      when={props.node.kind === 'folder'}
      fallback={(() => {
        const file = (props.node as FileTreeFileNode).file;
        const ariaName = fileAccessibleName(node().name, file);
        const hasMeta = ariaName !== undefined;
        const status = file.status ? STATUS_META[file.status] : undefined;
        return (
          <div
            role="treeitem"
            aria-selected={isActive()}
            aria-label={ariaName}
            data-tree-path={props.node.path}
            data-tree-kind="file"
            tabindex={tabIndex()}
            class={cn(
              'flex items-center gap-1.5 rounded-md py-1 pr-2 cursor-pointer outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              isActive()
                ? 'bg-primary/10 text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            style={indent()}
            onClick={() => props.onSelectFile(props.node as FileTreeFileNode)}
            onKeyDown={(e) => props.onKeyDown(e, props.node)}
          >
            <span class="w-3.5 shrink-0" />
            {(() => {
              const Icon = iconFor(file.type);
              return <Icon size={14} class="shrink-0 opacity-70" aria-hidden="true" />;
            })()}
            <span class={cn('truncate', hasMeta && 'min-w-0 flex-1')}>{node().name}</span>
            <Show when={hasMeta}>
              <span
                class="ml-auto flex items-center gap-1.5 shrink-0 pl-2 text-xs"
                aria-hidden="true"
              >
                <Show when={file.additions !== undefined}>
                  <span part="stat-additions" class="text-tool-green tabular-nums">
                    +{file.additions}
                  </span>
                </Show>
                <Show when={file.deletions !== undefined}>
                  <span part="stat-deletions" class="text-tool-red tabular-nums">
                    -{file.deletions}
                  </span>
                </Show>
                <Show when={status}>
                  <span
                    part="status"
                    class={cn('w-3 text-center font-mono font-semibold', status!.class)}
                  >
                    {status!.letter}
                  </span>
                </Show>
              </span>
            </Show>
          </div>
        );
      })()}
    >
      <div role="none">
        <div
          role="treeitem"
          aria-expanded={open()}
          data-tree-path={props.node.path}
          data-tree-kind="folder"
          tabindex={tabIndex()}
          class={cn(
            'flex items-center gap-1.5 rounded-md py-1 pr-2 cursor-pointer outline-none text-foreground',
            'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          )}
          style={indent()}
          onClick={() => props.toggle(props.node.path)}
          onKeyDown={(e) => props.onKeyDown(e, props.node)}
        >
          <ChevronRight
            size={14}
            class={cn('shrink-0 transition-transform opacity-70', open() && 'rotate-90')}
            aria-hidden="true"
          />
          {(() => {
            const Icon = open() ? FolderOpen : Folder;
            // Decorative folder icon, not a control (the row is the click
            // target) — was the BRAND token. `text-foreground/80` matches the
            // row's own `text-foreground` and the chevron's neutral opacity
            // treatment two lines above.
            return <Icon size={14} class="shrink-0 text-foreground/80" aria-hidden="true" />;
          })()}
          <span class="truncate font-medium">{node().name}</span>
        </div>
        <Show when={open()}>
          <div role="group">
            <For each={(props.node as FileTreeFolderNode).children}>
              {(child) => (
                <TreeNode
                  node={child}
                  depth={props.depth + 1}
                  isOpen={props.isOpen}
                  toggle={props.toggle}
                  activeFile={props.activeFile}
                  focusedPath={props.focusedPath}
                  onSelectFile={props.onSelectFile}
                  onKeyDown={props.onKeyDown}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

/** Minimal CSS.escape fallback for attribute-selector building (paths with `/`, `.`). */
function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/["\\]/g, '\\$&');
}
