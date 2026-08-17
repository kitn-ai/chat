/**
 * The reuse boundary and the availability gate.
 *
 * These assert that the CLI reads the kit's catalog rather than restating it,
 * and that a feature nothing can render is reported as unavailable rather than
 * emitted into a project that silently lacks it.
 */
import { describe, expect, it } from 'vitest';

import { WIRED_GATEWAYS, listGateways, mockIntegration, rendererComponents } from '../src/catalog';
import {
  FEATURES,
  GENERATED_SURFACES_WIRED,
  availableFeatures,
  featureEmit,
  featureUnavailableReason,
  resolveSurface,
  surfaceComponents,
} from '../src/features';
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

  /**
   * `wired` REPORTS `WIRED_GATEWAYS`, whatever is in it.
   *
   * This used to assert the set EQUALS `['mock']`, which made widening the CLI
   * fail a test whose subject is the reporting, not the roster. The repo's own
   * rule about restated lists applies to tests too: a roster written here goes
   * stale the moment the thing it mirrors moves, and the failure it produces
   * points at the wrong file. What is worth holding is the invariant — that the
   * flag and the set never disagree — plus the two properties below that would
   * actually be bugs.
   */
  it('reports `wired` from WIRED_GATEWAYS and nowhere else', () => {
    for (const gateway of listGateways()) {
      expect(gateway.wired).toBe(WIRED_GATEWAYS.has(gateway.integration.id));
    }
  });

  it('never wires a gateway the kit catalog does not have', () => {
    const known = new Set(listGateways().map((g) => g.integration.id));
    for (const id of WIRED_GATEWAYS) expect(known.has(id)).toBe(true);
  });

  it('always keeps the zero-config gateway wired', () => {
    // `mock` is what makes `--yes` produce a project that streams with no key
    // and no backend. Dropping it from the set would leave the default path
    // pointing at a gateway the CLI refuses.
    expect(WIRED_GATEWAYS.has('mock')).toBe(true);
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

  /**
   * A CAPABILITY FEATURE TAKES *BOTH* GATES, AND THIS TEST USED TO KNOW ONLY ONE.
   *
   * It asserted `featureEmit(...) === 'renderer'` for the five capability
   * features, and it was green in `0.1.4` while every one of them refused: the
   * assertion pinned "the archetype catalog composes every component this
   * feature names", the prompt read the same call as "this feature scaffolds",
   * and `generate()` — which has no generated-surface path at all — threw after
   * the last question. A test can only be as strong as the question it asks.
   *
   * So both halves are asserted separately, and the expected value is derived
   * from the declared state of the generator rather than written as a literal.
   * When `GENERATED_SURFACES_WIRED` flips, this test flips with it and keeps
   * pinning the catalog half either way.
   */
  it('reports a capability feature by the generator AND the catalog, not the catalog alone', () => {
    const known = rendererComponents();
    const capability = FEATURES.filter((f) => f.id !== 'conversations');
    expect(capability.length, 'no capability features — this asserted nothing').toBeGreaterThan(0);

    for (const feature of capability) {
      // The catalog half: every component is one `renderSurface` branches on.
      for (const component of feature.components) {
        expect(
          known.has(component),
          `${component} is not in the derived renderer set, so '${feature.id}' names a component ` +
            'no renderer emits',
        ).toBe(true);
      }
      // The generator half — the one 0.1.4 never asked about.
      expect(featureEmit(feature, react), feature.id).toBe(
        GENERATED_SURFACES_WIRED ? 'renderer' : 'unavailable',
      );
    }
  });

  /**
   * THE MENU, ASSERTED AS A MENU. `availableFeatures` is what `index.ts` renders
   * as options, so what it must never contain is a feature that cannot be
   * scaffolded — which is the whole of the shipped defect, stated once here and
   * proved end to end (through `generate()`, against the real templates) in
   * `menu-honesty.test.ts`.
   *
   * The non-empty assertion is not decoration: "offers nothing" and "offers only
   * what works" are otherwise the same green.
   */
  it('offers no feature the generator cannot emit, and offers something', () => {
    const offered = availableFeatures(react).map((f) => f.id);
    expect(offered, 'the menu is empty — every assertion about it is vacuous').not.toEqual([]);
    for (const id of offered) {
      expect(
        featureUnavailableReason(FEATURES.find((f) => f.id === id)!, react),
        `'${id}' is offered by the prompt and cannot be emitted`,
      ).toBeNull();
    }
    // And the state of this release, recorded: the capability features are
    // catalogued and withheld, not offered. This is what changes when the
    // generated-surface path lands.
    if (!GENERATED_SURFACES_WIRED) {
      expect(offered).toEqual(['conversations']);
    }
  });

  /**
   * THE GAP THAT CLOSED, RECORDED RATHER THAN DELETED.
   *
   * This used to loop over every `composedWorkspace: false` row and assert
   * `conversations` was reported unavailable there — Next, TanStack Start and
   * Solid were the three. It carried a vacuity guard saying, in as many words,
   * that an empty set means "this gap is closed and this test has no subject",
   * and the Next.js flip is what made that fire. It did its job: the failure is
   * how this edit was prompted rather than something a reader had to notice.
   *
   * What replaces it asserts the closure as a FACT about the shipped table, which
   * is the half that still has a subject. The MECHANISM — a framework with no
   * shell reports the feature unavailable — moved to the synthetic-row test in
   * the `resolveSurface` block, where no future flip can take its subject away.
   *
   * Kept live rather than deleted because it is the tripwire for the next row
   * added: land one with `composedWorkspace: false` and this fails, pointing at
   * both the row and the shell it still owes.
   */
  it('has a composed workspace behind every shipped framework, so conversations is offered by all of them', () => {
    const conversations = FEATURES.find((f) => f.id === 'conversations')!;
    expect(FRAMEWORKS.length, 'no frameworks — this asserted nothing').toBeGreaterThanOrEqual(8);
    const withoutShell = FRAMEWORKS.filter((f) => !f.composedWorkspace).map((f) => f.id);
    expect(
      withoutShell,
      'this row has no composed workspace starter, so `conversations` cannot be emitted for it — ' +
        'either give the starter a sidebar + thread + composer, or state the gap in its `note`',
    ).toEqual([]);
    for (const framework of FRAMEWORKS) {
      expect(featureEmit(conversations, framework), `${framework.id}`).toBe('composed');
      expect(availableFeatures(framework).map((f) => f.id)).toContain('conversations');
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
    // WHICH RULE CAUGHT IT IS THE POINT, now that two of them return
    // `unavailable`: this feature must be refused for its components, not for
    // the unwired generator, or the components branch has stopped being reached
    // and this test would pass without exercising it.
    expect(featureUnavailableReason(synthetic, react)).toMatch(
      /no renderer branches on kai-conversations/,
    );

    // The state of the real catalog, recorded — measured against the renderer
    // set directly rather than through `featureEmit`, which now also answers
    // `unavailable` for the generator gap and would make this read as a catalog
    // problem it is not. If this fails, a shipped feature names a component no
    // renderer emits and deserves its own test.
    const known = rendererComponents();
    const componentsUnavailable = FEATURES.filter(
      (f) => featureEmit(f, react) !== 'composed' && !f.components.every((c) => known.has(c)),
    ).map((f) => f.id);
    expect(componentsUnavailable).toEqual([]);
  });
});

describe('resolveSurface', () => {
  it('resolves the zero-config choice to the composed template', () => {
    const result = resolveSurface(['conversations'], react);
    expect(result.ok && result.surface.kind).toBe('composed');
  });

  /**
   * THESE TWO MOVED OFF `resolveSurface` ONTO `surfaceComponents`, AND THAT IS
   * THE HONEST PLACE FOR THEM.
   *
   * They used to drive `resolveSurface(['agentic'], react)` and read the
   * components off the returned surface. That path is closed while
   * `GENERATED_SURFACES_WIRED` is off — the feature gate refuses first — so as
   * written they asserted nothing reachable, and the second one asserted nothing
   * at all: every assertion sat inside `if (result.ok && kind === 'generated')`,
   * so a refusal ran the block to completion and passed. That is the shape this
   * repo keeps paying for.
   *
   * The list-building rule is still live machinery that the generated-surface
   * path will need, and de-duplication is exactly the sort of thing that comes
   * back wrong when it is wired months from now. So it is a named function and
   * these drive it directly: real coverage, no vacuity, no pretending the
   * surface can be resolved today.
   */
  it('leads a generated components list with kai-chat', () => {
    const agentic = FEATURES.find((f) => f.id === 'agentic')!;
    expect(surfaceComponents([agentic])).toEqual(['kai-chat', 'kai-tool', 'kai-reasoning']);
  });

  it('de-duplicates components shared by two features', () => {
    // artifacts and conversations both want kai-resizable; a duplicate tag in
    // the components list is a rendered element twice.
    const chosen = FEATURES.filter((f) => f.id === 'artifacts' || f.id === 'conversations');
    expect(chosen.length, 'both subjects must exist or the overlap is not exercised').toBe(2);
    const components = surfaceComponents(chosen);
    expect(new Set(components).size).toBe(components.length);
    expect(components.filter((c) => c === 'kai-resizable').length).toBe(1);
  });

  /**
   * A REQUEST THAT MIXES THE TWO PATHS IS STILL REFUSED, and the reason moved
   * one gate earlier — which is what the assertion now pins.
   *
   * It matched /cannot combine/, the rule that fires when a composed feature and
   * a generated one are BOTH resolvable. While the generated path is unwired the
   * generated feature is refused before that rule is reached, and the earlier
   * refusal is the better one: "pick one or the other" invited the user to
   * retry with `--features agentic`, which cannot work either.
   */
  it('refuses a composed feature mixed with a generated one, naming the deeper cause', () => {
    const result = resolveSurface(['conversations', 'agentic'], react);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/'agentic'/);
      expect(result.reason).toMatch(
        GENERATED_SURFACES_WIRED ? /cannot combine/ : /generated feature surfaces are not wired/,
      );
    }
  });

  /**
   * THE COMPOSED-ONLY UNAVAILABILITY PATH, DRIVEN BY A SYNTHETIC ROW — and the
   * reason is the same one the synthetic-FEATURE test below already gives.
   *
   * The subject was `attachments`, which became legal; then `conversations` on
   * `nextjs`, which was the last framework with no composed workspace shell. That
   * shell landed, so every shipped row is now `composedWorkspace: true` and the
   * refusal has no real subject left. Pointing it at another real row is not
   * available, and deleting it would drop the guard on a branch that is still
   * live: it is what stands between a user and a project that compiles, runs, and
   * silently lacks the sidebar they asked for. The NEXT framework someone adds
   * arrives with `composedWorkspace: false` and walks straight into it.
   *
   * So it drives the pure function with a synthetic row. That tests the mechanism
   * honestly and claims nothing about the shipped table; the assertion in
   * `availableFeatures` below records the table's current state separately, so a
   * real non-composed row landing later is visible rather than silent.
   *
   * The reason is asserted, not just `ok === false`. Three later checks in
   * `generate` also refuse, and a bare falsy assertion would pass if this one
   * stopped firing and a different rule caught the request instead.
   */
  it('refuses a composed-only feature on a framework with no composed starter (mechanism, no shipped subject)', () => {
    const noShell = { ...react, id: 'synthetic', label: 'Synthetic', composedWorkspace: false };
    const result = resolveSurface(['conversations'], noShell);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/cannot be emitted/);
      expect(result.reason).toMatch(/hand-composed workspace starter/);
      // The message must not blame the renderer for `kai-resizable`, which a
      // renderer plainly does branch on — the sentence this replaces did.
      expect(result.reason).not.toMatch(/no renderer branches on .*kai-resizable/);
    }
    // And the control, so this cannot pass by the feature having become
    // unavailable everywhere: the same request on the same row WITH a shell is
    // accepted.
    expect(resolveSurface(['conversations'], react).ok).toBe(true);
  });

  /**
   * THE EMPTY SELECTION IS AN ANSWER AND MUST NOT BE AN ERROR — which is what it
   * was, all the way to the user's terminal.
   *
   * This test said so and passed, because it only asked what `resolveSurface`
   * returned: a generated bare-`kai-chat` surface, which `generate()` then
   * refused. Deselecting everything in the prompt, and `--features none`, both
   * died after the last question. There is no bare-chat template to emit, so the
   * honest reply is the one surface this release has — with the part the user
   * did not ask for reported in `unasked` rather than slipped in.
   *
   * `menu-honesty.test.ts` drives the same selection through `generate()`, which
   * is the half this test cannot cover and the half that was broken.
   */
  it('answers an empty selection with the surface this release has, and says what it added', () => {
    const result = resolveSurface([], react);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.surface.kind).toBe('composed');
      if (result.surface.kind === 'composed') {
        expect(result.surface.features).toEqual(['conversations']);
        expect(
          result.surface.unasked,
          'the starter brought a feature nobody picked and nothing reports it',
        ).toEqual(['conversations']);
      }
    }
  });

  it('reports nothing unasked when the selection already names what the starter brings', () => {
    // The control on the assertion above: `unasked` must be a real difference,
    // not a constant.
    const result = resolveSurface(['conversations'], react);
    expect(result.ok && result.surface.kind === 'composed' && result.surface.unasked).toEqual([]);
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

  it('ships vue ready', () => {
    const vue = getFramework('vue')!;
    expect(vue.status).toBe('ready');
    // Vue is the representative of the four `elements` + composed-workspace
    // cells; svelte, angular and html share this shape and are next.
    expect(vue.registration).toBe('elements');
    expect(vue.composedWorkspace).toBe(true);
  });

  it('ships angular ready', () => {
    const angular = getFramework('angular')!;
    expect(angular.status).toBe('ready');
    expect(angular.registration).toBe('elements');
    expect(angular.composedWorkspace).toBe(true);
  });

  /**
   * Solid's row was wrong from the day it was written: it declared
   * `css: 'src/index.css'` while the starter's stylesheet has always been
   * `src/styles.css`. `scripts/build.mjs` cannot catch that while Solid is
   * `planned`, because it only walks READY templates — so the row is pinned
   * here instead, where being planned is not a reason to go unchecked.
   */
  it('points solid at the stylesheet its starter actually has', () => {
    expect(getFramework('solid')!.paths.css).toBe('src/styles.css');
  });

  /**
   * A `note` is what `--list` prints beside a framework to state the gap. On a
   * READY framework it is a leftover that contradicts the row it sits on — Vue's
   * said "not yet run end to end by this CLI" right up until it had been, and
   * nothing but reading the diff would have caught it staying.
   */
  it('states a gap for every planned framework and none for a ready one', () => {
    for (const framework of FRAMEWORKS) {
      if (framework.status === 'ready') {
        expect(framework.note, `${framework.id} is ready but still carries a note`).toBeUndefined();
      } else {
        expect(framework.note, `${framework.id} is planned with no stated reason`).toBeTruthy();
      }
    }
  });
});
