<script lang="ts">
  import type { KaiConversationsElement } from '@kitn.ai/ui/elements';
  import type { Theme } from '../lib/types';
  import type { Conversation } from '../chat-data';

  /**
   * The conversation rail — a thin wrapper over `<kai-conversations>`. The `.sidebar`
   * div owns the shell's right border (kept OFF the element so it follows the shell's
   * light/dark tokens, not the element's own re-scoped ones). The rail's `collapsed`
   * is CONTROLLED by the app's collapsed state, so it stays in sync with the parent
   * `<kai-resizable-item collapsed>` and re-expands on restore; the internal hamburger
   * still reports the toggle intent up via `onkai-toggle-sidebar`.
   *
   * Array/object props (`groups`, `conversations`) and the boolean `collapsed` flag
   * are set imperatively as DOM PROPERTIES (`bind:this` + `$effect`) so they land on
   * the upgraded element rather than as attributes. `theme` / `active-id` are scalar
   * attributes.
   */
  let {
    theme,
    conversations,
    activeId,
    collapsed,
    onselect,
    onnewchat,
    ontoggle,
  }: {
    theme: Theme;
    conversations: Conversation[];
    activeId: string;
    collapsed: boolean;
    onselect: (id: string) => void;
    onnewchat: () => void;
    ontoggle: () => void;
  } = $props();

  // The kit ships a typed element interface (via `HTMLElementTagNameMap`), so the
  // `bind:this` ref + its rich props are fully typed — no casts needed.
  let el: KaiConversationsElement;

  // `groups` never changes, so this effect has no reactive deps and runs once.
  $effect(() => { el.groups = []; });
  $effect(() => { el.conversations = conversations; });
  $effect(() => { el.collapsed = collapsed; });

  function onSelect(e: Event) {
    onselect((e as CustomEvent<{ id: string }>).detail.id);
  }
</script>

<aside class="sidebar">
  <kai-conversations
    bind:this={el}
    {theme}
    active-id={activeId}
    onkai-conversation-select={onSelect}
    onkai-new-chat={onnewchat}
    onkai-toggle-sidebar={ontoggle}
  ></kai-conversations>
</aside>
