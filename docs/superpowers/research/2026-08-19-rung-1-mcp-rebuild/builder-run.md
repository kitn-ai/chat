# Builder run record — the MCP-only rebuild

Run metadata, and the MCP tool-call sequence extracted from the builder's transcript. Method
and contamination controls are in the plan of record,
[`docs/superpowers/plans/2026-08-19-rung-1-support-widget.md`](../../plans/2026-08-19-rung-1-support-widget.md)
§ "The MCP-only rebuild".

## Run metadata

| | |
|---|---|
| Outcome | success (exit 0) |
| Turns | 79 |
| Wall clock | 830 s |
| Cost | $5.60 |
| Model | opus (matches the reference builder, so the seat is the variable, not the model) |
| Claude Code CLI | 2.1.235 |
| Task-prompt sha256 | `ed9e84ef79a4982e81e30c0608bad785c614ab5e284fa7a87d4def15f0c46773` |
| Session id | `8187c2dd-eae2-4996-9772-4b0f09814e3d` |
| Transcript window | `2026-08-19T11:56:50.083Z` → `2026-08-19T12:10:40.496Z` (830 s — corroborates the reported duration independently) |
| Transcript | 342 JSONL lines, 285 timestamped records, 78 tool calls |
| Kit under test | `@kitn.ai/ui` 0.25.2, installed from a local `npm pack` tarball, README/llms/src stripped |

## MCP tool calls — the complete sequence (7 of 78 tool calls)

Extracted from the transcript by matching `tool_use` blocks whose name starts with `mcp__kai`.
The builder loaded the four `kai` tools in one `ToolSearch` (`select:mcp__kai__component_reference,
mcp__kai__scaffold,mcp__kai__debug,mcp__kai__theme`) and then called them seven times.

| # | Transcript line | Tool | Arguments | Result size | What it delivered |
|---|---|---|---|---|---|
| 1 | 17 | `component_reference` | `{ name: "list" }` | 1,970 ch | The 80-element index, plus the pointers to `invariants` and `recipes`. |
| 2 | 22 | `component_reference` | `{ name: "kai-chat" }` | 31,837 ch | The one that did the work: registration import, `KaiChatElement`, all 9 event `detail` shapes, methods, slots, parts, 7 invariants, 2 recipes. |
| 3 | 24 | `scaffold` | `{ useCase: "support-widget", integration: "mock", placement: "docked-widget", framework: "html" }` | 12,498 ch | The `index.html` + `src/main.ts` skeleton the rebuild follows. |
| 4 | 33 | `debug` | `{ symptom: "…run createMockResponder() server-side and serve its SSE frames from /api/chat…" }` | 442 ch | **"No known failure pattern matched."** Fell back to pointing at `node_modules/@kitn.ai/ui/llms-full.txt`. |
| 5 | 61 | `component_reference` | `{ name: "recipes" }` | 3,752 ch | Long-form wiring notes for the 2 recipes. |
| 6 | 63 | `theme` | `{ brand: "#0f766e", mode: "both" }` | 2,143 ch | The `--kai-*` brand block in `src/styles.css`. |
| 7 | 306 | `component_reference` | `{ name: "kai-prompt-dock" }` | 9,763 ch | Called at the END, to check the NOTES gap-9 claim that no launcher element exists. Confirmed it: a composer tray, not a page dock. |

Zero MCP calls returned an error. No wrong-argument-key call was made, so candidate A
(`additionalProperties: false` declared and not enforced) was not exercised in this run.

## Watched-pattern coverage in MCP output

Counts of each watched one-liner class in the raw text each `kai` tool returned.

| Pattern | `component_reference kai-chat` | `scaffold` | `component_reference recipes` | `kai-prompt-dock` |
|---|---|---|---|---|
| `@kitn.ai/ui/elements` | 3 | 9 | 0 | 3 |
| `KaiChatElement` | 1 | 2 | 0 | 0 |
| `kai-submit` | 4 | 2 | 2 | 0 |
| `detail.value` | 0 | 1 | 2 | 0 |
| `createMockResponder` | 0 | 4 | 0 | 0 |
| `whenDefined` | 2 | 1 | 1 | 2 |
| `StreamSource` | 0 | 0 | 0 | 0 |
| `abort(` semantics | 0 | 1 (in a comment, overstated — see findings §3 G-14) | 0 | 0 |

## Reads into `node_modules/@kitn.ai/ui` beyond `package.json`

The plan asked whether the builder learned any watched fact by grepping `dist/` rather than from
the MCP. It read `dist/` heavily — eleven calls — but the audit below shows the reads were
**verification of MCP-supplied facts and of things the MCP never says**, not substitutes for the
four watched one-liners.

| Transcript line | What it read | Why it mattered |
|---|---|---|
| 37 | `ls dist`, `ls dist/state/`, `ls *.txt` | Discovered `llms-full.txt` is absent (the stripping artifact behind NOTES gap 1). |
| 42 | `dist/state/mock.d.ts` | `createMockResponder` options — `replies`, `delayMs`, `chunkSize`, `announce`. |
| 44 | `dist/state/index.d.ts`, `dist/wire/index.d.ts` | Export surfaces of both subpaths. |
| 51 | `dist/wire/read.d.ts`, `dist/wire/sse.d.ts` | **`StreamSource = Response \| ReadableStream \| AsyncIterable<…>`** — NOTES gap 3. Not in any MCP output, not in README/llms. |
| 53 | `head dist/state.js` + grep for `document.`/`window.` | Evidence for NOTES gap 1's guess that `state` is Node-safe. |
| 57, 88 | `node -e` importing `createMockResponder` / `DEFAULT_MOCK_REPLIES` and dumping frames | Verified the frames are pre-framed SSE with `[DONE]` — NOTES gap 2. |
| 72 | `dist/wire/encode.d.ts` | `toOpenAIMessages` signature. |
| **97** | **`Grep KaiChatElement dist/elements.d.ts`** | The one watched-class read. It CONFIRMED a name `component_reference` (line 22) and `scaffold` (line 24) had already supplied — the grep is at call 24 of 78, well after both. Not a case of learning a watched fact from `dist/`. |

The builder never read `src/` (it was stripped) and never fetched a remote doc.

## Incidental: toolchain the rebuild proved

`vite` and `typescript` were not installed in the sandbox; the builder installed them from the
live registry and got **Vite 8.2.1 / TypeScript 7.0.2 / @types/node 26**. The reference app pins
Vite 6 / TS 5.7. So the rebuild is incidental evidence that `@kitn.ai/ui` 0.25.2 resolves,
typechecks and bundles under a toolchain two majors ahead of anything CI covers. Worth a guard,
not worth a panic.
