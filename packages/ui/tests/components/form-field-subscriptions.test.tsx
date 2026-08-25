/**
 * K-D12b — a widget prop must subscribe to the ONE thing it reads.
 *
 * `FieldRow`'s `common()` was an object FACTORY: it read `props.value()`
 * alongside `invalid`, `disabled`, `placeholder` and the rest, and the whole
 * object was spread into the widget. Reading any single prop therefore
 * subscribed the reader to `value` as well, so every keystroke re-ran every
 * widget-prop reader in the row. That is what turned K-D12a (the `<input>`
 * rebuilt when its class expression re-runs) from "on a validity change" into
 * "on every character", which is how it reached an owner typing a change
 * ticket into `kai-form`.
 *
 * Two assertions, from both ends:
 *   1. the subscription pin — an effect reading only `invalid` does not re-run
 *      when `value` changes, and the `value` accessor is never even called;
 *   2. the consequence — typing into a real `<kai-form>` text field keeps the
 *      `<input>` node, its focus and its value.
 *
 * NOT VACUOUS: (1) is paired with a case where `error` really does change, so
 * the effect is proven to be able to re-run at all; (2) asserts the typed text
 * arrives, so "the node never changed" cannot pass on a form that rendered
 * nothing.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createRoot, createSignal, createEffect, flush as flushSync } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { Form, fieldCommon, type FormDefinition } from '../../src/components/form';

afterEach(cleanup);

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('FieldRow widget props subscribe narrowly (K-D12b)', () => {
  it('reading `invalid` does not subscribe to `value`', async () => {
    const [value, setValue] = createSignal<unknown>('');
    const [error, setError] = createSignal<string | undefined>(undefined);
    const readValue = vi.fn(() => value());

    const seen: boolean[] = [];
    let common!: ReturnType<typeof fieldCommon>;
    const dispose = createRoot((d) => {
      common = fieldCommon({
        fieldKey: 'ticket',
        field: { type: 'string' },
        required: true,
        inlineMax: 4,
        value: readValue,
        error,
        disabled: false,
        onInput: () => {},
        onBlur: () => {},
      }, 'f-ticket', () => undefined, () => 'Ticket');

      // V2-PORT: two-argument effect; the tracked read is the compute, the push
      // the apply — the subscription set under test is unchanged.
      createEffect(() => common.invalid, (v) => { seen.push(v); });
      return d;
    });

    await flush();
    expect(seen).toEqual([false]);
    expect(readValue).not.toHaveBeenCalled();

    // A keystroke: `value` moves, `error` does not.
    setValue('C');
    flushSync(); // V2-FLUSH: commit the staged write
    setValue('CH');
    flushSync(); // V2-FLUSH: commit the staged write
    await flush();
    expect(seen).toEqual([false]);
    expect(readValue).not.toHaveBeenCalled();

    // The harness CAN see a change — so the two lines above mean something.
    setError('Must match CHG-0000');
    flushSync(); // V2-FLUSH: commit the staged write
    await flush();
    expect(seen).toEqual([false, true]);

    // And `value` is still reachable through the same object, lazily.
    expect(common_value(common)).toBe('CH');
    expect(readValue).toHaveBeenCalled();

    dispose();
  });

  it('typing into a kai-form text field keeps the input node and its focus', async () => {
    const data: FormDefinition = {
      type: 'object',
      required: ['ticket'],
      properties: {
        ticket: { type: 'string', title: 'Change ticket', pattern: '^CHG-[0-9]{4}$' },
      },
    };
    const { container } = render(() => <Form data={data} cardId="c1" heading="Parameters" />);

    const input = container.querySelector('input[data-control]') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    for (const ch of 'CHG-4821') {
      input.value = input.value + ch;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
      expect(container.querySelector('input[data-control]')).toBe(input);
      expect(document.activeElement).toBe(input);
    }

    expect(input.value).toBe('CHG-4821');
  });
});

// Read `.value` through a helper so the getter access is unmistakably lazy and
// happens only where the test intends it to.
function common_value(common: { value: unknown }): unknown {
  return common.value;
}
