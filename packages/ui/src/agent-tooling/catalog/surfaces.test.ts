import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import '../../elements/artifact';
import '../../elements/attachments';
import '../../elements/chat';
import type { ChatMessage } from '../../elements/chat-types';
import '../../elements/composer';
import '../../elements/conversation-list';
import '../../elements/resizable';
import '../../elements/thread';
import '../../elements/toast';
import type { AttachmentData } from '../../components/attachment-types';
import type { ToastItem } from '../../primitives/toast-store';
import type { ConversationGroup, ConversationSummary } from '../../types';
import { InventoryEntry, SurfaceRecipe } from './catalog-types';
import { readLabsTitles } from './labs-titles';
import {
  inventory,
  listInventory,
  listPartConsumption,
  listSurfaceRecipes,
  surfaceRecipes,
} from './surfaces';

describe('authored surface layer', () => {
  it('inventory parses and sorts every entry into surface / ingredient / corpus', () => {
    expect(inventory.length).toBeGreaterThan(0);
    for (const entry of listInventory()) expect(() => InventoryEntry.parse(entry)).not.toThrow();
  });

  it('every Labs/Apps story file is sorted as a surface, derived from the tree', () => {
    // Derived, not listed: the nine app names come from the story files
    // themselves, so adding an app makes this fail until it is sorted.
    //
    // PARSED, and this is not cosmetic. Matching raw text made a story that
    // merely MENTIONS `title: 'Labs/Apps'` in prose count as an app, so this
    // test would DEMAND an inventory row for a phantom app — while
    // lint:catalog-drift correctly REFUSES that row, because no such story
    // exists. One comment line in command.stories.tsx put the tree in a state
    // where the two checks could not both be satisfied. A hand-rolled comment
    // stripper then replaced that bug with a worse one (an unbalanced
    // apostrophe in JSX text left it stuck in string state), so this reads the
    // real parser: comments are trivia and are never nodes.
    const elDir = join(__dirname, '..', '..', 'elements');
    const appFiles = readdirSync(elDir).filter(
      (f) =>
        f.endsWith('.stories.tsx') &&
        readLabsTitles(readFileSync(join(elDir, f), 'utf8'), f).includes('Labs/Apps'),
    );
    expect(appFiles.length).toBeGreaterThan(0);
    const surfaces = new Set(inventory.filter((e) => e.sort === 'surface').map((e) => e.title));
    for (const f of appFiles) {
      expect(surfaces.has(f.replace('.stories.tsx', '')), `${f} is not sorted as a surface`).toBe(true);
    }
  });

  it('Proofs and the slot fixtures are corpus', () => {
    for (const t of ['Proofs', 'Chat Slots', 'Prompt Input Slots', 'Workspace Slots']) {
      expect(inventory.find((e) => e.title === t)?.sort).toBe('corpus');
    }
  });

  it('part-consumption records cover every MessagePart variant in the union', () => {
    // Variants come from derived.json, which gen-catalog.mjs wrote using the ONE
    // shared readVariants (Task 2). Deliberately NOT a second regex over
    // chat-types.ts: this plan argues the extraction must be parsed, not matched,
    // and a test that re-derives it by hand would be exactly the copy the
    // catalog exists to eliminate.
    //
    // Read through the ACCESSOR, not the raw literal. listPartConsumption()
    // parses, so a schema-invalid record (an empty `consumes`, a missing tag)
    // fails here instead of sailing through — the accessor exists for exactly
    // that, and reading the literal quietly opted the one registered copy out
    // of the validation every other authored record gets.
    const derived = JSON.parse(readFileSync(join(__dirname, 'derived.json'), 'utf8'));
    expect(derived.partVariants.length).toBeGreaterThan(0);
    const covered = new Set(listPartConsumption().flatMap((p) => p.consumes));
    for (const variant of derived.partVariants) {
      expect(covered.has(variant), `no part-consumption record covers '${variant}'`).toBe(true);
    }
  });

  it('no part-consumption record claims a variant the union does not have', () => {
    // The union assertion above is a flatMap across every record, so it is
    // per-CATALOG: dropping `file` from kai-chat alone still passes, because
    // kai-message keeps listing it. This is the other direction — per RECORD,
    // every variant a record claims must still exist in the union — and it
    // catches the drift the union check structurally cannot see: a record left
    // pointing at a variant the union dropped or renamed.
    //
    // What NEITHER check sees, and no assertion here should pretend to: whether
    // a given element genuinely consumes a given variant. That is an editorial
    // claim, not derivable from anything in the tree (which is why this is a
    // registered copy at all), and it is measured by the acceptance deck.
    const derived = JSON.parse(readFileSync(join(__dirname, 'derived.json'), 'utf8'));
    const union = new Set<string>(derived.partVariants);
    const records = listPartConsumption();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.consumes.length).toBeGreaterThan(0);
      for (const variant of record.consumes) {
        expect(union.has(variant), `${record.tag} claims '${variant}', which is not a MessagePart variant`).toBe(true);
      }
    }
  });

  it('every recipe parses, and both delivery targets have an instance', () => {
    expect(surfaceRecipes.length).toBeGreaterThan(0);
    for (const r of listSurfaceRecipes()) expect(() => SurfaceRecipe.parse(r)).not.toThrow();
    const targets = new Set(surfaceRecipes.flatMap((r) => r.targets));
    expect(targets.has('bundler')).toBe(true);
    expect(targets.has('script-tag')).toBe(true);
  });

  it('the script-tag recipe carries the upgrade-race invariant', () => {
    const widget = listSurfaceRecipes().find((r) => r.id === 'support-widget-script-tag');
    expect(widget?.invariants).toContain('upgrade-race');
  });

  it('the exemplar recipe wires conversations into chat per the host-coordinates model', () => {
    const r = listSurfaceRecipes().find((x) => x.id === 'workspace-chat');
    expect(r?.wiring).toContainEqual(
      expect.objectContaining({
        from: 'kai-conversations',
        event: 'kai-conversation-select',
        to: 'kai-chat',
        property: 'messages',
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The wiring edges, EXECUTED.
//
// Resolving `from`/`event`/`to`/`property` against derived.json proves those
// names exist. It does not prove the edge is real: an event that never fires
// from a user action, a detail that carries something else, or a property whose
// assignment has no visible effect would all resolve perfectly and still be a
// falsehood. So every edge is driven here against the real registered elements
// — the event triggered the way a user triggers it, the named property assigned
// by a host listener, the result asserted in the shadow DOM.
//
// Each probe carries a POSITIVE CONTROL: before asserting the new state, it
// asserts the OLD state was observably there. An "X is gone" assertion over a
// component that never rendered passes for the wrong reason, and that is the
// exact way a probe silently proves nothing.
// ─────────────────────────────────────────────────────────────────────────────

// jsdom does not implement Element.prototype.scrollTo; kai-chat's
// stick-to-bottom primitive calls it. Real browsers implement it.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const flush = () => new Promise((r) => setTimeout(r, 0));

/** One wiring edge as a single comparable string, keyed the same way for recipes and probes. */
const edgeKey = (e: { from: string; event: string; to: string; property: string }) =>
  `${e.from} --${e.event}--> ${e.to}.${e.property}`;

/**
 * Every edge this file has actually driven.
 *
 * ORDER-DEPENDENT BY CONSTRUCTION: this is module-level mutable state, and the
 * completeness test at the bottom only means anything if every probe above it
 * has already run. That holds under how this suite runs — vitest executes a
 * file's tests sequentially in declaration order — and it does NOT hold if you
 * reach for `.only`, `describe.concurrent`, or move the completeness test above
 * a probe. (`--shard` is safe: vitest shards by FILE, so a probe and the
 * completeness test never land in different shards.) When it does break it
 * reports a false failure — an edge that was never reached — never a false
 * pass, which is the safe direction; but if you see it fail alone, check how
 * you invoked the run before believing it.
 */
const probed = new Set<string>();

/** Assert the edge is one the recipes really claim, then mark it driven. */
function drove(from: string, event: string, to: string, property: string) {
  const key = edgeKey({ from, event, to, property });
  const claimed = surfaceRecipes.flatMap((r) => r.wiring).map(edgeKey);
  expect(claimed, `no recipe claims ${key}`).toContain(key);
  probed.add(key);
}

const groups: ConversationGroup[] = [{ id: 'g1', name: 'Today', sortOrder: 0, createdAt: '2026-06-01' }];
const conversations: ConversationSummary[] = [
  {
    id: 'c1', title: 'First thread', groupId: 'g1', scope: { type: 'document' },
    messageCount: 1, lastMessageAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
  },
  {
    id: 'c2', title: 'Second thread', groupId: 'g1', scope: { type: 'document' },
    messageCount: 1, lastMessageAt: '2026-06-02T00:00:00Z', updatedAt: '2026-06-02T00:00:00Z',
  },
];

/** The host's store: one thread per conversation id. */
const threads: Record<string, ChatMessage[]> = {
  c1: [{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'thread-one-body' }] }],
  c2: [{ id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'thread-two-body' }] }],
};

type ChatEl = HTMLElement & { messages: ChatMessage[] };
type ConvEl = HTMLElement & { groups: ConversationGroup[]; conversations: ConversationSummary[] };

function mountChat(messages: ChatMessage[]): ChatEl {
  const el = document.createElement('kai-chat') as ChatEl;
  el.messages = messages;
  document.body.appendChild(el);
  return el;
}

function mountConversations(): ConvEl {
  const el = document.createElement('kai-conversations') as ConvEl;
  el.groups = groups;
  el.conversations = conversations;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document
    .querySelectorAll(
      'kai-chat, kai-conversations, kai-resizable, kai-artifact, kai-thread, kai-composer, kai-attachments, kai-toast-region',
    )
    .forEach((e) => e.remove());
});

