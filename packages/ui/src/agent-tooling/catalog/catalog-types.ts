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

export const Invariant = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  statement: z.string().min(1),
  appliesTo: z.object({
    tags: z.array(z.string()).optional(),
    parts: z.array(z.string()).optional(),
    targets: z.array(DeliveryTarget).optional(),
  }),
  enforcedBy: EnforcedBy,
  status: z.enum(['enforced', 'open']),
  diagnosis: z.array(Diagnosis).default([]),
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
  wiring: z.array(WiringEdge),
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
  props: z.array(z.object({ name: z.string(), scalar: z.boolean(), optional: z.boolean() })),
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
  // .min(1) because the tree HAS protocol exceptions (measured: two). An empty
  // array means the extractor broke, and a broken extractor that parses clean
  // would silently gut spec §5's exception list.
  eventExceptions: z.array(EventException).min(1),
});

export type TInvariant = z.infer<typeof Invariant>;
export type TSurfaceRecipe = z.infer<typeof SurfaceRecipe>;
export type TScenario = z.infer<typeof Scenario>;
export type TInventoryEntry = z.infer<typeof InventoryEntry>;
export type TPartConsumption = z.infer<typeof PartConsumption>;
export type TDerivedCatalog = z.infer<typeof DerivedCatalog>;
