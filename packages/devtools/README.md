# @kitn.ai/devtools

A panel that shows what the `@kitn.ai/ui` wire adapter actually saw: which format was
chosen, how many frames arrived, how many neutral chunks they produced, how many message
parts came out of those, which model the response stated, and how long each step took.

It exists for one failure in particular. A 200 response that streams a dialect your
reader cannot read produces frames, no parts, and — before the diagnostic stream — no
error and nothing to debug. The kit is the only layer that sees both counts, and this is
where it says so:

```
12 frames → 12 chunks → 0 parts     empty-turn
```

## Not a browser extension, and not part of the kit

It is a web component delivered by a script tag, because a script slot is frequently the
only injection point that exists — WordPress, Shopify, Wix and Webflow each expose one,
and none of them gives you a build step or an `npm install`. Anything needing an `import`
statement cannot reach that audience at all.

It ships outside `@kitn.ai/ui` for the same reason it is not a browser extension:
bundling it with the kit would put it in every consumer's bundle and pin it to the
installed version.

## Install

**Not published yet.** There is deliberately no CDN URL in this file until there is a
released version to point at — a hand-typed URL for a version that does not exist is
exactly the pin-rot this repo has a lint for.

Until then, build it and load `dist/kai-devtools.es.js` yourself, or run the demo below.

## Activation, and who decides

**It is never on automatically and never visible without a signal.** The tag can be
pasted into a live theme and left there permanently: it does nothing until something says
otherwise, which is what makes it safe to leave in.

The kit reads the signal once, synchronously, at its own init — long before this script
runs. Three sources, first hit wins:

1. `localStorage['kai-devtools']` — survives a reload, and a repro usually needs one.
2. `window.__KAI_DEVTOOLS__ = true`, set before the kit loads — for an app that wants to
   gate on its own auth or feature flag.
3. `?kai-devtools=1` in the URL — shareable, works against deployed staging with no build.

Never inferred from `NODE_ENV`: the whole point is that the bug you cannot reproduce
locally is in staging.

**First run, tag in, no signal set.** The panel registers, renders nothing at all, and
writes exactly one console line naming both ways out:

```
[kai-devtools] loaded, not activated. Add ?kai-devtools=1 to the URL, or run __KAI_DEVTOOLS_HOOK__.activate(), to record from the next page load.
```

`activate()` writes the localStorage signal and reloads. Reload is the primary path
because it is the only one that yields **history** — after it, the signal is set before
the first event and the panel opens with the session from its beginning, which is where
the answer usually is.

## Metadata only

Everything rendered is a count, a byte or character size, a duration, an id, a variant
name or a status code. No message text, no reasoning text, no tool input or output, no
URLs, no request bodies, and no provider error *messages* — codes travel, messages do
not, because some providers echo request content back inside them.

That is what makes the panel defensible on a live site: someone who activates it sees the
**shape** of a conversation, not its content. Nothing is transmitted anywhere — no
endpoint, no telemetry, no phone home. This is a panel, not a service.

## The hook contract

The kit installs `window.__KAI_DEVTOOLS_HOOK__`; the panel attaches to it.

```ts
{
  version: 1,
  recording: boolean,
  drain(): WireDiagnosticEvent[],
  subscribe(fn): () => void,
  attach(fn): () => void,   // history + live, one synchronous handover
  activate(): void,
}
```

**Use `attach`.** Pairing `drain()` with `subscribe()` is racy in both orders — drain
first and you lose an event landing between the calls; subscribe first and you get it
twice — and neither is fixable from outside, because the gap is between two calls the
caller does not control. This panel falls back to subscribe-then-drain with identity
dedupe **only** against a kit old enough to predate `attach`, which is why the feature
test is the presence of the method and never the version number.

`version` is on the hook because the panel floats free of the kit: a panel newer than the
kit it attaches to has to be able to say so. Unknown event types are counted and shown,
never thrown on.

## Running the demo

```bash
pnpm --filter @kitn.ai/devtools run build   # the panel the demo loads
pnpm --filter @kitn.ai/devtools run demo    # http://localhost:4330
```

Open **<http://localhost:4330/?kai-devtools=1>**. Three buttons, three rows:

| Button | What the panel should show |
|---|---|
| **Healthy stream** | `77 frames → 77 chunks → 1 parts`, a `stop` badge, `text 1`, a model id, first-frame and total timings |
| **Wrong dialect** | `5 frames → 0 chunks → 0 parts` **in red**, `empty-stream`, `model —` |
| **HTTP 401** | `— frames → 0 chunks → 0 parts`, a red `HTTP 401 · invalid_api_key` badge, and no body text anywhere |

Note the two em dashes. `model —` means the stream never stated one and the panel will
not invent it; `— frames` means no frame count was ever reported, which is a different
fact from zero frames.

Then load **<http://localhost:4330/>** with no query parameter: no panel in the DOM, one
console line, and the page otherwise behaves identically.

## Development

```bash
pnpm --filter @kitn.ai/devtools run test       # vitest, jsdom
pnpm --filter @kitn.ai/devtools run typecheck  # also fails on kit contract drift
pnpm --filter @kitn.ai/devtools run build
```

`typecheck` is load-bearing beyond the usual: `src/contract.ts` pins this package's local
declarations against the kit's real ones at type level, so if the kit renames a field the
build fails here naming the contract, instead of the panel silently reading `undefined`
in someone's staging environment six weeks later.
