# Kitn Web Components

## Overview

`@kitn.ai/ui` ships 27 framework-agnostic custom elements built on the SolidJS kit.

| Tag | Purpose |
|-----|---------|
| `<kai-chat>` | Full chat UI — message list plus prompt input |
| `<kai-conversations>` | Sidebar conversation browser with group support |
| `<kai-prompt-input>` | Standalone text-input area with send button |
| + 24 composable primitives | See the full roster below |

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

Import the ES module as a side-effect. It registers all **40+ custom elements** via `customElements.define`:

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

## Full Element Reference (**40+ elements**)

Every element also accepts a `theme` attribute (`'light' | 'dark' | 'auto'`, default `'auto'`). Array/object properties are marked with a `—` in the Attribute column — they **must** be set as JS properties.

---

### `<kai-chat>` / `Chat`

<!-- spec:kai-chat -->
#### Properties

| Property | Attribute | Type | Default | Notes |
|----------|-----------|------|---------|-------|
| `theme` | `theme` | `"light" | "dark" | "auto"` | `'auto'` | Color mode (`auto` follows prefers-color-scheme). |
| `search` | `search` | `undefined | false | true` | `false` | Show a Search (Globe) button in the input toolbar; fires a `search` event. |
| `value` | — | `undefined | string | ({ type: "text"; text: string } | { type: "entity"; entity: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> } })[]` | — | Value of the input. A **string** is controlled (the host owns the text and updates it on `kai-value-change`). A **ComposerDoc** is a one-time seed that pre-populates pills; the user then edits freely. Leave unset for uncontrolled. |
| `placeholder` | `placeholder` | `undefined | string` | `'Send a message...'` | Placeholder text shown in the empty input. |
| `loading` | `loading` | `undefined | false | true` | `false` | When true, shows the loading/streaming state and disables submit (use while awaiting the assistant's reply). |
| `suggestions` | — | `undefined | string[]` | — | Starter prompts shown above the input when the thread is empty. Clicking one follows `suggestionMode`. Set as a JS property. |
| `suggestionMode` | `suggestion-mode` | `undefined | "submit" | "fill"` | `'submit'` | What clicking a suggestion does: `'submit'` (default) sends it immediately as if typed and submitted; `'fill'` just places it in the input. |
| `persistSuggestions` | `persist-suggestions` | `undefined | false | true` | `false` | Keep suggestions visible after the conversation starts. By default suggestions are conversation starters and hide once `messages` is non-empty; set this to keep them always shown. Default false. |
| `proseSize` | `prose-size` | `undefined | "sm" | "lg" | "xs" | "base"` | `'sm'` | Body/prose font scale for rendered markdown (`'xs' | 'sm' | 'base' | 'lg'`). Defaults to `'sm'`. |
| `codeTheme` | `code-theme` | `undefined | string` | `'github-dark-dimmed'` | Shiki theme name for syntax-highlighted code blocks (e.g. `'github-dark-dimmed'`). |
| `codeHighlight` | `code-highlight` | `undefined | false | true` | `true` | Enable Shiki syntax highlighting in code blocks. Turn off to render plain `<pre>` blocks (lighter, no highlighter load). Default true. |
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
| `voice` | `voice` | `undefined | false | true` | `false` | Show a Voice (Mic) button in the input toolbar; fires a `voice` event. |
| `triggers` | — | `undefined | { char: string; kind: string; items?: undefined | { id: string; label: string; icon?: undefined | string; description?: undefined | string; group?: undefined | string; kind?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> }[] }[]` | — | Rich entity triggers. Each `{ char, kind, items }` opens a caret-anchored menu that inserts an atomic pill (`/` skills, `@` agents/plugins). Set as a JS property; forwarded to the input. |
| `kindIcons` | — | `undefined | Record<string, string>` | — | Default icon per entity kind (kind → image src) for pills/menu items. |
| `actionsReveal` | `actions-reveal` | `undefined | "always" | "hover"` | `'always'` | Whether each message's action bar is always visible (`'always'`, default) or only revealed on hover of that message row (`'hover'`). |
| `messages` | — | `undefined | { id: string; role: "user" | "assistant"; parts: ({ type: "text"; text: string; raw?: undefined | { source: string; payload: unknown } } | { type: "reasoning"; text: string; label?: undefined | string; index?: undefined | number; streamId?: undefined | string; signature?: undefined | string; raw?: undefined | { source: string; payload: unknown } } | { type: "tool"; tool: { type: string; kind?: undefined | "image" | "command" | "file-change" | "search" | "fetch" | "mcp" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }; raw?: undefined | { source: string; payload: unknown } } | { type: "card"; envelope: { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }; raw?: undefined | { source: string; payload: unknown } } | { type: "source"; source: { id?: undefined | string; url?: undefined | string; title?: undefined | string; snippet?: undefined | string; index?: undefined | number }; raw?: undefined | { source: string; payload: unknown } } | { type: "file"; attachment: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }; raw?: undefined | { source: string; payload: unknown } })[]; actions?: undefined | ("copy" | "like" | "dislike" | "regenerate" | "edit" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]; avatar?: undefined | { src?: undefined | string; fallback?: undefined | string; alt?: undefined | string }; feedback?: undefined | "like" | "dislike" }[]` | `[]` | The full message thread to render, newest last. Each entry carries its role, ordered `parts`, and optional actions/avatar/feedback. Set as a JS property (`el.messages = [...]`); a NEW array reference per streaming chunk re-renders (mutating in place does not). Omit for an empty thread. Re-declared here (rather than inherited from `ChatThreadProps`) because the ELEMENT registers a `[]` default and renders the empty state without it, while the SolidJS `<ChatThread>` component still requires it. The facade hands it a validated array either way. Matches `<kai-thread>`. |
| `cardTypes` | — | `undefined | Record<string, string>` | — | Optional card type -> custom-element tag overrides/additions for `card` parts (merged over the built-ins). Property: `el.cardTypes`. Typed as a plain string map (not the `CardTagMap` alias) so the generated React wrapper inlines it instead of emitting an unresolved named type. |
| `cardSchemas` | — | `undefined | Record<string, object>` | — | JSON Schemas for the card types this app renders, keyed by envelope type. The companion of `cardTypes`, which says what DRAWS a card while this says what a VALID one looks like. An OBJECT, so it is a JS property only: `el.cardSchemas = { 'pricing-table': pricingSchema }`, never an attribute. `createCardRegistry(...).validationSchemas` is exactly this shape. Without it the kit validates its own seven built-ins and leaves your own card type, the one your app actually cares about, as the only unchecked thing on screen. A schema here WINS over a built-in of the same name. Typed `Record<string, object>` rather than `Record<string, JsonSchema>` deliberately: an imported `.json` schema widens `"type"` to `string`, and an authored one carries `$schema`/`title`/`description`/`additionalProperties`, so the tighter type would reject both of the normal ways to supply one. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-attachments-change` | `{ attachments: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[] }` | The staged attachments changed (file added or removed). Carries the full current list so a consumer can react in real time. |
| `kai-message-action` | `{ messageId: string; action: string; state?: undefined | "on" | "off" }` | An action button on a message was clicked. `action` is the built-in name or custom id. `state` is present only for the toggleable feedback votes: `'on'` when a like/dislike is set, `'off'` when re-tapped to clear. |
| `kai-model-change` | `{ modelId: string }` | The header model switcher changed. |
| `kai-search` | — | The Search button was clicked. |
| `kai-submit` | `{ value: string; attachments: AttachmentData[] }` | User submitted a message. |
| `kai-suggestion-click` | `{ value: string }` | A suggestion chip was clicked (only in `suggestion-mode="fill"`). |
| `kai-value-change` | `{ value: string }` | Fired on every input change. |
| `kai-voice` | — | The Mic / voice button was clicked. |

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
| `groups` | — | `undefined | { id: string; userId?: undefined | string; teamId?: undefined | string; name: string; sortOrder: number; createdAt: string }[]` | `[]` | The sidebar's section headers, rendered in array order. A group carries no conversations of its own; it is matched against `conversations` by id, so the two props are complementary rather than alternatives. Omit for an ungrouped sidebar. Set as a JS property. |
| `conversations` | — | `undefined | { id: string; title: string; groupId?: undefined | string; scope: { type: "document" | "collection"; documentId?: undefined | string; filters?: undefined | { tags?: undefined | string[]; authors?: undefined | string[]; contentType?: undefined | "transcript" | "markdown"; dateRange?: undefined | { from: string; to: string } } }; messageCount: number; lastMessageAt: string; updatedAt: string; trailing?: undefined | string }[]` | `[]` | Every conversation in the sidebar, flat. Each one is filed under the group whose `id` equals its `groupId`; one with no `groupId`, or with a `groupId` matching no entry in `groups`, falls into a trailing ungrouped section (headerless when `compact`), so nothing you pass in is ever dropped. There is no recency bucketing. Set as a JS property. Omit for an empty sidebar, or when `no-conversations` replaces the built-in list with your own `sidebar-header` content. |
| `activeId` | `active-id` | `undefined | string` | — | Id of the open conversation, highlighted in the sidebar. |
| `messages` | — | `undefined | { id: string; role: "user" | "assistant"; parts: ({ type: "text"; text: string; raw?: undefined | { source: string; payload: unknown } } | { type: "reasoning"; text: string; label?: undefined | string; index?: undefined | number; streamId?: undefined | string; signature?: undefined | string; raw?: undefined | { source: string; payload: unknown } } | { type: "tool"; tool: { type: string; kind?: undefined | "image" | "command" | "file-change" | "search" | "fetch" | "mcp" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }; raw?: undefined | { source: string; payload: unknown } } | { type: "card"; envelope: { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }; raw?: undefined | { source: string; payload: unknown } } | { type: "source"; source: { id?: undefined | string; url?: undefined | string; title?: undefined | string; snippet?: undefined | string; index?: undefined | number }; raw?: undefined | { source: string; payload: unknown } } | { type: "file"; attachment: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }; raw?: undefined | { source: string; payload: unknown } })[]; actions?: undefined | ("copy" | "like" | "dislike" | "regenerate" | "edit" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]; avatar?: undefined | { src?: undefined | string; fallback?: undefined | string; alt?: undefined | string }; feedback?: undefined | "like" | "dislike" }[]` | `[]` | The active conversation's message thread, newest last. Set as a JS property (`el.messages = [...]`); a NEW array reference per streaming chunk re-renders (mutating in place does not). Omit for an empty thread. |
| `value` | `value` | `undefined | string` | — |  |
| `placeholder` | `placeholder` | `undefined | string` | `'Send a message...'` |  |
| `loading` | `loading` | `undefined | false | true` | `false` |  |
| `suggestions` | — | `undefined | string[]` | — |  |
| `suggestionMode` | `suggestion-mode` | `undefined | "submit" | "fill"` | `'submit'` |  |
| `proseSize` | `prose-size` | `undefined | "sm" | "lg" | "xs" | "base"` | `'sm'` |  |
| `codeTheme` | `code-theme` | `undefined | string` | `'github-dark-dimmed'` |  |
| `codeHighlight` | `code-highlight` | `undefined | false | true` | `true` |  |
| `chatTitle` | `chat-title` | `undefined | string` | — |  |
| `models` | — | `undefined | { id: string; name: string; provider?: undefined | string; description?: undefined | string; group?: undefined | string }[]` | — |  |
| `currentModel` | `current-model` | `undefined | string` | — |  |
| `context` | — | `ContextData | undefined` | — |  |
| `scrollButton` | `scroll-button` | `undefined | false | true` | `true` |  |
| `search` | `search` | `undefined | false | true` | `false` |  |
| `voice` | `voice` | `undefined | false | true` | `false` |  |
| `triggers` | — | `undefined | { char: string; kind: string; items?: undefined | { id: string; label: string; icon?: undefined | string; description?: undefined | string; group?: undefined | string; kind?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> }[] }[]` | — | Rich entity triggers (`/` skills, `@` agents/plugins) forwarded to the input. |
| `kindIcons` | — | `undefined | Record<string, string>` | — | Default icon per entity kind (kind → image src) forwarded to the input. |
| `sidebarWidth` | `sidebar-width` | `undefined | number` | `26` | Sidebar default width as a percent of the workspace (default 26). |
| `sidebarMinWidth` | `sidebar-min-width` | `undefined | number` | `240` | Sidebar min width in px (default 240). |
| `sidebarMaxWidth` | `sidebar-max-width` | `undefined | number` | `420` | Sidebar max width in px (default 420). |
| `sidebarCollapsed` | `sidebar-collapsed` | `undefined | false | true` | — | Controlled collapsed state. Set this as a JS property (`el.sidebarCollapsed = true`) to drive the sidebar from your app, updating it in response to the `kai-sidebar-toggle` event. Omit for uncontrolled (the element manages it). |
| `defaultSidebarCollapsed` | `default-sidebar-collapsed` | `undefined | false | true` | — | Initial collapsed state when uncontrolled (default false). Use the `default-sidebar-collapsed` attribute to start collapsed in plain HTML. |
| `collapseBelow` | `collapse-below` | `undefined | number` | — | Auto-collapse the rail when the workspace's own width drops below this many px, and re-expand when it grows back above. Uncontrolled only (it never fights an app-driven `sidebarCollapsed`); omit to disable. Fires `kai-sidebar-toggle`. Attribute: `collapse-below`. |
| `compact` | `compact` | `undefined | false | true` | — | Render Recents as dense single-line rows (a leading dot + title, no count). |
| `noConversations` | `no-conversations` | `undefined | false | true` | — | Suppress the built-in ConversationList so the `sidebar-header` slot owns the whole rail flex region (for apps that supply their own rail nav). Default false. Attribute: `no-conversations`. |
| `cardTypes` | — | `undefined | Record<string, string>` | — | Optional card type -> custom-element tag overrides/additions for `card` parts (merged over the built-ins). Property: `el.cardTypes`. Typed as a plain string map (not the `CardTagMap` alias) so the generated React wrapper inlines it instead of emitting an unresolved named type. |
| `cardSchemas` | — | `undefined | Record<string, object>` | — | JSON Schemas for the card types this app renders, keyed by envelope type. The companion of `cardTypes`, which says what DRAWS a card while this says what a VALID one looks like. An OBJECT, so it is a JS property only: `el.cardSchemas = { 'pricing-table': pricingSchema }`, never an attribute. `createCardRegistry(...).validationSchemas` is exactly this shape. Without it the kit validates its own seven built-ins and leaves your own card type, the one your app actually cares about, as the only unchecked thing on screen. A schema here WINS over a built-in of the same name. Typed `Record<string, object>` rather than `Record<string, JsonSchema>` deliberately: an imported `.json` schema widens `"type"` to `string`, and an authored one carries `$schema`/`title`/`description`/`additionalProperties`, so the tighter type would reject both of the normal ways to supply one. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-conversation-select` | `{ id: string }` | A conversation was selected in the sidebar. |
| `kai-message-action` | `{ messageId: string; action: string; state?: undefined | "on" | "off" }` | An action button on a message was clicked. `state` is present only for the toggleable feedback votes: `'on'` when a like/dislike is set, `'off'` when re-tapped to clear. |
| `kai-model-change` | `{ modelId: string }` | The header model switcher changed. |
| `kai-new-chat` | — | The "New chat" button was clicked. |
| `kai-search` | — | The Search button was clicked. |
| `kai-sidebar-toggle` | `{ collapsed: false | true }` | The sidebar was collapsed or expanded. |
| `kai-submit` | `{ value: string; attachments: AttachmentData[] }` | User submitted a message. |
| `kai-suggestion-click` | `{ value: string }` | A suggestion chip was clicked (only in `suggestion-mode="fill"`). |
| `kai-value-change` | `{ value: string }` | Fired on every input change. |
| `kai-voice` | — | The Mic / voice button was clicked. |

