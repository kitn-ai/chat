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
import { createResource, Match, Switch, type JSX } from 'solid-js';
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
  /* Read `state` BEFORE `items()`. Solid's resource accessor RETHROWS the
     rejection when you call it (solid-js 1.9, solid.js:322), so a
     `when={items()}` gate throws out of the render rather than falling to its
     fallback, and a client:only island has no ErrorBoundary above it: the page
     sits on "Loading blocks..." for ever with nothing saying why. The state
     check is preferred over wrapping this in an ErrorBoundary because the only
     failure worth catching here is this one fetch, and the boundary would also
     swallow render errors coming out of BlocksPage, which should surface.
     Pinned by test/blocks-island.test.tsx. */
  return (
    <Switch
      fallback={
        <p class="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-ink-2">Loading blocks...</p>
      }
    >
      <Match when={items.state === 'errored'}>
        <p class="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-ink-2">
          {`Could not load the block registry at ${registryUrl()}: ${String(items.error)}`}
        </p>
      </Match>
      <Match when={items.state === 'ready' ? items() : undefined}>
        {(list) => <BlocksPage items={list()} loadForm={loadForm} />}
      </Match>
    </Switch>
  );
}
