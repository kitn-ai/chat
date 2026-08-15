# LiveKit · Vercel AI Elements · prompt-kit — primary-source review

Research date **2026-08-14**. Every assertion below is labelled:
**[V]** verified in source or official docs (URL / local path given) · **[S]** secondary report · **[?]** could not determine.

Method note: for AI Elements and prompt-kit I did not rely on the docs sites. I downloaded the
actual shadcn registry JSON — which embeds the full component source — and grepped all of it.
That is the whole shipped surface, so the negative results below are exhaustive rather than
sampled. Local copies: `reg-all.json` (AI Elements, 48 files / 316,183 bytes of TSX),
`pk-registry.json` (prompt-kit, 23 items / 170,545 bytes), plus unpacked npm tarballs under `lk/`.

---

## Headline

**None of the three parses a model provider's native stream format in the browser. Not one byte.**
The three are not even the same *kind* of thing, and the reasons they don't parse differ:

| | LiveKit | AI Elements | prompt-kit |
|---|---|---|---|
| Kind | Full realtime stack (server + client + agent runtime) | shadcn registry (copy-paste TSX) | shadcn registry (copy-paste TSX) |
| Why no provider parsing | Provider work happens in the agent process; client sees a normalized LiveKit stream | Presentational only; the AI SDK does the wire | Presentational only; consumer does the wire |
| Owns a protocol? | **Yes — defines it, and ships both ends** | Inherits the AI SDK's UI Message Stream | **Owns nothing** — no transport at all |

---

# 1. LiveKit

The strongest possible form of "define your own protocol": LiveKit specifies the wire in
protobuf, and ships the server, the client SDKs, *and* the agent runtime that sits between the
app and the model providers.

### Transport **[V]**

WebRTC, with signalling and data packets defined in protobuf.

- `livekit-client@2.21.0` depends on `@livekit/protocol@1.50.4`, `webrtc-adapter@9.0.6`,
  `sdp-transform` — verified in the unpacked tarball's `package.json`
  (`lk/livekit-client-2.21.0/package/package.json`).
- `livekit/protocol` repo description, verbatim: *"LiveKit protocol. Protobuf definitions for
  LiveKit's signaling protocol"* — <https://github.com/livekit/protocol> (primary language: Go).
- Text/transcript transport is LiveKit's **text streams** over named topics, not HTTP/SSE.
  Docs, verbatim: *"Transcriptions use the `lk.transcription` text stream topic"* and *"Your agent
  monitors the `lk.chat` text stream topic for incoming text messages from its linked participant."*
  — <https://docs.livekit.io/agents/build/text/>
- Client API surface confirming this, counted from the shipped `.d.ts` files:
  `registerTextStreamHandler`, `registerByteStreamHandler`, `sendText`, `streamText`, `sendFile`,
  `streamBytes`, `publishData`, `registerRpcMethod`, `performRpc`. No HTTP streaming primitives.

### What the browser parses **[V]**

Nothing provider-shaped. I grepped **both** `livekit-client@2.21.0` (13 MB unpacked) and
`@livekit/components-react@2.9.24` (4.3 MB unpacked) for: `content_block_delta`, `choices[0]`,
`delta.content`, `api.openai.com`, `api.anthropic.com`, `text/event-stream`, `chat.completions`,
`anthropic`, `OPENAI`, `Bearer sk-`. **Zero hits across all ten probes, in both packages.**

The docs are explicit that normalization is server-side: TTS text transforms (`filter_markdown`,
`filter_emoji`) run in the agent, and *"clients never receive unprocessed model output"*
**[V]** <https://docs.livekit.io/agents/build/text/>.

### Required server **[V]**

Three distinct things must be running. This is the heaviest server requirement of the three by a
wide margin.

1. **A LiveKit server (SFU)** — `livekit/livekit`, Go, Apache-2.0, 20.3k stars. Self-host or
   LiveKit Cloud. Not optional; there is no serverless path.
