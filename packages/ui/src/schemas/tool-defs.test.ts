import { describe, expect, it, vi } from 'vitest';
import { cardFromToolCall, cardTypeFromToolName, KAI_TOOL_PREFIX } from './from-tool-call';
import { cardSchemaNames, cardSchemas, type CardSchema } from './index';
import { ANTHROPIC_STRICT, OPENAI_STRICT, checkProviderSubset } from './provider-subsets';
import {
  CARD_TOOL_DESCRIPTIONS,
  UnsupportedCardToolSchemaError,
  cardTools,
  toAnthropicTools,
  toJsonSchemaTools,
  toOpenAITools,
  type AnthropicToolDef,
  type JsonSchemaToolDef,
  type OpenAIToolDef,
} from './tool-defs';

/**
 * An INDEPENDENT reimplementation of what the projection strips, used as the oracle.
 *
 * Deliberately a second implementation and not an import. A test that calls the
 * function it is testing to compute its own expectation proves only that the
 * function is deterministic. This one is written from the rule ("drop `$schema`,
 * `$id` and anything `x-`, in schema positions only") rather than from the code.
 */
function stripMetaIndependently(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripMetaIndependently);
  if (typeof node !== 'object' || node === null) return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === '$schema' || k === '$id' || k.startsWith('x-')) continue;
    if (k === 'properties' || k === '$defs' || k === 'definitions') {
      // values are schemas, KEYS are arbitrary names and must survive verbatim
      const map = v as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(map)) next[name] = stripMetaIndependently(child);
      out[k] = next;
    } else if (k === 'items' || k === 'if' || k === 'then' || k === 'else' || k === 'not' || k === 'additionalProperties') {
      out[k] = typeof v === 'object' && v !== null ? stripMetaIndependently(v) : v;
    } else if (k === 'allOf' || k === 'anyOf' || k === 'oneOf') {
      out[k] = (v as unknown[]).map(stripMetaIndependently);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Every key that sits in a KEYWORD position, anywhere in the document.
 *
 * The distinction that matters: `properties`' keys are field names chosen by whoever
 * authored the card data, and `form`'s data is itself a JSON Schema, so it has fields
 * genuinely named `x-kai-order` and `properties`. Those are not keywords and must
 * never be judged as such. Written independently of the checker, for the same reason
 * `stripMetaIndependently` is.
 */
function schemaPositionKeys(node: unknown, acc: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) schemaPositionKeys(child, acc);
    return acc;
  }
  if (typeof node !== 'object' || node === null) return acc;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    acc.push(k);
    if (k === 'properties' || k === '$defs' || k === 'definitions') {
      for (const child of Object.values(v as Record<string, unknown>)) schemaPositionKeys(child, acc);
    } else if (['items', 'if', 'then', 'else', 'not', 'additionalProperties'].includes(k)) {
      schemaPositionKeys(v, acc);
    } else if (['allOf', 'anyOf', 'oneOf'].includes(k)) {
      schemaPositionKeys(v, acc);
    }
  }
  return acc;
}

const openai = () => cardTools({ provider: 'openai' });
const anthropic = () => cardTools({ provider: 'anthropic' });

describe('cardTools: the tool NAME', () => {
  it('prefixes every card type, from the one module that owns the convention', () => {
    for (const def of openai()) {
      expect(def.function.name.startsWith(KAI_TOOL_PREFIX)).toBe(true);
    }
    expect(openai().map((d) => d.function.name).sort()).toEqual([
      'kai_artifact',
      'kai_choice',
      'kai_confirm',
      'kai_embed',
      'kai_form',
      'kai_link',
      'kai_tasks',
    ]);
  });

  // The forward and inverse halves agreeing is not a nicety: a mismatch means the
  // model calls `kai_confirm`, the loop's parser does not recognise it, the call is
  // routed to `runTool`, and the card silently never appears.
  it('round-trips through the inverse for every card type', () => {
    for (const def of anthropic()) {
      const type = cardTypeFromToolName(def.name);
      expect(type).not.toBeNull();
      expect(cardSchemas).toHaveProperty(type as string);
    }
  });
});

