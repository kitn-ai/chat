import { render } from 'solid-js/web';
import { createResource, Show } from 'solid-js';
import { GalleryPage, type GalleryBlock } from './GalleryPage';
import { BLOCK_FORMS, type BlockFormId, type FormFile } from '../../mcp/blocks/forms';
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
}

/** Every delivery form the server can render for one block, from the shared
 *  renderer's GET route — the axis comes from `BLOCK_FORMS` (one derivation).
 *  A form the server cannot render for this block (route answers non-OK) is
 *  simply not offered (menu honesty), never a dead tab. */
async function loadForms(name: string): Promise<Partial<Record<BlockFormId, FormFile[]>>> {
  const forms: Partial<Record<BlockFormId, FormFile[]>> = {};
  await Promise.all(
    BLOCK_FORMS.map(async ({ id }) => {
      const res = await fetch(`/gallery/api/form/${name}/${id}`);
      if (res.ok) forms[id] = ((await res.json()) as { files: FormFile[] }).files;
    }),
  );
  return forms;
}

/** Load the whole gallery model: the index, then each block's rendered
 *  delivery forms (the code view's framework axis) and its CDN form (the
 *  secondary try-it affordance). A missing CDN form degrades to no row —
 *  the block itself still browses. */
async function loadBlocks(): Promise<GalleryBlock[]> {
  const index = await fetchJson<RegistryIndex>('/gallery/api/registry.json');
  return Promise.all(
    index.items.map(async (item) => {
      const [forms, cdnRes] = await Promise.all([
        loadForms(item.name),
        fetch(`/gallery/api/r/${item.name}.cdn.html`),
      ]);
      return {
        name: item.name,
        title: item.title,
        description: item.description,
        categories: item.categories ?? [],
        iframeHeight: item.meta?.iframeHeight,
        forms,
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
