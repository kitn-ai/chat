# Plan: rung 5 — remote cards (the ops approval console)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** land the §0 pre-rung kit wave (F-20 + F-23 + F-10), then build the ops approval console front-door-first — interactive built-in cards in the thread plus a cross-origin remote run board — and mine it for findings.

**Architecture:** an ORCHESTRATION plan per the ladder's front-door rule, in two halves. Tasks 1–4 are insider code tasks (TDD, delegated, reviewed). Tasks 5–12 mirror the rung-4 orchestration shape: the app code is written by a clean-room builder, never by a plan task; insiders land, harden, and verify.

**Tech stack:** Vite + React + `@kitn.ai/ui/react` + the kai MCP (tarball bin over stdio); `@kitn.ai/ui/provider` for the framed side.

**Spec:** `docs/superpowers/specs/2026-08-21-rung-5-remote-cards-design.md` — the plan argues from the spec; executors read both.

**One refinement against the spec's wording, deliberate:** the spec's §0 names "re-express `artifact.schema.json` / `embed.schema.json`". This plan implements that at the **projection** layer (`tool-defs.ts`), not the authored-schema layer: the authored schemas KEEP their root combinators, so `registry.validate()` semantics are untouched and a neither-`src`-nor-`files` envelope still fails card validation loudly. Re-expressing the authored files instead would silently VALIDATE the useless shape — the exact decide-loudly violation the spec forbids. Same contract, safer mechanism; flagged for owner review of the plan.

## Global constraints (verbatim rules, binding on every dispatch)

