import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { GalleryPage, type GalleryBlock } from './GalleryPage';
import {
  componentName,
  renderCdnFormFiles,
  renderHtmlForm,
  renderReactForm,
  type FormFile,
  type BlockFormId,
} from '@kitn.ai/blocks/forms';
import type { Block } from '@kitn.ai/blocks';

/**
 * Labs/Gallery — the blocks gallery page layout, STUB DATA ONLY
 * (story-first, owner policy 2026-08-26: new visual surfaces get a stub-data
 * story first for design iteration; the real page — `kai dev`'s /gallery/
 * route — renders this same component over the derived registry).
 *
 * The owner rulings this layout answers to (spec B-G amendment 2026-08-31,
 * plus the round-2 feedback): the gallery LEADS with the block's file tree —
 * per-file view + copy and the `npx create-kai add <name>` one-liner are the
 * primary affordances; the Code view carries a FRAMEWORK selector whose
 * forms come from the ONE shared renderer (`@kitn.ai/blocks/forms`
 * — the stub forms below are rendered through it, so the story shows real
 * renderer output); Download + the icon Copy live in the code header; the
 * standalone CDN form is a secondary try-it row.
 */

const src = (code: string) => ({
  parameters: { docs: { source: { code, language: 'tsx' } } },
});

// THE STUB BLOCK IS AUTHORED ON THE CONTRACT, not a lookalike page. Both
// renderers refuse an unconverted page now (an authored `<script>`, no
// `data-block-root`, no controller), and this module renders at import time,
// so an unconverted stub does not fail a story: it fails the whole story file
// to LOAD, which is how CI found it. The shape is the one
// `packages/create-kai/test/helpers.ts`'s `authoredBlock()` builds: a page
// with one block root and its wiring on the markup, a controller carrying the
// three contract-named interfaces, and a hand-written `.js` twin beside every
// `.ts` (a story cannot run esbuild, and the html form ships JavaScript).
const stubHtml = (name: string, title: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <link rel="stylesheet" href="./${name}.css" />
  </head>
  <body>
    <p class="host-stand-in">This blank page stands in for your site.</p>
    <kai-dock data-block-root #ref="dock" seed:position="bottom-right" @kai-open-change="openChange">
      <kai-panel>
        <span .textContent="heading"></span>
        <kai-view-stack #ref="stack"></kai-view-stack>
      </kai-panel>
    </kai-dock>
  </body>
</html>
`;

const stubController = (component: string) => `import { SCRIPT } from './mock.js';

export interface ${component}State {
  heading: string;
}

export interface ${component}Refs {
  dock: unknown;
  stack: unknown;
}

export interface ${component}Actions {
  openChange(event: CustomEvent<{ open: boolean }>): void;
  boot(): Promise<void>;
}

export function createController(deps: { refs: () => ${component}Refs }) {
  let state: ${component}State = { heading: SCRIPT[0].text };
  const listeners = new Set<() => void>();

  const actions: ${component}Actions = {
    openChange(event) {
      if (!event.detail.open) deps.refs();
    },
    async boot() {},
  };

  return {
    state: () => state,
    actions,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
`;

/** The twin the html and cdn forms ship. Hand-written because a story has no
 *  esbuild: it is `stubController` with the types taken off. */
const stubControllerJs = `import { SCRIPT } from './mock.js';

export function createController(deps) {
  let state = { heading: SCRIPT[0].text };
  const listeners = new Set();

  const actions = {
    openChange(event) {
      if (!event.detail.open) deps.refs();
    },
    async boot() {},
  };

  return {
    state: () => state,
    actions,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
`;

const STUB_CSS = `body { margin: 0; }
kai-panel { display: block; height: 100%; }
`;

const STUB_MOCK_TS = `export const SCRIPT: { role: string; text: string }[] = [
  { role: 'assistant', text: 'Hi! How can I help today?' },
];
`;

const STUB_MOCK_JS = `export const SCRIPT = [
  { role: 'assistant', text: 'Hi! How can I help today?' },
];
`;

function stubPreview(label: string) {
  return (
    <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
      <p>{label} renders here (live in kai dev's /gallery/ route)</p>
    </div>
  );
}

/** The stub block in the AUTHORED shape, so the story's forms come out of
 *  the one shared renderer rather than being hand-typed lookalikes. */
function authoredStub(name: string, title: string): Block {
  const component = componentName(name);
  const files = new Map<string, string>([
    [`${name}.html`, stubHtml(name, title)],
    [`${name}.controller.ts`, stubController(component)],
    [`${name}.controller.js`, stubControllerJs],
    [`${name}.css`, STUB_CSS],
    ['mock.ts', STUB_MOCK_TS],
    ['mock.js', STUB_MOCK_JS],
  ]);
  return {
    name,
    manifest: {
      name,
      title,
      description: '',
      type: 'registry:block',
      files: [
        { path: `${name}.html`, type: 'registry:page' },
        { path: `${name}.controller.ts`, type: 'registry:file' },
        { path: `${name}.controller.js`, type: 'registry:file' },
        { path: `${name}.css`, type: 'registry:file' },
        { path: 'mock.ts', type: 'registry:file' },
        { path: 'mock.js', type: 'registry:file' },
      ],
    },
    files,
  };
}

function stubForms(block: Block): Partial<Record<BlockFormId, FormFile[]>> {
  return {
    html: renderHtmlForm(block),
    react: renderReactForm(block),
    cdn: renderCdnFormFiles(block, { version: '0.0.0-story', base: '/kit/' }),
  };
}

function stubBlock(overrides: Partial<GalleryBlock> & Pick<GalleryBlock, 'name' | 'title' | 'categories'>): GalleryBlock {
  const authored = authoredStub(overrides.name, overrides.title);
  return {
    description:
      'A docked support widget: panel, tab bar, view stack, home rows, thread and conversations, driven by the headless conversation controller.',
    iframeHeight: '640px',
    forms: stubForms(authored),
    docs: 'Runs against a scripted local mock out of the box. To go live, replace the mock responder with a fetch to your chat endpoint and keep parsing through the @kitn.ai/ui/wire readers.',
    preview: stubPreview(overrides.title),
    cdnHtml: authored.files.get(`${overrides.name}.html`),
    ...overrides,
  };
}

const STUB_BLOCKS: GalleryBlock[] = [
  stubBlock({ name: 'support-widget', title: 'Support widget', categories: ['widget', 'support'] }),
  stubBlock({
    name: 'assistant',
    title: 'Assistant',
    categories: ['assistant', 'full-page'],
    description:
      'Full-page assistant with a conversations rail, a model switcher recipe in the top bar, and a thread plus prompt input over the conversation controller.',
    iframeHeight: '720px',
  }),
  stubBlock({
    name: 'in-app-assistant',
    title: 'In-app assistant',
    categories: ['assistant', 'aside'],
    description: 'A docked aside assistant over your host content.',
  }),
];

const meta = {
  title: 'Labs/Gallery',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const BlocksGallery: Story = {
  render: () => (
    <div style={{ height: '100vh' }}>
      <GalleryPage blocks={STUB_BLOCKS} />
    </div>
  ),
  ...src(`<GalleryPage blocks={blocks} />`),
};

export const CodeView: Story = {
  name: 'Code view (file tree leads)',
  render: () => (
    <div style={{ height: '100vh' }}>
      <GalleryPage blocks={STUB_BLOCKS} initial="support-widget" defaultTab="code" />
    </div>
  ),
  ...src(`<GalleryPage blocks={blocks} initial="support-widget" defaultTab="code" />`),
};
