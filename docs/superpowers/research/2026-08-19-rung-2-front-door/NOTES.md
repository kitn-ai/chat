# NOTES

What this app is, what I could not learn from the `kai` MCP server, and where I
guessed.

## What was built

A full-page, hands-free voice assistant in vanilla TypeScript + Vite.

| File | Role |
| --- | --- |
| `index.html` | The full-page shell (`position: fixed; inset: 0`). |
| `main.ts` | All wiring: phase machine, mic, turn loop, speech out. |
| `voice-support.ts` | Feature detection + human-readable failure sentences. |
| `mock-chat.ts` | The dev endpoint: `POST /api/chat`, streamed **mocked** SSE. |
| `routes.ts` | The one route path, shared by browser and server. |
| `vite.config.ts` | Mounts the endpoint on `vite dev` **and** `vite preview`. |
| `styles.css` | Layout + the per-phase accent tokens. |

Flow: `<kai-voice-input>` (native `SpeechRecognition`, on device) →
transcript into `<kai-thread>` → `fetch(POST /api/chat)` →
`readOpenAIStream` from `@kitn.ai/ui/wire` folds deltas onto the assistant
message → when the turn settles, `<kai-voice-output>` (native
`speechSynthesis`) reads it aloud. `<kai-audio-visualizer>` gets a real
`MediaStream` while listening. No audio is sent anywhere; only text crosses the
wire, and only to your own dev server.

