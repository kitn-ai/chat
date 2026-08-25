/**
 * The model-facing half of masked form fields (spec §7.3): a form card's fields carry
 * `x-kai-format` / `x-kai-mask` / `x-kai-mask-guide`, kai-form resolves them to the
 * `Input` masking surface, states the expected format in TEXT through the row's EXISTING
 * `aria-describedby` channel (§6 — no third channel), and submits the canonical value
 * (§4 — exactly one value per field).
 *
 * Everything here is model-supplied and therefore untrusted: a hint that is not one of
 * the four tokens, or a pattern the engine refuses, degrades to a plain unmasked text
 * field with a console.warn. Never a throw in a render path, and never a rejected card —
 * a bad hint on one field must not take the other fields down with it.
 *
 * NOT VACUOUS: every fallback case asserts the field still WORKS unmasked (the typed
 * text arrives) as well as that the warning fired, so "rendered nothing" cannot pass.
 *
 * WHAT THIS FILE CANNOT PROVE: caret placement, `beforeinput` cancelation in a real
 * engine, and composition. Those are browser facts, covered by the task-6 Chromium
 * probes; the masker's jsdom contract is `tests/primitives/input-mask.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { Form, resolveFieldMask, type FormDefinition, type FormField } from '../../src/components/form';
import type { FieldSemanticType } from '../../src/primitives/field-semantics';
import { FIELD_SEMANTIC_TYPES } from '../../src/primitives/field-semantics';

// ─────────────────────────────────────────────────────────────────────────────
// THE REGISTERED COPY (compile-time, checked by `nx typecheck ui`).
//
// `FormField['x-kai-format']` spells the four tokens out instead of importing
// `FieldSemanticType`, because `card-data-types.ts` must stay compilable from a
// Node/no-DOM project and `field-semantics.ts` reaches `console` — see the comment at
// the declaration. These two assignments are the guard on that copy: mutual
// assignability holds only if the unions are IDENTICAL, so a fifth semantic token
// reddens tsc here instead of quietly being unnameable on a form card.
//
// Assigned to exported-ish consts rather than left bare so `noUnusedLocals` cannot
// delete the check by deleting the variables.
// ─────────────────────────────────────────────────────────────────────────────
const _fieldTokenIsSemanticType: FieldSemanticType[] = [] as NonNullable<FormField['x-kai-format']>[];
const _semanticTypeIsFieldToken: NonNullable<FormField['x-kai-format']>[] = [] as FieldSemanticType[];
void _fieldTokenIsSemanticType;
void _semanticTypeIsFieldToken;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Type into a masked field the way a browser does: `beforeinput` per character,
 *  which the masker cancels and services itself. */
function type(el: HTMLInputElement, text: string): void {
  for (const ch of text) {
    el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ch, cancelable: true, bubbles: true }));
  }
}

