<script lang="ts">
  import type { Theme } from '../lib/types';
  import MoonIcon from './icons/MoonIcon.svelte';
  import SunIcon from './icons/SunIcon.svelte';

  /**
   * Light/dark switch for the top bar. Shows the moon in light mode (tap -> dark)
   * and the sun in dark mode. `<kai-button>` is icon-only, so it carries the
   * accessible label; the glyph is decorative (`aria-hidden`) in the `icon` slot.
   * `<kai-button>` fires the native bubbling `click`, so a plain `onclick` works.
   */
  let { theme, ontoggle }: { theme: Theme; ontoggle: () => void } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<kai-button {theme} variant="ghost" size="icon" label="Toggle light/dark theme" onclick={ontoggle}>
  {#if theme === 'light'}
    <MoonIcon slot="icon" aria-hidden="true" />
  {:else}
    <SunIcon slot="icon" aria-hidden="true" />
  {/if}
</kai-button>
