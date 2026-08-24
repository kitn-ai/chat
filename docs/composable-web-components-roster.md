# Composable Web Components — Component Roster & API Plan

Status: **planning** (spike on branch `spike/composable-web-components`). This document gives every component in the kit a home: which become standalone custom elements, which stay SolidJS-only, and the proposed property/attribute/event/slot API for each. It's the map we build against before going wide.

See also: `docs/web-components.md` (current shipped elements) and `docs/handoff/2026-06-11-web-components-and-publishing.md` (spike context + decisions).

---

## 1. The mapping rules (how a Solid primitive becomes an element)

Each element is its own complete Solid tree (Shadow DOM + Solid root). **Composition happens at the data layer, not by splitting compound components across the DOM.** Five rules cover ~everything:

| In the SolidJS layer… | …becomes, on the web component |
|---|---|
| a `variant` / `size` / `mode` prop | a **`variant`/`size` attribute** (string) |
| including/omitting a sub-part to change the look | a **boolean flag attribute** (`hover-card`, `removable`) — resolved by `flag()` so bare attrs work |
| object/array data to display | a **JS property** (`el.messages = …`) — never an attribute |
| a **fire-and-forget** callback (`onSelect`, `onRemove`) | a non-bubbling **CustomEvent** (`select`, `remove`) |
| a callback that **returns a value** (`onTranscribe: (b) => Promise<string>`) | a **function-valued property** (`el.transcribe = async b => …`) — events can't return values |
| genuinely custom inner markup | a named **`<slot>`** (opt-in, "Route 2") |

Everything else — Solid hooks, generic headless UI primitives, and compound sub-parts — **stays in the SolidJS layer** as the escape hatch (`import { … } from '@kitnai/chat'`).

Infra already in place (Phase 0, on the spike branch): `defineKitnElement<P, E>` bakes in a shared constructable stylesheet, a typed `dispatch<E>`, and `flag(name)`.

---

## 2. Cross-element coordination — do we need a store?

**No store in v1. The host coordinates.** Because Solid Context does not cross element boundaries, separate elements share state through the host: data in via properties, out via events, host wires A→B. Example: `<kai-conversations>` fires `select` → host sets `<kai-chat>.messages`. This is the correct controlled-component model and is idiomatic in every host framework.

- We would **not** use `@stencil/store` — it's a separate reactivity system; bridging it to Solid adds cost for nothing. If we ever want a store, it'd be a tiny **Solid `createStore`** singleton, already in the bundle.
- A store only earns its place if we later want elements to **auto-coordinate without host wiring** (e.g. a `<kai-provider>` ancestor that children read). That reintroduces implicit global coupling + multi-instance ambiguity, so it's **deferred** — add opt-in only on a concrete need. SSR is explicitly out of scope.

---

## 3. Roster at a glance

Legend: ✅ shipped · 🔬 spike (this branch) · 📋 proposed · 🧩 primitive-only (stays Solid) · ⤵️ folded into another element

### Feature elements (the public web-component surface, ~28)

| Element | Source component | Status | Notes |
|---|---|---|---|
| `<kai-chat>` | (composes many) | ✅ | batteries-included |
| `<kai-conversations>` | conversation-list | ✅ | |
| `<kai-prompt-input>` | prompt-input + default-input | ✅ | |
| `<kai-thinking-bar>` | thinking-bar | 🔬 | |
| `<kai-model-switcher>` | model-switcher | 🔬 | |
| `<kai-attachments>` | attachments | 🔬 | variant+flags exemplar |
| `<kai-message>` | message (+ reasoning/tool/attachments/actions) | 📋 | **data-driven single message** — the keystone |
| `<kai-markdown>` | markdown | 📋 | |
| `<kai-code-block>` | code-block | 📋 | |
| `<kai-reasoning>` | reasoning | 📋 | |
| `<kai-tool>` | tool | 📋 | |
| `<kai-context>` | context | 📋 | |
| `<kai-chain-of-thought>` | chain-of-thought | 📋 | needs a `steps` data shape |
| `<kai-source>` / `<kai-sources>` | source | 📋 | |
| `<kai-loader>` | loader | 📋 | 12 variants |
| `<kai-feedback-bar>` | feedback-bar | 📋 | |
| `<kai-suggestions>` | prompt-suggestion | 📋 | list form |
| `<kai-slash-command>` | slash-command | 📋 | overlay/portal |
| `<kai-file-upload>` | file-upload | 📋 | dropzone + slot |
| `<kai-voice-input>` | voice-input | 📋 | **special: function property** |
| `<kai-image>` | image | 📋 | |
| `<kai-text-shimmer>` | text-shimmer | 📋 | |
| `<kai-checkpoint>` | checkpoint | 📋 | |
| `<kai-scope-picker>` | chat-scope-picker | 📋 | |
| `<kai-skills>` | message-skills | 📋 | |
| `<kai-response-stream>` | response-stream | 📋 | property-only data |
| `<kai-empty>` | empty | 📋 | slot-based |
| `<kai-container>` | chat-container | 📋 | optional; slot + scroll |

