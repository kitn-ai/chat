import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@kitn.ai/ui/elements'; // register the kai-* custom elements
import '@kitn.ai/ui/theme.tokens.css'; // plain --color-* tokens for the shell
import './index.css';
import { registerSpikeCards } from './cards';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// This app's OWN card element, before React mounts: <kai-thread> creates one the
// moment a `weather` card part arrives, and an element that is not defined yet
// upgrades with no `data` setter, so the envelope would land as an expando and
// the card would render empty.
registerSpikeCards();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