/** Type into an UNMASKED field: no masker is listening, so the browser half is ours. */
function typePlain(el: HTMLInputElement, text: string): void {
  el.value += text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function mount(def: FormDefinition): {
  input: HTMLInputElement;
  container: HTMLElement;
  values: () => Record<string, unknown>;
} {
  let latest: Record<string, unknown> = {};
  const { container } = render(() => (
    <Form data={def} cardId="c1" onValuesChange={(p) => (latest = p.values)} />
  ));
  const input = container.querySelector('input[data-control]') as HTMLInputElement;
  return { input, container, values: () => latest };
}

describe('x-kai-format on a form field', () => {
  it('masks as you type and submits the CANONICAL value (digits for `tel`)', async () => {
    const { input, values } = mount({
      type: 'object',
      properties: { phone: { type: 'string', title: 'Phone', 'x-kai-format': 'tel' } },
    });

    // Tier 1 came along with it, off the same enum.
    expect(input).toHaveAttribute('inputmode', 'tel');
    expect(input).toHaveAttribute('autocomplete', 'tel');

    type(input, '5550101234');
    await flush();

    // What the user SEES is formatted...
    expect(input.value).toBe('555-010-1234');
    // ...and what the form carries is the one canonical value (spec §4). Not both.
    expect(values()).toEqual({ phone: '5550101234' });
  });

  it('submits the FORMATTED value for `custom`, because the literals are part of the datum', async () => {
    const { input, values } = mount({
      type: 'object',
      properties: {
        ticket: { type: 'string', title: 'Change ticket', 'x-kai-format': 'custom', 'x-kai-mask': 'CHG-####' },
      },
    });

    type(input, '4821');
    await flush();

    expect(input.value).toBe('CHG-4821');
    expect(values()).toEqual({ ticket: 'CHG-4821' });
  });

  it('states the expected format in TEXT, through the row\'s EXISTING describedby channel', () => {
    const { input, container } = mount({
      type: 'object',
      properties: {
        due: {
          type: 'string',
          title: 'Due date',
          description: 'When the change lands.',
          'x-kai-format': 'custom',
          'x-kai-mask': '##/##/####',
          'x-kai-mask-guide': 'mm/dd/yyyy',
        },
      },
    });

    const described = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(described.length).toBeGreaterThan(0);

    const texts = described.map((refId) => container.querySelector(`#${CSS.escape(refId)}`)?.textContent ?? '');
    // The guide is the human-readable statement of the format (SC 3.3.2), and it is
    // reachable from the control — a visual guide alone is not a description.
    expect(texts.join(' ')).toContain('mm/dd/yyyy');
    // The field's own description is still in the same chain: the format hint JOINED it,
    // it did not replace it and it did not mint a second aria-describedby.
    expect(texts.join(' ')).toContain('When the change lands.');
    expect(input.getAttributeNames().filter((n) => n === 'aria-describedby')).toHaveLength(1);
  });
});

describe('hostile / malformed hints degrade loudly, never fatally', () => {
  it('an x-kai-format outside the enum falls back to unmasked text + a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { input, container, values } = mount({
      type: 'object',
      properties: { ticket: { type: 'string', 'x-kai-format': '<script>alert(1)</script>' as never } },
    });

    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).toContain('x-kai-format');

    // Still a working text field — the fallback is unmasked, not broken.
    typePlain(input, 'anything at all');
    await flush();
    expect(values()).toEqual({ ticket: 'anything at all' });

    // Display-only, and it is not displayed: the rejected token reaches no sink.
    expect(container.innerHTML).not.toContain('<script');
    expect(container.textContent).not.toContain('alert(1)');
  });

  it('an over-long x-kai-mask is refused by the mask engine — unmasked text + a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { input, values } = mount({
      type: 'object',
      properties: {
        serial: { type: 'string', 'x-kai-format': 'custom', 'x-kai-mask': '#'.repeat(500) },
      },
    });

    expect(warn).toHaveBeenCalled();
    // The 500-character pattern is CLIPPED where it is interpolated: a console warning
    // on a render path must not print a model's whole payload.
    const message = warn.mock.calls.flat().join(' ');
    expect(message).toContain('x-kai-mask');
    expect(message).not.toContain('#'.repeat(64));

    typePlain(input, 'SER-99');
    await flush();
    expect(values()).toEqual({ serial: 'SER-99' });
  });

  it('`custom` with no pattern, and a pattern with no format, both warn and render plain', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = mount({
      type: 'object',
      properties: { a: { type: 'string', 'x-kai-format': 'custom' } },
    });
    expect(warn).toHaveBeenCalled();
    typePlain(first.input, 'plain');
    await flush();
    expect(first.values()).toEqual({ a: 'plain' });

    warn.mockClear();
    const second = mount({
      type: 'object',
      properties: { b: { type: 'string', 'x-kai-mask': 'CHG-####' } },
    });
    expect(warn).toHaveBeenCalled();
    typePlain(second.input, 'plain');
    await flush();
    expect(second.values()).toEqual({ b: 'plain' });
  });

  // F-1. A pattern with no `#`/`@`/`*` compiles perfectly — unknown characters are
  // literals BY DESIGN (spec §7.3) — and yields capacity 0: a field that accepts
  // nothing. Silent is the one thing it must not be, and this is not a corner case:
  // `mm/dd/yyyy` is the string the schema's own `x-kai-mask-guide` description shows
  // the model, one free-form string key away from `x-kai-mask`.
  it('a mask with NO fill positions is refused — the guide-in-the-mask confusion', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { input, values } = mount({
      type: 'object',
      properties: { due: { type: 'string', 'x-kai-format': 'custom', 'x-kai-mask': 'mm/dd/yyyy' } },
    });

    expect(warn).toHaveBeenCalled();
    const message = warn.mock.calls.flat().join(' ');
    expect(message).toContain('mm/dd/yyyy');
    // Says what is wrong, in the vocabulary the author has to fix it with.
    expect(message).toMatch(/#/);

    // The field is USABLE. Before the fix it accepted nothing and submitted nothing,
    // with no diagnostic anywhere — which is the whole finding.
    typePlain(input, '03/14/2026');
    await flush();
    expect(input.value).toBe('03/14/2026');
    expect(values()).toEqual({ due: '03/14/2026' });
  });

  it('every zero-capacity shape a model plausibly emits is refused the same way', () => {
    // The `x-kai-mask` description's own `CHG-####` example invites `CHG-1234`; the
    // rest are the shapes a person writes when they mean "placeholder".
    for (const pattern of ['CHG-1234', 'XXX-XX-XXXX', '(___) ___-____', 'literal', '----']) {
      const r = resolveFieldMask({ type: 'string', 'x-kai-format': 'custom', 'x-kai-mask': pattern }, 'f');
      expect(r.format, pattern).toBeUndefined();
      expect(r.hint, pattern).toBeUndefined();
      expect(r.warnings, pattern).toHaveLength(1);
    }
    // …and the control: the same shapes WITH fill tokens resolve cleanly, so this is
    // not a rule that refuses everything.
    for (const pattern of ['##/##/####', 'CHG-####', '(###) ###-####', '@@@@']) {
      expect(resolveFieldMask({ type: 'string', 'x-kai-format': 'custom', 'x-kai-mask': pattern }, 'f').warnings, pattern).toEqual([]);
    }
  });

  it('a misaligned guide is dropped on its own — the MASK survives', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { input, values } = mount({
      type: 'object',
      properties: {
        ticket: {
          type: 'string',
          'x-kai-format': 'custom',
          'x-kai-mask': 'CHG-####',
          'x-kai-mask-guide': 'far too long to align',
        },
      },
    });

    expect(warn.mock.calls.flat().join(' ')).toContain('x-kai-mask-guide');
    // Dropping the whole mask over a bad GUIDE would be the over-reaction: the pattern
    // itself compiled, and it is the pattern that carries the meaning.
    type(input, '4821');
    await flush();
    expect(input.value).toBe('CHG-4821');
    expect(values()).toEqual({ ticket: 'CHG-4821' });
  });

  // F-2. The COUNT is the invariant, and it was asserted in prose while the code fired
  // twice. `toHaveBeenCalled()` cannot see the difference between once, twice and a
  // hundred times, which is exactly why this survived the first round.
  it('warns EXACTLY once per bad field, and never again as the user types', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { input } = mount({
      type: 'object',
      properties: { ticket: { type: 'string', 'x-kai-format': 'nonsense' as never } },
    });

    expect(warn).toHaveBeenCalledTimes(1);

    // The other half: bounded, and it stays bounded. A re-render per keystroke that
    // re-warned would be the version of this bug that reaches a real console.
    typePlain(input, 'CHG-4821');
    await flush();
    typePlain(input, '-more');
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('counts warnings PER FIELD — two bad fields warn twice, not once and not four times', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount({
      type: 'object',
      properties: {
        a: { type: 'string', 'x-kai-format': 'nonsense' as never },
        b: { type: 'string', 'x-kai-format': 'custom', 'x-kai-mask': 'mm/dd/yyyy' },
      },
    });
    // Two DISTINCT problems on two distinct fields: two sentences, one each. Deduping
    // across fields would be the opposite error — the second field's problem is real.
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('one bad field does not take its neighbours down', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = mount({
      type: 'object',
      properties: {
        bad: { type: 'string', title: 'Bad', 'x-kai-format': 'nonsense' as never },
        phone: { type: 'string', title: 'Phone', 'x-kai-format': 'tel' },
      },
    });

    const inputs = [...container.querySelectorAll('input[data-control]')] as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    type(inputs[1]!, '5550101234');
    await flush();
    expect(inputs[1]!.value).toBe('555-010-1234');
  });
});

