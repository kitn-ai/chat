import { describe, it, expect } from 'vitest';
import * as state from './index';

describe('@kitn.ai/ui/state barrel', () => {
  it('re-exports the full surface', () => {
    for (const name of [
      'appendMessage', 'upsertMessage', 'updateMessage', 'removeMessage', 'appendText',
      'textMessage', 'partsToText',
      'addSuggestion', 'removeSuggestion', 'createAssistantStream', 'onStreamSettled',
      'appendTextPart', 'appendReasoningPart', 'upsertToolPart', 'upsertCardPart', 'fingerprint',
    ]) {
      expect(typeof (state as Record<string, unknown>)[name]).toBe('function');
    }
  });
});
