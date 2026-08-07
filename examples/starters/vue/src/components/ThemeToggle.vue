<script setup lang="ts">
import type { Theme } from '../types';
import MoonIcon from './icons/MoonIcon.vue';
import SunIcon from './icons/SunIcon.vue';

/**
 * Light/dark switch for the top bar. Shows the moon in light mode (tap -> dark)
 * and the sun in dark mode. `<kai-button>` is icon-only, so it carries the
 * accessible label; the glyph is decorative (`aria-hidden`) in the `icon` slot.
 * The native click on the shadow-root button bubbles, so a plain `@click` works.
 */
defineProps<{ theme: Theme }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <kai-button
    :theme="theme"
    variant="ghost"
    size="icon"
    label="Toggle light/dark theme"
    @click="$emit('toggle')"
  >
    <MoonIcon v-if="theme === 'light'" slot="icon" aria-hidden="true" />
    <SunIcon v-else slot="icon" aria-hidden="true" />
  </kai-button>
</template>