The four session states are `idle` / `listening` / `thinking` / `speaking`
(plus `blocked` when the browser can't do speech at all). Each one changes the
status pill's colour + label, the `<kai-status>` dot, the visualizer's `state`,
and the page's background glow.

## How to run

```
npm install          # vite + typescript are NOT yet installed — see "Blockers"
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit x2, then vite build
npm run preview      # serves dist/ with the same mock endpoint mounted
```

---

## Blockers in THIS environment (nothing to do with the code)

Both are environment permissions, and both mean I could not execute the final
verification the task asked for. I am stating this plainly rather than claiming
a green build.

1. **No shell.** Every `Bash` call — including `true` and `echo hi` — failed
   with
   `EACCES: permission denied, mkdir '/private/tmp/claude-501/-private-tmp-claude-501-…-app/4cfd10c5-…/tasks'`.
   That is the harness's own task directory, not anything under the project.
   Consequence: **I could not run `npm install`, `npm run build`, or
   `npm run dev`.** `vite`, `typescript` and `@types/node` are declared in
   `package.json` `devDependencies` but are **not present in `node_modules`** —
   only `@kitn.ai/ui` and its transitive deps are. `npm install` is required
   before any script will run, and the build is therefore **unverified**.
2. **Directory creation is denied.** Writing `src/probe.txt` or
   `server/mock-chat.ts` failed with `EACCES … lstat`. So the conventional
   Vite layout (`src/main.ts`, a `server/` folder) was impossible and every
   module sits at the project root instead. `index.html` points at `/main.ts`,
   and `tsconfig.json` / `tsconfig.node.json` list the root files explicitly
   rather than `"include": ["src"]`. This diverges from the MCP scaffold, which
   assumes `npm create vite -- --template vanilla-ts` and `src/main.ts`.

---

## Questions I could NOT answer from the MCP, and what I did instead

### The mock endpoint

1. **`createMockResponder()`'s signature and options.** The `scaffold` tool
   names it and shows one call (`createMockResponder()` with no arguments), but
   the MCP never gives its parameters. `debug` returned *"No known failure
   pattern matched"* and pointed at `node_modules/@kitn.ai/ui/llms-full.txt` —
   **that file is not in the installed tarball**. I read the shipped type
   declaration `node_modules/@kitn.ai/ui/dist/state/mock.d.ts` (installed
   artifact, not npm/GitHub source) to get `MockResponderOptions`
   (`replies`, `delayMs`, `chunkSize`, `announce`) and
   `MockResponder = (prompt?: string) => AsyncIterable<string>`.
2. **Are the yielded strings already fully SSE-framed?** Not answered by the
   MCP. The server has to know whether to write them verbatim or wrap them. I
   confirmed against the shipped bundle `dist/state.js` that each yield is a
   complete `data: {…}\n\n` frame and that the stream terminates with
   `data: [DONE]`, so `mock-chat.ts` writes them straight to the socket.
   **Guess if that ever changes:** the handler would emit malformed SSE.
3. **Is `createMockResponder` safe to run in Node?** Every MCP example runs it
   in the browser. The task requires a *local dev endpoint*, so I run it
   server-side. I checked that `dist/state.js` has no imports at all (no
   `solid-js`, no DOM), which makes it safe under Node — but the MCP never
   sanctions server-side use.
4. **How to serve the mock over HTTP at all.** MCP's `mock` integration
   explicitly ships **no backend**: *"No backend or API key needed — replies
   stream locally (see the front-end onSubmit above)"*, and its section (2) is
   empty. Every other integration emits a route. So the Vite
   `configureServer` / `configurePreviewServer` middleware in `vite.config.ts`
   is entirely my design; the MCP offered nothing to copy.
5. **The request-body envelope.** The scaffold says the body is
   `toOpenAIMessages(history)` but not what wraps it. I guessed
   `{ model, stream, messages }` (OpenAI chat-completions shape). The mock
   ignores everything but `messages`, so this is only a forward-compat guess
   for the day it's swapped for a real route.
6. **Cancelling a read.** `ConsumeOptions` (from `dist/wire/chunk.d.ts`) has no
   `signal`, and the MCP never says how to abort a turn. I abort the `fetch`
   and let the body stream error into `readOpenAIStream`, catching it. **Guess:**
   that this is the intended cancellation path and leaves no dangling state.

### `<kai-voice-input>`

7. **Getting its `MediaStream` for the visualizer.** The requirement is a
   visualization driven by *real* microphone amplitude, and
   `<kai-audio-visualizer>` wants a `MediaStream`. `<kai-voice-input>` opens
   its own capture internally and the MCP documents **no** accessor, event or
   property that hands it out. **Guess:** I open a *second*
   `getUserMedia({ audio: true })` stream purely for analysis, attach it while
   listening, and stop its tracks the moment listening ends. Two concurrent
   captures of one device is normal in browsers, but it is not what the kit
   suggests, because the kit suggests nothing.
8. **Does the native-recognition path also produce a blob?**
   `kai-audio-captured` is documented both as "raw audio captured (before
   transcription)" *and* as "the unsupported-fallback signal". Whether it also
   fires on the normal native path is ambiguous. **Guess:** my handler is a
   no-op unless feature detection already said recognition is missing, so it is
   correct either way.
9. **Does `start()` have to be called inside a user gesture?** Undocumented.
   **Assumed yes** (it runs `getUserMedia`), so `holdStart()` calls it
   synchronously from `pointerdown` / `keydown`.
10. **Restyling the mic button.** The MCP lists a `::part(button)` for
    `<kai-voice-output>` but **no parts at all** for `<kai-voice-input>`, so I
    could not enlarge it into the primary push-to-talk affordance. I added my
    own `#ptt` button that drives the same element via `start()` / `stop()`,
    and left the kit's mic button as a secondary tap-to-toggle.
11. **Following the user's locale.** `recognitionLang` takes a BCP-47 tag but
    the MCP documents no "auto" value. **Hard-coded `en-US`.**

### `<kai-voice-output>`

