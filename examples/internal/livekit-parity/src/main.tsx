// Register <kai-audio-visualizer> (and the rest of the kai-* catalog) from
// this worktree's BUILT dist -- the same compiled bundle a consumer gets.
// Rebuild with `pnpm exec nx build ui` at the repo root to pick up kit changes.
import '@kit-dist/elements/audio-visualizer.js';
import './index.css';
import { createRoot } from 'react-dom/client';
import App from './App';

// No StrictMode on purpose: its dev-mode double-mount would churn every
// AudioContext/analyser twice per change, and this page is an instrument.
createRoot(document.getElementById('root')!).render(<App />);
