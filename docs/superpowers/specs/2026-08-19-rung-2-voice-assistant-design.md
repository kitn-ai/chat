# Design: rung 2 — the voice assistant

Date: 2026-08-19. Parent spec: `docs/superpowers/specs/2026-08-18-iteration-ladder-design.md`
(rung 2 row). Survey of record: the voice-family survey in the rung-2 planning session.

## Why this rung earns its slot

The kit ships three dedicated voice elements — `kai-voice-input`, `kai-voice-output`,
`kai-audio-visualizer` — and **nothing composes them**. Every shipped voice demo bypasses all
three (raw `speechSynthesis`, the bare `voice` attribute on `kai-chat`); the scaffolder's
`voice` archetype emits only `kai-voice-input`; `kai-voice-output` has zero real usages
anywhere. All three have unit tests; none has ever been driven by an application. That is the
exact profile the ladder exists for.

## The app

`examples/apps/voice-assistant/` — vanilla TS + Vite, in the ladder corpus (auto-enrolled in
`verify:starters`' derived roster). A full-page voice assistant:

- **`kai-voice-input`** captures the question (native `SpeechRecognition` path; push-to-talk via
  its `start()`/`stop()`), firing `kai-transcription`.
- The text turn streams through the **same `/api/chat` middleware pattern as rung 1**: the kit's
  mock frames with no key, the OpenRouter chat-completions proxy with one. The wire path is
  `toOpenAIMessages` / `readOpenAIStream` — the provider only ever pays for the reasoning step;
  STT and TTS are browser-native.
- **`kai-voice-output`** speaks the settled reply (`speechSynthesis` default path).
- **`kai-audio-visualizer`** runs the whole session through its state cycle
  (`idle → listening → thinking → speaking → idle`), with REAL amplitude (`stream`/`bands`)
  during listening from the mic's own `MediaStream`. During speaking it runs state-only,
  because `kai-voice-output` exposes no audio tap — a known component gap this rung is
  expected to surface as a real finding rather than a theoretical note.
- A visible transcript (whether via `kai-chat` or a thread surface is the builder's
  composition call — that choice is itself informative).

**Done when:** runs against a real provider (owner validation), checked in, builds in CI.
CI never contacts a live model or a real microphone; the CI gate is build + typecheck via the
derived roster, as rung 1 established.

## Working method — the front-door rule, applied for the first time

Rung 1 was insider-built with an MCP-only rebuild as its measurement. Rung 2 inverts that,
per the owner ruling now in the parent spec:

1. **The app code is built front-door-first**: a clean-room builder session (the rung-1
   rebuild harness — packed tarball, kai MCP over stdio, throwaway config, cwd outside the
   repo) gets product requirements only and builds the app. The voice archetype is known to
   under-teach this composition; where the builder stumbles or fails to discover an element,
   that IS the finding.
2. **Insiders finish what the front door couldn't teach.** The rung must end with a working
   app, so after the front-door build, insider workers close the remaining distance — with
   every insider intervention logged in the run ledger as a named teaching gap. The final
   app's README provenance section records both phases per the provenance policy.
3. Repo plumbing (workspace entry, CI roster, verification) stays insider throughout.

## Expected findings, named in advance so hindsight can't claim them

- The voice-output → visualizer audio tap gap (no public `audioElement`/`stream` surface
  during TTS playback).
- The `voice` archetype teaching only `kai-chat` + `kai-voice-input`; whether the builder
  discovers `kai-voice-output` and the visualizer at all.
- The starters' hand-rolled SpeechRecognition helpers duplicating what `kai-voice-input`
  ships (four copies in the tree today) — candidate consolidation.
- Browser-dependence: native STT is Chromium-only; the app must degrade loudly (decide
  loudly rule), not silently, in unsupported browsers.

## Explicitly not doing

- No cloud STT/TTS provider integration (OpenRouter is text-only; browser APIs carry both).
- No audio message parts in the wire layer (none exist; inventing one is not this rung's job —
  if the build shows the need, it's a finding for a future iteration).
- No LiveKit integration (the parity harness is an instrument, not app code; its non-OSS
  vendored pieces stay out).
- No rewrite of the existing docs voice demo — reconciling docs to the new app is the
  standing docs pass, pointer updates only, as rung 1 established.

## Risks

- Mic/speech APIs in verification: Playwright can fake `getUserMedia` streams and stub
  `SpeechRecognition`/`speechSynthesis`; the IVP must drive the real elements with faked
  audio sources, never mock the elements themselves.
- The front-door build may produce a partial app (expected, measured); budget the insider
  completion phase accordingly.
