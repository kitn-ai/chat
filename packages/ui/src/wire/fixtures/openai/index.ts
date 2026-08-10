// Captured OpenAI-format SSE, loaded as raw text. TEST-ONLY: nothing reachable
// from src/wire/index.ts may import this, and `!src/wire/fixtures` keeps it out
// of the published tarball.
const files = import.meta.glob('./*.sse', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

/** Keyed by bare fixture name: './text-only.sse' becomes 'text-only'. */
export const OPENAI_FIXTURES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, text]) => [
    path.replace(/^\.\//, '').replace(/\.sse$/, ''),
    text,
  ]),
);
