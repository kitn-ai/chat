# kai devtools - design

Date: 2026-08-14
Status: DESIGN, decisions ruled. Nothing implemented, and nothing here is queued.
Verified against `origin/main` at `7ba376d` (`fix(create-kai): npm strips .npmrc, so
nextjs and tanstack-start cannot scaffold at all (#239)`).

Written now because the context is fresh, not because it is next. It consumes the
stream defined under "The diagnostic event stream" in
`2026-08-14-endpoint-choice-design.md`, and that stream is the seam between the two
documents: the endpoint work emits the events because it needs one console line and one
widened guard, this reads the same events and draws the picture.

## Summary

A separate product: `<kai-devtools>`, a `kai-*` web component shipped as its own npm
package and loaded from a CDN rather than out of the app's bundle. It attaches to a
recorder living inside the kit and shows the things a browser devtool structurally
cannot, starting with frames in versus parts out.

**One open decision, marked in place:** how the panel gets onto the page (a script tag,
an element the developer drops in, or the kit self-injecting when it sees the signal)
is the repo owner's call. The options and their tradeoffs are in "Activation, and who
decides"; everything else in this document is the same under all three.

Two rulings carry the design. It is **not in the consumer's bundle and not versioned
with the kit**, so diagnostics can improve for apps that have not upgraded. And capture
is **decided once at init**, eager and uncapped when the tool is wanted and not started
at all when it is not, so nobody who never opens it pays for it. No ring buffer, no
size constant.

## Why it is a web component, and why CDN

**The kit is web components, so one Solid source reaches every framework by
construction.** A per-framework devtools package is four or five wrappers to keep in
step with one panel, and the kit already refuses that shape everywhere else. A React
devtools panel would also be the one artifact in this repo that cannot be dropped into
the Angular starter.

**CDN delivery has a precedent in this package and it is deliberate.**
`packages/ui/src/elements/autoloader.ts` is exported as `./autoloader` mapping to
`dist/elements/autoloader.js`, and its header states it is a CDN and static-file
pattern that is **not** importable through a bundler, because it resolves sibling
element modules relative to its own `import.meta.url` and a bundler relocates that. The
same delivery, for a different reason: the autoloader is CDN-only because of how it
resolves modules, the devtool is CDN-first because it must not be in the app's bundle
at all. That last clause is the one option B in the next section trades away, which is
why it is priced there rather than assumed here.

**Version decoupling requires a separate package.** A file inside `@kitn.ai/ui`
is pinned to whatever the app installed, which is the opposite of the goal. So it
ships as `@kitn.ai/devtools`, published on its own cadence, and whatever references it
points at a floating range. The kit and the panel meet at the event contract, not at a
version.

## Activation, and who decides

**How the panel gets onto the page is UNRESOLVED and is the repo owner's call.** Three
options, and they differ in who is deciding what:

| Option | How it looks | Tradeoff |
|---|---|---|
| **A. Script tag from a CDN** | the app adds `<script type="module" src="https://unpkg.com/@kitn.ai/devtools">` in the environments it wants | The app decides what code its page loads, which is the answer this repo's scope rule points at. Costs one line per environment, and the line is easy to leave in a production build by accident. |
| **B. An element the developer drops in** | `<kai-devtools>` placed in the app's own markup, resolved through the package it already installs | Most familiar, and it composes with the app's own conditionals. But it puts the panel back in the consumer's bundle and pins it to the installed version, which is the ruling above reversed. |
| **C. The kit self-injects on seeing the signal** | no app change at all; the recorder sees the signal and dynamically imports the panel from a CDN | Best experience by a distance, and reachable on a deployed staging URL with a query param and nothing else. But the kit would be deciding to make a third-party network request from the app's page, which lands in a CSP policy and a vendor review, and CSP is likeliest to be strict in exactly the production setting the feature is for. |

**This document assumes A** so the rest of it stays concrete, and A is the conservative
answer rather than the best one: it is the only option where nobody but the app decides
what the page loads. B and C change the paragraphs that mention a script tag and
nothing else; the recorder, the capture model, the hook and the event contract are
identical under all three. C additionally needs a documented CDN origin for the app's
CSP, and a decision about what happens when the fetch is blocked (report it in the
console, never silently).

Whichever wins: **activation is never inferred from `NODE_ENV`.** The whole point is
that the bug you cannot reproduce locally is in staging.

