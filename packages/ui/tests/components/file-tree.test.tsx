// tests/components/file-tree.test.tsx
import { render, fireEvent } from '@solidjs/testing-library';
import {
  buildFileTree,
  FileTree,
  type FileTreeFile,
  type FileTreeFolderNode,
  type FileTreeFileNode,
} from '../../src/components/file-tree';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('buildFileTree', () => {
  test('builds nested folders from /-delimited paths', () => {
    const files: FileTreeFile[] = [
      { path: 'index.html' },
      { path: 'src/app.ts' },
      { path: 'src/lib/util.ts' },
    ];
    const tree = buildFileTree(files);
    // folders sort before files: [src(folder), index.html(file)]
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual(['folder:src', 'file:index.html']);

    const src = tree[0] as FileTreeFolderNode;
    expect(src.kind).toBe('folder');
    expect(src.path).toBe('src');
    // src children: lib(folder), app.ts(file)
    expect(src.children.map((n) => `${n.kind}:${n.name}`)).toEqual(['folder:lib', 'file:app.ts']);

    const lib = src.children[0] as FileTreeFolderNode;
    expect(lib.path).toBe('src/lib');
    const util = lib.children[0] as FileTreeFileNode;
    expect(util.kind).toBe('file');
    expect(util.path).toBe('src/lib/util.ts');
    expect(util.file.path).toBe('src/lib/util.ts');
  });

  test('reuses (de-dupes) shared folder nodes across files', () => {
    const tree = buildFileTree([{ path: 'a/b/x.ts' }, { path: 'a/b/y.ts' }, { path: 'a/c.ts' }]);
    expect(tree.length).toBe(1); // single root folder 'a'
    const a = tree[0] as FileTreeFolderNode;
    // a: [b(folder), c.ts(file)]
    expect(a.children.map((n) => n.name)).toEqual(['b', 'c.ts']);
    const b = a.children[0] as FileTreeFolderNode;
    expect(b.children.map((n) => n.name)).toEqual(['x.ts', 'y.ts']);
  });

  test('ignores empty/blank paths and trims leading/trailing slashes', () => {
    const tree = buildFileTree([{ path: '' }, { path: '/foo/bar.ts/' }]);
    expect(tree.length).toBe(1);
    const foo = tree[0] as FileTreeFolderNode;
    expect(foo.name).toBe('foo');
    expect((foo.children[0] as FileTreeFileNode).name).toBe('bar.ts');
  });

  test('carries file metadata onto the leaf node', () => {
    const tree = buildFileTree([
      { path: 'page.html', url: 'https://cdn/page.html', code: '<h1>', language: 'html', type: 'html' },
    ]);
    const leaf = tree[0] as FileTreeFileNode;
    expect(leaf.file.url).toBe('https://cdn/page.html');
    expect(leaf.file.type).toBe('html');
    expect(leaf.file.language).toBe('html');
  });
});

