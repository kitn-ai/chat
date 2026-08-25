# Compose-your-own-thread

A chat client whose conversation UI is composed by hand from standalone
`@kitn.ai/ui` elements — no `<kai-chat>` anywhere. `kai-thread` renders the
transcript, `kai-composer` takes input, `kai-attachments` stages files,
`kai-conversation-item` rows make the sidebar, `kai-toast-region` and
`kai-feedback-bar` are placed and driven by the host (`src/main.ts`).
Streaming runs through `createAssistantStream` (`@kitn.ai/ui/state`) +
`readOpenAIStream` (`@kitn.ai/ui/wire`) fed by `createMockResponder`, whose
third scripted turn emits a `search_docs` tool call the host resolves itself.
Attach a file with the paperclip, send, and it rides as a `file` part on your
message into the thread.

Rung 6 of the [iteration ladder](../../README.md) — the clean-room
"compose your own thread" front-door build. Plain Vite + TypeScript, no
framework, no key, no network: the mock responder runs entirely in the browser.

## Run it

```bash
nx build ui                                          # the app resolves @kitn.ai/ui through workspace:*
pnpm --filter @kitn.ai/ui-app-composed-thread dev    # http://localhost:5184
```

`npm run build` typechecks and emits `dist/`.

## Provenance

This app was built by a clean-room agent and enrolled here from the verified
snapshot at `docs/superpowers/research/2026-08-25-rung-6-front-door/app/` in the
kit's repository, which stays byte-original. Enrollment changed the packaging to
the examples conventions (`workspace:*` dep, sibling scripts, port 5184) and made
**one code correction (F-44): the builder staged attachments with
`URL.createObjectURL(file)`, which renders a perfect in-tab preview but is
meaningless downstream — a `blob:` URL resolves only inside the tab that minted
it, so the wire encoders refuse it. `src/main.ts` here reads the picked file as a
`data:` URI instead (`readAsDataUrl`), mirroring `default-input.tsx` and the
composed-thread recipe, and drops the object-URL revocation bookkeeping that
existed only to serve the wrong pattern.** Everything else in `src/` is the
builder's code as verified, and `NOTES.md` is its gap record, kept verbatim.

The record below is the snapshot's provenance README, verbatim.

### How this app was built

The application code was written by a clean-room builder agent that had never
seen the kit's repository: a headless `claude -p` session (model
`claude-opus-5`, 44 turns, 6.2 minutes wall clock, $3.59, session
`ca9e799f-3e0b-44f3-8c23-c900a54d324e`, started 2026-08-25T12:16:34Z, ended
12:22:49Z, `end_turn`, zero permission denials). It worked from:

- a locally packed tarball, `kitn.ai-ui-0.26.0.tgz`, sha256
  `6f7ff0ffb5d00a05d9d9edcb31d1fc7ce8d5f3ee27dd9d964258b942e16e2428`,
  pre-installed into this directory
  <!-- the pinned version is a record of the exact kit the builder was handed -->
- the kit's own `kai` MCP server over stdio
  (`node node_modules/@kitn.ai/ui/bin/mcp.js`, wired via `--mcp-config
  .mcp.json --strict-mcp-config`, the four `mcp__kai__*` tools allowed)
- the sanctioned docs only: the package README, https://ui.kitn.ai, and the MCP

No repo access, default permissions (no `--dangerously-skip-permissions`),
`--max-turns 150`. The builder's own gap record is `NOTES.md`, kept verbatim
beside this file — 12 questions the sanctioned docs could not answer, each with
the guess it forced.

#### The builder's entire task prompt, verbatim

The one and only prompt the builder received (`builder-prompt.md`, sha256
`1a78d9e937cbe47fa8f3d686bc4c530aef7f6a1013b6f6d680ef01ce8d6bbfd2`, verified
against the file that was launched). There were no follow-up prompts.

````text
Build a small web app: a chat client where you compose the conversation UI yourself from standalone pieces instead of using the all-in-one chat element — do NOT use `<kai-chat>` anywhere. The `@kitn.ai/ui` package is already installed in this directory; it ships web components for AI chat UIs. Compose the thread yourself from the package's standalone elements: `kai-thread`, `kai-message`, `kai-conversation-item`, `kai-composer`, `kai-attachments`, `kai-toast-region`, and `kai-feedback-bar`. Wire streaming with the package's state and wire helpers, and drive replies from the package's mock responder (it can emit tool calls) — no API key, no remote provider. The app must let a user attach a FILE in the composer, send it, and see the attachment rendered in the thread on the sent message. Plain Vite + TypeScript, no framework. The package's `kai` MCP server is configured for you: use it to learn what the package provides and how to use it. The docs you may use are the package's README, https://ui.kitn.ai, and the kai MCP — nothing else; do not read the package's source on npm or GitHub. When done: the app must build (`npm run build`) and run (`npm run dev`), and write NOTES.md recording every question you could not answer from the MCP or the docs and where you had to guess.
````

#### Independent verification (by the setup orchestrator, after the run)

Clean rebuild plus a Playwright smoke in real Chromium, 22/22 checks: all seven
elements registered and in the DOM, no `<kai-chat>`, a sent message streams the
mock reply (text sampled growing mid-stream), a picked file stages in
`kai-attachments`, the sent user message carries
`{ type: 'file', attachment: { filename, mediaType, url: blob: } }`, the
filename renders in the thread, the staging tray clears, the third turn's
`search_docs` tool call renders resolved (`output-available`), and zero page or
console errors. Screenshots and the smoke script live with the run record.

(The `url: blob:` in that check is the snapshot's pre-correction shape — after
the F-44 enrollment fix above, the same part carries `url: data:`.)

The full run record — the MCP call table, the direct-read audit, and the
measurement — is `docs/superpowers/research/2026-08-25-rung-6-front-door/` in
the kit's repository.
