import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, onCleanup, onSettled } from 'solid-js';
import type { JSX } from '@solidjs/web';
import './screen';

// Labs: the full-bleed overlay destination. The developer owns the swap: a
// trigger button and the screen's `kai-back` event both flip one boolean. Here
// that boolean drives the `open` attribute over a mock workspace area; the screen
// fills whatever it is mounted in (this positioned region), inerts the rest, and
// returns focus on close.

declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-screen': JSX.HTMLAttributes<HTMLElement> & { open?: boolean; headline?: string; back?: boolean };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/Screen',
};
export default meta;

// Hand-written HTML for the "Show code" panel (real consumer markup, not JSX).
const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

export const Overlay: StoryObj = {
  render: () => {
    const [open, setOpen] = createSignal(false);
    return (
      <div
        style={{
          position: 'relative',
          height: '420px',
          width: '100%',
          overflow: 'hidden',
          'border-radius': '0.75rem',
          border: '1px solid var(--color-border)',
          background: 'var(--color-background)',
        }}
      >
        {/* The mock workspace area the screen takes over. */}
        <div style={{ display: 'flex', height: '100%', color: 'var(--color-foreground)' }}>
          <aside
            style={{
              width: '220px',
              'border-right': '1px solid var(--color-border)',
              padding: '1rem',
              background: 'var(--color-card)',
            }}
          >
            <div style={{ 'font-weight': '600', 'margin-bottom': '0.75rem' }}>Workspace</div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              style={{
                display: 'inline-flex',
                'align-items': 'center',
                gap: '0.5rem',
                height: '2.25rem',
                padding: '0 0.875rem',
                'border-radius': '0.5rem',
                border: 'none',
                cursor: 'pointer',
                'font-size': '0.875rem',
                'font-weight': '500',
                background: 'var(--color-primary)',
                color: 'var(--color-primary-foreground)',
              }}
            >
              Open Design
            </button>
          </aside>
          <main style={{ flex: '1', padding: '1.5rem' }}>
            <p style={{ color: 'var(--color-muted-foreground)' }}>The main region. The Design screen pushes over all of this.</p>
          </main>
        </div>

        {/* The overlay destination. The consumer owns the swap: the trigger sets
            open=true; the back button / Escape fire kai-back, which sets it false. */}
        <kai-screen
          open={open()}
          headline="Design"
          ref={(el: HTMLElement) =>
            onSettled(() => {
              const onBack = () => setOpen(false);
              const onChange = (e: Event) => setOpen((e as CustomEvent<{ open: boolean }>).detail.open);
              el.addEventListener('kai-back', onBack);
              el.addEventListener('kai-open-change', onChange);
              // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return () => {
                el.removeEventListener('kai-back', onBack);
                el.removeEventListener('kai-open-change', onChange);
              };
            })
          }
        >
          <div style={{ padding: '1.5rem', color: 'var(--color-foreground)' }}>
            <h3 style={{ margin: '0 0 0.5rem', 'font-size': '1rem', 'font-weight': '600' }}>Design surface</h3>
            <p style={{ color: 'var(--color-muted-foreground)' }}>
              Your own full-bleed surface lives here. Press Back or Escape to return.
            </p>
          </div>
        </kai-screen>
      </div>
    );
  },
  parameters: src(`<button id="open">Open Design</button>

<!-- A full-bleed overlay that takes over its mount point under a back-header.
     Mount at the app root for a full takeover, or in a positioned region for a
     scoped one. -->
<kai-screen headline="Design">
  <div>
    <h3>Design surface</h3>
    <p>Your own full-bleed surface lives here. Press Back or Escape to return.</p>
  </div>
</kai-screen>

<script type="module">
  const screen = document.querySelector('kai-screen');
  // The developer owns the swap: the trigger opens, kai-back (Back / Escape) closes.
  document.querySelector('#open').addEventListener('click', () => { screen.open = true; });
  screen.addEventListener('kai-back', () => { screen.open = false; });
  screen.addEventListener('kai-open-change', (e) => console.log(e.detail.open));
</script>`),
};
