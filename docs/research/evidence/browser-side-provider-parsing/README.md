# Evidence — browser-side provider parsing

The five raw research reports behind
[`../../browser-side-provider-parsing.md`](../../browser-side-provider-parsing.md). They were
written on 2026-08-14 by five researchers working in parallel from separate briefs, and they lived
only in per-session scratch directories that do not survive the session. They are preserved here
because the synthesis compresses them and the compression is lossy — in particular it drops most of
the per-claim citations, and those are the part that lets someone who was not here re-check the
work.

These are **copies, not working originals**. Each was copied on 2026-08-14 and verified
byte-identical to its source with `cmp`; `MANIFEST.sha256` records the digests. Nothing in them has
been edited — including the parts the synthesis contradicts, the retracted claims, and the sections
where one report corrects another. That is deliberate. A report rewritten after the fact is not
evidence of how the work was done.

## What each file is

| File | Brief it answered |
| --- | --- |
| `peer-ui-kits.md` | Do peer chat-UI libraries parse provider-native SSE in the browser, or define their own protocol? Seven projects read in source: assistant-ui, CopilotKit, Vercel `ai-chatbot`, LibreChat, Open WebUI, Deep Chat, TanStack AI. Also carries the prior-art survey on diagnosing "frames received, no output produced". |
| `livekit-elements-promptkit.md` | The same question for three projects the first sweep did not reach — LiveKit, Vercel AI Elements, prompt-kit — plus an exhaustive category sweep of npm and GitHub for framework-agnostic custom-element chat kits. Method note worth reading: the shadcn registry JSON was downloaded and grepped whole, so its negative results are exhaustive rather than sampled. |
| `t3-chat-and-opencode.md` | How two multi-provider products handle streaming: OpenCode (open source, read in source at `4643e65`) and T3 Chat (closed source, reconstructed from founder statements on their own feedback board). |
| `normalization-landscape.md` | Where the industry normalizes provider differences, and what reaches the browser. Vercel AI SDK, OpenRouter, LiteLLM, and Anthropic's own OpenAI-compatibility endpoint, read from shipped artifacts in this repo's `node_modules` rather than from docs sites. |
| `parser-trajectory-risk.md` | The adversarial brief: has anyone tried browser-side provider parsing and abandoned it, how stable is the ground, and what would have to become true for this to be a mistake. Carries the ten-condition risk table and both live CORS preflight measurements. |

## Where the retractions are

Named here because they are the most useful thing in the set and the easiest to lose:

- `parser-trajectory-risk.md` — the `api.openai.com` CORS retraction, in two places: the
  correction block at the end of Q4(d), and again under "One claim in an earlier draft of this file
  was WRONG". The same section carries the live preflight that pinned Anthropic's actual mechanism.
- `parser-trajectory-risk.md` — "Correction to the brief's premise about Deep Chat and reasoning",
  which rejects a premise the brief handed the researcher.
- `livekit-elements-promptkit.md` — the NLUX correction, which overturns a claim made in
  `peer-ui-kits.md`.
- `t3-chat-and-opencode.md` — the superseded subprocessor-list reading, at the end of "What I could
  NOT establish".

## Where the originals were

Per-session scratch directories under
`/private/tmp/claude-501/-Users-home-Projects-kitn-ai-kitn-chat/<session>/scratchpad/agent-{t1,t2,t3,u1,u2}/`.
Those are temporary by construction and are expected to be gone. This directory is the record.
