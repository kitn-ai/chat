import { render } from 'solid-js/web';
import { createResource, Show } from 'solid-js';
import { GalleryPage, type GalleryBlock } from './GalleryPage';
import './styles.css';

// Chrome is dark by default (matches the builder shell); ?theme=light opts
// into the light palette via the kit's `.dark` class convention.
if (new URLSearchParams(window.location.search).get('theme') === 'light') {
  document.documentElement.classList.remove('dark');
}

/** The registry index shape this page reads (dist/blocks/registry.json,
 *  served at /gallery/api/registry.json). Browse fields only — file contents
 *  come from the per-block item JSON, the public integration surface. */
interface RegistryIndex {
  items: {
    name: string;
    title: string;
    description: string;
    categories?: string[];
    docs?: string;
    meta?: { iframeHeight?: string };
  }[];
}

interface RegistryItem {
  files: { path: string; content: string }[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
}

/** Load the whole gallery model: the index, then each block's item JSON
 *  (file contents for the code view) and its CDN form (the secondary
 *  try-it/download affordance). A missing CDN form degrades to no row —
 *  the block itself still browses. */
async function loadBlocks(): Promise<GalleryBlock[]> {
  const index = await fetchJson<RegistryIndex>('/gallery/api/registry.json');
  return Promise.all(
    index.items.map(async (item) => {
      const detail = await fetchJson<RegistryItem>(`/gallery/api/r/${item.name}.json`);
      const cdnRes = await fetch(`/gallery/api/r/${item.name}.cdn.html`);
      return {
        name: item.name,
        title: item.title,
        description: item.description,
        categories: item.categories ?? [],
        iframeHeight: item.meta?.iframeHeight,
        files: detail.files.map((f) => ({ path: f.path, content: f.content })),
        docs: item.docs,
        previewSrc: `/gallery/preview/${item.name}/`,
        cdnHtml: cdnRes.ok ? await cdnRes.text() : undefined,
      } satisfies GalleryBlock;
    }),
  );
}

function App() {
  const [blocks] = createResource(loadBlocks);
  return (
    <Show
      when={blocks()}
      fallback={
        <div class="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
          <Show when={blocks.error} fallback={<p>Loading blocks…</p>}>
            <p role="alert">
              Could not load the block registry: {String(blocks.error?.message ?? blocks.error)}. Run a kit build
              (nx build ui) so dist/blocks exists, then reload.
            </p>
          </Show>
        </div>
      }
    >
      {(loaded) => <GalleryPage blocks={loaded()} />}
    </Show>
  );
}

const root = document.getElementById('root')!;
root.style.height = '100vh';
render(() => <App />, root);
