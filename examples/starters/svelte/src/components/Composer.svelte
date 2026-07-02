<script lang="ts">
  import type { KaiPromptInputElement } from '@kitn.ai/ui/elements';
  import type { Theme } from '../lib/types';
  import { createVoiceInput } from '../lib/voiceInput';

  /**
   * The bottom composer. Wraps `<kai-prompt-input>` and owns the input-DOM concerns:
   * the element ref, a live text mirror, clear-on-submit, and seeding voice.
   *
   * The prompt input stays UNCONTROLLED so the `/`+`@` trigger menus keep a live
   * caret. We NEVER bind a plain STRING `value`: that flips the element into
   * controlled mode, which re-applies the property and collapses the shadow-DOM
   * selection, disabling the caret-anchored menu. So clear-on-submit goes through
   * the element's `clear()` method, and voice seeds a ComposerDoc (a non-string
   * value is a one-time seed that leaves the input uncontrolled). We keep the live
   * text mirrored in `liveText` (from `kai-value-change`) so voice can append.
   *
   * Rich props (`suggestions`, `triggers`) and boolean flags (`loading`, `voice`)
   * are set imperatively as DOM PROPERTIES (`bind:this` + `$effect`): `voice` in
   * particular MUST be a truthy PROPERTY (`el.voice = true`), not a bare attribute,
   * or the facade reads the mic control as off.
   */
  let {
    theme,
    loading,
    suggestions,
    triggers,
    onsubmit,
    onsuggestion,
  }: {
    theme: Theme;
    loading: boolean;
    suggestions: string[];
    triggers: unknown[];
    onsubmit: (value: string) => void;
    onsuggestion: (value: string) => void;
  } = $props();

  // Ref to the underlying <kai-prompt-input> for the imperative pushes (rich props,
  // flags, clear() on submit, ComposerDoc seed from voice); `liveText` mirrors text.
  // The kit ships a typed element interface; intersect the imperative `clear()`
  // method the facade exposes (methods aren't part of the generated prop interface).
  let el: KaiPromptInputElement & { clear?: () => void };
  let liveText = '';

  $effect(() => { el.suggestions = suggestions; });
  $effect(() => { el.triggers = triggers as KaiPromptInputElement['triggers']; });
  $effect(() => { el.loading = loading; });
  // A truthy PROPERTY, never a bare `voice` attribute. Runs once (no reactive deps).
  $effect(() => { el.voice = true; });

  // Voice: on a transcript, append it to the current text and seed the (uncontrolled)
  // input as a ComposerDoc. A non-string `value` is a one-time seed into the
  // element's internal state; a plain STRING would instead flip it into controlled
  // mode and re-break the `/`+`@` triggers and submit.
  const { supported: voiceSupported, start: startVoice } = createVoiceInput((transcript) => {
    const next = (liveText ? liveText + ' ' : '') + transcript;
    liveText = next;
    el.value = [{ type: 'text', text: next }];
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
    el.clear?.();
    onsubmit((e as CustomEvent<{ value: string }>).detail.value);
  }

  function onSuggestionClick(e: Event) {
    onsuggestion((e as CustomEvent<{ value: string }>).detail.value);
  }
</script>

<div class="composer">
  <kai-prompt-input
    bind:this={el}
    {theme}
    placeholder="Message the demo…"
    onkai-voice={handleVoice}
    onkai-value-change={onValueChange}
    onkai-submit={onSubmit}
    onkai-suggestion-click={onSuggestionClick}
  ></kai-prompt-input>
  <p class="composer-hint">
    Type <kbd>/</kbd> for skills · <kbd>@</kbd> for agents
  </p>
</div>
