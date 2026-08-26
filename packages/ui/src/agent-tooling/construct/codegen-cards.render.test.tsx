/**
 * CD-1 (Task 19g) — the render-level proof that a model's card tool-call
 * arguments actually reach the RENDERED form's default values, not just the
 * emitted source string. codegen.test.ts is Node-only (.ts, no JSX runtime),
 * so this one sibling file carries the jsdom half: it calls the exported
 * `mergeToolArgsIntoFormDefaults` pure function directly (same contract the
 * emitted App.tsx uses, minus code-generation + eval) and mounts the kit's
 * own `BUILTIN_CARD_COMPONENTS.form` renderer with the merged data.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen } from '@solidjs/testing-library';
import { BUILTIN_CARD_COMPONENTS } from '../../primitives/card-registry';
import type { FormDefinition } from '../../primitives/card-data-types';
import { mergeToolArgsIntoFormDefaults } from './codegen';

afterEach(cleanup);

describe('CD-1: model-proposed args reach the rendered form (jsdom)', () => {
  it('a model-proposed amount pre-fills the rendered form field default', () => {
    const declared: FormDefinition = {
      type: 'object',
      properties: {
        amount: { type: 'number', title: 'Amount' },
        reason: { type: 'string', title: 'Reason' },
      },
    };
    const merged = mergeToolArgsIntoFormDefaults(declared, { amount: 50 });
    const FormComponent = BUILTIN_CARD_COMPONENTS.form;
    render(() => (
      <FormComponent envelope={{ type: 'refund_approval', id: 'call_1', data: merged }} host={undefined} />
    ));
    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amountInput.value).toBe('50');
  });

  it('an arg whose key matches no declared field is ignored — not rendered, does not crash', () => {
    const declared: FormDefinition = {
      type: 'object',
      properties: {
        amount: { type: 'number', title: 'Amount' },
      },
    };
    const merged = mergeToolArgsIntoFormDefaults(declared, { amount: 50, bogus_field: 'nope' });
    expect('bogus_field' in (merged.properties as Record<string, unknown>)).toBe(false);
    const FormComponent = BUILTIN_CARD_COMPONENTS.form;
    render(() => (
      <FormComponent envelope={{ type: 'refund_approval', id: 'call_1', data: merged }} host={undefined} />
    ));
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.queryByText(/bogus_field/i)).not.toBeInTheDocument();
  });

  it('a model arg overrides an explicit static FormField.default — the model is proposing a fresh value', () => {
    const declared: FormDefinition = {
      type: 'object',
      properties: {
        amount: { type: 'number', title: 'Amount', default: 10 },
      },
    };
    const merged = mergeToolArgsIntoFormDefaults(declared, { amount: 75 });
    const FormComponent = BUILTIN_CARD_COMPONENTS.form;
    render(() => (
      <FormComponent envelope={{ type: 'refund_approval', id: 'call_1', data: merged }} host={undefined} />
    ));
    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amountInput.value).toBe('75');
  });
});
