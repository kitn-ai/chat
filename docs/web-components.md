# Kitn Web Components

## Overview

<!-- spec:overview -->
`@kitn.ai/ui` ships 89 framework-agnostic custom elements built on the SolidJS kit.

| Tag | Purpose |
|-----|---------|
| `<kai-chat>` | Full chat UI — message list plus prompt input |
| `<kai-conversations>` | Sidebar conversation browser with group support |
| `<kai-prompt-input>` | Standalone text-input area with send button |
| + 86 composable primitives | See the full roster below |
<!-- /spec:overview -->

Each element renders into its own **Shadow DOM** so the host page's CSS cannot leak in, and the kit's Tailwind classes cannot leak out. SolidJS and all kit dependencies are bundled inside the element bundle — the host does not need SolidJS.

The authoritative machine-readable API is the **Custom Elements Manifest** at `dist/custom-elements.json` (`customElements` field in `package.json`). The human- and agent-readable summary files are `llms.txt` (orientation) and `llms-full.txt` (full per-element reference, generated from the manifest — do not edit by hand).

---

## How the elements work (read this first)

- **Controlled, not stateful.** The host owns the data. You push it in via JS **properties** (`el.messages = …`, `el.conversations = …`), the element pushes interactions out via **events**, and you update the properties in response. The element keeps no message store of its own — to stream a reply you keep reassigning `el.messages`.
- **Data in = properties, config = attributes, data out = events.** Object/array data (messages, models, context) must be set as properties; simple config (`theme`, `prose-size`, `search`) also works as attributes.
- **Opt-in by data/flags.** Features appear when you give them data: pass `models` → a model switcher; pass `context` → a token meter; set `search`/`voice` → those buttons. Omit them → they don't render. Re-theme with `--kai-*` tokens.

### What `<kai-chat>` includes vs. the primitive layer

`<kai-chat>` is the **drop-in** layer. Per message it renders: Markdown + code highlighting, **reasoning** blocks, **tool-call** panels, **attachments**, and **action buttons** (copy/like/dislike/regenerate). It also offers the header (title + model switcher + context meter), a scroll-to-bottom button, suggestions, and the input toolbar.

Some kit features are **primitive-only** — not surfaced by the web component: **ChainOfThought**, **FeedbackBar**, **ThinkingBar / TextShimmer** (animated "thinking"), **VoiceInput**, **FileUpload**, **SlashCommand**. If you need those, custom layout/placement, or anything the props don't cover, **compose the SolidJS primitives directly** (`import { … } from '@kitn.ai/ui'` — everything is exported). No forking required: tune via props/tokens, or drop to the primitive layer.

---

## Install / Build

### Build the bundle

```bash
npm run build
```

Internally this runs `build:css` (compiles Tailwind to `src/elements/compiled.css`) then `vite build`, producing:

| File | Format | Notes |
|------|--------|-------|
| `dist/kai.es.js` | ES module | Main entry. ~110 KB gzip; lazy chunks for code highlighting load on demand |

The build is **ES-module only** by design. A UMD/IIFE build cannot code-split, so it would have to inline every lazy chunk (all the Shiki syntax-highlighting languages) into one multi-MB file. The ES build keeps those chunks lazy and is loadable directly via `<script type="module">` in every modern browser.

### Register the elements

Import the ES module as a side-effect. Every element the bundle ships registers itself via `customElements.define`:

```js
import '@kitn.ai/ui/elements';
```

The `./elements` export in `package.json` resolves to `dist/kai.es.js`.

For plain HTML pages:

```html
<script type="module" src="./dist/kai.es.js"></script>
```

---

## Usage Pattern

All rich props (arrays, objects) must be set as **JavaScript properties**, not HTML attributes. Events are standard DOM `CustomEvent`s dispatched on the host element. They do **not** bubble and are **not** composed — listen directly on the element (`el.addEventListener(...)`).

**Boolean attributes** behave like normal HTML: a bare attribute turns the flag on, and `="false"` (or omitting it) turns it off. All of these are equivalent — `<kai-chat loading>`, `<kai-chat loading="true">`, and `el.loading = true`; `<kai-chat loading="false">`, omitting it, and `el.loading = false` all leave it off.

```html
<script type="module">
  import '@kitn.ai/ui/elements';

  const chat = document.querySelector('kai-chat');

  // Set rich props as JS properties. A message's content is an ordered
  // `parts` array (see the ChatMessage schema below).
  chat.messages = [
    { id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Hello! How can I help?' }] }
  ];

  // Listen for events via addEventListener
  chat.addEventListener('kai-submit', (e) => {
    console.log('user sent:', e.detail.value);
  });
</script>

<kai-chat></kai-chat>
```

### TypeScript

Importing the elements entry augments `HTMLElementTagNameMap`, so DOM lookups are typed (props autocompleted, wrong assignments rejected):

```ts
import '@kitn.ai/ui/elements';
const chat = document.querySelector('kai-chat'); // : KaiChatElement | null
chat!.messages = [/* … */];                        // typed
```

A [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest) (`customElements` in `package.json`) ships too, for editor autocomplete in HTML.

### React

Typed wrappers are generated for every element under `@kitn.ai/ui/react` (React is an optional peer dependency). They set rich data as DOM **properties** (so arrays/objects pass through correctly) and expose CustomEvents as `on<Event>` props:

```tsx
import { Chat } from '@kitn.ai/ui/react';

<Chat
  messages={messages}
  models={models}
  onSubmit={(e) => send(e.detail.value)}
  onMessageAction={(e) => handle(e.detail)}
/>;
```

Component names are the bare friendly name of the element (`kai-chat` → `Chat`); event props are `on` + the event name with the `kai-` prefix stripped and each hyphen-segment PascalCased (`kai-message-action` → `onMessageAction`).

---

## Full Element Reference

Every element also accepts a `theme` attribute (`'light' | 'dark' | 'auto'`, default `'auto'`). Array/object properties are marked with a `—` in the Attribute column — they **must** be set as JS properties.

---

### `<kai-chat>` / `Chat`