describe('cardTools: the provider ENVELOPES are not interchangeable', () => {
  it('wraps OpenAI as { type:"function", function:{ name, description, parameters } }', () => {
    const def: OpenAIToolDef = openai()[0];
    expect(def.type).toBe('function');
    expect(Object.keys(def.function).sort()).toEqual(['description', 'name', 'parameters']);
    expect(def).not.toHaveProperty('input_schema');
  });

  it('wraps Anthropic as { name, description, input_schema } — NOT function.parameters', () => {
    const def: AnthropicToolDef = anthropic()[0];
    expect(Object.keys(def).sort()).toEqual(['description', 'input_schema', 'name']);
    expect(def).not.toHaveProperty('function');
    expect(def).not.toHaveProperty('parameters');
  });

  it('returns a bare { name, description, schema } for jsonschema', () => {
    const def = cardTools({ provider: 'jsonschema' })[0];
    expect(Object.keys(def).sort()).toEqual(['description', 'name', 'schema']);
  });

  it('carries the SAME projected schema into all three envelopes', () => {
    const byName = (name: string) => ({
      o: openai().find((d) => d.function.name === name)!.function.parameters,
      a: anthropic().find((d) => d.name === name)!.input_schema,
      j: cardTools({ provider: 'jsonschema' }).find((d) => d.name === name)!.schema,
    });
    const { o, a, j } = byName('kai_confirm');
    expect(o).toEqual(a);
    expect(a).toEqual(j);
  });

  it('the named helpers agree with cardTools', () => {
    expect(toOpenAITools()).toEqual(openai());
    expect(toAnthropicTools()).toEqual(anthropic());
    expect(toJsonSchemaTools()).toEqual(cardTools({ provider: 'jsonschema' }));
  });

  it('the one-argument form defaults to the built-in card schemas', () => {
    expect(cardTools({ provider: 'openai' })).toEqual(cardTools(cardSchemas, { provider: 'openai' }));
  });

  it('rejects a call with no provider', () => {
    // @ts-expect-error deliberately wrong, this is the runtime guard
    expect(() => cardTools(cardSchemas, {})).toThrow(/provider/);
  });
});

describe('cardTools: the non-strict projection (the default, and the proven mode)', () => {
  it('emits one tool per card type', () => {
    expect(openai()).toHaveLength(cardSchemaNames.length);
  });

  it('is EXACTLY the authored schema minus $schema, $id and x-* (jsonschema only — F-20 relaxes the openai/anthropic non-strict projections at the root)', () => {
    // Checked against an independently written stripper, not against the
    // implementation, so a bug in the projection cannot define its own expectation.
    for (const def of cardTools({ provider: 'jsonschema' })) {
      const type = cardTypeFromToolName(def.name) as keyof typeof cardSchemas;
      expect((def as JsonSchemaToolDef).schema).toEqual(stripMetaIndependently(cardSchemas[type]));
    }
  });

  it('keeps every constraint, because dropping one would silently widen the contract', () => {
    // A dropped `maxItems: 4` means the model emits six actions and the card renders
    // six buttons with nothing anywhere saying the contract was loosened.
    const confirm = anthropic().find((d) => d.name === 'kai_confirm')!.input_schema as Record<string, never>;
    const actions = (confirm.properties as Record<string, Record<string, unknown>>).actions;
    expect(actions.minItems).toBe(1);
    expect(actions.maxItems).toBe(4);
  });

  it('keeps descriptions, which is how the model learns the fields', () => {
    const link = anthropic().find((d) => d.name === 'kai_link')!.input_schema as Record<string, never>;
    expect((link.properties as Record<string, Record<string, unknown>>).url.description).toMatch(/Canonical destination/);
  });

  it('strips the vendor hints and the meta keywords from every KEYWORD position, nested included', () => {
    for (const def of cardTools({ provider: 'jsonschema' })) {
      const stripped = schemaPositionKeys(def.schema).filter(
        (k) => k === '$schema' || k === '$id' || k.startsWith('x-'),
      );
      expect(stripped, def.name).toEqual([]);
    }
  });

  // The counterpart, and the reason the check above walks positions instead of
  // grepping the JSON. `form`'s card data IS a JSON Schema, so it has properties
  // literally NAMED `x-kai-order`, `x-kai-submitLabel` and so on. Those are fields
  // the model fills in, not hints for our renderer, and stripping them would delete
  // half of what a form card can express. A blunt `not.toContain('"x-kai-')` fails
  // here, correctly, which is how this distinction got written down.
  it('keeps the form card\'s own x-kai-* FIELD names, which are data and not metadata', () => {
    const form = cardTools({ provider: 'jsonschema' }).find((d) => d.name === 'kai_form')!.schema as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(form.properties)).toContain('x-kai-order');
    expect(Object.keys(form.properties)).toContain('x-kai-submitLabel');
  });

  // The inverse maps tool input to `envelope.data` VERBATIM and sets no
  // `envelope.title`, on the grounds that CardEnvelope.title is host chrome that no
  // card-data schema offers the model. That is only true while this side hands over
  // the card-data schema unmodified at the property level.
  it('injects NO extra property, in particular no `title`, into any tool schema', () => {
    for (const def of anthropic()) {
      const type = cardTypeFromToolName(def.name) as keyof typeof cardSchemas;
      const authored = (cardSchemas[type] as CardSchema).properties as Record<string, unknown> | undefined;
      const projected = (def.input_schema as { properties?: Record<string, unknown> }).properties;
      expect(Object.keys(projected ?? {})).toEqual(Object.keys(authored ?? {}));
    }
    // `link` and `embed` DO have a `title` property, but it is theirs and it is the
    // media/page title, not envelope chrome. `confirm` must not have gained one.
    const confirm = anthropic().find((d) => d.name === 'kai_confirm')!.input_schema as { properties: object };
    expect(confirm.properties).not.toHaveProperty('title');
  });

  it('closes the loop: a tool call built from these definitions becomes an envelope', () => {
    const def = anthropic().find((d) => d.name === 'kai_confirm')!;
    const input = { body: 'Deploy to production?', actions: [{ id: 'go', label: 'Deploy' }] };
    const card = cardFromToolCall(def.name, input, { id: 'toolu_01' });
    expect(card).toEqual({ type: 'confirm', id: 'toolu_01', data: input });
  });
});