#### Methods

Call these on the element instance: `document.querySelector('kai-workspace').toggleSidebar()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `toggleSidebar` | `(): void` | Collapse/expand the conversation sidebar and fire `kai-sidebar-toggle`. |
| `collapseSidebar` | `(): void` | Force the conversation sidebar collapsed (fires `kai-sidebar-toggle`). |
| `expandSidebar` | `(): void` | Force the conversation sidebar expanded (fires `kai-sidebar-toggle`). |
| `focus` | `(options?: FocusOptions): void` | Focus the thread's composer. |
| `clear` | `(): void` | Clear the thread draft + staged attachments. |
| `send` | `(): void` | Submit the current thread draft programmatically (fires `kai-submit`). |
| `scrollToBottom` | `(behavior?: ScrollBehavior): void` | Scroll the thread to the newest message. |

#### Slots

Project your own markup with `slot="name"` on a light-DOM child.

| Slot | Mode | Description |
|------|------|-------------|
| `sidebar-header` | inject | Top of the conversation rail (brand, a kai-tabs strip). |
| `sidebar-footer` | inject | Bottom of the rail: an upgrade card, a Design trigger, a user-menu cluster. |
| `main-header` | inject | Top of the main region (a top-placed banner or a corner action). |
| `main` | replace | Replace the built-in chat thread with your own main view (a home or dashboard screen). Omit to keep the thread. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-workspace::part(name)`.

