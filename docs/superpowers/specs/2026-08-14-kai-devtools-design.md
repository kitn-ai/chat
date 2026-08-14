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

Delivery is **a script tag from a CDN**, decided rather than assumed, because on a CMS
that is frequently the only injection point there is. The reasoning and the priced
alternatives are in "Activation, and who decides".

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
at all. That last clause is what option B in the next section would have traded away,
and is one of the two reasons it lost.

**Version decoupling requires a separate package.** A file inside `@kitn.ai/ui`
is pinned to whatever the app installed, which is the opposite of the goal. So it
ships as `@kitn.ai/devtools`, published on its own cadence, and whatever references it
points at a floating range. The kit and the panel meet at the event contract, not at a
version.

## Activation, and who decides

**Delivery is a script tag from a CDN. Decided, option A.**

```html
<script type="module" src="https://unpkg.com/@kitn.ai/devtools"></script>
```

**On a CMS, a script tag is frequently the only injection point that exists.** WordPress
(header or footer injection, or a plugin), Shopify (`theme.liquid` or Additional
Scripts), Wix (Settings, Custom Code) and Webflow (Project Settings, Custom Code) each
expose a script slot, and none of them give you a build step, an `npm install` or a
bundler plugin. Anything that needs an `import` statement is unreachable there. That
does not merely price option B for that audience, it removes it.

Not hypothetical for this kit. `html` is a ready framework target in `create-kai`, and
`packages/ui/README.md` documents loading the element bundle straight from jsDelivr or
unpkg inside a `<script type="module">` with no install and no bundler.
`src/elements/autoloader.ts` is the per-element version of that delivery, and its header
says it resolves sibling modules from its own `import.meta.url` and 404s if a bundler
touches it. Someone on Shopify is already loading the kit itself by script tag. The
panel has to reach that person the same way.

What was weighed:

| Option | How it looks | Why not |
|---|---|---|
| **A. Script tag from a CDN. CHOSEN.** | the app pastes one tag in the environments it wants | Reaches the CMS audience, which nothing else does. The app decides what code its page loads, which is where this repo's scope rule points. Costs: one line per environment, and a line that is easy to leave live on production, which the data-exposure section takes seriously rather than waving at. |
| **B. An element the developer drops in** | `<kai-devtools>` in the app's own markup, resolved through the installed package | Needs an import and a build, so it cannot reach a CMS at all. It also puts the panel back in the consumer's bundle and pins it to the installed version, reversing both rulings above. |
| **C. The kit self-injects on seeing the signal** | no app change; the recorder imports the panel from a CDN when the signal is set | The best ergonomics of the three, and still rejected: the kit would be deciding to make a third-party network request from the app's page. That lands in a CSP policy and a vendor review, and CSP is strictest in exactly the production setting this feature is for. |

**This decision is cheap to revisit,** which is the other reason to record the reasoning
rather than just the verdict. The recorder, the capture model, the hook and the event
contract are identical under all three; only the paragraphs that mention a script tag
would change.

**Activation is never inferred from `NODE_ENV`.** The whole point is that the bug you
cannot reproduce locally is in staging.

**The script tag is not the signal, and cannot be.** The tag is a delivery mechanism
that arrives whenever the page gets around to it, and CMS platforms typically inject
custom code into the footer, after the app's own scripts. So the panel may execute long
after kit init, by which point the "am I wanted?" check has already run and, if nothing
said yes, the recorder has already taken the not-wanted branch.

That makes the tag better rather than worse. It can be pasted once and left there
permanently, dormant and near-free, because it does nothing until a signal says so.
That is exactly right for a CMS, where editing a live theme is awkward and
"install once, activate by URL" is the ergonomics you want.

**The activation signal is read once, synchronously, at kit init**, and is independent
of the tag and earlier than it. Three sources, checked in this order, first hit wins:

1. `localStorage['kai-devtools']`. Survives a reload, and a repro usually needs one.
2. A global set before the kit loads (`window.__KAI_DEVTOOLS__ = true`). For an app
   that wants to gate on its own feature flag or its own auth. This is a plain boolean
   and is a different name from the hook in "Connection shape", which is the kit's own
   object.
3. `?kai-devtools=1` in the query string. Shareable, and works against a deployed
   staging URL without a build.

Synchronous is a hard requirement, not a preference: an async answer means an interval
of "unknown", and an interval of unknown is exactly what forces a permanent buffer with
a size constant. Server-side there is no `window`, no `localStorage` and no query
string, so the answer is no and the recorder never starts. That falls out of the same
rule the kit's own entries already follow: `src/elements/register.ts` gates
registration behind a browser check and a dynamic import so the elements entry is
SSR-import-safe, and `src/wire/read.ts` touches no global at module scope.

### First run: the tag is in, no signal is set

This is the path most people hit first, and it has to read as "not activated" rather
than as broken. What happens, in order:

1. The kit initialises, finds no signal, and takes the not-wanted branch. No buffer,
   emission is a no-op, and the hook is installed and empty.
