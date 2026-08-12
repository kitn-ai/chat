/**
 * The reuse boundary and the availability gate.
 *
 * These assert that the CLI reads the kit's catalog rather than restating it,
 * and that a feature nothing can render is reported as unavailable rather than
 * emitted into a project that silently lacks it.
 */
import { describe, expect, it } from 'vitest';

import { WIRED_GATEWAYS, listGateways, mockIntegration, rendererComponents } from '../src/catalog';
import { FEATURES, availableFeatures, featureEmit, resolveSurface } from '../src/features';
import { FRAMEWORKS, getFramework } from '../src/frameworks';

const react = getFramework('react')!;

describe('catalog reuse', () => {
  it('reads gateways from the kit registry, not a local list', () => {
    const ids = listGateways().map((g) => g.integration.id);
    // The eleven the registry ships. If the CLI ever grows its own copy this
    // count stops tracking the catalog and the two silently diverge.
    expect(ids).toContain('openai');
    expect(ids).toContain('anthropic');
    expect(ids).toContain('mock');
    expect(ids.length).toBe(11);
  });

  it('puts None (mock) first', () => {
    expect(listGateways()[0].integration.id).toBe('mock');
  });

  it('takes env vars and key exposure off the integration, never from prose', () => {
    const openai = listGateways().find((g) => g.integration.id === 'openai')!.integration;
    expect(openai.envVars).toEqual(['OPENAI_API_KEY']);
    expect(openai.keyExposure).toBe('needs-proxy');
  });

  it('offers only gateways it can wire', () => {
    expect([...WIRED_GATEWAYS]).toEqual(['mock']);
    for (const gateway of listGateways()) {
      expect(gateway.wired).toBe(gateway.integration.id === 'mock');
    }
  });

  it('carries the mock integration with its own run note and docs slug', () => {
    const mock = mockIntegration();
    expect(mock.id).toBe('mock');
    expect(mock.keyExposure).toBe('frontend-safe');
    expect(mock.docsSlug.length).toBeGreaterThan(0);
  });
});

describe('renderer component set (derived, not restated)', () => {
  it('is derived from the kit\'s capability groups', () => {
    const known = rendererComponents();
    // These four capabilities are what the archetype catalog reports today.
    expect(known.has('kai-chat')).toBe(true);
    expect(known.has('kai-sources')).toBe(true);
    expect(known.has('kai-tool')).toBe(true);
    expect(known.has('kai-reasoning')).toBe(true);
    expect(known.has('kai-artifact')).toBe(true);
    expect(known.has('kai-resizable')).toBe(true);
    expect(known.has('kai-voice-input')).toBe(true);
  });

  it('does NOT claim components no renderer branches on', () => {
    // The whole point of the gate. `kai-file-upload` and `kai-attachments` are
    // real registered elements, so a components list containing them is not an
    // error — `renderSurface` would accept it and emit nothing for them.
    const known = rendererComponents();
    expect(known.has('kai-file-upload')).toBe(false);
    expect(known.has('kai-attachments')).toBe(false);
    expect(known.has('kai-conversations')).toBe(false);
  });
});

describe('feature availability', () => {
  it('routes conversation history through the composed workspace', () => {
    expect(featureEmit(FEATURES.find((f) => f.id === 'conversations')!, react)).toBe('composed');
  });

  it('routes capability features through the renderer', () => {
    for (const id of ['sources', 'agentic', 'artifacts', 'voice']) {
      expect(featureEmit(FEATURES.find((f) => f.id === id)!, react)).toBe('renderer');
    }
  });

  it('reports attachments as unavailable — a gap, discovered not hard-coded', () => {
    // REPORTED GAP: no archetype composes kai-file-upload / kai-attachments, so
    // `listCapabilityGroups()` does not report them and no renderer emits them.
    // Adding an archetype that uses them flips this with no edit to the CLI.
    expect(featureEmit(FEATURES.find((f) => f.id === 'attachments')!, react)).toBe('unavailable');
    expect(availableFeatures(react).map((f) => f.id)).not.toContain('attachments');
  });

  it('does not offer conversation history where no composed starter exists', () => {
    const next = getFramework('nextjs')!;
    expect(featureEmit(FEATURES.find((f) => f.id === 'conversations')!, next)).toBe('unavailable');
  });
});

describe('resolveSurface', () => {
  it('resolves the zero-config choice to the composed template', () => {
    const result = resolveSurface(['conversations'], react);
    expect(result.ok && result.surface.kind).toBe('composed');
  });

  it('resolves capability features to a components list led by kai-chat', () => {
    const result = resolveSurface(['agentic'], react);
    expect(result.ok && result.surface.kind).toBe('generated');
    if (result.ok && result.surface.kind === 'generated') {
      expect(result.surface.components).toEqual(['kai-chat', 'kai-tool', 'kai-reasoning']);
    }
  });

  it('de-duplicates components shared by two features', () => {
    // artifacts and conversations both want kai-resizable; a duplicate tag in
    // the components list is a rendered element twice.
    const result = resolveSurface(['artifacts', 'voice'], react);
    if (result.ok && result.surface.kind === 'generated') {
      const unique = new Set(result.surface.components);
      expect(unique.size).toBe(result.surface.components.length);
    }
  });

  it('refuses to mix the composed template with generated features', () => {
    const result = resolveSurface(['conversations', 'agentic'], react);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot combine/);
  });

  it('refuses an unavailable feature', () => {
    const result = resolveSurface(['attachments'], react);
    expect(result.ok).toBe(false);
  });

  it('treats no features as the bare chat rather than an error', () => {
    const result = resolveSurface([], react);
    expect(result.ok && result.surface.kind).toBe('generated');
    if (result.ok && result.surface.kind === 'generated') {
      expect(result.surface.components).toEqual(['kai-chat']);
    }
  });
});

describe('framework table', () => {
  it('has exactly one template dir per framework and no duplicates', () => {
    const dirs = FRAMEWORKS.map((f) => f.templateDir);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it('marks solid as the one non-elements registration', () => {
    const solidOnly = FRAMEWORKS.filter((f) => f.registration === 'solid').map((f) => f.id);
    expect(solidOnly).toEqual(['solid']);
  });

  it('ships react ready', () => {
    expect(react.status).toBe('ready');
    expect(react.composedWorkspace).toBe(true);
  });
});