<!-- spec:kai-chat -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `value` | — | `undefined | string | ({ type: "text"; text: string } | { type: "entity"; entity: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> } })[]` | — | Value of the input. A **string** is controlled (the host owns the text and updates it on `kai-value-change`). A **ComposerDoc** is a one-time seed that pre-populates pills; the user then edits freely. Leave unset for uncontrolled. |
| `placeholder` | `placeholder` | `undefined | string` | `'Send a message...'` | Placeholder text shown in the empty input. |
| `loading` | `loading` | `undefined | false | true` | `false` | When true, shows the loading/streaming state and disables submit (use while awaiting the assistant's reply). |
| `suggestions` | — | `undefined | string[]` | — | Starter prompts shown above the input when the thread is empty. Clicking one follows `suggestionMode`. Set as a JS property. |
| `suggestionMode` | `suggestion-mode` | `undefined | "submit" | "fill"` | `'submit'` | What clicking a suggestion does: `'submit'` (default) sends it immediately as if typed and submitted; `'fill'` just places it in the input. |
| `persistSuggestions` | `persist-suggestions` | `undefined | false | true` | `false` | Keep suggestions visible after the conversation starts. By default suggestions are conversation starters and hide once `messages` is non-empty; set this to keep them always shown. Default false. |
| `proseSize` | `prose-size` | `undefined | "xs" | "sm" | "base" | "lg"` | `'sm'` | Body/prose font scale for rendered markdown (`'xs' | 'sm' | 'base' | 'lg'`). Defaults to `'sm'`. |
| `codeTheme` | `code-theme` | `undefined | string` | `'github-dark-dimmed'` | Shiki theme name for syntax-highlighted code blocks (e.g. `'github-dark-dimmed'`). |
| `codeHighlight` | `code-highlight` | `undefined | false | true` | `true` | Enable Shiki syntax highlighting in code blocks. Turn off to render plain `<pre>` blocks (lighter, no highlighter load). Default true. |
| `reasoning` | `reasoning` | `undefined | "full" | "compact" | "off"` | — | How `reasoning` parts render across the thread. `'full'` (default) is the current collapsible-disclosure behavior; `'compact'` shows only a shimmer loader while a reasoning part streams and nothing once it settles (no expandable detail); `'off'` renders reasoning parts not at all. Forwarded to every `MessageBody` as `reasoningMode`. |
| `reasoningOpen` | `reasoning-open` | `undefined | false | true` | — | Seeds the reasoning disclosure open AND keeps it tracking the stream (open while streaming, closes when it settles): the pre-Task-19f `full` behavior. Default false/absent: the panel starts closed (just the "Thinking" shimmer chip) and only opens on click, the current default (owner ruling, 2026-08-26). Meaningless when `reasoning` is `'compact'` or `'off'`. Forwarded to every `MessageBody` as `reasoningDefaultOpen`. |
| `chatTitle` | `chat-title` | `undefined | string` | — | Optional header title shown on the left of the header. |
| `models` | — | `undefined | { id: string; name: string; provider?: undefined | string; description?: undefined | string; group?: undefined | string }[]` | — | Optional model list. When set (>1 model) a ModelSwitcher is shown in the header and a `kai-model-change` event fires on selection. |
| `currentModel` | `current-model` | `undefined | string` | — | The currently selected model id (pairs with `models`). |
| `context` | — | `ContextData | undefined` | — | Optional context-window token usage. When set, a Context token meter is shown in the header. |
| `scrollButton` | `scroll-button` | `undefined | false | true` | `true` | Show the scroll-to-bottom button inside the scroll area. Default true. |
| `headerStart` | `header-start` | `undefined | false | true` | — | Whether the host has `slot="header-start"` content (left of the title). Set by the `<kai-chat>` facade so a custom control forces the header open. |
| `headerEnd` | `header-end` | `undefined | false | true` | — | Whether the host has `slot="header-end"` content (right of the controls). |
| `headerFull` | `header-full` | `undefined | false | true` | — | REPLACE: full custom header in place of the built-in title/model/context bar. |
| `sidebar` | `sidebar` | `undefined | false | true` | — | INJECT: left sidebar column (e.g. a conversation list / your own nav). |
| `empty` | `empty` | `undefined | false | true` | — | REPLACE: custom zero-state rendered in the message area while the thread is empty (replaces the empty message list only; the composer and its suggestions still render). |
| `composer` | `composer` | `undefined | false | true` | — | REPLACE: full custom composer in place of the built-in prompt input. The projected content wires its own submit (the data-flow boundary). |
| `composerActions` | `composer-actions` | `undefined | false | true` | — | INJECT: accessory row just above the composer (e.g. extra actions). |
| `footer` | `footer` | `undefined | false | true` | — | INJECT: footer row below the composer (disclaimers, token meter, …). |
| `attach` | `attach` | `undefined | false | true` | `true` | When `false`, hides the built-in paperclip attach button. Defaults to `true` (undeclared keeps today's behavior: attach visible), matching `DefaultPromptInput`'s own default: only an explicit `false` hides it. |
| `webSearch` | `web-search` | `undefined | false | true` | `false` | Show a web-search (Globe) button in the input toolbar; calls `onWebSearch`. |
| `voice` | `voice` | `undefined | false | true` | `false` | Show a Voice (Mic) button in the input toolbar; fires a `voice` event. |
| `triggers` | — | `undefined | { char: string; kind: string; items?: undefined | { id: string; label: string; icon?: undefined | string; description?: undefined | string; group?: undefined | string; kind?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> }[] }[]` | — | Rich entity triggers. Each `{ char, kind, items }` opens a caret-anchored menu that inserts an atomic pill (`/` skills, `@` agents/plugins). Set as a JS property; forwarded to the input. |
| `kindIcons` | — | `undefined | Record<string, string>` | — | Default icon per entity kind (kind → image src) for pills/menu items. |
| `actionsReveal` | `actions-reveal` | `undefined | "always" | "hover"` | `'always'` | Whether each message's action bar is always visible (`'always'`, default) or only revealed on hover of that message row (`'hover'`). |
| `userActions` | — | `undefined | ("copy" | "dislike" | "edit" | "like" | "regenerate" | "speak" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]` | — | Role-scoped DEFAULT action bars (B-7b): a user message with no `actions` of its own gets `userActions`; an assistant message, `assistantActions`. A per-message `m.actions` OVERRIDES the role default — override = replace, not merge — so a message that sets `actions: []` renders NO action bar even when a role default is set. Set as JS properties. |
| `assistantActions` | — | `undefined | ("copy" | "dislike" | "edit" | "like" | "regenerate" | "speak" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]` | — | See `userActions` — the assistant-role default. |
| `hideSources` | `hide-sources` | `undefined | false | true` | `false` | Hide the citations row consecutive `source` parts collapse into (`part="citations"`, message.tsx). Named as a HIDE, not `sources: boolean`, so absence-means-default stays unambiguous: absent/false is today's rendering, byte-for-byte (B-8). |
| `accept` | `accept` | `undefined | string` | — | Which attachment media types the user may stage, in HTML `accept` syntax: `<kai-chat accept="image/*,application/pdf">`. A plain string, so unlike `messages` it DOES work as an attribute. Omitted means no filter. MEDIA TYPES ONLY -- exact (`image/png`) or subtype wildcard (`text/*`). HTML allows a file extension here and this does not: `accept=".py"` THROWS with the entry named, rather than silently resolving to a picker that accepts nothing. It can only NARROW what the kit can already encode: `accept="image/*"` resolves to the four image formats both APIs take, not to every image type the OS offers. Pass the SAME string to `toOpenAIMessages(msgs, { accept })` and the picker and the wire cannot disagree -- both resolve it through `resolveMediaPolicy` against one declaration. That declaration is readable as `encodableMediaTypes()` from `@kitn.ai/ui/wire`, if you would rather build your own picker than use this prop. |
| `messages` | — | `undefined | { id: string; role: "user" | "assistant"; parts: ({ type: "text"; text: string; raw?: undefined | { source: string; payload: unknown } } | { type: "reasoning"; text: string; label?: undefined | string; index?: undefined | number; streamId?: undefined | string; signature?: undefined | string; raw?: undefined | { source: string; payload: unknown } } | { type: "tool"; tool: { type: string; kind?: undefined | "command" | "file-change" | "search" | "fetch" | "mcp" | "image" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }; raw?: undefined | { source: string; payload: unknown } } | { type: "card"; envelope: { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }; raw?: undefined | { source: string; payload: unknown } } | { type: "source"; source: { id?: undefined | string; url?: undefined | string; title?: undefined | string; snippet?: undefined | string; index?: undefined | number }; raw?: undefined | { source: string; payload: unknown } } | { type: "file"; attachment: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }; raw?: undefined | { source: string; payload: unknown } })[]; actions?: undefined | ("copy" | "dislike" | "edit" | "like" | "regenerate" | "speak" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]; avatar?: undefined | { src?: undefined | string; fallback?: undefined | string; alt?: undefined | string }; feedback?: undefined | "like" | "dislike" }[]` | `[]` | The full message thread to render, newest last. Each entry carries its role, ordered `parts`, and optional actions/avatar/feedback. Set as a JS property (`el.messages = [...]`); a NEW array reference per streaming chunk re-renders (mutating in place does not). Omit for an empty thread. Re-declared here (rather than inherited from `ChatThreadProps`) because the ELEMENT registers a `[]` default and renders the empty state without it, while the SolidJS `<ChatThread>` component still requires it. The facade hands it a validated array either way. Matches `<kai-thread>`. |
| `cardTypes` | — | `undefined | Record<string, string>` | — | Optional card type -> custom-element tag overrides/additions for `card` parts (merged over the built-ins). Property: `el.cardTypes`. Typed as a plain string map (not the `CardTagMap` alias) so the generated React wrapper inlines it instead of emitting an unresolved named type. |
| `cardSchemas` | — | `undefined | Record<string, object>` | — | JSON Schemas for the card types this app renders, keyed by envelope type. The companion of `cardTypes`, which says what DRAWS a card while this says what a VALID one looks like. An OBJECT, so it is a JS property only: `el.cardSchemas = { 'pricing-table': pricingSchema }`, never an attribute. `createCardRegistry(...).validationSchemas` is exactly this shape. Without it the kit validates its own seven built-ins and leaves your own card type, the one your app actually cares about, as the only unchecked thing on screen. A schema here WINS over a built-in of the same name. Typed `Record<string, object>` rather than `Record<string, JsonSchema>` deliberately: an imported `.json` schema widens `"type"` to `string`, and an authored one carries `$schema`/`title`/`description`/`additionalProperties`, so the tighter type would reject both of the normal ways to supply one. |
| `conversations` | `conversations` | `undefined | false | true` | `false` | Turns on the prior-conversations list (a list-toggle button in the header, plus a second list view sharing the panel, C-1). Attribute- settable like every other boolean flag on this element: `<kai-chat conversations>`. Requires `store`. A row select, "new conversation," or the visitor's mount-time auto-restore all deliver their messages the same way: listen for `kai-conversation-load` and set `el.messages` from `event.detail.messages` (a fresh array): this element does not update `messages` for you. Set with no `store`, the underlying `ChatThread` decides loudly (one console.error) and stays visually off; this facade always supplies its own internal load handler (the `kai-conversation-load` dispatch below), so the second ChatThread guard, missing `onConversationLoad`, never trips here, even for a consumer who never listens for the event. Default false. |
| `store` | — | `undefined | { list: () => Promise<{ id: string; title: string; groupId?: undefined | string; scope?: undefined | { type: "document" | "collection"; documentId?: undefined | string; filters?: undefined | { tags?: undefined | string[]; authors?: undefined | string[]; contentType?: undefined | "transcript" | "markdown"; dateRange?: undefined | { from: string; to: string } } }; messageCount: number; lastMessageAt?: undefined | string; updatedAt: string; trailing?: undefined | string; lastReadAt?: undefined | string }[]>; load: (id: string) => Promise<{ id: string; role: "user" | "assistant"; parts: ({ type: "text"; text: string; raw?: undefined | { source: string; payload: unknown } } | { type: "reasoning"; text: string; label?: undefined | string; index?: undefined | number; streamId?: undefined | string; signature?: undefined | string; raw?: undefined | { source: string; payload: unknown } } | { type: "tool"; tool: { type: string; kind?: undefined | "command" | "file-change" | "search" | "fetch" | "mcp" | "image" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }; raw?: undefined | { source: string; payload: unknown } } | { type: "card"; envelope: { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }; raw?: undefined | { source: string; payload: unknown } } | { type: "source"; source: { id?: undefined | string; url?: undefined | string; title?: undefined | string; snippet?: undefined | string; index?: undefined | number }; raw?: undefined | { source: string; payload: unknown } } | { type: "file"; attachment: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }; raw?: undefined | { source: string; payload: unknown } })[]; actions?: undefined | ("copy" | "dislike" | "edit" | "like" | "regenerate" | "speak" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]; avatar?: undefined | { src?: undefined | string; fallback?: undefined | string; alt?: undefined | string }; feedback?: undefined | "like" | "dislike" }[]>; save: (id: string, messages: { id: string; role: "user" | "assistant"; parts: ({ type: "text"; text: string; raw?: undefined | { source: string; payload: unknown } } | { type: "reasoning"; text: string; label?: undefined | string; index?: undefined | number; streamId?: undefined | string; signature?: undefined | string; raw?: undefined | { source: string; payload: unknown } } | { type: "tool"; tool: { type: string; kind?: undefined | "command" | "file-change" | "search" | "fetch" | "mcp" | "image" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }; raw?: undefined | { source: string; payload: unknown } } | { type: "card"; envelope: { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }; raw?: undefined | { source: string; payload: unknown } } | { type: "source"; source: { id?: undefined | string; url?: undefined | string; title?: undefined | string; snippet?: undefined | string; index?: undefined | number }; raw?: undefined | { source: string; payload: unknown } } | { type: "file"; attachment: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }; raw?: undefined | { source: string; payload: unknown } })[]; actions?: undefined | ("copy" | "dislike" | "edit" | "like" | "regenerate" | "speak" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]; avatar?: undefined | { src?: undefined | string; fallback?: undefined | string; alt?: undefined | string }; feedback?: undefined | "like" | "dislike" }[]) => Promise<void>; markRead?: undefined | ((id: string) => Promise<void>) }` | — | The adapter this thread persists conversations through: an object of three functions (`list`/`load`/`save`; `ConversationStore`, exported from `@kitn.ai/ui`'s `primitives/conversation-store`). A JS PROPERTY ONLY: `el.store = myAdapter`. It can never be an attribute, since a function-bearing object has no HTML string form, the same reasoning that keeps `messages`/`cardSchemas` property-only (the kai- contract: array/object props are JS properties, never attributes). Two built-ins ship: `localStorageStore(name, userId?)` and `fetchStore(url, userId?)`. |
| `home` | — | `undefined | { greeting?: undefined | { title?: undefined | string; subtitle?: undefined | string }; recentConversation?: undefined | false | true; newConversation?: undefined | { label?: undefined | string }; links?: undefined | { label: string; href?: undefined | string; description?: undefined | string; icon?: undefined | string }[] }` | — | Turns on the widget home screen (Intercom-pattern): the panel boots into a `home` view, with a greeting, most-recent-conversation card, a "new conversation" CTA, and host-defined links, plus a Home/Messages tab bar for switching back to the thread. An OBJECT, so it is a JS property only: `el.home = { greeting: { title: 'Hey' }, links: [...] }`, never an attribute (the kai- contract: array/object props are JS properties). A `links` entry with no `href` fires `kai-home-link` with that entry when tapped, rather than navigating; one WITH `href` opens it directly (only when the URL passes the kit's own scheme allowlist). Omit for the no-home widget (chat view only, unchanged). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-attachments-change` | `{ attachments: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[] }` | The staged attachments changed (file added or removed). Carries the full current list so a consumer can react in real time. |
| `kai-attachments-rejected` | `{ rejected: { filename: string; mediaType: string; reason: "filtered" | "unsupported" }[] }` | One or more picked files were refused because `accept` excluded them. The element renders NO message of its own: it reports the facts (name, media type, whether the kit could have sent it) and what the user should see is the application's call. Only ever fires when `accept` is set. |
| `kai-conversation-load` | `{ id: string | undefined; messages: { id: string; role: "user" | "assistant"; parts: ({ type: "text"; text: string; raw?: undefined | { source: string; payload: unknown } } | { type: "reasoning"; text: string; label?: undefined | string; index?: undefined | number; streamId?: undefined | string; signature?: undefined | string; raw?: undefined | { source: string; payload: unknown } } | { type: "tool"; tool: { type: string; kind?: undefined | "command" | "file-change" | "search" | "fetch" | "mcp" | "image" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }; raw?: undefined | { source: string; payload: unknown } } | { type: "card"; envelope: { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }; raw?: undefined | { source: string; payload: unknown } } | { type: "source"; source: { id?: undefined | string; url?: undefined | string; title?: undefined | string; snippet?: undefined | string; index?: undefined | number }; raw?: undefined | { source: string; payload: unknown } } | { type: "file"; attachment: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }; raw?: undefined | { source: string; payload: unknown } })[]; actions?: undefined | ("copy" | "dislike" | "edit" | "like" | "regenerate" | "speak" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]; avatar?: undefined | { src?: undefined | string; fallback?: undefined | string; alt?: undefined | string }; feedback?: undefined | "like" | "dislike" }[] }` | A conversation's history loaded: a row tap in the list, "new conversation," or the visitor's own mount-time auto-restore of their most recent thread (only fires when `conversations` is on and a `store` is set). `detail.id` is that conversation's id, `undefined` for the "new conversation" case (no id exists until the first message mints one, C-6). Set `el.messages = event.detail.messages` (already a fresh array) to actually render it, since this element does not do that for you; `messages` stays your own state like everywhere else on this element. |
| `kai-home-link` | `{ entry: { label: string; href?: undefined | string; description?: undefined | string; icon?: undefined | string } }` | A `home.links` entry with no `href` was activated (tapped/clicked/Enter). Meaningful only when `home` is set. |
| `kai-message-action` | `{ messageId: string; action: string; state?: undefined | "on" | "off" }` | An action button on a message was clicked. `action` is the built-in name or custom id. `state` is present only for the toggleable feedback votes: `'on'` when a like/dislike is set, `'off'` when re-tapped to clear. |
| `kai-model-change` | `{ modelId: string }` | The header model switcher changed. |
| `kai-submit` | `{ value: string; attachments: AttachmentData[] }` | User submitted a message. |
| `kai-suggestion-click` | `{ value: string }` | A suggestion chip was clicked (only in `suggestion-mode="fill"`). |
| `kai-value-change` | `{ value: string }` | Fired on every input change. |
| `kai-voice` | — | The Mic / voice button was clicked. |
| `kai-web-search` | — | The web-search (Globe) toolbar button was clicked. |

#### Methods

Call these on the element instance: `document.querySelector('kai-chat').focus(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `focus` | `(options?: FocusOptions): void` | Focus the composer, meaning the contenteditable (or textarea) inside the shadow root. A native `focus()` on the host lands on the host itself and never reaches it, so this is the only way to focus the input programmatically. |
| `blur` | `(): void` | Blur whatever currently holds focus inside the shadow root. The companion to `focus()`, for the same reason: a native `blur()` on the host misses the real focus target. |
| `clear` | `(): void` | Empty the COMPOSER: drops the draft text and every staged attachment, then fires `kai-value-change` with `''`. It does NOT touch the thread. `messages` is the consumer's own state, so clearing history stays the consumer's call. |
| `send` | `(): void` | Submit whatever the composer currently holds, on the same path as Enter or the send button: fires `kai-submit` with that value plus the staged attachments, then drops the attachments. It takes no argument, so to send text the user never typed, set `el.value` first. There is no empty-check, so an empty composer still fires. The draft is cleared afterwards only when `value` is uncontrolled; a controlled host owns its value and clears it itself. Named `send`, not `submit`, to match the shared vocabulary. |
| `scrollToBottom` | `(behavior?: ScrollBehavior): void` | Scroll the message viewport to the newest message. Defaults to `'smooth'`; pass `'instant'` to jump without animating. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| `header-start` | inject | Leading header controls, left of the title. |
| `header-end` | inject | Trailing header controls. |
| `header` | replace | Full custom header; replaces the built-in title/model/context bar. |
| `sidebar` | inject | Left column (your nav / conversation list). Fixed width; use compose-your-own for resizable. |
| `empty` | replace | Custom zero-state rendered in the message area while the thread is empty. Replaces the empty message list only; the composer and any suggestions still render. |
| `composer` | replace | Full custom composer; you own submit + loading, drive the thread via messages. |
| `composer-actions` | inject | Accessory row above the composer. |
| `footer` | inject | Row below the composer (disclaimers, token meter). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-chat::part(name)`.

| Part | Description |
|------|-------------|
| `::part(header-bar)` | The built-in header bar (the title / model-switcher / context row that hosts the header-start/header-end inject slots). Restyle its height, padding, or gap from outside without replacing the whole header via the `header` slot. <br>`kai-chat::part(header-bar) { height: 3.5rem; padding-inline: 1rem; gap: 0.5rem }` |
| `::part(header)` | Full custom header; replaces the built-in title/model/context bar. |
| `::part(sidebar)` | Left column (your nav / conversation list). Fixed width; use compose-your-own for resizable. |
| `::part(footer)` | Row below the composer (disclaimers, token meter). |

#### Composed from

`Components/ChatThread`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-chat -->

A complete chat interface: a scrolling message list (with Markdown rendering, reasoning blocks, tool call panels, and message action buttons) plus a prompt input area with a send button.

---

### `<kai-workspace>` / `Workspace`

<!-- spec:kai-workspace -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `startCollapsed` | `start-collapsed` | `undefined | false | true` | — | Controlled collapsed state of the start aside. Set this as a JS property (`el.startCollapsed = true`) to drive the aside from your app, updating it in response to the `kai-aside-toggle` event. Omit for uncontrolled (the element manages it). |
| `defaultStartCollapsed` | `default-start-collapsed` | `undefined | false | true` | — | Initial collapsed state of the start aside when uncontrolled (default false). Use the `default-start-collapsed` attribute to start collapsed in plain HTML. |
| `endCollapsed` | `end-collapsed` | `undefined | false | true` | — | Controlled collapsed state of the end aside. Set this as a JS property (`el.endCollapsed = true`) to drive the aside from your app, updating it in response to the `kai-aside-toggle` event. Omit for uncontrolled (the element manages it). |
| `defaultEndCollapsed` | `default-end-collapsed` | `undefined | false | true` | — | Initial collapsed state of the end aside when uncontrolled (default false). Use the `default-end-collapsed` attribute to start collapsed in plain HTML. |
| `collapseBelow` | `collapse-below` | `undefined | number` | — | Auto-collapse both asides when the shell's own width drops below this many px, and re-expand when it grows back above. Applies to uncontrolled asides only (it never fights an app-driven collapsed prop); omit to disable. Fires `kai-aside-toggle`. Attribute: `collapse-below`. |
| `drawerBelow` | `drawer-below` | `undefined | number` | — | Below this shell width in px, an expanded aside renders as an overlay drawer over the main region instead of a column beside it. Escape inside the drawer closes it and returns focus to the element focused before it opened. Omit to disable. Attribute: `drawer-below`. |
| `compact` | `compact` | `undefined | false | true` | — | Density hint. Reflected as a `data-compact` hook on the root (and as the `compact` attribute on the element) for your CSS and slotted content; the shell itself keeps no other opinion about density. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-aside-resize` | `{ side: "start" | "end"; width: number }` | The aside was resized (fires per drag step, keyboard nudge, or a handle double-click reset), width in px. |
| `kai-aside-toggle` | `{ side: "start" | "end"; collapsed: false | true }` | An aside collapsed or expanded (a method, the breakpoint, the drawer's Escape). |

#### Methods

Call these on the element instance: `document.querySelector('kai-workspace').toggleAside(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `toggleAside` | `(side: WorkspaceAsideSide): void` | Collapse/expand one aside (fires `kai-aside-toggle`). |
| `collapseAside` | `(side: WorkspaceAsideSide): void` | Force one aside collapsed (fires `kai-aside-toggle`). |
| `expandAside` | `(side: WorkspaceAsideSide): void` | Force one aside expanded (fires `kai-aside-toggle`). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The main region content (same region as the `main` slot): your `<kai-chat>`, or any app view. |
| `header` | inject | The top band across the full shell width (app bar, tabs, breadcrumbs). |
| `start` | inject | The inline-start aside column (a conversation rail, a nav, a file tree). Resizable and collapsible. |
| `main` | inject | The main region. Unnamed children project here too, via the default slot. |
| `end` | inject | The inline-end aside column (inspector, notes, preview). Resizable and collapsible. |
| `footer` | inject | The bottom band across the full shell width (status bar, disclaimers). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-workspace::part(name)`.

| Part | Description |
|------|-------------|
| `::part(aside)` | Both aside columns match this part (each also matches its own start/end part). Restyle the shared aside surface or border from outside; the --kai-workspace-start-* and --kai-workspace-end-* custom properties set the widths. <br>`kai-workspace::part(aside) { background: var(--color-card) }` |
| `::part(header)` | The top band across the full shell width (app bar, tabs, breadcrumbs). |
| `::part(start)` | The inline-start aside column (a conversation rail, a nav, a file tree). Resizable and collapsible. |
| `::part(main)` | The main region. Unnamed children project here too, via the default slot. |
| `::part(end)` | The inline-end aside column (inspector, notes, preview). Resizable and collapsible. |
| `::part(footer)` | The bottom band across the full shell width (status bar, disclaimers). |

#### Composed from

`Components/WorkspaceShell`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-workspace -->

The full app shell in one tag — a collapsible conversation-list sidebar (left), a drag-to-resize handle, and the complete chat thread (right) — all wired together. Drop in a single element and own the data; the workspace handles layout, resize, and collapse state internally.

**Example:**

```html
<script type="module">
  import '@kitn.ai/ui/elements';

  const workspace = document.getElementById('workspace');

  // Arrays and objects → JS properties
  workspace.conversations = [
    { id: 'c1', title: 'First chat', scope: { type: 'document' },
      messageCount: 5, lastMessageAt: '2026-06-13T10:00:00Z', updatedAt: '2026-06-13T10:00:00Z' },
  ];
  workspace.messages = [
    { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'Hello! How can I help?' }],
      actions: ['copy', 'like'] },
  ];
  workspace.models = [
    { id: 'claude-4', name: 'Claude 4 Opus', provider: 'Anthropic' },
  ];

  workspace.addEventListener('kai-conversation-select', (e) => {
    // load messages for e.detail.id, then reassign workspace.messages
    console.log('selected', e.detail.id);
  });

  workspace.addEventListener('kai-submit', async (e) => {
    const text = e.detail.value;
    const history = [...workspace.messages,
      { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }];
    workspace.messages = history;
    workspace.loading = true;
    // …stream the reply, folding each delta onto the assistant message's
    // trailing text part and reassigning workspace.messages per chunk
    // (see "ChatMessage schema" below)
    workspace.loading = false;
  });
</script>

<kai-workspace id="workspace" style="display: block; height: 100vh;"></kai-workspace>
```

---

### `<kai-conversations>` / `Conversations`

<!-- spec:kai-conversations -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `groups` | — | `undefined | { id: string; userId?: undefined | string; teamId?: undefined | string; name: string; sortOrder: number; createdAt: string }[]` | `[]` | The list's section headers (`{ id, name, sortOrder, createdAt }`), rendered in array order. A group carries no conversations of its own; it is matched against `conversations` by id, so the two props are complementary rather than alternatives. Omit for an ungrouped list. Set as a JS property. |
| `conversations` | — | `undefined | { id: string; title: string; groupId?: undefined | string; scope?: undefined | { type: "document" | "collection"; documentId?: undefined | string; filters?: undefined | { tags?: undefined | string[]; authors?: undefined | string[]; contentType?: undefined | "transcript" | "markdown"; dateRange?: undefined | { from: string; to: string } } }; messageCount: number; lastMessageAt?: undefined | string; updatedAt: string; trailing?: undefined | string; lastReadAt?: undefined | string }[]` | `[]` | Every conversation the list renders, flat. Each one is filed under the group whose `id` equals its `groupId`; one with no `groupId`, or with a `groupId` matching no entry in `groups`, falls into a trailing "Ungrouped" section, so nothing you pass in is ever dropped. There is no recency bucketing. Set as a JS property. Omit to supply them as `<kai-conversation>` light-DOM children instead, or for the empty state. A search query that matches nothing shows a visible "No conversations match your search" state, distinct from the zero-conversations empty state. Slotted `<kai-conversation-item>` children switch the list into item mode instead: your own rows win and this array is not rendered. |
| `activeId` | `active-id` | `undefined | string` | — | The id of the currently-open conversation, highlighted in the list. |
| `collapsed` | `collapsed` | `undefined | false | true` | — | Controlled collapsed state. Set as a JS property (`el.collapsed = true`) to drive the rail from your app, updating it in response to `kai-collapse-toggle`. Omit for uncontrolled (the element manages it). Collapsed shrinks the rail to a floating reopen button. |
| `defaultCollapsed` | `default-collapsed` | `undefined | false | true` | — | Initial collapsed state when uncontrolled (default false). Use the `default-collapsed` attribute to start collapsed in plain HTML. |
| `compact` | `compact` | `undefined | false | true` | — | Dense single-line rows (a leading dot + title, no message count). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-collapse-toggle` | `{ collapsed: false | true }` | The rail was collapsed or expanded (via the toggle, the reopen button, or a `collapse()`/`expand()`/`toggle()` call). |
| `kai-conversation-select` | `{ id: string }` | A conversation was selected. The selection event in BOTH modes: a batteries data row, or an activated `<kai-conversation-item>` child (click, Enter or Space). |
| `kai-new-chat` | — | The "New chat" button was clicked. |
| `kai-search` | `{ query: string }` | The built-in search box query changed (typing, or a programmatic `clear()` which fires it with `''`). Lets a consumer mirror or server-side the filter. |
| `kai-toggle-sidebar` | — | The sidebar toggle was clicked. |

#### Methods

Call these on the element instance: `document.querySelector('kai-conversations').focus(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `focus` | `(options?: FocusOptions): void` | Focus the built-in search input inside the shadow root. |
| `clear` | `(): void` | Clear the internal search query (resets the list filter) and fire kai-search with an empty string. |
| `select` | `(id: string): void` | Programmatically select a conversation by id. The mirror of the kai-conversation-select event (a convenience over driving `activeId`). |
| `collapse` | `(): void` | Collapse the rail to its floating reopen button (fires `kai-collapse-toggle`). |
| `expand` | `(): void` | Expand the rail back to the full list (fires `kai-collapse-toggle`). |
| `toggle` | `(): void` | Toggle the rail collapsed/expanded (fires `kai-collapse-toggle`). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | Your own `<kai-conversation-item>` rows (item mode: the consumer-owned loop). Data rows do not render while any are present. |
| `header` | replace | Full custom title bar; replaces the built-in toggle / "Chats" / New-chat row. |
| `empty` | replace | Custom zero-state shown when there are no conversations; replaces the built-in "No conversations yet". |
| `footer` | inject | A row below the list: account, settings, or usage. |

#### Declarative children

Compose these in light DOM instead of setting the JS property — the no-JS route.

| Child element | Attributes | Text content | Notes |
|---------------|------------|--------------|-------|
| `<kai-conversation>` | `group-id`, `id` | yes | Parse a single light-DOM `<kai-conversation>` element into a `ConversationSummary`. Attribute mapping: - `id` → ConversationSummary.id - `group-id` → ConversationSummary.groupId (optional) - textContent → ConversationSummary.title Fields not expressible as HTML attributes are NOT fabricated: the optional `scope` and `lastMessageAt` stay absent, and the required `messageCount`/`updatedAt` get honest defaults — zero messages, and an empty `updatedAt` from which no trailing relative time is derived (the epoch it used to fabricate rendered a bogus "many days ago" on every declarative row). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-conversations::part(name)`.

| Part | Description |
|------|-------------|
| `::part(trailing)` | The right-aligned trailing text on each conversation row (a count, status, or relative time). Set it per item via the `trailing` field; otherwise a short auto relative time is derived from `updatedAt`. Recolor or resize it from outside. <br>`kai-conversations::part(trailing) { color: var(--color-primary); font-variant-numeric: tabular-nums }` |
| `::part(items)` | The item-mode listbox region wrapping your slotted `<kai-conversation-item>` children. <br>`kai-conversations::part(items) { gap: 2px }` |

#### Composed from

`Components/ConversationList`, `Components/CollapsedRail`

#### Theming

Themed by the global design tokens (override any `--color-*`). Element-specific tokens: `--color-sidebar`, `--color-scrollbar-thumb`.
<!-- /spec:kai-conversations -->

Sidebar panel listing conversations, optionally grouped. Emits events for navigation; does not manage its own state.

---

### `<kai-prompt-input>` / `PromptInput`

<!-- spec:kai-prompt-input -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `value` | — | `undefined | string | ({ type: "text"; text: string } | { type: "entity"; entity: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> } })[]` | — | Value of the input, as a JS property. A **string** is the controlled text mirror (the host owns it and updates on `kai-value-change`). A **ComposerDoc** (array of text/entity segments) is a one-time **seed** that pre-populates pills (skills/agents/plugins); the user then edits freely. Leave unset for uncontrolled behavior. `kai-submit`/`kai-value-change` always emit `value` as the flattened string (back-compat) plus the structured `doc` + `entities`. |
| `placeholder` | `placeholder` | `undefined | string` | `'Send a message...'` | Placeholder text shown in the empty input. |
| `disabled` | `disabled` | `undefined | false | true` | `false` | Disable the input and submit button entirely (non-interactive). |
| `loading` | `loading` | `undefined | false | true` | `false` | Show the loading/streaming state and block submit (use while awaiting a reply). |
| `suggestions` | — | `undefined | string[]` | — | Starter prompts shown above the input. Clicking one follows `suggestionMode`. Set as a JS property. |
| `suggestionMode` | `suggestion-mode` | `undefined | "submit" | "fill"` | `'submit'` | What clicking a suggestion does: `'submit'` (default) sends it immediately as if typed and submitted; `'fill'` just places it in the input. |
| `webSearch` | `web-search` | `undefined | false | true` | `false` | Show a web-search (Globe) button in the left toolbar; clicking it fires a `kai-web-search` event. Attribute: `web-search`. |
| `voice` | `voice` | `undefined | false | true` | `false` | Show a Voice (Mic) button in the left toolbar; clicking it fires a `voice` event. |
| `stoppable` | `stoppable` | `undefined | false | true` | `false` | When set and `loading` is true, the send button is replaced by a Stop button (square icon, "Stop" aria-label). Clicking it fires `kai-stop`. |
| `submit` | `submit` | `undefined | "always" | "auto"` | `'always'` | Send-button visibility. `'always'` (default) always shows it; `'auto'` shows it only when there's text/attachments (an empty composer hides it, though Enter still submits). To hide it entirely (Enter-only), it's pure CSS: `::part(send){display:none}`, no prop needed. Restyle via `::part(send)`. The Stop button (`stoppable` + `loading`) is unaffected. |
| `attach` | `attach` | `undefined | false | true` | `true` | When `false`, hides the built-in paperclip attach button even though the element otherwise supports attachments. Use this when a `+` menu in `toolbar-start` already exposes "Add files", to avoid a duplicate control. Defaults to `true`. |
| `attachments` | — | `AttachmentData[] | undefined` | — | Attachments to seed the input with (so a consumer can pre-populate staged files without an upload). Set as a JS property; the element then manages its own attachment state from there (add via the paperclip, remove per chip). Each item's `url` must be a `data:` URI or an https URL, never `URL.createObjectURL`: a `blob:` URL previews perfectly and is meaningless outside this tab, so `toOpenAIMessages`/`toAnthropicMessages` refuse it. (The built-in paperclip already stages files as `data:` URIs.) |
| `triggers` | — | `undefined | { char: string; kind: string; items?: undefined | { id: string; label: string; icon?: undefined | string; description?: undefined | string; group?: undefined | string; kind?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> }[] }[]` | — | Rich entity triggers. Each `{ char, kind, items }` opens a caret-anchored menu that inserts an atomic pill. Convention: `/` → skills, `@` → agents (plugins are the grouping/provenance of those items). Set as a JS property. |
| `kindIcons` | — | `undefined | Record<string, string>` | — | Default icon per entity kind (kind → image URL/data-URI) for pills/menu items without their own `icon`. Overrides the built-in agent/plugin glyphs. JS property. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-attachments-change` | `{ attachments: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[] }` | The staged attachments changed: a file was added (via the paperclip) or removed (per-chip ×). Carries the full current list so a consumer can react in real time (validate, show upload progress, toggle the send button). |
| `kai-stop` | — | The Stop button was clicked while `stoppable` and `loading` are both true. |
| `kai-submit` | `{ value: string; doc: ({ type: "text"; text: string } | { type: "entity"; entity: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> } })[]; entities: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> }[]; attachments: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[] }` | The user submitted the prompt (Enter or send button). `value` is the flattened text (back-compat); `doc` is the structured document and `entities` the inserted pills (skills/agents) for downstream expansion. `<kai-prompt-input>` is the batteries-included composer row (send button, toolbar, attachment staging) built on `<kai-composer>`, the bare editor. |
| `kai-suggestion-click` | `{ value: string }` | A suggestion was clicked while `suggestion-mode="fill"`. |
| `kai-toolbar-action` | `{ action: string }` | A custom `<kai-action>` toolbar button was clicked. `action` is the `id` of the `<kai-action>` element that was clicked. |
| `kai-value-change` | `{ value: string; doc: ({ type: "text"; text: string } | { type: "entity"; entity: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> } })[]; entities: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> }[] }` | The input changed (fires on every edit). Carries the flattened `value` plus the structured `doc` + `entities`. |
| `kai-voice` | — | The Voice (Mic) toolbar button was clicked. |
| `kai-web-search` | — | The web-search (Globe) toolbar button was clicked. |

#### Methods

Call these on the element instance: `document.querySelector('kai-prompt-input').focus(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `focus` | `(options?: FocusOptions): void` | Focus the text editor inside the shadow root (not the hidden file input). |
| `blur` | `(): void` | Blur the focused input control. |
| `clear` | `(): void` | Clear the text and any staged attachments (fires kai-value-change / kai-attachments-change so a controlled consumer can react). |
| `send` | `(): void` | Send the current value programmatically, on the same path as Enter / the send button (fires kai-submit, then clears staged attachments). Named `send`, not `submit`, to avoid colliding with the `submit` prop. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| `input-top` | inject | Inside the card, above the textarea (e.g. an inline status strip). For content above/below the whole card, use your own layout; that is light DOM you control. |
| `toolbar-start` | inject | Leading controls in the input toolbar, where a + menu goes. |
| `toolbar-end` | inject | Trailing controls in the toolbar, before the Send button. |

#### Declarative children

Compose these in light DOM instead of setting the JS property — the no-JS route.

| Child element | Attributes | Text content | Notes |
|---------------|------------|--------------|-------|
| `<kai-action>` | `action`, `icon`, `id`, `label`, `tooltip` | yes |  |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-prompt-input::part(name)`.

| Part | Description |
|------|-------------|
| `::part(send)` | The send button. Restyle from outside, or hide it entirely (Enter-only). Hiding is pure CSS, which is why there is no `submit="never"`. <br>`kai-prompt-input::part(send) { display: none } /* Enter-only; or restyle: background, border-radius, … */` |

#### Composed from

`Components/PromptInput`, `Components/PromptInputTextarea`, `Components/PromptInputActions`, `Components/PromptSuggestion`, `UI/Button`, `UI/Tooltip`, `Components/Attachments`, `Components/Attachment`, `Components/AttachmentPreview`, `Components/AttachmentInfo`, `Components/AttachmentRemove`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-prompt-input -->

Standalone prompt input with a send button. Use when you want just the input area without the message list.

---

### `<kai-message>` / `Message`

<!-- spec:kai-message -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `message` | — | `undefined | { id: string; role: "user" | "assistant"; parts: ({ type: "text"; text: string; raw?: undefined | { source: string; payload: unknown } } | { type: "reasoning"; text: string; label?: undefined | string; index?: undefined | number; streamId?: undefined | string; signature?: undefined | string; raw?: undefined | { source: string; payload: unknown } } | { type: "tool"; tool: { type: string; kind?: undefined | "command" | "file-change" | "search" | "fetch" | "mcp" | "image" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }; raw?: undefined | { source: string; payload: unknown } } | { type: "card"; envelope: { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }; raw?: undefined | { source: string; payload: unknown } } | { type: "source"; source: { id?: undefined | string; url?: undefined | string; title?: undefined | string; snippet?: undefined | string; index?: undefined | number }; raw?: undefined | { source: string; payload: unknown } } | { type: "file"; attachment: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }; raw?: undefined | { source: string; payload: unknown } })[]; actions?: undefined | ("copy" | "dislike" | "edit" | "like" | "regenerate" | "speak" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]; avatar?: undefined | { src?: undefined | string; fallback?: undefined | string; alt?: undefined | string }; feedback?: undefined | "like" | "dislike" }` | — | The full message object. Set as a JS property. |
| `role` | `role` | `undefined | "user" | "assistant"` | `'assistant'` | Who is speaking: `'user'` or `'assistant'`. Convenience for simple cases when not passing a `message` object. This is the SEMANTIC role of the message, not an ARIA role. The name collides with the global ARIA `role` attribute, which is why the facade lifts it off the host (see `liftRoleOffHost`). Neither speaker is a valid ARIA role, so a `role="user"` left on `<kai-message>` is a CRITICAL axe `aria-roles` violation. The accessible role lives on the row inside the shadow root instead: `role="article"` plus an `aria-label` naming the speaker, matching the SolidJS `<Message>` component. |
| `markdown` | `markdown` | `undefined | false | true` | — | Force markdown on/off. Defaults to on for assistant, off for user. |
| `proseSize` | `prose-size` | `undefined | "xs" | "sm" | "base" | "lg"` | `'sm'` | Text/markdown sizing for the message body. |
| `codeTheme` | `code-theme` | `undefined | string` | `'github-dark-dimmed'` | Shiki theme name used for fenced code blocks in the content. |
| `codeHighlight` | `code-highlight` | `undefined | false | true` | `true` | Disable syntax highlighting for code blocks (no Shiki loads). |
| `actionsReveal` | `actions-reveal` | `undefined | "always" | "hover"` | `'always'` | Whether the action bar is always visible (`'always'`, default) or only revealed on hover of the message row (`'hover'`). |
| `avatarSrc` | `avatar-src` | `undefined | string` | — | Convenience avatar image URL (used when `message.avatar` is not set). |
| `avatarFallback` | `avatar-fallback` | `undefined | string` | — | Convenience avatar fallback text (used when `message.avatar` is not set). |
| `avatar` | `avatar` | `undefined | string` | — | Avatar rail mode. `'none'` omits the avatar rail entirely so the body spans the full row (predictable layout when you never show avatars). Any other value keeps the default behaviour: the built-in avatar when one resolves, or your `slot="avatar"` content when projected (which REPLACES the built-in). |
| `cardTypes` | — | `undefined | Record<string, string>` | — | Optional card type -> custom-element tag overrides/additions for `card` parts (merged over the built-ins). Property: `el.cardTypes`. Typed as a plain string map (not the `CardTagMap` alias) so the generated React wrapper inlines it instead of emitting an unresolved named type. |
| `cardSchemas` | — | `undefined | Record<string, object>` | — | JSON Schemas for the card types this app renders, keyed by envelope type. The companion of `cardTypes`, which says what DRAWS a card while this says what a VALID one looks like. An OBJECT, so it is a JS property only: `el.cardSchemas = { 'pricing-table': pricingSchema }`, never an attribute. `createCardRegistry(...).validationSchemas` is exactly this shape. Without it the kit validates its own seven built-ins and leaves your own card type, the one your app actually cares about, as the only unchecked thing on screen. A schema here WINS over a built-in of the same name. Typed `Record<string, object>` rather than `Record<string, JsonSchema>` deliberately: an imported `.json` schema widens `"type"` to `string`, and an authored one carries `$schema`/`title`/`description`/`additionalProperties`, so the tighter type would reject both of the normal ways to supply one. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-message-action` | `{ messageId: string; action: string; state?: undefined | "on" | "off" }` | An action button was clicked. `action` is the built-in name or custom id. `state` is present only for the toggleable feedback votes: `'on'` when a like/dislike is set, `'off'` when re-tapped to clear. |

