// `*.css?raw` — Vite inlines the file's TEXT as a string at build time.
//
// tools/theme.ts uses it to read the real `--kai-*` token names out of
// theme.css instead of restating them. The declaration lives here rather than
// coming from `vite/client` because tsconfig.mcp.json deliberately runs with
// `types: ["node"]` and no DOM — this is a Node bundle that emits HTML as
// strings. One narrow module pattern is cheaper than pulling the whole browser
// client typing into that pass.
declare module '*.css?raw' {
  const content: string;
  export default content;
}