### Stays SolidJS-only

🧩 **Hooks / config:** `useAutoResize`, `useStickToBottom`, `useTextStream`, `useVoiceRecorder`, `ChatConfig`/`useChatConfig`, `configureCodeHighlighting`, `proseClass`/`textClass`, `cn`.
🧩 **Generic UI primitives:** `Button`, `Avatar`, `Tooltip`, `HoverCard`, `Collapsible`, `ScrollArea`, `Dropdown`, `Textarea`, `Badge`, `Separator`, `Resizable*`, `Skeleton`, `Dialog`. (A host framework already has these; wrapping them is surface area for no value.)

> **2026-08-24 — `Dropdown` is now element-ized as `<kai-dropdown>`, against the ruling above.** A React build test hit the gap: with no facade there is no generated wrapper, so the app imported the SolidJS component under an alias cast and mount-gated it against `getNextContextId` to keep it off the server. That is the cost the ruling did not price in: "the host framework already has these" holds for the WIDGET, not for the kit's own composition surface, which a consumer can only reach through an element. The rest of the list stands; this is one overturned entry, not a new policy.
>
> Honest open question, not resolved here: `<kai-popover>` already gives you a trigger plus arbitrary slotted content, so the real gap may have been menu SEMANTICS (`role="menu"`, roving focus, typeahead) rather than a missing element. If that is right, the two should probably converge rather than both grow.

### Folded / context-bound

⤵️ `MessageContent`/`MessageAvatar`/`MessageActions`/`MessageCopyButton` → inside `<kai-message>`. `CodeBlockCode`/`Group` → inside `<kai-markdown>`/`<kai-code-block>`. `ConversationItem` → inside `<kai-conversations>`. `ScrollButton`, `ChatContainerContent`/`ScrollAnchor` → context-bound, live inside `<kai-chat>`/`<kai-container>` (a standalone `<kai-scroll-button>` can't see another element's scroll context).

---

## 4. Proposed APIs

> Convention reminder: **bold = JS property** (objects/arrays must be set this way). Plain `name` in the attributes column = also settable as an HTML attribute. Events are non-bubbling `CustomEvent`s; listen with `el.addEventListener`.

### Phase 1 — message-rendering core (highest value: "compose your own message list")

#### `<kai-message>` — a single message row (keystone element)
Data-driven equivalent of one row inside `<kai-chat>`. Renders markdown/plain content, reasoning, tool calls, attachments, and action buttons from one object.

- **Properties:** **`message: ChatMessage`** (the whole object: `id, role, content, reasoning?, tools?, attachments?, actions?`). Or the flattened convenience props **`tools`**, **`attachments`**, **`actions`** + `content` attribute for simple cases.
- **Attributes:** `role` (`user`|`assistant`), `markdown` (flag, default on for assistant), `prose-size`.
- **Events:** `messageaction` → `{ action: ChatMessageAction }`.
- **Slots:** `actions` (Route 2) for custom action buttons.

