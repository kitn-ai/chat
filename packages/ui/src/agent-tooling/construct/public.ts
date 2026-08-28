/**
 * The public `@kitn.ai/ui/construct` export surface (dist/construct.js).
 *
 * Zod stays the single source of truth for the construct format (see
 * schema.ts's header) — this re-export is what lets a BUILD-TIME consumer
 * (create-kai's wizard, Task 2 of this round) validate a construct against the
 * exact same schema the `kai` CLI and the MCP `construct` tool use, without
 * hand-deriving a second copy the way the reference harness had to for the
 * card schemas (see verify-schemas-exported.mjs's header for that history).
 *
 * Deliberately NOT added to the existing `./schemas` entry: that entry's
 * source documents a size budget it holds itself to, and zod does not fit it.
 * `./construct` is its own exports key for exactly that reason.
 */
export {
  ConstructSchema,
  validateConstruct,
  CONSTRUCT_SCHEMA_URL,
  type Construct,
  type ConstructProblem,
  type ValidationOutcome,
} from './schema';
