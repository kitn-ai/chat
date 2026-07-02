<script setup lang="ts">
import type { Theme } from '../types';
import type { Conversation } from '../chat-data';

/**
 * The conversation rail — a thin wrapper over `<kai-conversations>`. The `.sidebar`
 * div owns the shell's right border (kept OFF the element so it follows the shell's
 * light/dark tokens, not the element's own re-scoped ones). The rail's `collapsed`
 * is CONTROLLED by the app's collapsed state, so it stays in sync with the parent
 * `<kai-resizable-item collapsed>` and re-expands the list on restore; the internal
 * hamburger still reports the toggle intent up via `@kai-toggle-sidebar`.
 *
 * Array/object props (`groups`, `conversations`) MUST be set as DOM properties, so
 * they use the `.prop` modifier. `activeId` / `collapsed` are scalars.
 */
defineProps<{
  theme: Theme;
  conversations: Conversation[];
  activeId: string;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  newChat: [];
  toggle: [];
}>();

function onSelect(e: Event) {
  emit('select', (e as CustomEvent<{ id: string }>).detail.id);
}
</script>

<template>
  <aside class="sidebar">
    <kai-conversations
      :theme="theme"
      :groups.prop="[]"
      :conversations.prop="conversations"
      :active-id="activeId"
      :collapsed.prop="collapsed"
      @kai-conversation-select="onSelect"
      @kai-new-chat="emit('newChat')"
      @kai-toggle-sidebar="emit('toggle')"
    ></kai-conversations>
  </aside>
</template>
