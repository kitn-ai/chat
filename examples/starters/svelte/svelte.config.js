import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Read by both vite-plugin-svelte and svelte-check. `vitePreprocess` lets the
// `<script lang="ts">` blocks use TypeScript. No SvelteKit here — this is a plain
// Svelte 5 SPA.
export default {
  preprocess: vitePreprocess(),
};
