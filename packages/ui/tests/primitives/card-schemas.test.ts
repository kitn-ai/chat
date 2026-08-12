// tests/primitives/card-schemas.test.ts
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { validateAgainstSchema, type JsonSchema } from '../../src/primitives/card-validate';

const load = (name: string): JsonSchema =>
  JSON.parse(readFileSync(`src/primitives/card-schemas/${name}`, 'utf-8'));

test('card-envelope schema parses + validates a good/bad envelope', () => {
  const s = load('card-envelope.schema.json');
  expect(validateAgainstSchema(s, { type: 'form', id: 'c1', data: {} }).valid).toBe(true);
  expect(validateAgainstSchema(s, { id: 'c1', data: {} }).valid).toBe(false); // missing type
});

test('card-event schema parses + validates a good/bad event', () => {
  const s = load('card-event.schema.json');
  expect(validateAgainstSchema(s, { kind: 'ready', cardId: 'c1' }).valid).toBe(true);
  expect(validateAgainstSchema(s, { cardId: 'c1' }).valid).toBe(false); // missing kind
});

test('link schema parses + validates a good/bad link payload', () => {
  const s = load('link.schema.json');
  expect(
    validateAgainstSchema(s, {
      url: 'https://example.com/post',
      title: 'A post',
      description: 'Body',
      image: 'https://example.com/og.png',
    }).valid,
  ).toBe(true);
  expect(validateAgainstSchema(s, { title: 'no url' }).valid).toBe(false); // missing required url
  // overlong title is rejected (maxLength 300).
  expect(validateAgainstSchema(s, { url: 'https://x', title: 'a'.repeat(301) }).valid).toBe(false);
});

test('artifact schema parses + validates a good/bad artifact payload', () => {
  const s = load('artifact.schema.json');
  expect(
    validateAgainstSchema(s, {
      src: 'https://preview.example.com/app',
      files: [{ path: 'index.html', code: '<h1>hi</h1>', language: 'html', type: 'html' }],
      tab: 'code',
      activeFile: 'index.html',
      displayUrl: 'preview.example.com',
      height: 480,
    }).valid,
  ).toBe(true);
  // A code-only artifact (no src) is legitimate.
  expect(validateAgainstSchema(s, { files: [{ path: 'a.ts', code: 'x' }], tab: 'code' }).valid).toBe(true);
  // tab is a closed enum — 'diff' is not a view this component has.
  expect(validateAgainstSchema(s, { src: 'https://x', tab: 'diff' }).valid).toBe(false);
  expect(validateAgainstSchema(s, { src: 123 }).valid).toBe(false); // src must be a string
  expect(validateAgainstSchema(s, { files: [{ code: 'no path' }] }).valid).toBe(false); // path required
  expect(validateAgainstSchema(s, { files: [{ path: 'a', type: 'binary' }] }).valid).toBe(false); // bad file type
});

test('artifact schema does NOT expose host-owned artifact props', () => {
  const s = load('artifact.schema.json');
  // The card envelope is model-written: sandbox/toolbar/view-state must stay off
  // the wire so a model cannot widen its own sandbox or hide the chrome.
  for (const forbidden of ['sandbox', 'maximized', 'controllerRef', 'showNav', 'showTabs', 'expandable']) {
    expect(Object.keys(s.properties ?? {})).not.toContain(forbidden);
  }
});

test('embed schema parses + validates provider payloads', () => {
  const s = load('embed.schema.json');
  expect(validateAgainstSchema(s, { provider: 'youtube', id: 'dQw4w9WgXcQ' }).valid).toBe(true);
  expect(validateAgainstSchema(s, { provider: 'generic', url: 'https://x/y' }).valid).toBe(true);
  expect(validateAgainstSchema(s, { provider: 'tiktok', id: 'x' }).valid).toBe(false); // bad enum
  // id must match the [A-Za-z0-9_-] pattern.
  expect(validateAgainstSchema(s, { provider: 'youtube', id: 'bad id!' }).valid).toBe(false);
  // aspectRatio enum is enforced.
  expect(
    validateAgainstSchema(s, { provider: 'youtube', id: 'abc', aspectRatio: '21:9' }).valid,
  ).toBe(false);
});
