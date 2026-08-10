// PATH B: generative UI via STRUCTURED OUTPUTS.
//
// The spec's open product question is "where do cards come from: a dedicated
// tool the model calls, or structured output?". `~deepseek/deepseek-v4-flash-latest`
// supports both, so the spike runs both and compares them. This file is Path B.
//
// The schema is HAND-DERIVED from the kit's confirm-card contract
// (`ConfirmCardData` in packages/ui/src/components/confirm-card.tsx) because the
// kit's own JSON Schemas (which exist, at
// `packages/ui/src/primitives/card-schemas/confirm.schema.json`) are NOT
// reachable through the package `exports` map. See ../FINDINGS.md, section
// "The card JSON Schemas are built but not exported".
import type { CardEnvelope } from '@kitn.ai/ui';

/** One confirm action button. Every property is in `required` because strict
 *  JSON-schema mode forbids optional keys. */
const CONFIRM_ACTION_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Stable action id, e.g. "approve" or "cancel".' },
    label: { type: 'string', description: 'Button text.' },
    style: {
      type: 'string',
      enum: ['primary', 'default', 'destructive'],
      description: 'Exactly one action should be "primary" (or "destructive" for a dangerous one).',
    },
  },
  required: ['id', 'label', 'style'],
  additionalProperties: false,
} as const;

const CONFIRM_ENVELOPE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['confirm'] },
    id: { type: 'string', description: 'Unique id for this card, e.g. "card-1".' },
    title: { type: 'string', description: 'Card heading.' },
    data: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'One or two sentences describing what will happen.' },
        tone: { type: 'string', enum: ['default', 'warning', 'danger'] },
        dismissible: { type: 'boolean' },
        actions: {
          type: 'array',
          description: 'Between one and four buttons.',
          items: CONFIRM_ACTION_SCHEMA,
        },
      },
      required: ['body', 'tone', 'dismissible', 'actions'],
      additionalProperties: false,
    },
  },
  required: ['type', 'id', 'title', 'data'],
  additionalProperties: false,
} as const;

/**
 * The response_format schema.
 *
 * NOTE the wrapper. `response_format` constrains the WHOLE assistant message, so
 * a bare envelope schema would mean the model can never speak prose again. The
 * only workable shape is `{ reply, card }`, which is itself a finding: with
 * structured outputs the chat text and the generative UI have to share one
 * schema, and the kit has no type for "a message that carries both".
 */
export const REPLY_WITH_CARD_SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description: 'The prose answer shown in the chat thread. Markdown allowed. Never JSON.',
    },
    card: {
      description: 'An approval card to render, or null when the request needs no approval.',
      anyOf: [CONFIRM_ENVELOPE_SCHEMA, { type: 'null' }],
    },
  },
  required: ['reply', 'card'],
  additionalProperties: false,
} as const;

/**
 * The `response_format` value, in the HTTP wire shape.
 *
 * `json_schema` is SNAKE_CASE. It used to be `jsonSchema` because
 * `@openrouter/sdk` camelCased its inputs and serialised them on the way out;
 * the SDK is gone and the proxy now JSON.stringifies this object straight into
 * the request body, so the field name is the one the API reads.
 */
export const REPLY_WITH_CARD_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'kai_reply_with_card',
    description: 'A chat reply plus an optional @kitn.ai/ui confirm CardEnvelope.',
    strict: true,
    schema: REPLY_WITH_CARD_SCHEMA as unknown as Record<string, unknown>,
  },
};

export interface ReplyWithCard {
  reply: string;
  card?: CardEnvelope;
}

/**
 * Validate a structured-output payload down to a real `CardEnvelope`.
 *
 * Deliberately hand-written and strict: this is the "how gracefully does Path B
 * fail" half of the comparison. The kit exports `validateAgainstSchema`, but not
 * the card schemas to feed it, so a consumer ends up writing this by hand.
 */
export function parseReplyWithCard(raw: string): { value?: ReplyWithCard; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `Structured output was not valid JSON: ${(e as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'Structured output was not a JSON object.' };
  }
  const obj = parsed as Record<string, unknown>;
  const reply = typeof obj.reply === 'string' ? obj.reply : '';
  if (!reply) return { error: 'Structured output had no `reply` string.' };

  const rawCard = obj.card;
  if (rawCard == null) return { value: { reply } };
  if (typeof rawCard !== 'object' || Array.isArray(rawCard)) {
    return { error: '`card` was present but not an object.' };
  }

  const c = rawCard as Record<string, unknown>;
  if (c.type !== 'confirm') return { error: `Unsupported card type "${String(c.type)}".` };
  const data = c.data;
  if (!data || typeof data !== 'object') return { error: '`card.data` was missing.' };
  const d = data as Record<string, unknown>;
  const actions = Array.isArray(d.actions) ? d.actions : [];
  if (actions.length === 0) return { error: '`card.data.actions` was empty; kai-confirm needs 1–4 actions.' };

  const envelope: CardEnvelope = {
    type: 'confirm',
    id: typeof c.id === 'string' && c.id ? c.id : `card-${Date.now()}`,
    title: typeof c.title === 'string' ? c.title : undefined,
    data: {
      body: typeof d.body === 'string' ? d.body : '',
      tone: d.tone === 'warning' || d.tone === 'danger' ? d.tone : 'default',
      dismissible: d.dismissible !== false,
      // The kit renders at most 4; the model is told 1–4 but is not bound by it.
      actions: actions.slice(0, 4).map((a, i) => {
        const act = (a ?? {}) as Record<string, unknown>;
        return {
          id: typeof act.id === 'string' && act.id ? act.id : `action-${i}`,
          label: typeof act.label === 'string' && act.label ? act.label : `Option ${i + 1}`,
          style: act.style === 'primary' || act.style === 'destructive' ? act.style : 'default',
          ...(i === 0 ? { default: true } : {}),
        };
      }),
    },
  };
  return { value: { reply, card: envelope } };
}

/** Extra system guidance used only in structured-output mode. */
export const STRUCTURED_SYSTEM_SUFFIX = [
  '',
  'You MUST answer with a JSON object matching the given schema.',
  'Put your prose answer in `reply` (markdown, never JSON).',
  'Set `card` to an approval card ONLY when the user asked you to do something with a side effect',
  '(deploy, delete, send, publish). Otherwise set `card` to null.',
].join('\n');