12. **Does `speak()` always report back?** MCP says `kai-speaking-change` fires
    "on real transitions only". If synthesis silently never starts (a real
    Chrome failure mode when voices haven't loaded) the UI would sit in
    "Speaking" forever. **Guess:** a 2.5 s watchdog that drops to idle and shows
    a visible notice. The 2.5 s number is invented.
13. **Does `stop()` when nothing is playing fire a `speaking:false` event?**
    Undocumented. I call it defensively before each new turn and the handler is
    idempotent, so either behaviour is fine.

### `<kai-audio-visualizer>`

14. **Can `stream` and `bands` be mixed?** The MCP says setting `bands` means
    "no AudioContext is ever built", which implies they are alternatives but
    does not say what happens if both are set. **Guess:** I clear `stream`
    whenever the phase isn't `listening`, and only set `bands` while speaking.
15. **Does setting `bands`/`stream` back to `undefined` restore the built-in
    scripted animation?** Not documented. **Assumed yes** — that is how the
    `thinking` and `idle` looks are driven.
16. **How many bands, and what do the 0..1 values mean physically?** Only
    "pre-computed levels, 0..1". **Guess:** 28 values, matching `bar-count`,
    with a synthetic waveform, for the `speaking` phase (the MCP does confirm
    `bands` is the right path for speech-synthesis playback, which "exposes no
    audio node").
17. **Whether `state` alone animates.** Assumed the `thinking` and `idle`
    states are self-animating with no data fed in.

### Other elements

18. **`<kai-notice>` content.** The MCP gives its props (`severity`, `icon`,
    `dismissible`) but never says how the message text goes in — slot, prop or
    child. **Guess:** light-DOM children. Also unstated: whether the `hidden`
    attribute actually hides it given the element's own display; I added
    `#notices kai-notice[hidden] { display: none }` to be sure.
19. **`<kai-status>` vocabulary.** Its values are presence states
    (`new`/`online`/`busy`/`away`/`offline`), which do not line up with this
    app's session states. **Mapped by hand:** idle→`offline`,
    listening→`online`, thinking→`busy`, speaking→`new`, blocked→`away`.
20. **`<kai-thread>`'s `slot="empty"`.** Documented as replacing the built-in
    zero-state, but not whether it requires `messages` to be `undefined` vs
    `[]`. I never assign an empty array before the first turn, so both readings
    work.
21. **`textMessage()` generating an id.** The MCP doesn't document
    `@kitn.ai/ui/state`'s message helpers at all; the shipped d.ts shows
    `textMessage(role, text, init?)`, so **I assumed** it mints an `id` when
    `init` omits one. If it does not, `<kai-thread>` keying could misbehave.
22. **Transcript rendering of untrusted text.** The `untrusted-model-output`
    invariant says model text must render as text. I pass the reply only
    through `<kai-thread>`'s own `parts[]` and never into `innerHTML`; the one
    place I write model-derived text myself (the live caption) uses
    `textContent`. The MCP does not say whether `<kai-thread>` renders text
    parts as markdown by default — it evidently does (there's a `proseSize`
    prop), so I set `codeHighlight = false` to avoid pulling in Shiki for a
    voice app.

### Tooling

23. **Vite/TypeScript versions.** The MCP's run note only says
    `npm install @kitn.ai/ui`. I pinned `vite ^6.0.0`, `typescript ^5.5.0` and
    `@types/node ^22.0.0` — chosen to match what `@kitn.ai/ui`'s own
    `package.json` builds against. **Unverified** (see Blockers).
24. **Theme colour.** `mcp__kai__theme` had no colour keyword in my description
    and defaulted to indigo `#6366f1`. I accepted that rather than inventing
    a brand.
25. **`theme.tokens.css` vs `theme.css`.** MCP was explicit here — tokens.css
    unless it's a Tailwind-source app — so this one is *not* a guess.

---

## Things worth checking on the first real run

Since I could not run the app, these are the spots I would look at first:

- `npm install` — the devDependencies are declared but not installed.
- Two concurrent `getUserMedia` streams (item 7): confirm the visualizer moves
  and that `<kai-voice-input>` still transcribes.
- Whether clearing `visualizer.bands`/`visualizer.stream` to `undefined`
  restores the built-in animation (items 14–15).
- Whether `kai-transcription` fires exactly once per utterance; there is a
  1.5 s identical-text guard in `main.ts` in case it doesn't.
- Firefox: it has `speechSynthesis` but no `SpeechRecognition`, so it should
  land in the `blocked` phase with a red notice naming the missing API. That is
  the "never fail silently" path and is the single most important thing to
  eyeball.
