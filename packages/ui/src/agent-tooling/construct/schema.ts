/**
 * The construct format, v1 — Zod is the SINGLE SOURCE OF TRUTH.
 *
 * The published JSON Schema (apps/docs/public/schemas/construct/v1.json) and the
 * checked-in construct.v1.schema.json are DERIVED from this object by
 * scripts/gen-construct-schema.mjs (build:api, drift-guarded). Never edit those
 * by hand; never restate an enum from here anywhere else — read it off
 * `ConstructSchema.shape` or the generated artifact.
 *
 * Format rules (spec, binding): vocabulary never logic — no handlers, no
 * expressions; `.strict()` everywhere so an unknown key is a loud rejection,
 * not a silently ignored one. No secrets, no client: `provider` can name a URL
 * and a wire format, nothing else.
 */
import { z } from 'zod';

export const CONSTRUCT_SCHEMA_URL = 'https://ui.kitn.ai/schemas/construct/v1.json';

/** A valid custom-element tag: lowercase, starts with a letter, contains a hyphen. */
const TAG_RE = /^[a-z][a-z0-9]*-[a-z0-9-]+$/;

const ProviderSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('mock') }).strict(),
  z
    .object({
      mode: z.literal('endpoint'),
      /** The CONSUMER's chat route. Kit parses, consumer fetches. */
      url: z.string().min(1),
      wire: z.enum(['openai', 'anthropic']),
    })
    .strict(),
]);

export const ConstructSchema = z
  .object({
    $schema: z.string().optional(),
    /** The emitted tag: <acme-support>. Must satisfy customElements.define. */
    name: z
      .string()
      .regex(TAG_RE, 'must be a valid custom-element tag: lowercase, with a hyphen (e.g. "acme-support")'),
    // Widened progressively: fullscreen/aside/split land in Task 12, custom in Task 13.
    layout: z.enum(['widget']),
    provider: ProviderSchema,
    theme: z
      .object({
        /** Any CSS color; becomes --kai-color-primary on the host. */
        accent: z.string().optional(),
        mode: z.enum(['light', 'dark', 'system']).default('system'),
      })
      .strict()
      .optional(),
  })
  .strict();

export type Construct = z.infer<typeof ConstructSchema>;

export interface ConstructProblem {
  /** Dotted path into the construct, '' for the root. */
  path: string;
  message: string;
}

export type ValidationOutcome =
  | { ok: true; construct: Construct }
  | { ok: false; problems: ConstructProblem[] };

/**
 * Validate one construct. The ONLY doorway to codegen: a failure never reaches
 * generation — the problems go back to the author/agent with paths and reasons.
 */
export function validateConstruct(input: unknown): ValidationOutcome {
  const parsed = ConstructSchema.safeParse(input);
  if (parsed.success) return { ok: true, construct: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.flatMap((issue) => {
      // zod's unrecognized-key issue names the keys in its message but paths the
      // OBJECT; surface each unknown key as its own problem so the agent sees
      // exactly which word is not vocabulary.
      if (issue.code === 'unrecognized_keys') {
        return issue.keys.map((key) => ({
          path: [...issue.path.map(String), key].join('.'),
          message: `"${key}" is not construct vocabulary`,
        }));
      }
      return [
        {
          path: issue.path.map(String).join('.'),
          message: issue.message,
        },
      ];
    }),
  };
}