describe('<FileTree>', () => {
  const files: FileTreeFile[] = [
    { path: 'index.html', type: 'html' },
    { path: 'src/app.ts', type: 'other' },
    { path: 'src/styles.css', type: 'other' },
  ];

  test('renders an ARIA tree with treeitems', () => {
    const { getByRole, getAllByRole } = render(() => <FileTree files={files} />);
    expect(getByRole('tree')).toBeTruthy();
    // folders open by default → src folder + its 2 files + index.html = 4 treeitems
    const items = getAllByRole('treeitem');
    expect(items.length).toBe(4);
  });

  test('selecting a file fires onSelect with path + file', () => {
    let picked: { path: string; file: FileTreeFile } | null = null;
    const { getAllByRole } = render(() => (
      <FileTree files={files} onSelect={(path, file) => (picked = { path, file })} />
    ));
    // find the index.html row
    const indexRow = getAllByRole('treeitem').find((el) => el.textContent?.includes('index.html'))!;
    fireEvent.click(indexRow);
    expect(picked).not.toBeNull();
    expect(picked!.path).toBe('index.html');
    expect(picked!.file.type).toBe('html');
  });

  test('clicking a folder collapses/expands it (aria-expanded + child visibility)', () => {
    const { getAllByRole, queryByText } = render(() => <FileTree files={files} />);
    const folder = getAllByRole('treeitem').find((el) => el.getAttribute('data-tree-kind') === 'folder')!;
    expect(folder.getAttribute('aria-expanded')).toBe('true');
    expect(queryByText('app.ts')).toBeTruthy();
    fireEvent.click(folder);
    expect(folder.getAttribute('aria-expanded')).toBe('false');
    expect(queryByText('app.ts')).toBeNull();
  });

  test('active file is marked aria-selected', () => {
    const { getAllByRole } = render(() => <FileTree files={files} activeFile="src/app.ts" />);
    const active = getAllByRole('treeitem').find((el) => el.getAttribute('aria-selected') === 'true')!;
    expect(active.textContent).toContain('app.ts');
  });

  test('respects defaultExpanded (folders not listed start collapsed)', () => {
    const { getAllByRole, queryByText } = render(() => (
      <FileTree files={files} defaultExpanded={[]} />
    ));
    const folder = getAllByRole('treeitem').find((el) => el.getAttribute('data-tree-kind') === 'folder')!;
    expect(folder.getAttribute('aria-expanded')).toBe('false');
    expect(queryByText('app.ts')).toBeNull();
  });

  // `files` is required, so it must NOT be defaulted to [] inside the component:
  // a caller who forgets it should fail here, not render a silently empty tree
  // that looks like "no files" and fails somewhere else. TypeScript stops this at
  // compile time; the cast gets past it to pin the RUNTIME behaviour, so the
  // mergeProps default cannot quietly come back. `<kai-file-tree>` is unaffected —
  // the facade declares its own `files: []`.
  test('omitting the required files prop fails where the mistake is', () => {
    expect(() =>
      render(() => <FileTree {...({} as unknown as { files: FileTreeFile[] })} />),
    ).toThrow();
  });

  // Decorative folder icon, not a control (the row is the click target) — used
  // to carry `text-primary`, the BRAND token. Cheap jsdom pin on the class list
  // only; the real computed-color proof lives in
  // tests/e2e/content-brand-bleed.spec.ts.
  test('folder icon never emits text-primary; uses text-foreground/80', () => {
    const { getAllByRole } = render(() => <FileTree files={files} />);
    const folder = getAllByRole('treeitem').find((el) => el.getAttribute('data-tree-kind') === 'folder')!;
    const svgs = Array.from(folder.querySelectorAll('svg'));
    const withPrimary = svgs.filter((s) => (s.getAttribute('class') ?? '').includes('text-primary'));
    expect(withPrimary).toHaveLength(0);
    const withForeground = svgs.filter((s) => (s.getAttribute('class') ?? '').includes('text-foreground/80'));
    expect(withForeground.length).toBeGreaterThan(0);
  });
});

