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
    // The five capabilities the archetype catalog reports today. The last pair
    // arrived without this file being touched — see the sibling test below.
    expect(known.has('kai-chat')).toBe(true);
    expect(known.has('kai-sources')).toBe(true);
    expect(known.has('kai-tool')).toBe(true);
    expect(known.has('kai-reasoning')).toBe(true);
    expect(known.has('kai-artifact')).toBe(true);
    expect(known.has('kai-resizable')).toBe(true);
    expect(known.has('kai-voice-input')).toBe(true);
    expect(known.has('kai-file-upload')).toBe(true);
    expect(known.has('kai-attachments')).toBe(true);
  });

  /**
   * THE DERIVATION MOVING IS THE POINT, so it is asserted rather than absorbed.
   *
   * `kai-file-upload` / `kai-attachments` were in the negative list below for
   * this whole file's life: real registered elements that no archetype composed,
   * so `listCapabilityGroups()` did not report them and `renderSurface` had no
   * branch. The kit gained an `attachments` preset composing both, and this set
   * grew with no edit to `catalog.ts` or `features.ts` — which is the property
   * "derived, not restated" names. A hand-written list would have needed the
   * same hand to notice.
   */
  it('grew when the kit composed a new capability, with no edit here', () => {
    const known = rendererComponents();
    for (const component of ['kai-file-upload', 'kai-attachments']) {
      expect(
        known.has(component),
        `${component} is registered and composed by a kit preset, but the derived set does not ` +
          'report it — the CLI has stopped tracking the archetype catalog',
      ).toBe(true);
    }
  });

  it('does NOT claim components no renderer branches on', () => {
    // The whole point of the gate, and `kai-conversations` is what still proves
    // it: a real registered element that no archetype composes, so a components
    // list containing it is not an error — `renderSurface` accepts the list and
    // emits the tag bare, with nothing wired to it.
    const known = rendererComponents();
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

  /**
   * `attachments` USED to be this file's reported gap. It is not one any more,
   * and the replacement asserts WHY rather than just flipping the expected
   * string: the feature is emittable exactly because every component it names is
   * one the archetype catalog reports. Pinning that link means a future edit that
   * marks it available for some other reason — a special case, a hard-coded id —
   * still fails here.
   */
  it('routes attachments through the renderer, and only because the catalog says so', () => {
    const attachments = FEATURES.find((f) => f.id === 'attachments')!;
    const known = rendererComponents();
    for (const component of attachments.components) {
      expect(
        known.has(component),
        `${component} is not in the derived renderer set, so 'attachments' must not be offered`,
      ).toBe(true);
    }
    expect(featureEmit(attachments, react)).toBe('renderer');
    expect(availableFeatures(react).map((f) => f.id)).toContain('attachments');
  });

  /**
   * THE REPORTED GAP THAT REMAINS, and it is a different KIND of gap from the one
   * `attachments` was: not "nothing renders these components" but "only a
   * hand-written starter composes this surface". `renderSurface` has no
   * `kai-conversations` branch, so a framework with no composed workspace shell
   * has no way to produce the sidebar — Next, TanStack Start and Solid are the
   * three, and this is what stops the CLI emitting them a project that runs
   * without the feature they asked for.
   *
   * Asserted over ALL non-composed frameworks rather than one, so turning a
   * composed shell on for one of them does not quietly leave the other two
   * unchecked.
   */
  it('reports conversation history as unavailable wherever no composed starter exists', () => {
    const conversations = FEATURES.find((f) => f.id === 'conversations')!;
    const nonComposed = FRAMEWORKS.filter((f) => !f.composedWorkspace);
    expect(
      nonComposed.map((f) => f.id),
      'every framework now has a composed workspace, so this gap is closed and this test has no subject',
    ).not.toHaveLength(0);
    for (const framework of nonComposed) {
      expect(featureEmit(conversations, framework), `${framework.id}`).toBe('unavailable');
      expect(availableFeatures(framework).map((f) => f.id)).not.toContain('conversations');
    }
  });

  /**
   * THE COMPONENTS-BASED UNAVAILABILITY PATH, WHICH NO SHIPPED FEATURE TRIPS ANY
   * MORE — stated plainly rather than left to look like coverage it is not.
   *
   * Every feature in `FEATURES` now names components the catalog reports, so the
   * `unavailable` branch in `featureEmit` that reads `rendererComponents()` has
   * no subject in the shipped catalog. Deleting the test would drop the guard on
   * a branch that is still live and still the thing standing between a user and
   * a project that silently lacks what they picked; keeping it pointed at a
   * shipped feature would mean inventing a gap that does not exist.
   *
   * So it drives the pure function with a SYNTHETIC feature. That tests the
   * mechanism honestly and claims nothing about the product, and the second
   * assertion records the current state of the catalog so that a real
   * components-unavailable feature landing later is visible rather than silent.
   */
  it('refuses a feature whose components no renderer branches on (mechanism, no shipped subject)', () => {
    const synthetic = {
      id: 'not-a-shipped-feature',
      label: 'Synthetic',
      hint: 'exists only in this test',
      components: ['kai-conversations'],
      default: false,
    } as const;
    expect(featureEmit(synthetic, react)).toBe('unavailable');

    // The state of the real catalog, recorded. If this ever fails, a shipped
    // feature has become components-unavailable and deserves its own test.
    const componentsUnavailable = FEATURES.filter(
      (f) => featureEmit(f, react) === 'unavailable',
    ).map((f) => f.id);
    expect(componentsUnavailable).toEqual([]);
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

  /**
   * Was `resolveSurface(['attachments'], react)`, which is now a legal request.
   * The subject moved to the gap that is still real: `conversations` on a
   * framework with no composed workspace shell. Reachable by a user —
   * `--framework nextjs` is accepted by the arg parser, not filtered to the
   * ready set — so this is a live refusal, not dead code.
   *
   * The reason is asserted, not just `ok === false`. Three later checks in
   * `generate` also refuse, and a bare falsy assertion would pass if this one
   * stopped firing and a different rule caught the request instead.
   */
  it('refuses an unavailable feature', () => {
    const next = getFramework('nextjs')!;
    const result = resolveSurface(['conversations'], next);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/cannot be emitted/);
      expect(result.reason).toMatch(/hand-composed workspace starter/);
      // The message must not blame the renderer for `kai-resizable`, which a
      // renderer plainly does branch on — the sentence this replaces did.
      expect(result.reason).not.toMatch(/no renderer branches on .*kai-resizable/);
    }
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
