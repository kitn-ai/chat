import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { JSX } from '@solidjs/web';
import './voice-output';

// Declare the custom element tag for SolidJS JSX (matches the menu/prompt-input stories).
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-voice-output': JSX.HTMLAttributes<HTMLElement> & {
        text?: string;
        autoplay?: boolean;
        disabled?: boolean;
        theme?: string;
      };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/Voice output',
};
export default meta;

// Hand-written HTML for the "Show code" panel (real consumer markup, not JSX).
const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

const SAMPLE = 'The quick brown fox jumps over the lazy dog.';

export const Native: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', 'align-items': 'center', padding: '1rem' }}>
      <kai-voice-output text={SAMPLE}></kai-voice-output>
      <span style={{ color: 'var(--color-muted-foreground)', 'font-size': '0.875rem' }}>
        Click to read aloud (browser speechSynthesis)
      </span>
    </div>
  ),
  parameters: src(`<!-- Native: reads text aloud via the browser's speechSynthesis. -->
<kai-voice-output text="The quick brown fox jumps over the lazy dog."></kai-voice-output>`),
};

export const Disabled: StoryObj = {
  render: () => (
    <div style={{ padding: '1rem' }}>
      <kai-voice-output text={SAMPLE} disabled></kai-voice-output>
    </div>
  ),
  parameters: src(`<kai-voice-output text="The quick brown fox jumps over the lazy dog." disabled></kai-voice-output>`),
};

// Model seam: set the `synthesize` JS property (a function, never an attribute).
// This demo returns a tiny silent WAV so playback resolves without a real TTS call.
function silentWav(): Blob {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
    0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
  ]);
  return new Blob([bytes], { type: 'audio/wav' });
}

export const ModelSeam: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', 'align-items': 'center', padding: '1rem' }}>
      <kai-voice-output
        text={SAMPLE}
        ref={(el: HTMLElement) => {
          (el as HTMLElement & { synthesize?: (text: string) => Promise<Blob> }).synthesize =
            async () => silentWav();
        }}
      ></kai-voice-output>
      <span style={{ color: 'var(--color-muted-foreground)', 'font-size': '0.875rem' }}>
        Routes through el.synthesize (TTS model seam)
      </span>
    </div>
  ),
  parameters: src(`<kai-voice-output text="The quick brown fox jumps over the lazy dog."></kai-voice-output>

<script type="module">
  // synthesize is a function-valued property, never an attribute. When set, the
  // native speechSynthesis path is bypassed and audio comes from your TTS model.
  document.querySelector('kai-voice-output').synthesize = async (text) => {
    const res = await fetch('/api/tts', { method: 'POST', body: text });
    return res.blob(); // an audio Blob
  };
</script>`),
};
