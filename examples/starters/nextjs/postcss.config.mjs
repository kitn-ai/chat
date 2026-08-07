// This example imports plain CSS (`@kitn.ai/ui/theme.css` — just custom
// properties) and needs no PostCSS plugins. We declare an EMPTY config so Next
// doesn't walk up the tree and pick up the monorepo root's Tailwind PostCSS
// config (which isn't installed here). A standalone Next app wouldn't need this.
const config = { plugins: {} };
export default config;