#### `<kai-markdown>` — rendered markdown + code
- **Properties:** **`content: string`**.
- **Attributes:** `prose-size`, `code-theme`, `code-highlight` (flag).
- **Events:** none.

#### `<kai-code-block>` — one highlighted code block
- **Properties:** **`code: string`**.
- **Attributes:** `language`, `code-theme`.
- **Events:** none. (Includes a copy button; emits nothing — copy is local.)

#### `<kai-reasoning>` — collapsible reasoning block
- **Properties:** **`text: string`** (the reasoning content).
- **Attributes:** `label`, `open` (flag, controlled), `streaming` (flag, auto-open while streaming), `markdown` (flag).
- **Events:** `openchange` → `{ open: boolean }`.

#### `<kai-tool>` — tool-call panel
- **Properties:** **`tool: ToolPart`** (`type, state, input?, output?, errorText?`).
- **Attributes:** `open` (flag, default-open).
- **Events:** none.

### Phase 2 — header / meta

#### `<kai-context>` — token-usage meter
- **Properties:** **`context: { usedTokens, maxTokens, inputTokens?, outputTokens?, reasoningTokens?, cacheTokens?, estimatedCost? }`** (or individual numeric props).
- **Attributes:** none.
- **Events:** none.

#### `<kai-scope-picker>` — author/tag filter
- **Properties:** **`availableAuthors: string[]`**, **`availableTags: string[]`**, `current-label` (attr).
- **Events:** `scopechange` → `{ filters: SearchFilters | undefined }`.

#### `<kai-feedback-bar>` — thumbs up/down banner
- **Attributes:** `bar-title` (string).
- **Events:** `helpful`, `nothelpful`, `close` (no detail).

### Phase 3 — input ecosystem

#### `<kai-suggestions>` — suggestion chips/list
- **Properties:** **`suggestions: string[]`** (or `{ label, value }[]`).
- **Attributes:** `variant` (`outline`|`ghost`|`default`), `block` (flag → full-width rows), `highlight` (substring).
- **Events:** `select` → `{ value: string }`.

#### `<kai-slash-command>` — command palette overlay
- **Properties:** **`commands: SlashCommandItem[]`**, **`activeIds: string[]`**.
- **Attributes:** `compact` (flag).
- **Events:** `select` → `{ command: SlashCommandItem }`.

#### `<kai-file-upload>` — drag-drop dropzone
- **Attributes:** `multiple` (flag, default on), `disabled` (flag).
- **Events:** `filesadded` → `{ files: File[] }` (fire-and-forget — fine as event).
- **Slots:** default slot = the drop target content/trigger.

#### `<kai-voice-input>` — mic capture + transcription ⚠️ special case
Transcription is a callback that **returns** a value, so it can't be an event.

- **Properties:** **`transcribe: (audio: Blob) => Promise<string>`** (function-valued property — host supplies the transcriber).
- **Attributes:** `disabled` (flag).
- **Events:** `transcription` → `{ text: string }` (fired after `transcribe` resolves), plus optional `audiocaptured` → `{ blob: Blob }` for hosts that prefer to do everything themselves.

> This is the canonical example of the **"value-returning callback ⇒ function property"** rule. Document it prominently; it's the one shape that surprises people coming from events-only thinking.

### Phase 4 — indicators & leaves

#### `<kai-loader>` — animated loader
- **Attributes:** `variant` (`circular`|`classic`|`pulse`|`pulse-dot`|`dots`|`typing`|`wave`|`bars`|`terminal`|`text-blink`|`text-shimmer`|`loading-dots`), `size` (`sm`|`md`|`lg`), `text`.

#### `<kai-text-shimmer>` — animated shimmering text
- **Attributes:** `text` (or default slot), `duration` (number), `spread` (number).

#### `<kai-image>` — base64 / bytes image with skeleton fallback
- **Properties:** **`base64: string`** or **`bytes: Uint8Array`**, `alt` (attr), `media-type` (attr).

#### `<kai-checkpoint>` — bookmark/checkpoint button
- **Attributes:** `variant`, `size`, `tooltip`.
- **Events:** `select` (no detail).