#### Methods

Call these on the element instance: `document.querySelector('kai-message').copy()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `copy` | `(): void` | Copy the message content to the clipboard and show the copied check. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| `before-body` | inject | A per-message header at the TOP of the body, above reasoning/tools/content: a model-name label, a role + timestamp line. |
| `after-body` | inject | A row at the BOTTOM of the body, below the action bar: a citation/sources row, a token-cost/latency line. |
| `avatar` | replace | Replaces the built-in avatar rail with your own node. Use `avatar="none"` to omit the rail and let the body span the full row. |

#### Declarative children

Compose these in light DOM instead of setting the JS property — the no-JS route.

| Child element | Attributes | Text content | Notes |
|---------------|------------|--------------|-------|
| `<kai-action>` | `action`, `icon`, `id`, `label`, `tooltip` | yes |  |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-message::part(name)`.

| Part | Description |
|------|-------------|
| `::part(row)` | The message row wrapper (avatar rail + body column). Restyle its gap or alignment from outside. <br>`kai-message::part(row) { gap: 0.75rem }` |
| `::part(bubble)` | The content bubble wrapper. Restyle its background, radius, or padding; for a user message this is the rounded chat bubble. <br>`kai-message::part(bubble) { background: var(--color-primary); color: var(--color-primary-foreground) }` |
| `::part(content)` | The rendered message text/markdown region (same node as `bubble`). Target it to tune typography from outside. <br>`kai-message::part(content) { font-size: 0.9375rem }` |
| `::part(actions)` | The action-bar row (copy / like / regenerate …). Restyle its spacing or hide it entirely from outside. <br>`kai-message::part(actions) { gap: 0.25rem }` |
| `::part(citations)` | The citation row rendered from the message’s `source` parts: a wrapped row of chips below the bubble, never inside it. Restyle its spacing or hide it entirely from outside. <br>`kai-message::part(citations) { gap: 0.5rem }` |
| `::part(attachment)` | One attachment item: the chip, row or tile, whichever variant is rendering. Restyle its background, radius or border from outside without caring which layout it is. <br>`kai-chat::part(attachment) { border-radius: 0.25rem }` |
| `::part(attachment-name)` | The attachment’s filename label. Present in every variant that shows one (a grid tile omits it for an image, which is its own label). Retune its type or hide it entirely. <br>`kai-chat::part(attachment-name) { font-size: 0.75rem }` |
| `::part(avatar)` | Replaces the built-in avatar rail with your own node. Use `avatar="none"` to omit the rail and let the body span the full row. |

#### Composed from

`Components/Message`, `Components/MessageAvatar`, `Components/MessageBody`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-message -->

A single message row: renders markdown/plain content, reasoning, tool calls, attachments, and action buttons from one message object.

---

### `<kai-markdown>` / `Markdown`

<!-- spec:kai-markdown -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `content` | `content` | `string` | `''` | The markdown source to render. |
| `proseSize` | `prose-size` | `undefined | "xs" | "sm" | "base" | "lg"` | `'sm'` | Text/markdown sizing. |
| `codeTheme` | `code-theme` | `undefined | string` | `'github-dark-dimmed'` | Shiki theme for fenced code blocks. |
| `codeHighlight` | `code-highlight` | `undefined | false | true` | `true` | Disable syntax highlighting (no Shiki loads). |

#### Composed from

`Components/Markdown`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-markdown -->

Renders a markdown string with code highlighting.

No events.

---

### `<kai-code-block>` / `CodeBlock`

<!-- spec:kai-code-block -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `code` | `code` | `string` | `''` | The source code to render. |
| `language` | `language` | `undefined | string` | — | Language grammar (e.g. `js`, `python`). Defaults to `tsx`. |
| `codeTheme` | `code-theme` | `undefined | string` | `'github-dark-dimmed'` | Shiki theme name. |
| `codeHighlight` | `code-highlight` | `undefined | false | true` | `true` | Disable syntax highlighting (renders plain text, no Shiki). |
| `copy` | `copy` | `undefined | false | true` | `true` | Show the copy button. **Defaults to ON**, because this element is documented as shipping one. Opt out with `copy="false"` or `el.copy = false`. |
| `proseSize` | `prose-size` | `undefined | "xs" | "sm" | "base" | "lg"` | `'sm'` | Code text sizing. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-code-block::part(name)`.

| Part | Description |
|------|-------------|
| `::part(copy)` | The copy-to-clipboard button in the header row. Hide it with `copy="false"` rather than CSS. <br>`kai-code-block::part(copy) { color: var(--color-primary) }` |

#### Composed from

`Components/CodeBlock`, `Components/CodeBlockCode`

#### Theming

Themed by the global design tokens (override any `--color-*`). Element-specific tokens: `--color-code-foreground`.
<!-- /spec:kai-code-block -->

A single syntax-highlighted code block with a copy button.

No events.

---

### `<kai-reasoning>` / `Reasoning`

<!-- spec:kai-reasoning -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `text` | `text` | `string` | `''` | The reasoning text to display. |
| `label` | `label` | `undefined | string` | `'Reasoning'` | Trigger label. |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute; the element still self-manages on trigger click + while streaming). Set `el.open = true`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `streaming` | `streaming` | `undefined | false | true` | `false` | While true, auto-expands (and re-collapses when it flips false). |
| `markdown` | `markdown` | `undefined | false | true` | `true` | Render `text` as markdown. |
| `disabled` | `disabled` | `undefined | false | true` | — | Gate the disclosure trigger: programmatic `show()/hide()/toggle()` still work, but the trigger click no longer toggles. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The reasoning block expanded or collapsed (via the trigger, streaming auto-open, or a method). |

#### Methods

Call these on the element instance: `document.querySelector('kai-reasoning').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Composed from

`Components/Reasoning`, `Components/ReasoningTrigger`, `Components/ReasoningContent`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-reasoning -->

Collapsible reasoning/thinking block with optional streaming auto-expand.

---

### `<kai-tool>` / `Tool`

<!-- spec:kai-tool -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `tool` | — | `undefined | { type: string; kind?: undefined | "command" | "file-change" | "search" | "fetch" | "mcp" | "image" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }` | — | The tool-call to display. Set as a JS property. |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute; the element still self-manages on trigger click). Set `el.open = true`, or `<kai-tool open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `disabled` | `disabled` | `undefined | false | true` | — | Gate the disclosure trigger: programmatic `show()/hide()/toggle()` still work, but the trigger click no longer toggles. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The panel expanded or collapsed (by trigger click or a method). |

#### Methods

Call these on the element instance: `document.querySelector('kai-tool').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Composed from

`Components/Tool`

#### Theming

Themed by the global design tokens (override any `--color-*`). Element-specific tokens: `--color-tool-blue`, `--color-tool-amber`, `--color-tool-green`, `--color-tool-red`.
<!-- /spec:kai-tool -->

Tool-call panel showing a function call's type, state, input, and output.

No events.

---

### `<kai-attachments>` / `Attachments`

<!-- spec:kai-attachments -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `items` | — | `AttachmentData[] | undefined` | `[]` | The attachments to render. Omit (or pass an empty array) for the empty state, which shows `emptyText` if set and nothing otherwise. Set as a JS property (array). Each item's `url` must be a `data:` URI or an https URL, never `URL.createObjectURL`: a `blob:` URL previews here but the wire encoders (`toOpenAIMessages`/`toAnthropicMessages`) refuse it. |
| `variant` | `variant` | `undefined | "grid" | "inline" | "list"` | `'grid'` | Layout: `grid` = visual tiles, `inline` = icon + label chips, `list` = rows. |
| `hoverCard` | `hover-card` | `undefined | false | true` | `false` | Wrap each item in a hover card that previews its details. |
| `removable` | `removable` | `undefined | false | true` | `false` | Show a remove button per item; clicking it fires a `kai-remove` event. |
| `showMediaType` | `show-media-type` | `undefined | false | true` | `false` | Also show the media type beneath the filename (non-grid variants). |
| `emptyText` | `empty-text` | `undefined | string` | — | Text shown when `items` is empty. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-remove` | `{ id: string }` | A remove button was clicked. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-attachments::part(name)`.

| Part | Description |
|------|-------------|
| `::part(preview)` | The image shown in an attachment’s hover-card preview. Bounded by default (max ~320×256, aspect preserved) so a large image never blows up the card. Raise or lower the cap from outside. <br>`kai-attachments::part(preview) { max-width: 32rem; max-height: 24rem }` |
| `::part(attachment)` | One attachment item: the chip, row or tile, whichever variant is rendering. Restyle its background, radius or border from outside without caring which layout it is. <br>`kai-chat::part(attachment) { border-radius: 0.25rem }` |
| `::part(attachment-name)` | The attachment’s filename label. Present in every variant that shows one (a grid tile omits it for an image, which is its own label). Retune its type or hide it entirely. <br>`kai-chat::part(attachment-name) { font-size: 0.75rem }` |

#### Composed from

`Components/Attachments`, `Components/Attachment`, `Components/AttachmentPreview`, `Components/AttachmentInfo`, `Components/AttachmentRemove`, `Components/AttachmentHoverCard`, `Components/AttachmentHoverCardTrigger`, `Components/AttachmentHoverCardContent`, `Components/AttachmentEmpty`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-attachments -->

Renders a list of file/document attachments in grid, inline, or list layouts.

---

### `<kai-model-switcher>` / `ModelSwitcher`

<!-- spec:kai-model-switcher -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `models` | — | `undefined | { id: string; name: string; provider?: undefined | string; description?: undefined | string; group?: undefined | string }[]` | `[]` | The selectable models. Set as a JS property (array). Omit to supply them as `<kai-model>` light-DOM children instead; when both are present the property's models come first. |
| `currentModel` | `current-model` | `undefined | string` | — | The currently-selected model id. Defaults to the first model. |
| `open` | `open` | `undefined | false | true` | — | Drive/observe the dropdown's open state (Shoelace-style: settable + reflected to the `open` attribute, the dropdown still self-manages on click/keyboard). Set `el.open = true`, or `<kai-model-switcher open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `disabled` | `disabled` | `undefined | false | true` | — | Disable the trigger: click/keyboard and `show()` no longer open the dropdown. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-model-change` | `{ modelId: string }` | A model was selected. |
| `kai-open-change` | `{ open: false | true }` | The model dropdown opened or closed (by click, keyboard, Escape, outside-click, or a method). |

#### Methods