describe('<FileTree> changed-files / diff presentation', () => {
  // A plain list (no diff metadata) must render EXACTLY as today: no stats, no
  // status, no summary, and no extra accessible-name decoration.
  const plain: FileTreeFile[] = [
    { path: 'index.html', type: 'html' },
    { path: 'src/app.ts', type: 'other' },
  ];

  const diff: FileTreeFile[] = [
    { path: 'README.md', additions: 12, deletions: 0, status: 'added' },
    { path: 'src/App.tsx', additions: 3, deletions: 1, status: 'modified' },
    { path: 'src/old.ts', additions: 0, deletions: 40, status: 'deleted' },
  ];

  test('a no-metadata tree renders no diff bits and no row aria-label (unchanged)', () => {
    const { container, getAllByRole } = render(() => <FileTree files={plain} />);
    expect(container.querySelector('[part="summary"]')).toBeNull();
    expect(container.querySelector('[part="status"]')).toBeNull();
    expect(container.querySelector('[part="stat-additions"]')).toBeNull();
    expect(container.querySelector('[part="stat-deletions"]')).toBeNull();
    // File rows carry no aria-label, so their accessible name stays the text content.
    const fileRows = getAllByRole('treeitem').filter((el) => el.getAttribute('data-tree-kind') === 'file');
    expect(fileRows.every((el) => !el.hasAttribute('aria-label'))).toBe(true);
  });

  // Look up a FILE row by its name (the tree sorts folders first, so positional
  // order is not the input order).
  const fileRow = (getAllByRole: (role: string) => HTMLElement[], name: string) =>
    getAllByRole('treeitem').find(
      (el) => el.getAttribute('data-tree-kind') === 'file' && el.textContent?.includes(name),
    )!;

  test('renders +additions / -deletions stats when present (incl. 0)', () => {
    const { getAllByRole } = render(() => <FileTree files={diff} />);
    const app = fileRow(getAllByRole, 'App.tsx');
    expect(app.querySelector('[part="stat-additions"]')?.textContent).toBe('+3');
    expect(app.querySelector('[part="stat-deletions"]')?.textContent).toBe('-1');
    const readme = fileRow(getAllByRole, 'README.md');
    expect(readme.querySelector('[part="stat-additions"]')?.textContent).toBe('+12');
    expect(readme.querySelector('[part="stat-deletions"]')?.textContent).toBe('-0');
  });

  test('renders the status letter in the conventional hue', () => {
    const { getAllByRole } = render(() => <FileTree files={diff} />);
    const statusOf = (name: string) => fileRow(getAllByRole, name).querySelector('[part="status"]')!;
    expect(statusOf('README.md').textContent).toBe('A');
    expect(statusOf('README.md').className).toContain('text-tool-green'); // added
    expect(statusOf('App.tsx').textContent).toBe('M');
    expect(statusOf('App.tsx').className).toContain('text-tool-amber'); // modified
    expect(statusOf('old.ts').textContent).toBe('D');
    expect(statusOf('old.ts').className).toContain('text-tool-red'); // deleted
  });

  test('conveys status + stats in each row accessible name', () => {
    const { getAllByRole } = render(() => <FileTree files={diff} />);
    const appRow = fileRow(getAllByRole, 'App.tsx');
    expect(appRow.getAttribute('aria-label')).toBe('App.tsx, modified, 3 additions, 1 deletion');
    // The decorative stat/status cluster is aria-hidden so it does not double-announce.
    const status = appRow.querySelector('[part="status"]')!;
    expect(status.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  test('a row with only a status (no stats) labels just the status', () => {
    const { getAllByRole, container } = render(() => (
      <FileTree files={[{ path: 'moved.ts', status: 'renamed' }]} />
    ));
    const row = getAllByRole('treeitem').find((el) => el.getAttribute('data-tree-kind') === 'file')!;
    expect(row.getAttribute('aria-label')).toBe('moved.ts, renamed');
    expect(container.querySelector('[part="status"]')?.textContent).toBe('R');
    expect(container.querySelector('[part="stat-additions"]')).toBeNull();
  });

  test('summary header shows the changed-file count and summed +/-', () => {
    const { container, getByText } = render(() => <FileTree files={diff} summary />);
    const summary = container.querySelector('[part="summary"]')!;
    expect(summary).toBeTruthy();
    expect(getByText('3 files changed')).toBeTruthy();
    // Summed totals: +15 / -41.
    expect(summary.textContent).toContain('+15');
    expect(summary.textContent).toContain('-41');
  });

  test('summary count is singular for a single file', () => {
    const { getByText } = render(() => (
      <FileTree files={[{ path: 'only.ts', additions: 1, deletions: 0 }]} summary />
    ));
    expect(getByText('1 file changed')).toBeTruthy();
  });

  test('no summary header unless summary is set', () => {
    const { container } = render(() => <FileTree files={diff} />);
    expect(container.querySelector('[part="summary"]')).toBeNull();
  });

  test('collapse-all toggle folds/unfolds every folder', () => {
    const { container, getAllByRole, queryByText, getByRole } = render(() => (
      <FileTree files={diff} summary />
    ));
    // Folders open by default → the toggle offers to collapse.
    const toggle = getByRole('button', { name: 'Collapse all folders' });
    expect(queryByText('App.tsx')).toBeTruthy();
    fireEvent.click(toggle);
    // Every folder is now collapsed; nested files are gone and the label flips.
    const folders = getAllByRole('treeitem').filter((el) => el.getAttribute('data-tree-kind') === 'folder');
    expect(folders.every((el) => el.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(queryByText('App.tsx')).toBeNull();
    const expand = getByRole('button', { name: 'Expand all folders' });
    expect(expand.textContent).toBe('Expand all');
    fireEvent.click(expand);
    expect(queryByText('App.tsx')).toBeTruthy();
    expect(container.querySelector('[part="summary"]')).toBeTruthy();
  });
});
