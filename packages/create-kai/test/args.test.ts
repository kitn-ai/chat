import { describe, expect, it } from 'vitest';
import {
  ZERO_CONFIG,
  defaultNameForTarget,
  normalizeGateway,
  parseArgs,
  sanitizeProjectName,
  validateProjectName,
} from '../src/args';

describe('parseArgs', () => {
  it('reads the positional target directory', () => {
    expect(parseArgs(['my-app']).dir).toBe('my-app');
  });

  it('accepts both --flag value and --flag=value', () => {
    expect(parseArgs(['--framework', 'react']).framework).toBe('react');
    expect(parseArgs(['--framework=react']).framework).toBe('react');
  });

  it('reads --shape, the wizard\'s own axis, distinct from --layout', () => {
    expect(parseArgs(['--shape', 'widget']).shape).toBe('widget');
    expect(parseArgs(['--shape=fullscreen']).shape).toBe('fullscreen');
    expect(parseArgs([]).shape).toBeUndefined();
  });

  it('splits --features on commas', () => {
    expect(parseArgs(['--features', 'conversations,voice']).features).toEqual([
      'conversations',
      'voice',
    ]);
  });

  it('distinguishes "no features" from "features not specified"', () => {
    // The bare full-page chat is a real answer, so `--features none` must not
    // fall back to the default the way an omitted flag does.
    expect(parseArgs(['--features', 'none']).features).toEqual([]);
    expect(parseArgs(['--features', '']).features).toEqual([]);
    expect(parseArgs([]).features).toBeUndefined();
  });

  it('reports a flag that is missing its value instead of eating the next flag', () => {
    expect(parseArgs(['--framework']).errors).toEqual(['--framework needs a value']);
  });

  it('reports unknown flags', () => {
    expect(parseArgs(['--nope']).errors).toEqual(['unknown flag --nope']);
  });

  it('treats a second positional as an error, not a silent overwrite', () => {
    expect(parseArgs(['a', 'b']).errors).toEqual(['unexpected argument b']);
  });

  it('handles --no-install as false and --install as true', () => {
    expect(parseArgs(['--no-install']).install).toBe(false);
    expect(parseArgs(['--install']).install).toBe(true);
    expect(parseArgs([]).install).toBeUndefined();
  });
});

describe('normalizeGateway', () => {
  it("maps the prompt's 'none' onto the catalog's 'mock'", () => {
    expect(normalizeGateway('none')).toBe('mock');
    expect(normalizeGateway('openai')).toBe('openai');
    expect(normalizeGateway(undefined)).toBeUndefined();
  });
});

describe('ZERO_CONFIG', () => {
  it('is the spec\'s stated zero-config path', () => {
    // React + full-screen + conversation history + local mock. If this drifts,
    // "Enter through every prompt" stops meaning what the spec says it means.
    expect(ZERO_CONFIG).toMatchObject({
      framework: 'react',
      layout: 'full-screen',
      gateway: 'mock',
    });
    expect(ZERO_CONFIG.features).toEqual(['conversations']);
  });
});

describe('sanitizeProjectName', () => {
  it('lowercases and swaps illegal characters for a hyphen', () => {
    expect(sanitizeProjectName('My_App')).toBe('my_app');
    expect(sanitizeProjectName('My App')).toBe('my-app');
    expect(sanitizeProjectName('Foo Bar!!')).toBe('foo-bar--');
  });

  it('strips a leading run of . or _', () => {
    expect(sanitizeProjectName('.hidden')).toBe('hidden');
    expect(sanitizeProjectName('__private')).toBe('private');
  });
});

describe('defaultNameForTarget', () => {
  const cwd = '/Users/rob/projects/My_Cool-App';

  it('falls back to ZERO_CONFIG.name when no positional dir was given', () => {
    expect(defaultNameForTarget(undefined, cwd)).toBe(ZERO_CONFIG.name);
  });

  it("resolves '.' to the sanitized basename of cwd", () => {
    expect(defaultNameForTarget('.', cwd)).toBe('my_cool-app');
  });

  it("resolves './' the same as '.'", () => {
    expect(defaultNameForTarget('./', cwd)).toBe('my_cool-app');
  });

  it('resolves a plain relative dir to its own sanitized basename', () => {
    expect(defaultNameForTarget('my-app', cwd)).toBe('my-app');
  });

  it('resolves a nested relative path to the LAST segment, not the whole path', () => {
    // Today's bug for any path-y positional, not just '.': the raw arg
    // ("apps/my-app") fails validateProjectName outright because of the slash.
    expect(defaultNameForTarget('apps/my-app', cwd)).toBe('my-app');
  });

  it('resolves an absolute path to its basename', () => {
    expect(defaultNameForTarget('/tmp/some-project', cwd)).toBe('some-project');
  });

  it('sanitizes a basename with uppercase and underscores', () => {
    expect(defaultNameForTarget('./My_Weird_Dir', cwd)).toBe('my_weird_dir');
  });

  it('falls back to ZERO_CONFIG.name when the sanitized basename is empty or still invalid', () => {
    // basename('.') off root-ish paths and pure-symbol dirs both sanitize to
    // nothing usable.
    expect(defaultNameForTarget('...', cwd)).toBe(ZERO_CONFIG.name);
    expect(defaultNameForTarget('/', cwd)).toBe(ZERO_CONFIG.name);
  });
});

describe('validateProjectName', () => {
  it('accepts ordinary and scoped names', () => {
    expect(validateProjectName('my-app')).toBeNull();
    expect(validateProjectName('@acme/my-app')).toBeNull();
  });

  it.each([
    ['', 'empty'],
    ['My-App', 'uppercase'],
    ['.hidden', 'leading dot'],
    ['_private', 'leading underscore'],
    ['has spaces', 'spaces'],
  ])('rejects %j (%s)', (name) => {
    expect(validateProjectName(name)).not.toBeNull();
  });
});
