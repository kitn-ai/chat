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
    // Widened progressively: fullscreen/aside/split landed in Task 12, custom in Task 13.
    layout: z.enum(['widget', 'fullscreen', 'aside', 'split', 'custom']),
    provider: ProviderSchema,
    theme: z
      .object({
        /** Any CSS color; becomes --kai-color-primary on the host. */
        accent: z.string().optional(),
        mode: z.enum(['light', 'dark', 'system']).default('system'),
      })
      .strict()
      .optional(),
    // Capability vocabulary, widened one field at a time by later tasks.
    capabilities: z
      .object({
        /** Starter prompts shown on the empty thread; clicking one sends it.
         *  1-6 non-empty strings — construct-authored text, escaped like
         *  `theme.accent`/`provider.url` at every emit interpolation site. */
        starters: z.array(z.string().min(1)).min(1).max(6).optional(),
        /** Enables the paperclip attach affordance; accept is a non-empty
         *  list of media types/globs, e.g. ["image/*", "application/pdf"] —
         *  WHETHER stays with the construct author (this field), HOW stays
         *  with the kit (ChatThread's own attach/accept props, threaded
         *  through by codegen). */
        attachments: z
          .object({
            /** Accept-list of media types/globs, e.g. ["image/*", "application/pdf"]. */
            accept: z.array(z.string().min(1)).min(1),
          })
          .strict()
          .optional(),
        /** Conversation persistence. `none` (default, nothing emitted): the
         *  thread lives only in memory for the tab's lifetime. `local`:
         *  persisted to this browser's localStorage, keyed by the construct's
         *  tag — a mechanism decision (WHERE); what to retain and for how
         *  long stays an app decision (component-scope-boundary), so no
         *  retention count/quota lands here. `endpoint`: the CONSUMER's own
         *  thread route (GET returns ChatMessage[], PUT stores them) —
         *  requires `url`; `url` is rejected for any other persistence
         *  (superRefine below, both directions loud). */
        history: z
          .object({
            persistence: z.enum(['none', 'local', 'endpoint']),
            /** endpoint persistence only: the CONSUMER's thread routes (GET returns
             *  ChatMessage[], PUT stores them). Refined below. */
            url: z.string().min(1).optional(),
          })
          .strict()
          .optional(),
        /** How the model's thinking (reasoning parts) renders. `'full'`
         *  (the default when omitted — see codegen.ts's emitReasoningProp)
         *  is the collapsible "Thinking" disclosure, shimmering while it
         *  streams. `'compact'` shows only a shimmer/typing loader while
         *  reasoning streams, with no expandable detail. `'off'` hides
         *  reasoning entirely. This is HOW an existing medium fact (the
         *  model's thinking) displays — the kit's call — so it maps straight
         *  onto ChatThread's own `reasoning` prop; there is no app-layer
         *  quota or retention decision hiding in it. Left `.optional()`
         *  rather than `.default('full')`, matching every sibling field in
         *  this object: a zod `.default()` here would make `reasoning`
         *  REQUIRED on the inferred input type (z.infer is the output type),
         *  breaking every `capabilities: {...}` object literal in this file
         *  and its tests that doesn't mention it. */
        reasoning: z.enum(['full', 'compact', 'off']).optional(),
      })
      .strict()
      .optional(),
    /** Named generative-UI card definitions the model can emit as tool calls,
     *  rendered in the thread. Top-level (not a capability): a card is
     *  something the construct's model can DO at any point once a card is
     *  declared, not a thread-affordance toggle like starters/attachments/
     *  reasoning. Reuses the kit's own card-tool projection end to end
     *  (`cardTools`/`toOpenAITools`/`toAnthropicTools`, `@kitn.ai/ui/schemas`)
     *  — never a second one authored here. `schema` is validated structurally
     *  only; deep card validation (incl. `x-kai-format` mask hints) is the
     *  kit's own card contract at render time. */
    cards: z
      .array(
        z
          .object({
            /** Tool-facing card name, e.g. "refund_approval". */
            name: z.string().regex(/^[a-z][a-z0-9_]*$/),
            /** The kit's card schema JSON (incl. x-kai-format mask hints).
             *  Validated structurally here; deep card validation is the kit's
             *  own card contract at render time. */
            schema: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .min(1)
      .optional(),
    /** Named `<slot>` projection points the emitted web component exposes —
     *  the format's ONLY escape hatch (named slots, no code-in-JSON). Each
     *  name must be a valid HTML slot-attribute value AND a legible
     *  identifier: kebab-case, starting with a letter (the same shape as a
     *  CSS custom-ident) — `slot name="Header!"` is rejected, not sanitized,
     *  matching the format's loud-rejection discipline everywhere else.
     *  1-8 entries, no duplicates (superRefine below — a regex alone can't
     *  see across array entries). `layout: 'custom'` requires at least one
     *  declared slot (superRefine below): `custom` IS the slots grain — a
     *  `custom` layout with nothing to project into is not meaningfully
     *  different from `fullscreen`. */
    slots: z
      .array(z.string().regex(/^[a-z][a-z0-9-]*$/, 'slot names must be kebab-case, starting with a letter'))
      .min(1)
      .max(8)
      .optional(),
    /** Layout-scoped FAB chrome, `layout: 'widget'` only (superRefine below).
     *  Purely additive sibling to `layout` (widen-never-restructure) — mirrors
     *  Dock's own props verbatim, threaded through by codegen's emitLayoutOpen. */
    widget: z
      .object({
        /** Which corner. Mirrors Dock's own DockPosition enum verbatim — not a
         *  new left/right binary. Omitted keeps Dock's own default (bottom-end). */
        position: z.enum(['bottom-end', 'bottom-start', 'top-end', 'top-start']).optional(),
        /** An image URL for the closed-state launcher glyph, replacing Dock's
         *  built-in chat-bubble icon. Construct-authored/untrusted text, like
         *  theme.accent and provider.url — escaped the same way at its one emit site. */
        launcherIcon: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((construct, ctx) => {
    if (construct.slots) {
      const seen = new Set<string>();
      construct.slots.forEach((name, i) => {
        if (seen.has(name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['slots', i],
            message: `duplicate slot name "${name}"`,
          });
        }
        seen.add(name);
      });
    }
    if (construct.layout === 'custom' && (!construct.slots || construct.slots.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slots'],
        message: '"custom" layout requires at least one declared slot — custom IS the slots grain',
      });
    }
    if (construct.widget && construct.layout !== 'widget') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['widget'],
        message: '"widget" is only valid on layout: "widget"',
      });
    }
    const history = construct.capabilities?.history;
    if (!history) return;
    if (history.persistence === 'endpoint' && !history.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities', 'history', 'url'],
        message: '"endpoint" persistence requires a url',
      });
    }
    if (history.persistence !== 'endpoint' && history.url !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities', 'history', 'url'],
        message: 'url is only valid with "endpoint" persistence',
      });
    }
  });

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
