/**
 * TDD tests for argTypesFor() in src/stories/docs/element-controls.ts
 *
 * The bug: element-meta.json encodes booleans as "undefined | false | true"
 * and enums as `undefined | "preview" | "code"` (double quotes + leading
 * undefined). The old helper checked for single-quoted enum parts with no
 * undefined (dead branch) and /boolean/ in the type string (never matches).
 * Everything fell through to control:'text'.
 *
 * These tests pin the CORRECT behaviour post-fix.
 */

import { describe, it, expect } from 'vitest';
import { argTypesFor } from '../../src/stories/docs/element-controls';

describe('argTypesFor', () => {
  describe('kai-artifact', () => {
    it('tab → select control with options [preview, code]', () => {
      const result = argTypesFor('kai-artifact');
      expect(result['tab']).toEqual({
        control: { type: 'select' },
        options: ['preview', 'code'],
      });
    });

    it('expandable → boolean control', () => {
      const result = argTypesFor('kai-artifact');
      expect(result['expandable']).toEqual({ control: 'boolean' });
    });

    it('standalone → boolean control', () => {
      const result = argTypesFor('kai-artifact');
      expect(result['standalone']).toEqual({ control: 'boolean' });
    });

    it('noNav → boolean control', () => {
      const result = argTypesFor('kai-artifact');
      expect(result['noNav']).toEqual({ control: 'boolean' });
    });

    it('src → text control (optional string)', () => {
      const result = argTypesFor('kai-artifact');
      expect(result['src']).toEqual({ control: 'text' });
    });
  });

  describe('kai-message', () => {
    it('role → select control with options [user, assistant]', () => {
      const result = argTypesFor('kai-message');
      expect(result['role']).toEqual({
        control: { type: 'select' },
        options: ['user', 'assistant'],
      });
    });

    it('markdown → boolean control', () => {
      const result = argTypesFor('kai-message');
      expect(result['markdown']).toEqual({ control: 'boolean' });
    });

    it('proseSize → select control', () => {
      const result = argTypesFor('kai-message');
      // Union member order tracks the TS checker's global type-id ordering, which
      // shifts when the element set changes (e.g. kai-button's `size` also defines
      // 'sm'/'lg'). A select control's option order is cosmetic, so assert the SET.
      expect(result['proseSize'].control).toEqual({ type: 'select' });
      expect([...result['proseSize'].options].sort()).toEqual(['base', 'lg', 'sm', 'xs']);
    });

    it('codeTheme → text control', () => {
      // `content` was the pre-parts-migration scalar prop (kai-message now takes
      // a `message: ChatMessage` object, no standalone text prop); codeTheme is
      // the current plain-string prop this case exercises instead.
      const result = argTypesFor('kai-message');
      expect(result['codeTheme']).toEqual({ control: 'text' });
    });
  });

  describe('kai-response-stream (number prop)', () => {
    it('speed → number control', () => {
      const result = argTypesFor('kai-response-stream');
      expect(result['speed']).toEqual({ control: 'number' });
    });
  });

  describe('unknown tag', () => {
    it('returns empty object for unknown tag', () => {
      expect(argTypesFor('kai-nonexistent')).toEqual({});
    });
  });

  // ── New: complex/function props ──────────────────────────────────────────

  describe('kai-chat (complex array props → object control)', () => {
    it('messages → object control (array of message objects)', () => {
      const result = argTypesFor('kai-chat');
      expect(result['messages']).toEqual({ control: 'object' });
    });

    it('suggestions → object control (string[] is not a plain string)', () => {
      const result = argTypesFor('kai-chat');
      expect(result['suggestions']).toEqual({ control: 'object' });
    });
  });

  describe('kai-form (Record<> prop → object control)', () => {
    it('data → object control (Record<string, unknown>)', () => {
      const result = argTypesFor('kai-form');
      expect(result['data']).toEqual({ control: 'object' });
    });
  });

  describe('kai-voice-input (function prop → no control)', () => {
    it('transcribe → control: false (function callback)', () => {
      const result = argTypesFor('kai-voice-input');
      expect(result['transcribe']).toEqual({ control: false });
    });
  });

  describe('kai-cards (function-bearing object → no control; object[] → object control)', () => {
    it('policy → control: false (object containing function callbacks)', () => {
      const result = argTypesFor('kai-cards');
      expect(result['policy']).toEqual({ control: false });
    });

    it('cards → object control (array of card objects)', () => {
      const result = argTypesFor('kai-cards');
      expect(result['cards']).toEqual({ control: 'object' });
    });
  });

  // ── Regression: existing scalar prop behaviour must still hold ────────────

  describe('regression: kai-artifact scalar props unchanged', () => {
    it('src → text control (pure string)', () => {
      const result = argTypesFor('kai-artifact');
      expect(result['src']).toEqual({ control: 'text' });
    });

    it('tab → select control with options [preview, code]', () => {
      const result = argTypesFor('kai-artifact');
      expect(result['tab']).toEqual({
        control: { type: 'select' },
        options: ['preview', 'code'],
      });
    });

    it('expandable → boolean control', () => {
      const result = argTypesFor('kai-artifact');
      expect(result['expandable']).toEqual({ control: 'boolean' });
    });
  });

  describe('regression: kai-response-stream number prop unchanged', () => {
    it('speed → number control', () => {
      const result = argTypesFor('kai-response-stream');
      expect(result['speed']).toEqual({ control: 'number' });
    });
  });
});
