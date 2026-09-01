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
import type { Construct } from './schema';
import { ConstructSchema, CONSTRUCT_SCHEMA_URL } from './schema';
import { TEMPLATES, buildableTemplates, templateById, inferTemplateId } from './templates';

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

  it('design-parity fix wave (2026-08-29): inAppAssistant carries composerTriggers/messageActions/cards, assistant carries shell — sections the design story shows that were missing from the registry wiring', () => {
    const inAppAssistant = buildableTemplates().find((t) => t.id === 'inAppAssistant')!;
    expect(inAppAssistant.controls.map((s) => s.id)).toEqual(
      expect.arrayContaining(['composerTriggers', 'messageActions', 'cards']),
    );
    const assistant = buildableTemplates().find((t) => t.id === 'assistant')!;
    expect(assistant.controls.map((s) => s.id)).toEqual(expect.arrayContaining(['shell']));
  });
});

describe('starter content rules (B-14 / B-4)', () => {
  it('composer.triggers ship on exactly the two agentic shapes (Workspace and the in-app assistant)', () => {
    const withTriggers = buildableTemplates()
      .filter((t) => [t.starter, ...(t.variants ?? []).map((v) => v.starter)].some((s) => s.composer?.triggers !== undefined))
      .map((t) => t.id);
    expect(withTriggers.sort()).toEqual(['inAppAssistant', 'workspace']);
  });

  it('no starter pre-commits anybody\'s brand: theme.accent and theme.unreadColor are omitted everywhere (S-7/S-8)', () => {
    for (const { name, starter } of starterCases) {
      expect(starter.theme?.accent, `${name} carries an accent`).toBeUndefined();
      expect(starter.theme?.unreadColor, `${name} carries an unreadColor`).toBeUndefined();
    }
  });

  it('everything free, local and reversible ships ON — a person cannot switch off an option they never saw (S-2)', () => {
    for (const { name, starter } of starterCases) {
      expect(starter.capabilities?.starters?.length, name).toBeGreaterThan(0);
      expect(starter.capabilities?.attachments, name).toBeDefined();
      expect(starter.capabilities?.history?.persistence, name).toBe('local');
      expect(starter.capabilities?.conversations, name).toBe(true);
      expect(starter.capabilities?.reasoning, name).toBe('full');
      expect(starter.capabilities?.messageActions, name).toEqual({
        user: ['edit'],
        assistant: ['copy', 'like', 'dislike'],
      });
      expect(starter.empty, name).toBeDefined();
    }
  });

  it('anything needing a backend or an invoice stays OFF (S-3)', () => {
    for (const { name, starter } of starterCases) {
      expect(starter.provider, name).toEqual({ mode: 'mock' });
      expect(starter.capabilities?.history?.url, name).toBeUndefined();
      expect(starter.capabilities?.reasoningOpen, name).toBeUndefined();
      expect(starter.cards, name).toBeUndefined();
    }
  });

  it('every hint is keyed by a path its own section actually edits — a hint on a control nobody renders is invisible', () => {
    for (const t of buildableTemplates()) {
      for (const s of t.controls) {
        for (const path of Object.keys(s.hints ?? {})) {
          expect(s.paths, `${t.id}/${s.id}: hint on "${path}"`).toContain(path);
        }
      }
    }
  });

  it('every template offers an Empty-state section, so the starter\'s own empty copy is editable (S-5)', () => {
    for (const t of buildableTemplates()) {
      expect(t.controls.map((s) => s.id), t.id).toContain('empty');
    }
  });

  it('Workspace offers the Work surface section (S-5), and no other template does', () => {
    for (const t of buildableTemplates()) {
      expect(t.controls.some((s) => s.id === 'workSurface'), t.id).toBe(t.id === 'workspace');
    }
  });

  it("Research states its defining fact in its own JSON: sources: { strip: true }", () => {
    const research = buildableTemplates().find((t) => t.id === 'research')!;
    expect(research.starter.capabilities?.sources).toEqual({ strip: true });
  });

  it('every buildable starter ships theme.mode: "dark" EXCEPT widget, which stays "system" (owner ruling, dark round — an embedded widget follows its host site, not its own preference)', () => {
    for (const t of buildableTemplates()) {
      const all = [t.starter, ...(t.variants ?? []).map((v) => v.starter)];
      for (const s of all) {
        expect(s.theme?.mode, `${t.id}${s === t.starter ? '' : ' variant'}`).toBe(
          t.id === 'widget' ? 'system' : 'dark',
        );
      }
    }
  });

  it('the two Workspace variants differ in what the PANE LOOKS LIKE, not just in name and prompts (W-12)', () => {
    const ws = buildableTemplates().find((t) => t.id === 'workspace')!;
    const artifact = ws.variants!.find((v) => v.id === 'artifactPreview')!.starter;
    const app = ws.variants!.find((v) => v.id === 'appPreview')!.starter;

    expect(artifact.workSurface?.kind).toBe('artifact');
    expect(app.workSurface?.kind).toBe('preview');

    expect(artifact.workSurface?.chrome).toEqual({
      deviceToggle: false, urlBar: false, openInNewTab: false, expand: true, codeView: false,
    });
    expect(app.workSurface?.chrome).toEqual({
      deviceToggle: true, urlBar: true, openInNewTab: true, expand: true, codeView: true,
    });

    // The tell that this is a real difference and not a renamed one.
    expect(JSON.stringify(artifact.workSurface)).not.toBe(JSON.stringify(app.workSurface));
  });

  it('appPreview ships the Preview|Code toggle ON and artifactPreview does not — an app preview is a code surface, a framed artifact is not (owner ruling, 2026-08-30)', () => {
    const ws = buildableTemplates().find((t) => t.id === 'workspace')!;
    const artifact = ws.variants!.find((v) => v.id === 'artifactPreview')!.starter;
    const app = ws.variants!.find((v) => v.id === 'appPreview')!.starter;

    expect(app.workSurface?.chrome?.codeView).toBe(true);
    expect(artifact.workSurface?.chrome?.codeView).toBe(false);
    // Neither points at source: the tab renders WorkSurface's own empty state,
    // and a starter must never ship a codeUrl it has no offline file for.
    expect(app.workSurface?.codeUrl).toBeUndefined();
    expect(artifact.workSurface?.codeUrl).toBeUndefined();
  });

  it('the two variants emit DIFFERENT Artifact/WorkSurface props, not merely a different name', async () => {
    const { generateProject } = await import('./codegen');
    const ws = buildableTemplates().find((t) => t.id === 'workspace')!;
    const appOf = (starter: Construct) =>
      generateProject(starter).find((f) => f.path === 'src/App.tsx')!.code;
    const a = appOf(ws.variants!.find((v) => v.id === 'artifactPreview')!.starter);
    const b = appOf(ws.variants!.find((v) => v.id === 'appPreview')!.starter);

    expect(a).toContain('showDeviceToggle={false}');
    expect(b).toContain('showDeviceToggle={true}');
    expect(a).toContain('variant="artifact"');
    expect(b).toContain('variant="preview"');
    expect(a).toContain('iframeTitle={"Work surface"}');
    expect(b).toContain('iframeTitle={"App preview"}');
  });
});

describe('inferTemplateId derives the family from a loaded construct\'s own shape (T-3: no template key in the file)', () => {
  it('every buildable starter (and every variant starter) infers back to its own template id', () => {
    for (const { name, starter } of starterCases) {
      const templateId = name.split('.')[0] as ReturnType<typeof inferTemplateId>;
      expect(inferTemplateId(starter), name).toBe(templateId);
    }
  });

  it('layout: custom or an unrecognized shape infers undefined, not a guess', () => {
    expect(inferTemplateId({ $schema: CONSTRUCT_SCHEMA_URL, name: 'x', layout: 'custom', provider: { mode: 'mock' }, slots: [{ name: 'pane', component: 'div' }] } as never)).toBeUndefined();
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
