import { createEffect, createMemo, createSignal, createUniqueId, on } from 'solid-js';
import { CommandList, type CommandGroup } from '../ui/command';
import { defineWebComponent } from './define';
import type { KaiCommandItem } from './element-data-types';

// The item shape lives in ./element-data-types so the ROOT entry can re-export it
// (a per-element module's shipped .d.ts is `export {};`). Re-exported here so
// `import type { KaiCommandItem } from './command'` keeps working.
export type { KaiCommandItem } from './element-data-types';

interface Props extends Record<string, unknown> {
  /** Flat list of items. Set as a JS property, not an HTML attribute. */
  items?: KaiCommandItem[];
  /** Placeholder text for the search input. */
  placeholder?: string;
  /** Label shown when no items match the current query. */
  emptyLabel?: string;
}

interface Events {
  /** Fired when the user selects an item (click or Enter). */
  'kai-select': { id: string };
  /** Fired on every keystroke in the search input. */
  'kai-query-change': { value: string };
  /** Fired when the highlighted/active item changes, via Arrow keys or when
   *  filtering re-clamps the active row. `id` is the newly active item's id, or
   *  `undefined` when no item is active (e.g. the filtered list is empty). Lets a
   *  host preview the active item without committing a selection. */
  'kai-active-change': { id: string | undefined };
}

/**
 * `<kai-command>` — a grouped, filterable command/mention palette.
 *
 * Set the `items` property in JavaScript (array, not attribute), listen for
 * `kai-select` to know which item was picked, and `kai-query-change` to mirror
 * the search query to your own logic (e.g. async server-side filtering).
 *
 * ```html
 * <kai-command placeholder="Search…"></kai-command>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const el = document.querySelector('kai-command');
 *   el.items = [
 *     { id: 'foo', label: 'Foo', icon: 'search', shortcut: 'Mod+K', group: 'Recent' },
 *   ];
 *   el.addEventListener('kai-select', (e) => console.log(e.detail.id));
 * </script>
 * ```
 */
defineWebComponent<Props, Events>('kai-command', {
  items: undefined,
  placeholder: undefined,
  emptyLabel: undefined,
}, (props, { dispatch, element, expose }) => {
  const listboxId = createUniqueId();
  const [query, setQuery] = createSignal('');
  const [activeId, setActiveId] = createSignal<string | undefined>(undefined);

  /** Items cast to the correct type; defaults to empty array. */
  const allItems = () => (props.items as KaiCommandItem[] | undefined) ?? [];

  /** Items filtered by the current query (label or description, case-insensitive). */
  const filteredItems = createMemo<KaiCommandItem[]>(() => {
    const q = query().toLowerCase();
    if (!q) return allItems();
    return allItems().filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false),
    );
  });

  /** Filtered items grouped by `group`, preserving first-appearance order. */
  const groupedItems = createMemo<CommandGroup[]>(() => {
    const groups: CommandGroup[] = [];
    for (const item of filteredItems()) {
      let g = groups.find((x) => x.group === item.group);
      if (!g) {
        g = { group: item.group, items: [] };
        groups.push(g);
      }
      g.items.push({ id: item.id, label: item.label, icon: item.icon, description: item.description, shortcut: item.shortcut });
    }
    return groups;
  });

  /** Flat ordered array of filtered item ids — used for keyboard navigation. */
  const flatIds = createMemo<string[]>(() => filteredItems().map((item) => item.id));

  /** Clamp/reset activeId when the filtered list changes. */
  createEffect(() => {
    const ids = flatIds();
    const current = activeId();
    if (!current || !ids.includes(current)) {
      setActiveId(ids[0]);
    }
  });

  /** Mirror the active/highlighted item out as `kai-active-change` whenever it
   *  changes (Arrow keys or a filter-driven re-clamp). Skips the initial settle
   *  by only firing when the value actually differs from the previous one. */
  createEffect(on(activeId, (id, prev) => {
    if (id !== prev) dispatch('kai-active-change', { id });
  }));

  function select(id: string) {
    dispatch('kai-select', { id });
  }

  function handleInput(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    setQuery(value);
    dispatch('kai-query-change', { value });
  }

  function handleKeyDown(e: KeyboardEvent) {
    const ids = flatIds();
    if (!ids.length) return;

    const current = activeId();
    const idx = current !== undefined ? ids.indexOf(current) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveId(ids[(idx + 1) % ids.length]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveId(ids[(idx - 1 + ids.length) % ids.length]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const id = activeId();
      if (id !== undefined) select(id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      dispatch('kai-query-change', { value: '' });
    }
  }

  // ── Imperative API (instance methods on the host) ──────────────────────────
  // Counterpart to the kai-* events: lets a host make the palette type-ready and
  // reset its query without reaching into the shadow root.
  expose({
    /** Focus the search combobox input inside the shadow root so the palette is
     *  type-ready on demand (Shadow-DOM autofocus is unreliable, so hosts call
     *  this after opening the palette). */
    focus: (options?: FocusOptions) =>
      element.shadowRoot
        ?.querySelector<HTMLInputElement>('input[role="combobox"], input')
        ?.focus(options),
    /** Blur the focused search input. */
    blur: () =>
      element.shadowRoot
        ?.querySelector<HTMLInputElement>('input[role="combobox"], input')
        ?.blur(),
    /** Reset the search query to empty, re-showing all items, and fire
     *  `kai-query-change` with `''`. Mirrors the Escape-key behavior. */
    clear: () => {
      setQuery('');
      dispatch('kai-query-change', { value: '' });
    },
  });

  return (
    <div class="flex flex-col overflow-hidden">
      <div class="border-b border-border px-3 py-2">
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          value={query()}
          placeholder={(props.placeholder as string | undefined) ?? 'Search…'}
          class="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div class="overflow-y-auto max-h-[320px]">
        <CommandList
          id={listboxId}
          ariaLabel="Results"
          groups={groupedItems()}
          activeId={activeId()}
          onSelect={select}
          emptyLabel={(props.emptyLabel as string | undefined) ?? 'No results'}
        />
      </div>
    </div>
  );
});
