import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Block } from './block';

declare global {
  interface Window {
    __blockReady?: boolean;
  }
}

// The driver waits on the block driver's readiness convention. React has no
// boot() of its own to await (the hook fires it in an effect), so "ready" here
// is "mounted, and one frame has passed".
function Host() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      window.__blockReady = true;
      setReady(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  void ready;
  return <Block />;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Host />
  </StrictMode>,
);
