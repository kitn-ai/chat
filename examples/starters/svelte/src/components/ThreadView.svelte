<script lang="ts">
  import type { ChatMessage } from '@kitn.ai/ui';
  import type { KaiThreadElement } from '@kitn.ai/ui/elements';
  import type { Theme } from '../lib/types';

  /**
   * The scrolling message list. `<kai-thread>` owns the message rendering, the
   * centered fixed-width column, and stick-to-bottom scroll, so this component just
   * bakes the per-message actions onto the assistant turns and wires the custom
   * `speak` action to the browser's speech synthesis. `copy` (and the feedback
   * votes) are handled inside the element.
   *
   * `messages` is set on the element as a DOM PROPERTY (`bind:this` + `$effect`); a
   * NEW array reference per streaming chunk is what re-renders it. The `withActions`
   * `$derived` produces that fresh array whenever `messages` changes.
   */
  let { theme, messages }: { theme: Theme; messages: ChatMessage[] } = $props();

  let el: KaiThreadElement;

  // <kai-thread> reads `actions` off each message; only assistant replies get them.
  const withActions: ChatMessage[] = $derived(
    messages.map((m) =>
      m.role === 'assistant'
        ? { ...m, actions: ['copy', { id: 'speak', label: 'Read aloud', icon: 'volume-2' }] }
        : m,
    ),
  );

  $effect(() => { el.messages = withActions; });

  function onMessageAction(e: Event) {
    const detail = (e as CustomEvent<{ messageId: string; action: string }>).detail;
    if (detail.action === 'speak') {
      const m = messages.find((x) => x.id === detail.messageId);
      if (!m) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(m.content));
    }
  }
</script>

<kai-thread
  class="thread"
  bind:this={el}
  {theme}
  onkai-message-action={onMessageAction}
></kai-thread>
