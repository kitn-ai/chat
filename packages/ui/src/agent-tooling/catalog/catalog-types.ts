import { z } from 'zod';

/** Surface changes appearance; target changes delivery. Two axes, never one. */
export const SurfaceArchetype = z.enum(['full-screen', 'widget', 'docked', 'inline', 'platform-embed']);
export const DeliveryTarget = z.enum(['bundler', 'script-tag']);

/** The three readers `src/wire/read.ts` exports. The drift lint (Task 7) resolves them. */
export const WireReader = z.enum(['readModelStream', 'readOpenAIStream', 'readAnthropicStream']);

/** BYO key: the endpoint is always the consumer's own. One swappable field by design. */
export const Backend = z.object({
  endpoint: z.literal('consumer-owned'),
  reader: WireReader,
});

/**
 * Tagged, because a bare path cannot honestly describe every invariant:
 * `none` is a REPORTED coverage gap, never a failure and never a fake path.
 */
export const EnforcedBy = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('test'), paths: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal('lint'), script: z.string() }),
  z.object({ kind: z.literal('structural'), path: z.string() }),
  z.object({ kind: z.literal('none'), until: z.string().optional() }),
]);

export const Diagnosis = z.object({ symptom: z.string(), cause: z.string() });

/**
 * One wrong/right pair, as CODE rather than prose. A weak model applies a
 * fragment it can pattern-match far more reliably than a sentence it has to
 * reason from, and the pairs are also mechanically searchable: the self-audit
 * checklist greps emitted code for the `wrong` form and expects zero hits. So
 * keep `wrong` a compact, literal, greppable fragment — not a paraphrase.
 */
export const InvariantExample = z.object({
  wrong: z.string().min(1),
  right: z.string().min(1),
  note: z.string().optional(),
});

export const Invariant = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  statement: z.string().min(1),
  appliesTo: z.object({
    tags: z.array(z.string()).optional(),
    parts: z.array(z.string()).optional(),
    targets: z.array(DeliveryTarget).optional(),
  }),
  enforcedBy: EnforcedBy,
  /**
   * `enforced` — a guard covers what the statement prescribes.
   * `partial`  — a guard covers PART of it and the rest is uncovered; the
   *              statement must say which half is which. Added because two
   *              records were `enforced` while their headline consumer-facing
   *              prescription had no check at all, and `status` is what a
   *              downstream tool reads when it does not read the prose.
   * `open`     — nothing covers it. Travels with `enforcedBy.kind === 'none'`,
   *              in both directions, asserted in invariants.test.ts.
   */
  status: z.enum(['enforced', 'partial', 'open']),
  diagnosis: z.array(Diagnosis).default([]),
  // `.default([])` mirrors `diagnosis` above for consistency, and nothing more:
  // it is NOT a compatibility affordance. `z.infer` makes `examples` required on
  // `TInvariant`, and the only caller is `listInvariants()` over an in-repo
  // literal — no external or serialized input reaches `Invariant.parse`, so
  // there is no unmigrated record for the default to rescue. What actually makes
  // the field mandatory is invariants.test.ts, which requires at least one pair
  // on EVERY record and constrains the shape of each.
  examples: z.array(InvariantExample).default([]),
});

/** One host-coordinates edge: this event on A sets this property on B. */
export const WiringEdge = z.object({
  from: z.string(),
  event: z.string(),
  to: z.string(),
  property: z.string(),
  note: z.string().optional(),
});

export const SurfaceRecipe = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  intent: z.string().min(1),
  archetypes: z.array(SurfaceArchetype).min(1),
  targets: z.array(DeliveryTarget).min(1),
  ingredients: z.array(z.string()).min(1),
  backend: Backend,
  // `.min(1)` like its siblings, and for a sharper reason than symmetry: an
  // empty `wiring` is what a recipe looks like when it makes NO host-coordinates
  // claim at all. Every wiring check in the drift lint is a loop over this
  // array, so emptying it deleted the topology from both recipes while the lint
  // went on printing "2 recipes ... resolved clean". The lint carries a readable
  // duplicate of this check so the failure is a message rather than a ZodError.
  wiring: z.array(WiringEdge).min(1),
  invariants: z.array(z.string()).min(1),
  corpus: z.array(z.string()).min(1),
});

