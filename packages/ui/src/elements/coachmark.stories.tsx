import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onCleanup, onSettled } from 'solid-js';
import type { JSX } from '@solidjs/web';
import './coachmark';

// Labs: the anchored onboarding hint. The coachmark WRAPS a trigger (the default
// slot) and points a primary-colored bubble at it with an arrow. The developer
// owns when it shows (`default-open` here) and records the dismiss so it won't
// show again.

declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-coachmark': JSX.HTMLAttributes<HTMLElement> & {
        open?: boolean;
        'default-open'?: boolean;
        headline?: string;
        badge?: string;
        placement?: string;
      };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/Coachmark',
};
export default meta;

const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

export const PointingAtAButton: StoryObj = {
  render: () => (
    <div
      style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        height: '320px',
        width: '100%',
        background: 'var(--color-background)',
      }}
    >
      <kai-coachmark
        default-open
        headline="Cowork has a new home"
        badge="New"
        ref={(el: HTMLElement) =>
          onSettled(() => {
            const onDismiss = () => console.log('kai-dismiss: coachmark seen');
            el.addEventListener('kai-dismiss', onDismiss);
            // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return () => el.removeEventListener('kai-dismiss', onDismiss);
          })
        }
      >
        <button
          type="button"
          style={{
            display: 'inline-flex',
            'align-items': 'center',
            gap: '0.5rem',
            height: '2.25rem',
            padding: '0 0.875rem',
            'border-radius': '0.5rem',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
            'font-size': '0.875rem',
            'font-weight': '500',
            background: 'var(--color-card)',
            color: 'var(--color-foreground)',
          }}
        >
          Cowork
        </button>
        <span slot="content">Chat with Claude here, or switch to Cowork to build alongside it.</span>
      </kai-coachmark>
    </div>
  ),
  parameters: src(`<!-- The coachmark wraps the trigger (default slot) and points a bubble at it.
     headline + badge are scalar attributes; the body is the content slot. -->
<kai-coachmark default-open headline="Cowork has a new home" badge="New">
  <button type="button">Cowork</button>
  <span slot="content">Chat with Claude here, or switch to Cowork to build alongside it.</span>
</kai-coachmark>

<script type="module">
  // Record the dismiss so the hint won't show again.
  document.querySelector('kai-coachmark')
    .addEventListener('kai-dismiss', () => localStorage.setItem('cowork-hint', 'seen'));
</script>`),
};
