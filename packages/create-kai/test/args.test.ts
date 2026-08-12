import { describe, expect, it } from 'vitest';
import { ZERO_CONFIG, normalizeGateway, parseArgs, validateProjectName } from '../src/args';

describe('parseArgs', () => {
  it('reads the positional target directory', () => {
    expect(parseArgs(['my-app']).dir).toBe('my-app');
  });

  it('accepts both --flag value and --flag=value', () => {
    expect(parseArgs(['--framework', 'react']).framework).toBe('react');
    expect(parseArgs(['--framework=react']).framework).toBe('react');
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