Call these on the element instance: `document.querySelector('kai-model-switcher').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Declarative children

Compose these in light DOM instead of setting the JS property — the no-JS route.

| Child element | Attributes | Text content | Notes |
|---------------|------------|--------------|-------|
| `<kai-model>` | `description`, `group`, `id`, `provider` | yes | Parse a single light-DOM `<kai-model>` element into a `ModelOption` descriptor. Attribute mapping: - `id` → ModelOption.id - textContent → ModelOption.name - `provider` → ModelOption.provider (optional) - `description` → ModelOption.description (optional subtitle) - `group` → ModelOption.group (optional collapsible section) |

#### Composed from

`Components/ModelSwitcher`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-model-switcher -->

A dropdown that lets the user switch between available models.

---

### `<kai-context>` / `Context`

<!-- spec:kai-context -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `context` | — | `ContextData | undefined` | — | Token-usage data. Set as a JS property. |
| `warnThreshold` | `warn-threshold` | `undefined | number` | — | Fraction (0–1) above which the meter turns yellow. Defaults to `0.7` (70%). |
| `dangerThreshold` | `danger-threshold` | `undefined | number` | — | Fraction (0–1) above which the meter turns red. Defaults to `0.9` (90%). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-threshold-change` | `{ level: "ok" | "warn" | "danger" }` | Fires when the computed severity level changes (ok → warn → danger or back). `detail.level` is `'ok'`, `'warn'`, or `'danger'`. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-context::part(name)`.

| Part | Description |
|------|-------------|
| `::part(track)` | The usage meter track inside the hover-card breakdown. Carries `role="progressbar"` and is in the DOM only while the card is open. Restyle its height, radius, or background from outside. <br>`kai-context::part(track) { height: 0.5rem }` |
| `::part(fill)` | The used-tokens portion of that meter. Its width follows `usedTokens / maxTokens`; its default color is the severity hue picked by `warnThreshold` / `dangerThreshold`, so recoloring it from outside replaces that signal. <br>`kai-context::part(fill) { background: var(--color-tool-blue) }` |

#### Composed from

`Components/Context`, `Components/ContextTrigger`, `Components/ContextContent`, `Components/ContextContentHeader`, `Components/ContextContentBody`, `Components/ContextContentFooter`, `Components/ContextInputUsage`, `Components/ContextOutputUsage`, `Components/ContextReasoningUsage`, `Components/ContextCacheUsage`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-context -->

Token-usage meter showing used/max tokens and estimated cost.

No events.

---

### `<kai-chain-of-thought>` / `ChainOfThought`

<!-- spec:kai-chain-of-thought -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `steps` | — | `undefined | { label: string; content?: undefined | string; id?: undefined | string }[]` | `[]` | The reasoning steps. Set as a JS property. Compound sub-parts collapse to this one data model (Route 1). Each `{ label, content?, id? }`. Omit to supply the steps as `<kai-step>` light-DOM children instead; when both are present the property's steps come first. |
| `type` | `type` | `undefined | "single" | "multiple"` | — | Open mode: `'multiple'` (default, any number of steps open at once) or `'single'` (at most one open; opening a step closes the others). |
| `value` | — | `undefined | string | string[]` | — | Controlled open step key(s). When set, it WINS over user interaction (the consumer owns the open set). String in `single` mode, string[] in `multiple` mode. Set as a JS property. |
| `defaultValue` | — | `undefined | string | string[]` | — | Uncontrolled INITIAL open step key(s), seeding which steps render expanded. Ignored once `value` is provided. Set as a JS property. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-value-change` | `{ value: string | string[] }` | The open set changed, by user click OR an expand()/collapse()/toggle() call. `value` is a string in `single` mode, a string[] in `multiple` mode. (Maps Radix Accordion's onValueChange.) |

#### Methods

Call these on the element instance: `document.querySelector('kai-chain-of-thought').expand(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `expand` | `(index?: number): void` | Open one step's detail by index, or ALL steps when called with no arg. In `single` mode opening one step closes the others (expand-all keeps the last). |
| `collapse` | `(index?: number): void` | Close one step's detail by index, or ALL steps when called with no arg. |
| `toggle` | `(index?: number): void` | Flip one step's open state by index. |

#### Declarative children

Compose these in light DOM instead of setting the JS property — the no-JS route.

| Child element | Attributes | Text content | Notes |
|---------------|------------|--------------|-------|
| `<kai-step>` | `label`, `step-id` | yes | Parse a single light-DOM `<kai-step>` element into a `Step` descriptor. Attribute mapping: - `label` → Step.label (the always-visible heading) - `step-id` → Step.id (optional stable open-set key) - textContent → Step.content (optional expandable detail) |

#### Composed from

`Components/ChainOfThoughtAccordion`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-chain-of-thought -->

Displays a list of reasoning steps as a collapsible chain-of-thought.

No events.

---

### `<kai-suggestions>` / `Suggestions`

<!-- spec:kai-suggestions -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `suggestions` | — | `undefined | (string | { label: string; value?: undefined | string; icon?: undefined | string })[]` | `[]` | The suggestions. Strings, or `{ label, value }` when the displayed text and the emitted value differ. Set as a JS property. Omit to supply them as `<kai-suggestion>` light-DOM children instead; when both are present the property's suggestions come first. |
| `variant` | `variant` | `undefined | "outline" | "ghost" | "default"` | `'outline'` | Chip style: `'outline'` (default), `'ghost'`, or `'default'` (filled). |
| `size` | `size` | `undefined | "md" | "lg"` | `'md'` | Row height for `layout="list"`: `'md'` (default) or `'lg'` for taller rows. Chips are unaffected. |
| `layout` | `layout` | `undefined | "chips" | "list"` | `'chips'` | Layout: `'chips'` (default) renders a wrapping row of rounded pills; `'list'` renders a vertical, full-width "Ideas for you" list where each row is left-aligned with a leading `icon`, a label, and a hover background. |
| `block` | `block` | `undefined | false | true` | `false` | Full-width left-aligned rows instead of pills. |
| `highlight` | `highlight` | `undefined | string` | — | Substring to highlight within each suggestion. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-select` | `{ value: string }` | A suggestion was clicked. |

#### Declarative children

Compose these in light DOM instead of setting the JS property — the no-JS route.

| Child element | Attributes | Text content | Notes |
|---------------|------------|--------------|-------|
| `<kai-suggestion>` | `icon`, `value` | yes | Parse a single `<kai-suggestion>` node into an `Item` descriptor. |

#### Composed from

`Components/PromptSuggestion`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-suggestions -->

Suggestion chips or full-width rows. Can render plain strings or `{ label, value }` pairs.

---

### `<kai-source>` / `Source`

<!-- spec:kai-source -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `href` | `href` | `undefined | string` | `''` | The URL this citation links to (the domain also seeds the default label/favicon). |
| `label` | `label` | `undefined | string` | — | Trigger label (defaults to the domain). |
| `headline` | `headline` | `undefined | string` | `''` | Hover-card headline. Attribute: `headline` (`title` is avoided because it is a global HTML attribute that reflects in a CE constructor and breaks it). |
| `description` | `description` | `undefined | string` | `''` | Hover-card body text describing the source. |
| `showFavicon` | `show-favicon` | `undefined | false | true` | `false` | Show the source's favicon next to the trigger label. |

#### Composed from

`Components/Source`, `Components/SourceTrigger`, `Components/SourceContent`, `Components/SourceList`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-source -->

An inline citation link that opens a hover card with source details.

No events.

---

### `<kai-sources>` / `Sources`

<!-- spec:kai-sources -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `sources` | — | `undefined | { href: string; title?: undefined | string; description?: undefined | string; label?: undefined | string; showFavicon?: undefined | false | true }[]` | `[]` | The sources to render. Set as a JS property. Omit to supply them as `<kai-source>` light-DOM children instead; when both are present the property's sources come first. |
| `showFavicon` | `show-favicon` | `undefined | false | true` | `false` | Show favicons on all items (per-item `showFavicon` overrides). |
| `numbered` | `numbered` | `undefined | false | true` | `false` | When true, each citation chip is labelled with its 1-based index in the merged (prop + declarative-children) list (`[1]`, `[2]`, …) instead of the per-item `label` or domain fallback. HTML attribute: `numbered` (boolean: a bare attribute or `numbered="true"`). JS property: `el.numbered = true`. |

#### Declarative children

Compose these in light DOM instead of setting the JS property — the no-JS route.

| Child element | Attributes | Text content | Notes |
|---------------|------------|--------------|-------|
| `<kai-source>` | `description`, `headline`, `href`, `label`, `show-favicon` | — | Parse a single light-DOM `<kai-source>` element into a `KaiSourceItem` descriptor. Attribute mapping: - `href` → KaiSourceItem.href - `label` → KaiSourceItem.label - `headline` → KaiSourceItem.title (matches kai-source's prop name; "title" is a reserved HTMLElement attribute so kai-source uses "headline") - `description` → KaiSourceItem.description - `show-favicon`→ KaiSourceItem.showFavicon (bare boolean attribute) |

#### Composed from

`Components/Source`, `Components/SourceTrigger`, `Components/SourceContent`, `Components/SourceList`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-sources -->

Renders a list of sources using `<kai-source>` internally.

No events.

---

### `<kai-feedback-bar>` / `FeedbackBar`

<!-- spec:kai-feedback-bar -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `barTitle` | `bar-title` | `undefined | string` | `'Was this helpful?'` | The banner label (e.g. "Was this helpful?"). Attribute: `bar-title` (`title` is avoided because it is a global HTML attribute). |
| `collectDetail` | `collect-detail` | `undefined | false | true` | — | When set, a not-helpful vote opens an optional detail form before the thank-you confirmation. Attribute: `collect-detail`. |
| `categories` | — | `undefined | string[]` | — | Optional category chips for the detail form. Set as a JS property (array). |
| `detailTitle` | `detail-title` | `undefined | string` | — | Heading for the detail form. Attribute: `detail-title`. |
| `detailPlaceholder` | `detail-placeholder` | `undefined | string` | — | Placeholder for the detail comment box. Attribute: `detail-placeholder`. |
| `submitLabel` | `submit-label` | `undefined | string` | — | Submit button label in the detail form. Attribute: `submit-label`. |
| `thanksMessage` | `thanks-message` | `undefined | string` | — | Confirmation copy shown after a vote/submit. Attribute: `thanks-message`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-close` | — | The user dismissed the banner. |
| `kai-feedback` | `{ value: "helpful" | "not-helpful" }` | The user rated the response. `value` is `'helpful'` or `'not-helpful'`. |
| `kai-feedback-detail` | `{ value: "helpful" | "not-helpful"; category?: undefined | string; comment?: undefined | string }` | The user submitted the optional detail form (`collect-detail`). |

#### Composed from

`Components/FeedbackBar`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-feedback-bar -->

A thumbs-up / thumbs-down banner (e.g. "Was this helpful?").

---

### `<kai-file-upload>` / `FileUpload`

<!-- spec:kai-file-upload -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `multiple` | `multiple` | `undefined | false | true` | `true` | Allow selecting multiple files (default true). |
| `accept` | `accept` | `undefined | string` | — | `accept` attribute for the file picker (e.g. `image/*`). |
| `disabled` | `disabled` | `undefined | false | true` | `false` | Disable the dropzone: no clicking, no drag-and-drop. |
| `label` | `label` | `undefined | string` | `'Click or drop files to upload'` | Default dropzone label (overridable via the default slot). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-files-added` | `{ files: File[] }` | Files were picked or dropped. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | Custom dropzone content, replacing the default label (the `label` prop is the fallback). |

#### Composed from

`Components/FileUpload`, `Components/FileUploadTrigger`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-file-upload -->

A drag-and-drop / click-to-pick file upload dropzone.

---

### `<kai-voice-input>` / `VoiceInput`

<!-- spec:kai-voice-input -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `transcribe` | — | `undefined | ((audio: Blob) => Promise<string>)` | — | Transcriber the host supplies: records audio, returns the text. This is a **function-valued property** (`el.transcribe = async blob => '...'`) because a value-returning callback can't be modelled as a fire-and-forget event. |
| `disabled` | `disabled` | `undefined | false | true` | `false` | Disable the mic button (non-interactive). |
| `recognitionLang` | `recognition-lang` | `undefined | string` | — | BCP-47 language tag for the native `SpeechRecognition` path (e.g. `en-US`). Attribute: `recognition-lang` (the plain `lang` attribute is reserved by `HTMLElement` and can't be a custom-element property). No effect when `transcribe` is set or the browser lacks SpeechRecognition. |
| `interim` | `interim` | `undefined | false | true` | `false` | Emit live partial transcripts (`kai-transcript-interim`) during native recognition. Attribute: `interim`. No-op on the transcribe/fallback paths. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-audio-captured` | `{ blob: Blob }` | Raw audio captured (before transcription), for hosts that prefer to handle transcription themselves instead of via the `transcribe` property. Also the unsupported-fallback signal: no `transcribe`, no SpeechRecognition, so only the blob is produced (no text). |
| `kai-recording-change` | `{ recording: false | true }` | Recording started or stopped. Lets the host drive its own UI (waveform, push-to-talk indicator) in sync with the mic. Fires on real transitions only (manual click and programmatic start()/stop()), never on mount. |
| `kai-transcript-interim` | `{ text: string }` | Live partial transcript during native recognition (only when `interim` is set). Fires repeatedly before the final `kai-transcription`. |
| `kai-transcription` | `{ text: string }` | Final transcript: the `transcribe` property resolved, OR native `SpeechRecognition` produced final text (no `transcribe` set). |
| `kai-voice-error` | `{ source: "recognition"; error: string; message: string }` | A voice session failed, so no failure is ever silent. `detail.source` names the failing side (`recognition` on `<kai-voice-input>`, `synthesis` on `<kai-voice-output>`), `detail.error` carries the platform error code, the thrown exception's name, or `no-result` when recognition ended with no error and no text (the user said nothing), and `detail.message` is human-readable. Deliberate cancellation does not fire. |

#### Methods

Call these on the element instance: `document.querySelector('kai-voice-input').start()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `start` | `(): void` | Begin recording programmatically (e.g. push-to-talk bound to a global key). Runs the same getUserMedia path as clicking the mic; no-ops if already recording. |
| `stop` | `(): void` | Stop the in-progress recording, producing the blob (→ kai-audio-captured) and running transcription. Pairs with start() for push-to-talk. |

#### Composed from

`Components/VoiceInput`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-voice-input -->

A mic button that records audio and optionally transcribes it via a host-supplied function.

---

### `<kai-loader>` / `Loader`

<!-- spec:kai-loader -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `variant` | `variant` | `LoaderVariant | undefined` | `'circular'` | The animation style: `'circular' | 'classic' | 'pulse' | 'pulse-dot' | 'dots' | 'typing' | 'wave' | 'bars' | 'terminal' | 'text-blink' | 'text-shimmer' | 'loading-dots'`. Defaults to `'circular'`. |
| `size` | `size` | `undefined | "sm" | "md" | "lg"` | `'md'` | Loader size: `'sm' | 'md' | 'lg'`. Defaults to `'md'`. |
| `text` | `text` | `undefined | string` | — | Label for the text-based variants. |

#### Composed from

`Components/Loader`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-loader -->

An animated loading indicator with 12 style variants.

No events.

---

### `<kai-thinking-bar>` / `ThinkingBar`

<!-- spec:kai-thinking-bar -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `text` | `text` | `undefined | string` | `'Thinking'` | The shimmering label, e.g. "Thinking…". |
| `stoppable` | `stoppable` | `undefined | false | true` | `false` | When true, show a "stop" affordance that fires a `stop` event. |
| `stopLabel` | `stop-label` | `undefined | string` | `'Answer now'` | Label for the stop affordance. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-stop` | — | The "stop / answer now" affordance was clicked. |

#### Composed from

`Components/ThinkingBar`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-thinking-bar -->

An animated "thinking" shimmer bar with an optional stop affordance.

---

### `<kai-text-shimmer>` / `TextShimmer`

<!-- spec:kai-text-shimmer -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `text` | `text` | `undefined | string` | `''` | The text to shimmer. |
| `as` | `as` | `undefined | string` | `'span'` | Element tag to render as (default `span`). |
| `duration` | `duration` | `undefined | number` | `4` | Animation duration in seconds. |
| `spread` | `spread` | `undefined | number` | `20` | Gradient spread (5–45). |

#### Composed from

`Components/TextShimmer`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-text-shimmer -->

Text with a shimmer animation — useful for "thinking" indicators.

No events.

---

### `<kai-response-stream>` / `ResponseStream`

<!-- spec:kai-response-stream -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `text` | — | `undefined | string | AsyncIterable<string>` | `''` | Text to stream. A string, or an `AsyncIterable<string>` (set as a JS property, since async iterables can't be HTML attributes). |
| `mode` | `mode` | `undefined | "typewriter" | "fade"` | `'typewriter'` | Reveal animation. |
| `speed` | `speed` | `undefined | number` | `20` | Characters/segments per tick. |
| `as` | `as` | `undefined | string` | — | Element tag to render as. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-complete` | — | Streaming finished. |

#### Composed from

`Components/ResponseStream`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-response-stream -->

Renders a string or an `AsyncIterable<string>` with a reveal animation.

---

### `<kai-image>` / `Image`

<!-- spec:kai-image -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `base64` | `base64` | `undefined | string` | — | Base64-encoded image data (pair with `media-type`). |
| `bytes` | — | `undefined | Uint8Array<ArrayBufferLike>` | — | Raw image bytes (set as a JS property). |
| `alt` | `alt` | `undefined | string` | `''` | Alt text. |
| `mediaType` | `media-type` | `undefined | string` | — | MIME type (default `image/png`). |

#### Composed from

`Components/Image`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-image -->

Renders a base64-encoded or raw-bytes image.

No events.

---

### `<kai-checkpoint>` / `Checkpoint`

<!-- spec:kai-checkpoint -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `label` | `label` | `undefined | string` | — | Optional text beside the icon. |
| `tooltip` | `tooltip` | `undefined | string` | — | Tooltip on hover. |
| `variant` | `variant` | `undefined | "ghost" | "default" | "outline"` | `'ghost'` | Visual button style. |
| `size` | `size` | `undefined | "sm" | "md" | "lg" | "icon" | "icon-sm"` | `'sm'` | Button size (use an `icon*` size for an icon-only checkpoint). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-select` | — | The checkpoint was clicked. |

#### Composed from

`Components/Checkpoint`, `Components/CheckpointIcon`, `Components/CheckpointTrigger`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-checkpoint -->

A small button used to mark or navigate to a conversation checkpoint.

---

### `<kai-scope-picker>` / `ScopePicker`

<!-- spec:kai-scope-picker -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `availableAuthors` | — | `undefined | string[]` | `[]` | Authors to offer as scope filters. Omit to drop the Authors section (for a tag-only picker). Set as a JS property. |
| `availableTags` | — | `undefined | string[]` | `[]` | Tags to offer as scope filters. Omit to drop the Tags section (for an author-only picker). Set as a JS property. |
| `currentLabel` | `current-label` | `undefined | string` | `'All Content'` | The label shown on the trigger for the active scope. |
| `open` | `open` | `undefined | false | true` | — | Drive/observe the dropdown's open state (Shoelace-style: settable + reflected to the `open` attribute, the dropdown still self-manages on click/keyboard). Set `el.open = true`, or `<kai-scope-picker open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `disabled` | `disabled` | `undefined | false | true` | — | Disable the trigger: click/keyboard and `show()` no longer open the dropdown. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The scope dropdown opened or closed (by click, keyboard, Escape, outside-click, or a method). |
| `kai-scope-change` | `{ filters: { tags?: undefined | string[]; authors?: undefined | string[]; contentType?: undefined | "transcript" | "markdown"; dateRange?: undefined | { from: string; to: string } } | undefined }` | A scope was chosen (`undefined` filters = "All Content"). |

#### Methods

Call these on the element instance: `document.querySelector('kai-scope-picker').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Composed from

`Components/ChatScopePicker`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-scope-picker -->

A dropdown for filtering the chat to specific authors, tags, content type, or date range.

---

### `<kai-skills>` / `Skills`

<!-- spec:kai-skills -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `skills` | — | `undefined | { id: string; name: string }[]` | `[]` | The active skills to badge. Set as a JS property. Omit to supply them as `<kai-skill>` light-DOM children instead; when both are present the property's skills come first. Nothing renders when there are none. |

#### Declarative children

Compose these in light DOM instead of setting the JS property — the no-JS route.

| Child element | Attributes | Text content | Notes |
|---------------|------------|--------------|-------|
| `<kai-skill>` | `id` | yes | Parse a single light-DOM `<kai-skill>` element into a `Skill` descriptor. Attribute / content mapping: - `id` → Skill.id (falls back to `name` when absent) - `textContent` → Skill.name (the human-readable badge label) Example: `<kai-skill id="web-search">Web Search</kai-skill>` |

#### Composed from

`Components/MessageSkills`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-skills -->

Displays active skills as badges on a message.

No events.

---

### `<kai-empty>` / `Empty`

<!-- spec:kai-empty -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `emptyTitle` | `empty-title` | `undefined | string` | `''` | Title text. Attribute: `empty-title` (`title` is a global HTML attribute). |
| `description` | `description` | `undefined | string` | `''` | Description text. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The empty-state body below the title/description, usually the call to action. |
| `media` | replace | The leading illustration or icon above the title (any inline SVG or <img>). Replaces the built-in media box. |

#### Composed from

`Components/Empty`, `Components/EmptyHeader`, `Components/EmptyMedia`, `Components/EmptyTitle`, `Components/EmptyDescription`, `Components/EmptyContent`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-empty -->

Empty-state placeholder with a title and description.

No events.

---

### `<kai-thread>` / `Thread`

<!-- spec:kai-thread -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `messages` | — | `undefined | { id: string; role: "user" | "assistant"; parts: ({ type: "text"; text: string; raw?: undefined | { source: string; payload: unknown } } | { type: "reasoning"; text: string; label?: undefined | string; index?: undefined | number; streamId?: undefined | string; signature?: undefined | string; raw?: undefined | { source: string; payload: unknown } } | { type: "tool"; tool: { type: string; kind?: undefined | "command" | "file-change" | "search" | "fetch" | "mcp" | "image" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }; raw?: undefined | { source: string; payload: unknown } } | { type: "card"; envelope: { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }; raw?: undefined | { source: string; payload: unknown } } | { type: "source"; source: { id?: undefined | string; url?: undefined | string; title?: undefined | string; snippet?: undefined | string; index?: undefined | number }; raw?: undefined | { source: string; payload: unknown } } | { type: "file"; attachment: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }; raw?: undefined | { source: string; payload: unknown } })[]; actions?: undefined | ("copy" | "dislike" | "edit" | "like" | "regenerate" | "speak" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]; avatar?: undefined | { src?: undefined | string; fallback?: undefined | string; alt?: undefined | string }; feedback?: undefined | "like" | "dislike" }[]` | — | The full message thread to render, newest last. Each entry carries its role, ordered `parts`, and optional actions/avatar/feedback. Set as a JS property (`el.messages = [...]`); a NEW array reference per streaming chunk re-renders (mutating in place does not). |
| `loading` | `loading` | `undefined | false | true` | `false` | Show a typing indicator on the pending assistant turn. Set it while awaiting the assistant's reply. |
| `proseSize` | `prose-size` | `undefined | "xs" | "sm" | "base" | "lg"` | `'sm'` | Body/prose font scale for rendered markdown (`'xs' | 'sm' | 'base' | 'lg'`). Defaults to `'sm'`. |
| `codeTheme` | `code-theme` | `undefined | string` | `'github-dark-dimmed'` | Shiki theme name for syntax-highlighted code blocks (e.g. `'github-dark-dimmed'`). |
| `codeHighlight` | `code-highlight` | `undefined | false | true` | `true` | Enable Shiki syntax highlighting in code blocks. Turn off to render plain `<pre>` blocks (lighter, no highlighter load). Default true. |
| `actionsReveal` | `actions-reveal` | `undefined | "always" | "hover"` | `'always'` | Whether each message's action bar is always visible (`'always'`, default) or only revealed on hover of that message row (`'hover'`). |
| `scrollButton` | `scroll-button` | `undefined | false | true` | `true` | Show the scroll-to-bottom button inside the scroll area. Default true. |
| `class` | `class` | `undefined | string` | — | Extra classes applied to the thread's inner root. |
| `cardTypes` | — | `undefined | Record<string, string>` | — | Optional card type -> custom-element tag overrides/additions for `card` parts (merged over the built-ins). Property: `el.cardTypes`. Typed as a plain string map (not the `CardTagMap` alias) so the generated React wrapper inlines it instead of emitting an unresolved named type. |
| `cardSchemas` | — | `undefined | Record<string, object>` | — | JSON Schemas for the card types this app renders, keyed by envelope type. The companion of `cardTypes`, which says what DRAWS a card while this says what a VALID one looks like. An OBJECT, so it is a JS property only: `el.cardSchemas = { 'pricing-table': pricingSchema }`, never an attribute. `createCardRegistry(...).validationSchemas` is exactly this shape. Without it the kit validates its own seven built-ins and leaves your own card type, the one your app actually cares about, as the only unchecked thing on screen. A schema here WINS over a built-in of the same name. Typed `Record<string, object>` rather than `Record<string, JsonSchema>` deliberately: an imported `.json` schema widens `"type"` to `string`, and an authored one carries `$schema`/`title`/`description`/`additionalProperties`, so the tighter type would reject both of the normal ways to supply one. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-message-action` | `{ messageId: string; action: string; state?: undefined | "on" | "off" }` | A message's action button was clicked. `action` is the built-in name (`copy` / `like` / `dislike` / `regenerate` / `edit`) or a custom id. `state` is present only for the toggleable feedback votes: `'on'` when a like/dislike is set, `'off'` when re-tapped to clear. |

#### Methods

Call these on the element instance: `document.querySelector('kai-thread').scrollToBottom(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `scrollToBottom` | `(behavior?: ScrollBehavior): void` | Scroll the message list to the bottom (default `'smooth'`). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| `empty` | replace | Custom zero-state rendered in the message area while the thread is empty; replaces the built-in default. |

#### Composed from

`Components/Thread`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-thread -->

The message list on its own: renders a `messages` array (roles, ordered `parts`, actions, feedback) with streaming, markdown, code highlighting and a scroll-to-bottom button, no prompt input attached. Custom generative-UI cards plug in through the `cardTypes` / `cardSchemas` properties; an unregistered card type falls through to the shared fallback card rather than rendering blank. Same reactivity contract as `<kai-chat>`: a new `messages` array reference notifies, and a new object for each changed message is what makes the edit visible.

---

### `<kai-artifact>` / `Artifact`

<!-- spec:kai-artifact -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `src` | `src` | `undefined | string` | — | URL the preview iframe frames. Consumer-controlled. |
| `files` | — | `undefined | { path: string; url?: undefined | string; code?: undefined | string; language?: undefined | string; type?: undefined | "html" | "pdf" | "image" | "other"; additions?: undefined | number; deletions?: undefined | number; status?: undefined | "added" | "modified" | "deleted" | "renamed" | "untracked" }[]` | `[]` | Files for the Code tab tree + each file's preview `url`. Omit for a preview-only artifact (the Code tab then has nothing to show; pair it with `no-tabs` to hide the toggle). Set as a JS property (array). |
| `tab` | `tab` | `undefined | "preview" | "code"` | — | Controlled active tab: `preview` or `code`. When set, the artifact follows it (re-asserted on change). Leave unset for an uncontrolled tab (see `defaultTab`). |
| `defaultTab` | `default-tab` | `undefined | "preview" | "code"` | — | Uncontrolled INITIAL tab (used only when `tab` is unset). Default `preview`. Seeds the starting tab; the user can then switch freely without the consumer re-asserting a controlled `tab`. |
| `activeFile` | `active-file` | `undefined | string` | — | Selected file path. Syncs the tree highlight, Code source, and preview. |
| `sandbox` | `sandbox` | `undefined | string` | `'allow-scripts allow-forms'` | iframe `sandbox` override. Secure default `allow-scripts allow-forms` (NOT `allow-same-origin`). |
| `iframeTitle` | `iframe-title` | `undefined | string` | — | Accessible title for the preview iframe. |
| `maximized` | `maximized` | `undefined | false | true` | `false` | Reflects the artifact's own maximized view-state (usually driven by the protocol). |
| `expandable` | `expandable` | `undefined | false | true` | `false` | Show the expand-to-fill button (OPT-IN). |
| `openInTab` | `open-in-tab` | `undefined | false | true` | `false` | Show the open-in-new-tab button (OPT-IN). |
| `noNav` | `no-nav` | `undefined | false | true` | `false` | Hide back/forward. |
| `noReload` | `no-reload` | `undefined | false | true` | `false` | Hide reload. |
| `noHome` | `no-home` | `undefined | false | true` | `false` | Hide home. |
| `noPathField` | `no-path-field` | `undefined | false | true` | `false` | Hide the address field. |
| `noTabs` | `no-tabs` | `undefined | false | true` | `false` | Hide the Preview|Code toggle. |
| `standalone` | `standalone` | `undefined | false | true` | `false` | Standalone chrome: rounded corners + border (else square, borderless in-panel). |
| `readonlyPath` | `readonly-path` | `undefined | false | true` | `false` | Show the address but make it read-only (visible, nav-tracking, non-editable). |
| `displayUrl` | `display-url` | `undefined | string` | — | Friendly address shown in the path field instead of the real current url (read-only, non-navigable). Use when the framed url is not consumer-facing (e.g. a `data:` blob) so a clean address shows instead of leaking it. Scalar string: set as the `display-url` attribute or the `displayUrl` property. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-file-select` | `{ path: string }` | Fired when a file is selected. `detail.path`. |
| `kai-maximize-change` | `{ maximized: false | true }` | Artifact's own maximize button toggled (consumer-observable; non-bubbling). |
| `kai-maximize-intent` | `{ requested: false | true }` | The maximize PROTOCOL intent, raised as a raw bubbling + composed CustomEvent (not through `dispatch`) so an enclosing `<kai-resizable>` can catch it and maximize the containing panel. Declared here so it is typed and reaches the generated API. Listen for it to drive maximize from your own chrome, or re-emit it to trigger one. |
| `kai-navigate` | `{ url: string }` | Fired when the preview navigates. `detail.url` = the new location. |
| `kai-tab-change` | `{ tab: "preview" | "code" }` | Fired when the Preview|Code tab changes. `detail.tab`. |

#### Methods

Call these on the element instance: `document.querySelector('kai-artifact').back()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `back` | `(): void` | Go back in the artifact's own history stack (no-op when there's no prior entry). |
| `forward` | `(): void` | Go forward in the history stack (no-op when there's no forward entry). |
| `reload` | `(): void` | Force-reload the current preview url (also re-renders an inline PDF). |
| `home` | `(): void` | Navigate to the `src` home url (no-op when there's no `src`). |
| `navigate` | `(url: string): void` | Push + load a url in the preview, the path-field submit path (fires kai-navigate). |
| `selectFile` | `(path: string): void` | Select a file by path: highlights the tree, shows its source, navigates the preview (fires kai-file-select + kai-navigate). Named selectFile to avoid the `activeFile` prop. |
| `openExternal` | `(): void` | Open the current url in a new browser tab (no-op when there's no concrete url). Named openExternal, NOT openInTab, which is a prop (toolbar button visibility). |
| `maximize` | `(): void` | Enter the maximized view-state (fires kai-maximize-change{maximized:true}). Named maximize, NOT maximized, which is a prop. |
| `restore` | `(): void` | Exit the maximized view-state (fires kai-maximize-change{maximized:false}). |

#### Composed from

`Components/Artifact`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-artifact -->

A sandboxed preview panel for generated apps and pages: an iframe with browser chrome (back/forward, reload, an address field) and an optional Preview|Code toggle backed by a `files` tree. The iframe defaults to `sandbox="allow-scripts allow-forms"` with no `allow-same-origin`. Emits `kai-navigate`, `kai-tab-change` and `kai-file-select`; each `no-*` attribute strips a piece of chrome, and `display-url` shows a friendly address when the real one is a `data:` blob worth hiding.

---

### `<kai-audio-visualizer>` / `AudioVisualizer`

<!-- spec:kai-audio-visualizer -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `variant` | `variant` | `undefined | string` | `'bar'` | Look to render: `bar` (default), `grid`, `radial`, `wave`, `aurora`, `custom`. `aura` is accepted as a LiveKit-markup alias for `aurora`. Attribute: `variant`. |
| `state` | `state` | `undefined | string` | `'idle'` | `idle` (default), `connecting`, `listening`, `thinking`, `speaking`, `disconnected` (connection down: the dead, flat look). LiveKit's room-lifecycle state names are accepted as aliases. Attribute: `state`. |
| `size` | `size` | `undefined | string` | `'md'` | `icon` | `sm` | `md` (default) | `lg` | `xl`. Attribute: `size`. |
| `barCount` | `bar-count` | `undefined | number` | — | Bars to draw. Bar and radial only. Attribute: `bar-count`. |
| `count` | `count` | `undefined | number` | — | Grid only: rows and columns of the (always square) grid. Attribute: `count`. |
| `radius` | `radius` | `undefined | number` | — | Radial only: ring distance from center, in px. Attribute: `radius`. |
| `spread` | `spread` | `undefined | number` | — | Grid only: ring distance for the connecting animation, in cells. Attribute: `spread`. |
| `interval` | `interval` | `undefined | number` | — | Grid only: ms between scripted frames. Attribute: `interval`. |
| `color` | `color` | `undefined | string` | — | CSS color for the geometry, overriding the inherited `currentColor`. Attribute: `color`. |
| `complexity` | `complexity` | `undefined | number` | — | Shader variants only: pattern density, 0..1. Attribute: `complexity`. |
| `label` | `label` | `undefined | string` | — | Setting this makes the element an announced image (`role="img"`) instead of decorative (`aria-hidden`). Attribute: `label`. |
| `stream` | — | `undefined | MediaStream` | — | Live microphone or WebRTC audio to analyze. JS property only. NOTE: amplitude renders only while state is "speaking" unless listening-amplitude is set; every other state plays its scripted animation and ignores the audio. |
| `audioElement` | — | `undefined | HTMLMediaElement` | — | An `<audio>` or `<video>` element to tap for its audio. JS property only. NOTE: amplitude renders only while state is "speaking" unless listening-amplitude is set; every other state plays its scripted animation and ignores the audio. |
| `bands` | — | `undefined | number[]` | — | Pre-computed levels, 0..1. Set this and no AudioContext is ever built, which is what keeps headless/SSR rendering and browser-speech-synthesis playback (which exposes no audio node) free of Web Audio entirely. JS property only. A new array reference is required for each update; mutating the existing array in place will not re-render. NOTE: amplitude renders only while state is "speaking" unless listening-amplitude is set; every other state plays its scripted animation and ignores the audio. |
| `listeningAmplitude` | `listening-amplitude` | `undefined | false | true` | — | Render live amplitude during the listening state as well, using the same presentation as speaking. Off by default, which keeps LiveKit parity: amplitude from stream, audio-element or bands renders only while state is "speaking". Set it to show a real mic-level picture while the user is the one talking. Boolean. Attribute: `listening-amplitude` (a bare attribute means true; reflected, so the property reads back what the attribute set). |
| `shader` | — | `undefined | { fragment: string; uniforms?: undefined | Record<string, { type: "1f" | "1i" | "1fv" | "2f" | "3f" | "3fv" | "4f" | "4fv" | "Matrix2fv" | "Matrix3fv" | "Matrix4fv"; value: number | number[] }> }` | — | Custom fragment shader for `variant="custom"`. JS property only. |
| `animateWhenNotVisible` | `animate-when-not-visible` | `undefined | false | true` | — | Shader variants only: keep animating while scrolled off screen. Off by default, which stops drawing and releases the WebGL context until the element comes back (browsers ration contexts to roughly 16 a page). Does not override `prefers-reduced-motion`. Attribute: `animate-when-not-visible`. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-audio-visualizer::part(name)`.

| Part | Description |
|------|-------------|
| `::part(bar)` | A single bar in the `bar` variant, or a single spoke in the `radial` variant. Also carries `data-kai-index` and `data-kai-highlighted` ("true"/"false") for use inside the shadow root; to style the lit state from OUTSIDE, combine with the `highlighted` part below rather than an attribute selector. <br>`kai-audio-visualizer::part(bar) { border-radius: 2px }
kai-audio-visualizer::part(bar highlighted) { background: var(--brand) }` |
| `::part(cell)` | A single dot in the `grid` variant. Also carries `data-kai-index` and `data-kai-highlighted` ("true"/"false") for use inside the shadow root; to style the lit state from OUTSIDE, combine with the `highlighted` part below rather than an attribute selector. <br>`kai-audio-visualizer::part(cell) { border-radius: 9999px }
kai-audio-visualizer::part(cell highlighted) { background: var(--brand) }` |
| `::part(highlighted)` | A second part TOKEN present on a `bar` or `cell` exactly when the sequencer or live audio has it lit, not a standalone styleable element. Combine it in the same `::part()` argument: `::part(bar highlighted)` or `::part(cell highlighted)`. This is the external equivalent of the internal `data-kai-highlighted="true"` attribute, which a `::part()` selector cannot reach (an attribute selector cannot follow a pseudo-element). <br>`kai-audio-visualizer::part(bar highlighted) { background: var(--brand) }
kai-audio-visualizer::part(cell highlighted) { background: var(--brand) }` |
| `::part(canvas)` | The WebGL canvas backing the `wave` and `aurora` variants. Restyle its size or radius, or layer a mask/filter, from outside. <br>`kai-audio-visualizer::part(canvas) { border-radius: 0.75rem }` |

#### Composed from

`Components/AudioVisualizer`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-audio-visualizer -->

Voice-mode visualizer with `bar`, `grid`, `radial`, `wave`, `aurora` and shader looks, driven by a lifecycle `state` (`idle`, `connecting`, `listening`, `thinking`, `speaking`, `disconnected`); LiveKit state names are accepted as aliases. Feed it live audio (`stream` or `audioElement`) or precomputed `bands`, which builds no AudioContext at all, so it renders headless and during browser speech synthesis. Amplitude renders only while `speaking` unless `listening-amplitude` is set; every other state plays its scripted animation.

---

### `<kai-voice-output>` / `VoiceOutput`

<!-- spec:kai-voice-output -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `text` | `text` | `undefined | string` | `''` | The utterance to read aloud. |
| `autoplay` | `autoplay` | `undefined | false | true` | `false` | Speak automatically when `text` is set/changed. |
| `synthesize` | — | `undefined | ((text: string) => Promise<Blob>)` | — | TTS model seam the host supplies: given text, returns an audio `Blob` to play. This is a **function-valued property** (`el.synthesize = async text => blob`); when set, the native `speechSynthesis` path is bypassed. Mirrors `<kai-voice-input>`'s `transcribe`. A value-returning callback can't be modelled as a fire-and-forget event, hence a property. |
| `disabled` | `disabled` | `undefined | false | true` | `false` | Disable the button (non-interactive). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-speaking-change` | `{ speaking: false | true }` | Playback started or stopped. Drive your own UI in sync. `speaking: true` fires when audio actually starts (utterance.onstart natively; audio playback beginning on the `synthesize` path), not when speak() is called; earlier releases fired it optimistically inside speak() itself. Fires on real transitions only (manual click and programmatic speak()/stop()), never on mount. |
| `kai-synthesized` | `{ blob: Blob }` | The model path (`synthesize`) resolved audio: the raw `Blob` before playback. |
| `kai-voice-error` | `{ source: "synthesis"; error: string; message: string }` | A voice session failed, so no failure is ever silent. `detail.source` names the failing side (`recognition` on `<kai-voice-input>`, `synthesis` on `<kai-voice-output>`), `detail.error` carries the platform error code, the thrown exception's name, or `no-result` when recognition ended with no error and no text (the user said nothing), and `detail.message` is human-readable. Deliberate cancellation does not fire. |

#### Methods

Call these on the element instance: `document.querySelector('kai-voice-output').speak()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `speak` | `(): void` | Speak the current `text` (native, or via `synthesize` if set). |
| `pause` | `(): void` | Pause playback (resumable). |
| `resume` | `(): void` | Resume paused playback. |
| `stop` | `(): void` | Stop playback and reset. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-voice-output::part(name)`.

| Part | Description |
|------|-------------|
| `::part(button)` | The speaker/play button. Restyle radius, size, padding, or colors from outside; it is a ghost icon button by default. <br>`kai-voice-output::part(button) { border-radius: 9999px; color: var(--color-primary) }` |

#### Composed from

`Components/VoiceOutput`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-voice-output -->

A speaker button that reads `text` aloud. Native `speechSynthesis` by default; set the function-valued `synthesize` property to route through your own TTS model instead. `kai-speaking-change` fires when audio actually starts and stops, and a failed synthesis emits `kai-voice-error`, never a silent no-op. The output sibling of `<kai-voice-input>`.

---

### `<kai-cards>` / `Cards`

<!-- spec:kai-cards -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `cards` | — | `undefined | { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }[]` | — | The stream of card envelopes to render. Set as a JS PROPERTY: `el.cards = [...]`. |
| `types` | — | `undefined | Record<string, string>` | — | Optional type→tag overrides/additions (merged over the built-ins). Property: `el.types`. Typed as a plain string map (not the `CardTagMap` alias) so the generated React wrapper inlines it instead of emitting an unresolved named type. |
| `schemas` | — | `undefined | Record<string, object>` | — | JSON Schemas for the card types this app renders, keyed by envelope type. The companion of `types`, which says what DRAWS a card while this says what a VALID one looks like. An OBJECT, so it is a JS property only: `el.schemas = { 'pricing-table': pricingSchema }`, never an attribute. `createCardRegistry(...).validationSchemas` is exactly this shape. Without it the kit validates its own seven built-ins and leaves your own card type, the one your app actually cares about, as the only unchecked thing on screen. A schema here WINS over a built-in of the same name, matching `mergeCardTags`, where your entry is spread over ours. Typed `Record<string, object>` rather than `Record<string, JsonSchema>` deliberately: an imported `.json` schema widens `"type"` to `string`, and an authored one carries `$schema`/`title`/`description`/`additionalProperties`, so the tighter type would reject both of the normal ways to supply one. See `CardSchemaMap` in components/card-renderer.tsx. |
| `policy` | — | `undefined | { onSubmit?: undefined | ((cardId: string, data: unknown) => void); onAction?: undefined | ((cardId: string, action: string, payload?: unknown) => void); onSendPrompt?: undefined | ((text: string, opts: { mode: "compose" | "send"; context?: unknown }) => void); onOpen?: undefined | ((url: string, target: "tab" | "artifact") => void); onState?: undefined | ((cardId: string, patch: unknown) => void); onDismiss?: undefined | ((cardId: string) => void); onReopen?: undefined | ((cardId: string) => void); onError?: undefined | ((cardId: string, message: string) => void); maxSendPromptMode?: undefined | "compose" | "send" }` | — | Optional CardPolicy handling child events. Property: `el.policy`. |
| `validateCards` | `validate-cards` | `undefined | false | true` | `true` | Validate each envelope's `data` against the schema for its type before rendering it, using a built-in's own schema or yours from `schemas`. Default `true`; set `validate-cards="false"` (or `el.validateCards = false`) to opt out. A hard failure (wrong type, a missing required field) renders a diagnostic naming the field instead of the card; a soft failure (bounds) renders the card unchanged. Both emit a contract `error` event. On in production too: a model emitting a bad shape is a production failure mode, so stripping the check there would hide it from exactly the person who needs to see it. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-card-resolved` | `{ cardId: string; resolution: { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }` | A child card transitioned to a resolved/deferred state (an action was chosen, a form/tasks submission landed, or it was dismissed). Re-emitted off the host as a non-bubbling convenience event so a consumer can observe resolution centrally without diffing the cards array. `detail` = `{ cardId, resolution }`. (A `reopen` un-resolves a card and has no `CardResolution`, so it does NOT fire this; observe reopen via the underlying bubbling `kai-card` event.) |

#### Methods

Call these on the element instance: `document.querySelector('kai-cards').resolve(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `resolve` | `(cardId: string, resolution: CardResolution): void` | Programmatically resolve a child card by id: set that envelope's `resolution` so the child re-renders into its read-only/resolved view. The imperative twin of the consumer mutating the cards array. No-op for an unknown id. |
| `dismiss` | `(cardId: string): void` | Collapse a card to its re-openable stub from the host side. Convenience for `resolve(cardId, { kind: 'dismissed' })`. |
| `getCard` | `(cardId: string): HTMLElement \| null` | Return the live child element node for a card id (or null) so consumers can call that card's own methods (focus/expand/…) without a shadow-DOM query. |

#### Composed from

`Components/CardFallback`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-cards -->

The list dispatcher for generative-UI card envelopes: set `cards` as a JS property and it renders one child `kai-*` card element per envelope by type, validating each envelope's `data` against its schema first. An unknown type renders the shared fallback plus a contract `error` instead of a blank. Register your own card types with the `types` and `schemas` properties, and route the children's bubbling `kai-card` events through an optional `policy`.

---

### `<kai-confirm>` / `Confirm`

<!-- spec:kai-confirm -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `data` | — | `undefined | { heading?: undefined | string; body?: undefined | string; tone?: undefined | "default" | "warning" | "danger"; actions: { id: string; label: string; style?: undefined | "primary" | "default" | "destructive"; payload?: unknown; default?: undefined | false | true }[]; dismissible?: undefined | false | true }` | — | The confirm definition (the CardEnvelope.data). Set as a JS PROPERTY: `el.data = { body, tone, actions:[…] }`. Import `ConfirmCardData` from `@kitn.ai/ui` for the full shape. |
| `cardId` | `card-id` | `undefined | string` | — | Stable card id correlating every emitted CardEvent. Attribute: `card-id`. |
| `heading` | `heading` | `undefined | string` | — | Heading rendered in the card chrome (= CardEnvelope.title). Attribute: `heading`. |
| `autofocus` | `autofocus` | `undefined | false | true` | `false` | Focus the default action on mount (off by default, so nothing steals focus). Attribute: `autofocus`. |
| `resolution` | — | `undefined | Record<string, unknown>` | — | Set when the user resolved this card; renders the read-only view. Property: `el.resolution = { kind:'action', action:'…' }`. |

#### Methods

Call these on the element instance: `document.querySelector('kai-confirm').focus(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `focus` | `(options?: FocusOptions): void` | Focus the default action button (or the first action if none is default). The same target `autofocus` focuses on mount, but on demand. |
| `confirm` | `(actionId?: string): void` | Activate an action by id: emits the `action` verb on kai-card and resolves the card (single-shot). With no id, invokes the default action. |
| `dismiss` | `(): void` | Trigger the dismiss path: emits `dismiss` on kai-card and optimistically collapses the card to its re-openable stub. |
| `reopen` | `(): void` | Re-open a dismissed card from its stub: emits `reopen` on kai-card. |

#### Composed from

`Components/ConfirmCard`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-confirm -->

A named-intent approval card: title, body and a small set of action buttons, defined by the `data` property. Activating an action emits the Card contract's `action` verb up a bubbling `kai-card` CustomEvent and resolves the card, so the same approval cannot double-fire. Works bare or inside a card host.

---

### `<kai-choice>` / `Choice`

<!-- spec:kai-choice -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `data` | — | `undefined | { prompt?: undefined | string; options: { id: string; label: string; description?: undefined | string; media?: undefined | { image?: undefined | string; imageAlt?: undefined | string; icon?: undefined | string }; meta?: undefined | string; recommended?: undefined | false | true; disabled?: undefined | false | true; payload?: unknown }[]; allowOther?: undefined | false | true | { label?: undefined | string; placeholder?: undefined | string }; submitLabel?: undefined | string; dismissible?: undefined | false | true }` | — | The choice definition (the CardEnvelope.data). Set as a JS PROPERTY: `el.data = { prompt, options:[…], allowOther?, submitLabel? }`. Import `ChoiceCardData` from `@kitn.ai/ui` for the full shape. |
| `cardId` | `card-id` | `undefined | string` | — | Stable card id correlating every emitted CardEvent. Attribute: `card-id`. |
| `heading` | `heading` | `undefined | string` | — | Heading rendered in the card chrome (= CardEnvelope.title). Attribute: `heading`. |
| `resolution` | — | `undefined | Record<string, unknown>` | — | Set when the user resolved this card; renders the read-only view. Property: `el.resolution = { kind:'action', action:'…' }`. |
| `value` | `value` | `undefined | string` | — | Controlled selection: the selected option id. When set, the consumer owns the current pick (RadioGroup `value`). Attribute: `value`. |
| `defaultValue` | `default-value` | `undefined | string` | — | Option id to pre-select on mount (uncontrolled seed). Attribute: `default-value`. |
| `disabled` | `disabled` | `undefined | false | true` | — | Disable the whole radiogroup + Submit (e.g. while the agent is busy). Attribute: `disabled`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-value-change` | `{ value: string }` | The selection changed BEFORE submit (a row click or the `select()` method). Distinct from the terminal `action` verb on the `kai-card` contract event. |

#### Methods

Call these on the element instance: `document.querySelector('kai-choice').focus(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `focus` | `(options?: FocusOptions): void` | Focus the radiogroup roving tab stop (or the Other input when selected). |
| `select` | `(optionId: string): void` | Select an option by id locally: no emit, fires kai-value-change (same as a row click). Lets a consumer pre-highlight or drive selection externally. |
| `send` | `(): void` | Submit the current selection: emits the `action` verb on kai-card and resolves the card (single-shot). Named `send`, not `submit`, per the shared vocabulary. |
| `dismiss` | `(): void` | Trigger the dismiss path: emits `dismiss` on kai-card and optimistically collapses the card to its re-openable stub. |
| `reopen` | `(): void` | Re-open a dismissed card from its stub: emits `reopen` on kai-card. |

#### Composed from

`Components/ChoiceCard`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-choice -->

A pick-one-of-N card: a prompt plus a radiogroup of rich option rows, set via the `data` property. Clicking a row selects it (firing `kai-value-change`); the Submit button emits the terminal `action` verb on the bubbling `kai-card` event and resolves the card. An optional `allowOther` row reveals a free-text escape.

---

### `<kai-form>` / `Form`

<!-- spec:kai-form -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `data` | — | `undefined | { type: "object"; title?: undefined | string; description?: undefined | string; required?: undefined | string[]; properties: Record<string, { type: "string" | "number" | "integer" | "boolean" | "array" | "object"; title?: undefined | string; description?: undefined | string; default?: unknown; enum?: undefined | unknown[]; format?: undefined | "email" | "uri" | "url" | "date" | "date-time" | "time"; minimum?: undefined | number; maximum?: undefined | number; minLength?: undefined | number; maxLength?: undefined | number; pattern?: undefined | string; minItems?: undefined | number; maxItems?: undefined | number; items?: undefined | Record<string, unknown> | { enum: unknown[] }; properties?: undefined | Record<string, Record<string, unknown>>; required?: undefined | string[]; readOnly?: undefined | false | true; "x-kai-widget"?: undefined | "textarea" | "slider" | "rating" | "radio" | "select" | "checkbox" | "password" | "switch"; "x-kai-placeholder"?: undefined | string; "x-kai-step"?: undefined | number; "x-kai-format"?: undefined | "tel" | "ssn" | "credit-card" | "custom"; "x-kai-mask"?: undefined | string; "x-kai-mask-guide"?: undefined | string }>; "x-kai-order"?: undefined | string[]; "x-kai-inlineMax"?: undefined | number; "x-kai-submitLabel"?: undefined | string; "x-kai-dismissible"?: undefined | false | true; "x-kai-actions"?: undefined | { id: string; label: string; variant?: undefined | "default" | "ghost" | "outline" }[] }` | — | The form definition: a JSON Schema (`type:'object'`) + `x-kai-*` UI hints (the CardEnvelope.data). Set as a JS PROPERTY: `el.data = { type:'object', properties:{…} }`. Import the `FormDefinition` type from `@kitn.ai/ui` for the full shape. It IS self-referential (`FormField.properties` is another `FormField` map), and the generated `element-types.d.ts` inlines every named type, so the shipped declaration bottoms out in a `Record<string, unknown>` placeholder one level down rather than carrying the recursion. That is why `FormDefinition` is a `type` alias: an interface gets no implicit index signature, so it would not be assignable to that placeholder. |
| `cardId` | `card-id` | `undefined | string` | — | Stable card id correlating every emitted CardEvent. Attribute: `card-id`. |
| `heading` | `heading` | `undefined | string` | — | Heading rendered in the card chrome (= CardEnvelope.title). Attribute: `heading`. |
| `resolution` | — | `undefined | Record<string, unknown>` | — | Set when the user resolved this card; renders the read-only view. Property: `el.resolution = { kind:'submit', data:{…} }`. |
| `values` | — | `undefined | Record<string, unknown>` | — | Controlled field values (JS property). When set, it wins over local edits. |
| `defaultValues` | — | `undefined | Record<string, unknown>` | — | Initial values overlaying the schema defaults (uncontrolled seed; JS property). |
| `disabled` | `disabled` | `undefined | false | true` | `false` | Disable all fields + submit. Attribute: `disabled`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-values-change` | `{ values: Record<string, unknown>; valid: false | true }` | The form's values changed on input. Carries the current coerced values + validity. |

#### Methods

Call these on the element instance: `document.querySelector('kai-form').focus(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `focus` | `(options?: FocusOptions): void` | Focus the first control, or the first INVALID control after a failed validation. |
| `send` | `(): void` | Validate + submit programmatically: focus the first invalid field on failure, else emit the `submit` CardEvent and resolve. Named `send`, not `submit`. |
| `validate` | `(): void` | Run client-side validation now and return `{ valid, errors? }` WITHOUT submitting. |
| `reset` | `(): void` | Re-seed the form from each field's `default` and clear errors. |
| `dismiss` | `(): void` | Trigger the dismiss path (emit `dismiss` + collapse to the re-openable stub). |
| `reopen` | `(): void` | Re-open a dismissed card from its stub (emit `reopen`). |

#### Composed from

`Components/Form`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-form -->

Renders a JSON-Schema form definition (the `data` property: `type:'object'` plus `x-kai-*` UI hints) into themed, accessible widgets, validates client-side, and emits the coerced, validated values up the Card contract as a bubbling `kai-card` event of `{ kind:'submit' }`. `kai-values-change` is the live change signal, distinct from the terminal submit. Works bare, without a card host.

---

### `<kai-tasks>` / `Tasks`

<!-- spec:kai-tasks -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `data` | — | `undefined | { mode?: undefined | "select" | "progress"; heading?: undefined | string; tasks: { id: string; label: string; description?: undefined | string; checked?: undefined | false | true; disabled?: undefined | false | true }[]; selectAll?: undefined | false | true; confirmLabel?: undefined | string; allowEmpty?: undefined | false | true; min?: undefined | number; max?: undefined | number; dismissible?: undefined | false | true }` | — | The tasks definition (the CardEnvelope.data). Set as a JS PROPERTY: `el.data = { tasks:[…], selectAll, confirmLabel, … }`. Import `TasksCardData` from `@kitn.ai/ui` for the full shape. |
| `cardId` | `card-id` | `undefined | string` | — | Stable card id correlating every emitted CardEvent. Attribute: `card-id`. |
| `heading` | `heading` | `undefined | string` | — | Heading rendered in the card chrome (= CardEnvelope.title). Attribute: `heading`. |
| `resolution` | — | `undefined | Record<string, unknown>` | — | Set when the user resolved this card; renders the read-only view. Property: `el.resolution = { kind:'submit', data:{ selected:[…] } }`. |
| `value` | — | `undefined | string[]` | — | Controlled selection (task ids; JS property). When set, it wins over local state. |
| `defaultValue` | — | `undefined | string[]` | — | Uncontrolled initial selection (task ids; JS property), overlaying per-task `checked`. |
| `disabled` | `disabled` | `undefined | false | true` | `false` | Freeze the whole list + Confirm. Attribute: `disabled`. |
| `readonly` | `readonly` | `undefined | false | true` | `false` | Display-only: rows can't be toggled and show the default cursor (no pointer, hover, or focus affordances). Keeps the look as-is. Attribute: `readonly`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-value-change` | `{ value: string[] }` | The selection changed on a toggle. Carries the selected ids in input order. |

#### Methods

Call these on the element instance: `document.querySelector('kai-tasks').select(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `select` | `(taskIds?: string[]): void` | Set the checked task ids (local-only, no emit), respecting disabled/max. With no arg, select all toggleable rows. |
| `toggle` | `(taskId: string, checked?: boolean): void` | Toggle one task by id, honoring the max gate (no `checked` = flip). |
| `send` | `(): void` | Confirm the current selection: emits the `submit` CardEvent + resolves (only when the min/max gate passes). Named `send`, not `submit`. |
| `focus` | `(options?: FocusOptions): void` | Focus the task group (select-all checkbox if shown, else the first row). |
| `dismiss` | `(): void` | Trigger the dismiss path (emit `dismiss` + collapse to the re-openable stub). |
| `reopen` | `(): void` | Re-open a dismissed card from its stub (emit `reopen`). |

#### Composed from

`Components/TasksCard`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-tasks -->

A selectable task/plan list card: checkbox rows, an optional select-all, and a confirm button that emits the Card contract's `submit` verb with the checked ids in input order. `mode:'progress'` swaps to the onboarding-checklist look, where checking a row is itself the action and the live `kai-value-change` is the signal (no confirm button).

---

### `<kai-remote>` / `Remote`

<!-- spec:kai-remote -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `src` | `src` | `undefined | string` | — | The remote card URL. Attribute: `src`. |
| `providerOrigin` | `provider-origin` | `undefined | string` | — | Exact provider origin (https: or http://localhost for dev). Attribute: `provider-origin`. |
| `envelope` | — | `undefined | Record<string, unknown>` | — | The card envelope to render. JS property only. |
| `policy` | — | `undefined | Record<string, unknown>` | — | Optional routing policy. JS property only. |

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-remote -->

Mounts a third-party card in a sandboxed cross-origin iframe and re-emits every CardEvent as a bubbling `kai-card` CustomEvent. `provider-origin` must be one exact origin (`https:`, or localhost for dev); wildcards, comma lists and any other `http:` origin are rejected before anything mounts.

---

### `<kai-coachmark>` / `Coachmark`

<!-- spec:kai-coachmark -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute; the element still self-manages). Set `el.open = true`, or `<kai-coachmark open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `headline` | `headline` | `undefined | string` | — | The bold title. Named `headline` because `title` collides with the global `HTMLElement.title` attribute (it throws at registration). |
| `badge` | `badge` | `undefined | string` | — | A small badge pill beside the headline (e.g. "New"). |
| `placement` | `placement` | `undefined | string` | — | Floating placement relative to the anchor (default `bottom`). |
| `tone` | `tone` | `undefined | "primary" | "info" | "success" | "warning" | "error"` | — | Color tone: `primary` (default, theme accent), `info` (blue), `success` (green), `warning` (amber), or `error` (red), reusing the kit's tool hues. |
| `arrow` | `arrow` | `undefined | false | true` | `true` | Render the arrow that points at the anchor (default `true`). Set `arrow="false"` for a plain bubble with no pointer. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-dismiss` | — | The × dismiss button was pressed. The consumer records that this hint was seen so it won't show again. |
| `kai-open-change` | `{ open: false | true }` | The coachmark opened or closed (a method, the ×, or a driven `open`). |

#### Methods

Call these on the element instance: `document.querySelector('kai-coachmark').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The ANCHOR the coachmark points at: the element it attaches to and positions against. The bubble body is the `content` slot. |
| `content` | replace | The bubble body text shown under the headline. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-coachmark::part(name)`.

| Part | Description |
|------|-------------|
| `::part(bubble)` | The hint bubble panel. Restyle its background, radius, or padding from outside; the default is bg-primary. <br>`kai-coachmark::part(bubble) { border-radius: 1rem }` |
| `::part(arrow)` | The arrow pointing at the anchor. Inherits the bubble color; recolor it alongside the bubble. <br>`kai-coachmark::part(arrow) { background: var(--color-accent) }` |
| `::part(badge)` | The small badge pill beside the headline (e.g. "New"). <br>`kai-coachmark::part(badge) { text-transform: none }` |
| `::part(title)` | The bold headline text. <br>`kai-coachmark::part(title) { font-size: 0.9375rem }` |
| `::part(dismiss)` | The dismiss button. Recolor or reposition it from outside. <br>`kai-coachmark::part(dismiss) { color: var(--color-primary-foreground) }` |

#### Composed from

`Components/Coachmark`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-coachmark -->

An anchored onboarding hint: wrap a trigger in the default slot and it points a tone-colored bubble at it, with a `badge` pill, a bold `headline`, the `content` slot body and a dismiss button. Record `kai-dismiss` (localStorage, your backend) so the hint shows once. Standard disclosure surface: settable + reflected `open`, `kai-open-change`, and `show()` / `hide()` / `toggle()`.

---

### Composition primitives & interactive elements

The polished building blocks you compose your own chrome from — themed, accessible, and Shadow-DOM-isolated. Each exposes its styleable `::part`s below (also discoverable via the `kai` MCP `component_reference`).

### `<kai-button>` / `Button`

<!-- spec:kai-button -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `variant` | `variant` | `undefined | "default" | "subtle" | "ghost" | "outline" | "destructive"` | `'default'` | Visual style. `default` (filled), `subtle` (muted text, hover tint, the toolbar icon look), `ghost` (transparent, hover fill), `outline`, or `destructive`. Defaults to `default`. |
| `size` | `size` | `undefined | "sm" | "md" | "lg" | "icon" | "icon-sm"` | `'md'` | Size token. `icon` / `icon-sm` are square (for icon-only buttons); `sm` / `md` / `lg` size text buttons. Defaults to `md`. |
| `icon` | `icon` | `undefined | string` | — | Leading icon: a named icon (e.g. `"mic"`, `"plus"`), an image URL/data-URI, or plain text. Renders before any slotted label. |
| `iconTrailing` | `icon-trailing` | `undefined | string` | — | Trailing icon, after the label (e.g. `"chevron-down"` for a menu affordance). |
| `label` | `label` | `undefined | string` | — | Accessible name. REQUIRED for icon-only buttons (no visible text); ignored when you slot visible text, which already names the button. An `aria-label` on top of visible text REPLACES that name rather than adding to it, so a button reading "Save" that answers to "Submit" is unusable by speech input (WCAG 2.5.3, Label in Name). The visible text wins. An `icon` / `icon-sm` size hides the slot, which makes the button icon-only whatever you slotted, so `label` is what names it there. |
| `disabled` | `disabled` | `undefined | false | true` | `false` | Disable the button (non-interactive, dimmed). |
| `full` | `full` | `undefined | false | true` | `false` | Stretch the button to the full width of its container (a block button), e.g. a card CTA or a stacked action. Attribute: `full`. |
| `align` | `align` | `undefined | "start" | "center" | "end"` | `'center'` | Justify the button's content: `start`, `center` (default), or `end`. Combine with `full` for a full-width, left-aligned button. |
| `type` | `type` | `undefined | "button" | "submit" | "reset"` | `'button'` | Native button `type`. Defaults to `button` (so it never submits a form). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-click` | — | The button was activated (pointer or keyboard). Carries no detail. The native `click` also bubbles (composed) for consumers who prefer it. |

#### Methods

Call these on the element instance: `document.querySelector('kai-button').focus(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `focus` | `(options?: FocusOptions): void` | Focus the inner `<button>` (host.focus() would focus the wrapper). |
| `blur` | `(): void` | Blur the inner `<button>`. |
| `click` | `(): void` | Programmatically activate the button. Runs the same path as a user click and fires kai-click. Forwarding to the inner button means `disabled` is respected automatically. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The button's label. Omit it for an icon-only button (pair with `aria-label`). |
| `icon` | replace | A custom leading icon (any inline SVG, inherits `currentColor`). Wins over the `icon` prop. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-button::part(name)`.

| Part | Description |
|------|-------------|
| `::part(button)` | The button element. Restyle radius, padding, colors, or weight from outside; the `variant`/`size` props set the defaults. <br>`kai-button::part(button) { border-radius: 9999px; font-weight: 600 }` |

#### Composed from

`UI/Button`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-button -->

A themed button — `variant` (incl. `subtle`), `size` (incl. icon-only), leading/trailing `icon`, and a `slot="icon"` escape hatch for any inline SVG. Restyle via `::part(button)`.

---

### `<kai-avatar>` / `Avatar`

<!-- spec:kai-avatar -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `src` | `src` | `undefined | string` | — | Image URL/data-URI. When absent, the `fallback` initials show instead. |
| `alt` | `alt` | `undefined | string` | — | Alt text for the image. Defaults to `fallback`. |
| `fallback` | `fallback` | `undefined | string` | `''` | Short text shown when there's no image, usually initials (e.g. "JD", "AI"). |
| `size` | `size` | `undefined | "sm" | "md" | "lg"` | `'md'` | Size token: `sm` | `md` (default) | `lg`. |

#### Composed from

`UI/Avatar`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-avatar -->

An image avatar with an automatic initials fallback, in three sizes.

---

### `<kai-badge>` / `Badge`

<!-- spec:kai-badge -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `variant` | `variant` | `undefined | "default" | "count" | "citation"` | `'default'` | `default` (muted pill) · `count` (compact number badge) · `citation` (filled primary, for inline citation markers). Defaults to `default`. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The badge's label: text, or a small inline icon plus text. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-badge::part(name)`.

| Part | Description |
|------|-------------|
| `::part(badge)` | The badge pill. Restyle its background, color, or shape; the `variant` prop (default/count/citation) sets the defaults. <br>`kai-badge::part(badge) { background: var(--color-primary); color: var(--color-primary-foreground) }` |

#### Composed from

`UI/Badge`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-badge -->

A small pill for labels, status, counts, or inline citation markers. Restyle via `::part(badge)`.

---

### `<kai-icon>` / `Icon`

<!-- spec:kai-icon -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `name` | `name` | `undefined | string` | `''` | A curated icon name (e.g. `"mic"`, `"globe"`), an image URL/data-URI, or plain text. |
| `size` | `size` | `undefined | "sm" | "md" | "lg"` | `'md'` | Size token: `sm` | `md` (default) | `lg`. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-icon::part(name)`.

| Part | Description |
|------|-------------|
| `::part(icon)` | The icon wrapper. Inherits `currentColor` and the `size` prop by default; recolor or resize it from outside. <br>`kai-icon::part(icon) { color: var(--color-primary) }` |

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-icon -->

A curated, theme-aware icon used standalone. Recolor via `::part(icon)` or `currentColor`.

---

### `<kai-tooltip>` / `Tooltip`

<!-- spec:kai-tooltip -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `content` | `content` | `undefined | string` | `''` | The hint text shown on hover/focus of the slotted trigger. |
| `openDelay` | `open-delay` | `undefined | number` | — | Delay (ms) before the tooltip appears on hover. Defaults to 600. Focus shows it immediately regardless. |
| `closeDelay` | `close-delay` | `undefined | number` | — | Delay (ms) before it hides after the pointer leaves. Defaults to 0 (hides immediately). |
| `placement` | `placement` | `undefined | string` | — | Preferred placement: `'top' | 'bottom' | 'left' | 'right'` (+ optional `-start`/`-end`). Defaults to `'top'`; flips to stay in view. |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute, the element still self-manages on hover/focus). Set `el.open = true`, or `<kai-tooltip open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `disabled` | `disabled` | `undefined | false | true` | — | Turn the tooltip off while keeping the trigger mounted (hover/focus and `show()` no longer open it). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The tooltip opened or closed (by hover/focus, outside-click, or a method). |

#### Methods

Call these on the element instance: `document.querySelector('kai-tooltip').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The TRIGGER the tooltip describes. The tip text is the `text` prop. |

#### Composed from

`UI/Tooltip`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-tooltip -->

A text hint shown on hover/focus of a slotted trigger; positioned and portaled inside the shadow root.

---

### `<kai-hover-card>` / `HoverCard`

<!-- spec:kai-hover-card -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `openDelay` | `open-delay` | `undefined | number` | — | Delay (ms) before the card opens on hover. Defaults to 0 (focus opens it immediately too). |
| `closeDelay` | `close-delay` | `undefined | number` | — | Delay (ms) before it closes after the pointer leaves. Defaults to 300. |
| `placement` | `placement` | `undefined | string` | — | Preferred placement: `'top' | 'bottom' | 'left' | 'right'` (+ optional `-start`/`-end`). Defaults to `'bottom'`; flips to stay in view. |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute, the element still self-manages on hover). Set `el.open = true`, or `<kai-hover-card open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `disabled` | `disabled` | `undefined | false | true` | — | Suppress the hover behavior entirely without unmounting. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The card opened or closed (by hover/focus, outside-click, or a method). |

#### Methods

Call these on the element instance: `document.querySelector('kai-hover-card').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The TRIGGER the card hovers off. The card body is the `card` slot. |
| `card` | inject | The rich content shown in the floating hover card. |

#### Composed from

`UI/HoverCardRoot`, `UI/HoverCardTrigger`, `UI/HoverCardContent`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-hover-card -->

Rich content on hover/focus of a trigger — the markup-carrying sibling of `<kai-tooltip>`. Trigger as default content, card body in `slot="card"`.

---

### `<kai-notice>` / `Notice`

<!-- spec:kai-notice -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `severity` | `severity` | `undefined | "neutral" | "info" | "warning" | "error" | "success"` | `'neutral'` | `neutral` (default) · `info` · `warning` · `error` · `success`. Drives the leading icon's color and the a11y role (`alert` for errors, else `status`). |
| `icon` | `icon` | `undefined | string` | — | Leading icon: omit for the severity default, `"none"` to hide it, or a named icon to override. |
| `dismissible` | `dismissible` | `undefined | false | true` | `false` | Show a dismiss (×) that hides the notice and emits `kai-dismiss`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-dismiss` | — | The notice was dismissed via its × (it also hides itself). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The notice message. `icon` and `action` are the named seams around it. |
| `action` | inject | A trailing action beside the message: a link or button. |
| `icon` | replace | A custom leading icon (any inline SVG, inherits `currentColor`). Overrides the severity default and the `icon` prop, the same escape hatch as `kai-button`. |

#### Composed from

`UI/Notice`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-notice -->

An inline notice/alert carrying a severity icon, the right a11y role, an optional `slot="action"`, and an optional self-dismissing ×.

---

### `<kai-separator>` / `Separator`

<!-- spec:kai-separator -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `orientation` | `orientation` | `undefined | "horizontal" | "vertical"` | `'horizontal'` | `horizontal` (default, block + full-width) or `vertical` (a rule inside a flex/grid row, stretching to the row height). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-separator::part(name)`.

| Part | Description |
|------|-------------|
| `::part(separator)` | The divider line. Restyle its color, thickness, or inset from outside. <br>`kai-separator::part(separator) { background: var(--color-border) }` |

#### Composed from

`UI/Separator`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-separator -->

A themed divider between groups of content (toolbar sections, menu groups, header/sidebar splits). Restyle via `::part(separator)`.

---

### `<kai-scroll-area>` / `ScrollArea`

<!-- spec:kai-scroll-area -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `orientation` | `orientation` | `undefined | "vertical" | "horizontal" | "both"` | `'vertical'` | Which axis scrolls. `vertical` (default) · `horizontal` · `both`. The cross axis is clamped so content can't overflow it. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The scrollable content. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-scroll-area::part(name)`.

| Part | Description |
|------|-------------|
| `::part(viewport)` | The scrolling container. Add padding or a max-height from outside; the thin scrollbar follows `--color-scrollbar-thumb`. <br>`kai-scroll-area::part(viewport) { padding-right: 0.5rem }` |

#### Composed from

`UI/ScrollArea`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-scroll-area -->

A scroll container with a themed, thin, cross-browser scrollbar and a keyboard-reachable region. Restyle via `::part(viewport)`.

---

### `<kai-skeleton>` / `Skeleton`

<!-- spec:kai-skeleton -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `variant` | `variant` | `undefined | "text" | "rect" | "circle"` | `'text'` | `text` (one or more lines), `rect` (a block), or `circle` (round). Defaults to `text`. |
| `width` | `width` | `undefined | string` | — | CSS width (e.g. `'12rem'`, `'60%'`). Defaults to full width (responsive); for `circle` it is the diameter. |
| `height` | `height` | `undefined | string` | — | CSS height. Defaults per variant (a text line height; circle = width). |
| `lines` | `lines` | `undefined | number` | — | `text` only: number of lines; the last is shorter. Defaults to 1. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-skeleton::part(name)`.

| Part | Description |
|------|-------------|
| `::part(skeleton)` | The shimmer block(s). Recolor or change the opacity from outside; the default is a low-contrast foreground tint that reads in both light and dark. <br>`kai-skeleton::part(skeleton) { background: var(--color-primary); opacity: 0.15 }` |

#### Composed from

`UI/Skeleton`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-skeleton -->

A pulsing loading placeholder that preserves layout while content arrives. Responsive by default (fills its container); prop-driven `variant` (text/rect/circle) + `width`/`height`/`lines`.

---

### `<kai-menu>` / `Menu`

<!-- spec:kai-menu -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `items` | — | `undefined | { id?: undefined | string; label?: undefined | string; icon?: undefined | string; shortcut?: undefined | string; checked?: undefined | false | true; radioGroup?: undefined | string; disabled?: undefined | false | true; separator?: undefined | false | true; heading?: undefined | false | true; items?: undefined | Record<string, unknown>[] }[]` | — | Tree of menu items. Set as a JS property, not an HTML attribute. |
| `placement` | `placement` | `undefined | string` | — | Optional placement hint (unused by the underlying Dropdown which always positions bottom-start, kept for future extension). |
| `triggerIcon` | `trigger-icon` | `undefined | string` | — | Built-in trigger: leading icon (a named icon like `"plus"`, an image URL/data-URI, or text). Use this instead of slotting `slot="trigger"` for the common case; a slotted trigger overrides it. |
| `triggerLabel` | `trigger-label` | `undefined | string` | — | Built-in trigger: a text label (e.g. `"High"`). This is the trigger's VISIBLE text, so it is also its accessible name, and `label` does not override it: an accessible name that does not contain the visible text is unreachable by speech input, which is what WCAG 2.5.3 (Label in Name) exists for. A slotted `slot="trigger"` replaces this built-in trigger entirely and is named differently; see `label`. |
| `triggerIconTrailing` | `trigger-icon-trailing` | `undefined | string` | — | Built-in trigger: a trailing icon (e.g. `"chevron-down"` for a select look). |
| `label` | `label` | `undefined | string` | — | Accessible name for a trigger with no visible label. Ignored when `triggerLabel` is set, which is already the visible name. It DOES name a slotted `slot="trigger"`, and that is a difference in what the two slots MEAN, not a limitation. `<kai-button>`'s slot IS the button's label, so text slotted there is the name and `label` steps aside. This slot is VISUAL content, a `+` or an `<svg>`, with the name supplied separately: decoration beside a name, never a second name competing with one. So `label` names the trigger here by design. Slotting a real WORD rather than a glyph makes that word a visible label, and an accessible name has to contain the visible text. Then either drop `label` or make it contain the word you slotted. |
| `full` | `full` | `undefined | false | true` | `false` | Stretch the trigger to the full width of the menu's container (a block row), e.g. a sidebar-footer account row. Same affordance as `<kai-button full>`. Attribute: `full`. |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute, the menu still self-manages on click/keyboard). Set `el.open = true`, or `<kai-menu open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `disabled` | `disabled` | `undefined | false | true` | — | Disable the trigger: click/keyboard and `show()` no longer open the menu. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The menu opened or closed (by click, keyboard, Escape, outside-click, or a method). |
| `kai-select` | `{ id: string; checked?: undefined | false | true; radioGroup?: undefined | string }` | Fired when the user selects a leaf item. - Plain items: `{ id }`. - Checkbox items: `{ id, checked }` where `checked` is the NEW state. - Radio items: `{ id, radioGroup }`, where the consumer marks `id` as the selected one in `radioGroup` and clears the others. |

#### Methods

Call these on the element instance: `document.querySelector('kai-menu').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| `trigger` | replace | Your own trigger element; replaces the built-in button driven by the `trigger-icon` / `trigger-label` props. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-menu::part(name)`.

| Part | Description |
|------|-------------|
| `::part(shortcut)` | The right-aligned per-item keyboard shortcut, rendered as kai-kbd key caps. Shown only when an item carries a `shortcut`. <br>`kai-menu::part(shortcut) { opacity: 0.8 }` |

#### Composed from

`UI/Dropdown`, `UI/DropdownTrigger`, `UI/DropdownContent`, `UI/DropdownItem`, `UI/DropdownSeparator`, `UI/DropdownLabel`, `UI/DropdownCheckboxItem`, `UI/DropdownRadioItem`, `UI/DropdownSub`, `UI/DropdownSubTrigger`, `UI/DropdownSubContent`, `UI/Kbd`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-menu -->

A cascading action menu built from a JSON items-tree (submenus, separators, checkboxes, headings), with a built-in or slotted trigger.

---

### `<kai-command>` / `Command`

<!-- spec:kai-command -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `items` | — | `undefined | { id: string; label: string; icon?: undefined | string; description?: undefined | string; shortcut?: undefined | string; group?: undefined | string }[]` | — | Flat list of items. Set as a JS property, not an HTML attribute. |
| `placeholder` | `placeholder` | `undefined | string` | — | Placeholder text for the search input. |
| `emptyLabel` | `empty-label` | `undefined | string` | — | Label shown when no items match the current query. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-active-change` | `{ id: string | undefined }` | Fired when the highlighted/active item changes, via Arrow keys or when filtering re-clamps the active row. `id` is the newly active item's id, or `undefined` when no item is active (e.g. the filtered list is empty). Lets a host preview the active item without committing a selection. |
| `kai-query-change` | `{ value: string }` | Fired on every keystroke in the search input. |
| `kai-select` | `{ id: string }` | Fired when the user selects an item (click or Enter). |

#### Methods

Call these on the element instance: `document.querySelector('kai-command').focus(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `focus` | `(options?: FocusOptions): void` | Focus the search combobox input inside the shadow root so the palette is type-ready on demand (Shadow-DOM autofocus is unreliable, so hosts call this after opening the palette). |
| `blur` | `(): void` | Blur the focused search input. |
| `clear` | `(): void` | Reset the search query to empty, re-showing all items, and fire `kai-query-change` with `''`. Mirrors the Escape-key behavior. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-command::part(name)`.

| Part | Description |
|------|-------------|
| `::part(shortcut)` | The right-aligned per-row keyboard shortcut, rendered as kai-kbd key caps. Shown only when a row carries a `shortcut`. <br>`kai-command::part(shortcut) { opacity: 0.8 }` |

#### Composed from

`UI/CommandList`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-command -->

A grouped, filterable command / mention palette (the `@`-picker pattern).

---

### `<kai-input>` / `Input`

<!-- spec:kai-input -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `type` | `type` | `undefined | string` | `'text'` | Native input type: `text` (default) · `email` · `url` · `search` · `tel` · `password` · `number`. Single-line only. |
| `value` | `value` | `undefined | string` | — | Controlled value, and always the CANONICAL one when a mask is active: digits for `tel` / `ssn` / `credit-card`, the formatted text for `custom`. Settable and reflected to the `value` attribute. `el.value = '5551234567'` drives it (no event) and is re-fitted to the mask on the way in, so the field shows `555-123-4567`. Read `el.value` for live state; the formatted text rides along on every `kai-input` / `kai-change` detail as `formattedValue`. |
| `placeholder` | `placeholder` | `undefined | string` | — | Placeholder shown when empty. |
| `label` | `label` | `undefined | string` | — | Field label, linked to the input. |
| `hint` | `hint` | `undefined | string` | — | Helper text below the control. |
| `error` | `error` | `undefined | string` | — | Error text; flips the field invalid (`aria-invalid` + destructive border). |
| `size` | `size` | `undefined | "sm" | "md"` | `'md'` | Control density: `sm` or `md`. Defaults to `md`. |
| `disabled` | `disabled` | `undefined | false | true` | — | Disable interaction. |
| `readonly` | `readonly` | `undefined | false | true` | — | Make the input read-only. |
| `required` | `required` | `undefined | false | true` | — | Mark the input required. |
| `invalid` | `invalid` | `undefined | false | true` | — | Force the invalid state without an `error` string. |
| `name` | `name` | `undefined | string` | — | Form-control name. |
| `autocomplete` | `autocomplete` | `undefined | string` | — | Autofill hint forwarded to the inner input (e.g. `email`, `current-password`). |
| `inputmode` | `inputmode` | `undefined | string` | — | Virtual-keyboard hint forwarded to the inner input (e.g. `numeric`, `email`). |
| `format` | `format` | `undefined | string` | — | Mask pattern: `#` a digit, `@` a letter or digit, `*` an obscurable letter or digit, and every other character a positional literal (`@@@-####` → `CHG-4821`). The literal `default` is the opt-in sentinel: it resolves to the default format of `semantic` (`tel` → `###-###-####`). A bare `semantic` never starts masking on its own, so an opt-in token is what turns tier 2 on. |
| `guide` | `guide` | `undefined | string` | — | Placeholder guide shown at unfilled positions, aligned position for position with `format`: `mm/dd/yyyy` against `##/##/####`. Spaces are a valid guide character, so a guide of blanks and separators is how a phone field shows its shape without showing letters. Without a guide the field shows only up to the last typed character. A guide is a visual aid, never an accessible name: keep the `hint` text as well. |
| `semantic` | `semantic` | `undefined | "credit-card" | "custom" | "ssn" | "tel"` | — | Semantic field type: `tel` · `ssn` · `credit-card` · `custom`. On its own it sets `inputmode` / `autocomplete` / `spellcheck` / `autocorrect` / `autocapitalize` and decides the canonical value; it never starts masking by itself. |
| `caseMode` | `case-mode` | `undefined | "preserve" | "upper" | "lower"` | — | Case folding applied to typed and pasted text: `preserve` (default) · `upper` · `lower`. Attribute: `case-mode`. |
| `copyPolicy` | `copy-policy` | `undefined | "formatted" | "canonical" | "obscured" | "blocked"` | — | What a copy or cut of a masked field puts on the clipboard: `canonical` (default) · `formatted` · `obscured` · `blocked`. Attribute: `copy-policy`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-change` | `{ value: string; formattedValue: string }` | The value was committed (blur). Same detail shape as `kai-input`. |
| `kai-input` | `{ value: string; formattedValue: string }` | The value changed per keystroke. `value` is the canonical value (what a backend wants); `formattedValue` is the text on screen. With no mask the two are equal. |
| `kai-input-rejected` | `{ reason: "full" | "wrong-class" | "over-capacity" | "format-change-clipped"; data: string }` | A mask refused, or partly refused, some content. The reasons are `full` (no free position left), `wrong-class` (a letter into a digit position), `over-capacity` (a paste longer than the mask holds; what fits was kept), and `format-change-clipped` (the `format` changed under a value that no longer fits). `data` is the content that was refused. The first three are USER-INPUT errors, and are the ones worth announcing in a polite live region. `format-change-clipped` is not one: it follows the app changing its own configuration, so it reports and nothing more. None of the four touches validity, so `invalid` and `error` stay the consumer decision. |

#### Methods

Call these on the element instance: `document.querySelector('kai-input').focus(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `focus` | `(options?: FocusOptions): void` | Focus the inner input (the host can't reach into the shadow root). |
| `select` | `(): void` | Select the inner input's text. |
| `getRawValue` | `(): string` | The canonical value: digits for `tel` / `ssn` / `credit-card`, the formatted text for `custom`, and the field text when no mask is on. Identical to reading `el.value`, under the name backends use for the submitted form of a masked field. The mask engine has a third, narrower notion of raw (the fill characters with no literals at all) and that one is internal: it is not what any backend wants and it is not exposed here. |
| `getFormattedValue` | `(): string` | The text on screen, literals and guide included. The counterpart to `formattedValue` on the `kai-input` / `kai-change` details, for a consumer that needs it outside an event. |
| `clear` | `(): void` | Empty the value and fire `kai-change` with `''`. On a masked field this resets the mask itself, not just the text on screen, so the next character starts over. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| `leading` | inject | A glyph, prefix, or affix at the start of the field, inside the border. |
| `trailing` | inject | A button, unit, or affix at the end of the field, inside the border. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-input::part(name)`.

| Part | Description |
|------|-------------|
| `::part(field)` | The bordered control box (the row wrapping any affixes plus the input). Restyle its border, radius, surface, or focus ring. <br>`kai-input::part(field) { border-radius: 0.75rem }` |
| `::part(input)` | The inner input element. Restyle its text, padding, or placeholder. <br>`kai-input::part(input) { font-variant-numeric: tabular-nums }` |
| `::part(label)` | The field label above the control. Restyle its typography or spacing. <br>`kai-input::part(label) { font-weight: 600 }` |
| `::part(hint)` | The hint or error line below the control. Restyle its typography. <br>`kai-input::part(hint) { font-style: italic }` |

#### Composed from

`UI/Input`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-input -->

Single-line text field with a label, hint and error, plus opt-in format masks: `format` (`#` digit · `@` letter/digit · `*` obscurable, everything else a positional literal), `guide`, `semantic` (`tel` · `ssn` · `credit-card` · `custom`), `case-mode` and `copy-policy`. `value` is always the canonical form (digits for the digit types, the formatted text for `custom`); the on-screen text rides along as `formattedValue` on the event details. A date mask shapes typing only, it is not date validation.

---

### `<kai-card>` / `Card`

<!-- spec:kai-card -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `appearance` | `appearance` | `undefined | "outlined" | "filled" | "plain" | "accent"` | `'outlined'` | Surface treatment: `outlined` (default) | `filled` | `plain` | `accent`. Attribute: `appearance`. |
| `orientation` | `orientation` | `undefined | "vertical" | "horizontal" | "responsive"` | `'vertical'` | `vertical` (default, media on top) | `horizontal` (media at the start) | `responsive` (horizontal when the card's container is wide enough, else vertical, via a container query on the card's own width). Attribute: `orientation`. |
| `collapse` | `collapse` | `undefined | string` | `'28rem'` | The card width below which a `responsive` card collapses to vertical and the footer actions stack. A CSS length; default `28rem`. Attribute: `collapse`. |
| `dense` | `dense` | `undefined | false | true` | `false` | Tighter spacing for dense lists. Attribute: `dense`. |
| `dismissible` | `dismissible` | `undefined | false | true` | `false` | Show a close (×) that hides the card and emits `kai-dismiss`. Attribute: `dismissible`. Off by default. |
| `href` | `href` | `undefined | string` | — | Render the whole card as a link. Attribute: `href`. Wins over `clickable`. |
| `target` | `target` | `undefined | string` | — | `target` for the `href` anchor. Attribute: `target`. |
| `rel` | `rel` | `undefined | string` | — | `rel` for the `href` anchor. Attribute: `rel`. |
| `clickable` | `clickable` | `undefined | false | true` | `false` | Make the whole card a button (`role="button"`, Enter/Space, hover affordance) that emits `kai-card-click`. Attribute: `clickable`. Ignored when `href` is set. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-card-click` | — | A `clickable`/`href` card was activated (click, or Enter/Space). |
| `kai-dismiss` | — | The card was dismissed via its × (it also hides itself). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The card body, below the header/media regions. |
| `media` | inject | Full-bleed media (image/video/illustration) at the top (vertical) or start (horizontal). Clipped to the card corners. |
| `header` | inject | Header content, e.g. a title. Rendered above the body. |
| `header-actions` | inject | An actions cluster pinned to the end of the header row. |
| `footer` | inject | Footer content rendered below the body. |
| `footer-actions` | inject | Action buttons pinned to the end of the footer. Do NOT combine with a clickable/href card (nested interactive). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-card::part(name)`.

| Part | Description |
|------|-------------|
| `::part(card)` | The card root (a div, or an a when href is set). Restyle its radius, border, or background; set --kai-card-spacing for padding/gaps (the dense prop sets the compact default). <br>`kai-card::part(card) { border-radius: 1rem; --kai-card-spacing: 1.5rem }` |
| `::part(media)` | The full-bleed media region. Cap or crop it from outside (e.g. a fixed height with object-fit). <br>`kai-card::part(media) { max-height: 12rem }` |
| `::part(header)` | The header row (header content + header-actions). Add a divider or adjust its alignment. <br>`kai-card::part(header) { border-bottom: 1px solid var(--color-border) }` |
| `::part(body)` | The default-slot body region. <br>`kai-card::part(body) { font-size: 0.9375rem }` |
| `::part(footer)` | The footer row (footer content + footer-actions). <br>`kai-card::part(footer) { border-top: 1px solid var(--color-border) }` |
| `::part(dismiss)` | The dismiss (×) button shown when dismissible. Recolor or reposition it from outside. <br>`kai-card::part(dismiss) { color: var(--color-muted-foreground) }` |

#### Composed from

`UI/Card`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-card -->

The presentational card: one element whose flexibility comes from structural slots (`media`, `header`, `header-actions`, the default body, `footer`, `footer-actions`), `appearance` and `orientation` variants, and a single `--kai-card-spacing` knob. `orientation="responsive"` flips between horizontal and vertical on the card's own container width. `href` makes the whole card a link, `clickable` makes it a button emitting `kai-card-click`, and `dismissible` adds a close button that hides the card and emits `kai-dismiss`.

---

### `<kai-dialog>` / `Dialog`

<!-- spec:kai-dialog -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute; the element still self-manages on Escape/backdrop). Set `el.open = true`, or `<kai-dialog open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `label` | `label` | `undefined | string` | `DEFAULT_LABEL` | Accessible name for the modal, used when no `header` slot is projected: `<kai-dialog label="Delete workspace">`. A projected `header` WINS over this (it becomes `aria-labelledby`), because ARIA resolves `aria-labelledby` ahead of `aria-label` and the visible heading is the name both a sighted and a screen-reader user can be talked through. Defaults to `Dialog` so a modal is never nameless. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The dialog opened or closed (Escape, backdrop click, a driven `open`, or a method). |

#### Methods

Call these on the element instance: `document.querySelector('kai-dialog').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |
| `focus` | `(options?: FocusOptions): void` | Move focus to the dialog panel (no-op while closed). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The dialog body, between the `header` and `footer` slots. |
| `header` | inject | Optional title region at the top of the panel. |
| `footer` | inject | Optional actions region at the bottom of the panel. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-dialog::part(name)`.

| Part | Description |
|------|-------------|
| `::part(backdrop)` | The full-area scrim behind the panel. Restyle its color/blur. <br>`kai-dialog::part(backdrop) { background: rgb(0 0 0 / 0.6) }` |
| `::part(panel)` | The centered modal panel. Restyle width, radius, padding. <br>`kai-dialog::part(panel) { max-width: 32rem }` |
| `::part(body)` | The scrolling content region (the default slot). <br>`kai-dialog::part(body) { padding: 1.25rem }` |
| `::part(header)` | Optional title region at the top of the panel. |
| `::part(footer)` | Optional actions region at the bottom of the panel. |

#### Composed from

`UI/Dialog`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-dialog -->

A modal dialog with `header` and `footer` slots, Escape and backdrop close, and the standard disclosure surface: settable + reflected `open`, `kai-open-change`, and `show()` / `hide()` / `toggle()`. A projected `header` becomes the accessible name; otherwise `label` does, and a generic fallback keeps the modal from ever being nameless.

---

### `<kai-popover>` / `Popover`

<!-- spec:kai-popover -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `placement` | `placement` | `undefined | "top" | "right" | "bottom" | "left" | "bottom-end" | "bottom-start" | "left-end" | "left-start" | "right-end" | "right-start" | "top-end" | "top-start"` | `'bottom-start'` | Floating placement relative to the trigger (floating-ui placement). |
| `gutter` | `gutter` | `undefined | number` | `6` | Gap in px between the trigger and the panel. |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute, the element still self-manages on click). Set `el.open = true`, or `<kai-popover open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `disabled` | `disabled` | `undefined | false | true` | — | Turn the popover off while keeping the trigger mounted (clicks and `show()` no longer open it). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The popover opened or closed (click, Escape, outside-click, or a method). |

#### Methods

Call these on the element instance: `document.querySelector('kai-popover').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The popover panel body. The control that opens it is the `trigger` slot. |
| `trigger` | replace | The control that opens the popover (a button, an avatar, …). The panel anchors to it. |

#### Composed from

`UI/Popover`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-popover -->

A button-and-popover primitive: a trigger that toggles a floating panel of arbitrary content. The panel is a `role="dialog"` region, not a menu, so it can hold model rows, toggle switches, nested groups, any markup: the building block for header menus and other "button + popover card" affordances. Standard disclosure surface: settable + reflected `open`, `kai-open-change`, and `show()` / `hide()` / `toggle()`.

Popover, dropdown and menu are three corners of one deliberate triangle, not three takes on one widget. `<kai-popover>` is the WAI-ARIA non-modal dialog pattern: reach for it when the panel is content. `<kai-dropdown>` and `<kai-menu>` are both facades over the same menu machinery (`role="menu"`, roving focus across menu items with disabled ones skipped, typeahead, Home/End, submenus) and differ only in authoring model: `kai-dropdown` when you compose the menu items in markup, `kai-menu` when the items are data (`items[]`).

---

### `<kai-dropdown>` / `Dropdown`

<!-- spec:kai-dropdown -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `triggerIcon` | `trigger-icon` | `undefined | string` | — | Built-in trigger: leading icon (a named icon like `"plus"`, an image URL/data-URI, or text). A slotted `slot="trigger"` overrides it. |
| `triggerLabel` | `trigger-label` | `undefined | string` | — | Built-in trigger: a text label. This is the trigger's VISIBLE text, so it is also its accessible name, and `label` does not override it: an accessible name that does not contain the visible text is unreachable by speech input (WCAG 2.5.3, Label in Name). Same rule `kai-menu` follows. |
| `triggerIconTrailing` | `trigger-icon-trailing` | `undefined | string` | — | Built-in trigger: a trailing icon (e.g. `"chevron-down"` for a select look). |
| `label` | `label` | `undefined | string` | — | Accessible name for a trigger with no visible label. Ignored when `triggerLabel` is set, which is already the visible name. It DOES name a slotted `slot="trigger"`, which is VISUAL content with the name supplied separately: the same two-slot distinction `kai-menu` documents. |
| `full` | `full` | `undefined | false | true` | `false` | Stretch the trigger to the full width of its container (a block row). Attribute: `full`. |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute, the menu still self-manages on click/keyboard). Set `el.open = true`, or `<kai-dropdown open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `disabled` | `disabled` | `undefined | false | true` | — | Disable the trigger: click/keyboard and `show()` no longer open the menu. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The menu opened or closed (click, keyboard, Escape, outside-click, or a method). |

#### Methods

Call these on the element instance: `document.querySelector('kai-dropdown').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The menu body: your own rows. Give each `role="menuitem"`. The control that opens it is the `trigger` slot. |
| `trigger` | replace | Visual content of the trigger button (an icon, text, an `<svg>`). Replaces the built-in trigger* content; name it with `label`. |

#### Composed from

`UI/Dropdown`, `UI/DropdownTrigger`, `UI/DropdownContent`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-dropdown -->

A trigger plus a floating menu surface you fill yourself: slot arbitrary markup into the panel. The sibling of `<kai-menu>`, split by who owns the menu body: both are facades over the same underlying Dropdown, but `kai-menu` renders a JSON `items` tree for you while `kai-dropdown` is slot-composed, the shape you need when the rows are your own components rather than data. Use the built-in trigger via `trigger-icon` / `trigger-label`, or replace it entirely with `slot="trigger"`.

---

### `<kai-tabs>` / `Tabs`

<!-- spec:kai-tabs -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `items` | — | `undefined | { id: string; label?: undefined | string; icon?: undefined | string; disabled?: undefined | false | true }[]` | — | Tabs to render. Set as a JS property, not an HTML attribute. |
| `value` | `value` | `undefined | string` | — | Controlled selected id. Set as a JS property (or the `value` attribute); drive it from your app in response to `kai-tab-change`. Omit for uncontrolled. |
| `defaultValue` | `default-value` | `undefined | string` | — | Initial selected id when uncontrolled (use the `default-value` attribute in plain HTML). |
| `variant` | `variant` | `undefined | "segmented" | "underline"` | `'segmented'` | `segmented` (default, a pill group) or `underline` (an underlined row). |
| `block` | `block` | `undefined | false | true` | — | Stretch the strip to full width, each tab sharing the space equally. |
| `disabled` | `disabled` | `undefined | false | true` | — | Disable the whole strip. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-tab-change` | `{ value: string }` | A tab was selected (click, Enter/Space, or arrow-key move). `value` is the item's id. |

#### Methods

Call these on the element instance: `document.querySelector('kai-tabs').select(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `select` | `(id: string): void` | Select a tab by id (fires `kai-tab-change`). Ignores unknown/disabled ids. |
| `focus` | `(): void` | Focus the active tab (or the first focusable tab). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-tabs::part(name)`.

| Part | Description |
|------|-------------|
| `::part(tablist)` | The tab strip container (role="tablist"). Restyle its gap, padding, background, or radius from outside; the `variant` prop sets the segmented/underline defaults. <br>`kai-tabs::part(tablist) { gap: 0.5rem; background: var(--color-card) }` |
| `::part(tab)` | A single tab button. Restyle from outside; the active tab carries a `[data-active]` attribute, so target `::part(tab)[data-active]` for the selected look. <br>`kai-tabs::part(tab)[data-active] { color: var(--color-primary); font-weight: 600 }` |

#### Composed from

`UI/Tabs`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-tabs -->

An accessible tab strip, selection only: set `items` as a JS property, listen for `kai-tab-change`, and render what each tab shows yourself (this is not a content router). `variant` picks the segmented pill group or an underlined row; `block` stretches the strip to full width with the tabs sharing the space equally.

---

### `<kai-segmented>` / `Segmented`

<!-- spec:kai-segmented -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `options` | — | `{ value: string; label: string; icon?: undefined | string }[]` | `[]` | The selectable segments, left to right. Set as a JS property (array). |
| `value` | `value` | `undefined | string` | — | Controlled selected `value`. Settable and reflected to the `value` attribute. `el.value = 'preview'` drives it; choosing a segment updates it and fires `kai-change`. Read `el.value` for live state. |
| `size` | `size` | `undefined | "sm" | "md"` | `'md'` | Control density: `sm` or `md`. Defaults to `md`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-change` | `{ value: string }` | A segment was chosen. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-segmented::part(name)`.

| Part | Description |
|------|-------------|
| `::part(track)` | The segmented track (the pill container holding the segments). Restyle its background, radius, or padding. <br>`kai-segmented::part(track) { border-radius: 9999px }` |
| `::part(segment)` | Each segment button. Restyle padding, font weight, or the selected look. <br>`kai-segmented::part(segment) { font-weight: 600 }` |

#### Composed from

`UI/Segmented`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-segmented -->

A single-select pill track (a segmented / toggle group). Set `options` as a JS property; `value` is settable and reflected to the `value` attribute, and choosing a segment updates it and fires `kai-change`. Driving `el.value` programmatically does not re-fire the event, since the host already knows.

---

### `<kai-status>` / `Status`

<!-- spec:kai-status -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `status` | `status` | `undefined | "new" | "online" | "busy" | "away" | "offline"` | `'new'` | Presence/notification state → color. `new` (default) maps to the blue hue. |
| `pulse` | `pulse` | `undefined | false | true` | `false` | Animated ping ring (off by default; respects prefers-reduced-motion). |
| `label` | `label` | `undefined | string` | — | Accessible name. Without it the dot is decorative. |
| `size` | `size` | `undefined | "sm" | "md"` | `'sm'` | `sm` (default) or `md`. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-status::part(name)`.

| Part | Description |
|------|-------------|
| `::part(dot)` | The status dot. Recolor or resize it from outside; the `status` prop sets the default hue. <br>`kai-status::part(dot) { background: var(--color-tool-green) }` |

#### Composed from

`UI/Status`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-status -->

A small presence / notification dot: `status` picks the color, `pulse` adds a ping ring that respects `prefers-reduced-motion`, and `label` gives it an accessible name (without one the dot is decorative). Recolor via `::part(dot)`.

---

### `<kai-kbd>` / `Kbd`

<!-- spec:kai-kbd -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `keys` | `keys` | `undefined | string` | — | Shortcut spec: tokens joined by `+` (e.g. `Mod+Shift+K`). Omit it to show default-slot content instead. Display only; the element does not bind keys. |
| `platform` | `platform` | `undefined | "auto" | "mac" | "other"` | `'auto'` | `mac` uses ⌘/⌥, `other` uses Ctrl. `auto` (default) sniffs the OS. |
| `size` | `size` | `undefined | "sm" | "md"` | `'md'` | Cap size: `sm` or `md`. Defaults to `md`. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | Literal key text, when you are not using the `keys` prop to render key caps. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-kbd::part(name)`.

| Part | Description |
|------|-------------|
| `::part(key)` | Each key cap. Restyle its surface, border, radius, or font. <br>`kai-kbd::part(key) { border-radius: 0.375rem }` |
| `::part(separator)` | The gap between key caps. Inject a literal joiner (e.g. a plus sign) from outside. <br>`kai-kbd::part(separator)::after { content: "+" }` |

#### Composed from

`UI/Kbd`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-kbd -->

A keyboard-shortcut display: feed `keys` tokens joined by `+` (`Mod+Shift+K`) and it renders one inset key cap per token, mapped to platform glyphs. `Mod` renders as the command key on mac and Ctrl elsewhere; `platform="auto"` (the default) sniffs the OS. Display only, it binds no keys.

---

### `<kai-editable-label>` / `EditableLabel`

<!-- spec:kai-editable-label -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `value` | `value` | `undefined | string` | — | The label text. Settable and reflected to the `value` attribute. Read `el.value` for live state. |
| `editing` | `editing` | `undefined | false | true` | `false` | Controlled edit state. `el.editing = true` opens the field; reflected to the `editing` attribute. |
| `placeholder` | `placeholder` | `undefined | string` | — | Placeholder shown while editing / when the value is empty. |
| `disabled` | `disabled` | `undefined | false | true` | `false` | Disable entering edit mode. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-cancel` | — | Edit was cancelled (Esc); the text is restored. |
| `kai-rename` | `{ value: string }` | Committed a changed value (Enter / blur). |

#### Methods

Call these on the element instance: `document.querySelector('kai-editable-label').edit()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `edit` | `(): void` | Switch the label into its editing field, which autofocuses and selects the current text. Same entry point as a user double-click, and a no-op while `disabled`. Commit with `commit()` or by blurring, abandon with `cancel()` or Escape. |
| `commit` | `(): void` | Close the field and keep what was typed, exactly as blurring it does. `kai-rename` fires only when the text actually changed, so committing an untouched field is silent. A no-op while the field is closed. |
| `cancel` | `(): void` | Abandon the edit, exactly as Escape does: the original text is restored, the field closes and `kai-cancel` fires. `kai-rename` never fires, even if the field was edited. Also works when `editing` was set programmatically and the field has not rendered yet. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-editable-label::part(name)`.

| Part | Description |
|------|-------------|
| `::part(text)` | The read-mode label text. Restyle its typography; it swaps to the input on edit. <br>`kai-editable-label::part(text) { font-weight: 600 }` |
| `::part(input)` | The edit-mode input (the composed kai-input field). <br>`kai-editable-label::part(input) { font: inherit }` |

#### Composed from

`UI/EditableLabel`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-editable-label -->

Inline rename, built on `kai-input`: shows `value` as text, and a double-click (or `edit()`, or the `editing` prop) swaps in an autofocused field. Enter or blur commits and fires `kai-rename`, only when the value actually changed; Esc restores the text and fires `kai-cancel`.

---

### `<kai-progress-bar>` / `ProgressBar`

<!-- spec:kai-progress-bar -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `value` | `value` | `undefined | number` | — | Current progress value (0..max). Attribute: `value`. |
| `max` | `max` | `undefined | number` | — | The value `value` runs to (default 100). Attribute: `max`. |
| `label` | `label` | `undefined | string` | — | Optional caption above the track. Attribute: `label`. |
| `tone` | `tone` | `undefined | string` | `'primary'` | Fill color: `primary` (default), `success`, `warning`, `error`, `info`. Attribute: `tone`. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-progress-bar::part(name)`.

| Part | Description |
|------|-------------|
| `::part(track)` | The progress track (the background bar). Restyle its height, radius, or background from outside. <br>`kai-progress-bar::part(track) { height: 0.5rem }` |
| `::part(fill)` | The filled portion; its width follows value/max. Recolor it from outside. <br>`kai-progress-bar::part(fill) { background: var(--color-tool-green) }` |

#### Composed from

`UI/ProgressBar`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-progress-bar -->

A thin determinate progress bar: a rounded track whose fill width is `value / max`, clamped. `tone` picks a semantic fill hue and `label` adds a caption above the track. Scalar attributes only.

---

### `<kai-agent-card>` / `AgentCard`

<!-- spec:kai-agent-card -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `name` | `name` | `undefined | string` | — | The agent's name, the primary label. Attribute: `name`. |
| `active` | `active` | `undefined | false | true` | — | Selected / focused state: highlighted border + surface. Attribute: `active`. |
| `needsAttention` | `needs-attention` | `undefined | false | true` | — | Raise a prominent "Needs you" pill plus a glowing amber edge. This is the attention-routing signal that pulls focus to this agent. Attribute: `needs-attention`. |
| `status` | — | `undefined | { tone: "working" | "idle" | "done" | "error" | "blocked"; label?: undefined | string; pulse?: undefined | false | true }` | — | Run status. A JS PROPERTY (object), not an attribute. Shape: `{ tone, label?, pulse? }`, where `tone` is one of `working` | `idle` | `done` | `error` | `blocked` (maps to the kit's tool hues), `label` is an optional short string beside the dot, and `pulse` animates the dot. Set it with `el.status = { tone: 'working', label: 'Working', pulse: true }`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-activate` | — | The card was activated by a click, or by Enter / Space while focused. Promote this agent back to focus. |
| `kai-menu` | — | The trailing "..." kebab was clicked. The consumer opens its own menu; the card only surfaces the affordance (the click does not also activate the card). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-agent-card::part(name)`.

| Part | Description |
|------|-------------|
| `::part(status)` | The leading tone-colored status dot. <br>`kai-agent-card::part(status) { width: 0.625rem; height: 0.625rem }` |
| `::part(menu)` | The trailing overflow ("...") menu button. <br>`kai-agent-card::part(menu) { opacity: 1 }` |

#### Composed from

`UI/AgentCard`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-agent-card -->

The compact glanceable card for one agent in a multi-agent workspace: the agent name, a tone-colored status dot (`status` is a JS-property object, `{ tone, label?, pulse? }`), a needs-attention treatment, an `active` state and a trailing overflow button. `kai-activate` says promote this agent back to focus; `kai-menu` asks you to open your own per-agent menu (the card only surfaces the affordance).

---

### Layout & shell elements

Chat-agnostic arrangement: the navigation, panes, docks and settings rows you compose an app shell from. Data goes in as JS properties, intents come back out as `kai-*` events on the element; the shell never owns your routing or your state.

### `<kai-nav>` / `Nav`

<!-- spec:kai-nav -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `items` | — | `undefined | { id: string; label?: undefined | string; icon?: undefined | string; badge?: undefined | string; trailing?: undefined | string; disabled?: undefined | false | true; children?: undefined | Record<string, unknown>[]; status?: undefined | { tone: "primary" | "info" | "success" | "warning" | "error" | "neutral"; label?: undefined | string; pulse?: undefined | false | true }; meta?: undefined | string; action?: undefined | { icon: string; label: string }; closable?: undefined | false | true }[]` | — | The nav items. Set as a JS property (array, not an attribute). Each item may carry `children` (a collapsible group), a `status` dot, and trailing `meta` text. |
| `value` | `value` | `undefined | string` | — | Active item id (controlled). |
| `defaultValue` | `default-value` | `undefined | string` | — | Initial active id when uncontrolled. |
| `defaultCollapsed` | — | `undefined | string[]` | — | Ids of group items collapsed on first render (groups default to expanded). Set as a JS property (array). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-nav-item-action` | `{ value: string; action?: undefined | { icon: string; label: string } }` | A row's trailing `action` button was activated (not a select). `value` is the item id; `action` echoes the item's `{ icon, label }`. |
| `kai-nav-item-close` | `{ value: string }` | A `closable` row's trailing close button was activated (not a select). `value` is the item id. |
| `kai-nav-select` | `{ id: string }` | A nav item was activated. |

#### Methods

Call these on the element instance: `document.querySelector('kai-nav').select(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `select` | `(id: string): void` | Activate an item by id (fires kai-nav-select). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-nav::part(name)`.

| Part | Description |
|------|-------------|
| `::part(nav)` | The nav list container. Restyle its gap or padding from outside. <br>`kai-nav::part(nav) { gap: 0.25rem }` |
| `::part(item)` | A nav item button (leaf or group parent). The active leaf carries aria-current="page" and a group parent carries aria-expanded; target `::part(item)[aria-current]` for the selected look or `::part(item)[aria-expanded]` for a group row. <br>`kai-nav::part(item)[aria-current] { background: var(--color-accent) }` |
| `::part(group)` | The nested child list rendered under an expanded group item. Add a left guide line or tune its indent from outside. <br>`kai-nav::part(group) { border-left: 1px solid var(--color-border); margin-left: 1.1rem }` |
| `::part(chevron)` | The disclosure chevron on a group row (rotates when expanded). Recolor or resize it from outside. <br>`kai-nav::part(chevron) { opacity: 1; color: var(--color-primary) }` |
| `::part(status)` | The per-item status cluster (a colored dot in the tone hue + an optional label). Shown only when an item carries a `status`; the `pulse` flag animates the dot. Restyle from outside. <br>`kai-nav::part(status) { gap: 0.5rem }` |
| `::part(meta)` | The right-aligned muted trailing text on a row (e.g. a relative time). Shown only when an item carries `meta`; restyle from outside. <br>`kai-nav::part(meta) { color: var(--color-foreground); font-variant-numeric: tabular-nums }` |
| `::part(item-action)` | The trailing per-item action / close button, a sibling of the item button. Shown only when an item carries `action` or `closable`; reveal it on hover or pin it visible from outside. <br>`kai-nav::part(item-action) { opacity: 1 }` |

#### Composed from

`UI/Nav`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-nav -->

A vertical navigation list driven by a JSON `items` tree set as a JS property: id, label, an optional leading icon, a trailing `badge`, a `status` dot, trailing `meta` text, and `children` for collapsible groups. Selecting a leaf fires `kai-nav-select`; group rows toggle expand/collapse instead. Items may also carry a trailing `action` button or `closable: true`, which fire `kai-nav-item-action` / `kai-nav-item-close` rather than a select.

---

### `<kai-screen>` / `Screen`

<!-- spec:kai-screen -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute; the element still self-manages). Set `el.open = true`, or `<kai-screen open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `headline` | `headline` | `undefined | string` | — | Header title text. A projected `title` slot overrides it. (Named `headline` because `title` collides with the global `HTMLElement.title` attribute.) |
| `back` | `back` | `undefined | false | true` | — | Show the back button (default true). |
| `noInert` | `no-inert` | `undefined | false | true` | — | Opt out of marking sibling elements inert/aria-hidden while open (for unusual layouts). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-back` | — | Back navigation intent: the back button or Escape. The consumer flips their own routing in response (the screen knows nothing about the trigger). |
| `kai-open-change` | `{ open: false | true }` | The screen opened or closed (a method, `Escape` close, or driven `open`). |

#### Methods

Call these on the element instance: `document.querySelector('kai-screen').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |
| `focus` | `(options?: FocusOptions): void` | Move focus to the screen surface (no-op while closed). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The screen body, below the title bar. |
| `title` | replace | Rich header title; overrides the `headline` prop. |
| `actions` | inject | Header trailing cluster (e.g. an avatar or overflow menu). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-screen::part(name)`.

| Part | Description |
|------|-------------|
| `::part(header)` | The back-header bar (back button + title + actions). Restyle its height, padding, or border from outside. <br>`kai-screen::part(header) { height: 3.25rem; padding-inline: 1rem }` |
| `::part(back)` | The back button. Restyle or hide it from outside; `back="false"` removes it entirely. <br>`kai-screen::part(back) { border-radius: 9999px }` |
| `::part(body)` | The full-bleed surface that fills the mount point and scrolls its content. Tune padding or background from outside. <br>`kai-screen::part(body) { background: var(--color-card) }` |
| `::part(title)` | Rich header title; overrides the `headline` prop. |

#### Composed from

`Components/Screen`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-screen -->

A full-bleed overlay destination: the push/drill-in surface that takes over its mount point under a back header. Your routing owns the swap (flip `open` from your own trigger and from its `kai-back`); the screen owns being the takeover: sibling elements go inert while open (opt out with `no-inert`), focus moves in on open and restores on close, and Escape fires `kai-back`.

---

### `<kai-pane>` / `Pane`

<!-- spec:kai-pane -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `headline` | `headline` | `undefined | string` | `''` | The pane title (the agent / window name). Named `headline` because `title` collides with the global `HTMLElement.title` attribute (it throws at registration). Attribute: `headline`. |
| `subtitle` | `subtitle` | `undefined | string` | — | A role / label shown under the title (e.g. "Reviewer", "claude-sonnet"). Attribute: `subtitle`. |
| `maximized` | `maximized` | `undefined | false | true` | `false` | Show the restore glyph instead of maximize, and signal the maximized view-state. Drive it yourself in response to `kai-maximize`. Attribute: `maximized`. |
| `focused` | `focused` | `undefined | false | true` | `false` | Highlight the frame with a ring/border to mark the ACTIVE pane. Attribute: `focused`. |
| `showSplit` | `show-split` | `undefined | false | true` | `false` | Show a split-pane window control that fires `kai-split`. Off by default. Attribute: `show-split`. |
| `showDock` | `show-dock` | `undefined | false | true` | `false` | Show a dock-to-side window control that fires `kai-dock`. Off by default. Attribute: `show-dock`. |
| `status` | — | `undefined | { tone: "working" | "idle" | "done" | "error" | "blocked"; label?: undefined | string; pulse?: undefined | false | true }` | — | A tone-colored status dot (+ optional label) in the header. An object `{ tone, label?, pulse? }` set as a JS PROPERTY (not an attribute). |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-close` | — | The close (×) control was clicked. |
| `kai-dock` | — | The dock control was clicked (only present when `show-dock`). |
| `kai-maximize` | `{ maximized: false | true }` | The maximize/restore control was clicked. `detail.maximized` is the intended NEXT state. Drive the `maximized` prop yourself from it. |
| `kai-split` | — | The split control was clicked (only present when `show-split`). |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The pane body, below the header row. |
| `leading` | inject | A glyph or avatar at the start of the pane header. |
| `actions` | inject | Extra header controls, before the built-in window controls. |
| `footer` | inject | A pinned row below the body (e.g. a composer). |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-pane::part(name)`.

| Part | Description |
|------|-------------|
| `::part(header)` | The pane header bar (leading + title/status + actions + window controls). <br>`kai-pane::part(header) { padding-inline: 0.75rem }` |
| `::part(body)` | The scrolling body region (the default slot). <br>`kai-pane::part(body) { padding: 1rem }` |
| `::part(controls)` | The window-control cluster (maximize/close, and split/dock when enabled). <br>`kai-pane::part(controls) { gap: 0.25rem }` |
| `::part(footer)` | A pinned row below the body (e.g. a composer). |

#### Composed from

`UI/Pane`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-pane -->

A framed panel for a multi-agent workspace: a header with title and subtitle, a status dot (`status` is a JS-property object), extra `actions` and window controls, over a scrolling body and an optional pinned `footer` (a composer, say). The controls emit intents (`kai-maximize`, `kai-close`, `kai-split`, `kai-dock`); you drive the `maximized` and `focused` attributes yourself in response.

---

### `<kai-pane-group>` / `PaneGroup`

<!-- spec:kai-pane-group -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `tabs` | — | `undefined | { id: string; name: string; status?: undefined | { tone: "working" | "idle" | "done" | "error" | "blocked"; label?: undefined | string; pulse?: undefined | false | true }; needsAttention?: undefined | false | true; number?: undefined | number }[]` | — | The tabs to render. An array of `{ id, name, status?, needsAttention?, number? }` set as a JS PROPERTY (not an HTML attribute). |
| `active` | `active` | `undefined | string` | — | The active tab id (controlled, and reflected to the `active` ATTRIBUTE so `::part`/`[active]` selectors and the per-tab named slot follow it). Set it as the `active` attribute or drive it from `kai-tab-change`; omit for uncontrolled (the first tab). |
| `focused` | `focused` | `undefined | false | true` | `false` | Highlight the frame as the ACTIVE group in a multi-group layout. Attribute: `focused`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-tab-change` | `{ id: string }` | A tab was selected (click, Enter/Space, or arrow-key move). `detail.id` is the tab's id. |
| `kai-tab-close` | `{ id: string }` | A tab's close (×) was clicked. Drop the tab from `tabs` yourself. |
| `kai-tab-menu` | `{ id: string }` | A tab's "…" overflow was clicked. Open your own menu from `detail.id`. |

#### Methods

Call these on the element instance: `document.querySelector('kai-pane-group').select(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `select` | `(id: string): void` | Select a tab by id (fires `kai-tab-change`). Ignores unknown ids. |
| `focus` | `(): void` | Focus the active tab in the strip. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | Content shown for every tab. Use it INSTEAD of the per-tab `slot="<tab id>"` seams when you swap the content yourself. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-pane-group::part(name)`.

| Part | Description |
|------|-------------|
| `::part(tabs)` | The tab strip (role="tablist"). Restyle its background, height, padding, or gap from outside. <br>`kai-pane-group::part(tabs) { background: var(--color-card); gap: 0.25rem }` |
| `::part(tab)` | A single tab button. The active tab carries `[aria-selected="true"]`; target `::part(tab)[aria-selected="true"]` for the selected look. <br>`kai-pane-group::part(tab)[aria-selected="true"] { background: var(--color-accent) }` |
| `::part(body)` | The active tab's content region (the named/default slot host). <br>`kai-pane-group::part(body) { padding: 0.75rem }` |
| `::part(menu)` | The per-tab "…" overflow button. Reveal it on hover or pin it visible from outside. <br>`kai-pane-group::part(menu) { opacity: 1 }` |
| `::part(close)` | The per-tab close ("×") button. Recolor, resize, or hide it from outside. <br>`kai-pane-group::part(close) { color: var(--color-muted-foreground) }` |

#### Composed from

`UI/PaneGroup`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-pane-group -->

An editor group: a tab strip of numbered status-badge tabs over the active tab's content. Set `tabs` as a JS property and slot one named region per tab id; the group shows the active one. `kai-tab-change` / `kai-tab-close` / `kai-tab-menu` hand the tab UX decisions to you while the group owns the strip itself.

---

### `<kai-resizable>` / `Resizable`

<!-- spec:kai-resizable -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `orientation` | `orientation` | `undefined | "horizontal" | "vertical"` | `'horizontal'` | Layout axis: `horizontal` (row, default) or `vertical` (column). |
| `maximizedIndex` | — | `undefined | number | null` | `null` | Which item index is maximized (null = none). Declarative source of truth. |
| `handle` | `handle` | `undefined | "line" | "grip" | "none"` | `'line'` | Divider affordance drawn inside each draggable handle's 8px grab zone: - `line` (default): a 1px hairline, transparent at rest, tinting on hover/drag. - `grip`: a dotted grip handle. - `none`: no visible divider, just the invisible hit-area. The full grab zone and keyboard/ARIA behavior are identical for all three. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-change` | `{ sizes: number[] }` | Fired on drag-end / keyboard resize / visibility change. `detail.sizes` = panel sizes in percent. |
| `kai-maximize-change` | `{ maximized: false | true; index: number | null }` | Observe layout maximize state. |
| `kai-maximize-state` | `{ maximized: false | true }` | Authoritative maximize state, dispatched as a raw composed CustomEvent (not through `dispatch`) onto the affected `<kai-resizable-item>` and, on restore, onto the group host. A nested element (e.g. `<kai-artifact>`) listens for it to reconcile its own toggle. |

#### Methods

Call these on the element instance: `document.querySelector('kai-resizable').maximize(…)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `maximize` | `(index: number): void` | Imperatively maximize the item at `index` (thin wrapper over `maximizedIndex`). |
| `restore` | `(): void` | Imperatively restore from the maximized layout. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The `<kai-resizable-item>` panels, in order. Dividers are inserted between them. |

#### Composed from

`UI/ResizableHandle`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-resizable -->

A drag-resizable panel group: lays out its `<kai-resizable-item>` children along `orientation` with draggable handles between them, and emits `kai-change` with the new sizes. A zero-config maximize protocol lets any descendant ask its panel to fill the group: the request bubbles up as `kai-maximize-change` and the group notifies affected panels back down with `kai-maximize-state`. Double-click a handle to reset to the configured sizes.

---

### `<kai-resizable-item>` / `ResizableItem`

<!-- spec:kai-resizable-item -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `size` | `size` | `undefined | string` | — | Initial main-axis size: `"280px"` (fixed) or `"25%"`/`25` (percent). Omitted → flexible. |
| `min` | `min` | `undefined | string` | — | Minimum size during resize (px or %). |
| `max` | `max` | `undefined | string` | — | Maximum size during resize (px or %). |
| `locked` | `locked` | `undefined | false | true` | `false` | Fix this panel's size; adjacent dividers become non-draggable. |
| `hidden` | `hidden` | `undefined | false | true` | `false` | Hide this panel; its divider is dropped and the rest reflow. |
| `collapsed` | `collapsed` | `undefined | false | true` | `false` | Collapse this panel. Same layout effect as `hidden` (divider dropped, the rest reflow), but it WORKS as a bare boolean from framework JSX. A plain `<kai-resizable-item collapsed>` in React/Solid/Vue/Svelte collapses the panel at the first render; `hidden` does not, because a JSX boolean sets neither the `hidden` attribute nor the IDL property on a custom element, so the parent never sees it. The facade reflects `collapsed` to a `collapsed` attribute the parent reads. Prefer this over `hidden` for declarative collapse. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-change` | `unknown` |  |
| `kai-maximize-change` | `unknown` |  |
| `kai-maximize-state` | `unknown` |  |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | This panel's content. |

#### Composed from

`UI/ResizableHandle`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-resizable-item -->

One panel inside `<kai-resizable>`: `size` (the starting share), `min` / `max` bounds, and `locked`, `hidden` and `collapsed` states. Config props are mirrored to attributes the parent group reads, so setting them as properties from a framework works the same as authoring attributes in HTML.

---

### `<kai-dock>` / `Dock`

<!-- spec:kai-dock -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `open` | `open` | `undefined | false | true` | — | Drive/observe open state (Shoelace-style: settable + reflected to the `open` attribute; the element still self-manages on the launcher and Escape). Set `el.open = true`, or `<kai-dock open>`; listen for `kai-open-change`. |
| `defaultOpen` | `default-open` | `undefined | false | true` | — | Initial open state on mount (uncontrolled seed). |
| `position` | `position` | `undefined | "bottom-end" | "bottom-start" | "top-end" | "top-start"` | `'bottom-end'` | Which corner the dock sits in. Logical, so `-end` follows the writing direction and an RTL page docks on the left. Attribute: `position`. |
| `label` | `label` | `undefined | string` | `'Chat'` | The widget's NAME. Derives the panel's accessible name and both launcher names (`Open ${label}` / `Close ${label}`). Defaults to `Chat`. |
| `openLabel` | `open-label` | `undefined | string` | — | i18n override for the launcher's name while closed (default `Open ${label}`). |
| `closeLabel` | `close-label` | `undefined | string` | — | i18n override for the launcher's name while open (default `Close ${label}`). |
| `unread` | `unread` | `undefined | false | true` | — | Show the unread dot. YOURS: it renders only while closed, and the dock never writes it back. Clear it in your `kai-open-change` handler. |
| `disabled` | `disabled` | `undefined | false | true` | — | Disable the launcher; `show()` and `toggle()` are gated on it. |
| `hideClose` | `hide-close` | `undefined | false | true` | — | Suppress the dock's own built-in mobile close X. Set this when your slotted panel content supplies its own close affordance (e.g. a `<kai-chat slot="header-end">` close button), otherwise the two stack. TRADEOFF: the mobile panel reserves a padding band above its content so the built-in X never paints over slotted content; that band stays reserved unless you set this true, so only set it once your own control is actually in place. Attribute: `hide-close`. |
| `focusOnOpen` | `focus-on-open` | `undefined | "content" | "panel" | "none"` | `'content'` | Where focus lands on open: `content` (default, the first element you slotted), `panel`, or `none`. Attribute: `focus-on-open`. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-open-change` | `{ open: false | true }` | The dock opened or closed (the launcher, Escape, a driven `open`, or a method). |

#### Methods

Call these on the element instance: `document.querySelector('kai-dock').show()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(): void` | Open it programmatically (no-op while disabled). |
| `hide` | `(): void` | Close it programmatically. |
| `toggle` | `(): void` | Flip the open state (closes while disabled). |
| `focus` | `(options?: FocusOptions): void` | Move focus to the panel while open, or to the launcher while closed. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The panel body, the same region as `slot="panel"`. |
| `panel` | replace | The panel body. ANY element: a `<kai-chat>`, a form, your own component. The dock never reads or types it, and the default slot is the same region. |
| `launcher` | inject | Content inside the built-in button while CLOSED; defaults to a chat glyph. Text works as well as an icon: the button keeps its height and grows sideways into a pill, so a label like "Support" is not clipped. The BUTTON is never slotted away, because it owns aria-expanded, aria-controls, the toggle wiring and the focus return. |
| `launcher-open` | inject | Content inside the button while OPEN; defaults to a ✕. Fill only `launcher` and that glyph stays while open rather than morphing into a built-in that clashes with it. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-dock::part(name)`.

| Part | Description |
|------|-------------|
| `::part(launcher)` | The launcher button pinned to the corner: a disc by default, a pill once you slot a text label. Restyle its surface or shadow; --kai-dock-launcher-size sets its height and its minimum width. <br>`kai-dock::part(launcher) { background: var(--color-info) }` |
| `::part(badge)` | The unread dot on the launcher, rendered only while closed and only when `unread` is set. Restyle its color or size. <br>`kai-dock::part(badge) { background: var(--color-success) }` |
| `::part(panel)` | The panel body. ANY element: a `<kai-chat>`, a form, your own component. The dock never reads or types it, and the default slot is the same region. |

#### Composed from

`UI/Dock`, `UI/DockCloseGlyph`, `UI/DockLauncherGlyph`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-dock -->

The corner launcher: a floating button pinned to a viewport corner, with a panel above it holding whatever you slot in (`slot="panel"`). This is the chat-bubble-in-the-bottom-right affordance; `position` is logical, so `-end` follows the writing direction. `label` names the widget and derives the launcher's accessible names, and `unread` shows a dot the dock never clears itself: clear it in your `kai-open-change` handler. Not to be confused with `<kai-prompt-dock>`, which frames a prompt input and floats nothing.

---

### `<kai-prompt-dock>` / `PromptDock`

<!-- spec:kai-prompt-dock -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `frame` | `frame` | `undefined | "inset" | "edge" | "none"` | `'inset'` | How the tray frames the input, the SPATIAL inset axis: `inset` (default, the classic recessed frame on every side) | `edge` (top/bottom inset only; the input sits flush left/right so the lips span the full width) | `none` (no inset; the lips attach directly as a plain stack). Attribute: `frame`. |
| `appearance` | `appearance` | `undefined | "soft" | "outlined" | "filled" | "plain"` | `'soft'` | How the tray surface looks, the VISUAL axis orthogonal to `frame`: `soft` (default, sunken surface + border + radius) | `outlined` (transparent + border + radius) | `filled` (sunken, no border, + radius) | `plain` (bare). Attribute: `appearance`. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| _(default)_ | inject | The input the dock wraps, typically a `<kai-prompt-input>`. The `top`/`bottom` slots are the lips around it. |
| `top` | inject | The top lip: a notice or banner above the input. Rendered only when filled. |
| `bottom` | inject | The bottom lip: a mode or controls row below the input. Rendered only when filled. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-prompt-dock::part(name)`.

| Part | Description |
|------|-------------|
| `::part(tray)` | The recessed tray that frames the input. The `appearance`/`frame` props set the defaults; the --kai-prompt-dock-* tokens fine-tune surface/border/radius/inset. <br>`kai-prompt-dock::part(tray) { --kai-prompt-dock-radius: 1rem }` |
| `::part(top)` | The top lip: a notice or banner above the input. Rendered only when filled. |
| `::part(bottom)` | The bottom lip: a mode or controls row below the input. Rendered only when filled. |

#### Composed from

`UI/PromptDock`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-prompt-dock -->

A recessed tray that frames a prompt input, with optional lip regions above (`slot="top"`) and below (`slot="bottom"`) the raised input card; a lip renders only when its slot is filled. It sits in the page flow and launches nothing (the floating corner launcher is `<kai-dock>`). Two orthogonal variant attributes: `frame` sets the spatial inset, `appearance` sets the surface.

---

### `<kai-setting-item>` / `SettingItem`

<!-- spec:kai-setting-item -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `label` | `label` | `undefined | string` | `''` | Row label (primary text). Attribute: `label`. |
| `description` | `description` | `undefined | string` | — | Optional secondary description under the label. Attribute: `description`. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| `control` | inject | The row control (a switch, segmented, select, etc.), right-aligned. Omit it for a label-only row. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-setting-item::part(name)`.

| Part | Description |
|------|-------------|
| `::part(label)` | The label + description block on the left of the row. Restyle its typography or spacing. <br>`kai-setting-item::part(label) { gap: 0.125rem }` |
| `::part(control)` | The row control (a switch, segmented, select, etc.), right-aligned. Omit it for a label-only row. |

#### Composed from

`UI/SettingItem`

#### Theming

Themed by the global design tokens (override any `--color-*`).
<!-- /spec:kai-setting-item -->

One row inside `<kai-settings-group>`: a label/description block on the left and an optional right-aligned control slotted into `slot="control"` (a `<kai-switch>`, a segmented control, a select). Omit the control for a plain label row.

---

## ChatMessage schema

A message's content is an **ordered `parts` array**. There is no `content` string: it was removed in 0.20.0. Text, reasoning, tool calls, generative-UI cards, citations and file attachments all live in `parts`, in the order the model produced them, so a post-tool answer renders below its tool panel instead of being glued onto the pre-tool text.

```ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** The ONLY content channel. Ordered. */
  parts: MessagePart[];
  /** Action buttons under the message. Chrome, not content. */
  actions?: (ChatMessageAction | CustomAction)[];
  avatar?: { src?: string; fallback?: string; alt?: string };
  /** Controlled feedback vote; wins over the element's optimistic state. */
  feedback?: 'like' | 'dislike';
}

/** Six variants, one per kind of content. Every variant may also carry `raw`,
 *  the untranslated provider block it was normalized from, so a turn can be
 *  echoed back to the model verbatim. */
type MessagePart =
  | { type: 'text'; text: string; raw?: RawOrigin }
  | { type: 'reasoning'; text: string; label?: string; index?: number; signature?: string; raw?: RawOrigin }
  | { type: 'tool'; tool: ToolPart; raw?: RawOrigin }
  | { type: 'card'; envelope: CardEnvelope; raw?: RawOrigin }
  | { type: 'source'; source: MessageSource; raw?: RawOrigin }
  | { type: 'file'; attachment: AttachmentData; raw?: RawOrigin };

interface RawOrigin {
  /** Tagged origin, e.g. 'anthropic.content_block', 'openai.delta'. */
  source: string;
  payload: unknown;
}

/** A citation. Exported as `MessageSource`; the bare `Source` name belongs to
 *  the citation-chip component. */
interface MessageSource {
  id?: string;
  url?: string;
  title?: string;
  snippet?: string;
  index?: number;
}

interface ToolPart {
  type: string;
  /** Semantic classification for rendering. Derived with `classifyTool(type)`
   *  when you do not set it; an explicit value is preserved. */
  kind?: 'command' | 'file-change' | 'search' | 'fetch' | 'mcp' | 'image' | 'generic';
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: Record<string, unknown>;
  /** Raw accumulated argument fragments, for character-level streaming. */
  rawInput?: string;
  output?: Record<string, unknown>;
  toolCallId?: string;
  errorText?: string;
  raw?: RawOrigin;
}

interface AttachmentData {
  id: string;
  type: 'file' | 'source-document';
  filename?: string;
  mediaType?: string;
  url?: string;
  title?: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider?: string;
}

interface ContextData {
  usedTokens: number;
  maxTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheTokens?: number;
  estimatedCost?: number;
}

interface SlashCommand {
  id: string;
  label: string;
  description?: string;
  category?: string;
}
```

### Streaming into `parts`

Two rules, and both bite:

1. **Reassign a NEW array containing a NEW message object on every chunk.** Mutating a message object in place does not re-render.
2. **Fold each delta onto the message's TRAILING text part.** Replacing `parts` with a fresh single-text array re-renders fine but silently deletes any reasoning / tool / card parts the turn already produced. Opening a new text part when the last part is not text is what keeps a post-tool answer out of the pre-tool text.

`@kitn.ai/ui/state` ships the fold as `appendTextPart(parts, delta)`; it is five lines if you would rather inline it:

```js
import { appendTextPart } from '@kitn.ai/ui/state';

// ✅ re-renders, and keeps every part already on the message
chat.messages = chat.messages.map((m) =>
  m.id === assistantId ? { ...m, parts: appendTextPart(m.parts, delta) } : m);

// ❌ re-renders, but drops the message's reasoning/tool/card parts
chat.messages = chat.messages.map((m) =>
  m.id === assistantId ? { ...m, parts: [{ type: 'text', text: answer }] } : m);
```

---

## Styling and Theming

Each element renders into its own Shadow DOM. This provides **full CSS isolation**:

- Tailwind classes used by the kit do not affect the host page.
- The host page's stylesheets do not bleed into the components.

### Design tokens

**The elements are self-themed.** Each element's Shadow DOM already contains the full compiled token set, so the components render correctly with **no host-side stylesheet required** — including light/dark via the `theme` attribute.

To **rebrand**, override the kit's **namespaced** tokens — `--kai-color-*` (and `--kai-text-*`, `--kai-radius`) — on `:root` or a parent. The components read these via a `var(--kai-…, default)` fallback that pierces the Shadow DOM, so your overrides reach them.

```css
:root {
  --kai-color-background: #0f0f0f;
  --kai-color-primary: #7c3aed;
  --kai-color-muted: #1e1e1e;
  --kai-text-body: 0.9375rem;
}
```

> **Two stylesheets — pick by how you consume the kit:**
> - **Tailwind builds** (composing the SolidJS primitives): `@import "@kitn.ai/ui/theme.css"` in your CSS.
> - **Plain HTML / CDN** (web components): `<link rel="stylesheet" href="…/@kitn.ai/ui/theme.tokens.css">` — only needed to theme your own host-page markup; the elements carry their own tokens.

### Theme attribute

Every element accepts `theme="light"`, `theme="dark"`, or `theme="auto"` (default). `auto` follows the OS `prefers-color-scheme` media query.

```html
<kai-chat theme="dark"></kai-chat>
```

---

## Code highlighting (on-demand, optional)

Syntax highlighting is powered by [Shiki](https://shiki.style), wired to be as lightweight as possible:

- **Nothing loads until a code block actually renders.** A chat with no code never fetches Shiki.
- **On-demand, per-language.** Only the Shiki core, the JS regex engine, the one theme, and the one language grammar are fetched as small lazy chunks.
- **No WASM.** Uses Shiki's JavaScript engine.

### Built-in languages

A small default set loads on demand: `bash`/`sh`, `javascript`/`js`, `html`, `css`, `json`. Anything else renders as plain text until registered.

### Configure or disable

```js
import { configureCodeHighlighting } from '@kitn.ai/ui/elements';

configureCodeHighlighting({
  languages: {
    ruby: () => import('@shikijs/langs/ruby'),
    python: () => import('@shikijs/langs/python'),
  },
  aliases: { rb: 'ruby', py: 'python' },
});

// Or turn off entirely (no Shiki ever loads):
configureCodeHighlighting({ enabled: false });
```

---

## Machine-readable API

The authoritative source for all element APIs is `dist/custom-elements.json` (generated by `@custom-elements-manifest/analyzer` as part of `npm run build`). Do not edit it by hand.

Two human/agent-readable files are generated from the manifest by `scripts/gen-llms.mjs`:

- **`llms.txt`** (~4 KB) — orientation: install, the property-vs-attribute rule, architecture, theming, and framework wiring.
- **`llms-full.txt`** (~54 KB) — everything in `llms.txt` plus a generated props/events table for each element, a streaming recipe, and a build-a-chat-app runbook.

Both files are at the repo root, the npm package root (`node_modules/@kitn.ai/ui/llms.txt`), and https://kitn.dev/llms.txt.
