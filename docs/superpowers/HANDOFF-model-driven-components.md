# HANDOFF: model-driven components epic

**Session end: 2026-08-10.** Sub-projects **A** and **C** are COMPLETE and verified.
**B** and **D** remain, then the `create-kai` CLI.

Full detail lives in the auto-memory `message-parts-migration` (read it first) and in
the two SDD ledgers at `.superpowers/sdd/*/progress.md` (gitignored, on disk in the
worktree only).

## Where the work is

- **Worktree:** `.claude/worktrees/message-parts`
- **Branch:** `feat/message-parts`. **71 commits, 275 files, +25634/-2747 vs origin/main. NOT PUSHED.**
- Based on `docs/create-kai-spec-v2` (pushed, 4 commits: the create-kai v2 spec, the
  OpenRouter spike, the message-parts spec, the message-parts plan).

## Verified state (re-run on a clean tree, typecheck BEFORE any build)

```
typecheck 4/4 · unit 186 files / 1736 tests
nx build ui -> git status EMPTY (true fixpoint)
scaffold compile harness 270/270
openrouter-spike 4/4 · @openrouter/sdk removed from the repo
```

Run the typecheck on a clean tree with NO preceding build. A stale generated artifact
once made the committed state fail while a dirty post-build tree passed.

## What shipped

**A, message parts.** `ChatMessage.content: string` replaced by an ordered
`parts: MessagePart[]` union (`text` | `reasoning` | `tool` | `card` | `source` |
`file`), each carrying an optional `raw: RawOrigin`. Clean break, no shim.
`raw.payload` is the round-trip channel; `signature` is informational. Extension
happens at the CARD layer via the existing registry, not by adding part variants.
Spec: `docs/superpowers/specs/2026-08-07-message-parts-data-model-design.md`.

**C, the wire adapter.** New `@kitn.ai/ui/wire` entry: `readOpenAIStream`,
`readAnthropicStream`, `readModelStream`, `consumeModelStream`, `WireError`,
`openaiChatFormat`, `anthropicMessagesFormat`, `toOpenAIMessages`,
`toAnthropicMessages`, plus SSE framing and sink helpers. Formats are pluggable
values, not a flag. The kit parses the stream; the consumer owns the transport. No
provider SDK dependency, ever.
Spec: `docs/superpowers/specs/2026-08-09-wire-adapter-design.md`.

**The live proof.** Real `~deepseek/deepseek-v4-flash-latest` through the spike, driven
by Playwright: text streamed, `get_weather` reached `output-available` with the panel
rendering Completed + Input + JSON Output + Call ID, reasoning streamed, and it ran
TWO ROUNDS so the tool result round-tripped back to the provider and the final answer
quoted its numbers. Zero console errors. That loop was impossible before this epic.

## Do FIRST on resume

1. **Rob reviews `feat/message-parts`, then push and open the PR.** Do not push without
   him. `git log origin/main..HEAD` in the worktree.
2. **Cherry-pick the `sideEffects` fix onto `main` as a 0.19.1 patch.** Commit
   `71da992` is deliberately self-contained. It fixes a bug that is LIVE on npm today:
   `dist/register-impl-*.js` was not covered by `sideEffects`, so a consumer's bundler
   strips the `customElements.define` calls and every plain-HTML consumer gets a blank
   page with a silent console. **The trigger is Vite 8 / Rolldown specifically** (Vite 6
   and 7 keep the chunk), which is why the June campaign passed and this failed: the
   ecosystem moved, not the kit. Every NEW consumer hits it.
3. Then **sub-project B**, below.

## Sub-project B, the emit contract (NEXT)

The kit already BUILDS ten card JSON Schemas into `dist/schemas/` (`card-envelope`,
`card-event`, `choice`, `confirm`, `embed`, `form`, `form.result`, `link`, `tasks`,
`tasks.result`) and does not export them. There is no `./schemas` entry in the
`exports` map, so `require.resolve('@kitn.ai/ui/schemas/confirm.schema.json')` throws
`ERR_PACKAGE_PATH_NOT_EXPORTED`.

That matters because **a card schema is exactly the shape of a tool definition**. Hand
a model our `confirm` schema as a tool and it emits a valid envelope by construction,
which our dispatcher renders. No glue, no prompt engineering.

B is: export the schemas, define custom-schema registration so a consumer can register
their OWN design-system components the same way, and document schemas-as-tool-
definitions. It is the most differentiating piece and most of it already exists.

## Sub-project D, after B

Artifact-over-time (the v0 / Lovable loop) and the interactive card round-trip
(`CardResolution`, already designed but never driven by a live model). Also the
citation row: `source` parts land correctly today but `message.tsx` matches them to
`null` pending D.

## Known-unproven, shipped deliberately. Say these in the PR body.

- **Anthropic was never driven LIVE.** Fixtures only, though 5 of 7 are genuine
  OpenRouter-Anthropic captures swept at five byte sizes with round-trip fidelity
  asserted. The two Criticals the final review found are exactly what a live two-round
  Anthropic run would have caught.
- **Storybook smoke not run.** C touches one component (the empty-reasoning guard in
  `message.tsx`), already covered by `thread.test.tsx`.
- The scaffold harness covers 270 cells of a much larger matrix. `placement` varies
  only an inline CSS string, so the remaining multiplier recompiles identical types.

## Hard-won lessons that WILL recur

**Code that gets COPIED has no compiler watching it.** Emitted scaffolder templates,
docs snippets, and hand-written prose inside `gen-*.mjs` scripts produced NINE real
defects across this epic. Regeneration faithfully reproduces stale prose, so the
zero-drift gate can never catch them. Reviews must GENERATE or COMPILE the artifact.

**Six tests on C passed while covering nothing.** The byte-boundary sweep was all-ASCII
so a broken decoder stayed green. The round-trip byte-identity test could not tell echo
from rebuild, because for an untouched part they produce identical bytes. Two scaffolder
assertions were satisfied by header prose rather than the emitted import. **Watch every
guard FAIL before trusting it.** Three of the six were caught by implementers doing
exactly that.

**Verify gates against the COMMITTED state**, never a dirty post-build tree.

**npm silently serves a CACHED STALE tarball** on reinstall under the same filename.
Use a unique name per build or a consumer proof verifies the PREVIOUS build.

**A harness laxer than the templates it simulates will keep passing while consumers
fail.** The scaffold harness missed an unused import that broke `npm run build` in any
stock app, because it did not set `noUnusedLocals` the way every real template does.

## Two pre-existing bugs this epic uncovered

- **`@kitn.ai/ui/provider` never typechecked at all.** `vite.config.provider.ts`
  flattened `src/remote/*` to `dist/*.d.ts`, so declarations reached outside `dist`.
  Fixed here. Found only because a `dist/wire.d.ts` name collision made someone look.
- **`nextjs` and `tanstack-start` starters could not build at all**: `file:../../..`
  resolved to the monorepo root instead of `packages/ui`. Fixed here.

## Filed, non-blocking

A real tsc harness for emitted scaffolder TypeScript beyond the current 270 cells ·
`MessageActionBar` not exported · a message with no text parts copies `''` while still
toasting success · `./schemas/*` export (that is B) · running `/consumer-regression`
again with a uniquely-named tarball.