**The activation signal is read once, synchronously, at kit init.** Three sources,
checked in this order, first hit wins:

1. `localStorage['kai-devtools']`. Survives a reload, and a repro usually needs one.
2. A global set before the kit loads (`window.__KAI_DEVTOOLS__ = true`). For an app
   that wants to gate on its own feature flag or its own auth.
3. `?kai-devtools` in the query string. Shareable, and works against a deployed
   staging URL without a build.

Synchronous is a hard requirement, not a preference: an async answer means an interval
of "unknown", and an interval of unknown is exactly what forces a permanent buffer with
a size constant. Server-side there is no `window`, no `localStorage` and no query
string, so the answer is no and the recorder never starts. That falls out of the same
rule the kit's own entries already follow: `src/elements/register.ts` gates
registration behind a browser check and a dynamic import so the elements entry is
SSR-import-safe, and `src/wire/read.ts` touches no global at module scope.

## The capture model

At kit init the recorder asks once, and there are only two branches.

**Not wanted.** No buffer is allocated and the kit's emit binding stays an empty
function. Nothing is retained, and there is no buffer to size. The residual cost is a
call into an empty function on the emit path, which is what "free" means on a hot path;
the cost that matters, retained memory growing for the whole session, is genuinely
zero.

The hook itself is still installed in this branch, because it is a few bytes and it is
what lets a panel attach later (see below). Emission re-arms on the first `subscribe`
and goes back to the empty function when the last subscriber leaves.

**Wanted.** It captures from the first event, uncapped, before the panel exists. When
the panel attaches it drains the history and then streams live.

**Why this beats a permanent ring buffer.** A ring buffer has to be sized, and the size
cannot be chosen well. The events that explain a session are almost always its first
ones (which format was chosen, what the first response streamed, which elements
registered), so a buffer small enough to be free has usually discarded the answer by
the time anyone looks; a buffer large enough to hold the answer charges every
production user of every app for a panel almost none of them open. The eager model has
no such number. It also makes load latency stop mattering: the panel arriving
instantly and the panel arriving three minutes later see the same history, so the
developer who opens devtools after the bug happens is not told to reload and try again.

**What bounds the buffer in a wanted session.** Until the panel attaches, nothing, and
that window is the seconds it takes the panel to load. After it attaches, the panel
owns retention and can cap or window as its own UI decides, because at that point the
data lives in the panel rather than in the kit. A session where the signal is on and no
panel ever attaches is a developer choosing to hold a buffer on their own machine.

**The cost of the model, stated plainly.** A session that started with no signal has no
history, so opening the panel mid-session shows live events from that moment forward
and nothing before it. That is the price of charging nobody for the buffer, and it is
the right trade because the fix is one click: the panel's empty state sets
`localStorage['kai-devtools']` and reloads, which is why that signal is first in the
list.

## Connection shape

A global hook holding the buffer and a subscribe function. The panel attaches, drains
history, then receives live events:

```ts
window.__KAI_DEVTOOLS_HOOK__ = {
  version: 1,
  drain(): DiagnosticEvent[],              // history, and clears it
  subscribe(fn: (e: DiagnosticEvent) => void): () => void,
};
```

This is React DevTools' shape minus its hardest constraint. React's hook must be
installed *before* React loads, which is why it ships as a browser extension that runs
at `document_start`. Ours does not: the recorder is inside the kit, so it is present as
soon as the kit is, and the panel is a late subscriber by design. That is the whole
reason the buffer exists.

`version` is on the hook because the panel floats free of the kit. A panel newer than
the kit it attaches to has to be able to say so.

## What it shows

Everything below is something a browser devtool cannot show, or can only show as an
undifferentiated blob of network bytes.

**Frames in versus parts out.** The headline, and the diagnosis for the silent case the
endpoint spec measures: a stream that yields chunks and produces no parts. The network
panel shows a 200 with a body; the console shows nothing; the UI shows an empty bubble.
This shows frames arriving, the format that was chosen to read them, and zero parts
coming out, which names the failure in one screen.

**The parts timeline by variant.** One lane per `MessagePart` variant, in arrival
order, showing the ordering the model actually produced (preamble, tool call, answer)
rather than the order a UI renders them. Derive the variants from the union in
`src/elements/chat-types.ts`, the same derivation `verify:scaffold` and
`lint:silent-drops` already read, so the next union member appears here without a
second list to update.

