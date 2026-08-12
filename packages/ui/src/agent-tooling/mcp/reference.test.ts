import { describe, it, expect } from 'vitest';
import { BUILTIN_CARD_TAGS, cardSchemas, cardSchemaNames, cardTools } from '@kitn.ai/ui/schemas';
import type { AnthropicToolDef, JsonSchemaToolDef, OpenAIToolDef } from '@kitn.ai/ui/schemas';
import { reference } from './tools/reference';
import { cardTagForType, cardHostTags } from './manifest';

describe('component_reference', () => {
  it('returns kai-chat props + events', async () => {
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/messages/);
    expect(text).toMatch(/kai-submit/);
    expect(text).toMatch(/set in JavaScript|property/i); // the contract note
  });

  it('lists all element tagNames when name is omitted', async () => {
    const out = await reference.handler({});
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/kai-chat/);
    expect(text).toMatch(/kai-artifact/);
    expect(text).toMatch(/kai-prompt-input/);
  });

  it('lists all element tagNames when name is "list"', async () => {
    const out = await reference.handler({ name: 'list' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/kai-chat/);
    expect(text).toMatch(/kai-artifact/);
  });

  it('returns helpful fallback for unknown tag', async () => {
    const out = await reference.handler({ name: 'kai-nonexistent' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/unknown/i);
    expect(text).toMatch(/kai-/); // names a valid tag
  });
});