describe('cardTools: descriptions', () => {
  it('covers exactly the built-in card types, so an eighth card cannot ship undescribed', () => {
    expect(Object.keys(CARD_TOOL_DESCRIPTIONS).sort()).toEqual([...cardSchemaNames].sort());
  });

  it('describes what the card is FOR, not what the payload is', () => {
    for (const def of anthropic()) {
      expect(def.description.length).toBeGreaterThan(40);
      // the schema's own prose opens "Data payload for a ..." and is written for a
      // developer reading the contract, not for a model choosing a tool
      expect(def.description).not.toMatch(/^Data payload/);
    }
  });

  it('lets a registry override them', () => {
    const [def] = cardTools(
      { schemas: { confirm: cardSchemas.confirm }, descriptions: { confirm: 'Ask before you act.' } },
      { provider: 'anthropic' },
    );
    expect(def.description).toBe('Ask before you act.');
  });
});

describe('cardTools: a registry-shaped source (the Phase 2 seam)', () => {
  it('accepts { schemas } as well as a bare map, and generates for exactly what it is given', () => {
    const custom = {
      schemas: {
        'pricing-table': { type: 'object', properties: { plan: { type: 'string' } } } as unknown as CardSchema,
      },
    };
    const defs = cardTools(custom, { provider: 'anthropic' });
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('kai_pricing-table');
    // generate narrowly: nothing here refuses an unknown type, because the renderer
    // is the layer that can name an unknown type where a human will see it
    expect(cardTypeFromToolName(defs[0].name)).toBe('pricing-table');
  });
});