- Run git from the repo root only. Branch: this plan continues on `docs/rung-5-remote-cards-spec` for Tasks 1–4; the build moves to `rung-5/app` after Task 4 merges.
- Writer-lock claims per dispatch (`scripts/writer-lock.mjs`); briefs via `scripts/brief.mjs`, never retyped; ledger at `.superpowers/sdd/2026-08-21-rung-5-remote-cards/progress.md`.
- Never `nx test`; never trust nx caches; real builds are `npm run build` inside `packages/ui`.
- `verify:fresh` gates any build that gets packed.
- The CI `test` job is the only merge gate; watch by run id (`gh run watch <id> --exit-status`), never `gh pr checks --watch`.
- Model policy: DeepSeek `deepseek/deepseek-v4-flash-0731` default, `openai/gpt-4o-mini` alternate; NEVER an OpenRouter Anthropic route for streamed tool calls (F-21).
- Credential protocol: keychain → 0600 file under the throwaway config dir, trap-deleted, disclosed to the owner BEFORE launch; umask scoped to credential extraction ONLY.
- Keyless probes run in a mirrored app dir excluding `.env*` (Vite `loadEnv` ignores `envDir`).
- Everything the model produces is untrusted: no model-controlled string reaches `innerHTML`, an `href`/`src`, `window.open` or an iframe without the existing guards (`isSafeUrl`, `isRenderableLink`, the remote transport's origin/source/nonce pins).
- IVP anti-vacuity: probes pierce shadow DOM (F-19), are RUN not spec'd, and demonstrate they CAN fail before their green is trusted.

---

## Tasks

### Task 1: F-20 — provider-valid projections for `kai_artifact` and `kai_embed` (insider, TDD)

**Files:**
- Modify: `packages/ui/src/schemas/tool-defs.ts` (projection + error text)
- Test: `packages/ui/src/schemas/tool-defs.test.ts`

**Interfaces:**
- Consumes: `project()` (tool-defs.ts:272), `checkProviderSubset`, `OPENAI_STRICT`/`ANTHROPIC_STRICT` (provider-subsets.ts).
- Produces: non-strict `openai`/`anthropic` projections whose root carries `type: "object"` and NO `anyOf`/`allOf`/`oneOf`/`not`/`enum`/`const` key, with the relaxed constraint restated in the tool DESCRIPTION and a one-time `console.warn` naming the relaxation. `jsonschema` projections stay byte-faithful to the authored schema. Strict mode unchanged (still throws for these cards).

- [ ] **Step 1: Write the failing tests** (append to `tool-defs.test.ts`)

```ts
describe('cardTools: the non-strict projection survives the providers (F-20)', () => {
  const ROOT_COMBINATORS = ['anyOf', 'allOf', 'oneOf', 'not'] as const;

  it('projects kai_artifact for openai non-strict with type:object at the root and no root combinator', () => {
    const [artifact] = cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' }) as OpenAIToolDef[];
    expect(artifact.function.parameters.type).toBe('object');
    for (const k of ROOT_COMBINATORS) expect(artifact.function.parameters).not.toHaveProperty(k);
  });

  it('projects kai_embed for anthropic non-strict the same way (the derived-prediction case, now pinned)', () => {
    const [embed] = cardTools({ embed: cardSchemas.embed }, { provider: 'anthropic' }) as AnthropicToolDef[];
    expect(embed.input_schema.type).toBe('object');
    for (const k of ROOT_COMBINATORS) expect(embed.input_schema).not.toHaveProperty(k);
  });

  it('restates the dropped constraint in the description the model reads', () => {
    const [artifact] = cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' }) as OpenAIToolDef[];
    expect(artifact.function.description).toMatch(/src|files/);
    const [embed] = cardTools({ embed: cardSchemas.embed }, { provider: 'anthropic' }) as AnthropicToolDef[];
    expect(embed.description).toMatch(/url/);
  });

  it('warns loudly, once per call, naming the card and the relaxed constraint', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('kai_artifact'));
    warn.mockRestore();
  });

  it('keeps the jsonschema projection byte-faithful: the root combinator survives there', () => {
    const [artifact] = cardTools({ artifact: cardSchemas.artifact }, { provider: 'jsonschema' }) as JsonSchemaToolDef[];
    expect(artifact.schema).toHaveProperty('anyOf');
  });

  it('never mutates the authored schema — registry.validate semantics are untouched', () => {
    const before = JSON.stringify(cardSchemas.artifact);
    cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' });
    expect(JSON.stringify(cardSchemas.artifact)).toBe(before);
  });

  it('guards EVERY built-in: no root combinator reaches an openai non-strict tool array', () => {
    for (const def of cardTools({ provider: 'openai' }) as OpenAIToolDef[]) {
      for (const k of ROOT_COMBINATORS) expect(def.function.parameters).not.toHaveProperty(k);
    }
  });
});
```

Also update the existing assertion at tool-defs.test.ts:159 ("is EXACTLY the authored schema minus $schema, $id and x-*") to scope that claim to the `jsonschema` provider, with a comment naming F-20.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run src/schemas/tool-defs.test.ts`
Expected: the new cases FAIL (root `anyOf`/`allOf` present today); the updated :159 case fails until rescoped.

- [ ] **Step 3: Implement** in `tool-defs.ts`

Add beside the projection:

```ts
/**
 * Root combinators the two largest providers refuse on a tool schema's root node
 * (measured: OpenAI and Anthropic 400 before the model runs — findings F-20;
 * DeepSeek's OpenAI-compatible route requires the same workaround). The AUTHORED
 * schemas keep them — card validation keeps every constraint. Only the WIRE
 * projection relaxes, loudly: the constraint is restated in the description the
 * model reads, a console.warn names the relaxation, and a violating envelope
 * still fails registry.validate() at render time with a hard diagnostic.
 */
const ROOT_RELAXATIONS: Readonly<Record<string, string>> = {
  artifact:
    'Provide `src` (a preview URL) or `files` — at least one. An envelope with neither is rejected.',
  embed:
    "For provider 'generic', include `url`. For 'youtube'/'vimeo', include `id` or `url`.",
};

/** Strip a banned combinator key from the projected ROOT node only (nested
 *  combinators are accepted by every provider measured and stay). */
function relaxRootCombinators(parameters: Record<string, unknown>, cardType: string): void {
  const note = ROOT_RELAXATIONS[cardType];
  const banned = (['anyOf', 'allOf', 'oneOf', 'not', 'enum', 'const'] as const).filter(
    (k) => k in parameters,
  );
  if (banned.length === 0) return;
  for (const k of banned) delete parameters[k];
  if (note) parameters.description = `${String(parameters.description ?? '')} ${note}`.trim();
  // eslint-disable-next-line no-console
  console.warn(
    `[kai-card-tools] relaxed root ${banned.join('/')} on the projected '${cardType}' tool schema ` +
      `for this provider (it would be refused with HTTP 400); the constraint now lives in the ` +
      `description and is still enforced by card validation.`,
  );
}
```

Call it in the `cardTools` loop for `openai`/`anthropic` when `subset === null` (non-strict only — strict already refuses these cards with the full subset check), on the projected parameters BEFORE envelope assembly. Fix the remediation text at `tool-defs.ts:228` to stop prescribing the failing path:

```
'Fix: drop `strict: true`. Non-strict mode projects a provider-valid schema (root combinators are relaxed with the constraint restated in the description and still enforced by card validation). Rewriting a built-in card schema to fit a strict subset would change what a valid card IS, which is a card-contract change, not a projection setting.',
```

Also update the file-header paragraph (lines 23–32) that calls non-strict "the only working mode" — after this task that sentence is false in the other direction.

- [ ] **Step 4: Run to verify pass** — the new cases PASS; then the full schema suite: `pnpm --filter @kitn.ai/ui exec vitest run src/schemas/`
- [ ] **Step 5: Commit** — `feat(schemas): provider-valid non-strict card-tool projections (F-20)`

### Task 2: F-23 — the `require` narrowing option on `cardTools` (insider, TDD)

**Files:**
- Modify: `packages/ui/src/schemas/tool-defs.ts`
- Test: `packages/ui/src/schemas/tool-defs.test.ts`

**Interfaces:**
- Produces: `CardToolOptions.require?: Readonly<Record<string, readonly CardRequireRule[]>>` where

```ts
export interface CardRequireRule {
  /** Dot-path from the envelope-data root to a schema node, e.g. 'files'. */
  readonly path: string;
  /** Property names to require. On an ARRAY node this narrows `items.required`; on an object node, the node's own `required`. */
  readonly required?: readonly string[];
  /** Sets `minItems` (array nodes only). */
  readonly minItems?: number;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('cardTools: the require option narrows the DERIVED tool schema (F-23)', () => {
  it('joins a property into the array items\' required and sets minItems', () => {
    const [artifact] = cardTools({ artifact: cardSchemas.artifact }, {
      provider: 'openai',
      require: { artifact: [{ path: 'files', required: ['code'], minItems: 1 }] },
    }) as OpenAIToolDef[];
    const files = (artifact.function.parameters as any).properties.files;
    expect(files.minItems).toBe(1);
    expect(files.items.required).toContain('code');
    expect(files.items.required).toContain('path'); // the authored requirement survives
  });

  it('narrows a top-level object node when the path names one', () => {
    const [form] = cardTools({ form: cardSchemas.form }, {
      provider: 'anthropic',
      require: { form: [{ path: '', required: ['someTopLevelField'] }] },
    }) as AnthropicToolDef[];
    expect((form.input_schema as any).required).toContain('someTopLevelField');
  });

  it('throws naming the card and the path for an unknown dot-path', () => {
    expect(() =>
      cardTools({ artifact: cardSchemas.artifact }, {
        provider: 'openai',
        require: { artifact: [{ path: 'nope.deep', required: ['x'] }] },
      }),
    ).toThrow(/artifact.*nope\.deep/);
  });

  it('never mutates the authored schema and applies to every provider including jsonschema', () => {
    const before = JSON.stringify(cardSchemas.artifact);
    const [js] = cardTools({ artifact: cardSchemas.artifact }, {
      provider: 'jsonschema',
      require: { artifact: [{ path: 'files', required: ['code'], minItems: 1 }] },
    }) as JsonSchemaToolDef[];
    expect((js.schema as any).properties.files.minItems).toBe(1);
    expect(JSON.stringify(cardSchemas.artifact)).toBe(before);
  });

  it('composes with the F-20 relaxation (require on artifact, openai non-strict)', () => {
    const [artifact] = cardTools({ artifact: cardSchemas.artifact }, {
      provider: 'openai',
      require: { artifact: [{ path: 'files', required: ['code'], minItems: 1 }] },
    }) as OpenAIToolDef[];
    expect((artifact.function.parameters as any).properties.files.minItems).toBe(1);
    expect(artifact.function.parameters).not.toHaveProperty('anyOf');
  });
});
```

- [ ] **Step 2: Run to verify they fail** (`vitest run src/schemas/tool-defs.test.ts` — TS error: no `require` option).
- [ ] **Step 3: Implement**: add `CardRequireRule`, the `require` field on `CardToolOptions`, and a `applyRequire(parameters, cardType, rules)` helper run after `project()`/`relaxRootCombinators()` for every provider. Resolve each dot-path segment through `properties` (`''` = root); array node → `required` merges into `node.items.required`, `minItems` onto the node; object node → `required` merges onto the node. Unknown path → `throw new TypeError(\`cardTools: require path '${path}' does not resolve in the '${cardType}' schema\`)`. Merge, never replace, existing `required`.
- [ ] **Step 4: Run to verify pass** + full `src/schemas/` suite green.
- [ ] **Step 5: Commit** — `feat(schemas): cardTools require option for derived-schema narrowing (F-23)`

### Task 3: F-10 — the emitted route survives a bare GET (insider, TDD)

**Files:**
- Modify: `packages/ui/src/agent-tooling/route-emit.ts` (`CHAT_REQUEST_BODY_DECL`)
- Modify: every fragment under `packages/ui/src/agent-tooling/integrations/` that calls `readChatRequest(request)` — derive the list with `rg -l 'readChatRequest\(request\)' packages/ui/src/agent-tooling/integrations/` (nine today; never hand-type it)
- Modify: `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` (`viteMiddlewareAdapter`, the `chatHandler` call at :5656)
- Modify: `scripts/verify-scaffold-compiles.mjs` (structural checks)
- Test: `packages/ui/tests/agent-tooling/route-emit-guards.test.ts` (new)

**Interfaces:**
- Produces: preamble symbols `ChatRequestError`, `toChatErrorResponse` (added to `CHAT_REQUEST_BODY_DECL`; `symbols` derives them — verify the `PREAMBLE_DECLARATION` regex matches `class ChatRequestError`).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { chatRoutePreamble } from '../../src/agent-tooling/route-emit';

describe('chatRoutePreamble: the route survives a bare GET (F-10)', () => {
  const decl = chatRoutePreamble('const x = readChatRequest(request);').decl.join('\n');

  it('readChatRequest refuses non-POST with a 405-class error', () => {
    expect(decl).toMatch(/method\s*!==\s*'POST'/);
    expect(decl).toMatch(/405/);
  });
  it('readChatRequest maps an unparseable body to a 400-class error, not a thrown SyntaxError', () => {
    expect(decl).toMatch(/try\s*\{[\s\S]*request\.json\(\)[\s\S]*\}\s*catch/);
    expect(decl).toMatch(/400/);
  });
  it('readChatRequest refuses a body without a messages array (400)', () => {
    expect(decl).toMatch(/Array\.isArray[\s\S]*messages/);
  });
  it('exposes toChatErrorResponse so every fragment maps the error to a Response', () => {
    expect(decl).toMatch(/function toChatErrorResponse/);
  });
});
```

- [ ] **Step 2: Run to verify fail** (`pnpm --filter @kitn.ai/ui exec vitest run tests/agent-tooling/route-emit-guards.test.ts`).
- [ ] **Step 3: Implement the preamble** — replace the `readChatRequest` body in `CHAT_REQUEST_BODY_DECL` with:

```ts
`class ChatRequestError extends Error {`,
`  constructor(readonly status: number, message: string) { super(message); }`,
`}`,
``,
`/** Narrow the JSON body once, at the edge. A bare GET, a malformed body, or a`,
` *  missing messages array is a ChatRequestError with a status — NEVER an`,
` *  unhandled SyntaxError: one killed a Vite dev server (findings F-10). */`,
`async function readChatRequest(request: Request): Promise<ChatRequestBody> {`,
`  if (request.method !== 'POST') {`,
`    throw new ChatRequestError(405, \`Method \${request.method} not allowed — POST /api/chat.\`);`,
`  }`,
`  let parsed: unknown;`,
`  try { parsed = await request.json(); } catch {`,
`    throw new ChatRequestError(400, 'Request body is not valid JSON.');`,
`  }`,
`  const body = parsed as ChatRequestBody;`,
`  if (!Array.isArray(body?.messages)) {`,
`    throw new ChatRequestError(400, 'Request body must carry a messages array.');`,
`  }`,
`  return body;`,
`}`,
``,
`/** Map a guard rejection to the Response its status demands; rethrow anything`,
` *  else — an unexpected error should be loud, not laundered into a 400. */`,
`function toChatErrorResponse(error: unknown): Response {`,
`  if (error instanceof ChatRequestError) return Response.json({ error: error.message }, { status: error.status });`,
`  throw error;`,
`}`,
```

- [ ] **Step 4: Wrap the nine fragments** — each `const { model, messages, tools } = await readChatRequest(request);` becomes:

```ts
let body: ChatRequestBody;
try {
  body = await readChatRequest(request);
} catch (error) {
  return toChatErrorResponse(error);
}
const { model, messages, tools } = body;
```

(adapt destructured names per fragment; fragments that destructure fewer fields keep their subset).

- [ ] **Step 5: Guard the Vite middleware** — in `viteMiddlewareAdapter`, wrap the `await chatHandler(...)` call:

```ts
`        let response: Response;`,
`        try {`,
`          response = await chatHandler(`,
`            new Request('http://localhost/api/chat', {`,
`              method: 'POST',`,
`              headers: { 'Content-Type': 'application/json' },`,
`              body,`,
`            }),`,
`          );`,
`        } catch {`,
`          // An unhandled rejection in an async connect middleware EXITS Node 22 —`,
`          // this catch is the guard findings F-10 exists for.`,
`          response = Response.json({ error: 'Chat handler failed.' }, { status: 500 });`,
`        }`,
```

- [ ] **Step 6: Extend the structural checks** in `scripts/verify-scaffold-compiles.mjs`: for every emitted route, assert the emitted `server/chat.ts` contains `toChatErrorResponse` and `405`; for the react/vue (Vite) axis, assert the emitted vite block's middleware wraps `chatHandler` in `try`/`catch`. Zero matches on any check is a hard failure, never a skip.
- [ ] **Step 7: Run the gates** — `pnpm --filter @kitn.ai/ui exec vitest run tests/agent-tooling/route-emit-guards.test.ts` PASS; `pnpm --filter @kitn.ai/ui run verify:scaffold` green (it prints the axes and cell counts it ran — read them); the `unit` + `emitted` vitest projects green.
- [ ] **Step 8: Commit** — `fix(agent-tooling): emitted chat routes survive bare GET / malformed bodies (F-10)`

### Task 4: §0 wave gate + merge (insider)

- [ ] Full local gate: `npm run build` inside `packages/ui` → `pnpm --filter @kitn.ai/ui exec vitest run --project=unit` → `--project=emitted` → `pnpm --filter @kitn.ai/ui run verify:scaffold` → `pnpm --filter @kitn.ai/ui run verify:consumer` → `pnpm --filter @kitn.ai/ui run lint:silent-drops` → `pnpm --filter @kitn.ai/ui run verify:fresh`.
- [ ] Regenerate derived artifacts the wave touches (`pnpm --filter @kitn.ai/ui run build:api` inside the package) and commit them — never run `gen-llms.mjs` standalone.
- [ ] Push the branch; watch the ACTUAL run id for the head sha; squash-merge on green (CI `test` job is the only gate).
- [ ] Ledger entry: wave outcomes, test counts, CI run id.

### Task 5: Harness rebuild (insider)

Mirror rung-4 plan Task 1 verbatim (real build → `verify:fresh` → `npm pack`; sandbox OUTSIDE the repo at `<scratchpad>/rung5-cleanroom/` with app dir + SIBLING ops dir; install tarball + `react`/`react-dom`; strip the installed copy per the rung-3 conditions; `.mcp.json` at the tarball's own bin; throwaway `CLAUDE_CONFIG_DIR`; launcher from the rung-3 base with scoped-umask + trap-deleted credential + planted-defect-verified post-run assertions, reconstructed from `.superpowers/sdd/2026-08-20-rung-4-builder/task-1-report.md`; 1-turn keyless dry run). Rung-5 deltas:

- [ ] Post-strip positive controls name THIS rung's subjects: MCP `tools/list` + `component_reference` for `kai-remote` AND `kai-cards`; resolution probes add `@kitn.ai/ui/provider` and `@kitn.ai/ui/elements/remote` (the opt-in path — its discoverability is finding class 2, so record whether the strip leaves any path to it).
- [ ] The app needs TWO dev servers (app + provider origin); the keyless mirror must exclude `.env*` from BOTH (one mirrored tree, two vite configs).

### Task 6: Builder task prompt (insider)

- [ ] Author to the ops dir; record sha256. Verbatim draft:

> Build a small web app: an internal ops console where an AI assistant proposes consequential actions and the operator approves or rejects them in the conversation. When the operator asks for something risky (for example "deploy the payments service to production"), the assistant proposes it as an interactive card right in the chat that the operator answers with a click — approve/reject style decisions, occasional multiple-choice, and now and then a short form for parameters (region, ticket number). Rejected or dismissed proposals can be brought back with an undo. Multi-step operations show a live checklist that ticks along in the conversation. The assistant also maintains a live "run board" — deployment steps, health pings, a rollback button — which is rendered by a small page YOUR app serves from a SECOND local server on a different port (a different origin), framed inside the console's right-hand panel; clicking rollback on the board must reach the chat app and be confirmed there. React + TypeScript + Vite. Use the `@kitn.ai/ui` package already installed in this directory — it ships web components for AI chat UIs and React bindings. Its `kai` MCP server is configured for you: use it to learn what the package provides and how to use it. Replies should come from a local dev endpoint that streams a mocked response; the package ships facilities for mocking — discover them, including how an assistant reply can carry interactive cards and how a card served by another origin can talk back. Do not fetch any remote docs or read the package's source on npm/GitHub; work from the MCP and what is installed. When done: the app must build (`npm run build`) and run (`npm run dev`), and write NOTES.md recording every question you could not answer from the MCP and where you had to guess.

- [ ] Bias statement, recorded with the prompt: product requirements only (approval cards, undo, live checklist, second-origin board, rollback round-trip) and NO kit vocabulary — not `cardTools`, `kai-cards`, `kai-remote`, `cardTypes`, `CardPolicy`, `createCardBridge`, or any tag/import path. The two NEW nudges assert the kit has answers ("how an assistant reply can carry interactive cards", "how a card served by another origin can talk back") without naming either integration path — which path the builder finds is finding classes 1–2. Mock-facilities hint carried from rungs 1–4.

### Task 7: Builder run (clean room, owner's seat)

- [ ] Credential disclosure to the owner BEFORE launch.
- [ ] Launch per the launcher: owner's subscription seat, `--setting-sources ""`, `--disable-slash-commands`, `--max-turns 200`, rung-3 allowed-tools list + the four kai MCP tools, WebFetch/WebSearch hard-disallowed.
- [ ] After exit: confirm credential trap-deleted; transcript survived and is copied to the ops dir; record turns / wall time / cost / session id / prompt sha256.

### Task 8: Comparer / analyst (independent, read-only)

- [ ] Research dir `docs/superpowers/research/<run-date>-rung-5-front-door/` mirroring rung-4's layout: `app/` snapshot (no node_modules/lockfile/dist), `NOTES.md` verbatim, `builder-run.md` with the per-call MCP table, `findings.md`.
- [ ] Classify every divergence (teaching gap · builder error · acceptable variation); check strip artifacts against the removed README/llms before filing product gaps.
- [ ] Check ALL six expected finding classes from the spec § Expected finding classes, each answered with evidence, including the two-surface seam question (element path vs `Chat.cardTypes`/`CardRenderer` path) and the docs-rich vs front-door-silent counts.
- [ ] Re-check rung-4 residuals newly exercisable: F-22's error channels under a malformed FORM call; F-03 policy placement at card scale; F-24's cluster if real-mode turns exist.
- [ ] Verify the app builds and runs independently (keyless mirror).
- [ ] Deliverable: the REMOTE-CARD SEAM inventory — every line bridging model → card envelope → thread → board → wire-back (policy routing, board updates, action round-trip, origin plumbing) — the compile-to-WC builder spec's input, as rung 4's artifact-seam inventory was.

### Task 9: Insider completion (task-worker, gap-labeled)

- [ ] Land the app at `examples/apps/ops-console/` per corpus conventions (package.json `workspace:*`, tsconfig trio, `.env.example` unprefixed-key comment; port: read every vite.config under `examples/`, pick the next TWO free ports, never trust a number in prose).
- [ ] Real mode: the route carries `cardTools(...)` with F-23's `require` on the form fields, DeepSeek default + gpt-4o-mini alternate, F-21 routes avoided; mock kept verbatim + `X-Kai-Mock`; the F-10 guard trio comes free from the template.
- [ ] Every insider change labeled with the teaching gap that made it necessary; the builder's composition choices STAND — a hand-built board or an invented card bridge is a HEADLINE finding, not something to rewrite.
- [ ] README provenance: builder prompt + full conversation verbatim + insider briefs (owner policy).
- [ ] `verify:starters` green with the app enrolled in the derived roster.

### Task 10: Hardened IVP (independent verifier, real Chromium, keyless mirror)

- [ ] Approve flow: submit a risky request; a confirm card renders IN THE THREAD (shadow-DOM-piercing assertion on the card's real DOM); clicking Approve fires the next turn whose reply references the decision.
- [ ] Form flow: a form card renders real `x-kai-*` widgets; submitting delivers the values to the model (assert the outgoing request body captured bytes-first).
- [ ] Dismiss → Undo: the card collapses to its stub; Undo restores it live.
- [ ] Remote board: the board renders INSIDE the framed document (frame-scoped locator on board-specific markup, not just an iframe's existence); a rollback click on the BOARD lands as a routed event in the host app (assert the confirmation appears in the thread); measured auto-resize when the board grows; theme toggle re-themes the framed board (measured background).
- [ ] Hostile fixtures: a model-supplied `javascript:`-scheme URL is blocked with a VISIBLE diagnostic; a card payload carrying a pollution key is rejected loudly; a corrupted tool-call turn produces a visible failure on a channel that survives tool-panel suppression (F-22).
- [ ] Forced endpoint failure mid-generation: loud error, no silent hang, no empty bubble.
- [ ] Streaming sampled as strictly-increasing growth; zero uncaught console/page errors across scenarios (a `[kai-*] blocked` warn passes only when a scenario deliberately provoked it).
- [ ] Evidence under `.superpowers/sdd/2026-08-21-rung-5-remote-cards/`.

### Task 11: CI + merge + owner validation

- [ ] Commit; open the PR (spec + plan + research + app, rung-3 shape); watch the run id for the head sha; squash on green.
- [ ] Owner live eyeball BEFORE merge (standing show-first rule): mock flow + at least one real DeepSeek turn producing a card AND a live board round-trip (key in `.env`); record in the ledger.
- [ ] Findings → fix waves land INSIDE this rung as additional tasks appended here (rung-4 pattern), each TDD, each reviewed.

### Task 12: Findings handoff (deliverable only)

- [ ] Update the ladder memory + write the next handoff: rung 5 outcome, seam-inventory pointer, ladder exit-condition status (which families remain undriven — check the parent spec's condition before declaring the ladder done), builder-discussion candidacy. No implementation.

## Verification

Per guard #1: any measurement against built artifacts runs `verify:fresh` first. The merge gate is CI's required `test` job. Tasks 1–3 also require the `emitted` project (they change emitted code).

<!-- gate-list: partial -- local spot-checks; the required test job is the gate -->
```bash
pnpm --filter @kitn.ai/ui run verify:starters
pnpm --filter @kitn.ai/ui run lint:catalog-drift
```

## Run ledger

(Appended during execution — task outcomes, fix rounds, run metadata, owner validation.)
