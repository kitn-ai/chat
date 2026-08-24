import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Registers every <kai-*> element. Must come before anything renders one.
import '@kitn.ai/ui/elements';
/**
 * `<kai-remote>` is OPT-IN and register-all above does NOT include it. The React
 * `Remote` wrapper does lazily import this same module — but lazily is too late,
 * and the failure is silent: React creates an un-upgraded element, sets `src` /
 * `provider-origin` / `envelope` on it as own properties, and when the definition
 * finally lands the facade's own declared props shadow them. The element then
 * mounts having seen an EMPTY provider origin and renders "Invalid
 * provider-origin """ instead of the board — while `el.providerOrigin` still
 * reads back correctly from the console, which is what makes it so confusing.
 * That is the `upgrade-race` invariant. A STATIC import here is the fix: the tag
 * is defined before React renders anything, so props are set on a live element.
 */
import '@kitn.ai/ui/elements/remote';
// Compiled token defaults. `theme.css` is the Tailwind-source variant and is not
// what a plain Vite app wants.
import '@kitn.ai/ui/theme.tokens.css';
import { configureToasts } from '@kitn.ai/ui/elements';
import App from './App';
import './styles.css';

// One region, stacked, so a burst of approvals does not paper over the console.
configureToasts({ stack: 'collapsed', position: 'bottom-right', max: 4 });

const host = document.getElementById('root');
if (!host) throw new Error('index.html is missing #root');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
