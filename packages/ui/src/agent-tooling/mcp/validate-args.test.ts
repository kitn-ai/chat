import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateToolArgs } from './validate-args';
import { reference } from './tools/reference';
import { scaffold } from './tools/scaffold';
import { theme } from './tools/theme';
import { debug } from './tools/debug';

// The real tool schemas, so these tests move when the tools do instead of
// pinning a restated copy.
const tools = [reference, scaffold, theme, debug];

describe('validateToolArgs', () => {
  it('accepts conforming args (all keys known, required present)', () => {
    expect(
      validateToolArgs('scaffold', scaffold.inputSchema, {
        integration: 'mock',
        placement: 'full-page',
        framework: 'html',
      }),
    ).toBeUndefined();
    expect(validateToolArgs('component_reference', reference.inputSchema, {})).toBeUndefined();
    expect(
      validateToolArgs('component_reference', reference.inputSchema, { name: 'kai-chat' }),
    ).toBeUndefined();
  });

  it('does not police value types — those belong to the handlers', () => {
    // provider: "gemini" is a known key with a value the enum rejects; the
    // handler in reference.ts owns that error (with better context than a
    // generic parse failure). Dispatch validation must let it through.
    expect(
      validateToolArgs('component_reference', reference.inputSchema, { provider: 'gemini' }),
    ).toBeUndefined();
  });

  it('rejects an unknown key and suggests the near-miss spelling', () => {
    const message = validateToolArgs('scaffold', scaffold.inputSchema, {
      integration: 'mock',
      placement: 'full-page',
      framwork: 'react',
    });
    expect(message).toMatch(/unknown argument "framwork" — did you mean "framework"\?/);
  });

  it('suggests by value shape when the spelling is nowhere close', () => {
    // "element" is not within edit distance of "name", but its string value is
    // accepted by exactly one unsupplied key ("name"; "provider"'s enum rejects it).
    const message = validateToolArgs('component_reference', reference.inputSchema, {
      element: 'kai-chat',
    });
    expect(message).toMatch(/unknown argument "element" — did you mean "name"\?/);
  });

  it('omits the suggestion rather than guess between two candidates', () => {
    // debug has two optional string keys; a string value matches both.
    const message = validateToolArgs('debug', debug.inputSchema, { text: 'it broke' });
    expect(message).toMatch(/unknown argument "text"/);
    expect(message).not.toMatch(/did you mean/);
  });

  it('names every missing required key, derived from the schema', () => {
    const message = validateToolArgs('scaffold', scaffold.inputSchema, {});
    for (const key of ['integration', 'placement', 'framework']) {
      expect(message).toMatch(new RegExp(`missing required argument "${key}"`));
    }
    // The optional keys must NOT be reported missing.
    expect(message).not.toMatch(/missing required argument "useCase"/);
  });

  it('teaches the expected schema in the error text', () => {
    const message = validateToolArgs('theme', theme.inputSchema, { colour: '#7c3aed' });
    expect(message).toMatch(/Expected arguments for theme:/);
    expect(message).toMatch(/brand \(optional\) — string/);
    // Enum values are spelled out, read from the advertised JSON Schema.
    expect(message).toMatch(/mode \(optional\) — "light" \| "dark" \| "both"/);
  });

  it('holds for every tool, not just the one the bug was found on', () => {
    for (const tool of tools) {
      const message = validateToolArgs(tool.name, tool.inputSchema, {
        __not_a_real_key__: true,
        // scaffold's required keys, harmless extras elsewhere would trip the
        // unknown-key path — so satisfy required keys only where they exist.
        ...(tool.name === 'scaffold'
          ? { integration: 'mock', placement: 'full-page', framework: 'html' }
          : {}),
      });
      expect(message, tool.name).toMatch(/unknown argument "__not_a_real_key__"/);
      expect(message, tool.name).toMatch(new RegExp(`^${tool.name}: `));
    }
  });
});
