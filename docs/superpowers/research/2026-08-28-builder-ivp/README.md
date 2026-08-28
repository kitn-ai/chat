# Phase 3 epic-end verification — B-26 gates + IVP (2026-08-28)

Verifier: independent ivp-verifier, branch `feat/template-registry-builder`,
HEAD at verification time `a1864919`. Ran every gate and attempted the full
B-26 IVP checklist from `.superpowers/sdd/2026-08-28-builder-phase3/task-6-brief.md`
against the real built artifact and a real npm-packed-and-installed
consumer tarball. No source files were changed by this pass.

## Verdict: FAIL

Two independent gate failures, plus the B-26 IVP itself could not run past
step 1 because `kai dev --builder` crashes on launch in every configuration
tested (fresh repo build, and a real consumer install of the packed
tarball). Full evidence is in `evidence/`.

## Part 1 — gates

| Gate | Result | Notes |
|---|---|---|
| `nx build ui --skip-nx-cache` | PASS | emits `dist/builder-page/` (confirmed: `index.html` + `assets/`) |
| `vitest run --project=unit` | **FAIL** | `tests/styles/shadow-sheet-scan.test.ts` — 1 failed / 5450 passed. See `evidence/gate-unit-failure.txt` |
| `vitest run --project=emitted` | PASS | 35/35 tests, 5/5 files |
| `nx typecheck ui --skip-nx-cache` | PASS | `verify:quarantine` clean, all 5 tsc passes clean |
| `verify:generated` | PASS | 19/19 generated artifacts back in sync |
| `verify:construct` | PASS | self-test 3/3 clean, then "verify:construct — 112 cells ejected, tsc'd, built; 5 consumer-bundled. Real CLI, real install, real tsc, real vite, real bundler." |
| `verify:pack` | **FAIL** | unpacked size 9.56 MiB exceeds the 9.49 MiB ceiling by 0.07 MiB. See `evidence/gate-verify-pack-failure.txt` |

