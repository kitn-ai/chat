<script setup lang="ts">
/**
 * Moon glyph — shown in light mode (tap the toggle -> dark). moon/sun aren't in
 * the kit's icon set, so the example owns them. Fallthrough attributes land on the
 * root <svg>, so `slot="icon"` and `aria-hidden` pass through and it drops into
 * <kai-button>'s icon slot.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 20 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
</template>
