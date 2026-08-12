import '@kitn.ai/ui/elements'; // registers the kai-* custom elements (async)
import '@kitn.ai/ui/theme.tokens.css'; // plain --color-* tokens for the shell
import './index.css';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import { createStore } from './state';
import { createView } from './view';
import { mockResponse, newId } from './chat-data';

const root = document.getElementById('app');
if (!root) throw new Error('Root element #app not found');

// The kai-* elements register ASYNCHRONOUSLY (gotcha 1: the upgrade race). Array/
// object properties set on an element BEFORE it upgrades are lost, and raw
// web-component consumers have no upgrade-race guard (unlike the React wrappers).
// So we wait until every tag we use is defined before building the view — every
// element createView() creates is then already upgraded and our property sets land.
const TAGS = ['kai-resizable', 'kai-resizable-item', 'kai-conversations', 'kai-thread', 'kai-prompt-input', 'kai-button'];

async function boot(host: HTMLElement): Promise<void> {
  await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));

  const store = createStore();

  // Append the user turn, then stream the (mock) assistant reply.
  async function send(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text) return;
    store.append({ id: newId(), role: 'user', parts: [{ type: 'text', text }] });
    const stream = store.streamAssistant();
    // NO BACKEND AND NO PROVIDER. mockResponse() yields canned SSE frames that go
    // through the SAME reader a real model's response would, so this preview
    // exercises the real path. To go live, only this one expression changes —
    // `mockResponse(text)` becomes a POST to your route, with
    // toOpenAIMessages(store.state.messages) as the body. The line below stays.
    await readOpenAIStream(mockResponse(text), stream);
    stream.done();
  }

  const view = createView(host, {
    onConversationSelect: (id) => store.selectConversation(id),
    onNewChat: () => store.newChat(),
    onToggleSidebar: () => store.toggleCollapsed(),
    onShowSidebar: () => store.setCollapsed(false),
    onToggleTheme: () => store.toggleTheme(),
    onSubmit: (value) => void send(value),
    onSuggestion: (value) => void send(value),
  });

  store.subscribe(() => view.render(store.state));
  view.render(store.state);
}

void boot(root);
