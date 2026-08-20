import { z } from 'zod';

/**
 * The ONE argument-validation path for every AI/UI MCP tool. server.ts calls
 * this at dispatch, before any handler runs.
 *
 * Why it exists: every tool advertises `additionalProperties: false` and a
 * `required` list over the protocol, and dispatch used to enforce neither —
 * `request.params.arguments` went straight to the handler. The observed cost
 * (ladder spec candidate A, twice reproduced): `component_reference` called
 * with `{ element: "kai-chat" }` instead of `{ name: "kai-chat" }` silently
 * returned the full element index with `isError` unset — an answer to a
 * question nobody asked, indistinguishable from success. Decide loudly.
 *
 * Scope: unknown keys and missing required keys — the two failures the declared
 * schema promises to reject and the handler cannot see (an unknown key is
 * invisible to a handler that only reads the keys it knows). Value TYPES stay
 * with the handlers, which already own them with better context (e.g. the
 * provider guard in reference.ts, the registry checks in scaffold.ts).
 *
 * Everything here is DERIVED from the tool's zod schema — key list, requiredness
 * (does the key's schema accept `undefined`?), type words — never restated, so a
 * schema change moves the error text on its own.
 */

/** Levenshtein distance, for near-miss key suggestions ("framwork" → "framework"). */
function editDistance(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** A short type word for one property, read off the tool's advertised JSON Schema. */
function typeWord(prop: Record<string, unknown> | undefined): string {
  if (!prop) return 'value';
  if (Array.isArray(prop.enum)) return prop.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (prop.type === 'array') {
    const items = prop.items as Record<string, unknown> | undefined;
    return `array of ${typeof items?.type === 'string' ? items.type : 'values'}`;
  }
  return typeof prop.type === 'string' ? prop.type : 'value';
}

/**
 * Which schema key an unknown key most likely meant.
 *
 * 1. Spelling: edit distance ≤ 2 to a schema key ("framwork" → "framework").
 * 2. Value shape: if exactly one NOT-yet-supplied schema key accepts the value
 *    the caller passed, that's the one ("element": "kai-chat" → "name", because
 *    `name` takes a string and `provider`'s enum rejects it). Two candidates
 *    means guessing, so no suggestion — the expected-arguments block below the
 *    message still teaches.
 */
function suggestKey(
  unknownKey: string,
  value: unknown,
  shape: z.ZodRawShape,
  supplied: readonly string[],
): string | undefined {
  const keys = Object.keys(shape);
  let best: string | undefined;
  let bestDistance = 3; // accept ≤ 2
  for (const key of keys) {
    const d = editDistance(unknownKey.toLowerCase(), key.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = key;
    }
  }
  if (best !== undefined) return best;

  const byValue = keys.filter(
    (key) => !supplied.includes(key) && z.safeParse(shape[key] as z.ZodType, value).success,
  );
  return byValue.length === 1 ? byValue[0] : undefined;
}

/**
 * Validate `args` against a tool's declared zod object schema. Returns the full
 * teaching error text on failure, or `undefined` when the arguments conform.
 */
export function validateToolArgs(
  toolName: string,
  schema: z.ZodObject<z.ZodRawShape>,
  args: Record<string, unknown>,
): string | undefined {
  const shape = schema.shape;
  const keys = Object.keys(shape);
  const supplied = Object.keys(args);

  const problems: string[] = [];

  for (const key of supplied) {
    if (keys.includes(key)) continue;
    const suggestion = suggestKey(key, args[key], shape, supplied);
    problems.push(
      `unknown argument ${JSON.stringify(key)}` +
        (suggestion ? ` — did you mean ${JSON.stringify(suggestion)}?` : ''),
    );
  }

  for (const key of keys) {
    // Required = the key's own schema refuses `undefined`. Derived, not listed.
    if (!(key in args) && !z.safeParse(shape[key] as z.ZodType, undefined).success) {
      problems.push(`missing required argument ${JSON.stringify(key)}`);
    }
  }

  if (problems.length === 0) return undefined;

  // The expected-arguments block, from the same JSON Schema the tool advertises.
  const json = z.toJSONSchema(schema) as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  const required = new Set(json.required ?? []);
  const argLines = keys.map((key) => {
    const kind = required.has(key) ? 'required' : 'optional';
    return `  ${key} (${kind}) — ${typeWord(json.properties?.[key])}`;
  });

  return (
    `${toolName}: ${problems.join('; ')}.\n\n` +
    `Nothing was returned for this call — answering anyway could look like a reply ` +
    `to the question you meant to ask.\n\n` +
    `Expected arguments for ${toolName}:\n${argLines.join('\n')}`
  );
}
