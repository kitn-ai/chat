// Composable web-components showcase — wiring for the demo page.
// (The kit itself is registered by ../../../packages/ui/dist/kai.es.js, imported in the HTML.)

// ── boot guard: if the bundle didn't register the elements, show how to run it ──
setTimeout(() => {
  if (!customElements.get('kai-chat')) {
    const link = document.getElementById('boot-link');
    if (location.protocol.startsWith('http')) link.href = location.origin + '/examples/demos/composable/index.html';
    document.getElementById('boot-error').style.display = 'block';
  }
}, 1200);

// ── docked event console: collapsible, clearable, shares vertical space ──
const logBody = document.getElementById('log-body');
const countEl = document.getElementById('console-count');
let logCount = 0;
const log = (ev, detail) => {
  logBody.querySelector('.empty')?.remove();
  const line = document.createElement('div');
  line.className = 'line';
  line.innerHTML = `<span class="ev">${ev}</span> ${detail ?? ''}`;
  logBody.prepend(line);
  while (logBody.children.length > 40) logBody.lastChild.remove();
  countEl.textContent = ++logCount;
  countEl.dataset.n = logCount;
};
const setConsole = (open) => {
  document.documentElement.classList.toggle('console-open', open);
  document.getElementById('console-toggle').setAttribute('aria-expanded', open);
};
document.getElementById('console-toggle').addEventListener('click', () =>
  setConsole(!document.documentElement.classList.contains('console-open')));
document.getElementById('console-hide').addEventListener('click', (e) => { e.stopPropagation(); setConsole(false); });
document.getElementById('console-clear').addEventListener('click', (e) => {
  e.stopPropagation();
  logBody.innerHTML = '<span class="empty">Cleared.</span>';
  logCount = 0; countEl.textContent = '0'; countEl.dataset.n = '0';
});

// ── wait for registration before touching any element ──
// The bundle registers the kai-* elements from a dynamic import, so they are not
// defined yet when this module first runs, and a property written before an
// element upgrades is discarded. Everything below sets array/object data as JS
// properties, so it all has to wait. The boot guard above is already scheduled,
// so a bundle that never arrives still surfaces the error panel.
await customElements.whenDefined('kai-chat');

// ── shared sample data ──
const models = [
  { id: 'opus', name: 'Claude Opus', provider: 'Anthropic' },
  { id: 'sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
  { id: 'haiku', name: 'Claude Haiku', provider: 'Anthropic' },
];
const ctx = { usedTokens: 48200, maxTokens: 200000, inputTokens: 31000, outputTokens: 17200, estimatedCost: 0.42 };
function imgData(fill, glyph) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="12" fill="${fill}"/><text x="48" y="60" font-size="42" text-anchor="middle" fill="white">${glyph}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const attachments = [
  { id: '1', type: 'file', filename: 'architecture.png', mediaType: 'image/png', url: imgData('#7c3aed', '◆') },
  { id: '2', type: 'file', filename: 'spec.pdf', mediaType: 'application/pdf' },
  { id: '3', type: 'source-document', title: 'kitn.dev/docs', filename: 'kitn.dev' },
];

// ── batteries-included ──
const chat = document.getElementById('chat');
chat.models = models; chat.currentModel = 'opus'; chat.context = ctx;
chat.suggestions = ['Summarize this thread', 'What changed in v0.3?'];
// A message's content is an ordered `parts` array; there is no `content` string.
chat.messages = [{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Hi! I\'m the **drop-in** `<kai-chat>`. Ask me anything.' }], actions: ['copy', 'like', 'dislike'] }];
chat.addEventListener('kai-submit', (e) => {
  log('submit', e.detail.value);
  chat.messages = [...chat.messages, { id: Date.now() + '', role: 'user', parts: [{ type: 'text', text: e.detail.value }] }];
  chat.loading = true;
  setTimeout(() => {
    chat.messages = [...chat.messages, { id: Date.now() + 'a', role: 'assistant', parts: [{ type: 'text', text: 'Echo: ' + e.detail.value }], actions: ['copy'] }];
    chat.loading = false;
  }, 600);
});
chat.addEventListener('kai-model-change', (e) => { chat.currentModel = e.detail.modelId; log('modelchange', e.detail.modelId); });
chat.addEventListener('kai-message-action', (e) => log('messageaction', `${e.detail.action} · ${e.detail.messageId}`));
chat.addEventListener('kai-search', () => log('search', '(clicked)'));
chat.addEventListener('kai-voice', () => log('voice', '(clicked)'));