#### `<kai-skills>` — active-skill badges
- **Properties:** **`skills: { id, name }[]`**.

#### `<kai-source>` / `<kai-sources>` — citation link(s) + hover preview
- `<kai-source>` **Attributes:** `href`, `label`, `title`, `description`, `show-favicon` (flag).
- `<kai-sources>` **Properties:** **`sources: { href, title, description }[]`**.

#### `<kai-response-stream>` — animated streaming text
- **Properties:** **`text: string | AsyncIterable<string>`** (property-only — async iterables can't be attributes).
- **Attributes:** `mode` (`typewriter`|`fade`), `speed` (number).
- **Events:** `complete` (no detail).

#### `<kai-empty>` — empty-state layout
- **Attributes:** `empty-title`, `description`.
- **Slots:** `media` (icon/illustration), default slot (actions).

#### `<kai-chain-of-thought>` — step-by-step reasoning ⚠️ needs a data shape
Today the steps are composed children. As one element it needs a **`steps` data model**:
- **Properties:** **`steps: { label: string; content?: string; status?: 'pending' | 'active' | 'complete' }[]`**.
- **Attributes:** `open` (flag).
- **Events:** `stepclick` → `{ index: number }` (optional).

### Optional

#### `<kai-container>` — scroll-aware message viewport
For hosts building a fully custom stream who still want the scroll-to-bottom behavior. Internally owns its scroll context (so it can include its own scroll button — a standalone `<kai-scroll-button>` can't reach across elements).
- **Attributes:** `scroll-button` (flag, default on).
- **Slots:** default slot = messages.

---

## 5. Open API questions to settle during build

1. **`<kai-message>` shape:** single `message` object property (recommended — matches `<kai-chat>`) vs. flattened props + slots. Pick one as canonical.
2. **`<kai-chain-of-thought>` step model:** lock the `steps[]` schema (above) — it's the one element with no natural data prop today.
3. **Function-valued properties** (`<kai-voice-input>.transcribe`): confirm the convention and document it as a first-class pattern, not an exception.
4. **Pluralization:** list-style elements (`<kai-suggestions>`, `<kai-sources>`) vs. singular item elements. Recommend list-form for anything you'd `For`-loop.
5. **Event-name casing:** all lowercase, no prefix, non-bubbling (matches shipped elements). Lock it.

---

## 6. Rollout phases

- **Phase 0 — infra** ✅ (spike): `defineKitnElement<P,E>` + shared stylesheet + `flag()` + typed `dispatch`.
- **Phase 1 — message core:** `<kai-message>`, `<kai-markdown>`, `<kai-code-block>`, `<kai-reasoning>`, `<kai-tool>`. Unlocks "compose your own message list in plain HTML." Highest value.
- **Phase 2 — header/meta:** `<kai-context>`, `<kai-scope-picker>`, `<kai-feedback-bar>` (+ `<kai-model-switcher>` 🔬).
- **Phase 3 — input:** `<kai-suggestions>`, `<kai-slash-command>`, `<kai-file-upload>`, `<kai-voice-input>`.
- **Phase 4 — indicators/leaves:** `<kai-loader>`, `<kai-text-shimmer>`, `<kai-image>`, `<kai-checkpoint>`, `<kai-skills>`, `<kai-source(-list)>`, `<kai-response-stream>`, `<kai-empty>`, `<kai-chain-of-thought>` (+ `<kai-thinking-bar>` 🔬, `<kai-attachments>` 🔬).
- **Cross-cutting (do alongside):** apply `flag()` to existing `<kai-chat>` booleans; fix `theme.css` `@import` 404; emit a custom-elements-manifest → React/Vue wrappers + `HTMLElementTagNameMap` types.

Each phase ships independently; the bundle grows ~1–3 KB gzip per element. Full roster projected ~100–120 KB gzip (projection from planning). **Actual shipped main chunk: ~80 KB gzip** after the Kobalte→DIY replacement removed ~23 KB (102.61 KB → 79.61 KB; see the 2026-06-12 handoff UPDATE for details).
