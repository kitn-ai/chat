import { mount } from 'svelte';
import '@kitn.ai/ui/elements'; // registers the kai-* custom elements (async)
import '@kitn.ai/ui/theme.tokens.css'; // plain --color-* tokens for the shell (NOT the tailwind source)
import './index.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Root element not found');

// The kai-* elements register asynchronously. Wait until the tags we use are
// defined before mounting, so Svelte's `bind:this` + `$effect` property writes land
// on UPGRADED elements. Raw web-component consumers have no upgrade-race guard
// (unlike the React wrappers), so a property set before upgrade is lost and static
// seed data never re-applies. Attributes survive upgrade; array/object properties do not.
const TAGS = ['kai-resizable', 'kai-resizable-item', 'kai-conversations', 'kai-thread', 'kai-prompt-input', 'kai-button'];
Promise.all(TAGS.map((t) => customElements.whenDefined(t))).then(() => {
  mount(App, { target });
});