const list = document.getElementById('list');
list.conversations = [
  { id: 'c1', title: 'Web component architecture', scope: { type: 'document' }, messageCount: 12, lastMessageAt: '2026-06-11T10:00:00Z', updatedAt: '2026-06-11T10:00:00Z' },
  { id: 'c2', title: 'Theming & tokens', scope: { type: 'document' }, messageCount: 5, lastMessageAt: '2026-06-10T09:00:00Z', updatedAt: '2026-06-10T09:00:00Z' },
  { id: 'c3', title: 'Publishing pipeline', scope: { type: 'document' }, messageCount: 8, lastMessageAt: '2026-06-09T09:00:00Z', updatedAt: '2026-06-09T09:00:00Z' },
];
list.activeId = 'c1';
list.addEventListener('kai-conversation-select', (e) => { list.activeId = e.detail.id; log('conversationselect', e.detail.id); });
list.addEventListener('kai-new-chat', () => log('newchat'));

const pi = document.getElementById('pi');
// Entity-pill triggers: '/' opens skills, '@' opens agents/plugins. Picking an
// item drops an atomic pill into the draft; the chosen entities ride along on
// kai-value-change / kai-submit as event.detail.entities.
pi.triggers = [
  {
    char: '/',
    kind: 'skill',
    items: [
      { id: 'summarize', label: 'Summarize', description: 'Summarize the thread', promptText: 'Summarize the thread.' },
      { id: 'translate', label: 'Translate', description: 'Translate to English' },
      { id: 'rewrite', label: 'Rewrite', description: 'Rewrite for clarity' },
    ],
  },
  {
    char: '@',
    kind: 'agent',
    items: [
      { id: 'code-reviewer', label: 'Code Reviewer', group: 'Agents', description: 'Reviews diffs for bugs' },
      { id: 'researcher', label: 'Researcher', group: 'Agents', description: 'Deep multi-source research' },
      { id: 'documents', label: 'Documents', kind: 'plugin', group: 'Plugins', description: 'Create and edit documents' },
    ],
  },
];
pi.addEventListener('kai-value-change', (e) => {
  if (e.detail.entities?.length) log('entities', e.detail.entities.map((en) => en.id).join(', '));
});
pi.addEventListener('kai-submit', (e) => { log('submit', e.detail.value); pi.value = ''; });

// ── messages ──
// Reasoning, tools and attachments are PARTS now, ordered exactly as they render:
// the thinking, then the tool panel, then the answer, then the file.
document.getElementById('msg-a').message = {
  id: 'm-a', role: 'assistant',
  parts: [
    { type: 'reasoning', text: 'The user wants X, so I should do Y then Z.', label: 'Reasoning' },
    { type: 'tool', tool: { type: 'search', state: 'output-available', input: { query: 'kitn docs' }, output: { hits: 3 }, toolCallId: 'tc-1' } },
    { type: 'text', text: 'Here\'s the plan, with a quick code sample:\n```js\nconst kit = useKitn();\n```' },
    { type: 'file', attachment: attachments[0] },
  ],
  actions: ['copy', 'like', 'dislike', 'regenerate'],
};
document.getElementById('msg-a').addEventListener('kai-message-action', (e) => log('messageaction', e.detail.action));
document.getElementById('msg-u').message = { id: 'm-u', role: 'user', parts: [{ type: 'text', text: 'How do I compose these myself?' }] };
document.getElementById('md').content = '### Markdown\nRenders **bold**, _italic_, `code`, and lists:\n- one\n- two\n\n> and blockquotes.';
document.getElementById('code').code = 'export function add(a: number, b: number): number {\n  return a + b;\n}';
document.getElementById('reason').text = 'First I parse the request, then I plan the steps, then I execute and verify.';
document.getElementById('tool').tool = { type: 'database_query', state: 'output-available', input: { table: 'users', limit: 10 }, output: { rows: 10, ms: 42 } };
document.getElementById('cot').steps = [
  { label: 'Understand the request', content: 'The user wants a composable set.' },
  { label: 'Design the API', content: 'Route 1: variant + flags + events.' },
  { label: 'Build & verify' },
];