describe('cardTools: strict mode THROWS rather than downgrading', () => {
  it('names the card, the path and the keyword for embed under anthropic', () => {
    let err: UnsupportedCardToolSchemaError | undefined;
    try {
      cardTools({ embed: cardSchemas.embed }, { provider: 'anthropic', strict: true });
    } catch (e) {
      err = e as UnsupportedCardToolSchemaError;
    }
    expect(err).toBeInstanceOf(UnsupportedCardToolSchemaError);
    expect(err!.provider).toBe('anthropic');
    expect(err!.cards.map((c) => c.cardType)).toEqual(['embed']);
    // Anthropic SUPPORTS allOf. What embed actually trips on there is the `if`/`then`
    // inside it, plus the string and numeric constraints. Asserting the real keyword
    // rather than the one the plan predicted is the point of reading the docs.
    expect(err!.keywords).toContain('if');
    expect(err!.keywords).toContain('then');
    expect(err!.keywords).toContain('maxLength');
    expect(err!.keywords).toContain('pattern');
    expect(err!.keywords).toContain('minimum');
    expect(err!.keywords).not.toContain('allOf');
    expect(err!.message).toContain('kai_embed');
    expect(err!.message).toContain(ANTHROPIC_STRICT.source);
  });

  it('names `allOf` for the SAME card under openai, because that table differs', () => {
    let err: UnsupportedCardToolSchemaError | undefined;
    try {
      cardTools({ embed: cardSchemas.embed }, { provider: 'openai', strict: true });
    } catch (e) {
      err = e as UnsupportedCardToolSchemaError;
    }
    expect(err!.keywords).toContain('allOf');
    expect(err!.message).toContain(OPENAI_STRICT.source);
  });

  it('reports EVERY failing card in one throw, not one per fix-and-retry', () => {
    let err: UnsupportedCardToolSchemaError | undefined;
    try {
      cardTools({ provider: 'openai', strict: true });
    } catch (e) {
      err = e as UnsupportedCardToolSchemaError;
    }
    // Today that is all seven, on both providers. That is the measured state of the
    // authored schemas against the two documented subsets, not a defect in here: see
    // the tool-defs.ts header. If a schema is ever made strict-compatible this count
    // drops and this test says so.
    expect(err!.cards.map((c) => c.cardType).sort()).toEqual([...cardSchemaNames].sort());
    for (const card of err!.cards) expect(card.violations.length).toBeGreaterThan(0);
  });

  it('every keyword it names actually occurs in the authored schema', () => {
    // Guards against a phantom keyword: an error that names something the document
    // does not contain would be worse than no error, because it sends the developer
    // looking for a line that is not there.
    for (const provider of ['openai', 'anthropic'] as const) {
      let err: UnsupportedCardToolSchemaError | undefined;
      try {
        cardTools({ provider, strict: true });
      } catch (e) {
        err = e as UnsupportedCardToolSchemaError;
      }
      for (const card of err!.cards) {
        const doc = JSON.stringify(cardSchemas[card.cardType as keyof typeof cardSchemas]);
        for (const v of card.violations) {
          // `type`, `required` and `additionalProperties` are the structural rules;
          // they are reported for what is MISSING, so they need not appear.
          if (['type', 'required', 'additionalProperties', 'properties'].includes(v.keyword)) continue;
          expect(doc, `${card.cardType}: ${v.keyword}`).toContain(`"${v.keyword}"`);
        }
      }
    }
  });

  it('never emits something its own subset table would reject', () => {
    // The self-consistency property. Anything that DOES survive strict projection
    // must come back clean from the checker, or the projection is producing 400s.
    for (const [provider, subset] of [
      ['openai', OPENAI_STRICT],
      ['anthropic', ANTHROPIC_STRICT],
    ] as const) {
      for (const type of cardSchemaNames) {
        let defs;
        try {
          defs = cardTools({ [type]: cardSchemas[type] }, { provider, strict: true });
        } catch (e) {
          expect(e).toBeInstanceOf(UnsupportedCardToolSchemaError);
          continue;
        }
        for (const def of defs) {
          const params = provider === 'openai' ? (def as OpenAIToolDef).function.parameters : (def as AnthropicToolDef).input_schema;
          expect(checkProviderSubset(params, subset)).toEqual([]);
        }
      }
    }
  });

  it('refuses `strict` for the provider-less jsonschema form instead of guessing a subset', () => {
    expect(() => cardTools({ provider: 'jsonschema', strict: true })).toThrow(/provider-specific/);
  });

  it('marks the tool `strict: true` on the wire when strict projection succeeds', () => {
    // A hand-built schema that IS inside both subsets, to prove the flag is wired
    // and that strict is not simply always-throw.
    const ok = {
      schemas: {
        ping: {
          type: 'object',
          additionalProperties: false,
          required: ['message'],
          properties: { message: { type: 'string', description: 'What to say.' } },
        } as unknown as CardSchema,
      },
      descriptions: { ping: 'Say something back to the user.' },
    };
    const [a] = cardTools(ok, { provider: 'anthropic', strict: true });
    expect(a.strict).toBe(true);
    const [o] = cardTools(ok, { provider: 'openai', strict: true });
    expect(o.function.strict).toBe(true);
    expect(anthropic()[0]).not.toHaveProperty('strict');
  });

  it('emulates OpenAI optional properties with a null union rather than dropping them', () => {
    const src = {
      schemas: {
        ping: {
          type: 'object',
          required: ['a'],
          properties: {
            a: { type: 'string' },
            b: { type: 'integer' },
            c: { type: 'string', enum: ['x', 'y'] },
          },
        } as unknown as CardSchema,
      },
      descriptions: { ping: 'A tool that exists only to check the null-union emulation.' },
    };
    const params = cardTools(src, { provider: 'openai', strict: true })[0].function.parameters as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { type: unknown; enum?: unknown[] }>;
    };
    expect(params.required).toEqual(['a', 'b', 'c']);
    expect(params.additionalProperties).toBe(false);
    expect(params.properties.a.type).toBe('string');
    expect(params.properties.b.type).toEqual(['integer', 'null']);
    // the enum has to admit null too, or the widened type admits nothing new
    expect(params.properties.c.type).toEqual(['string', 'null']);
    expect(params.properties.c.enum).toEqual(['x', 'y', null]);

    // Anthropic allows optional, so it must NOT be rewritten there.
    const anth = cardTools(src, { provider: 'anthropic', strict: true })[0].input_schema as { required: string[] };
    expect(anth.required).toEqual(['a']);
  });
});

