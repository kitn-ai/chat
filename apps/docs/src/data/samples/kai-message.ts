// Sample data for <kai-message>.
//
// `message` is scalar:false — it is the full message object and must be set as
// a JS property (`el.message = { … }`). Each named set represents a distinct
// story / example so the playground and Examples render meaningful content.
//
// `sample`  = default data for the playground (a rich assistant turn)
// `named`   = per-example sets referenced by <Example data="…">

const AVATAR_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#10b981"/><text x="32" y="42" font-size="28" text-anchor="middle" fill="white">K</text></svg>',
  );

/** A rich assistant message: markdown, reasoning block, a tool call, an attachment, and actions.
 *  `message` is the same `{ id, role, parts }` shape `<kai-chat>` uses per message; `parts` is
 *  ordered (reasoning -> tool -> file -> text, mirroring how an assistant turn reads). */
const ASSISTANT_MESSAGE = {
  id: 'm-a',
  role: 'assistant',
  parts: [
    { type: 'reasoning', text: 'The user wants X, so I should do Y then Z.', label: 'Reasoning' },
    {
      type: 'tool',
      tool: { type: 'search', state: 'output-available', input: { query: 'kitn docs' }, output: { hits: 3 } },
    },
    {
      type: 'file',
      attachment: {
        id: '1',
        type: 'file',
        filename: 'architecture.png',
        mediaType: 'image/png',
        url:
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="12" fill="#7c3aed"/><text x="48" y="60" font-size="42" text-anchor="middle" fill="white">◆</text></svg>',
          ),
      },
    },
    {
      type: 'text',
      text: "Here's the plan, with a quick code sample:\n\n```js\nconst kit = useChat();\n```\n\nThat wires the kit into your component.",
    },
  ],
  actions: ['copy', 'like', 'dislike', 'regenerate'],
};

/** A plain user message (markdown off by default for the user role). */
const USER_MESSAGE = {
  id: 'm-u',
  role: 'user',
  parts: [{ type: 'text', text: 'How do I compose these myself?' }],
};

/** An assistant message with an avatar (from `message.avatar`) and a custom action. */
const AVATAR_MESSAGE = {
  id: 'm-av',
  role: 'assistant',
  parts: [{ type: 'text', text: 'I have an avatar, a custom **Share** action, and the built-in copy and like buttons.' }],
  avatar: { src: AVATAR_SVG, alt: 'Kitn', fallback: 'K' },
  actions: ['copy', 'like', { id: 'share', label: 'Share', icon: 'share' }],
};

export default {
  sample: { message: ASSISTANT_MESSAGE },
  named: {
    assistant: { message: ASSISTANT_MESSAGE },
    user: { message: USER_MESSAGE },
    avatarAndCustomAction: { message: AVATAR_MESSAGE },
    actionsRevealHover: { message: AVATAR_MESSAGE },
  },
};