describe('resolveFieldMask — the pure resolution, warnings as DATA', () => {
  it('accepts EVERY token the semantics enum carries — no token without a resolution', () => {
    // Derived from the enum, never a retyped list: a fifth semantic type added without a
    // default format would land here as a warning and an unmasked field, which is the
    // failure worth catching at the moment the token is added.
    for (const token of FIELD_SEMANTIC_TYPES) {
      const field = {
        type: 'string',
        'x-kai-format': token,
        ...(token === 'custom' ? { 'x-kai-mask': 'CHG-####' } : {}),
      } as FormField;
      const r = resolveFieldMask(field, 'probe');
      expect(r.warnings, token).toEqual([]);
      expect(r.format, token).toBeTruthy();
      expect(r.semantic, token).toBe(token);
    }
  });

  it('resolves the semantic default without the caller opting in twice', () => {
    const r = resolveFieldMask({ type: 'string', 'x-kai-format': 'tel' }, 'phone');
    expect(r.semantic).toBe('tel');
    expect(r.format).toBe('###-###-####');
    expect(r.hint).toContain('###-###-####');
    expect(r.warnings).toEqual([]);
  });

  it('is inert for a field with no hints at all — byte-for-byte the behavior of today', () => {
    expect(resolveFieldMask({ type: 'string' }, 'notes')).toEqual({ warnings: [] });
  });

  it('names the offending field and clips what it interpolates', () => {
    const r = resolveFieldMask({ type: 'string', 'x-kai-format': 'x'.repeat(400) as never }, 'ticketId');
    expect(r.format).toBeUndefined();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('ticketId');
    expect(r.warnings[0]).not.toContain('x'.repeat(64));
    expect(r.warnings[0]).toContain('400 chars');
  });
});
