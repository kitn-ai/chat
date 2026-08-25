import { createSignal, createEffect, Show } from 'solid-js';
import { defineWebComponent } from './define';
import { PaneGroup, type PaneTab } from '../ui/pane-group';

interface Props extends Record<string, unknown> {
  /** The tabs to render. An array of `{ id, name, status?, needsAttention?, number? }`
   *  set as a JS PROPERTY (not an HTML attribute). */
  tabs?: PaneTab[];
  /** The active tab id (controlled, and reflected to the `active` ATTRIBUTE so
   *  `::part`/`[active]` selectors and the per-tab named slot follow it). Set it as
   *  the `active` attribute or drive it from `kai-tab-change`; omit for uncontrolled
   *  (the first tab). */
  active?: string;
  /** Highlight the frame as the ACTIVE group in a multi-group layout. Attribute:
   *  `focused`. */
  focused?: boolean;
}

/** Events fired by `<kai-pane-group>`. All non-bubbling — listen on the element. */
interface Events {
  /** A tab was selected (click, Enter/Space, or arrow-key move). `detail.id` is
   *  the tab's id. */
  'kai-tab-change': { id: string };
  /** A tab's close (×) was clicked. Drop the tab from `tabs` yourself. */
  'kai-tab-close': { id: string };
  /** A tab's "…" overflow was clicked. Open your own menu from `detail.id`. */
  'kai-tab-menu': { id: string };
}

/**
 * `<kai-pane-group>` — an editor group: a TAB STRIP (numbered-status-badge tabs)
 * over the active tab's pane content. The reusable "one column = a group of agents
 * shown as tabs" primitive from the Multi-Agent Workspace. Composable: a `tabs`
 * property + slots + parts + events, not a config blob — the group owns the tab UX,
 * you own the pane content.
 *
 * Each tab leads with a tone-colored NUMBERED BADGE (color = status, digit = the
 * keyboard ⌥-jump number), then the name, the status word (on the active tab / on
 * hover / always for needs-attention), a "…" overflow, and a close "×".
 *
 * Set the `tabs` property in JavaScript (array, not attribute):
 *
 * ```html
 * <kai-pane-group active="atlas">
 *   <!-- one named slot per tab id; the group shows the active one -->
 *   <div slot="atlas">…Atlas pane…</div>
 *   <div slot="otto">…Otto pane…</div>
 * </kai-pane-group>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const group = document.querySelector('kai-pane-group');
 *   group.tabs = [
 *     { id: 'atlas', name: 'Atlas', status: { tone: 'working', label: 'Running', pulse: true } },
 *     { id: 'otto',  name: 'Otto',  status: { tone: 'blocked', label: 'Needs input' }, needsAttention: true },
 *   ];
 *   group.addEventListener('kai-tab-change', (e) => console.log(e.detail.id));
 * </script>
 * ```
 *
 * Pane content — TWO composable patterns:
 *  - NAMED SLOT PER TAB: give each pane `slot="<tab id>"`; the group projects the
 *    active tab's slot and swaps it itself on selection (no consumer JS needed).
 *  - DEFAULT SLOT: put one body in the default slot and swap it yourself in
 *    response to `kai-tab-change`. Both work; pick whichever fits.
 *
 * Methods: `el.select(id)` selects a tab (fires `kai-tab-change`); `el.focus()`
 * focuses the active tab. Parts: `::part(tabs|tab|body)` (also `::part(menu|close)`).
 */
defineWebComponent<Props, Events>('kai-pane-group', {
  tabs: undefined,
  active: undefined,
  focused: false,
}, (props, { element, dispatch, flag, expose }) => {
  const tabs = () => (props.tabs as PaneTab[] | undefined) ?? [];
  // Controlled/uncontrolled: the `active` prop/attribute wins; otherwise the
  // element manages its own, falling back to the first tab. `change` always writes
  // the internal value AND emits `kai-tab-change` so a controlling app can react.
  const [internal, setInternal] = createSignal<string | undefined>(props.active as string | undefined);
  const active = () => (props.active as string | undefined) ?? internal() ?? tabs()[0]?.id;
  const change = (id: string) => {
    setInternal(id);
    dispatch('kai-tab-change', { id });
  };

  // Reflect the resolved active id to the `active` attribute so `[active="…"]` /
  // `::part` selectors and the consumer's per-tab named slot follow selection.
  // Writing the same value is idempotent, so no feedback loop with the prop.
  // V2-PORT: active() in the compute; the attribute write in the apply.
  createEffect(active, (a) => {
    if (a != null) element.setAttribute('active', a);
  });

  expose({
    /** Select a tab by id (fires `kai-tab-change`). Ignores unknown ids. */
    select: (id: string) => {
      if (tabs().some((t) => t.id === id)) change(id);
    },
    /** Focus the active tab in the strip. */
    focus: () => {
      element.shadowRoot?.querySelector<HTMLElement>('[part="tab"][tabindex="0"]')?.focus();
    },
  });

  return (
    <PaneGroup
      tabs={tabs()}
      active={active()}
      focused={flag('focused')}
      onTabChange={change}
      onTabClose={(id) => dispatch('kai-tab-close', { id })}
      onTabMenu={(id) => dispatch('kai-tab-menu', { id })}
    >
      {/* Active tab's content: the per-tab named slot, plus the default slot for the
          swap-it-yourself pattern. A consumer uses one or the other. */}
      <Show when={active()}>{(a) => <slot name={a()} />}</Show>
      <slot />
    </PaneGroup>
  );
});
