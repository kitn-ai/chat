import { z } from 'zod';
import { Invariant, type TInvariant } from './catalog-types';

/**
 * Spec §5. Every one already known to break real consumers.
 *
 * The `statement` is the prose an agent applies; the `examples` are the part a
 * weak model can pattern-match, so each `wrong` is a single-line literal the
 * self-audit can grep for (enforced by invariants.test.ts, not by this comment).
 *
 * `enforcedBy` paths are REPO-relative; `lint` names a script in
 * packages/ui/package.json. `kind: 'none'` is an honest coverage gap. Where a
 * guard covers only part of a statement the record is `status: 'partial'` and
 * the statement says which half is which — an invariant that overstates its own
 * enforcement is worse than one that admits a gap, because a reader stops
 * looking.
 *
 * EXAMPLES ARE CONSUMER CODE. Every `right` form must be runnable by someone who
 * has only installed the package: no import that is not in the `exports` map.
 * The kit's own guards (isSafeUrl, isRenderableLink) live in `src/primitives`,
 * which ships compiled and unexported, so they are named as repo-internal
 * guidance and never written as a consumer import.
 */
export const invariants: TInvariant[] = [
  {
    id: 'reactivity-two-halves',
    statement:
      'A new array reference NOTIFIES; a new object for each changed item makes the change VISIBLE. Editing an existing item needs both. Adds and removes need only the fresh array. Setting the same array back is a no-op even if an item inside it was swapped. The test pins how the KIT behaves — it will render stale unless both arrive — but nothing checks CONSUMER code, so this is a rule you apply, not a guarantee you will be warned about. Reorders follow the same rule as adds and removes; the test names reorders in its title but exercises only an add and a remove, so treat that half as reasoned rather than pinned.',
    appliesTo: { tags: ['kai-chat', 'kai-conversations'] },
    enforcedBy: { kind: 'test', paths: ['packages/ui/src/components/reactivity-contract.test.tsx'] },
    status: 'enforced',
    diagnosis: [
      {
        symptom: 'messages render once but never update while streaming',
        cause: 'the same array reference is being set back; the element is never notified',
      },
      {
        symptom: 'the list re-renders but an edited item shows stale content',
        cause: 'the array is new but the item object identity is unchanged; the reference-keyed <For> keeps the old row',
      },
    ],
    examples: [
      {
        wrong: "chat.messages.push({ id, role: 'user', parts: [{ type: 'text', text }] });",
        right: "chat.messages = [...chat.messages, { id, role: 'user', parts: [{ type: 'text', text }] }];",
        note: 'Mutating in place never notifies. Neither does assigning the same array reference back — the setter compares references.',
      },
      {
        wrong: 'messages[last].parts.push(part);',
        right: 'chat.messages = messages.map((m, i) => (i === last ? { ...m, parts: [...m.parts, part] } : m));',
        note: 'This is the half that gets missed. A fresh array alone notifies, but the reference-keyed <For> keeps the old row until the EDITED ITEM is a new object too. createAssistantStream from @kitn.ai/ui/state already does both.',
      },
    ],
  },
  {
    id: 'props-not-attributes',
    statement:
      "Set arrays, objects and functions as JS PROPERTIES on the element instance. Only scalars (strings, numbers, booleans) belong in attributes, and the derived layer's scalar flag records which prop is which. What actually goes wrong, because the mechanism is not the obvious one: a framework template binding or String() stringifies an array to '[object Object]', which is not JSON, and the attribute path falls back to handing the element that raw STRING — so the prop is silently a string and the list renders nothing. A function cannot survive JSON at all: JSON.stringify({ onSubmit }) is '{}', so every callback is dropped. And an attribute re-set is not how updates are delivered — see reactivity-two-halves. A hand-written, valid-JSON attribute does happen to parse today, because a transitive dependency JSON.parses attributes whose declared default is not a string, but that is that dependency's behaviour and not this kit's contract; do not build on it. NOTHING IN THIS REPO ENFORCES THIS — it is a consumer contract, and the scalar flag in the derived layer is how the catalog SERVES the fact, which is not the same as checking it.",
    appliesTo: {},
    // kind:'none' after measurement, replacing a `structural` pointer at
    // define.tsx that did not contain the claimed mechanism. What define.tsx
    // actually does is install non-reflecting accessors for the handful of props
    // colliding with reflected global IDL attributes (role/hidden/autofocus), in
    // the OPPOSITE direction: it stops property writes reflecting TO attributes.
    // The attribute->property path lives in component-register, a transitive
    // dependency, and measured in the real jsdom project against the real
    // element it PARSES a JSON attribute onto the property rather than rejecting
    // it. Nothing here checks consumer code for the contract; S1's scoring
    // exercises a property update on kai-chat.messages, but no scenario names
    // this invariant, so it is not claimed as a measurement either.
    enforcedBy: { kind: 'none' },
    status: 'open',
    diagnosis: [
      {
        symptom: 'an element renders empty and the data looks right in devtools',
        cause: "the property holds the STRING '[object Object]', not an array; it arrived through an attribute that was stringified rather than assigned",
      },
      {
        symptom: 'everything renders but no callback ever fires',
        cause: 'the object went through JSON into an attribute, and JSON drops functions silently',
      },
    ],
    examples: [
      {
        wrong: "el.setAttribute('messages', String(messages));",
        right: 'el.messages = messages;',
        note: "Measured against the real element: the attribute becomes '[object Object]', JSON.parse fails, and the fallback leaves a STRING on the prop. messages is scalar:false in the derived layer; placeholder, loading and theme are scalar:true and do belong in attributes.",
      },
      {
        wrong: "cards.setAttribute('policy', JSON.stringify({ onSubmit }));",
        right: 'cards.policy = { onSubmit };',
        note: "Measured: JSON.stringify({ onSubmit }) is '{}', so the handler is gone before the attribute is even set. No attribute can carry a function.",
      },
    ],
  },
  {
    id: 'events-non-bubbling',
    statement:
      'Non-bubbling is the default: public kai-* events are dispatched through the one helper that hard-codes bubbles:false and composed:false, so listen on the element itself, never on a parent or document. The protocol exceptions (kai-maximize-intent, kai-maximize-state and kai-card) bubble or compose deliberately and are listed in the derived layer under eventExceptions — do not generalise from them to the rest.',
    appliesTo: {},
    enforcedBy: { kind: 'structural', path: 'packages/ui/src/elements/define.tsx' },
    status: 'enforced',
    diagnosis: [
      {
        symptom: 'a delegated listener on document or a parent never fires',
        cause: 'kai-* events do not bubble; attach the listener to the element that dispatches it',
      },
      {
        symptom: 'a listener on the element works, but the same one on a wrapper div does not',
        cause: 'same cause; only the three eventExceptions cross the element boundary',
      },
    ],
    examples: [
      {
        wrong: "document.addEventListener('kai-submit', (e) => send(e.detail.value));",
        right: "chat.addEventListener('kai-submit', (e) => send(e.detail.value));",
        note: 'The dispatch helper in src/elements/define.tsx passes { bubbles: false, composed: false }, so nothing above the host ever sees the event.',
      },
      {
        wrong: "wrapper.addEventListener('kai-message-action', handleAction);",
        right: "chat.addEventListener('kai-message-action', handleAction);",
        note: 'Delegating from a wrapper is the most common shape of this bug, because it is the habit every DOM framework teaches.',
      },
    ],
  },
  {
    id: 'host-coordinates',
    statement:
      'There is no store. Data flows in via properties, out via events, and the host wires element A to element B. Solid context does not cross element boundaries, so nothing coordinates elements except the host application, and no element owns another. Placing two elements in the same subtree wires nothing.',
    appliesTo: {},
    enforcedBy: { kind: 'none' },
    status: 'open',
    diagnosis: [
      {
        symptom: 'two elements are expected to sync but do not',
        cause: 'nothing auto-coordinates; the host must listen on one element and set properties on the other',
      },
      {
        symptom: 'a property assignment is silently ignored and the prop is not in the reference',
        cause: 'the data was put on the element that displays the conversation rather than the one that owns the list',
      },
    ],
    examples: [
      {
        wrong: 'chat.conversations = rows;',
        right: 'conversations.conversations = rows;',
        note: 'kai-chat has no conversations prop — the sidebar is its own element. One element never holds the whole app state.',
      },
      {
        wrong: "chat.addEventListener('kai-conversation-select', (e) => load(e.detail.id));",
        right:
          "conversations.addEventListener('kai-conversation-select', (e) => { chat.messages = threadsById[e.detail.id]; });",
        note: 'Event out of A, property into B, wired by the host. The event is dispatched by the element that owns the list, so that is where the listener goes.',
      },
    ],
  },
  {
    id: 'untrusted-model-output',
    statement:
      "Everything the model produced is untrusted input: a MessagePart, card envelope or tool argument reaching innerHTML, an href or src, window.open or an iframe is a vulnerability. THE DEFECT IS NEVER A MISSING GUARD, IT IS WHICH PATH GOT IT — every one found so far sat on a path the CONSUMER controls while the model-controlled path beside it had none. So put a policy on the sink, and MATCH THE LIST TO THE SINK rather than reaching for one universal list: http:, https: and mailto: for anything navigable the user may click, resolved against the page so ordinary relative links still work; http: and https: ONLY for a model-supplied citation, which is a reference to a page on the public web and has no business being relative. Those are two lists because there are two sinks — it is the same split the kit makes internally between SAFE_SCHEMES and RENDERABLE_SCHEMES, not a variant invented here. Whichever you use, parse inside a try/catch and RETURN FALSE on an unparseable URL: new URL() throws, and a throw at a sink crashes the render. And render model text as TEXT. Escaping is the correct rendering: the source text must stay VISIBLE as well as inert, because a filter that deleted it would pass the security check and be a worse UI. COVERAGE, and read this before trusting CI here: the three XSS suites are tests and ONLY tests. They run in the required test job, so the vectors they pin cannot come back — but NOTHING structural stops a NEW sink landing unguarded. No lint script in the package is about sinks, and the coupling map's unenforced list has no entry for the class. A new sink is caught in review or not at all.",
    appliesTo: {},
    // WHAT THE THREE SUITES DO NOT CATCH: they pin the vectors that were FOUND
    // (#246 markdown innerHTML, #247 the artifact's three URL sinks, and the
    // hostile-stream path), so they are regression guards, not a guard over the
    // CLASS. A newly written component that puts model text on a fresh
    // unguarded sink adds no failing test anywhere. Verified against
    // HANDOFF-2026-08-13 §13.2 ("They are tests and only tests... nothing
    // structural stops a NEW sink landing unguarded"), and re-checked against
    // the tree: none of packages/ui/scripts/lint-*.mjs concerns sinks, and
    // docs/coupling-map.md has no row for the class. Kept as kind:'test'
    // because the regression coverage is real; status is `partial` because the
    // class is not covered, and the statement carries the gap.
    enforcedBy: {
      kind: 'test',
      paths: [
        'packages/ui/tests/components/markdown-xss.test.tsx',
        'packages/ui/tests/components/artifact-url-xss.test.tsx',
        'packages/ui/tests/components/hostile-model-output.test.tsx',
      ],
    },
    status: 'partial',
    diagnosis: [
      {
        symptom: 'a custom renderer for a tool result or a card body executes markup the model emitted',
        cause: 'model text reached innerHTML on a hand-written path; the guarded path is the one every real message flows through, and this one bypassed it',
      },
      {
        symptom: 'a citation or card link navigates to javascript: or data:',
        cause: 'a model-supplied URL reached an href, a src or window.open with no scheme check',
      },
    ],
    examples: [
      {
        wrong: 'el.innerHTML = part.text;',
        right: 'el.textContent = part.text;',
        note: 'For rich text render the part through <kai-markdown>, which escapes rather than sanitizes (src/components/markdown.tsx) and filters link and image URLs. Never hand-roll a second markdown-to-innerHTML path.',
      },
      {
        wrong: "window.open(card.url, '_blank');",
        right:
          "const isNavigable = (u) => { try { return ['http:', 'https:', 'mailto:'].includes(new URL(u, location.href).protocol); } catch { return false; } };\nif (isNavigable(card.url)) window.open(card.url, '_blank', 'noopener,noreferrer');",
        note: "THE try/catch IS NOT OPTIONAL: new URL() THROWS on an unparseable input like 'http://[', and an uncaught throw here crashes the render instead of blocking the link — worse than the bug you are fixing. Returning false is the whole contract. Resolving against location.href is deliberate: a relative or fragment href inherits http: and is allowed, which is what makes ordinary links keep working. REPO-INTERNAL ONLY: contributors inside this package use isSafeUrl/SAFE_SCHEMES from src/primitives/url-scheme-policy.ts (re-exported from src/primitives/card-routing.ts for the existing call sites), which has this exact shape — neither is reachable from the published package, so never emit an import for them.",
      },
      {
        wrong: '<a href={source.url}>{source.title}</a>',
        right:
          'const isCitationUrl = (u) => { try { return [\'http:\', \'https:\'].includes(new URL(u).protocol); } catch { return false; } };\n{isCitationUrl(source.url) ? <a href={source.url} rel="noopener noreferrer">{source.title}</a> : <span>{source.title}</span>}',
        note: "No base here, unlike the navigable case: a model-supplied citation is a reference to a page on the public web, so a relative path is not a citation and returns false. It must RETURN false, not throw — a throw escapes the ternary and the fallback never renders, which is exactly the deleted-text failure this invariant's own statement forbids. The <span> keeps the title VISIBLE. REPO-INTERNAL equivalent: isRenderableLink in src/primitives/link-preview.ts, also not exported.",
      },
    ],
  },
  {
    id: 'kit-parses-consumer-fetches',
    statement:
      "The kit parses; the consumer fetches. Two halves, covered differently. KIT SIDE: every MessagePart variant the wire encodes must be accounted for, or a variant is gone once the request leaves — that half is enforced by lint:silent-drops in CI. CONSUMER SIDE: never hand-roll an SSE reader; import readOpenAIStream, readAnthropicStream or readModelStream from @kitn.ai/ui/wire, and fetch from your own endpoint, because there is no client, no key handling and no provider SDK below wire/. NO CI CHECK COVERS THAT SECOND HALF — no guard reads consumer or scaffolded code for a hand-rolled reader; it is measured by the acceptance deck instead, at scenario S2, whose scoring line is 'imports readOpenAIStream from @kitn.ai/ui/wire; no hand-rolled SSE reader anywhere in the output'.",
    appliesTo: {},
    // WHAT lint:silent-drops DOES NOT CATCH: it analyzes src/wire, so it covers
    // the kit-side half only. A consumer or a scaffold that hand-rolls its own
    // SSE loop never enters its scan, and the lint stays green. That gap is
    // stated in the statement above so no reader concludes CI catches it, and
    // scenario S2 is what actually measures it. Recorded rather than closed:
    // flipping this to kind:'none' would discard a real guard over a real half,
    // which is what `status: 'partial'` exists to express.
    enforcedBy: { kind: 'lint', script: 'lint:silent-drops' },
    status: 'partial',
    diagnosis: [
      {
        symptom: 'streaming works for one provider and silently drops parts for another',
        cause: 'a hand-rolled reader misses part variants the wire layer already handles; replace it with the wire import',
      },
      {
        symptom: 'tokens arrive glued together, or a multibyte character renders as garbage mid-stream',
        cause: 'a hand-rolled reader split on a data: prefix and assumed one frame per chunk; keep-alive comments, multi-line frames and codepoints split across a socket boundary are all real',
      },
    ],
    examples: [
      {
        wrong: "text += JSON.parse(line.replace('data: ', '')).choices[0].delta.content;",
        right: 'const turn = await readOpenAIStream(res, stream);',
        note: "import { readOpenAIStream } from '@kitn.ai/ui/wire'; createAssistantStream from '@kitn.ai/ui/state' owns the message, the reader fills it. readAnthropicStream and readModelStream are the other two entry points.",
      },
      {
        wrong: "await fetch('https://api.openai.com/v1/chat/completions', { headers: { Authorization: 'Bearer ' + apiKey } });",
        right:
          "await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: toOpenAIMessages(history) }) });",
        note: 'The consumer fetches, from their own endpoint. A provider key in the browser is a leaked key; toOpenAIMessages/toAnthropicMessages encode the thread for the wire.',
      },
    ],
  },
  {
    id: 'upgrade-race',
    statement:
      'A property set before the element upgrades is lost. On script-tag targets, load order is not ours. Until issue #99 option B (upgrade-property preservation in defineWebComponent) lands, every script-tag recipe must state this race loudly and set properties only after registration — await customElements.whenDefined(tag), which is the guarantee. A timer, or DOMContentLoaded, is a guess about load order rather than a guarantee: registration can land later, from an async chunk or a dynamically inserted script.',
    appliesTo: { targets: ['script-tag'] },
    enforcedBy: { kind: 'none', until: 'issue #99 option B lands in defineWebComponent' },
    status: 'open',
    diagnosis: [
      {
        symptom: 'properties set in inline script are ignored on a CDN page',
        cause: 'the element had not upgraded yet; the set landed on a plain HTMLElement and was lost',
      },
      {
        symptom: 'the same code works under a bundler and not from a script tag',
        cause: 'the bundler happened to order the registration first; a script tag gives no such guarantee',
      },
    ],
    examples: [
      {
        wrong: 'setTimeout(() => { chat.messages = messages; }, 0);',
        right: "customElements.whenDefined('kai-chat').then(() => { chat.messages = messages; });",
        note: 'A timer bets on load order. whenDefined resolves when the registry actually has the tag, which is the thing you need to be true.',
      },
      {
        wrong: "document.addEventListener('DOMContentLoaded', () => { chat.messages = messages; });",
        right: "customElements.whenDefined('kai-chat').then(() => { chat.messages = messages; });",
        note: 'DOMContentLoaded is about the parser, not the registry. It says the markup is there, never that the element behind the tag has been defined.',
      },
    ],
  },
];

export function listInvariants(): TInvariant[] {
  return z.array(Invariant).parse(invariants);
}
