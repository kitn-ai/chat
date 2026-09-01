import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { GalleryPage, type GalleryBlock } from './GalleryPage';

/**
 * Labs/Gallery — the blocks gallery page layout, STUB DATA ONLY
 * (story-first, owner policy 2026-08-26: new visual surfaces get a stub-data
 * story first for design iteration; the real page — `kai dev`'s /gallery/
 * route — renders this same component over the derived registry).
 *
 * The owner ruling this layout answers to (spec B-G amendment, 2026-08-31):
 * the gallery LEADS with the block's file tree — per-file view + copy and the
 * `npx create-kai add <name>` one-liner are the primary affordances; the
 * standalone CDN form is a secondary try-it/download row.
 */

const src = (code: string) => ({
  parameters: { docs: { source: { code, language: 'tsx' } } },
});

const STUB_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Support widget</title>
    <link rel="stylesheet" href="./support-widget.css" />
  </head>
  <body>
    <kai-dock position="bottom-right">
      <kai-panel>
        <kai-view-stack></kai-view-stack>
      </kai-panel>
    </kai-dock>
    <script type="module" src="./support-widget.js"></script>
  </body>
</html>
`;

const STUB_JS = `import '@kitn.ai/ui/autoloader';
import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import { SCRIPT } from './mock.js';

const thread = document.querySelector('kai-thread');
// Array/object props are set as JS PROPERTIES, never attributes.
thread.messages = [];
`;

const STUB_CSS = `body { margin: 0; }
kai-panel { display: block; height: 100%; }
`;

const STUB_MOCK = `export const SCRIPT = [
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

function stubBlock(overrides: Partial<GalleryBlock> & Pick<GalleryBlock, 'name' | 'title' | 'categories'>): GalleryBlock {
  return {
    description:
      'A docked support widget: panel, tab bar, view stack, home rows, thread and conversations, driven by the headless conversation controller.',
    iframeHeight: '640px',
    files: [
      { path: `${overrides.name}.html`, content: STUB_HTML },
      { path: `${overrides.name}.js`, content: STUB_JS },
      { path: `${overrides.name}.css`, content: STUB_CSS },
      { path: 'mock.js', content: STUB_MOCK },
    ],
    docs: 'Runs against a scripted local mock out of the box. To go live, replace the mock responder with a fetch to your chat endpoint and keep parsing through the @kitn.ai/ui/wire readers.',
    preview: stubPreview(overrides.title),
    cdnHtml: STUB_HTML,
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