2. **A token endpoint** — your backend mints a JWT access token. LiveKit ships this as a registry
   item: `nextjs-api-token-route [registry:page]`, deps `livekit-server-sdk` + `@livekit/protocol`
   (verified in `lk-agents-ui-registry.json`). Note they ship the *server route* in the same
   component registry as the UI — that is the "both sides" point made concrete.
3. **An agent worker** — a long-lived server process that joins the room and does STT → LLM → TTS.
   README verbatim: *"The Agent Framework is designed for building realtime, programmable
   participants that run on servers."* — <https://github.com/livekit/agents>

### Framework reach **[V]**

Split verdict — **transport is broadly multi-platform, UI is React-only on the web.**

- Client/transport SDKs (from `gh repo list livekit`, 109 repos): `client-sdk-js` (TS),
  `client-sdk-swift`, `client-sdk-android` (Kotlin), `client-sdk-flutter` (Dart),
  `client-sdk-react-native`, `client-sdk-unity` (C#), `client-sdk-cpp`, `client-sdk-esp32` (C),
  `rust-sdks`, `python-sdks`.
- UI component libraries: `components-js` (**React only**), `components-android` (Jetpack Compose),
  `components-flutter`, `components-swift`. **There is no vanilla-JS, web-component, Vue, Svelte
  or Angular UI package.**
- `@livekit/components-core@0.12.15` is framework-agnostic in construction (rxjs observables) but
  its own README says verbatim: *"this is a internal package and not intended to be used
  directly."* **[V]** The README also states React is the priority and other frameworks are an
  open question.
- New in this cycle: **`@livekit/agents-ui` v1.0.8** (`livekit/components-js/packages/shadcn`) —
  `"private": true`, i.e. **not published to npm**, distributed as a shadcn registry
  (`npx shadcn@latest add @agents-ui/{component-name}`, 17 items). Requires **React 19 + Tailwind
  CSS 4 + shadcn/ui**. Verified in the repo's `package.json` and `registry.json`.
  Even LiveKit's *newest* UI layer is React-19-only.
- `livekit-client` does ship a UMD build with an `unpkg` field
  (`./dist/livekit-client.umd.js`) **[V]** — so the *transport* is usable from a CDN with no
  bundler. There is no UI at that layer; you would be building the chat UI yourself.

### Polyglot backend answer

**Partially yes for your app server, no for the agent.** **[V]**

- Your existing backend only needs to mint tokens and call room APIs. Server SDKs exist for
  **Go, Ruby, Python, Node, Rust, Java/Kotlin** (`server-sdk-go`, `server-sdk-ruby`,
  `server-sdk-kotlin`, `node-sdks`, `python-sdks`, `rust-sdks`). A Rails or Go shop is fine here.
  PHP token examples appear in the docs **[S]**. **Elixir: no first-party SDK** — I found none in
  the 109-repo org listing **[V, negative]**.
- **But the agent framework is Python or Node.js only** — `livekit/agents` (Python, `>=3.10,<3.15`,
  v1.6.10, uploaded 2026-08-13) and `livekit/agents-js` (`@livekit/agents` v1.6.3, 2026-08-12)
  **[V, PyPI + npm]**. An Elixir or Go shop must run a **Python or Node sidecar** for the agent
  itself. The token endpoint being polyglot does not rescue this.
- Plus the SFU. Self-hosting `livekit/livekit` is real infrastructure — media servers, TURN,
  scaling.

**Evidence quality: high.** Package contents, protobuf repo, org repo listing, PyPI/npm release
dates, and official docs all agree. Nothing here rests on a blog post.

---

# 2. Vercel AI Elements

### What it is **[V]**

A **shadcn-style copy-paste registry**, not a runtime library. This matters and is easy to get
wrong, because there *is* an `ai-elements` package on npm.

I unpacked it. `ai-elements@1.9.0` is **3,472 bytes** containing exactly four files
(`index.js`, `package.json`, `README.md`, `LICENSE`). `index.js` is a ~55-line shim whose entire
job is to shell out:

```
npx -y shadcn@latest add https://elements.ai-sdk.dev/api/registry/<component>.json
```

There is **no runtime code in the npm package at all**. Apache-2.0, author Hayden Bleasel (Vercel).
Repo `vercel/ai-elements`, 2,326 stars, last pushed 2026-08-01. The registry is served live from
`elements.ai-sdk.dev`, so its contents move independently of the npm shim's version.

Registry contents: **48 components** — `agent`, `artifact`, `attachments`, `canvas`,
`chain-of-thought`, `conversation`, `message`, `prompt-input`, `reasoning`, `sandbox`, `task`,
`terminal`, `tool`, `transcription`, `web-preview`, and more.

### What the browser parses **[V]**

**Nothing.** Grepping all 316,183 bytes of registry source:

| probe | hits |
|---|---|
| `text/event-stream` | 0 |
| `EventSource` | 0 |
| `getReader` | 0 |
| `TextDecoderStream` | 0 |
| `content_block_delta` | 0 |
| `choices[0]` / `delta.content` | 0 |
| `api.openai.com` / `api.anthropic.com` | 0 |
| `Authorization` / `apiKey` | 0 |
| `fetch(` | **1** |

The single `fetch(` is `convertBlobUrlToDataUrl` in `prompt-input.tsx` — reading a local `blob:`
URL for an attachment preview. It is not network I/O in any meaningful sense.

### The coupling is **types only**, and this is the interesting finding **[V]**

Twelve files import from `ai` — and **every one of them is `import type`**. I grepped specifically
for non-type imports from `ai` or `@ai-sdk/*` across all 48 files: **zero**.

```
conversation.tsx   import type { UIMessage } from "ai"
message.tsx        import type { UIMessage } from "ai"
tool.tsx           import type { DynamicToolUIPart, ToolUIPart } from "ai"
prompt-input.tsx   import type { ChatStatus, FileUIPart, SourceDocumentUIPart } from "ai"
context.tsx        import type { LanguageModelUsage } from "ai"
agent.tsx          import type { Tool } from "ai"
...
```

So AI Elements is **shape-coupled to the AI SDK's `UIMessage` part model but carries no AI SDK
runtime**. It renders a data structure; it has no opinion about how that structure arrived.
The transport is 100% the consumer's problem, and the library hands them nothing for it.

### Required server **[V]**

Formally: nothing — these are presentational components. Practically: the documented path is
`useChat` from `@ai-sdk/react`, which speaks the **AI SDK UI Message Stream** protocol, so your
endpoint must emit that protocol.

That protocol is a real, documented, language-neutral spec. From the primary source
(`vercel/ai` → `content/docs/04-ai-sdk-ui/50-stream-protocol.mdx`, lines 13–16 and 120–121, fetched
via the GitHub API):

> "You can use this information to develop custom backends and frontends for your use case, e.g.,
> to provide compatible API endpoints that are implemented in a different language such as Python."
>
> "For instance, here's an example using [FastAPI](https://github.com/vercel/ai/tree/main/examples/next-fastapi) as a backend."
>
> "When you provide data streams from a custom backend, you need to set the
> `x-vercel-ai-ui-message-stream` header to `v1`."

SSE part types include `message-start`, `text-start`/`text-delta`/`text-end`,
`reasoning-*`, `source-url`, `source-document`, `file`, `data-*`, `tool-input-start`,
`tool-input-delta`, `tool-input-available`, `tool-approval-request`, `tool-output-available`,
`start-step`, `finish-step`, `finish`, `error`, `abort`, terminated by `[DONE]`.

### Framework reach **[V]**

**React 19 only**, with Next.js documented as a prerequisite.

Documented prerequisites, from <https://elements.ai-sdk.dev/setup>: Node.js 18+, **React 19**,
**Next.js 14+** (App Router recommended), AI SDK installed, shadcn/ui initialized, **Tailwind CSS 4**.

An honest caveat, verified rather than assumed: I grepped all 48 files for `next/` imports and
found **zero** (40 of 48 carry `'use client'`). So the components are in practice portable to any
React 19 + Tailwind 4 bundler setup; the Next.js prerequisite is documentation, not code. That is a
real out, but it is undocumented and unsupported, and it does not extend past React.

Worth separating from this: the layer *below* AI Elements — AI SDK UI (`useChat`) — **is**
multi-framework (React, Vue, Svelte, Angular, plus community SolidJS) **[V]**
<https://ai-sdk.dev/docs/ai-sdk-ui/overview>. So Vercel's *protocol* has broad framework reach
while their *components* have none. The components are the narrow part.

### Polyglot backend answer

**Yes, with real work — and this is the best of the three on this axis.** **[V]**

A Python/Go/Elixir/Rails shop must implement the UI Message Stream v1 spec on their endpoint:
SSE, `x-vercel-ai-ui-message-stream: v1`, and the ~20 typed part events above, including correct
`start`/`delta`/`end` ID pairing for text, reasoning and tool-input. Vercel explicitly blesses this
and ships a FastAPI example. Community ports exist (e.g. `elementary-data/py-ai-datastream`,
described as a Python implementation of the protocol) **[S — found via search, not source-reviewed]**.

The costs to be clear about:
- You are reimplementing someone else's evolving protocol. `x-vercel-ai-ui-message-stream: v1`
  implies a v2.
- **No bundler is not an option.** The deliverable is `.tsx` source requiring React 19, Tailwind 4
  and shadcn/ui. There is no CDN build, and there cannot be one — the components are shipped as
  uncompiled source by design.
- Alternatively you skip `useChat` entirely and hand-roll browser state producing `UIMessage`-shaped
  objects. AI Elements will render them happily. But then you've written your own parser and state
  layer, which is precisely the work in question.

**Evidence quality: high.** Package tarball unpacked and read; full registry source grepped;
protocol statement quoted from the repo's own mdx via the GitHub API rather than the rendered docs.

---

# 3. prompt-kit

### What it is **[V]**

A **shadcn registry**, and unlike AI Elements there is **no npm package at all** —
`npm view prompt-kit` returns **E404, "not in this registry"**. Distribution is entirely
`npx shadcn@latest add prompt-kit/<component>`, served from `https://prompt-kit.com/c/<name>.json`
(confirmed: HTTP 200, and a full `registry.json` at 201,747 bytes).

Repo `ibelick/prompt-kit`, **MIT**, 2,973 stars, **last pushed 2026-03-12** — five months stale as
of today, notably less active than AI Elements (2026-08-01).

23 registry items: 21 of type `registry:ui` (the actual primitives) and 2 of type `registry:item`
(`chatbot`, `tool-calling` — full example blocks). All files are `.tsx`/`.ts`.

### What the browser parses **[V]**

**Nothing.** Same probe set over all 170,545 bytes:

`text/event-stream` 0 · `EventSource` 0 · `getReader` 0 · `TextDecoderStream` 0 ·
`content_block_delta` 0 · `choices[0]` 0 · `delta.content` 0 · `api.openai.com` 0 ·
`api.anthropic.com` 0 · `Authorization` 0 · `apiKey` 0 · **`fetch(` 0**

Not a single network call in the entire library.

### It is even less coupled than AI Elements — the standout finding **[V]**

I checked every item individually for AI SDK contact. **All 21 `registry:ui` primitives have zero
AI SDK dependency — not even a type import.** `prompt-input`, `message`, `chat-container`,
`response-stream`, `reasoning`, `tool`, `source`, `chain-of-thought`, `steps`, `thinking-bar`,
`feedback-bar` etc. declare deps like `shiki`, `react-markdown`, `lucide-react`, `use-stick-to-bottom`
and nothing else.

They **redeclare** the shapes locally instead of importing them. `tool.tsx` defines its own:

```ts
export type ToolPart = {
  type: string
  state: "input-streaming" | "input-available" | "output-available" | "output-error"
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  toolCallId?: string
  errorText?: string
}
```

That is structurally the AI SDK's `ToolUIPart` state machine, declared independently — convergence
on the AI SDK's *vocabulary* without a dependency on it. And `response-stream` takes
`textStream: string | AsyncIterable<string>` — about as transport-neutral as an API can be.

The only two items touching the AI SDK are the `registry:item` blocks `chatbot` and `tool-calling`,
whose deps are `["ai", "@ai-sdk/openai", "zod", "@ai-sdk/react", ...]` — and both ship a
**Next.js server route** in the same item (`app/api/primitives/chatbot/route.ts`,
`app/api/primitives/tool-calling/route.ts`). So the AI SDK coupling lives entirely in the
demo blocks, which include their own backend, not in the library.

### Required server **[V]**

**Anything that speaks HTTP — or nothing at all.** prompt-kit's primitives never make a request.
You feed them props. This is genuinely the most backend-agnostic of the three.

### Framework reach **[V]**

**React only.** All 43 registry files are `.tsx`/`.ts`; the components use React hooks throughout;
shadcn/ui (React) is a stated prerequisite. No Vue/Svelte/Angular/web-component variant exists.
Zero `next/` imports, so it is portable across React bundlers.

### Polyglot backend answer

**Yes for the wire, no for the frontend stack.** **[V]**

A Python/Go/Elixir/Rails backend can drive prompt-kit over literally any protocol you like — the
components impose none. That is a genuine strength and the direct opposite of AI Elements'
`UIMessage` shape assumption.

The catch is that prompt-kit gives you **nothing at all** for the streaming problem. No parser,
no state fold, no encoder. You write the SSE reader, the delta accumulation, the tool-call
assembly and the reasoning-block handling yourself, in the browser, from scratch — for whatever
your Rails app happens to emit. prompt-kit renders the result. Given the whole difficulty of a
polyglot backend is exactly that layer, "backend-agnostic" here means "the hard part is out of
scope," not "the hard part is solved."

And still: React 19-ish, Tailwind, shadcn/ui, `.tsx` source, **bundler mandatory**. No CDN path.

**Evidence quality: high** for everything above (full registry source read, npm 404 confirmed,
repo metadata via GitHub API). **[?]** on the project's future — 5 months without a push is a
signal but not a conclusion.

---

# 4. The category survey — is the framework-agnostic slot actually empty?

Run as a separate exhaustive sweep of npm and GitHub. Short answer: **the category is not
literally empty, but the specific shape we occupy is.** Correcting the prior assumption — it is
*not* just Deep Chat out there, and two of the new names matter.

### Real framework-agnostic / custom-element candidates found **[V unless noted]**

| Project | Reach | Type | Version / last publish | Weekly dl | Alive? |
|---|---|---|---|---|---|
| **deep-chat** (known) | Lit WC + React wrapper | Library, **one** element | 2.5.0 / 2026-07-19 | 20,410 | Yes |
| **OpenAI ChatKit** `@openai/chatkit` | `<openai-chatkit>` + React bindings | **Hosted embed**; npm pkg is *types only* | 1.9.0 / 2026-07-31 | 88,595 | Yes |
| **IBM Carbon AI Chat** `@carbon/ai-chat` | Lit WCs + React | Library, but one opinionated chat *app* | 1.18.0 / 2026-07-30 | 7,328 | Yes |
| **A2UI** `@a2ui/lit` (Google) | Lit WCs + React/Angular/Vue | Generative-UI **protocol** renderer | 0.10.3 / 2026-08-03 | 808,911 | Very (16.1k★) |
| **Syncfusion** `@syncfusion/ej2-interactive-chat` | One JS core + thin React/Angular/Vue wrappers (not WCs) | Commercial | 34.2.2 / 2026-08-05 | 60,199 | Yes |
| **Kendo/Telerik Conversational UI** | **Four separate implementations** | Commercial | ng 25.0.0 / react 16.0.0 | ~104k | Yes |
| **nlux** `@nlux/core` | Vanilla JS core + React, **not** WCs | Library | 2.17.1 / **2024-08-15** | 7,935 | **Dormant** |
| `@ai-chat-ui-kit/*` | Lit WCs `<ai-chat>` `<ai-message>` `<ai-tool-call>` + headless core | Closest structural analogue found | 0.2.5 / 2026-05-16 | **~30** | **Hobby, 1★** |

Single-framework, verified via `peerDependencies`, so they don't count: `@chatscope/chat-ui-kit-react`,
`react-chatbotify` (no WC build), `@botpress/webchat`, `@gradio/chatbot` (Svelte), `@chainlit/react-client`,
`@fluentui-copilot/*`, `botframework-webchat`.

### Does anyone else ship browser-side provider parsers? **[V]**

**Effectively no, and nobody but Deep Chat ships Anthropic SSE at all.**

- **deep-chat** — baseline confirmed by tarball grep of 2.5.0: `content_block_delta` ×6,
  `api.anthropic.com` ×5, `anthropic-dangerous-direct-browser-access` ×3, `choices[0]` ×64.
- **`@ai-chat-ui-kit/core`** — the only other hit, and it is instructive. Hardcodes
  `https://api.openai.com/v1/chat/completions` and an `extractContentFromChunk` reading
  `data.choices[0].delta.content`. **Its README advertises "Built-in adapters for OpenAI,
  Anthropic, and custom APIs" — the string "Anthropic" appears in the README and nowhere else in
  the code. There is no Anthropic implementation.** 30 weekly downloads, 1 star.
- **nlux does NOT parse** — worth correcting, since it looks like a counterexample. `@nlux/openai`
  declares `dependencies: { openai: "^4" }` and bundles OpenAI's official **Node SDK** into the
  browser with `dangerouslyAllowBrowser` ×6. It does not parse SSE itself. Its entry point is
  literally named `createUnsafeChatAdapter`, and the docs disclaim it: *"for testing purposes... in
  a production setup you should build your own server."*
- **Carbon AI Chat** — zero occurrences of `openai`/`anthropic`/`gemini`/`claude` in `dist`. Its
  contract is `customSendMessage`: its own protocol, consumer fetches. Same pattern as the six.
- **ChatKit** — the npm tarball contains **only** `.d.ts` files, no runtime JS. The element is
  CDN-delivered and requires a ChatKit server (OpenAI-hosted, or self-hosted via a **Python** SDK).

GitHub code search closes it: `content_block_delta "@customElement"` → **2 results total**, both
non-libraries. `"content_block_delta" "choices[0].delta" language:TypeScript` → 518 results, every
one a gateway, router, CLI or server. **No UI component library among them.**
GitHub repo search `chat custom element lit ai` → **0 results.**

### Two findings that cut against our positioning, stated plainly

1. **Syncfusion is a real counterexample to "nobody ships one core across frameworks."** One
   genuine JS core with thin React/Angular/Vue wrappers, 60k weekly downloads. It is commercial and
   not custom elements — but the architecture claim needs the qualifier.
2. **A2UI is Google's, and it has momentum web components otherwise lack** — 16.1k stars, 808k
   weekly downloads on the Lit renderer, pushed the day of this research. It is a generative-UI
   *protocol* renderer, not a chat thread library, so it overlaps our card/artifact layer rather
   than the thread. Not a competitor today; the thing to watch.

### What is actually empty **[V]**

Of the three serious framework-agnostic custom-element entries, **each is one monolithic element**
— `<deep-chat>`, `<cds-aichat-container>`, `<openai-chatkit>` — and ChatKit isn't even installable.
A **composable multi-element web-component library** you assemble from parts has exactly one other
occupant, at 30 weekly downloads and 1 star, whose headline provider claim is vapour. And the
combination **framework-agnostic custom elements + first-class native provider SSE parsing** has
exactly one prior occupant, Deep Chat, which disclaims its own adapters.

---

# Verdict

> **Does any of these three serve a consumer with a non-JS backend and no bundler?**

**No. Not one of the three, and the "no bundler" half is not close.**

Taking the two halves separately, because they fail differently:

**Non-JS backend — two of three can be made to work, at a cost.**

- **prompt-kit** is the most permissive: it assumes no protocol whatsoever, so a Rails or Elixir
  backend can emit anything. But it hands you nothing for the wire — you write the browser-side
  stream reader and state accumulation yourself. It solves the rendering problem and declares the
  streaming problem out of scope.
- **AI Elements** is the most *supported*: Vercel documents the UI Message Stream as a wire format
  and explicitly blesses non-JS implementations with a FastAPI example. A Go or Python shop
  implements ~20 SSE part types plus the `x-vercel-ai-ui-message-stream: v1` header and gets a
  polished component set. That is real, and it is the strongest polyglot story of the three — but
  it means implementing and then tracking someone else's versioned protocol.
- **LiveKit** is the hardest. Your app server can be Go or Ruby (token minting only), but the
  **agent must be Python or Node**, and you must additionally run an SFU. A non-JS/non-Python shop
  is running a sidecar in a language they didn't choose, plus media infrastructure. Different
  domain, and priced accordingly.

**No bundler — a flat no, three times over, for a structural reason.**

- Both AI Elements and prompt-kit ship **uncompiled `.tsx` source** as their deliverable. That is
  not an oversight to be fixed in a later release; it is the entire shadcn premise — the components
  become your code so you can edit them. A CDN build would defeat the distribution model. Both
  additionally require React 19 + Tailwind + shadcn/ui already configured.
- LiveKit's UI is `@livekit/components-react` (React) or the React-19-only `@agents-ui` registry.
  Its `livekit-client` transport *does* ship a UMD bundle with an `unpkg` field and works from a
  CDN — but that gives you WebRTC plumbing and no chat UI, and it still needs an SFU and an agent
  behind it.

**What this adds to the picture.** These three don't contradict the earlier six-library finding so
much as sharpen it into three distinct positions, none of which is ours:

1. **LiveKit — own the whole stack.** Protobuf wire, own SFU, own agent runtime, own client SDKs
   on ten platforms. The most complete "define your own protocol" answer available, and the proof
   is that they ship the token *route* inside the component registry. Provider parsing exists, in
   Python and Node, on the server, where the key is.
2. **AI Elements — own the protocol, rent the components.** The wire is Vercel's spec (portable,
   documented, versioned); the components are React-19 source you copy in.
3. **prompt-kit — own nothing.** Pure presentation, no transport opinion at all. The most
   backend-agnostic and the least helpful precisely where a polyglot consumer needs help.

Across all three: **zero lines of provider-native stream parsing in any browser-side code**, over
roughly 500 KB of component source and 17 MB of unpacked client SDK, verified by exhaustive grep
rather than sampling. And **all three are React-only on the web** — LiveKit's framework-agnostic
`components-core` is marked internal-use-only in its own README, which is about as clear a
statement as exists that nobody in this set is pursuing framework independence on the client.

Widening to the whole category (§4) doesn't change that. Nine libraries have now been checked in
source. The framework-agnostic ones that exist are single monolithic elements; the composable
web-component library is a one-star hobby project; and browser-side Anthropic parsing exists in
exactly one shipped package, which disclaims it. The two honest qualifiers to carry forward are
that **Syncfusion does run one core across four frameworks** (commercially, not as custom
elements), and that **A2UI has the only real web-component momentum in the space** — adjacent to
us today, at the card layer rather than the thread.