describe('component_reference — composition seams (slots + ::part)', () => {
  const textFor = async (name: string) => {
    const out = await reference.handler({ name });
    return (out.content as { type: string; text: string }[])[0].text;
  };

  it('documents kai-chat composition slots (the consumer fills these)', async () => {
    const text = await textFor('kai-chat');
    expect(text).toMatch(/### Composition slots/);
    expect(text).toMatch(/\bcomposer\b/);
    expect(text).toMatch(/\bsidebar\b/);
  });

  it('documents kai-prompt-input styleable ::part with its copy-paste recipe', async () => {
    const text = await textFor('kai-prompt-input');
    expect(text).toMatch(/### Styleable parts/);
    expect(text).toMatch(/::part\(send\)/);
    expect(text).toMatch(/display:\s*none/);
  });

  it('documents the kai-button styleable ::part', async () => {
    const text = await textFor('kai-button');
    expect(text).toMatch(/### Styleable parts/);
    expect(text).toMatch(/::part\(button\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3.2 — the card contract: schema + GENERATED tool definition
//
// The point of these is that a harness never has to invent a tool definition for a
// card. The assertion that carries the weight is `byte-equal to cardTools()`: a
// definition typed into a string literal here would satisfy every other test in this
// block and would rot the first time a schema changed.
// ─────────────────────────────────────────────────────────────────────────────

const textFor = async (args: Record<string, unknown>): Promise<string> => {
  const out = await reference.handler(args);
  return (out.content as { type: string; text: string }[])[0].text;
};

/** Pull one fenced block back out of the markdown, by its info string. */
function fencedBlock(text: string, info: string): string | undefined {
  const match = new RegExp('```json ' + info + '\\n([\\s\\S]*?)\\n```').exec(text);
  return match?.[1];
}

describe('component_reference — card contract', () => {
  it('serves kai-confirm its card schema and a tool definition named kai_confirm', async () => {
    const text = await textFor({ name: 'kai-confirm' });

    expect(text).toMatch(/### Card contract/);
    // It says which card type the element renders, so the harness can key an envelope.
    expect(text).toMatch(/`confirm`/);
    // The tool name, not invented by the reader.
    expect(text).toMatch(/kai_confirm/);

    const schema = fencedBlock(text, 'kai-card-schema');
    expect(schema, 'kai-confirm must serve its JSON Schema').toBeDefined();
    expect(JSON.parse(schema!)).toEqual(cardSchemas.confirm);

    const def = fencedBlock(text, 'kai-tool-definition');
    expect(def, 'kai-confirm must serve a tool definition').toBeDefined();
    expect((JSON.parse(def!) as JsonSchemaToolDef).name).toBe('kai_confirm');
  });

  // ── THE ANTI-DRIFT CHECK ───────────────────────────────────────────────────
  // Byte-equality, not shape-equality, and against BOTH the same-input call and the
  // whole-registry call a real route makes. A hand-written definition that merely
  // looks right fails here.
  it('serves a tool definition byte-equal to cardTools(), never a restatement', async () => {
    for (const provider of ['openai', 'anthropic', 'jsonschema'] as const) {
      for (const type of cardSchemaNames) {
        const tag = cardTagForType(type);
        expect(tag, `card type "${type}" must resolve to an element tag`).toBeDefined();

        const text = await textFor({ name: tag!, provider });
        const served = fencedBlock(text, 'kai-tool-definition');
        expect(served, `${tag!} (${provider}) must serve a tool definition`).toBeDefined();

        // (a) the same call, same input.
        const sameInput = cardTools({ [type]: cardSchemas[type] }, { provider });
        expect(served).toBe(JSON.stringify(sameInput[0], null, 2));

        // (b) the definition a route actually ships, picked out of the full built-in
        // projection. Catches a reference that derives its own answer a second way.
        const nameOf = (d: OpenAIToolDef | AnthropicToolDef | JsonSchemaToolDef) =>
          'function' in d ? d.function.name : d.name;
        const fromRegistry = cardTools({ provider }).find((d) => nameOf(d) === `kai_${type}`);
        expect(served).toBe(JSON.stringify(fromRegistry, null, 2));
      }
    }
  });

  it('projects the provider envelope the caller asked for', async () => {
    const openai = JSON.parse(fencedBlock(await textFor({ name: 'kai-confirm', provider: 'openai' }), 'kai-tool-definition')!);
    expect(openai).toMatchObject({ type: 'function', function: { name: 'kai_confirm' } });
    expect(openai).not.toHaveProperty('input_schema');

    const anthropic = JSON.parse(fencedBlock(await textFor({ name: 'kai-confirm', provider: 'anthropic' }), 'kai-tool-definition')!);
    expect(anthropic).toHaveProperty('input_schema');
    expect(anthropic).not.toHaveProperty('function');

    const neutral = JSON.parse(fencedBlock(await textFor({ name: 'kai-confirm', provider: 'jsonschema' }), 'kai-tool-definition')!);
    expect(neutral).toHaveProperty('schema');
    expect(neutral).not.toHaveProperty('input_schema');
  });

  it('serves the provider-neutral form when no provider is named, and says so', async () => {
    const text = await textFor({ name: 'kai-confirm' });
    const def = JSON.parse(fencedBlock(text, 'kai-tool-definition')!);
    expect(def).toHaveProperty('schema');
    // Unusable-without-knowing-the-provider is the failure mode. The response has to
    // name which one it projected and how to get the other two.
    expect(text).toMatch(/jsonschema/);
    expect(text).toMatch(/provider/);
    expect(text).toMatch(/openai/);
    expect(text).toMatch(/anthropic/);
  });

  it('refuses an unknown provider instead of silently serving another shape', async () => {
    const text = await textFor({ name: 'kai-confirm', provider: 'gemini' });
    expect(text).toMatch(/gemini/);
    expect(text).toMatch(/openai/);
    expect(fencedBlock(text, 'kai-tool-definition')).toBeUndefined();
  });

  it('tells a card-backed element how the loop closes', async () => {
    const text = await textFor({ name: 'kai-confirm' });
    // tool_call_id -> envelope.id is the rule that makes a revised card upsert
    // instead of rendering twice.
    expect(text).toMatch(/tool_call_id/);
    expect(text).toMatch(/cardFromToolCall/);
    expect(text).toMatch(/@kitn\.ai\/ui\/schemas/);
  });

  it('points a card HOST at cardSchemas, the prop that carries custom schemas', async () => {
    const hosts = cardHostTags();
    expect(hosts).toContain('kai-chat');
    for (const tag of hosts) {
      const text = await textFor({ name: tag });
      expect(text, `${tag} is a card host`).toMatch(/### Card contract/);
      expect(text).toMatch(/cardSchemas/);
      expect(text).toMatch(/cardTypes/);
      // A host is not itself a card: no schema, no tool definition body.
      expect(fencedBlock(text, 'kai-card-schema')).toBeUndefined();
    }
  });

  // A reference that attaches card material to everything is worse than one that
  // attaches it to nothing.
  it('attaches nothing card-shaped to a non-card element', async () => {
    for (const tag of ['kai-button', 'kai-badge', 'kai-tooltip']) {
      const text = await textFor({ name: tag });
      expect(text, tag).not.toMatch(/### Card contract/);
      expect(text, tag).not.toMatch(/kai_confirm/);
      expect(text, tag).not.toMatch(/cardTools/);
      expect(fencedBlock(text, 'kai-tool-definition'), tag).toBeUndefined();
    }
  });

  // The eighth-card-type guard, and BOTH halves of it matter.
  //
  // `cardTagForType` reads `BUILTIN_CARD_TAGS` (the kit's own map, via
  // @kitn.ai/ui/schemas) and drops any entry the element manifest does not register,
  // so there are two ways an eighth card type can go wrong and this asserts against
  // each: the type is missing from the map (`toBeDefined` fails), or the map names a
  // tag nobody registered (`toContain` fails). Either way it is a red test rather
  // than a card that silently loses its schema in the reference.
  it('resolves every built-in card type to exactly one real element tag', async () => {
    const all = (await textFor({ name: 'list' })).split('\n').map((l) => l.trim());
    for (const type of cardSchemaNames) {
      const tag = cardTagForType(type);
      expect(tag, `card type "${type}" has no element tag`).toBeDefined();
      expect(all, `${tag!} is not a registered element`).toContain(tag!);
    }
    // The one built-in whose tag is NOT `kai-<type>`. It is spelled out because it is
    // the entry that made the old convention-based derivation a guess, and because it
    // is what catches a regression back to string concatenation.
    expect(cardTagForType('link')).toBe('kai-link-preview');
    expect(cardTagForType('not-a-card')).toBeUndefined();
  });

  // The map is the authority, not this file's idea of it. Asserting the exact seven
  // keys would just be a second copy of `BUILTIN_CARD_TAGS`; what has to hold is that
  // every type with a SCHEMA has a tag in it, since those are the ones the reference
  // serves a tool definition for.
  it('reads BUILTIN_CARD_TAGS rather than re-deriving a map of its own', () => {
    for (const type of cardSchemaNames) {
      expect(BUILTIN_CARD_TAGS[type], `${type} is missing from BUILTIN_CARD_TAGS`).toBeDefined();
      expect(cardTagForType(type)).toBe(BUILTIN_CARD_TAGS[type]);
    }
  });
});
