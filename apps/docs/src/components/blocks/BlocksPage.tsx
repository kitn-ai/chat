/**
 * The /blocks page: hero, category strip, one card per block, stacked.
 *
 * PURE VIEW (R7). It takes the registry items and a loader, so the tests drive
 * the layout without a network mock. The fetching lives in BlocksIsland.tsx.
 *
 * The framework choice is GLOBAL across every card and sticky per viewer.
 *
 * The `.blocks-page` full-width marker is NOT here: it is server-rendered in
 * blocks.mdx, because :root:has(.blocks-page) has to match at first paint and
 * a client:only island renders nothing on the server.
 */
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { BlockCard } from './BlockCard';
import { createSiteTheme } from './site-theme';
import {
  previewFooter,
  readFramework,
  writeFramework,
  type BlockFormId,
  type FormPayload,
  type RegistryItem,
} from '../../lib/blocks-source';

export interface BlocksPageProps {
  items: RegistryItem[];
  loadForm: (id: string, form: BlockFormId) => Promise<FormPayload>;
}

export function BlocksPage(props: BlocksPageProps): JSX.Element {
  const [framework, setFramework] = createSignal<BlockFormId>(readFramework());
  // ONE observer for the section, not one per card. Every kai element on the
  // page follows it.
  const siteTheme = createSiteTheme();
  const [category, setCategory] = createSignal('all');

  const categories = createMemo(() => {
    const seen: string[] = [];
    for (const item of props.items) {
      for (const c of item.categories) if (!seen.includes(c)) seen.push(c);
    }
    return ['all', ...seen];
  });

  const visible = createMemo(() =>
    category() === 'all'
      ? props.items
      : props.items.filter((item) => item.categories.includes(category())),
  );

  const chooseFramework = (form: BlockFormId): void => {
    setFramework(form);
    writeFramework(form);
  };

  return (
    <div class="mx-auto w-full max-w-6xl px-4 py-10">
      <header class="mb-8">
        <h1 class="text-3xl font-black tracking-tight text-ink">Blocks</h1>
        {/* "built from" is not a phrase this page uses: the mockup's per-card
            "Built from" row is gone, and the test guards its absence across the
            whole page rather than one card. */}
        <p class="mt-2 max-w-2xl text-ink-2">
          Complete compositions made of kai elements. Preview one, read the files it writes, then
          run the command. Nothing here is a dependency: the files land in your project and they
          are yours.
        </p>
      </header>

      <nav aria-label="Block categories" class="mb-6 flex flex-wrap gap-1">
        <For each={categories()}>
          {(c) => (
            <button
              type="button"
              data-testid="category"
              data-category={c}
              aria-pressed={category() === c}
              class={
                category() === c
                  ? 'rounded-md bg-surface-2 px-2.5 py-1 text-sm font-medium capitalize text-ink'
                  : 'rounded-md px-2.5 py-1 text-sm capitalize text-ink-2 transition-colors hover:text-ink'
              }
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          )}
        </For>
      </nav>

      <Show
        when={visible().length > 0}
        fallback={<p class="text-sm text-ink-2">No blocks in this category.</p>}
      >
        <div class="flex flex-col gap-8">
          <For each={visible()}>
            {(item) => (
              <BlockCard
                item={item}
                theme={siteTheme()}
                framework={framework()}
                onFramework={chooseFramework}
                loadForm={props.loadForm}
              />
            )}
          </For>
        </div>
      </Show>

      {/* Which kit the previews above are running, in words. The production
          page proves the PUBLISHED artifact works cold; a local preview looks
          identical and proves nothing, so the page says which it is. */}
      <p data-testid="preview-footer" class="mt-10 text-xs text-ink-3">
        {previewFooter()}
      </p>
    </div>
  );
}
