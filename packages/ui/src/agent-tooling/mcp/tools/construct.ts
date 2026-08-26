import { z } from 'zod';
import type { Tool } from './types';
import { validateConstruct, CONSTRUCT_SCHEMA_URL } from '../../construct/schema';

/**
 * construct — turn-by-turn authoring of a kitn construct (one JSON file → one
 * web component). Stateless by design: the HARNESS owns the construct file;
 * every call carries the full construct for THIS turn — that is what makes
 * turn 40 safe, there is no server-side draft to corrupt.
 *
 * Two entry shapes: `intent` alone returns a STARTER construct plus the
 * real-choice questions the intent leaves open (menu-honesty: never ask a
 * question the intent already answers). `construct` (optionally with
 * `intent`) validates — rejection is a NORMAL, non-error result, not a thrown
 * error, because an invalid turn does not change the file: the previous good
 * construct still stands.
 *
 * NOTE on the advertised schema: `Tool.inputSchema` is a plain `z.ZodObject`,
 * and both `server.ts` (`z.toJSONSchema`) and `validate-args.ts`
 * (`schema.shape`) need that exact shape — a `.superRefine` wrapper is a
 * `ZodEffects`-like type with no `.shape`, so it can't be `tool.inputSchema`.
 * The advertised schema therefore stays a plain `.strict()` object; the
 * "at least one of intent/construct" rule is enforced here in the handler
 * with the same message the skeleton's superRefine would have produced.
 */

const inputSchema = z
  .object({
    intent: z
      .string()
      .min(1)
      .optional()
      .describe('What the author wants, in their words. Alone: returns a starter construct.'),
    construct: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('The FULL construct JSON for this turn. The harness owns the file; send all of it every turn.'),
  })
  .strict();

function starterFor(intent: string) {
  // Derive what the intent already implies; ask only what it leaves open.
  const impliesWidget = /widget|embed|bubble|corner|launcher/i.test(intent);
  const name = 'my-chat'; // real-choice: always ask for the tag name (it is theirs)
  return {
    construct: {
      $schema: CONSTRUCT_SCHEMA_URL,
      name,
      layout: 'widget',
      provider: { mode: 'mock' },
    },
    stated: impliesWidget ? ['layout: widget (implied by your request)'] : [],
    questions: [
      `What should the element tag be? (kebab-case, e.g. "acme-support"; using "${name}" until you say)`,
      ...(impliesWidget ? [] : ['Layout: widget, fullscreen, aside, split, or custom?']),
    ],
  };
}

export const constructTool: Tool = {
  name: 'construct',
  description:
    'Author a kitn construct (one JSON file → one web component) turn by turn. ' +
    'Send the full construct each turn; invalid turns come back REJECTED with per-path reasons and the previous good construct stands. ' +
    `Schema: ${CONSTRUCT_SCHEMA_URL}. Preview with "kai dev <file>".`,
  inputSchema,
  handler: async (args) => {
    const { intent, construct } = args as { intent?: string; construct?: Record<string, unknown> };

    if (!intent && !construct) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'construct: pass intent, construct, or both' }],
      };
    }

    if (!construct) {
      const s = starterFor(intent ?? '');
      return {
        content: [
          {
            type: 'text',
            text: [
              'STARTER construct (mock provider — keyless, previews immediately):',
              '```json',
              JSON.stringify(s.construct, null, 2),
              '```',
              ...s.stated,
              ...s.questions,
            ].join('\n'),
          },
        ],
      };
    }

    const out = validateConstruct(construct);
    if (!out.ok) {
      return {
        content: [
          {
            type: 'text',
            text: [
              'REJECTED — this turn does not change the file; the previous good construct stands.',
              ...out.problems.map((p) => `  ${p.path || '(root)'}: ${p.message}`),
            ].join('\n'),
          },
        ],
      };
    }

    const c = out.construct;
    return {
      content: [
        {
          type: 'text',
          text: [
            `VALID: <${c.name}> (${c.layout}, ${c.provider.mode}).`,
            '```json',
            JSON.stringify(c, null, 2),
            '```',
            `Preview: kai dev <file>. Compile: kai compile <file>.`,
            ...(c.provider.mode === 'endpoint'
              ? ['Backend route: use the scaffold tool — it emits a compiling route for your framework and wire.']
              : []),
          ].join('\n'),
        },
      ],
    };
  },
};
