# The rung-2 front-door build — comparer findings

Date: 2026-08-19. Comparer: an independent agent, read-only on the app and the kit.
Spec: [`docs/superpowers/specs/2026-08-19-rung-2-voice-assistant-design.md`](../../specs/2026-08-19-rung-2-voice-assistant-design.md).
Run metadata and the transcript-loss statement: [`builder-run.md`](builder-run.md).
The builder's own record: [`NOTES.md`](NOTES.md). The app as delivered: [`app/`](app/).

Unlike rung 1 there is **no insider reference app to diff against** — rung 2 is front-door-first
by design, so the comparison baseline is the spec's requirements, its four pre-named expected
findings, and the rung-1 findings (whose fixes this run partially re-measures). One rung-1-style
input is missing: **the transcript was lost to a harness defect** (`umask 177` in the launch
script — see builder-run.md), so no claim here cites a transcript line; every builder-behavior
claim is attributed to NOTES.md by item number, to the final result JSON, or to the app source by
file:line.

## Verdict in one paragraph

**The front door held.** A clean-room builder, from the stripped tarball and the four `kai` MCP
tools alone, composed all three voice elements plus `kai-thread`, `kai-status` and `kai-notice`
into a complete hands-free voice assistant — and it **builds and runs first try, zero fixes**
(both strict tsc projects green, `vite build` green, dev and preview servers both serve the
streaming mock endpoint; verified by the comparer, since the builder's own environment denied it
a shell). Every one of rung 1's four fixed one-liner classes held; rung 1's S1 (`abort()`
discarding its reason) is **confirmed fixed in the shipped 0.25.2** and the builder's error path
is visible twice over. **Zero builder errors were found** — every checkable guess in NOTES.md's
25 items checked out correct against the kit source. What the run cost was paid in guesses: 17
of the 25 NOTES items are teaching/doc gaps, and the bulk sit in exactly the hole rung 1 named —
the `@kitn.ai/ui/state` / `wire` lifecycle and the mock's server-side story, i.e. **rung-1
candidate D, re-measured and still open**. The genuinely new findings are the voice family's:
neither voice element exposes its audio (the pre-named tap gap, confirmed on BOTH sides — input
and output), `kai-voice-input` ships no `::part` and no support-detection surface while the kit
computes `isSupported` internally, and `kai-voice-output` has no failure signal when synthesis
never starts, forcing an invented 2.5 s watchdog.

---

## 1. The four pre-named expected findings

Named in the spec § "Expected findings" before the run, so hindsight can't claim them.

