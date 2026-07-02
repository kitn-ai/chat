<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '@kitn.ai/ui';
import type { Theme } from '../types';

/**
 * The scrolling message list. `<kai-thread>` owns the message rendering, the
 * centered fixed-width column, and stick-to-bottom scroll, so this component just
 * bakes the per-message actions onto the assistant turns and wires the custom
 * `speak` action to the browser's speech synthesis. `copy` (and the feedback
 * votes) are handled inside the element.
 *
 * `messages` is passed to the element as a DOM PROPERTY (`.prop`); a NEW array
 * reference per streaming chunk is what re-renders it. The `withActions` computed
 * derives that fresh array whenever `messages` changes.
 */
const props = defineProps<{
  theme: Theme;
  messages: ChatMessage[];
}>();

// <kai-thread> reads `actions` off each message; only assistant replies get them.
const withActions = computed<ChatMessage[]>(() =>
  props.messages.map((m) =>
    m.role === 'assistant'
      ? { ...m, actions: ['copy', { id: 'speak', label: 'Read aloud', icon: 'volume-2' }] }
      : m,
  ),
);

function onMessageAction(e: Event) {
  const detail = (e as CustomEvent<{ messageId: string; action: string }>).detail;
  if (detail.action === 'speak') {
    const m = props.messages.find((x) => x.id === detail.messageId);
    if (!m) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(m.content));
  }
}
</script>

<template>
  <kai-thread
    class="thread"
    :theme="theme"
    :messages.prop="withActions"
    @kai-message-action="onMessageAction"
  ></kai-thread>
</template>
