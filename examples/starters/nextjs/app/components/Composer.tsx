import { useCallback, useRef } from 'react';
import { PromptInput, useVoiceInput } from '@kitn.ai/ui/react';
import type { PromptInputProps } from '@kitn.ai/ui/react';
import type { KaiPromptInputElement } from '@kitn.ai/ui/elements';
import type { Theme } from '../theme';

interface ComposerProps {
  theme: Theme;
  loading: boolean;
  suggestions: string[];
  triggers: PromptInputProps['triggers'];
  onSubmit: (value: string) => void;
  onSuggestionClick: (value: string) => void;
}

/**
 * The bottom composer. Wraps `<kai-prompt-input>` and owns the input-DOM concerns:
 * the element ref, a live text mirror, clear-on-submit, and seeding voice.
 *
 * The prompt input stays UNCONTROLLED so the `/`+`@` trigger menus keep a live
 * caret. Assigning a plain STRING `value` flips the element into controlled mode,
 * which re-applies the property and collapses the shadow-DOM selection — that
 * disables the caret-anchored menu. So we NEVER push a string: clear-on-submit
 * goes through the element's `clear()` method, and voice seeds a ComposerDoc (a
 * non-string value is a one-time seed that leaves the input uncontrolled). We keep
 * the live text mirrored into `textRef` (from `onValueChange`) so voice can append.
 *
 * SERVER-RENDERING NOTE. `useVoiceInput` reports `supported: false` on the server
 * (there is no `window.SpeechRecognition` there) and true in Chromium, so that
 * flag is read ONLY inside the click handler and never during render. Branching
 * render output on it would put a different tree in the prerendered HTML than the
 * client builds on hydration, which is the textbook hydration mismatch — and one
 * `next build` would minify into a numbered React error rather than explain.
 */
export function Composer({ theme, loading, suggestions, triggers, onSubmit, onSuggestionClick }: ComposerProps) {
  // Ref to the underlying <kai-prompt-input> element for the imperative pushes
  // (clear() on submit, ComposerDoc seed from voice); textRef mirrors the live text.
  const promptRef = useRef<KaiPromptInputElement>(null);
  const textRef = useRef('');

  const { supported: voiceSupported, start: startVoice } = useVoiceInput((transcript) => {
    const next = (textRef.current ? textRef.current + ' ' : '') + transcript;
    textRef.current = next;
    const el = promptRef.current;
    if (el) el.value = [{ type: 'text', text: next }];
  });

  const handleVoice = useCallback(() => {
    // Mic is Chromium-only; degrade gracefully everywhere else.
    if (!voiceSupported) {
      alert('Voice input needs a Chromium browser.');
      return;
    }
    startVoice();
  }, [voiceSupported, startVoice]);

  const handleSubmit = useCallback(
    (value: string) => {
      // Clear our own uncontrolled input first — reset the mirror + call the
      // element's clear() method (uncontrolled-safe; never a string assignment) —
      // then hand the text up. The workspace owns append + streaming.
      textRef.current = '';
      promptRef.current?.clear();
      onSubmit(value);
    },
    [onSubmit],
  );

  return (
    <div className="composer">
      <PromptInput
        ref={promptRef}
        theme={theme}
        placeholder="Message the demo…"
        loading={loading}
        suggestions={suggestions}
        triggers={triggers}
        voice
        onVoice={handleVoice}
        onValueChange={(e) => { textRef.current = e.detail.value; }}
        onSubmit={(e) => handleSubmit(e.detail.value)}
        onSuggestionClick={(e) => onSuggestionClick(e.detail.value)}
      />
      <p className="composer-hint">
        Type <kbd>/</kbd> for skills · <kbd>@</kbd> for agents
      </p>
    </div>
  );
}
