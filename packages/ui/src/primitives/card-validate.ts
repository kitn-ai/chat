// src/primitives/card-validate.ts
// The single shared lean JSON-Schema validator the contract mandates. Covers the
// subset cards use; `x-*` keywords (incl. x-kai-*) are ignored. No ajv. Used at
// every boundary (incoming card data, outgoing payloads) by cards + both transports.

export interface JsonSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  minimum?: number; maximum?: number;
  exclusiveMinimum?: number; exclusiveMaximum?: number;
  minLength?: number; maxLength?: number;
  pattern?: string;
  minItems?: number; maxItems?: number;
  uniqueItems?: boolean;
  // x-* keywords (e.g. x-kai-widget) are allowed and ignored.
  [key: `x-${string}`]: unknown;
}

/**
 * One failed constraint, with the KEYWORD that failed kept separate from the prose.
 *
 * `errors` (the string form) is what every existing caller reads and it is unchanged.
 * This structured twin exists because the native card dispatcher has to TIER a
 * failure (a missing `required` field means the card cannot render, a `maxItems`
 * overrun means it renders five buttons instead of four), and the only honest way to
 * tell those apart is the keyword. Re-parsing the prose to recover it would be a
 * second, silently-drifting copy of the same fact.
 */
export interface ValidationIssue {
  /** Where, in readable form: `(root)`, `(root).actions`, `(root).actions[0].id`. */
  path: string;
  /** The JSON Schema keyword that failed. `required` for a missing property. */
  keyword: string;
  /** The human-readable message; identical to the matching entry in `errors`. */
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  /**
   * The same failures as `errors`, one-for-one and in the same order, with the
   * keyword and path kept as data. Added alongside `errors` rather than replacing
   * it so no existing caller changes.
   */
  issues: ValidationIssue[];
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function matchesType(v: unknown, t: NonNullable<JsonSchema['type']>): boolean {
  switch (t) {
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'array': return Array.isArray(v);
    case 'null': return v === null;
    case 'object': return typeOf(v) === 'object';
    default: return typeof v === t;
  }
}

function walk(schema: JsonSchema, value: unknown, path: string, issues: ValidationIssue[]): void {
  const at = path || '(root)';
  const fail = (keyword: string, message: string, where = at): void => {
    issues.push({ path: where, keyword, message: `${where}: ${message}` });
  };
  if (schema.type && !matchesType(value, schema.type)) {
    fail('type', `expected ${schema.type}, got ${typeOf(value)}`);
    return; // type wrong → downstream checks are meaningless
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    fail('const', `must equal const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    fail('enum', `must be one of ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail('minimum', `< minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail('maximum', `> maximum ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail('exclusiveMinimum', '<= exclusiveMinimum');
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail('exclusiveMaximum', '>= exclusiveMaximum');
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail('minLength', `shorter than minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail('maxLength', `longer than maxLength ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) fail('pattern', 'does not match pattern');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail('minItems', `fewer than minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail('maxItems', `more than maxItems ${schema.maxItems}`);
    if (schema.uniqueItems) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) fail('uniqueItems', 'items not unique');
    }
    if (schema.items) value.forEach((v, i) => walk(schema.items!, v, `${at}[${i}]`, issues));
  }
  if (typeOf(value) === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj) || obj[key] === undefined) fail('required', 'required', `${at}.${key}`);
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in obj && obj[key] !== undefined) walk(sub, obj[key], `${at}.${key}`, issues);
      }
    }
  }
}

/** Validate `value` against the lean JSON-Schema subset. */
export function validateAgainstSchema(schema: JsonSchema, value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  walk(schema, value, '', issues);
  return { valid: issues.length === 0, errors: issues.map((i) => i.message), issues };
}
