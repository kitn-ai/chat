import { createSignal, onMount, onCleanup, Index } from 'solid-js';
import { defineWebComponent } from './define';
import { PaneGrid } from '../ui/pane-grid';

interface Props extends Record<string, unknown> {
  /** Minimum width of every pane, in px, before columns drop / the grid scrolls.
   *  Defaults to `280`. Attribute: `min-pane-width`. */
  minPaneWidth?: number;
  /** Minimum height of every pane, in px, before the grid scrolls vertically.
   *  Defaults to `200`. Attribute: `min-pane-height`. */
  minPaneHeight?: number;
  /** Column cap when the container is wide (default `3`). Attribute: `max-columns`. */
  maxColumns?: number;
  /** Gap between panes, any CSS length. Defaults to the kit gap
   *  (`var(--kai-pane-grid-gap, 0.5rem)`). Attribute: `gap`. */
  gap?: string;
  /** When set to a valid child index, render ONLY that pane full-bleed: a simple
   *  maximize hook the consumer drives (pair it with `<kai-pane>`'s `kai-maximize`
   *  event). Clear it (or point out of range) for the full tiled grid.
   *  Attribute: `maximized-index`. */
  maximizedIndex?: number | null;
}

/** Attribute values arrive as strings; blank/invalid → undefined (the default). */
function num(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `<kai-pane-grid>` — an N-pane responsive tiling grid with a min-size + scroll
 * floor. Each direct light child is one tile: the grid fills up to `max-columns`
 * columns when wide, DROPS columns as the container narrows so panes never squish
 * below `min-pane-width`, then SCROLLS once even one column can't fit. Rows keep
 * at least `min-pane-height` the same way. The natural children are `<kai-pane>` /
 * `<kai-pane-group>`, but any elements tile.
 *
 * ```html
 * <kai-pane-grid max-columns="2" min-pane-width="320" style="height: 480px">
 *   <kai-pane headline="Atlas">…</kai-pane>
 *   <kai-pane headline="Otto">…</kai-pane>
 *   <kai-pane headline="Nova">…</kai-pane>
 * </kai-pane-grid>
 * ```
 *
 * Maximize: set `maximized-index` to a child index to show only that pane
 * full-bleed; clear it to restore. The grid never decides this itself — drive it
 * from your own control (e.g. `<kai-pane>`'s `kai-maximize` event). Scalar
 * attributes only; no events.
 *
 * Under the shadow root each pane child is projected through its own named slot
 * (assigned automatically — an author-set `slot` attribute on a direct child is
 * respected and left alone), so the light children become the grid tiles directly.
 */
defineWebComponent<Props>('kai-pane-grid', {
  minPaneWidth: undefined,
  minPaneHeight: undefined,
  maxColumns: undefined,
  gap: undefined,
  maximizedIndex: undefined,
}, (props, { element }) => {
  // One named slot per direct light child, in child order. The slot names are
  // written onto the children (`pane-<i>`), the same per-child-slot pattern
  // <kai-resizable> uses (`p0`/`p1`/…): PaneGrid tiles its JSX children, and a
  // single default <slot> would make ALL panes one tile. A child that already
  // carries an author-set slot attribute outside our namespace is left alone
  // (and therefore not tiled) — authoring escape hatch, same as unslotted text.
  const [slotNames, setSlotNames] = createSignal<string[]>([]);

  onMount(() => {
    const read = () => {
      const names: string[] = [];
      let i = 0;
      for (const child of Array.from(element.children)) {
        const existing = child.getAttribute('slot');
        if (existing !== null && !/^pane-\d+$/.test(existing)) continue; // author-owned
        const name = `pane-${i++}`;
        if (existing !== name) child.setAttribute('slot', name);
        names.push(name);
      }
      // Structural equality: our own setAttribute('slot') writes re-fire the
      // observer; an unchanged name list means an unchanged layout, so skip the
      // re-render (mirrors <kai-resizable>'s itemsChanged guard).
      if (names.length !== slotNames().length || names.some((n, j) => n !== slotNames()[j])) {
        setSlotNames(names);
      }
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true });
    onCleanup(() => observer.disconnect());
  });

  return (
    <>
      {/* A tiling grid fills its container — default the host to a stretching
          block, same as <kai-resizable>. Give the element (or a parent) a height. */}
      <style>{':host{display:block;height:100%;min-height:0;min-width:0}'}</style>
      <PaneGrid
        minPaneWidth={num(props.minPaneWidth)}
        minPaneHeight={num(props.minPaneHeight)}
        maxColumns={num(props.maxColumns)}
        gap={props.gap as string | undefined}
        maximizedIndex={num(props.maximizedIndex) ?? null}
      >
        <Index each={slotNames()}>{(name) => <slot name={name()} />}</Index>
      </PaneGrid>
    </>
  );
});
