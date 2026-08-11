import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { VoiceOutput } from './voice-output';
import { componentDescription } from '../stories/docs/element-controls';

/**
 * Story for `VoiceOutput`: a read-aloud button. By default it speaks `text` via
 * the browser's `speechSynthesis`; set `onSynthesize` to route through a TTS model
 * instead (it returns an audio Blob, which plays through an `<audio>`). Click to
 * start, click again to stop; the icon swaps speaker -> stop and shows a spinner
 * while a model synthesis is in flight.
 */
const meta = {
  title: 'Components/Elements/VoiceOutput',
  component: VoiceOutput,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A read-aloud button. By default it speaks `text` through the browser `speechSynthesis` API; the button is inert when neither native synthesis nor a model seam is available.',
        'Set `onSynthesize` to bypass the native path and run your own TTS model: given the text, return an audio `Blob` and it plays that instead. `disabled` forces the inert state.',
      ]),
    },
  },
  argTypes: {
    text: { control: 'text', description: 'The utterance to read aloud.' },
    disabled: { control: 'boolean', description: 'Force the inert state.' },
  },
  args: {
    text: 'The quick brown fox jumps over the lazy dog.',
    disabled: false,
  },
  render: (args) => <VoiceOutput {...args} />,
} satisfies Meta<typeof VoiceOutput>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { VoiceOutput } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

const SAMPLE = 'The quick brown fox jumps over the lazy dog.';

/** Native path: reads `text` aloud via the browser's speechSynthesis. */
export const Native: Story = {
  args: { text: SAMPLE },
  ...src(`<VoiceOutput text="The quick brown fox jumps over the lazy dog." />`),
};

/** Disabled: the button is inert and cannot start playback. */
export const Disabled: Story = {
  args: { text: SAMPLE, disabled: true },
  ...src(`<VoiceOutput text="The quick brown fox jumps over the lazy dog." disabled />`),
};

// Model seam demo: onSynthesize returns a tiny silent WAV so playback resolves
// without a real TTS call. In production return audio from your TTS model.
function silentWav(): Blob {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
    0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
  ]);
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Model seam: `onSynthesize` bypasses native synthesis and plays the Blob it
 *  returns. Here it resolves a silent WAV; in production fetch your TTS model. */
export const ModelSeam: Story = {
  render: () => (
    <div class="flex items-center gap-3">
      <VoiceOutput text={SAMPLE} onSynthesize={async () => silentWav()} />
      <span class="text-sm text-muted-foreground">Routes through onSynthesize (TTS model seam)</span>
    </div>
  ),
  ...src(`<VoiceOutput
  text="The quick brown fox jumps over the lazy dog."
  onSynthesize={async (text) => {
    const res = await fetch('/api/tts', { method: 'POST', body: text });
    return res.blob(); // an audio Blob
  }}
/>`),
};