| Part | Description |
|------|-------------|
| `::part(sidebar)` | The conversation rail. Carries a subtle, theme-aware default background (bg-surface); override its background, border, or width from outside. `sidebar-min-width` sets its min px width and `collapse-below` auto-collapses it under a width. <br>`kai-workspace::part(sidebar) { background: var(--color-card); border-right: 1px solid var(--color-border) }` |

#### Composed from

`Components/ChatThread`, `Components/ConversationList`, `Components/CollapsedRail`, `UI/ResizablePanelGroup`, `UI/ResizablePanel`, `UI/ResizableHandle`

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
| `conversations` | — | `undefined | { id: string; title: string; groupId?: undefined | string; scope: { type: "document" | "collection"; documentId?: undefined | string; filters?: undefined | { tags?: undefined | string[]; authors?: undefined | string[]; contentType?: undefined | "transcript" | "markdown"; dateRange?: undefined | { from: string; to: string } } }; messageCount: number; lastMessageAt: string; updatedAt: string; trailing?: undefined | string }[]` | `[]` | Every conversation the list renders, flat. Each one is filed under the group whose `id` equals its `groupId`; one with no `groupId`, or with a `groupId` matching no entry in `groups`, falls into a trailing "Ungrouped" section, so nothing you pass in is ever dropped. There is no recency bucketing. Set as a JS property. Omit to supply them as `<kai-conversation>` light-DOM children instead, or for the empty state. |
| `activeId` | `active-id` | `undefined | string` | — | The id of the currently-open conversation, highlighted in the list. |
| `collapsed` | `collapsed` | `undefined | false | true` | — | Controlled collapsed state. Set as a JS property (`el.collapsed = true`) to drive the rail from your app, updating it in response to `kai-collapse-toggle`. Omit for uncontrolled (the element manages it). Collapsed shrinks the rail to a floating reopen button. |
| `defaultCollapsed` | `default-collapsed` | `undefined | false | true` | — | Initial collapsed state when uncontrolled (default false). Use the `default-collapsed` attribute to start collapsed in plain HTML. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-collapse-toggle` | `{ collapsed: false | true }` | The rail was collapsed or expanded (via the toggle, the reopen button, or a `collapse()`/`expand()`/`toggle()` call). |
| `kai-conversation-select` | `{ id: string }` | A conversation was selected. |
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
| `header` | replace | Full custom title bar; replaces the built-in toggle / "Chats" / New-chat row. |
| `empty` | replace | Custom zero-state shown when there are no conversations; replaces the built-in "No conversations yet". |
| `footer` | inject | A row below the list: account, settings, or usage. |

#### Declarative children

Compose these in light DOM instead of setting the JS property — the no-JS route.

| Child element | Attributes | Text content | Notes |
|---------------|------------|--------------|-------|
| `<kai-conversation>` | `group-id`, `id` | yes | Parse a single light-DOM `<kai-conversation>` element into a `ConversationSummary`. Attribute mapping: - `id` → ConversationSummary.id - `group-id` → ConversationSummary.groupId (optional) - textContent → ConversationSummary.title Required fields not expressible as HTML attributes (`scope`, `messageCount`, `lastMessageAt`, `updatedAt`) receive safe defaults so the rendered list item is fully functional with just `id` + title text. |

#### Styleable parts

Restyle from outside the Shadow DOM via `kai-conversations::part(name)`.

| Part | Description |
|------|-------------|
| `::part(trailing)` | The right-aligned trailing text on each conversation row (a count, status, or relative time). Set it per item via the `trailing` field; otherwise a short auto relative time is derived from `updatedAt`. Recolor or resize it from outside. <br>`kai-conversations::part(trailing) { color: var(--color-primary); font-variant-numeric: tabular-nums }` |

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
| `search` | `search` | `undefined | false | true` | `false` | Show a Search (Globe) button in the left toolbar; clicking it fires a `search` event. |
| `voice` | `voice` | `undefined | false | true` | `false` | Show a Voice (Mic) button in the left toolbar; clicking it fires a `voice` event. |
| `stoppable` | `stoppable` | `undefined | false | true` | `false` | When set and `loading` is true, the send button is replaced by a Stop button (square icon, "Stop" aria-label). Clicking it fires `kai-stop`. |
| `submit` | `submit` | `undefined | "auto" | "always"` | `'always'` | Send-button visibility. `'always'` (default) always shows it; `'auto'` shows it only when there's text/attachments (an empty composer hides it, though Enter still submits). To hide it entirely (Enter-only), it's pure CSS: `::part(send){display:none}`, no prop needed. Restyle via `::part(send)`. The Stop button (`stoppable` + `loading`) is unaffected. |
| `attach` | `attach` | `undefined | false | true` | `true` | When `false`, hides the built-in paperclip attach button even though the element otherwise supports attachments. Use this when a `+` menu in `toolbar-start` already exposes "Add files", to avoid a duplicate control. Defaults to `true`. |
| `attachments` | — | `AttachmentData[] | undefined` | — | Attachments to seed the input with (so a consumer can pre-populate staged files without an upload). Set as a JS property; the element then manages its own attachment state from there (add via the paperclip, remove per chip). |
| `triggers` | — | `undefined | { char: string; kind: string; items?: undefined | { id: string; label: string; icon?: undefined | string; description?: undefined | string; group?: undefined | string; kind?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> }[] }[]` | — | Rich entity triggers. Each `{ char, kind, items }` opens a caret-anchored menu that inserts an atomic pill. Convention: `/` → skills, `@` → agents (plugins are the grouping/provenance of those items). Set as a JS property. |
| `kindIcons` | — | `undefined | Record<string, string>` | — | Default icon per entity kind (kind → image URL/data-URI) for pills/menu items without their own `icon`. Overrides the built-in agent/plugin glyphs. JS property. |

#### Events

| Event | `detail` | Description |
|-------|-----------|-------------|
| `kai-attachments-change` | `{ attachments: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[] }` | The staged attachments changed: a file was added (via the paperclip) or removed (per-chip ×). Carries the full current list so a consumer can react in real time (validate, show upload progress, toggle the send button). |
| `kai-search` | — | The Search (Globe) toolbar button was clicked. |
| `kai-stop` | — | The Stop button was clicked while `stoppable` and `loading` are both true. |
| `kai-submit` | `{ value: string; doc: ({ type: "text"; text: string } | { type: "entity"; entity: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> } })[]; entities: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> }[]; attachments: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[] }` | The user submitted the prompt (Enter or send button). `value` is the flattened text (back-compat); `doc` is the structured document and `entities` the inserted pills (skills/agents) for downstream expansion. |
| `kai-suggestion-click` | `{ value: string }` | A suggestion was clicked while `suggestion-mode="fill"`. |
| `kai-toolbar-action` | `{ action: string }` | A custom `<kai-action>` toolbar button was clicked. `action` is the `id` of the `<kai-action>` element that was clicked. |
| `kai-value-change` | `{ value: string; doc: ({ type: "text"; text: string } | { type: "entity"; entity: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> } })[]; entities: { kind: string; id: string; label: string; icon?: undefined | string; promptText?: undefined | string; data?: undefined | Record<string, unknown> }[] }` | The input changed (fires on every edit). Carries the flattened `value` plus the structured `doc` + `entities`. |
| `kai-voice` | — | The Voice (Mic) toolbar button was clicked. |

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
| `message` | — | `undefined | { id: string; role: "user" | "assistant"; parts: ({ type: "text"; text: string; raw?: undefined | { source: string; payload: unknown } } | { type: "reasoning"; text: string; label?: undefined | string; index?: undefined | number; streamId?: undefined | string; signature?: undefined | string; raw?: undefined | { source: string; payload: unknown } } | { type: "tool"; tool: { type: string; kind?: undefined | "image" | "command" | "file-change" | "search" | "fetch" | "mcp" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }; raw?: undefined | { source: string; payload: unknown } } | { type: "card"; envelope: { type: string; id: string; data: unknown; title?: undefined | string; resolution?: undefined | { kind: "action"; action: string; payload?: unknown; at?: undefined | string } | { kind: "submit"; data: unknown; at?: undefined | string } | { kind: "dismissed"; at?: undefined | string } | { kind: "expired"; reason?: undefined | string; at?: undefined | string } }; raw?: undefined | { source: string; payload: unknown } } | { type: "source"; source: { id?: undefined | string; url?: undefined | string; title?: undefined | string; snippet?: undefined | string; index?: undefined | number }; raw?: undefined | { source: string; payload: unknown } } | { type: "file"; attachment: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }; raw?: undefined | { source: string; payload: unknown } })[]; actions?: undefined | ("copy" | "like" | "dislike" | "regenerate" | "edit" | { id: string; label: string; icon?: undefined | string; tooltip?: undefined | string })[]; avatar?: undefined | { src?: undefined | string; fallback?: undefined | string; alt?: undefined | string }; feedback?: undefined | "like" | "dislike" }` | — | The full message object. Set as a JS property. |
| `role` | `role` | `undefined | "user" | "assistant"` | `'assistant'` | Who is speaking: `'user'` or `'assistant'`. Convenience for simple cases when not passing a `message` object. This is the SEMANTIC role of the message, not an ARIA role. The name collides with the global ARIA `role` attribute, which is why the facade lifts it off the host (see `liftRoleOffHost`). Neither speaker is a valid ARIA role, so a `role="user"` left on `<kai-message>` is a CRITICAL axe `aria-roles` violation. The accessible role lives on the row inside the shadow root instead: `role="article"` plus an `aria-label` naming the speaker, matching the SolidJS `<Message>` component. |
| `markdown` | `markdown` | `undefined | false | true` | — | Force markdown on/off. Defaults to on for assistant, off for user. |
| `proseSize` | `prose-size` | `undefined | "sm" | "lg" | "xs" | "base"` | `'sm'` | Text/markdown sizing for the message body. |
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
| `proseSize` | `prose-size` | `undefined | "sm" | "lg" | "xs" | "base"` | `'sm'` | Text/markdown sizing. |
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
| `proseSize` | `prose-size` | `undefined | "sm" | "lg" | "xs" | "base"` | `'sm'` | Code text sizing. |

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
| `tool` | — | `undefined | { type: string; kind?: undefined | "image" | "command" | "file-change" | "search" | "fetch" | "mcp" | "generic"; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; rawInput?: undefined | string; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string; raw?: undefined | { source: string; payload: unknown } }` | — | The tool-call to display. Set as a JS property. |
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
| `items` | — | `AttachmentData[] | undefined` | `[]` | The attachments to render. Omit (or pass an empty array) for the empty state, which shows `emptyText` if set and nothing otherwise. Set as a JS property (array). |
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
| `variant` | `variant` | `undefined | "default" | "ghost" | "outline"` | `'outline'` | Chip style: `'outline'` (default), `'ghost'`, or `'default'` (filled). |
| `size` | `size` | `undefined | "md" | "lg"` | `'md'` | Row height for `layout="list"`: `'md'` (default) or `'lg'` for taller rows. Chips are unaffected. |
| `layout` | `layout` | `undefined | "list" | "chips"` | `'chips'` | Layout: `'chips'` (default) renders a wrapping row of rounded pills; `'list'` renders a vertical, full-width "Ideas for you" list where each row is left-aligned with a leading `icon`, a label, and a hover background. |
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
| `transcribe` | — | `undefined | (audio: Blob) => Promise<string>` | — | Transcriber the host supplies: records audio, returns the text. This is a **function-valued property** (`el.transcribe = async blob => '...'`) because a value-returning callback can't be modelled as a fire-and-forget event. |
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
| `variant` | `variant` | `undefined | "default" | "ghost" | "outline"` | `'ghost'` | Visual button style. |
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
| `kai-scope-change` | `{ filters: SearchFilters | undefined }` | A scope was chosen (`undefined` filters = "All Content"). |

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
| `label` | `label` | `undefined | string` | — | Accessible name. REQUIRED for icon-only buttons (no visible text); ignored when you slot visible text, which already names the button. |
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
| `severity` | `severity` | `undefined | "error" | "info" | "success" | "warning" | "neutral"` | `'neutral'` | `neutral` (default) · `info` · `warning` · `error` · `success`. Drives the leading icon's color and the a11y role (`alert` for errors, else `status`). |
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
| `orientation` | `orientation` | `undefined | "vertical" | "horizontal"` | `'horizontal'` | `horizontal` (default, block + full-width) or `vertical` (a rule inside a flex/grid row, stretching to the row height). |

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
| `triggerLabel` | `trigger-label` | `undefined | string` | — | Built-in trigger: a text label (e.g. `"High"`). |
| `triggerIconTrailing` | `trigger-icon-trailing` | `undefined | string` | — | Built-in trigger: a trailing icon (e.g. `"chevron-down"` for a select look). |
| `label` | `label` | `undefined | string` | — | Accessible name for an icon-only trigger (no visible label). |
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
| `kai-active-change` | `{ id: undefined | string }` | Fired when the highlighted/active item changes, via Arrow keys or when filtering re-clamps the active row. `id` is the newly active item's id, or `undefined` when no item is active (e.g. the filtered list is empty). Lets a host preview the active item without committing a selection. |
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
