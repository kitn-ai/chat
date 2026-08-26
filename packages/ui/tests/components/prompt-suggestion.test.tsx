// tests/components/prompt-suggestion.test.tsx
//
// Matched-substring highlight is CONTENT, not a control — used to carry
// `text-primary`, the BRAND token. Cheap jsdom pin on the class list only; the
// real computed-color proof lives in tests/e2e/content-brand-bleed.spec.ts.
import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import { PromptSuggestion } from '../../src/components/prompt-suggestion';

describe('PromptSuggestion highlight token', () => {
  it('never emits text-primary on the matched substring; uses text-foreground', () => {
    const { container } = render(() => (
      <PromptSuggestion highlight="lang">SolidJS is a reactive language.</PromptSuggestion>
    ));
    const matched = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === 'lang');
    expect(matched).toBeTruthy();
    const classes = (matched!.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).not.toContain('text-primary');
    expect(classes).toContain('text-foreground');
  });
});
