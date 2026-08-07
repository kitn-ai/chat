import { useCallback, useRef } from 'react';
import { PromptInput } from '@kitn.ai/ui/react';
import type { Theme } from '../App';

interface ComposerProps {
  theme: Theme;
  loading: boolean;
  suggestions: string[];
  onSubmit: (value: string) => void;
}

/**
 * The bottom composer. Stays UNCONTROLLED: assigning a plain string `value`
 * flips `<kai-prompt-input>` into controlled mode and collapses its shadow-DOM
 * selection, so clear-on-submit goes through the element's `clear()` method.
 */
export function Composer({ theme, loading, suggestions, onSubmit }: ComposerProps) {
  const promptRef = useRef<HTMLElement>(null);

  const handleSubmit = useCallback(
    (value: string) => {
      (promptRef.current as (HTMLElement & { clear?: () => void }) | null)?.clear?.();
      onSubmit(value);
    },
    [onSubmit],
  );

  return (
    <div className="composer">
      <PromptInput
        ref={promptRef}
        theme={theme}
        placeholder="Ask the real model something…"
        loading={loading}
        suggestions={suggestions}
        onSubmit={(e) => handleSubmit(e.detail.value)}
        onSuggestionClick={(e) => onSubmit(e.detail.value)}
      />
    </div>
  );
}