**The encoded request.** What `toOpenAIMessages` (or `toAnthropicMessages`) produced
from the current thread, which is the input to every "why did the model do that"
question and is otherwise only visible by unfolding a request body by hand.

**Live contract violations.** The kit's own documented failure modes, detected rather
than guessed at:

- an array or object prop set as an HTML attribute, which arrives as the string
  `[object Object]` and silently does nothing
- a mutation in place, where the element does not re-render because the reference did
  not change
- the same array reference handed back during streaming, which is the same bug wearing
  a streaming costume

`defineWebComponent` in `src/elements/define.tsx` is the single choke point for all of
this: every `kai-*` element is registered through it, and it already receives a
`propDefaults` object that declares each prop's expected shape. That is what makes a
type mismatch detectable rather than heuristic.

**Which `kai-*` elements are registered.** The SSR starters ship exactly this check
today, in one badge:
`examples/starters/nextjs/app/components/HydrationBadge.tsx` and
`examples/starters/tanstack-start/src/components/HydrationBadge.tsx` poll
`customElements.get()` for a hard-coded tag list on a rAF loop, and their docblock
gives the reason better than a spec can: hydration failure looks like success, a
production React build minifies the hydration error into a numbered link, and a
screenshot cannot tell a live page from a dead one. Generalise it: the panel reads the
tag list the autoloader already carries (`src/elements/element-manifest.json`, which
maps `kai-*` tags to their element modules) and reports defined versus undefined across
that whole set rather than the handful of tags a starter hard-coded.

**Stream timing.** Time from request to first frame, inter-frame gaps, time to first
part. The signature worth naming: every frame arriving in one burst at the end is a
proxy buffering SSE, not a slow model. That is invisible in the network panel, where a
buffered stream and a streamed stream are the same completed request.

## Data exposure

It can run in production, so it can display thread content and encoded request bodies.
That is the app's users' conversation data, and by the scope rule it is the app's
decision, not ours.

- **Never on automatically.** Covered by the activation model above; restated here
  because this is the section someone reads when they are worried.
- **Metadata by default.** Event kinds, counts, sizes, timings, variants, formats,
  element registration. Enough to diagnose the silent-dialect case, the buffering
  case and the contract violations without rendering a single token.
- **Payload capture is a separate, deliberate switch**, off by default, with its own
  signal rather than a checkbox buried in the panel. Turning it on is what makes
  message text and request bodies visible.
- **We surface the capability and state plainly what enabling it exposes.** We do not
  decide how much of it a given app may show, or to whom.
- Nothing is transmitted anywhere. There is no endpoint, no telemetry and no phone
  home. This is a panel, not a service.

## Non-goals

- Replacing the browser's devtools. Network, console, performance and the element
  inspector are better than anything we would build; this shows what they cannot.
- Production monitoring or error reporting. No collection, no aggregation, no backend.
- A browser extension. The web component is the delivery, and it is what makes staging
  and production reachable without asking anyone to install anything.
- Shipping inside `@kitn.ai/ui`. That would put it in the consumer's bundle and pin its
  version, and both are the point of the design.

## What has to exist first

The diagnostic event stream, defined in the section of that name in
`2026-08-14-endpoint-choice-design.md`: the envelope, the five wire event types, the
forward-compatibility rule that lets an old panel meet a new kit, and the
metadata-versus-payload boundary this document's data-exposure section depends on. That
spec needs the stream anyway, for one console line and for the widened empty-turn
guard, and it ships first. This product adds event types under the same envelope
(element contract violations, the encoded request) and consumes the rest unchanged.

## How to check the claims in this spec

| Claim | Check |
|---|---|
| CDN and static-only delivery has a precedent | the header comment in `packages/ui/src/elements/autoloader.ts`, and the `./autoloader` entry in `packages/ui/package.json` |
| The kit's entries are SSR-safe by browser check plus dynamic import | `packages/ui/src/elements/register.ts` |
| Every element registers through one function | `defineWebComponent` in `packages/ui/src/elements/define.tsx`, and `git grep -l defineWebComponent -- packages/ui/src` |
| Tag to module map already exists | `packages/ui/src/elements/element-manifest.json` |
| The SSR starters already check registration | `HydrationBadge.tsx` in the `nextjs` and `tanstack-start` starters |
| The part variants are derivable, not restated | the `MessagePart` union in `packages/ui/src/elements/chat-types.ts` |
| The silent case this exists to diagnose | the empirical results in `2026-08-14-endpoint-choice-design.md` |
