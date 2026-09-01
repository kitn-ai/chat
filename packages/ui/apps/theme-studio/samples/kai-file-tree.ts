// Sample data for <kai-file-tree>.
//
// `files` is scalar:false — a flat array of { path, url?, code?, language?, type? }
// objects. Folders are derived from `/` separators in each path; no explicit folder
// entries are needed.
//
// `defaultExpanded` is also scalar:false — an optional string[] of folder paths
// that should be expanded on first render. Omit it to start with all folders open.
//
// `sample`  = default data shown by the Playground + bare examples
// `named`   = alternate sets referenced by <Example data="…">

const DEFAULT_FILES = [
  { path: 'index.html', type: 'html' },
  { path: 'about.html', type: 'html' },
  { path: 'css/site.css', type: 'other', language: 'css' },
  { path: 'src/app.ts', type: 'other', language: 'ts' },
  { path: 'src/lib/format.ts', type: 'other', language: 'ts' },
  { path: 'src/lib/parse.ts', type: 'other', language: 'ts' },
  { path: 'assets/logo.svg', type: 'image' },
  { path: 'assets/report.pdf', type: 'pdf' },
];

// A deeper project layout with more nesting — good for showing the collapsible
// folder behaviour across multiple levels.
const NESTED_FILES = [
  { path: 'src/components/Button.tsx', type: 'other', language: 'tsx' },
  { path: 'src/components/Card.tsx', type: 'other', language: 'tsx' },
  { path: 'src/components/Modal.tsx', type: 'other', language: 'tsx' },
  { path: 'src/hooks/useTheme.ts', type: 'other', language: 'ts' },
  { path: 'src/hooks/useDebounce.ts', type: 'other', language: 'ts' },
  { path: 'src/lib/api.ts', type: 'other', language: 'ts' },
  { path: 'src/lib/utils.ts', type: 'other', language: 'ts' },
  { path: 'public/favicon.ico', type: 'image' },
  { path: 'public/og-image.png', type: 'image' },
  { path: 'docs/getting-started.md', type: 'other', language: 'md' },
  { path: 'docs/api-reference.md', type: 'other', language: 'md' },
];

// A design-system snapshot — mixed asset types to exercise every icon variant.
const MIXED_TYPES_FILES = [
  { path: 'tokens/colors.json', type: 'other', language: 'json' },
  { path: 'tokens/typography.json', type: 'other', language: 'json' },
  { path: 'icons/logo.svg', type: 'image' },
  { path: 'icons/avatar-placeholder.svg', type: 'image' },
  { path: 'fonts/inter-regular.woff2', type: 'other' },
  { path: 'docs/overview.pdf', type: 'pdf' },
  { path: 'preview/index.html', type: 'html' },
  { path: 'preview/styles.css', type: 'other', language: 'css' },
];

// Collapsed root — only one folder starts open, the rest start collapsed.
const COLLAPSED_FILES = [
  { path: 'src/index.ts', type: 'other', language: 'ts' },
  { path: 'src/server.ts', type: 'other', language: 'ts' },
  { path: 'src/routes/auth.ts', type: 'other', language: 'ts' },
  { path: 'src/routes/users.ts', type: 'other', language: 'ts' },
  { path: 'src/routes/posts.ts', type: 'other', language: 'ts' },
  { path: 'src/middleware/logger.ts', type: 'other', language: 'ts' },
  { path: 'src/middleware/cors.ts', type: 'other', language: 'ts' },
  { path: 'tests/auth.test.ts', type: 'other', language: 'ts' },
  { path: 'tests/users.test.ts', type: 'other', language: 'ts' },
];

export default {
  sample: {
    files: DEFAULT_FILES,
    activeFile: 'src/app.ts',
  },
  named: {
    nested: {
      files: NESTED_FILES,
      activeFile: 'src/components/Button.tsx',
    },
    mixedTypes: {
      files: MIXED_TYPES_FILES,
      // No active-file selection — this example focuses on icon variety, not selection state.
      // Explicitly set to undefined so the base sample's activeFile does not bleed in.
      activeFile: undefined,
    },
    collapsed: {
      files: COLLAPSED_FILES,
      defaultExpanded: ['src'],
      // src/index.ts is in COLLAPSED_FILES and lives in the one open folder.
      activeFile: 'src/index.ts',
    },
  },
};
