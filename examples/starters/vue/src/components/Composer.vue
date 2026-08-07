<script setup lang="ts">
import { ref } from 'vue';
import type { Theme } from '../types';
import { useVoiceInput } from '../composables';

/**
 * The bottom composer. Wraps `<kai-prompt-input>` and owns the input-DOM concerns:
 * the element ref, a live text mirror, clear-on-submit, and seeding voice.
 *
 * The prompt input stays UNCONTROLLED so the `/`+`@` trigger menus keep a live
 * caret. We NEVER bind `:value` with a plain STRING: that flips the element into
 * controlled mode, which re-applies the property and collapses the shadow-DOM
 * selection, disabling the caret-anchored menu. So clear-on-submit goes through
 * the element's `clear()` method, and voice seeds a ComposerDoc (a non-string
 * value is a one-time seed that leaves the input uncontrolled). We keep the live
 * text mirrored in `liveText` (from `kai-value-change`) so voice can append.
 */
defineProps<{
  theme: Theme;
  loading: boolean;
  suggestions: string[];
  triggers: unknown[];
}>();

const emit = defineEmits<{
  submit: [value: string];
  suggestion: [value: string];
}>();

// Ref to the underlying <kai-prompt-input> element for the imperative pushes
// (clear() on submit, ComposerDoc seed from voice); `liveText` mirrors the text.
const promptRef = ref<HTMLElement | null>(null);
let liveText = '';

// Voice: on a transcript, append it to the current text and seed the (uncontrolled)
// input as a ComposerDoc. A non-string `value` is a one-time seed into the
// element's internal state; a plain STRING would instead flip it into controlled
// mode and re-break the `/`+`@` triggers and submit.
const { supported: voiceSupported, start: startVoice } = useVoiceInput((transcript) => {
  const next = (liveText ? liveText + ' ' : '') + transcript;
  liveText = next;
  const el = promptRef.value as (HTMLElement & { value?: unknown }) | null;
  if (el) el.value = [{ type: 'text', text: next }];
});

function handleVoice() {
  // Mic is Chromium-only; degrade gracefully everywhere else.
  if (!voiceSupported) {
    alert('Voice input needs a Chromium browser.');
    return;
  }
  startVoice();
}

function onValueChange(e: Event) {
  liveText = (e as CustomEvent<{ value: string }>).detail.value;
}

function onSubmit(e: Event) {
  // Clear our own uncontrolled input first — reset the mirror + call the element's
  // clear() method (uncontrolled-safe; fires kai-value-change internally, never a
  // string assignment) — then hand the text up. The parent owns append + streaming.
  liveText = '';
  (promptRef.value as (HTMLElement & { clear?: () => void }) | null)?.clear?.();
  emit('submit', (e as CustomEvent<{ value: string }>).detail.value);
}

function onSuggestionClick(e: Event) {
  emit('suggestion', (e as CustomEvent<{ value: string }>).detail.value);
}
</script>

<template>
  <div class="composer">
    <kai-prompt-input
      ref="promptRef"
      :theme="theme"
      placeholder="Message the demo…"
      :loading="loading"
      :suggestions.prop="suggestions"
      :triggers.prop="triggers"
      :voice.prop="true"
      @kai-voice="handleVoice"
      @kai-value-change="onValueChange"
      @kai-submit="onSubmit"
      @kai-suggestion-click="onSuggestionClick"
    ></kai-prompt-input>
    <p class="composer-hint">
      Type <kbd>/</kbd> for skills · <kbd>@</kbd> for agents
    </p>
  </div>
</template>