export const InventorySort = z.enum(['surface', 'ingredient', 'corpus']);
export const InventoryEntry = z.object({
  title: z.string().min(1),
  sort: InventorySort,
  note: z.string().min(1),
});

export const ScenarioId = z.enum(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
export const Scenario = z.object({
  id: ScenarioId,
  prompt: z.string().min(1),
  needs: z.array(z.string()).min(1),
  depth: z.string().min(1),
  scoring: z.array(z.string()).min(1),
});

/** The derived layer's committed artifact. Task 3's generator writes it; Task 3's test parses it. */
export const DerivedElement = z.object({
  tag: z.string(),
  props: z.array(
    z.object({
      name: z.string(),
      scalar: z.boolean(),
      optional: z.boolean(),
      /**
       * The function-valued-property contract, which `scalar` does NOT encode:
       * `scalar: false` says "not an attribute", never "this is a callback you
       * must supply". Derived by the generator from element-meta.json's prop
       * type: strip a leading `undefined | `, then true iff the remainder
       * starts with `(` and contains `=>`. Deliberately not a bare
       * `includes('=>')`, which over-matches objects and arrays that merely
       * CONTAIN callbacks (kai-cards.policy, kai-toast-region.toasts).
       */
      fn: z.boolean(),
    }),
  ),
  events: z.array(z.string()),
  methods: z.array(z.string()),
  parts: z.array(z.string()),
  /** Spec §3 names both; element-meta.json already carries them. */
  composedFrom: z.array(z.string()),
  tokens: z.array(z.string()),
});

/**
 * Which MessagePart variants an element consumes. NOT derivable from any type
 * today, so spec §3's registered-copy rule applies: this is an explicit copy,
 * and Task 7's drift lint fails when the union gains a variant no record
 * accounts for. Registered in "Copies this plan creates" at the end of the plan.
 */
export const PartConsumption = z.object({
  tag: z.string(),
  consumes: z.array(z.string()).min(1),
});

export const EventException = z.object({
  file: z.string(),
  event: z.string(),
  bubbles: z.boolean(),
  composed: z.boolean(),
});

export const DerivedCatalog = z.object({
  elements: z.array(DerivedElement).min(1),
  // REGISTERED COPY: this floor restates MIN_VARIANTS, which lives in
  // scripts/lib/message-part-variants.mjs (Task 2) and cannot be imported into a
  // .ts module that also runs in the browser bundle. The generator asserts the
  // real MIN_VARIANTS; this is the schema-side backstop. If MIN_VARIANTS moves,
  // move this too — see "Copies this plan creates".
  partVariants: z.array(z.string()).min(4),
  integrations: z
    .array(z.object({ id: z.string(), category: z.string(), streamFormat: z.string(), keyExposure: z.string() }))
    .min(1),
  capabilityGroups: z.array(z.object({ id: z.string(), components: z.array(z.string()) })).min(1),
  themeTokens: z.array(z.string()).min(1),
  // .min(1) because the tree HAS deliberate protocol exceptions — events that
  // set bubbles or composed on purpose — so an empty array cannot be a true
  // reading of it: it means the extractor broke, and a broken extractor that
  // parses clean would silently gut spec §5's exception list.
  //
  // Deliberately no count here. The number is the extractor's to report, not
  // this comment's to restate: `npm run build:api` (its gen-catalog.mjs step)
  // prints the count as it writes, and the current set is the `eventExceptions`
  // array in src/agent-tooling/catalog/derived.json. A hand-typed figure here
  // would be stale the first time an element opts in or out, on the schema for
  // the very field whose exception list was wrong before.
  eventExceptions: z.array(EventException).min(1),
});

export type TInvariant = z.infer<typeof Invariant>;
export type TInvariantExample = z.infer<typeof InvariantExample>;
export type TSurfaceRecipe = z.infer<typeof SurfaceRecipe>;
export type TScenario = z.infer<typeof Scenario>;
export type TInventoryEntry = z.infer<typeof InventoryEntry>;
export type TPartConsumption = z.infer<typeof PartConsumption>;
export type TDerivedCatalog = z.infer<typeof DerivedCatalog>;
