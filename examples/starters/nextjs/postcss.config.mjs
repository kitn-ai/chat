// NO PLUGINS, ON PURPOSE — and the reason is not "our CSS is plain".
//
// This config used to say the app imports "@kitn.ai/ui/theme.css — just custom
// properties", and that was wrong in a way that built green: `theme.css` is
// Tailwind v4 SOURCE, its light tokens live in an `@theme { … }` at-rule, and with
// no Tailwind in this pipeline the browser discarded the whole block. The app now
// imports the pre-compiled `@kitn.ai/ui/theme.tokens.css` instead (see the note in
// `app/layout.tsx`), which is real CSS and needs no plugin.
//
// The empty config still has a job: without it Next walks up the tree and picks up
// the monorepo root's Tailwind PostCSS config, which is not installed here. A
// standalone app outside this repo would not need the file at all — and an app
// that DOES add Tailwind should add the plugin here and switch the import back to
// `theme.css`, which is then compiled rather than discarded.
const config = { plugins: {} };
export default config;
