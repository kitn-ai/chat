# Create Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm create kai` asks "What would you like to create?" and, for construct shapes, emits a schema-validated construct JSON plus a real preview handoff; `@kitn.ai/ui` gains an honest `kai` bin alias and a public `./construct` schema export; the docs get the stranger quick-start.

**Architecture:** The wizard is a pure, io-injected module in create-kai (the `answerAxis`/`AxisIo` law extended), composing the construct from answers — no template files. Its option lists and its coverage-registry drift test derive from `ConstructSchema`, bundled at build time from the workspace devDep (create-kai stays zero-runtime-dependency). The kit exposes the schema publicly via a new `./construct` entry.

**Tech Stack:** @clack/prompts (already bundled), esbuild build (create-kai), Zod 4 (`ConstructSchema.shape` introspection), vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-create-wizard-design.md` (W-1..W-8). Owner waived mid-round checkpoints; the wizard's terminal transcript is presented with the final demo.

## Global Constraints

- **One engine, N doors:** no hand-authored option list that restates schema content — enum values and capability keys are read from `ConstructSchema`; only the *curation* (asked / stated / not-asked + reason) is hand-written, in ONE registry, drift-tested against the schema's actual keys.
- **The existing framework flow stays byte-identical** when reached through the new first question, and non-interactive (`--yes` / no TTY) behavior is unchanged (framework flow). Construct shapes are reachable non-interactively only via the new `--shape` flag.
- **create-kai ships zero runtime dependencies** (`files: ["dist"]`, everything bundled) — the schema is bundled, never a runtime import; `verify:pack` / `publish-shape` guards must stay green.
- **Every construct the wizard can emit must parse under the real `ConstructSchema`** — driven as a test over the full answer matrix, not spot checks.
- **Wizard provider is always `{ "mode": "mock" }`** (W-5, keyless-first-run promise).
- **Stated-not-asked law** (axes.ts): an axis with one honest option is stated; zero options is a refusal.
- **Docs voice:** STYLE.md, no em dashes in rendered descriptions, cdn-pins/gate-parity lint rules apply.
- **Foreground gates only;** scoped runs are smoke checks — the merge verdict is each package's full suite + the shared CI gates (Task 5).

## Decisions-to-tasks map (spec W-1..W-8)

| # | Decision | Landed in |
|---|----------|-----------|
| W-1 | create-kai first question, three shapes | Tasks 2, 3 |
| W-2 | Schema-derived options + explicit registry + drift test | Tasks 1 (export), 2 |
| W-3 | Construct file + preview handoff (offer to run dev) | Task 3 |
| W-4 | No template files — answers compose the construct | Task 2 |
| W-5 | v1 question set; provider always mock | Task 2 |
| W-6 | Menu-honesty law; framework flow byte-identical | Tasks 2, 3 |
| W-7 | `kai` bin alias + usage truth | Task 1 |
| W-8 | Docs quick-start guide | Task 4 |

## Verified against the real tree (2026-08-27, explorer report)

- create-kai: `bin: {"create-kai": "./dist/index.js"}`, NO runtime deps (all devDeps incl. `@kitn.ai/ui workspace:*`, `@clack/prompts ^0.11`); `build.mjs` bundles everything, copies `examples/starters/*` → `dist/templates/`; index.ts runs `main()` at module scope (unimportable — why `answerAxis` was extracted, axes.ts:145-153).
- `answerAxis(axis, opts, io)` at axes.ts:192; `AxisIo { ask, state }` at :159; `decideAxis` statement format `` `${only.label} — ${only.hint}; ${axis.because}` ``; clack adapter `clackAxisIo` index.ts:400-410; cancel via `ask()` helper → exit 130 (index.ts:365-372).
- Prompt order today: intro → name (`p.text`) → framework (`p.select`) → layout axis → features multiselect → gateway axis → generate (spinner) → install confirm → next-steps note.
- `parseArgs` args.ts:35; `TAKES_VALUE` set args.ts:27-34; `nonInteractive = args.yes || !process.stdout.isTTY` (index.ts:119); `ZERO_CONFIG` args.ts:93-99.
- menu-honesty.test.ts drives `answerAxis` with spy io (`run()` helper) and drives features through real `generate()` vs `dist/templates` (beforeAll throws if unbuilt). NO pty harness exists anywhere.
- @kitn.ai/ui: single bin `"kai-mcp": "./bin/mcp.js"`; `bin/route.js` `decideEntry` with `CONSTRUCT_COMMANDS = ['dev','compile','eject','validate']`; route.test.js has a pure describe + a spawned-process describe (`execFileSync`, exit 2 on typo).
- USAGE (cli.ts:21-27) says `usage: kai <command>` — currently a lie, no `kai` bin exists.
- `ConstructSchema` (schema.ts:47) is NOT in any published entry; `dist/schemas.js` (the `./schemas` export) deliberately excludes it and documents its own size budget — do NOT add it there. `zod ^4.4.3` is already a runtime dep of @kitn.ai/ui. Also exported from schema.ts: `validateConstruct`, `CONSTRUCT_SCHEMA_URL`, `type Construct`, `ConstructProblem`, `ValidationOutcome`.
- Schema keys the registry must classify — top-level: `$schema, name, layout, provider, userId, theme, header, empty, home, capabilities, cards, slots, widget`; capabilities: `starters, attachments, history, reasoning, reasoningOpen, conversations`. Only `theme.mode` carries a zod `.default()`.
- `dev` command: `npx @kitn.ai/ui dev <file>` → `parseUiFlag`, `resolve(cwd, path)`, never resolves (cli.ts:105-115).
- Docs sidebar: hand-listed in apps/docs/astro.config.mjs:70-125 (`starlightSidebarTopics`); guide frontmatter = title + description only; release-please version markers pattern in getting-started.mdx:34-36.
- release-please: `node-workspace` plugin already bumps create-kai on every ui release through the devDep; no config change needed for this plan (we add no runtime dep).
- **Unverified/assumed:** how `catalog.ts` imports kit data for bundling (Task 2 reads it and mirrors); whether cli tests pin the USAGE string verbatim (Task 1 adjusts them); clack `p.select` maxItems for a 3-option list (fine).

## Ambiguities resolved

1. **How create-kai reaches the schema:** NOT a runtime dependency (would break the zero-dep premise and `files: ["dist"]`). It imports `@kitn.ai/ui/construct` (Task 1's new export) at build time and esbuild bundles it (zod included) — the same posture as the catalog bundling. Task 2 reads `catalog.ts`'s import form first and mirrors it.
2. **Where the public schema export lives:** a NEW `./construct` subpath entry (`dist/construct.js` + `.d.ts`), NOT `./schemas` (its file documents a size budget that excludes zod; adding the schema there breaks its own cost contract). Exports: `ConstructSchema`, `validateConstruct`, `CONSTRUCT_SCHEMA_URL`, `ConstructProblem`, `ValidationOutcome`, `type Construct`.
3. **"pty acceptance" from the spec:** no pty harness exists and none is added. The wizard flow is built io-injected (importable `runWizard`), tested with spy io like menu-honesty; end-to-end evidence comes from Task 5's real `node dist/index.js --shape widget --yes`-style non-interactive run plus a recorded interactive transcript via `script`(1) in the final demo.
4. **Non-interactive construct emission:** `--shape widget|fullscreen` (new TAKES_VALUE flag) with `--yes` emits the defaults-only construct; `--shape app` = today's flow explicitly; no `--shape` = today's behavior exactly.
5. **The shape question is a real Axis** (3 options → always asked interactively; `--shape` is its override), so the honesty law and the menu-honesty harness cover it for free.
6. **Fullscreen shape:** same questionnaire as widget minus widget-only concepts; layout is the only difference (`fullscreen` vs `widget`). The registry states `widget` (the config key) as not-asked v1 (Dock defaults).
7. **File naming:** `<name>.construct.json` written into `dir` (created if missing, refusing a non-empty dir the same way the scaffold flow does — reuse its check if one exists, else `readdir` length check, decide loudly).
8. **`kai` bare-npx collision:** the usage text's no-install line always spells `npx @kitn.ai/ui <cmd>`; nothing ever prints bare `npx kai`.

---

### Task 1: @kitn.ai/ui — `kai` bin alias, usage truth, `./construct` export

**Files:**
- Modify: `packages/ui/package.json` (bin map, exports map, build script chain)
- Modify: `packages/ui/src/agent-tooling/construct/cli.ts` (USAGE text)
- Create: `packages/ui/src/agent-tooling/construct/public.ts` (the export surface)
- Create: `packages/ui/vite.config.construct.ts` (or extend the existing schemas/cli build the same way sibling entries are built — read `vite.config.schemas.ts` and mirror; output `dist/construct.js` + d.ts)
- Test: `packages/ui/bin/route.test.js` (bin-map assertion), `packages/ui/tests/scripts/` or sibling (built-entry smoke)

**Interfaces:**
- Produces: `"kai": "./bin/mcp.js"` bin alias; `"./construct"` export resolving `{ ConstructSchema, validateConstruct, CONSTRUCT_SCHEMA_URL, ConstructProblem, ValidationOutcome }` + `type Construct`; USAGE text that prints real invocations. Task 2 imports `@kitn.ai/ui/construct`.

- [ ] **Step 1: Failing tests.** (a) In `bin/route.test.js`, add to the pure describe: read `package.json` and assert `bin` maps BOTH `kai-mcp` and `kai` to `./bin/mcp.js`. (b) New smoke test (mirror the repo's built-artifact test idiom — it may belong beside the MCP manifest tests): dynamic-import `dist/construct.js`, assert `ConstructSchema.safeParse({ name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } }).success === true` and `validateConstruct` + `CONSTRUCT_SCHEMA_URL` are exported. Run both → red (no alias, no entry).
- [ ] **Step 2: Implement.** `public.ts` re-exports from `./schema`. Build entry mirroring how `dist/schemas.js` / `dist/construct-cli.es.js` are produced (read those configs first; wire into the `build` script chain so `nx build ui` emits it). package.json: add the bin alias and the `./construct` exports entry (types + default), matching the `./schemas` entry's shape; check `typesVersions` needs a `construct` line like `schemas` has. USAGE header becomes:

```
usage: npx @kitn.ai/ui <command>   (or `kai <command>` once @kitn.ai/ui is installed)
```

with the command lines unchanged except `kai` → kept (they document the installed form). If any test pins the old USAGE string, update it to the new text (do not weaken the assertion).
- [ ] **Step 3: Build + gates.** From repo root `./node_modules/.bin/nx build ui --skip-nx-cache`, then in packages/ui: the two new tests green; `npm run verify:pack` (the contents guard allows dist/); `npm run verify:generated`; `npm run typecheck`; `pnpm exec vitest run --project=unit src/agent-tooling/construct tests/scripts` as smoke.
- [ ] **Step 4: Commit** (`feat(ui): kai bin alias + public ./construct schema export`).

### Task 2: create-kai — wizard module, registry, drift test

**Files:**
- Create: `packages/create-kai/src/wizard.ts`
- Test: `packages/create-kai/test/wizard.test.ts`
- Modify: `packages/create-kai/src/args.ts` (`--shape` in TAKES_VALUE + ParsedArgs)
- Modify: `packages/create-kai/scripts/build.mjs` only if the new import needs wiring (esbuild bundles by default; the kit must be BUILT first — dist/construct.js exists after Task 1)

**Interfaces:**
- Consumes: `@kitn.ai/ui/construct` (Task 1) — but FIRST read `src/catalog.ts` to see the exact import form used for kit data and mirror it (if catalog imports a source path rather than the package entry, prefer the package entry now that one exists, noting why in the report).
- Produces (Task 3 consumes verbatim):

```ts
export type ShapeId = 'widget' | 'fullscreen' | 'app';
export function shapeAxis(): Axis; // 3 options; because-line explains the split
export interface WizardAnswers {
  name: string;
  shape: Exclude<ShapeId, 'app'>;
  headerTitle?: string;        // '' → omit header
  home: boolean;               // true → home: { greeting: { title } } (title from a text answer or default)
  homeGreeting?: string;
  starters: string[];          // 0..6
  attachments: boolean;        // true → { accept: ['image/*', 'application/pdf'] } stated default
  history: boolean;            // true → history: { persistence: 'local' } + conversations: true
  accent?: string;             // '' → omit theme.accent
}
export function composeConstruct(a: WizardAnswers): unknown; // plain object incl. $schema: CONSTRUCT_SCHEMA_URL, provider: { mode: 'mock' }
export const WIZARD_REGISTRY: Record<string, { status: 'asked' | 'stated' | 'not-asked'; reason: string }>;
  // keys: every ConstructSchema top-level key + 'capabilities.<key>' for every capabilities key
export interface WizardIo { text(msg: string, initial?: string): Promise<string>; confirm(msg: string, initial: boolean): Promise<boolean>; multilineList(msg: string): Promise<string[]>; state(label: string, statement: string): void; }
export async function runWizard(shape: Exclude<ShapeId,'app'>, name: string, io: WizardIo, nonInteractive: boolean): Promise<WizardAnswers>;
```

- [ ] **Step 1: Failing tests** in `wizard.test.ts` (menu-honesty idiom — spy io, no terminal):
  1. **Registry drift**: derive the key lists from the real schema — `Object.keys(ConstructSchema.shape)` and the capabilities inner shape's keys (Zod 4: unwrap the `.optional()` to reach the object's `.shape`; write a small helper, do not hand-list) — assert every derived key (and no phantom key) is classified in `WIZARD_REGISTRY`. This test is the W-2 guarantee: a new schema key goes red here until consciously classified.
  2. **Every emitted construct validates**: drive `composeConstruct` over the FULL answer matrix (booleans × shape × starters ∈ {[], ['a'], 6 entries} × optional strings present/absent — enumerate programmatically) and assert `ConstructSchema.safeParse(result).success` for every cell, plus the cross-field laws hold (history:true ⇒ conversations present; history:false ⇒ NO conversations key — the schema's superRefine would reject it).
  3. **Keyless promise**: every cell's `provider` deep-equals `{ mode: 'mock' }`.
  4. **Stated-not-asked**: `runWizard` with spy io + `nonInteractive: false` asks exactly the questions whose registry status is `asked`; `stated` entries reach `io.state`; `nonInteractive: true` asks nothing and returns defaults.
  5. **shapeAxis honesty**: `decideAxis(shapeAxis()).ask === true` (3 options).
- [ ] **Step 2: Red** — `pnpm --filter create-kai run build` first (needs the kit built from Task 1; the bundle carries the schema), then `pnpm --filter create-kai test -- wizard` → red.
- [ ] **Step 3: Implement** `wizard.ts` per the Interfaces block; registry reasons are real sentences ("provider: stated — the wizard's promise is a keyless first run; switch providers in the construct file after"). `--shape` into args.ts (+ its test file's pattern).
- [ ] **Step 4: Green** — wizard tests + the FULL create-kai suite (`pnpm --filter create-kai test`) + `pnpm --filter create-kai run typecheck`.
- [ ] **Step 5: Commit** (`feat(create-kai): schema-derived construct wizard module + coverage registry`).

### Task 3: create-kai — first question, flow integration, handoff

**Files:**
- Modify: `packages/create-kai/src/index.ts`
- Test: extend `packages/create-kai/test/wizard.test.ts` or new `test/create-flow.test.ts` — but note index.ts is unimportable; testable logic (construct-file writing, next-steps text, dir refusal) goes in `wizard.ts` (or a small `emit-construct.ts`) so tests reach it. Only the clack adapters live in index.ts.
- Modify: `packages/create-kai/scripts/smoke.mjs` (a `--shape widget` smoke leg)

**Interfaces:**
- Consumes: Task 2's exports; existing `ask`/`stated`/`clackAxisIo`/`parseArgs`/`validateProjectName`.
- Produces: `export async function emitConstruct(dir: string, answers: WizardAnswers): Promise<{ file: string; devCommand: string }>` (in wizard.ts or emit-construct.ts) — writes `<name>.construct.json` (2-space JSON + trailing newline), refuses a non-empty target dir loudly (mirror the scaffold flow's existing dir handling — read index.ts's current behavior first and match it), returns `devCommand = 'npx @kitn.ai/ui dev <relative file>'`.

- [ ] **Step 1: Failing tests** for `emitConstruct`: writes valid JSON that reparses + validates; refuses non-empty dir with a loud message; devCommand names the actual file.
- [ ] **Step 2: Implement the flow** in index.ts: after the name prompt, `answerAxis(shapeAxis(), { override: args.shape, nonInteractive, fallback: 'app' }, clackAxisIo)`. `'app'` → the existing flow, UNTOUCHED (fallback 'app' preserves today's non-interactive behavior — Global Constraint). widget/fullscreen → `runWizard` with a clack-backed `WizardIo` (text → `p.text`, confirm → `p.confirm`, starters → `p.text` comma-split or repeated prompt — implementer's call, keep it one screen), then `emitConstruct`, then `p.confirm('Start the live preview now?')` → spawn `npx @kitn.ai/ui dev <file>` inheriting stdio (decline → print the command in the next-steps note). Cancel semantics via the existing `ask()` helper everywhere.
- [ ] **Step 3: Wire the smoke leg**: `scripts/smoke.mjs` gains a construct leg — `node dist/index.js tmpdir --shape widget --yes` then validate the emitted JSON with `node -e` against the schema URL copy bundled in dist (or re-run create-kai's own test validation) — keep it cheap; it proves the built artifact end-to-end without pty.
- [ ] **Step 4: Green** — full create-kai suite + typecheck; run the smoke leg once and paste its output; ALSO re-run the untouched framework path once (`node dist/index.js tmp --yes`) and confirm identical file set to a pre-change run (byte-identity constraint — capture `git stash`-free comparison via the existing generate tests staying green unmodified).
- [ ] **Step 5: Commit** (`feat(create-kai): "what would you like to create" flow with construct shapes + dev handoff`).

### Task 4: Docs quick-start

**Files:**
- Create: `apps/docs/src/content/docs/guides/drop-in-widget.mdx`
- Modify: `apps/docs/astro.config.mjs` (sidebar entry after Getting Started)

- [ ] **Step 1: Write the page.** Frontmatter title `Drop-in widget`, description one sentence. Content: the two doors — `npm create kai` (pick "Chat widget") OR hand-write the construct — then `npx @kitn.ai/ui dev widget.construct.json`, the annotated owner-test construct (home + conversations + starters + unreadColor, `provider: mock` explained as the keyless path), the `compile` step and what the emitted file is, and one line on switching provider to a real endpoint (link the construct schema URL). Voice per STYLE.md: terse, human, no em dashes, web-components-first. No version literals (cdn-pins lint); no unlabeled gate lists (gate-parity lint).
- [ ] **Step 2: Gates.** `pnpm --filter @kitn.ai/docs run verify:docs` (snippet honesty) + docs build; `node packages/ui/scripts/lint-gate-parity.mjs --repo-root .` and `pnpm --filter @kitn.ai/ui run lint:cdn-pins` (both scan docs).
- [ ] **Step 3: Commit** (`docs: drop-in widget quick-start (the stranger flow)`).

### Task 5: Full gates + stranger-flow live check

**Files:** none — verification only.

- [ ] **Step 1: Full battery, foreground:** `./node_modules/.bin/nx build ui --skip-nx-cache` · packages/ui: full `--project=unit` + `--project=emitted` + `npm run typecheck` + verify:pack/generated/consumer/construct/scaffold + lint:silent-drops · create-kai: build + full test + typecheck + verify:pack + smoke (both legs) · docs verify:docs. Paste summary lines.
- [ ] **Step 2: The stranger run, for real:** in a temp dir, `npm pack` both packages from their built trees, then: `npm init -y`, install the create-kai tarball, run its bin non-interactively (`--shape widget --yes`) and confirm the construct file lands; install the ui tarball and run `./node_modules/.bin/kai dev <file>` — the bin ALIAS proved on a real install, not just in package.json; drive the served page with Playwright: widget opens on Home, mock reply streams in a drilled chat. Screenshot both states.
- [ ] **Step 3: Recorded interactive transcript:** `script -q /dev/null node packages/create-kai/dist/index.js tmp-demo` (or `script`'s macOS arg order — check `man script`) answering the widget path; save the transcript into the SDD workspace for the demo (the terminal story-first artifact).
- [ ] **Step 4: Report** with evidence; screenshots + transcript to the supervisor.

## Follow-ups to file at merge (do NOT fold in)

- Visual builder prototype: same registry/questions rendered as a form panel beside `kai dev` (next phase; this round proves the derivation).
- Templates/richer starters (ops-console shape) — builder phase.
- `npx @kitn.ai/ui init` zero-question fallback — only if the wizard evidence shows demand.
- MCP `construct` tool could surface the wizard registry's "not-asked" reasons as its capability menu (banked idea, now data-backed).