describe('cardTools: the non-strict projection survives the providers (F-20)', () => {
  const ROOT_COMBINATORS = ['anyOf', 'allOf', 'oneOf', 'not'] as const;

  it('projects kai_artifact for openai non-strict with type:object at the root and no root combinator', () => {
    const [artifact] = cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' }) as OpenAIToolDef[];
    expect(artifact.function.parameters.type).toBe('object');
    for (const k of ROOT_COMBINATORS) expect(artifact.function.parameters).not.toHaveProperty(k);
  });

  it('projects kai_embed for anthropic non-strict the same way (the derived-prediction case, now pinned)', () => {
    const [embed] = cardTools({ embed: cardSchemas.embed }, { provider: 'anthropic' }) as AnthropicToolDef[];
    expect(embed.input_schema.type).toBe('object');
    for (const k of ROOT_COMBINATORS) expect(embed.input_schema).not.toHaveProperty(k);
  });

  it('restates the dropped constraint in the description the model reads', () => {
    const [artifact] = cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' }) as OpenAIToolDef[];
    expect(artifact.function.description).toMatch(/src|files/);
    const [embed] = cardTools({ embed: cardSchemas.embed }, { provider: 'anthropic' }) as AnthropicToolDef[];
    expect(embed.description).toMatch(/url/);
  });

  it('warns on a single-card call, naming the tool', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('kai_artifact'));
    warn.mockRestore();
  });

  it('keeps the jsonschema projection byte-faithful: the root combinator survives there', () => {
    const [artifact] = cardTools({ artifact: cardSchemas.artifact }, { provider: 'jsonschema' }) as JsonSchemaToolDef[];
    expect(artifact.schema).toHaveProperty('anyOf');
  });

  it('never mutates the authored schema — registry.validate semantics are untouched', () => {
    const before = JSON.stringify(cardSchemas.artifact);
    cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' });
    expect(JSON.stringify(cardSchemas.artifact)).toBe(before);
  });

  it('restates a generic note when a CUSTOM card carries a root combinator with no curated copy', () => {
    const [custom] = cardTools(
      { 'pricing-table': { type: 'object', properties: {}, anyOf: [{ required: ['a'] }, { required: ['b'] }] } },
      { provider: 'openai' },
    ) as OpenAIToolDef[];
    expect(custom.function.parameters).not.toHaveProperty('anyOf');
    expect(custom.function.description).toMatch(/relaxed/i);
  });

  it('guards EVERY built-in: no root combinator reaches an openai non-strict tool array', () => {
    for (const def of cardTools({ provider: 'openai' }) as OpenAIToolDef[]) {
      for (const k of ROOT_COMBINATORS) expect(def.function.parameters).not.toHaveProperty(k);
    }
  });
});
