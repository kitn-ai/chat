import { createApp } from 'vue';
import '@kitn.ai/ui/elements'; // registers the kai-* custom elements (async)
import '@kitn.ai/ui/theme.tokens.css'; // plain --color-* tokens for the shell (NOT the tailwind source)
import './index.css';
import App from './App.vue';

const root = document.getElementById('app');
if (!root) throw new Error('Root element not found');

// The kai-* elements register asynchronously. Wait until the tags we use are
// defined before mounting, so Vue's `:prop.prop` bindings land on UPGRADED
// elements. Raw web-component consumers have no upgrade-race guard (unlike the
// React wrappers), so a property set before upgrade is lost and static seed data
// never re-applies. Attributes survive upgrade; array/object properties do not.
const TAGS = ['kai-resizable', 'kai-resizable-item', 'kai-conversations', 'kai-thread', 'kai-prompt-input', 'kai-button'];
Promise.all(TAGS.map((t) => customElements.whenDefined(t))).then(() => {
  createApp(App).mount(root);
});
