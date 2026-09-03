/**
 * The data shell for /blocks. Loads the kit (so the kai-* elements are
 * defined before any property is set -- the upgrade race the site's kit.ts
 * exists to close), fetches the static registry the prebuild copied into
 * public/, and hands both to the pure view.
 *
 * The registry is STATIC FILES the site serves: /blocks/registry.json and
 * /blocks/f/<id>.<form>.json. Nothing is generated here; that happens once,
 * in packages/ui/scripts/gen-blocks.mjs, during the kit build.
 */
import { createResource, Show, type JSX } from 'solid-js';
import { loadKit } from '../example/kit';
import { BlocksPage } from './BlocksPage';
import {
  formUrl,
  registryUrl,
  type BlockFormId,
  type FormPayload,
  type RegistryItem,
} from '../../lib/blocks-source';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
}

async function boot(): Promise<RegistryItem[]> {
  await loadKit();
  const index = await fetchJson<{ items: RegistryItem[] }>(registryUrl());
  return index.items;
}

const loadForm = (id: string, form: BlockFormId): Promise<FormPayload> =>
  fetchJson<FormPayload>(formUrl(id, form));

export default function BlocksIsland(): JSX.Element {
  const [items] = createResource(boot);
  return (
    <Show
      when={items()}
      fallback={
        <p class="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-ink-2">
          {items.error
            ? `Could not load the block registry: ${String(items.error)}`
            : 'Loading blocks...'}
        </p>
      }
    >
      {(list) => <BlocksPage items={list()} loadForm={loadForm} />}
    </Show>
  );
}
