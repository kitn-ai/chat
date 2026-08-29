# Phase 3 epic-end verification — B-26 gates + IVP (2026-08-28)

Verifier: independent ivp-verifier, branch `feat/template-registry-builder`.
Ran every gate and the full B-26 IVP checklist from
`.superpowers/sdd/2026-08-28-builder-phase3/task-6-brief.md` against the
real built artifact and real npm-packed-and-installed consumer tarballs, in
TWO passes: an initial pass at HEAD `a1864919`, and a re-verification pass
after three fix commits (`411ba065`, `f4c4390e`, `a5d8a814`).

## Verdict, initial pass (HEAD `a1864919`): FAIL

Two independent gate failures, plus the B-26 IVP itself could not run past
step 1 because `kai dev --builder` crashed on launch in every configuration
tested (fresh repo build, and a real consumer install of the packed
tarball).

## Verdict, re-verification pass (after `411ba065`/`f4c4390e`/`a5d8a814`): PASS, with one new defect found and reported

Both gates that failed the first pass are now green. `kai dev --builder`
launches correctly and the full B-26 IVP was executed end to end across all
5 buildable templates: Start screen, template creation (including the
Workspace variant picker), per-section control flips with HMR verified in
the live preview, a rejecting edit (422, file untouched, preview stands),
a hand-edit-on-disk SSE round-trip, and a plain `kai dev` (no `--builder`)
byte-identical check. One new, real, reproducible defect was found during
this pass and is reported below (not fixed) — see "New defect found in the
re-verification pass".

Full evidence is in `evidence/` and `screenshots/`.

## Part 1 — gates

**Initial pass (HEAD `a1864919`):**

<!-- gate-list: partial -- the phase-3-relevant local subset from the task brief, not the required CI `test` job's full gate set -->
| Gate | Result | Notes |
|---|---|---|
| `nx build ui --skip-nx-cache` | PASS | emits `dist/builder-page/` (confirmed: `index.html` + `assets/`) |
| `vitest run --project=unit` | **FAIL** | `tests/styles/shadow-sheet-scan.test.ts` — 1 failed / 5450 passed. See `evidence/gate-unit-failure.txt` |
| `vitest run --project=emitted` | PASS | 35/35 tests, 5/5 files |
| `nx typecheck ui --skip-nx-cache` | PASS | `verify:quarantine` clean, all 5 tsc passes clean |
| `verify:generated` | PASS | 19/19 generated artifacts back in sync |
| `verify:construct` | PASS | self-test 3/3 clean, then "verify:construct — 112 cells ejected, tsc'd, built; 5 consumer-bundled. Real CLI, real install, real tsc, real vite, real bundler." |
| `verify:pack` | **FAIL** | unpacked size 9.56 MiB exceeds the 9.49 MiB ceiling by 0.07 MiB. See `evidence/gate-verify-pack-failure.txt` |

**Re-verification pass (after commits `411ba065`/`f4c4390e`/`a5d8a814`, fresh `nx build ui --skip-nx-cache`):**

<!-- gate-list: partial -- only the two gates that failed the first pass, re-run after the fix commits; not the full local subset or the CI job -->
| Gate | Result | Notes |
|---|---|---|
| `vitest run --project=unit` — `tests/styles/shadow-sheet-scan.test.ts` | PASS | 4/4 passed in isolation. See `evidence/gate-unit-reverify.txt` |
| `verify:pack` | PASS | unpacked size now under the raised 9.85 MiB ceiling. See `evidence/gate-verify-pack-reverify.txt` |

One unrelated new full-suite failure surfaced on the re-run, self-inflicted by
this verifier's own first-pass evidence commit (`72ea2336`): a fenced
command block and a markdown table in this README each read as an unmarked
"gate list" to `tests/scripts/gate-parity-guard-wiring.test.ts` /
`lint-gate-parity.mjs`. Fixed in this same evidence commit by adding
`<!-- gate-list: partial -- ... -->` markers above both — a documentation
correction to this verifier's own report, not a product-code fix. Full
`--project=unit` suite re-run after that fix: see
`evidence/gate-unit-full-reverify.txt`.

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

## Part 2, initial pass (HEAD `a1864919`) — B-26 IVP: BLOCKED at step 1

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

## Part 2, re-verification pass (after `411ba065`/`f4c4390e`/`a5d8a814`) — full B-26 IVP executed

`kai dev --builder` now starts correctly. Full transcript, per-step
evidence, and the one new defect found: `evidence/ivp-part2-full-pass.txt`.
Screenshots: `screenshots/`.