describe('surface recipe wiring, executed against the real elements', () => {
  it('kai-conversation-select carries {id} and the host swap re-renders kai-chat', async () => {
    const chat = mountChat(threads.c1);
    const rail = mountConversations();
    await flush();

    // POSITIVE CONTROL: the starting thread is really on screen, so the
    // "gone after the swap" assertion below cannot pass vacuously.
    expect(chat.shadowRoot!.textContent).toContain('thread-one-body');
    expect(chat.shadowRoot!.textContent).not.toContain('thread-two-body');

    // The host edge, written the way the recipe describes it: listen on the
    // element itself (events-non-bubbling), assign a NEW array of NEW objects
    // (reactivity-two-halves), as a JS property (props-not-attributes).
    let detail: { id: string } | null = null;
    rail.addEventListener('kai-conversation-select', (e) => {
      detail = (e as CustomEvent<{ id: string }>).detail;
      chat.messages = threads[detail!.id].map((m) => ({ ...m }));
    });

    const item = rail.shadowRoot!.querySelector<HTMLElement>('[data-conversation-id="c2"]')!;
    item.click();
    await flush();

    expect(detail).toEqual({ id: 'c2' });
    expect(chat.shadowRoot!.textContent).toContain('thread-two-body');
    expect(chat.shadowRoot!.textContent).not.toContain('thread-one-body');

    drove('kai-conversations', 'kai-conversation-select', 'kai-chat', 'messages');
  });

  it('kai-conversation-select does not bubble, so a document listener never sees it', async () => {
    const rail = mountConversations();
    await flush();

    let onDocument = 0;
    let onElement = 0;
    const docListener = () => onDocument++;
    document.addEventListener('kai-conversation-select', docListener);
    rail.addEventListener('kai-conversation-select', () => onElement++);

    rail.shadowRoot!.querySelector<HTMLElement>('[data-conversation-id="c1"]')!.click();
    await flush();

    // POSITIVE CONTROL 1: the element-level listener DID fire, so the zero
    // below is the event not bubbling, not the click doing nothing.
    expect(onElement).toBe(1);
    expect(onDocument).toBe(0);

    // POSITIVE CONTROL 2: the document listener is capable of seeing THIS event
    // type — a bubbling+composed one of the same name reaches it. Without this,
    // a listener registered on the wrong target, or a typo'd event name, would
    // produce the same zero and read as proof of the invariant.
    rail.dispatchEvent(new CustomEvent('kai-conversation-select', { detail: { id: 'c1' }, bubbles: true, composed: true }));
    expect(onDocument).toBe(1);
    document.removeEventListener('kai-conversation-select', docListener);
  });

  it('kai-new-chat fires with an empty detail and the host reset empties kai-chat', async () => {
    const chat = mountChat(threads.c1);
    const rail = mountConversations();
    await flush();

    // POSITIVE CONTROL.
    expect(chat.shadowRoot!.textContent).toContain('thread-one-body');

    let fired = 0;
    let detail: unknown = 'unset';
    rail.addEventListener('kai-new-chat', (e) => {
      fired++;
      detail = (e as CustomEvent).detail;
      chat.messages = [];
    });

    rail.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="New chat"]')!.click();
    await flush();

    expect(fired).toBe(1);
    // The recipe note says the detail is empty by design; assert that rather
    // than claiming it carries a thread.
    expect(detail === null || detail === undefined || Object.keys(detail as object).length === 0).toBe(true);
    expect(chat.shadowRoot!.textContent).not.toContain('thread-one-body');

    drove('kai-conversations', 'kai-new-chat', 'kai-chat', 'messages');
  });

  it('kai-submit carries detail.value and the appended turn renders', async () => {
    const chat = mountChat(threads.c1);
    await flush();

    // POSITIVE CONTROL: the text we are about to submit is not on screen yet.
    expect(chat.shadowRoot!.textContent).not.toContain('what is the wire format');
    expect(chat.shadowRoot!.textContent).toContain('thread-one-body');

    let value: string | null = null;
    chat.addEventListener('kai-submit', (e) => {
      value = (e as CustomEvent<{ value: string }>).detail.value;
      chat.messages = [...chat.messages, { id: 'm-new', role: 'user', parts: [{ type: 'text', text: value! }] }];
    });

    const editable = chat.shadowRoot!.querySelector<HTMLElement>('[data-kai-composer-editable]')!;
    editable.textContent = 'what is the wire format';
    editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await flush();

    expect(value).toBe('what is the wire format');
    expect(chat.shadowRoot!.textContent).toContain('what is the wire format');
    // The prior turn survives: this is an append, not a replace.
    expect(chat.shadowRoot!.textContent).toContain('thread-one-body');

    drove('kai-chat', 'kai-submit', 'kai-chat', 'messages');
  });

  it("kai-artifact's kai-maximize-change drives kai-resizable.maximizedIndex from OUTSIDE the group", async () => {
    // Deliberately NOT nested: an artifact inside a kai-resizable-item already
    // maximizes the panel through the bubbling kai-maximize-intent protocol,
    // with no host code at all. Nesting it would make this probe pass on the
    // built-in behaviour and prove nothing about the host edge, which is the
    // whole claim. Sibling layout = the intent event cannot reach the group.
    const group = document.createElement('kai-resizable') as HTMLElement & { maximizedIndex: number | null };
    for (let i = 0; i < 2; i++) {
      const item = document.createElement('kai-resizable-item');
      item.textContent = `panel-${i}`;
      group.appendChild(item);
    }
    document.body.appendChild(group);

    const artifact = document.createElement('kai-artifact') as HTMLElement;
    artifact.setAttribute('src', 'https://example.test/a.html');
    artifact.setAttribute('expandable', '');
    document.body.appendChild(artifact);
    await flush();

    const items = () => Array.from(group.children) as HTMLElement[];
    // POSITIVE CONTROL: nothing is maximized yet, and the assertion below can
    // observe the difference.
    expect(items()[0].hasAttribute('hidden')).toBe(false);
    expect(group.hasAttribute('data-maximized')).toBe(false);

    const details: { maximized: boolean }[] = [];
    // The host knows the artifact lives in panel 1; the event carries only the
    // boolean, so the index is the host's to supply.
    artifact.addEventListener('kai-maximize-change', (e) => {
      const d = (e as CustomEvent<{ maximized: boolean }>).detail;
      details.push(d);
      group.maximizedIndex = d.maximized ? 1 : null;
    });

    const expand = artifact.shadowRoot!.querySelector<HTMLElement>('[aria-label="Expand"]')!;
    expand.click();
    await flush();

    expect(details.at(-1)).toEqual({ maximized: true });
    expect(items()[0].hasAttribute('hidden')).toBe(true);
    expect(items()[1].hasAttribute('hidden')).toBe(false);
    expect(group.hasAttribute('data-maximized')).toBe(true);

    // …and back, so the null branch of the assignment is exercised too.
    const collapse = artifact.shadowRoot!.querySelector<HTMLElement>('[aria-label="Collapse"], [aria-label="Restore"]');
    (collapse ?? artifact.shadowRoot!.querySelector<HTMLElement>('[aria-label="Expand"]')!).click();
    await flush();

    expect(details.at(-1)).toEqual({ maximized: false });
    expect(items()[0].hasAttribute('hidden')).toBe(false);
    expect(group.hasAttribute('data-maximized')).toBe(false);

    drove('kai-artifact', 'kai-maximize-change', 'kai-resizable', 'maximizedIndex');
  });

  // ── the composed-thread recipe's edges (no kai-chat anywhere) ────────────

  it("kai-submit on a STANDALONE kai-composer carries detail.text and the host append renders in kai-thread", async () => {
    const thread = document.createElement('kai-thread') as ChatEl;
    thread.messages = threads.c1;
    document.body.appendChild(thread);
    const composer = document.createElement('kai-composer') as HTMLElement;
    document.body.appendChild(composer);
    await flush();

    // POSITIVE CONTROL: the starting turn renders, the submitted text does not
    // yet, so the append assertion below cannot pass vacuously.
    expect(thread.shadowRoot!.textContent).toContain('thread-one-body');
    expect(thread.shadowRoot!.textContent).not.toContain('composed by hand');

    // The host edge as the recipe writes it. NOTE the detail shape: the bare
    // composer emits { doc, text, entities } — `text`, not kai-chat's `value`.
    let text: string | null = null;
    composer.addEventListener('kai-submit', (e) => {
      text = (e as CustomEvent<{ text: string }>).detail.text;
      thread.messages = [
        ...thread.messages,
        { id: 'm-new', role: 'user', parts: [{ type: 'text', text: text! }] },
      ];
    });

    const editable = composer.shadowRoot!.querySelector<HTMLElement>('[data-kai-composer-editable]')!;
    editable.textContent = 'composed by hand';
    editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await flush();

    expect(text).toBe('composed by hand');
    expect(thread.shadowRoot!.textContent).toContain('composed by hand');
    // The prior turn survives: an append, not a replace.
    expect(thread.shadowRoot!.textContent).toContain('thread-one-body');

    drove('kai-composer', 'kai-submit', 'kai-thread', 'messages');
  });

  it('kai-remove carries {id} and the host filter re-renders kai-attachments', async () => {
    const tray = document.createElement('kai-attachments') as HTMLElement & { items: AttachmentData[] };
    tray.setAttribute('removable', '');
    let items: AttachmentData[] = [
      { id: 'a1', type: 'file', filename: 'first-note.txt', mediaType: 'text/plain', url: 'data:text/plain;base64,aGk=' },
      { id: 'a2', type: 'file', filename: 'second-note.txt', mediaType: 'text/plain', url: 'data:text/plain;base64,aGk=' },
    ];
    tray.items = items;
    document.body.appendChild(tray);
    await flush();

    // POSITIVE CONTROL.
    expect(tray.shadowRoot!.textContent).toContain('first-note.txt');
    expect(tray.shadowRoot!.textContent).toContain('second-note.txt');

    // The tray never mutates its own list: the host filters and reassigns.
    let detail: { id: string } | null = null;
    tray.addEventListener('kai-remove', (e) => {
      detail = (e as CustomEvent<{ id: string }>).detail;
      items = items.filter((i) => i.id !== detail!.id);
      tray.items = items;
    });

    tray.shadowRoot!.querySelector<HTMLElement>('button[aria-label="Remove"]')!.click();
    await flush();

    expect(detail).toEqual({ id: 'a1' });
    expect(tray.shadowRoot!.textContent).not.toContain('first-note.txt');
    expect(tray.shadowRoot!.textContent).toContain('second-note.txt');

    drove('kai-attachments', 'kai-remove', 'kai-attachments', 'items');
  });

  it('kai-dismiss carries the toast id and the host filter re-renders kai-toast-region', async () => {
    const region = document.createElement('kai-toast-region') as HTMLElement & { toasts: ToastItem[] };
    // Long durations so the auto-dismiss timer cannot race the click below.
    let toasts: ToastItem[] = [
      { id: 't1', message: 'saved-toast-body', duration: 60_000 },
      { id: 't2', message: 'other-toast-body', duration: 60_000 },
    ];
    region.toasts = toasts;
    document.body.appendChild(region);
    await flush();

    // POSITIVE CONTROL.
    expect(region.shadowRoot!.textContent).toContain('saved-toast-body');
    expect(region.shadowRoot!.textContent).toContain('other-toast-body');

    // Data-driven region: the host owns the array, dismissal is a filter +
    // reassign (the imperative toast() path owns its own auto-mounted region
    // instead — the two are either/or).
    const dismissed: string[] = [];
    region.addEventListener('kai-dismiss', (e) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      dismissed.push(id);
      toasts = toasts.filter((t) => t.id !== id);
      region.toasts = toasts;
    });

    region.shadowRoot!.querySelector<HTMLElement>('button[aria-label="Dismiss"]')!.click();
    await flush();

    expect(dismissed.length).toBe(1);
    const gone = dismissed[0] === 't1' ? 'saved-toast-body' : 'other-toast-body';
    const kept = dismissed[0] === 't1' ? 'other-toast-body' : 'saved-toast-body';
    expect(region.shadowRoot!.textContent).not.toContain(gone);
    expect(region.shadowRoot!.textContent).toContain(kept);

    drove('kai-toast-region', 'kai-dismiss', 'kai-toast-region', 'toasts');
  });

  // ── the COMPOSITION record, executed the same way ────────────────────────
  //
  // `composition` is an authored claim about where an element goes, and nothing
  // resolves it: derived.json carries no slots, so `lint:catalog-drift` can
  // check the two tags exist and can say nothing at all about the slot NAME. A
  // record naming a slot that does not exist would read perfectly and render
  // nothing, which is precisely the shape of defect the record was added to
  // stop. So it is driven here instead — mounted the way the record describes
  // and asserted through `assignedSlot`, which is the browser's own answer to
  // "did the shell take this child".
  const composed = new Set<string>();

  it('the rail composes INSIDE kai-chat on the slot the recipe names', async () => {
    for (const c of surfaceRecipes.flatMap((r) => r.composition ?? [])) {
      const parent = document.createElement(c.parent) as ChatEl;
      parent.messages = threads.c1;
      const child = document.createElement(c.child) as ConvEl;
      child.groups = groups;
      child.conversations = conversations;
      child.slot = c.slot;
      parent.appendChild(child);
      document.body.appendChild(parent);
      await flush();

      // POSITIVE CONTROL: the child really rendered, so an `assignedSlot` read
      // below cannot be answering about an element that drew nothing.
      expect(child.shadowRoot!.textContent, `${c.child} rendered nothing`).toContain('First thread');
      expect(child.assignedSlot?.name, `<${c.parent}> has no "${c.slot}" slot to take <${c.child}>`).toBe(c.slot);

      // NEGATIVE CONTROL: the attribute is what does it. Drop it and the shell
      // does not put the child there — without this, a parent that swallowed
      // every child into that region would pass the assertion above while the
      // recipe's `slot` value was decorative.
      child.removeAttribute('slot');
      await flush();
      expect(child.assignedSlot?.name).not.toBe(c.slot);

      composed.add(`${c.child}@${c.parent}.${c.slot}`);
      parent.remove();
    }
  });

  it('every composition record in every recipe has been mounted above', () => {
    // The sibling of the wiring-completeness test below, and for the same
    // reason: a placement authored with no probe beside it is a claim nobody
    // has ever seen hold.
    const claimed = surfaceRecipes
      .flatMap((r) => r.composition ?? [])
      .map((c) => `${c.child}@${c.parent}.${c.slot}`);
    expect(claimed.length).toBeGreaterThan(0);
    for (const key of claimed) expect(composed.has(key), `composition never mounted: ${key}`).toBe(true);
  });

  it('every wiring edge in every recipe has been driven above', () => {
    // The guard that keeps this honest as recipes grow: an edge authored with
    // no probe beside it fails here rather than shipping unverified.
    const claimed = [...new Set(surfaceRecipes.flatMap((r) => r.wiring).map(edgeKey))];
    expect(claimed.length).toBeGreaterThan(0);
    for (const key of claimed) expect(probed.has(key), `wiring edge never executed: ${key}`).toBe(true);
  });
});
