import { z } from 'zod';
import type { Tool } from './types';

/**
 * debug — diagnose common AI/UI (kai-*) integration failures.
 *
 * Given a `symptom` (prose) and/or a `snippet` (code), returns the likely
 * cause + fix for the classic `kai-*` failure modes so a harness can
 * self-correct without a human in the loop.
 *
 * Rule set sourced from:
 *  - apps/docs/src/content/docs/guides/for-ai-agents.mdx §"What agents most commonly get wrong"
 *  - context7.json `rules` array (5 contract rules)
 */

interface Rule {
  id: string;
  test: (text: string) => boolean;
  title: string;
  cause: string;
  fix: string;
}

const RULES: Rule[] = [
  {
    // Rule 1 — array/object data set as an HTML attribute
    // Source: for-ai-agents.mdx §1; context7.json rule 2
    id: 'array-as-attribute',
    test: (t) =>
      /\b(messages|models|context|suggestions|triggers)\s*=\s*["']/.test(t),
    title: 'Array/object prop set as an HTML attribute (silent failure)',
    cause:
      'An HTML attribute is always a string. Passing `messages`, `models`, `context`, ' +
      '`suggestions`, or `triggers` as an HTML attribute silently fails — ' +
      'the element receives a stringified value it cannot parse.',
    fix:
      'Set the property in JavaScript, not as an HTML attribute. ' +
      'Only scalar props (`placeholder`, `loading`, `theme`) work as attributes.\n\n' +
      '```js\n' +
      "// ✅ Works — set messages in JavaScript as a property\n" +
      "const chat = document.querySelector('kai-chat');\n" +
      "chat.messages = [{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] }];\n" +
      '```\n\n' +
      '```html\n' +
      '<!-- ❌ Fails — messages cannot be an HTML attribute -->\n' +
      '<kai-chat messages="[...]"></kai-chat>\n' +
      '```',
  },
  {
    // Rule 2 — in-place mutation → no re-render
    // Source: for-ai-agents.mdx §3; context7.json rule 4
    id: 'in-place-mutation',
    test: (t) =>
      /don'?t\s+update|doesn'?t\s+re.?render|no\s+re.?render|\.push\(|\bpush(?:es|ing)?\s+(?:to|into|onto)\b|mutate|in.place/.test(t),
    title: 'In-place mutation does not trigger a re-render',
    cause:
      'Mutating an existing message object or array in place (e.g. `chat.messages.push(…)` ' +
      'or `chat.messages[i].parts = […]`) does not trigger a re-render. ' +
      'The element only reacts when it detects a new array/object reference.',
    fix:
      'Assign a NEW array (and a new object) on every change — never mutate in place.\n\n' +
      '```js\n' +
      '// ✅ Triggers re-render — new array + new object reference\n' +
      'chat.messages = [\n' +
      '  ...chat.messages,\n' +
      "  { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: userText }] },\n" +
      '];\n\n' +
      '// ✅ During streaming: new array + new object per chunk, and FOLD the delta\n' +
      "//    onto the trailing text part so reasoning/tool/card parts survive.\n" +
      "import { appendTextPart } from '@kitn.ai/ui/state';\n" +
      'chat.messages = chat.messages.map((m) =>\n' +
      '  m.id === assistantId ? { ...m, parts: appendTextPart(m.parts, delta) } : m\n' +
      ');\n\n' +
      '// ❌ Does NOT trigger re-render\n' +
      'chat.messages.push(newMsg);\n' +
      'chat.messages[i].parts = appendTextPart(chat.messages[i].parts, delta);\n\n' +
      '// ❌ Re-renders, but DROPS the reasoning/tool/card parts already on the message\n' +
      'chat.messages = chat.messages.map((m) =>\n' +
      "  m.id === assistantId ? { ...m, parts: [{ type: 'text', text: accumulated }] } : m\n" +
      ');\n' +
      '```\n\n' +
      'The ergonomic path: helpers in `@kitn.ai/ui/state` (`appendMessage`, `updateMessage`, `appendText`) ' +
      'and `createAssistantStream` handle the new-reference contract for you. ' +
      '`useKaiChat` (React) and `createKaiChat` (Solid) own state entirely so mutation is never an option.\n\n' +
      '// setMessages((m) => appendMessage(m, msg)) // new array, no footgun',
  },
  {
    // Rule 3 — listening for events on a parent / wrong element
    // Source: for-ai-agents.mdx §2; context7.json rule 3
    id: 'event-bubbling',
    test: (t) =>
      /event.*not\s+fir|not\s+fir.*event|listen.*document|document.*listen|listen.*parent|parent.*listen|event.*bubbl/i.test(
        t,
      ),
    title: 'Listening for events on the wrong element (events are non-bubbling)',
    cause:
      '`kai-*` events are non-bubbling CustomEvents. Adding a listener to `document`, ' +
      '`window`, or a parent container will never fire because the event does not bubble up.',
    fix:
      'Listen directly on the `kai-*` element. ' +
      'The submit event is `kai-submit` with `event.detail.value`.\n\n' +
      '```js\n' +
      "const chat = document.querySelector('kai-chat');\n\n" +
      "// ✅ Listen directly on the element\n" +
      "chat.addEventListener('kai-submit', (e) => {\n" +
      '  console.log(e.detail.value); // the text the user typed\n' +
      '});\n\n' +
      "// ❌ Never fires — kai-submit does not bubble\n" +
      "document.addEventListener('kai-submit', handler);\n" +
      '```\n\n' +
      'Common events: `kai-submit`, `kai-feedback`, `kai-model-change`, `kai-new-chat`, `kai-select`.',
  },
  {
    // Rule 4 — wrong element prefix kitn-
    // Source: context7.json rule 1
    id: 'wrong-prefix',
    test: (t) => /\bkitn-/.test(t),
    title: 'Wrong element prefix `kitn-` (should be `kai-`)',
    cause:
      'The custom element prefix is `kai-` (e.g. `<kai-chat>`, `<kai-artifact>`). ' +
      '`kitn-` is a legacy name (the register-all bundle is `kai.es.js`) — it is not a ' +
      'registered element name. Using `<kitn-chat>` results in an unknown element that renders nothing.',
    fix:
      'Replace the `kitn-` prefix with `kai-` everywhere.\n\n' +
      '```html\n' +
      '<!-- ✅ Correct element prefix -->\n' +
      '<kai-chat></kai-chat>\n' +
      '<kai-artifact></kai-artifact>\n\n' +
      '<!-- ❌ Wrong — kitn-chat is not an element (the bundle is kai.es.js) -->\n' +
      '<kitn-chat></kitn-chat>\n' +
      '```',
  },
  {
    // Rule 6 — custom elements not registered / renders nothing (React #1 failure)
    // Source: field-test reports; for-ai-agents.mdx §"Import order matters"
    id: 'elements-not-registered',
    test: (t) => {
      // Core render-nothing / unregistered-element signals
      if (
        /renders?\s+nothing|nothing\s+renders?|not\s+registered|unregistered|not\s+upgraded|unknown\s+element|customElements\.get|undefined\s+element|no\s+shadow\s+root/.test(t)
      )
        return true;
      // "empty" / "blank" / "doesn't render" / "won't render" only fire when
      // a render/element/component context is also present to avoid false positives
      if (
        /\b(empty|blank)\b/.test(t) &&
        /render|element|component|kai-|<[a-z]+-|shadow/.test(t)
      )
        return true;
      if (
        /doesn'?t\s+render|won'?t\s+render/.test(t) &&
        /kai-|element|component|custom.?element/.test(t)
      )
        return true;
      return false;
    },
    title: 'Custom elements not registered — renders nothing / empty box',
    cause:
      'The `@kitn.ai/ui/react` wrappers (and bare `<kai-*>` tags) do NOT register the ' +
      'custom elements by themselves. Without the element-registration side-effect import, ' +
      '`<kai-chat>` / `<Chat>` is an un-upgraded unknown element — an empty box. ' +
      '`customElements.get(\'kai-chat\') === undefined`.',
    fix:
      'Import the elements bundle for its side effect BEFORE your first render — ' +
      'it must run before the component mounts.\n\n' +
      '```tsx\n' +
      "import '@kitn.ai/ui/elements'   // registers <kai-*> — REQUIRED, must come first\n" +
      "import { Chat } from '@kitn.ai/ui/react'\n" +
      "import '@kitn.ai/ui/theme.css'\n" +
      '```\n\n' +
      'In plain HTML: `import \'@kitn.ai/ui/elements\'` in your module script. ' +
      'The import is a side effect — keep it even if your linter flags it as "unused".',
  },
  {
    // Rule 7 — tsc errors inside node_modules/@kitn.ai/ui/src (SolidJS source pulled in)
    // Source: field-test reports; packaging gap (tracked upstream)
    id: 'tsc-source-pull',
    test: (t) =>
      /node_modules\/@kitn\.ai\/ui/.test(t) &&
      /tsc|TS2786|cannot\s+be\s+used\s+as\s+a\s+jsx\s+component|Show\b|Portal\b|Dynamic\b|error\s+TS|type\s+error/.test(
        t,
      ),
    title: 'tsc errors inside node_modules/@kitn.ai/ui/src (SolidJS source compiled under React)',
    cause:
      'The package currently ships TypeScript/TSX source, and a type entry value-re-exports ' +
      'from it, so the consumer\'s `tsc` resolves and compiles the library\'s SolidJS internals ' +
      '(`src/ui/*.tsx`) under the app\'s React JSX config — `Show`/`Portal`/`Dynamic` aren\'t ' +
      'React components, causing TS2786 / "cannot be used as a JSX component" errors. ' +
      '`vite`/esbuild build fine (they strip types); only `tsc` breaks. ' +
      '`skipLibCheck` does not help (these are `.tsx` source, not `.d.ts`).',
    fix:
      'Redirect the type resolution for that subpath in your tsconfig ' +
      '(Vite ignores tsconfig `paths`, so runtime is unaffected):\n\n' +
      '```jsonc\n' +
      '// tsconfig (app)\n' +
      '"baseUrl": ".",\n' +
      '"paths": { "@kitn.ai/ui/elements": ["./src/stubs/kitn-elements.d.ts"] }\n' +
      '```\n\n' +
      '```ts\n' +
      '// src/stubs/kitn-elements.d.ts\n' +
      'export {}\n' +
      '```\n\n' +
      '(This is a known packaging gap being tracked upstream.)',
  },
  {
    // Rule 8 — fetch('/api/chat') 404 in a Vite SPA (no server-side routes)
    // Source: field-test reports; common scaffold confusion
    id: 'vite-api-404',
    test: (t) => {
      // /api/chat 404
      if (/\/api\/chat/.test(t) && /\b404\b|not\s+found/i.test(t)) return true;
      // Vite + missing API route / route handler / POST
      if (/\bvite\b/.test(t) && /api\s+route|route\s+handler|\bPOST\b.*not\s+work/.test(t)) return true;
      // Next.js route handler used in a Vite app
      if (/next\.?js.*route|route.*next\.?js/.test(t) && /\bvite\b/.test(t)) return true;
      return false;
    },
    title: 'fetch(\'/api/chat\') 404 — Vite SPA has no server-side API routes',
    cause:
      'A plain Vite/CRA React SPA has no server — there are no `/api` routes. ' +
      'A scaffolded Next.js route handler (`export async function POST`) does not run there, ' +
      'so `fetch(\'/api/chat\')` 404s.',
    fix:
      'Either run the backend somewhere real, or skip it entirely for local dev:\n\n' +
      '```ts\n' +
      '// Option A — use Next.js where route handlers are supported\n' +
      "// app/api/chat/route.ts: export async function POST(req) { ... }\n\n" +
      '// Option B — add a Vite dev-server middleware/proxy\n' +
      "// vite.config.ts: server: { proxy: { '/api': 'http://localhost:3001' } }\n\n" +
      '// Option C — run a separate Express/Hono server\n' +
      "// framework: 'express' in your harness config\n\n" +
      '// Option D — zero-config local dev with mock integration (no backend needed)\n' +
      "// Use `integration: 'mock'` in the scaffold tool\n" +
      '```',
  },
  {
    // Rule 9 — reduce bundle size / footprint / "how much does @kitn.ai/ui add"
    // Source: dist/elements/<file>.js per-element exports; dist/autoloader.js
    id: 'bundle-footprint',
    test: (t) =>
      /bundle\s*size|footprint|tree.?shak|how\s+much.*does.*@kitn|reduce.*import|import.*only.*element|per.?element\s+import|autoload|cdn.*no.?build|no.?build.*cdn/i.test(
        t,
      ),
    title: 'Reducing bundle footprint — three load modes',
    cause:
      'The default `import \'@kitn.ai/ui/elements\'` registers every `kai-*` element. ' +
      'If your page uses only one or two elements, that pulls in the full ~119 KB gz bundle. ' +
      'Two opt-in modes let you load only what you need.',
    fix:
      '**Mode 1 — register-all (default, SSR-safe):**\n' +
      'Best for multi-element apps or any SSR/meta-framework. ' +
      'Load once and every `kai-*` element is available.\n\n' +
      '```js\n' +
      "import '@kitn.ai/ui/elements';  // ~119 KB gz — registers everything\n" +
      '```\n\n' +
      '**Mode 2 — per-element import (tree-shaking, bundler apps):**\n' +
      'Use `import \'@kitn.ai/ui/elements/<file>\'` to register only one element. ' +
      'A bundler (Vite, webpack, Rollup) will tree-shake to just its chunks (~73 KB gz for `kai-chat` alone). ' +
      'Client-only — do not use in SSR entry points.\n\n' +
      '```js\n' +
      "// Registers only <kai-chat> (~73 KB gz vs ~119 KB gz register-all)\n" +
      "import '@kitn.ai/ui/elements/chat';\n\n" +
      "// Other examples:\n" +
      "import '@kitn.ai/ui/elements/code-block';  // <kai-code-block>\n" +
      "import '@kitn.ai/ui/elements/confirm-card'; // <kai-confirm>\n" +
      '```\n\n' +
      'The file name is the element\'s source basename from `element-manifest.json` ' +
      '(e.g. `kai-chat` → `chat`, `kai-confirm` → `confirm-card`).\n\n' +
      '**Mode 3 — autoloader (no-build / CDN pages only):**\n' +
      'Watches the DOM and dynamically imports each `kai-*` element\'s module on demand. ' +
      'A page that uses only `<kai-chat>` never downloads the other elements. ' +
      'It is a CDN / static-file tool — load it from a `<script type="module">` tag. ' +
      'It is NOT importable through a bundler: Vite/webpack relocate it and the on-demand imports 404. ' +
      'Client-only.\n\n' +
      '```html\n' +
      '<script type="module" src="https://cdn.jsdelivr.net/npm/@kitn.ai/ui@<version>/dist/elements/autoloader.js"></script>\n' +
      '```\n\n' +
      'In a BUNDLED app (Vite/webpack/Next) use Mode 1 or Mode 2 instead — not the autoloader.\n\n' +
      '**SSR note:** use Mode 1 (register-all) in SSR apps — ' +
      'per-element imports and the autoloader are client-only (they call DOM APIs at module eval). ' +
      'Modes 1 & 2 are side-effect imports; keep them even if your linter flags them as "unused".',
  },
  {
    // Rule 5 — SSR / server component / document is not defined
    // Source: for-ai-agents.mdx (client-only import); context7.json rule 2 (property rule requires DOM)
    id: 'ssr-server-component',
    test: (t) => {
      // Core SSR signals — always trigger
      if (/\bssr\b|server\s+component|document\s+is\s+not\s+defined|window\s+is\s+not\s+defined|next\.?js.*server|server.*next\.?js/.test(t)) return true;
      // "hydration" only triggers when a web-component / kai context is also present
      if (/hydration/.test(t) && /kai|web.?component|custom.?element|<[a-z]+-/.test(t)) return true;
      return false;
    },
    title: 'SSR / server-side rendering — element requires the browser DOM',
    cause:
      '`kai-*` elements are client-side web components. They require `document` and ' +
      '`customElements` to register and render. Importing them in a server component ' +
      '(Next.js App Router server component, Nuxt SSR, etc.) throws ' +
      '"document is not defined" or silently produces no output.',
    fix:
      'Register the element on the client only. ' +
      'Use your framework\'s "client-only" / island / dynamic-import pattern.\n\n' +
      '```js\n' +
      "// ✅ Plain HTML / vanilla — import in a <script type=\"module\">\n" +
      "import '@kitn.ai/ui/elements';\n\n" +
      '// ✅ Next.js App Router — mark the component with "use client"\n' +
      "'use client';\n" +
      "import '@kitn.ai/ui/elements';\n\n" +
      '// ✅ Next.js — dynamic import with ssr: false\n' +
      "import dynamic from 'next/dynamic';\n" +
      "const KaiChat = dynamic(() => import('@kitn.ai/ui/elements').then(() => 'kai-chat'), { ssr: false });\n\n" +
      '// ✅ React wrapper (already client-safe)\n' +
      "import { Chat } from '@kitn.ai/ui/react';\n" +
      '```',
  },
  {
    // Rule 10 — toast() is the imperative API; there is no <kai-toast> to place
    // Source: src/primitives/toast-store.ts (the `toast` fn + auto-mounted region)
    id: 'toast-imperative',
    test: (t) => {
      // Placing a toast element by hand (the region auto-mounts — you never write it).
      if (/<kai-toast(-region)?\b/.test(t)) return true;
      // Asking how to show / trigger a toast or notification with kai context.
      if (
        /\btoast(s)?\b|notification|snackbar/i.test(t) &&
        /how.*(show|raise|trigger|fire|display)|show.*toast|raise.*toast|trigger.*toast|toast.*(not|isn'?t|won'?t).*(show|appear|render)|where.*toast|add.*toast|kai-|@kitn/i.test(t)
      )
        return true;
      return false;
    },
    title: 'Toast is an imperative call — `toast(\'…\')`, not a `<kai-toast>` you place',
    cause:
      'Toasts are raised IMPERATIVELY by calling `toast(message)` — there is no ' +
      '`<kai-toast>` element you add to your markup. The first call lazily mounts ONE ' +
      '`<kai-toast-region>` on `document.body` (a real, kit-styled, viewport-positioned ' +
      'element) and every later toast feeds that same region. Trying to place a toast ' +
      'element by hand, or looking for a `messages`/`toasts` prop to push into, is the ' +
      'wrong model.',
    fix:
      'Import `toast` and call it. It is exported from BOTH the root `@kitn.ai/ui` and ' +
      'the `@kitn.ai/ui/elements` bundle, so the web-components-only consumer gets it too. ' +
      'It is SSR-safe (no DOM is touched until the first call on the client).\n\n' +
      '```js\n' +
      "import { toast } from '@kitn.ai/ui/elements'; // or '@kitn.ai/ui'\n\n" +
      "// ✅ Fire-and-forget\n" +
      "toast('Copied to clipboard');\n" +
      "toast.success('Saved');\n\n" +
      "// ✅ With an Undo action + an imperative handle\n" +
      "const t = toast('Item deleted', {\n" +
      "  action: { label: 'Undo', onAction: () => restore() },\n" +
      '});\n' +
      "t.update({ message: 'Restored', variant: 'success' });\n" +
      't.dismiss();\n' +
      '```\n\n' +
      'The auto-mounted `<kai-toast-region>` carries its own shadow root + kit styles — ' +
      'do NOT add a `<kai-toast-region>` tag yourself unless you deliberately want a ' +
      'second, declaratively-controlled region.',
  },
  {
    // Rule 11 — dismissed cards are DEFERRED (reopenable stub), not deleted
    // Source: src/primitives/card-recovery.ts (dismissRecovery) + the dismissed stub
    id: 'card-dismiss-deferred',
    test: (t) => {
      const cardCtx = /\bcard(s)?\b|envelope|kai-card|kai-cards|kai-confirm|kai-choice|kai-tasks|kai-form|generative.?ui|resolution|dismissRecovery/i;
      if (!cardCtx.test(t)) return false;
      // dismiss / reopen / undo / disappear / filter-out signals in a card context.
      return /dismiss|reopen|re-?open|\bundo\b|disappear|remove.*card|card.*(gone|remove|delete|vanish)|filter.*out|stub/i.test(t);
    },
    title: 'Dismissed cards are DEFERRED (a reopenable stub), not deleted',
    cause:
      'Dismissing a generative-UI card does NOT delete its envelope from history. The ' +
      'card stamps a `{ kind: \'dismissed\' }` resolution onto its envelope and collapses ' +
      'to a small reopenable stub ("Proposed: <title> — dismissed · Reopen"). If you ' +
      'filter `dismissed` envelopes out of your cards array, the stub vanishes and the ' +
      'user can never reopen it — and you lose the audit trail of what was proposed.',
    fix:
      'Keep dismissed envelopes in the array. Wire dismiss/reopen with `dismissRecovery()` ' +
      '(from `@kitn.ai/ui`), which builds the `onDismiss`/`onReopen` half of a `CardPolicy` ' +
      'over your store and can show a "Dismissed · Undo" toast via an injected adapter.\n\n' +
      '```ts\n' +
      "import { dismissRecovery } from '@kitn.ai/ui';\n" +
      "import { toast } from '@kitn.ai/ui/elements';\n\n" +
      '// Adapter: map dismissRecovery\'s toast shape onto the imperative toast().\n' +
      'const toastAdapter = {\n' +
      '  show: ({ message, action, durationMs }) => {\n' +
      "    const handle = toast(message, {\n" +
      '      duration: durationMs,\n' +
      '      action: action && { label: action.label, onAction: action.onClick },\n' +
      '    });\n' +
      '    return { dismiss: handle.dismiss };\n' +
      '  },\n' +
      '};\n\n' +
      'const { onDismiss, onReopen } = dismissRecovery({\n' +
      '  get: () => cards,            // your current envelopes\n' +
      '  set: (next) => setCards(next), // NEW array reference (never mutate in place)\n' +
      '  toast: toastAdapter,\n' +
      '});\n' +
      '// Pass these on the CardPolicy you hand to <kai-cards> / <kai-remote>.\n' +
      '```\n\n' +
      '`onDismiss` writes `dismissed` immutably (Undo restores the prior resolution); ' +
      '`onReopen` clears it back to live (or stamps `expired` when the host says the card ' +
      'is no longer reopenable). Never mutate the array in place — re-render needs a new ref.',
  },
  {
    // Rule 12 — kai-compare contract: two candidates, JS data prop, stream both, terminal pick
    // Source: src/elements/compare.tsx + src/components/response-compare-types.ts
    id: 'compare-contract',
    test: (t) => {
      if (/<kai-compare\b|kai-compare-select|ResponseCompareData|response.?compare/i.test(t)) return true;
      // "compare two responses / candidates / A vs B" with a kai/UI context.
      if (
        /compar(e|ing|ison)|side.by.side|a\/b|two\s+(responses|candidates|answers|completions)|dual.?response/i.test(t) &&
        /kai-|@kitn|candidate|prefer(ence)?|chosen|reject/i.test(t)
      )
        return true;
      return false;
    },
    title: '`kai-compare` — two candidates, `data` as a JS property, terminal pick',
    cause:
      '`<kai-compare>` shows EXACTLY two assistant candidates for one prompt and lets the ' +
      'user pick the better one. The `data` value is an array/object, so it must be set as ' +
      'a JS PROPERTY (never an HTML attribute). Both candidates can stream — but, like ' +
      '`kai-chat`, that needs a NEW `data` reference per chunk (mutating in place will not ' +
      're-render). The pick is a COMMIT (not a Submit): it fires once and the card collapses.',
    fix:
      'Set `data` in JS with two candidates, stream by reassigning a fresh `data` object ' +
      'per chunk, and listen for `kai-compare-select` directly on the element.\n\n' +
      '```ts\n' +
      "import { toast } from '@kitn.ai/ui/elements';\n" +
      "import type { ResponseCompareData, CompareSelection } from '@kitn.ai/ui';\n\n" +
      "const el = document.querySelector('kai-compare')!;\n" +
      '// data is a JS PROPERTY — exactly two candidates, each with a unique id.\n' +
      'el.data = {\n' +
      "  prompt: 'Summarise the report',\n" +
      '  candidates: [\n' +
      "    { id: 'a', content: '', streaming: true },\n" +
      "    { id: 'b', content: '', streaming: true },\n" +
      '  ],\n' +
      '} satisfies ResponseCompareData;\n\n' +
      '// Stream BOTH columns: replace data with a NEW object per chunk.\n' +
      "el.data = { ...el.data, candidates: [{ ...a, content: aText }, { ...b, content: bText }] };\n" +
      '// Clear `streaming` on a candidate when it settles — the pick stays disabled\n' +
      '// until BOTH have settled, then `kai-ready` fires.\n\n' +
      "// Picking is terminal: emits { chosenId, rejectedIds, at } and collapses.\n" +
      "el.addEventListener('kai-compare-select', (e) => {\n" +
      '  const { chosenId, rejectedIds } = (e as CustomEvent<CompareSelection>).detail;\n' +
      '  recordPreference({ prompt, chosen: chosenId, rejected: rejectedIds });\n' +
      '});\n' +
      '```\n\n' +
      'A malformed definition (not two candidates, missing/duplicate ids) fires `kai-error` ' +
      'instead. The event is non-bubbling — listen on the element, not on `document`.',
  },
];

function buildText(matched: Rule[]): string {
  if (matched.length === 0) {
    return (
      'No known failure pattern matched. Suggested next steps:\n\n' +
      '1. Use the `component_reference` tool to look up the real API for the element ' +
      '(prop names, event names, attribute vs. property distinction).\n' +
      '2. If the problem is in host code rather than an element — streaming, ' +
      '`createAssistantStream`, `createMockResponder`, the SSE readers, the encoders — ' +
      'call `component_reference` with `{ name: "programmatic" }` for the full ' +
      '`@kitn.ai/ui/state` + `@kitn.ai/ui/wire` API, and `{ name: "composed-thread" }` ' +
      'for a complete hand-composed surface to compare wiring against.\n' +
      '3. Check the **Streaming recipe** and the **Programmatic layer** sections in ' +
      '`llms-full.txt` (`node_modules/@kitn.ai/ui/llms-full.txt` or ' +
      'https://ui.kitn.ai/llms-full.txt) for correct streaming wiring.\n' +
      '4. Paste `https://ui.kitn.ai/llms.txt` into your prompt for a compact orientation.'
    );
  }

  const sections = matched.map((rule, i) => {
    const n = i + 1;
    return `## ${n}. ${rule.title}\n\n**Cause:** ${rule.cause}\n\n**Fix:** ${rule.fix}`;
  });

  const header =
    matched.length === 1
      ? '1 likely cause found:\n\n'
      : `${matched.length} likely causes found:\n\n`;

  return header + sections.join('\n\n---\n\n');
}

export const debug: Tool = {
  name: 'debug',
  description:
    'Diagnose common AI/UI (kai-*) integration issues. ' +
    'Provide a `symptom` (prose description) and/or a `snippet` (code) ' +
    'and receive the likely cause + fix for classic kai-* failure modes.',
  inputSchema: z.object({
    symptom: z.string().optional(),
    snippet: z.string().optional(),
  }),
  handler: async (args) => {
    const combined = `${(args.symptom as string | undefined) ?? ''} ${(args.snippet as string | undefined) ?? ''}`;
    const matched = RULES.filter((rule) => rule.test(combined));

    return {
      content: [{ type: 'text', text: buildText(matched) }],
    };
  },
};
