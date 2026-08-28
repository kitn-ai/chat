import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { fn } from 'storybook/test';
import { FileTree, type FileTreeFile } from './file-tree';
import { componentDescription } from '../stories/docs/element-controls';

const FILES: FileTreeFile[] = [
  { path: 'index.html', type: 'html' },
  { path: 'about.html', type: 'html' },
  { path: 'css/site.css', type: 'other', language: 'css' },
  { path: 'src/app.ts', type: 'other', language: 'ts' },
  { path: 'src/lib/format.ts', type: 'other', language: 'ts' },
  { path: 'src/lib/parse.ts', type: 'other', language: 'ts' },
  { path: 'assets/logo.svg', type: 'image' },
  { path: 'assets/report.pdf', type: 'pdf' },
];

/** Same flat list, with diff metadata: `additions`/`deletions` render as trailing
 *  `+N`/`-N` stats and `status` adds a colored A/M/D/R/U letter. */
const CHANGED: FileTreeFile[] = [
  { path: 'README.md', type: 'other', additions: 12, deletions: 0, status: 'added' },
  { path: 'src/app.ts', type: 'other', language: 'ts', additions: 24, deletions: 6, status: 'modified' },
  { path: 'src/lib/format.ts', type: 'other', language: 'ts', additions: 3, deletions: 1, status: 'modified' },
  { path: 'src/lib/legacy.ts', type: 'other', language: 'ts', additions: 0, deletions: 58, status: 'deleted' },
  { path: 'src/lib/parse.ts', type: 'other', language: 'ts', additions: 9, deletions: 9, status: 'renamed' },
  { path: 'scratch.ts', type: 'other', language: 'ts', additions: 41, deletions: 0, status: 'untracked' },
];

const meta = {
  title: 'Components/Elements/FileTree',
  component: FileTree,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A collapsible, keyboard-navigable file explorer (ARIA `tree`) built from a flat `files` list of `/`-delimited paths: nested folders are derived automatically and `type` picks each icon.',
        'Drive the highlight with `activeFile`, open folders with `defaultExpanded`, and handle selection via `onSelect(path, file)`. Used in the Code tab of `Artifact`.',
        'For a changed-files view, give files `additions`/`deletions`/`status` and set `summary` for a header with the count, summed `+/-`, and a Collapse-all toggle.',
      ]),
    },
  },
  argTypes: {
    files: { control: false },
    activeFile: { control: 'text' },
    summary: { control: 'boolean' },
    onSelect: {
      action: 'select',
      description: 'A file was selected; called with `(path, file)`.',
      table: { category: 'Events' },
    },
  },
  args: { files: FILES, activeFile: 'src/app.ts', onSelect: fn() },
  render: (args) => (
    <div class="w-64 h-80 overflow-auto rounded-lg border border-border kai-scrollbar-thin">
      <FileTree
        files={args.files}
        activeFile={args.activeFile}
        summary={args.summary}
        onSelect={args.onSelect}
      />
    </div>
  ),
} satisfies Meta<typeof FileTree>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { FileTree, type FileTreeFile } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

export const Playground: Story = {
  ...src(`// Flat list of \`/\`-delimited paths: folders are derived automatically.
const files: FileTreeFile[] = [
  { path: 'index.html', type: 'html' },
  { path: 'css/site.css', type: 'other', language: 'css' },
  { path: 'src/app.ts', type: 'other', language: 'ts' },
  { path: 'src/lib/format.ts', type: 'other', language: 'ts' },
  { path: 'assets/logo.svg', type: 'image' },
  // …
];

<FileTree
  files={files}
  activeFile="src/app.ts"
  onSelect={(path, file) => console.log('select', path, file)}
/>`),
};

/** Drives selection from `onSelect`: the controlled pattern. */
export const Interactive: Story = {
  render: () => {
    const [active, setActive] = createSignal('src/lib/format.ts');
    return (
      <div class="flex flex-col gap-2">
        <div class="w-64 h-80 overflow-auto rounded-lg border border-border kai-scrollbar-thin">
          <FileTree files={FILES} activeFile={active()} onSelect={(p) => setActive(p)} />
        </div>
        <span class="text-sm text-muted-foreground">
          Selected: <code>{active()}</code>
        </span>
      </div>
    );
  },
  ...src(`const [active, setActive] = createSignal('src/lib/format.ts');
<FileTree files={files} activeFile={active()} onSelect={setActive} />`),
};

/** A changed-files / diff view: `additions`/`deletions`/`status` per file plus the
 *  `summary` header (count, summed `+/-`, Collapse-all). A plain list (no diff
 *  metadata) renders exactly as the other stories. */
export const ChangedFiles: Story = {
  args: { files: CHANGED, activeFile: 'src/app.ts', summary: true },
  ...src(`const files: FileTreeFile[] = [
  { path: 'README.md', additions: 12, deletions: 0, status: 'added' },
  { path: 'src/app.ts', additions: 24, deletions: 6, status: 'modified' },
  { path: 'src/lib/legacy.ts', additions: 0, deletions: 58, status: 'deleted' },
  { path: 'src/lib/parse.ts', additions: 9, deletions: 9, status: 'renamed' },
  // …
];

<FileTree files={files} summary onSelect={(path) => console.log('open diff', path)} />`),
};
