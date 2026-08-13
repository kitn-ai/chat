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

<!--
  Both suppressed rules are false positives HERE, and the justification is the
  shadow root Svelte's a11y pass cannot see into. It sees an unknown tag with a
  click handler; the button semantics are one level down.

  Measured in chromium against this starter's own build: the accessibility tree
  holds a single `button` named "Toggle light/dark theme" (named from the
  `aria-label` the kit puts on its inner `<button>` from the `label` prop), and
  the `<kai-button>` host is ignored as "uninteresting" and contributes no node.
  Tab reaches that inner button, and Enter and Space activate it natively. The
  resulting click is composed, so it crosses the shadow boundary and lands on
  this `onclick`. Keyboard operation is real, not asserted.

  Do NOT satisfy the second warning literally by putting a role on the host.
  Measured the same way, `role="button"` there turns the one node into TWO
  identically named buttons, and the outer one has tabindex -1, so it is a
  control screen readers announce and keyboard users cannot reach. The kit
  scrubs stray host roles for this reason (`liftRoleOffHost`, kai-message).

  The codes MUST be comma-separated. In runes mode Svelte reads everything after
  the first uncommaed code as prose, so the space-separated form silently
  suppressed only `a11y_click_events_have_key_events` and let the other through.
-->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<kai-button {theme} variant="ghost" size="icon" label="Toggle light/dark theme" onclick={ontoggle}>
  {#if theme === 'light'}
    <MoonIcon slot="icon" aria-hidden="true" />
  {:else}
    <SunIcon slot="icon" aria-hidden="true" />
  {/if}
</kai-button>