| # | Pre-named finding | Surfaced? | How |
|---|---|---|---|
| P-1 | Voice-output → visualizer audio tap gap (no `audioElement`/`stream` during TTS) | **YES — and doubled.** | The output side surfaced exactly as predicted: `main.ts:145-149` documents that `speechSynthesis` exposes no audio node and drives the speaking phase with synthetic `bands` (NOTES §16 records the MCP confirming `bands` is the sanctioned path). **The builder also surfaced the INPUT-side twin the spec did not name:** `kai-voice-input` opens its own `getUserMedia` stream and exposes no accessor, event or property that hands it out (NOTES §7), so the builder opens a *second* microphone capture purely for the visualizer (`main.ts:169-184`). Verified in kit source: `use-voice-recorder.ts` holds the stream in an internal signal the facade never surfaces. Two independent captures of one device works, but it is a workaround for a product gap on both halves of the voice family. |
| P-2 | The `voice` archetype teaches only `kai-chat` + `kai-voice-input`; does the builder discover `kai-voice-output` and the visualizer at all? | **Discovery SUCCEEDED — via `component_reference`, not the archetype.** | The archetype's under-teaching is confirmed in the tree (`agent-tooling/archetypes.ts:54`, `components: ['kai-chat', 'kai-voice-input']`), and NOTES never mentions the voice archetype supplying anything — but the app uses `kai-voice-output`, `kai-audio-visualizer`, `kai-status` and `kai-notice` correctly, and NOTES §§8–19 quote per-element `component_reference` facts for all of them. So the element index carried what the archetype didn't. The exact call path is unrecoverable (transcript lost). **Informative composition call:** the builder used **`kai-thread`, not `kai-chat`** — for a hands-free app with no composer, it decomposed to the keystone element rather than bending the preset. That is direct field evidence for the composition-first direction (kai-thread as keystone). |
| P-3 | Hand-rolled SpeechRecognition helpers duplicating what `kai-voice-input` ships | **YES — the detection half.** | The builder did NOT hand-roll recognition itself — `kai-voice-input` carried the whole STT path, which is the good half of this finding. But `voice-support.ts:23-44` hand-rolls **support detection** (`typeof globals.SpeechRecognition === 'function' || typeof globals.webkitSpeechRecognition === 'function'`), a fifth copy of the probe the tree already has four of — and the kit **computes this internally and never exposes it** (`use-speech-recognition`'s `isSupported`, consumed at `components/voice-input.tsx:53`, absent from the element facade). The prompt's "never fail silently" requirement is impossible to meet without this fact, so every consumer of `kai-voice-input` must re-derive it. Consolidation target confirmed, with a sharper fix than the spec guessed: expose support detection on the element (a static, a readonly prop, or an early `kai-unsupported` event), don't just deduplicate the starters. |
| P-4 | Browser-dependence: degrade loudly in unsupported browsers | **YES — surfaced and implemented thoroughly.** | `voice-support.ts` names each missing API and its cost in a human sentence (incl. the secure-context caveat and "Firefox does not"); `main.ts:223-231` puts the page in a `blocked` phase, disables the controls, and shows a red `kai-notice`; `main.ts:370-376` interprets `kai-audio-captured` as the unsupported-fallback signal (NOTES §8); even bootstrap failure lands on the page (`main.ts:445-454`). NOTES' final section names the Firefox path as "the single most important thing to eyeball". The requirement was in the prompt (a stated residual channel — see the bias section), so the *credit* here is for the execution, not the discovery; the *finding* is what it cost: the kit gave no support-detection surface (P-3), no synthesis-failure signal (G-12 below), and ambiguous `kai-audio-captured` semantics (G-08), so the loud degradation is built entirely from hand-rolled probes and an invented watchdog. |

## 2. The graded gap list

Every NOTES.md item plus what the comparer found. Classes: **teaching gap** (the MCP/docs should
have said it) · **product gap** (nothing to teach — the kit lacks the surface) · **builder
error** · **acceptable variation** · **strip artifact** (answerable from the README/llms the
harness removed — checked against `packages/ui/README.md` and `packages/ui/llms-full.txt` in the
repo) · **not a gap**. Severity as rung 1: S1 ships a user-visible defect · S2 cost a debugging
cycle · S3 cost a round trip or forced a guess · S4 recorded, no cost. **RECUR** marks a rung-1
finding re-observed (all in rung-1 candidate D, still unlanded).

### From NOTES.md

| id | NOTES | Gap | Class | Sev | Shipped docs? | Note |
|---|---|---|---|---|---|---|
| G-01 | §1 | `createMockResponder()` signature/options not in the MCP; `debug` fell back to a pointer at `llms-full.txt`, absent from the install | teaching gap (**RECUR** rung-1 G-01) — the path complaint alone is a **strip artifact** | S3 | **No** — `createMockResponder` is 0 hits in README.md and llms-full.txt, so even an unstripped install answers only via `dist/state/mock.d.ts` | Same split as rung 1: the missing-file complaint is the harness's doing; the substance (signature stated nowhere) is real and now observed twice. |
| G-02 | §2 | Are the yields fully SSE-framed, `[DONE]` included? | teaching gap (**RECUR** G-02) | S3 | No | Confirmed by the builder from `dist/state.js`; confirmed by the comparer live (the curl shows the `: kai-mock` banner + framed `data:` chunks). |
| G-03 | §3 | Is `createMockResponder` Node-safe? Every MCP example is browser-side | teaching gap (**RECUR** G-01 substance) | S3 | No | Builder verified zero imports in `dist/state.js` and ran it server-side — correctly. |
| G-04 | §4 | The `mock` integration ships **no backend at all** — its route section is literally empty, and the task demanded a local dev endpoint | teaching gap (**RECUR** G-07, worse at this rung) | **S2** | No | The entire Vite `configureServer`/`configurePreviewServer` middleware is the builder's own design. It is *good* design (405 guard, close-detection, `X-Accel-Buffering: no`, preview mount) — but the scaffold offered nothing to copy for the most requested first build ("stream a mocked reply from a local endpoint"). |
| G-05 | §5 | Request-body envelope unstated; guessed `{ model, stream, messages }` | teaching gap (**RECUR** G-07/G-08 family) | S3 | No | Guess matches the OpenAI chat-completions shape rung 1's reference used. Mock ignores the extras. |
| G-06 | §6 | How to cancel a turn — `ConsumeOptions` has no `signal` | teaching gap | S3 | No | The builder's guess (abort the fetch, catch the error) is **exactly the kit's design intent** — `wire/read.ts:2-7` source comment: "aborts are app decisions… AbortSignal parameter (abort the fetch)", and `read.ts:364-367` classifies `AbortError` as `reason: 'abort'`. Correct guess; the intent lives only in a source comment. |
| G-07 | §7 | `kai-voice-input` won't hand out its `MediaStream` → second `getUserMedia` for the visualizer | **product gap** (P-1, input side) | **S2** | No — llms-full's voice-input section documents no stream surface | The workaround itself is an acceptable variation with a real upside the builder noted (`main.ts:170-174`): closing its own stream between turns puts the browser's recording indicator out. A kit-supplied tap should preserve that. |
| G-08 | §8 | `kai-audio-captured` doc says both "raw audio (before transcription)" and "the unsupported-fallback signal" — fires on the native path too? | doc gap | S4 | **No — the ambiguity is IN llms-full** (the identical double sentence), so not a strip artifact | Builder's handler is a no-op unless detection already said recognition is missing — correct either way. |
| G-09 | §9 | Must `start()` be called inside a user gesture? | doc gap | S4 | No | Assumed yes; `pointerdown`/`keydown` call it synchronously. Safe. |
| G-10 | §10 | `kai-voice-input` has **no `::part` at all** (voice-output has `::part(button)`), so the mic button can't become the primary affordance | **product gap** | S3 | No — verified: zero `part=` in `components/voice-input.tsx`; llms-full lists parts for voice-output only | Builder added its own `#ptt` push-to-talk button driving the element via `start()`/`stop()` — acceptable, and arguably the better UI — but the parts asymmetry between the two voice elements is unmotivated. |
| G-11 | §11 | `recognitionLang` has no documented "auto"; hard-coded `en-US` | doc gap | S4 | Partially — llms-full documents the prop (and why it isn't `lang`), still no auto story | `navigator.language` was available; hard-coding is a defensible demo choice. |
| G-12 | §12 | If synthesis silently never starts, the UI sits in "Speaking" forever → invented 2.5 s watchdog | **product gap** | S3 | No | `kai-voice-output` has no error/timeout event for the real Chrome voices-not-loaded stall. The watchdog (`main.ts:256-263`) decides loudly with an invented number. The kit owns the utterance; it should own the failure signal. |
| G-13 | §13 | Does `stop()` with nothing playing fire `speaking:false`? | doc gap | S4 | No | Handler is idempotent; either behaviour fine. |
| G-14 | §14–15 | `bands` vs `stream` interplay; does clearing to `undefined` restore the built-in animation? | doc gap | S3 | No — llms-full documents `bands` alone (new-array rule included), not the interplay | Builder never sets both at once and assumes `undefined` restores the scripted look — the assumption the whole idle/thinking rendering rests on. Worth one doc sentence; worth one IVP check. |
| G-15 | §16–17 | How many bands, what the 0..1 values mean, whether `state` alone animates | doc gap | S4 | No | 28 synthetic values matching `bar-count`; sequencer states self-animate (true). |
| G-16 | §18 | `kai-notice` content channel — slot, prop or child? | doc gap | S4 | No | Guessed light-DOM children — **correct** (`ui/notice.tsx:69` renders `props.children`). The defensive `kai-notice[hidden]{display:none}` CSS is belt-and-braces, acceptable. |
| G-17 | §19 | `kai-status` vocabulary is presence (`new/online/busy/away/offline`), not session states | not a gap (by design) — mapping is an acceptable variation | S4 | — | The hand mapping (idle→offline, listening→online, thinking→busy, speaking→new, blocked→away) is reasonable. If a second app repeats it, that's a recipe candidate, not an element change. |
| G-18 | §20 | `slot="empty"` semantics vs `messages` `undefined`/`[]` | doc gap | S4 | No | Builder arranged to be safe under both readings. |
| G-19 | §21 | `@kitn.ai/ui/state` message helpers undocumented in the MCP; assumed `textMessage` mints an `id` | teaching gap (**RECUR** — the "fifth class" state/wire hole, rung-1 findings §3) | S3 | README names the helpers in one line; no signatures | Assumption **correct**: `state/messages.ts:11`, `id: init.id ?? newId()`. |
| G-20 | §22 | Does `kai-thread` render text parts as markdown by default? | doc gap | S4 | No | Inferred yes from `proseSize`; correct. Untrusted-output handling is clean: reply text only via `parts[]`, the live caption via `textContent` (`main.ts:129`), `codeHighlight = false` to skip Shiki. |
| G-21 | §23 | Toolchain versions unstated; pinned Vite ^6 / TS ^5.5 unverified | not a gap | S4 | — | Comparer verified: resolves to Vite 6.4.3 / TS 5.9.3, builds green. (Rung 1's builder got Vite 8/TS 7 by not pinning; this builder pinned to the kit's own devDeps — tidier.) |
| G-22 | §24–25 | `theme` defaulted to indigo; tokens.css vs theme.css was answered explicitly | not a gap | S4 | — | The theme.css trap held for the second run in a row. |

### Found by the comparer, not in NOTES

| id | Finding | Class | Sev | Note |
|---|---|---|---|---|
| C-1 | **Rung-1's S1 is fixed and the fix held under fire.** The shipped 0.25.2 `abort(reason)` now lands the reason as a visible text part when no tool part carries it — verified live against the installed tarball (`abort('boom')` → `[{"type":"text","text":"boom"}]`). The builder's error path (`main.ts:294-312`) is `stream.abort(message)` **plus** a `kai-notice` — visible twice over, with a human message per failure class (`WireError` status line included). | regression check — **PASS** | — | #294's abort half, re-measured front-door. The scaffold-comment half of rung-1 G-14 was not re-observable (no transcript), but the outcome it caused did not recur. |
| C-2 | **Rung-1's G-15 ordering error did not recur.** The builder encodes `toOpenAIMessages(history)` where `history` is captured *before* `createAssistantStream` appends the empty assistant turn (`main.ts:272` → `281` → `288`), so no empty assistant message is ever encoded. Nothing in the MCP states the constraint (the candidate-D sentence is still unwritten); this builder dodged it by structure, not by instruction. | acceptable variation (lucky-correct) | S4 | Keep the candidate-D fix on the list; this run is one data point of dodging it, not evidence it's learnable. |
| C-3 | **The builder could not verify its own work at all** — every Bash call failed (harness `umask` defect, see builder-run.md), so unlike rung 1's 33-check self-harness there was no self-verification and no error-path exercise. That the app still builds and runs unmodified is a genuinely strong signal about the MCP-taught element layer; it also means rung-1's process rule ("every rung's verification must force one endpoint failure") transfers wholly to the insider IVP phase. | process, not product | — | The builder declared the unverified state plainly in NOTES and the final report — exactly the honest-gap behaviour the ladder wants. |
| C-4 | **Builder errors found: none.** Every event name (`kai-recording-change`, `kai-transcript-interim`, `kai-transcription`, `kai-audio-captured`, `kai-speaking-change`), every `detail` shape, and every property the app sets was verified against the element sources — all real, so no silent no-op listeners. All 25 NOTES guesses that are checkable against the tree checked out correct. | — | — | The two rung-1 builder errors (D-9 ordering, D-10 invisible error path) both had rung-2 analogues available and neither happened. |

## 3. Counts

- **Teaching/doc gaps: 17** (G-01–G-06, G-08, G-09, G-11, G-13–G-16, G-18–G-20 + the archetype
  under-teaching in P-2) — of which **6 are rung-1 recurrences**, all inside candidate D's
  state/wire/mock hole (G-01–G-05, G-19).
- **Product gaps: 4** — the audio tap on both voice elements (G-07 + P-1 output side counted
  once each), no parts/no support surface on `kai-voice-input` (G-10, P-3), no synthesis-failure
  signal on `kai-voice-output` (G-12).
- **Builder errors: 0** (C-4).
- **Acceptable variations: 6** — second `getUserMedia` capture, own `#ptt` button, `kai-status`
  hand-mapping, `kai-notice[hidden]` CSS, the 2.5 s watchdog number, kai-thread-not-kai-chat
  (each one forced by a gap above; the variation is the symptom, the gap is the finding).
- **Strip artifacts: 1** — G-01's missing-`llms-full.txt` path complaint only. Every other gap
  was checked against the repo's `README.md`/`llms-full.txt` and is **not** answered there;
  notably the G-08 ambiguity is verbatim in llms-full, so the strip changed nothing about it.

## 4. What this run argues for

1. **Land rung-1 candidate D.** Six of its constituent gaps just recurred on a different app
   shape, and the new S2 (G-04: `mock` emits no backend while every first build wants a local
   endpoint) is the same hole's server-side face. The builder's `mock-chat.ts` middleware is a
   ready-made template: 405 guard, socket-close handling, anti-buffering header, dev+preview
   mounts — lift it into the `mock` integration's section (2) rather than authoring fresh.
2. **Give the voice family its audio and its failure signals** (new, this rung's own): a
   `MediaStream` tap on `kai-voice-input` (G-07), a support-detection surface (P-3), parts
   parity (G-10), a synthesis-stall signal on `kai-voice-output` (G-12). All four are *how*
   facts squarely on the kit's side of the scope boundary.
3. **Fix the harness umask before rung 3** (builder-run.md) — it cost this run its shell, its
   transcript, and its MCP logs; three more runs like this and the ladder has no run records.
4. **Candidate A remains unexercised** as far as any surviving artifact shows — the transcript
   that could prove or refute a wrong-argument-key call is gone. Carry forward, again.

## Bias and residual-channel statement

- **The three channels the run plan pre-declared all flowed.** (1) The prompt says a mock
  facility exists — G-01/G-02/G-03 would be worse in the wild. (2) The prompt says the package
  ships "chat and voice UIs" — element *names* still had to come from the MCP index, but the
  builder knew to look. (3) The prompt names idle/listening/thinking/speaking — **no credit is
  given anywhere above for discovering the state names or the four-state UI requirement**; P-4's
  credit is confined to the loud-degradation execution, and the `PHASE_LOOK` table's existence
  is treated as prompt-driven, not discovered. (The visualizer's `disconnected` and
  `connecting` states were NOT in the prompt; the builder found `disconnected` and used it for
  the `blocked` phase — that discovery is real.)
- **The run was stricter than a real consumer's** (README/llms/source stripped) — but unlike
  rung 1, the strip downgraded almost nothing: one path complaint. The voice-family gaps are as
  absent from the shipped docs as from the MCP.
- **The builder had no shell**, which real consumers do. This cuts both ways and both are
  stated: the build/run greens belong to the comparer's environment, not the builder's
  discipline under test-feedback; and the absence of a self-verification harness means no
  error-path was ever exercised by the build phase (C-3).
- **The transcript is lost** (builder-run.md). Everything above rests on NOTES.md, the result
  JSON, the app source, and the kit tree — all quoted or line-cited. Claims that only a
  transcript could carry (call ordering, call counts, candidate A) are marked unrecoverable, not
  guessed.
