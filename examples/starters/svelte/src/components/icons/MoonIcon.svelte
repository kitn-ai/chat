<script lang="ts">
  /**
   * Moon glyph — shown in light mode (tap the toggle -> dark). moon/sun aren't in
   * the kit's icon set, so the example owns them. The parent (`<kai-button>`) is a
   * custom element, so extra props (`slot="icon"`, `aria-hidden`) pass through as a
   * prop bag; spreading `...rest` onto the root <svg> lands them on the DOM node so
   * it drops into <kai-button>'s `icon` slot. Mirrors the Vue icon's fallthrough.
   */
  let { size = 20, ...rest }: { size?: number } & Record<string, unknown> = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  {...rest}
>
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
</svg>
