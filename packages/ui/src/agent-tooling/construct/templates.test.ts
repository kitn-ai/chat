/**
 * The template registry's contract (B-12/B-13/B-14): every buildable starter
 * (and every variant starter) safeParses against the REAL ConstructSchema on
 * every run — the create-kai precedent: correspondence lives in the test
 * layer, driven off the live schema, because the registry module itself must
 * stay zod-free (a leaf all three consumers can import).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConstructSchema, CONSTRUCT_SCHEMA_URL } from './schema';
import { TEMPLATES, buildableTemplates, templateById } from './templates';

const starterCases = buildableTemplates().flatMap((t) => [
  { name: t.id, starter: t.starter },
  ...(t.variants ?? []).map((v) => ({ name: `${t.id}.${v.id}`, starter: v.starter })),
]);

describe('every buildable starter is a valid construct (B-12)', () => {
  it('has starters to drive, so the loops below are not vacuous', () => {
    expect(starterCases.length).toBeGreaterThan(0);
    expect(buildableTemplates().length).toBeGreaterThan(0);
  });

  for (const { name, starter } of starterCases) {
    it(`${name}: safeParses against the real ConstructSchema`, () => {
      const parsed = ConstructSchema.safeParse(starter);
      expect(
        parsed.success,
        parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2),
      ).toBe(true);
    });
    it(`${name}: stamps $schema and the mock provider (B-14 — keyless first run)`, () => {
      expect(starter.$schema).toBe(CONSTRUCT_SCHEMA_URL);
      expect(starter.provider).toEqual({ mode: 'mock' });
    });
  }
});

describe('registry shape (B-13 / C-4)', () => {
  it('voice is story-only, identity only; Multi-mode is not in the registry at all', () => {
    const voice = templateById('voice');
    expect(voice?.availability).toBe('story-only');
    expect(voice && 'starter' in voice).toBe(false);
    expect(TEMPLATES.some((t) => /multi/i.test(t.id))).toBe(false);
  });

  it('the five buildable templates are exactly the ruled set, in card order', () => {
    expect(buildableTemplates().map((t) => t.id)).toEqual([
      'widget',
      'inAppAssistant',
      'assistant',
      'research',
      'workspace',
    ]);
  });

  it('workspace carries the two ruling-11 variants, identities from builder-workspace-variants', () => {
    const ws = buildableTemplates().find((t) => t.id === 'workspace')!;
    expect(ws.variants?.map((v) => v.id)).toEqual(['artifactPreview', 'appPreview']);
  });

  it('every buildable entry has a non-empty controls manifest', () => {
    for (const t of buildableTemplates()) {
      expect(t.controls.length, t.id).toBeGreaterThan(0);
      for (const s of t.controls) expect(s.paths.length, `${t.id}/${s.id}`).toBeGreaterThan(0);
    }
  });
});

describe('starter content rules (B-14 / B-4)', () => {
  it('Workspace is the ONLY buildable template whose starters carry composer.triggers (the ruling-8 default-on matrix, expressed as starter data)', () => {
    for (const t of buildableTemplates()) {
      const all = [t.starter, ...(t.variants ?? []).map((v) => v.starter)];
      const hasTriggers = all.some((s) => s.composer?.triggers !== undefined);
      expect(hasTriggers, t.id).toBe(t.id === 'workspace');
    }
  });

  it("Research states its defining fact in its own JSON: sources: { strip: true }", () => {
    const research = buildableTemplates().find((t) => t.id === 'research')!;
    expect(research.starter.capabilities?.sources).toEqual({ strip: true });
  });
});

describe('templates.ts stays a leaf (B-12)', () => {
  it('has no value import other than ./schema-url — no zod, no ./schema, no components', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'templates.ts'), 'utf8');
    const valueImports = [...src.matchAll(/^import (?!type[\s{])[^;]*?from '([^']+)';/gm)].map(
      (m) => m[1],
    );
    expect(valueImports).toEqual(['./schema-url']);
  });
});
