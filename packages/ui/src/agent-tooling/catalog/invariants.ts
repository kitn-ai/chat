import { z } from 'zod';
import { Invariant, type TInvariant } from './catalog-types';

/**
 * Spec §5. Every one already known to break real consumers.
 *
 * The `statement` is the prose an agent applies; the `examples` are the part a
 * weak model can pattern-match, so each `wrong` is a literal fragment the
 * self-audit checklist can grep for. `enforcedBy` paths are REPO-relative;
 * `lint` names a script in packages/ui/package.json. `kind: 'none'` is an honest
 * coverage gap, reported rather than papered over with a path that proves
 * nothing.
 */
export const invariants: TInvariant[] = [
  {
    id: 'reactivity-two-halves',
    statement:
      'A new array reference NOTIFIES; a new object for each changed item makes the change VISIBLE. Editing an existing item needs both. Adds, removes and reorders need only the fresh array. Setting the same array back is a no-op even if an item inside it was swapped.',
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
        wrong: 'last.parts = [...last.parts, part];\nchat.messages = [...messages];',
        right: 'chat.messages = messages.map((m, i) => (i === messages.length - 1 ? { ...m, parts: [...m.parts, part] } : m));',
        note: 'This is the half that gets missed. The fresh array notifies, but the reference-keyed <For> keeps the old row until the EDITED ITEM is a new object too. createAssistantStream from @kitn.ai/ui/state already does both.',
      },
    ],
  },
  {
    id: 'props-not-attributes',
    statement:
      'Arrays and objects are set as JS properties, never HTML attributes. Only scalars (strings, numbers, booleans) work as attributes. The scalar flag on every prop in the derived layer records which is which.',
    appliesTo: {},
    enforcedBy: { kind: 'structural', path: 'packages/ui/src/elements/define.tsx' },
    status: 'enforced',
    diagnosis: [
      {
        symptom: 'an element ignores its data entirely',
        cause: 'an array or object was passed as an attribute string; set it as a JS property on the element instance',
      },
    ],
    examples: [
      {
        wrong: '<kai-chat messages=\'[{"id":"1","role":"user"}]\'></kai-chat>',
        right:
          "document.querySelector('kai-chat').messages = [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }];",
        note: 'messages is scalar:false in the derived layer. placeholder, loading and theme are scalar:true and DO work as attributes.',
      },
      {
        wrong: "el.setAttribute('suggestions', JSON.stringify(list));",
        right: 'el.suggestions = list;',
        note: 'Same for conversations, groups, models, cards, schemas, policy — check the prop\'s scalar flag in the derived layer rather than guessing.',
      },
    ],
  },
  {
    id: 'events-non-bubbling',
    statement:
      'Non-bubbling is the default: public kai-* events are dispatched through the one helper that hard-codes bubbles:false and composed:false, so listen on the element itself. The protocol exceptions (kai-maximize-intent, kai-maximize-state and kai-card) bubble or compose deliberately and are listed in the derived layer under eventExceptions — do not generalise from them to the rest.',
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
        wrong: "shell.addEventListener('kai-conversation-select', (e) => load(e.detail.id));",
        right: "conversations.addEventListener('kai-conversation-select', (e) => load(e.detail.id));",
        note: 'Delegating from a wrapper is the most common shape of this bug, because it is the habit every DOM framework teaches.',
      },
    ],
  },
  {
    id: 'host-coordinates',
    statement:
      'There is no store. Data flows in via properties, out via events, and the host wires element A to element B. Solid context does not cross element boundaries, so nothing coordinates elements except the host application.',
    appliesTo: {},
    enforcedBy: { kind: 'none' },
    status: 'open',
    diagnosis: [
      {
        symptom: 'two elements are expected to sync but do not',
        cause: 'nothing auto-coordinates; the host must listen on one element and set properties on the other',
      },
    ],
    examples: [
      {
        wrong: 'conversations.conversations = rows; // and expect kai-chat to follow the selection',
        right:
          "conversations.addEventListener('kai-conversation-select', (e) => {\n  conversations.activeId = e.detail.id;\n  chat.messages = threadsById[e.detail.id];\n});",
        note: 'Event out of A, property into B, wired by the host. Placing the two elements in the same DOM subtree wires nothing.',
      },
    ],
  },
  {
    id: 'untrusted-model-output',
    statement:
      'Everything the model produced is untrusted input. A MessagePart, card envelope or tool argument reaching innerHTML, an href or src, window.open or an iframe is a vulnerability. Put an existing policy on the sink (isSafeUrl/SAFE_SCHEMES for anything navigable, isRenderableLink for a model-supplied citation); never author a third policy. Escaping is the correct rendering — the source text must stay VISIBLE as well as inert.',
    appliesTo: {},
    enforcedBy: {
      kind: 'test',
      paths: [
        'packages/ui/tests/components/markdown-xss.test.tsx',
        'packages/ui/tests/components/artifact-url-xss.test.tsx',
        'packages/ui/tests/components/hostile-model-output.test.tsx',
      ],
    },
    status: 'enforced',
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
        note: 'For rich text render the part through <kai-markdown>, which sanitizes in src/components/markdown.tsx. Never hand-roll a second markdown-to-innerHTML path.',
      },
      {
        wrong: "window.open(card.url, '_blank');",
        right: "if (isSafeUrl(card.url)) window.open(card.url, '_blank', 'noopener,noreferrer');",
        note: 'isSafeUrl/SAFE_SCHEMES from src/primitives/card-routing.ts for anything navigable. For a model-supplied citation use isRenderableLink from src/primitives/link-preview.ts, which demands an absolute http(s) URL.',
      },
      {
        wrong: '<a href={source.url}>{source.title}</a>',
        right: '{isRenderableLink(source.url) ? <a href={source.url} rel="noopener noreferrer">{source.title}</a> : <span>{source.title}</span>}',
        note: 'The fallback keeps the title VISIBLE. A filter that deleted the text would pass the security assertion while being a worse UI.',
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
    // flipping this to kind:'none' would discard a real guard over a real half.
    enforcedBy: { kind: 'lint', script: 'lint:silent-drops' },
    status: 'enforced',
    diagnosis: [
      {
        symptom: 'streaming works for one provider and silently drops parts for another',
        cause: 'a hand-rolled reader misses part variants the wire layer already handles; replace it with the wire import',
      },
      {
        symptom: 'tokens arrive glued together, or a multibyte character renders as garbage mid-stream',
        cause: 'a hand-rolled reader split on "data: " and assumed one frame per chunk; keep-alive comments, multi-line frames and codepoints split across a socket boundary are all real',
      },
    ],
    examples: [
      {
        wrong:
          "for await (const chunk of res.body) {\n  const json = JSON.parse(new TextDecoder().decode(chunk).replace('data: ', ''));\n  text += json.choices[0].delta.content ?? '';\n}",
        right: 'const turn = await readOpenAIStream(res, stream);',
        note: "import { readOpenAIStream } from '@kitn.ai/ui/wire'; createAssistantStream from '@kitn.ai/ui/state' owns the message, the reader fills it. readAnthropicStream and readModelStream are the other two entry points.",
      },
      {
        wrong: "await fetch('https://api.openai.com/v1/chat/completions', { headers: { Authorization: `Bearer ${apiKey}` } });",
        right:
          "await fetch('/api/chat', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({ messages: toOpenAIMessages(history) }),\n});",
        note: 'The consumer fetches, from their own endpoint. A provider key in the browser is a leaked key; toOpenAIMessages/toAnthropicMessages encode the thread for the wire.',
      },
    ],
  },
  {
    id: 'upgrade-race',
    statement:
      'A property set before the element upgrades is lost. On script-tag targets, load order is not ours. Until issue #99 option B (upgrade-property preservation in defineWebComponent) lands, every script-tag recipe must state this race loudly and set properties after registration.',
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
        wrong: "import '@kitn.ai/ui/elements';\ndocument.querySelector('kai-chat').messages = messages;",
        right:
          "import '@kitn.ai/ui/elements';\nawait customElements.whenDefined('kai-chat');\ndocument.querySelector('kai-chat').messages = messages;",
        note: 'whenDefined is the established idiom across the docs patterns. defineWebComponent does not replay a property set on the un-upgraded HTMLElement — that is what #99 option B would add.',
      },
    ],
  },
];

export function listInvariants(): TInvariant[] {
  return z.array(Invariant).parse(invariants);
}