### Unit gate defect
`tests/styles/shadow-sheet-scan.test.ts` fails: the shipped source now
references Tailwind utility classes that `src/elements/styles.css` never
compiles into `compiled.css` — `grid-cols-[380px_1fr]`, `h-dvh`, `max-w-4xl`,
`max-w-md`, `mb-6`, `min-h-dvh`, `p-8`. These read like classes used by the
new builder page/app source (layout grid, viewport-height panes, prose
max-widths) that live outside the directories `styles.css`'s `@source` list
currently scans. Per `CLAUDE.md`'s shadow-DOM contract this means those
classes will be **absent from the shipped shadow stylesheet** — the
builder's own layout would silently lose these utility rules for any
consumer who only gets the compiled CSS (i.e. everyone but this dev tree,
where Tailwind's JIT scan of `src/**` papers over the gap locally). This is
a real defect in the shipped artifact, not a test-only concern.

### Pack-weight gate defect
`verify:pack` fails by 0.07 MiB against a 9.49 MiB ceiling
(`packages/ui/scripts/verify-pack-weight.mjs:362`). `dist/builder-page/`
(new this epic) is 280 KB unpacked (`index-B0ms5q-z.js` 197.2 KB +
`index-CeZ9V_DN.css` 73.5 KB + `index.html`), which is the obvious
candidate for the new weight the brief called out in advance. Per the
brief's explicit instruction, this is reported and **not fixed, and the
ceiling was not raised** by this verification pass.

## Part 2 — B-26 IVP: BLOCKED at step 1

Setup performed per the brief: `cd packages/ui && npm pack --pack-destination
<scratch>`, installed via `npm install file:<tarball>` into a fresh empty
consumer directory (mirroring `cli.test.ts`'s `packedUiTarball` pattern),
then ran the builder exactly as a consumer would:
`node node_modules/@kitn.ai/ui/bin/mcp.js dev --builder`.

**Result: the process exits immediately with a "Missing build artifact"
error and never binds an HTTP server**, in both:
- the packed-and-installed consumer tarball, and
- the repo's own freshly built `dist/` (same command via `packages/ui/bin/mcp.js`).

```
Missing build artifact: <...>/dist/assets/builder-page — the builder page
ships prebuilt. Run `nx build ui` (or npm run build in packages/ui) and try
again.
```

`dist/builder-page/index.html` genuinely exists on disk the whole time —
the code is looking one directory level too deep, at `dist/assets/builder-page`
instead of `dist/builder-page`. Root cause traced to
`src/agent-tooling/construct/dev.ts`'s `builderPageDir()`:

```ts
export function builderPageDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'builder-page');
}
```

This assumes its own compiled module lives directly in `dist/`, next to
`dist/builder-page/` — true only if `dev.ts`'s code ends up inlined into
`dist/construct-cli.es.js`. It does not: Vite's build splits `dev.ts` into
its own chunk, `dist/assets/dev-BE36ZFZx.js`, which `construct-cli.es.js`
dynamically imports (confirmed via
`grep -o "assets/dev-" dist/construct-cli.es.js`). Inside that chunk,
`import.meta.url` is the chunk's own path under `dist/assets/`, so
`dirname(...)` is `dist/assets`, and the computed page dir is
`dist/assets/builder-page` — one level off from the real `dist/builder-page`.
This is a build/bundling defect, not a missing-file problem, and it
reproduces 100% of the time on a stock build with no special flags.

Full repro transcript, including the two independent reproductions and the
grep evidence for the root cause: `evidence/ivp-blocking-crash.txt`.

### Consequence for the B-26 checklist

Every remaining IVP step depends on the builder server actually binding
port 4400 and serving the Start screen. Since `devBuilder()` calls
`process.exit(1)` before any server is created, **none of the following
could be exercised, for any of the 5 buildable templates
(widget, inAppAssistant, assistant, research, workspace)**:

| Step | Result |
|---|---|
| 2. Start screen serves, 5 buildable cards + scratch row, no Voice | BLOCKED — server never starts |
| 3. Pick template, name it, construct file written, panel + iframe appear | BLOCKED |
| 4. Per-section control flips reflected via HMR (accent, capability toggle, header title, etc.) | BLOCKED |
| 5. Rejecting edit → 422 problems render, file/preview last-good stands | BLOCKED |
| 6. Workspace path: Start → Workspace → variant picker (2 cards) → create → panel | BLOCKED |
| 7. Hand-edit construct file on disk → panel reflects via SSE | BLOCKED |
| 8. Plain `kai dev` (no `--builder`) boots/serves byte-identically | **Not attempted this pass** — out of scope once step 1 blocked everything downstream; worth confirming separately since plain `dev()` is documented as untouched, but was not itself exercised here |

No screenshots exist for Part 2 because there was nothing on screen to
capture — the server process dies before opening a listening socket. This
report treats the crash itself as the primary evidence rather than
fabricating a screenshot of a blank/failed page load.

### Process hygiene
No orphaned processes were left running (`pgrep -fl
"construct-cli|mcp.js dev|vite.*4400|vite.*4401"` returned empty after each
attempt). No source files were modified by this verification pass
(`git status --short` clean throughout).

## Commands run (for reproduction)

```bash
# Part 1
pnpm exec nx build ui --skip-nx-cache
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm exec nx typecheck ui --skip-nx-cache
cd packages/ui && pnpm run verify:generated
cd packages/ui && pnpm run verify:construct
cd packages/ui && pnpm run verify:pack

# Part 2
cd packages/ui && npm pack --pack-destination <scratch>
mkdir <scratch>/widget && cd <scratch>/widget && npm init -y
npm install file:<scratch>/kitn.ai-ui-0.30.0.tgz
node node_modules/@kitn.ai/ui/bin/mcp.js dev --builder
```

## Findings for the implementer (do not fix here)

1. **Blocking defect (B-22):** `builderPageDir()` in
   `packages/ui/src/agent-tooling/construct/dev.ts` resolves the wrong
   directory once Vite chunk-splits `dev.ts` out of `construct-cli.es.js`.
   Needs either a build-config fix (prevent the chunk split / force `dev.ts`
   inline into `construct-cli.es.js`) or a path-resolution fix that doesn't
   assume co-location with the entry file (e.g. resolve relative to a
   known-stable anchor, or walk up from wherever the chunk actually lands).
   Blocks the entirety of B-26/B-22/B-23 from being exercised end-to-end.
2. **Unit gate (shadow CSS coverage):** add the builder page/app source
   directories to `src/elements/styles.css`'s `@source` list (or otherwise
   get `grid-cols-[380px_1fr]`, `h-dvh`, `max-w-4xl`, `max-w-md`, `mb-6`,
   `min-h-dvh`, `p-8` compiled into `compiled.css`), per
   `tests/styles/shadow-sheet-scan.test.ts`.
3. **Pack ceiling:** `dist/builder-page/` adds ~280 KB unpacked; the total
   tarball is now 0.07 MiB over the 9.49 MiB ceiling in
   `packages/ui/scripts/verify-pack-weight.mjs`. Decide whether to trim the
   builder page's weight or deliberately raise the ceiling with a dated note
   (owner call, not this verifier's).
