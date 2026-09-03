/**
 * The controller's DECLARED shape (spec 3.2). Not a TypeScript parser: this
 * reads only what the contract FIXES, and it is loud about everything else.
 * Anti-vacuity is the point -- an analyzer that finds nothing and says nothing
 * is worse than none, because the html form has no typecheck behind it.
 */
import { describe, expect, it } from 'vitest';
import { analyzeController } from '../src/contract/analyze-controller';

const GOOD = `
import type { ChatMessage } from '@kitn.ai/ui/state';

export interface WidgetState {
  messages: ChatMessage[];
  loading: boolean;
  backHidden: boolean;
}

export interface WidgetRefs {
  stack: KaiViewStackElement | null;
  dock: KaiDockElement | null;
}

export interface WidgetActions {
  back(): void;
  submit(event: CustomEvent<{ value: string }>): Promise<void>;
  boot(): Promise<void>;
}

export function createController(deps: WidgetDeps): WidgetController {
  return null as never;
}
`;

describe('analyzeController', () => {
  it('reads the state fields, the action names and the ref names', () => {
    const out = analyzeController(GOOD, 'Widget', 'fixture/w.controller.ts');
    expect(out.errors).toEqual([]);
    expect(out.shape).toEqual({
      name: 'Widget',
      stateFields: ['messages', 'loading', 'backHidden'],
      actionNames: ['back', 'submit', 'boot'],
      refNames: ['stack', 'dock'],
    });
  });

  it('ignores comments, including a commented-out member', () => {
    const out = analyzeController(GOOD.replace('  loading: boolean;', '  // loading: boolean;'), 'Widget', 'w');
    expect(out.shape?.stateFields).toEqual(['messages', 'backHidden']);
  });

  it('refuses a missing createController by name', () => {
    const out = analyzeController(GOOD.replace('export function createController', 'function createController'), 'Widget', 'w');
    expect(out.errors.join(' ')).toContain('export function createController(');
  });

  it('refuses a misnamed interface by naming the identifier it wanted', () => {
    const out = analyzeController(GOOD.replace('WidgetActions', 'WidgetHandlers'), 'Widget', 'w');
    expect(out.errors.join(' ')).toContain('export interface WidgetActions');
  });

  it('refuses an EMPTY actions block rather than reporting none', () => {
    const out = analyzeController(GOOD.replace(/export interface WidgetActions \{[\s\S]*?\n\}/, 'export interface WidgetActions {\n}'), 'Widget', 'w');
    expect(out.errors.join(' ')).toContain('declares no actions');
  });

  it('refuses an EMPTY state block for the same reason', () => {
    const out = analyzeController(GOOD.replace(/export interface WidgetState \{[\s\S]*?\n\}/, 'export interface WidgetState {\n}'), 'Widget', 'w');
    expect(out.errors.join(' ')).toContain('declares no state');
  });

  it('refuses an unterminated interface instead of silently reading to EOF', () => {
    const out = analyzeController(GOOD.replace('export interface WidgetRefs {', 'export interface WidgetRefs {{'), 'Widget', 'w');
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it('reads every member of a single-line interface body (P5)', () => {
    const singleLine = GOOD.replace(
      /export interface WidgetActions \{[\s\S]*?\n\}/,
      'export interface WidgetActions { boot(): void; send(text: string): void; cancel(): void }',
    );
    const out = analyzeController(singleLine, 'Widget', 'w');
    expect(out.errors).toEqual([]);
    expect(out.shape?.actionNames).toEqual(['boot', 'send', 'cancel']);
  });
});

describe('analyzeController: parameter-list and object-literal members do not leak', () => {
  it('does not leak a second parameter or an object-typed parameter as a member (single line)', () => {
    const body = 'export interface WidgetActions { send(text: string, opts: { silent: boolean }): void; boot(): Promise<void>; }';
    const source = GOOD.replace(/export interface WidgetActions \{[\s\S]*?\n\}/, body);
    const out = analyzeController(source, 'Widget', 'w');
    expect(out.errors).toEqual([]);
    expect(out.shape?.actionNames).toEqual(['send', 'boot']);
  });

  it('does not leak parameters from a signature whose parameter list spans lines', () => {
    const body = [
      'export interface WidgetActions {',
      '  send(',
      '    text: string,',
      '    opts: { silent: boolean },',
      '  ): void;',
      '  boot(): Promise<void>;',
      '}',
    ].join('\n');
    const source = GOOD.replace(/export interface WidgetActions \{[\s\S]*?\n\}/, body);
    const out = analyzeController(source, 'Widget', 'w');
    expect(out.errors).toEqual([]);
    expect(out.shape?.actionNames).toEqual(['send', 'boot']);
  });

  it('does not leak keys of a one-line object-literal-typed state field', () => {
    const body = 'export interface WidgetState {\n  filters: { open: boolean, unread: boolean };\n}';
    const source = GOOD.replace(/export interface WidgetState \{[\s\S]*?\n\}/, body);
    const out = analyzeController(source, 'Widget', 'w');
    expect(out.errors).toEqual([]);
    expect(out.shape?.stateFields).toEqual(['filters']);
  });
});