| Step | Result | Evidence |
|---|---|---|
| 2. Start screen: 5 buildable cards + scratch row, no Voice | PASS | `screenshots/start-screen.png` |
| 3. Pick template, name it, construct file written, panel + iframe appear (all 5 templates) | PASS | `screenshots/widget/01-panel-created.png`, and one creation per other template (see evidence file) |
| 4. Per-section control flips reflected via HMR — header title + accent + capability toggle, verified deeply on `widget`; header title verified on all 5 templates | PASS | `screenshots/widget/03-header-and-accent-hmr.png`, `screenshots/{workspace,inAppAssistant,assistant,research}/*-header-hmr.png` |
| 5. Rejecting edit → 422 problems render, file/preview last-good stands | PASS | `screenshots/widget/04-rejection.png` + a raw `curl -X POST /api/construct` 422 repro |
| 6. Workspace path: Start → Workspace → variant picker (2 cards) → create → panel | PASS | `screenshots/workspace/01-variant-picker.png` |
| 7. Hand-edit construct file on disk → panel reflects via SSE, preview HMRs | PASS | `screenshots/widget/05-hand-edit-sse.png` |
| 8. Plain `kai dev` (no `--builder`) boots/serves byte-identically, no builder server | PASS | see `evidence/ivp-part2-full-pass.txt` — port 5173, no 4400/4401 bound |

Scope note: steps 3-4 were exercised in full depth (rejection + hand-edit +
3 distinct control flips + HMR verification) on the `widget` template; the
other four templates got Start-screen entry, creation, one header-title
HMR flip, and the reload-mislabel check (below) rather than every listed
example flip per template. Reasoning and the "why this is representative"
argument are in the evidence file.

### New defect found in the re-verification pass: panel mislabeled "Scratch" on every reload of an existing construct

Reproduced on ALL FIVE templates, 100% of the time: after a template is
created and the builder page is reloaded (a plain browser refresh, or the
dev-builder server restarted against an already-existing construct file —
the "existing file → straight to panel" path B-23 specifies), the panel's
header/breadcrumb label reads **"Scratch"** instead of the actual template
name (e.g. "Support widget", "Workspace"). Every other part of the panel is
correct for the real construct — the right fields, the right layout, the
right live preview — only the label is wrong. It IS correct immediately
after creating a construct in the same browser session, without a reload;
it becomes wrong on the next fresh page load. See
`screenshots/widget/02-reload-mislabel-bug.png` (construct is
`layout:"widget"`, panel content is all widget-correct, header still says
"Scratch") and the fuller repro notes in `evidence/ivp-part2-full-pass.txt`.
This looks like the panel deriving its header label from some in-memory
"which card did the user click" state that isn't reconstructed when a
construct is loaded straight from disk, rather than from the construct's
own `layout` field (which IS present and correct in every case observed).

## Commands run (for reproduction)

<!-- gate-list: partial -- this is the phase-3-relevant local subset from the task brief, not the required CI `test` job's full gate set, and it also mixes in non-gate IVP setup/repro commands -->
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

1. ~~**Blocking defect (B-22):** `builderPageDir()` resolves the wrong
   directory once Vite chunk-splits `dev.ts` out of `construct-cli.es.js`.~~
   **FIXED in `411ba065`** — verified in the re-verification pass: `kai dev
   --builder` starts correctly from both a fresh repo build and a real
   npm-packed-and-installed consumer tarball, every time.
2. ~~**Unit gate (shadow CSS coverage):** missing builder-app utility
   classes in `compiled.css`.~~ **FIXED in `f4c4390e`** — verified green,
   `evidence/gate-unit-reverify.txt` + full-suite `evidence/gate-unit-full-reverify.txt`.
3. ~~**Pack ceiling:** `dist/builder-page/` pushed the tarball over the
   9.49 MiB ceiling.~~ **FIXED in `a5d8a814`** (ceiling raised to 9.85 MiB)
   — verified green, `evidence/gate-verify-pack-reverify.txt`.
4. **NEW — panel mislabeled "Scratch" on reload (found in re-verification
   pass):** the derived panel's header/breadcrumb always reads "Scratch"
   when a construct is loaded from an existing file on disk (any reload,
   or a fresh server start against an existing file), regardless of the
   construct's actual `layout`. It IS correct immediately after creating
   the construct in the same browser session. Reproduces on all 5
   buildable templates, 100% of the time. See "New defect found in the
   re-verification pass" above and `evidence/ivp-part2-full-pass.txt` for
   the full repro. Likely cause: the panel's template-name label is driven
   by which Start-screen card was clicked (in-memory), not derived from
   the loaded construct's `layout` field, so the derivation is skipped
   entirely on the load-from-disk path.