2. The panel module loads whenever the page gets to it and registers `<kai-devtools>`.
3. **It renders nothing.** No floating button, no badge, no corner widget. A live
   storefront must not grow visible UI because somebody pasted a tag, and this is what
   makes the tag safe to leave in permanently.
4. It writes one console line, once, naming the state and both ways out:
   `[kai-devtools] loaded, not activated. Add ?kai-devtools=1 to the URL, or run
   __KAI_DEVTOOLS_HOOK__.activate(), to record from the next page load.`

`activate()` writes `localStorage['kai-devtools']` and reloads. It lives on the kit's
hook rather than on the panel because the kit owns the signal it writes.

**Reload is the primary path because it is the only one that yields history.** After the
reload the signal is set before the first event, so the panel opens with the session
from its beginning, which is where the answer usually is. Attaching live without a
reload stays possible, since `subscribe` works at any time, and gives events from that
moment forward with no history; the panel offers it as the secondary action for someone
who cannot afford to lose the session they are in.

Nothing here is silent. The one console line is the whole discovery surface, and it
names the exact next step rather than reporting a state.

## The capture model

At kit init the recorder asks once, and there are only two branches.

**Not wanted.** No buffer is allocated and the kit's emit binding stays an empty
function. Nothing is retained, and there is no buffer to size. The residual cost is a
call into an empty function on the emit path, which is what "free" means on a hot path;
the cost that matters, retained memory growing for the whole session, is genuinely
zero.

The hook itself is still installed in this branch. It is a few bytes, and it is what
carries `activate()` and what lets a panel attach later at all. Emission re-arms on the
first `subscribe` and goes back to the empty function when the last subscriber leaves.
A dormant panel does not subscribe, which is what keeps a permanently pasted tag
genuinely dormant rather than quietly recording.

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
history, so attaching mid-session gives live events from that moment forward and
nothing before it. That is the price of charging nobody for the buffer, and it is the
right trade because the fix is one call: `activate()` sets the signal and reloads, and
the next load records from the first event. See "First run" above for the whole path.

## Connection shape

A global hook holding the buffer and a subscribe function. The panel attaches, drains
history, then receives live events:

```ts
window.__KAI_DEVTOOLS_HOOK__ = {
  version: 1,
  drain(): DiagnosticEvent[],              // history, and clears it
  subscribe(fn: (e: DiagnosticEvent) => void): () => void,
  activate(): void,                        // sets the signal, then reloads
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

**The delivery decision makes this concrete, so state it here rather than leave it
implied.** A tag pasted into a live Shopify theme is permanently installed, and
`?kai-devtools=1` is guessable. Anyone who knows it can open the panel over a real
customer's session. That is the direct consequence of the ergonomics the decision buys,
and it is not a defect to engineer away: it is the app's call whether to leave the tag
on a production storefront at all.

**What limits the blast radius is the default, and it is checkable rather than
promised.** The default stream is metadata: counts, byte and character sizes, timings,
variant names, format ids, status codes. A stranger who activates the panel sees the
shape of a conversation, not its content. Content requires the separate payload switch,
and spec 1's field-level rule is what makes that boundary reviewable, since every
content-bearing field lives under one optional `payload` key instead of scattered among
the metadata.

**And the seam is already there for an app that wants more.** The global signal
(`window.__KAI_DEVTOOLS__`) is set by the app's own code, so an app can gate activation
behind its own auth or feature flag, and can keep the tag out of the environments where
it does not want a query param to be enough. We surface that; we do not decide it, and
we add no mitigation that decides it for them.

The rules, compactly:

- **Never on automatically**, and never visible without a signal. Restated here because
  this is the section someone reads when they are worried.
- **Metadata is enough to do the job.** The silent-dialect case, the buffering
  signature and the contract violations are all diagnosable without rendering a single
  token, which is what makes the default defensible rather than merely cautious.
- **Payload capture is a separate, deliberate switch**, off by default, with its own
  signal rather than a checkbox buried in the panel. Turning it on is what makes
  message text and request bodies visible.
- **Nothing is transmitted anywhere.** No endpoint, no telemetry, no phone home. This
  is a panel, not a service.

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
| The autoloader 404s through a bundler, by design | the IMPORTANT block at the top of `packages/ui/src/elements/autoloader.ts`, and the warning text in `warnOnce` |
| Script-tag consumption is already a documented path | the jsDelivr and unpkg `<script type="module">` blocks in `packages/ui/README.md` |
| `html` is a ready framework target | the `id: 'html'` row in `packages/create-kai/src/frameworks.ts` |
| The kit's entries are SSR-safe by browser check plus dynamic import | `packages/ui/src/elements/register.ts` |
| Every element registers through one function | `defineWebComponent` in `packages/ui/src/elements/define.tsx`, and `git grep -l defineWebComponent -- packages/ui/src` |
| Tag to module map already exists | `packages/ui/src/elements/element-manifest.json` |
| The SSR starters already check registration | `HydrationBadge.tsx` in the `nextjs` and `tanstack-start` starters |
| The part variants are derivable, not restated | the `MessagePart` union in `packages/ui/src/elements/chat-types.ts` |
| The silent case this exists to diagnose | the empirical results in `2026-08-14-endpoint-choice-design.md` |
