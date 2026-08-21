// Registers every <kai-*> element. MUST come first: a property set on an
// element that has not upgraded is silently lost, with no error logged.
import '@kitn.ai/ui/elements';
// This app's own generative-UI card, registered the same way and just as early.
import './page-version-card';

import '@kitn.ai/ui/theme.tokens.css';
import './app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

// The kit's elements follow `theme="auto"`; the host page chrome is themed by
// the token stylesheet, whose dark scope is a `.dark` class. This keeps the two
// in step instead of leaving a light shell around dark elements.
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches);
applyTheme();
dark.addEventListener('change', applyTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
