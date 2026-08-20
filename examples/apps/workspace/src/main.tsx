import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

/**
 * Every kai-* element defaults to `theme="auto"` and resolves dark mode from
 * `prefers-color-scheme` on its own, inside its shadow root. The app chrome
 * around them cannot see that, so it would stay light while the thread went
 * dark. theme.tokens.css ships its dark values under a `.dark` class; putting
 * that class on <html> in response to the same media query is what keeps the
 * two halves in step.
 */
function syncColorScheme(): void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => document.documentElement.classList.toggle('dark', query.matches);
  apply();
  query.addEventListener('change', apply);
}

syncColorScheme();

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