// ── attachments & media ──
document.getElementById('att-inline').items = attachments;
const attGrid = document.getElementById('att-grid');
attGrid.items = attachments;
attGrid.addEventListener('kai-remove', (e) => { attGrid.items = attGrid.items.filter((x) => x.id !== e.detail.id); log('remove', e.detail.id); });
document.getElementById('img').base64 = btoa(unescape(encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="16" fill="#7c3aed"/><text x="48" y="62" font-size="44" text-anchor="middle" fill="white">★</text></svg>')));
document.getElementById('img').setAttribute('media-type', 'image/svg+xml');
document.getElementById('srcs').sources = [
  { href: 'https://kitn.dev', title: 'kitn — the kit', description: 'Composable SolidJS + web-component chat UI.', showFavicon: true },
  { href: 'https://solidjs.com', title: 'SolidJS', description: 'A reactive UI library.', showFavicon: true },
];

// ── composer ──
const suggs = document.getElementById('suggs');
suggs.suggestions = ['Explain the architecture', 'Show me a code example', 'What\'s deferred?'];
suggs.addEventListener('kai-select', (e) => { pi.value = e.detail.value; log('select', e.detail.value); });
document.getElementById('fu').addEventListener('kai-files-added', (e) => log('filesadded', e.detail.files.map((f) => f.name).join(', ')));
const voice = document.getElementById('voice');
voice.transcribe = async () => { await new Promise((r) => setTimeout(r, 400)); return 'transcribed text'; };
voice.addEventListener('kai-transcription', (e) => log('transcription', e.detail.text));
document.getElementById('think').addEventListener('kai-stop', () => log('stop', 'thinking'));

// ── header & meta ──
const ms = document.getElementById('models');
ms.models = models; ms.currentModel = 'opus';
ms.addEventListener('kai-model-change', (e) => { ms.currentModel = e.detail.modelId; log('modelchange', e.detail.modelId); });
document.getElementById('ctx').context = ctx;
const scope = document.getElementById('scope');
scope.availableAuthors = ['Rob', 'Alex']; scope.availableTags = ['design', 'api'];
scope.addEventListener('kai-scope-change', (e) => log('scopechange', JSON.stringify(e.detail.filters ?? 'all')));
document.getElementById('cp').addEventListener('kai-select', () => log('select', 'checkpoint'));
document.getElementById('skills').skills = [{ id: 's1', name: 'web-search' }, { id: 's2', name: 'code' }];
const fb = document.getElementById('fb');
fb.addEventListener('helpful', () => log('feedback', 'helpful'));
fb.addEventListener('nothelpful', () => log('feedback', 'not helpful'));
fb.addEventListener('kai-close', () => log('feedback', 'closed'));

// ── status & motion ──
const stream = document.getElementById('stream');
const streamText = 'This text reveals with a typewriter animation, streamed character by character — exactly how you\'d render a live assistant reply.';
const runStream = () => { stream.text = streamText; };
runStream();
stream.addEventListener('kai-complete', () => log('complete', 'stream'));
document.getElementById('replay').addEventListener('click', () => { stream.text = ''; requestAnimationFrame(runStream); });

// ── theme toggle (OS-aware on first paint; explicit override on click) ──
let dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.getElementById('theme').addEventListener('click', () => {
  dark = !dark;
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  for (const el of document.querySelectorAll('*')) {
    if (el.tagName.startsWith('KC-')) el.setAttribute('theme', dark ? 'dark' : 'light');
  }
  log('theme', dark ? 'dark' : 'light');
});

// ── scroll-spy for the sidebar index ──
const links = [...document.querySelectorAll('.toc a')];
const byId = Object.fromEntries(links.map((a) => [a.getAttribute('href').slice(1), a]));
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      links.forEach((l) => l.classList.remove('active'));
      byId[e.target.id]?.classList.add('active');
    }
  }
}, { rootMargin: '-20% 0px -70% 0px' });
document.querySelectorAll('main section').forEach((s) => spy.observe(s));
