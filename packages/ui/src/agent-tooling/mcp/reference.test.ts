import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_CARD_TAGS, cardSchemas, cardSchemaNames, cardTools } from '@kitn.ai/ui/schemas';
import type { AnthropicToolDef, JsonSchemaToolDef, OpenAIToolDef } from '@kitn.ai/ui/schemas';
import { reference, coverageSummary } from './tools/reference';
import { cardTagForType, cardHostTags, entryForTag, getElement, listElements } from './manifest';
import { invariants } from '../catalog/invariants';
import { surfaceRecipes } from '../catalog/surfaces';
import type { TInvariant } from '../catalog/catalog-types';

describe('component_reference', () => {
  it('returns kai-chat props + events', async () => {
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/messages/);
    expect(text).toMatch(/kai-submit/);
    expect(text).toMatch(/set in JavaScript|property/i); // the contract note
  });

  it('opens with how to register the element, before any API surface', async () => {
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { type: string; text: string }[])[0].text;

    expect(text).toMatch(/### Getting the element/);
    expect(text).toMatch(/import '@kitn\.ai\/ui\/elements'/);
    // it must come BEFORE the props, or a reader who stops early still misses it
    expect(text.indexOf('### Getting the element')).toBeLessThan(
      text.indexOf('### Props (JavaScript properties)'),
    );
    // and it must name the silent failure, which is the whole reason this exists
    expect(text).toMatch(/whenDefined/);
  });

  it('names the shipped TypeScript interface', async () => {
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/KaiChatElement/);
  });

  it('tells the caller, in the schema, how to discover what exists', async () => {
    const shape = (reference.inputSchema as unknown as {
      shape: { name: { description?: string } };
    }).shape;
    const desc = shape.name.description ?? '';
    expect(desc).toMatch(/omit/i);
    expect(desc).toMatch(/list/i);
  });

  it('gives every event its payload shape, not just a sentence', async () => {
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { type: string; text: string }[])[0].text;

    const events = text.slice(
      text.indexOf('### Events'),
      text.indexOf('### Methods'),
    );
    // the payload, unwrapped from CustomEvent<...>
    expect(events).toMatch(/kai-submit/);
    expect(events).toMatch(/value: string/);
    expect(events).not.toMatch(/CustomEvent</); // unwrapped, not raw
  });

  /**
   * The `detail` clause, pinned over EVERY event in the manifest rather than
   * kai-chat's.
   *
   * The rule is read off the generator, not guessed: gen-element-api.mjs writes
   * an event's CEM type as `CustomEvent<${e.detail}>` when the element declares
   * a payload and the bare string `CustomEvent` when it does not (a `void`
   * detail, e.g. `'kai-click': void` in button.tsx). Exactly two shapes, so the
   * manifest itself says which events carry a payload and which carry none —
   * and the rendered line must agree with it in both directions.
   *
   * The previous version of this check could not fail. It ran over kai-chat
   * alone, where every event has a payload, and its two probes were both
   * satisfied by the wrong output: `not.toMatch(/CustomEvent</)` passes on a
   * bare `CustomEvent` because there is no `<`, and "every line has a
   * `detail`:" passes on a clause that is merely FALSE. Thirteen events across
   * ten elements shipped `Carries no detail. \`detail\`: \`CustomEvent\``
   * underneath it.
   */
  it('claims a payload for exactly the events the manifest gives one', async () => {
    const withPayload: string[] = [];
    const withoutPayload: string[] = [];

    for (const tag of listElements()) {
      const events = getElement(tag)?.events ?? [];
      if (events.length === 0) continue;

      const out = await reference.handler({ name: tag });
      const text = (out.content as { type: string; text: string }[])[0].text;
      const start = text.indexOf('### Events');
      expect(start, `${tag} has ${events.length} events and no Events section`).toBeGreaterThan(-1);
      const rest = text.slice(start + 4);
      const next = rest.indexOf('\n### ');
      const section = next === -1 ? rest : rest.slice(0, next);

      for (const ev of events) {
        const line = section
          .split('\n')
          .find((l) => l.startsWith(`- **${ev.name}** `));
        expect(line, `${tag}: no rendered line for ${ev.name}`).toBeDefined();

        const type = ev.type?.text?.trim() ?? '';
        const wrapped = /^CustomEvent<([\s\S]*)>$/.exec(type);
        if (wrapped) {
          withPayload.push(`${tag}/${ev.name}`);
          expect(
            line,
            `${tag}: ${ev.name} is typed ${type} and must render its payload`,
          ).toContain(`\`detail\`: \`${wrapped[1].trim()}\``);
        } else {
          withoutPayload.push(`${tag}/${ev.name}`);
          expect(
            line,
            `${tag}: ${ev.name} is typed bare \`CustomEvent\` (no payload) and must not claim a detail`,
          ).not.toMatch(/`detail`:/);
        }
      }
    }

    // Neither population may be empty, or one half of the rule is unexercised
    // and this test is back to passing for the wrong reason.
    expect(withPayload.length).toBeGreaterThan(0);
    expect(withoutPayload.length).toBeGreaterThan(0);
  });

  it('uses the real per-element entry, not the tag with kai- stripped', async () => {
    // kai-conversations resolves to 'conversation-list'. Ten of eighty elements do
    // not match the naive derivation, so this asserts the manifest is consulted.
    const out = await reference.handler({ name: 'kai-conversations' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/@kitn\.ai\/ui\/elements\/conversation-list/);
    expect(text).not.toMatch(/@kitn\.ai\/ui\/elements\/conversations'/);
  });

  it('does not claim register-all for an element register-all does not cover', async () => {
    // Derived, not hard-coded: entryForTag is undefined for exactly the tags
    // register-impl.ts does not import — currently one, kai-remote, the deliberate
    // opt-in exception documented at element-diagnostics.ts:347-363. Finding it by
    // walking the manifest (instead of writing 'kai-remote' or '79'/'80' here) means
    // a second such element is covered by this test the day it exists.
    const optedOut = listElements().filter((t) => entryForTag(t) === undefined);
    expect(optedOut.length).toBeGreaterThan(0);
    const tag = optedOut[0];

    const out = await reference.handler({ name: tag });
    const text = (out.content as { type: string; text: string }[])[0].text;

    expect(text).toMatch(/### Getting the element/);
    // the false claim this exists to catch: register-all does NOT register this tag
    expect(text).not.toMatch(/import '@kitn\.ai\/ui\/elements';\n/);
    // it must still decide loudly rather than staying quiet about the exception
    expect(text).toMatch(/not part of|opt-in|does not register|is not registered/i);
  });

  /**
   * "Register it some other way" is only useful if it says WHICH other way.
   *
   * Declining to derive the specifier by stripping `kai-` was right — ten of the
   * eighty elements do not match that derivation. But the answer is not unknown:
   * the per-element build emits a real module for this tag, and the reference has
   * to name it.
   *
   * This probe does NOT re-run the tool's own lookup. It reads the specifier back
   * out of the rendered text and resolves it against dist/elements/ — so the
   * assertion is that the string the reference hands a consumer resolves to a
   * built module which registers this exact tag, which is the thing that was
   * wrong when the reference guessed and the thing that would be wrong again.
   */
  it('names the entry point for an opt-in element instead of telling the reader to go find it', async () => {
    const distElements = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../dist/elements',
    );
    const optedOut = listElements().filter((t) => entryForTag(t) === undefined);
    expect(optedOut.length).toBeGreaterThan(0);

    for (const tag of optedOut) {
      const out = await reference.handler({ name: tag });
      const text = (out.content as { type: string; text: string }[])[0].text;

      const named = [...text.matchAll(/@kitn\.ai\/ui\/elements\/([a-z0-9-]+)/g)].map((m) => m[1]);
      expect(named, `${tag}: no @kitn.ai/ui/elements/<name> specifier in the reference`).not.toHaveLength(0);

      for (const name of named) {
        const module = resolve(distElements, `${name}.js`);
        expect(existsSync(module), `${tag}: names ${name}, which is not a built module`).toBe(true);
        expect(
          readFileSync(module, 'utf-8'),
          `${tag}: names ${name}, which does not register ${tag}`,
        ).toContain(`"${tag}"`);
      }

      // and it must not send the reader off to look the answer up themselves
      expect(text, `${tag}: still tells the reader to go find the entry point`).not.toMatch(
        /Find its specific/i,
      );
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// The interaction API: exposed methods
//
// `expose({ … })` methods reached the CEM and the generated types, and
// `component_reference` rendered neither: it filtered `members` down to
// `kind: 'field'` and dropped the rest on the floor. This is the artifact a
// coding agent actually consults, so a method it does not mention may as well
// not exist.
//
// Expectations come from src/elements/element-meta.json — the sibling artifact
// of the manifest this tool reads, written by the same generator run. Nothing is
// restated here: a method added to a facade moves both sides at once, and a
// method that reaches only ONE of the two artifacts fails instead of half-shipping.
// ─────────────────────────────────────────────────────────────────────────────

describe('component_reference — exposed methods', () => {
  interface MethodMeta { name: string; params: string; returns: string }
  interface ElementMeta { tag: string; methods?: MethodMeta[] }

  // Same resolution manifest.ts uses to find the CEM, for the same reason: this
  // file runs from source under vitest and from nowhere else.
  const elementMeta: ElementMeta[] = JSON.parse(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../elements/element-meta.json'),
      'utf8',
    ),
  );
  const withMethods = elementMeta.filter((e) => e.methods?.length);
  const TOTAL_METHODS = withMethods.reduce((n, e) => n + e.methods!.length, 0);

  /** The `### Methods …` section of a reference, up to the next `###`. */
  const methodsSection = (text: string): string | undefined =>
    /\n### Methods\b([\s\S]*?)(?=\n### |$)/.exec(text)?.[1];

  /** The method names that section lists, sorted. */
  const listed = (text: string): string[] => {
    const section = methodsSection(text);
    if (!section) return [];
    return [...section.matchAll(/^- \*\*([\w$]+)\(/gm)].map((m) => m[1]).sort();
  };

  it('the model is big enough for the loop below to mean anything', () => {
    expect(withMethods.length).toBeGreaterThan(30);
    expect(TOTAL_METHODS).toBeGreaterThan(100);
  });

  it('serves kai-resizable.maximize with its authored signature and doc', async () => {
    const text = await textFor({ name: 'kai-resizable' });
    expect(text).toMatch(/### Methods/);
    expect(text).toContain('**maximize(index: number): void**');
    expect(text).toContain('**restore(): void**');
    expect(text).toMatch(/Imperatively maximize/);
  });

  it(`serves all ${TOTAL_METHODS} methods, each on its own element`, async () => {
    const wrong: string[] = [];
    let served = 0;

    for (const el of withMethods) {
      const got = listed(await textFor({ name: el.tag }));
      served += got.length;
      const want = [...el.methods!.map((m) => m.name)].sort();
      if (got.join(',') !== want.join(',')) wrong.push(`${el.tag}: got [${got}] want [${want}]`);
    }

    expect(wrong).toEqual([]);
    expect(served).toBe(TOTAL_METHODS);
  });

  it('an element that exposes nothing gets no Methods section', async () => {
    // resizable.tsx declares kai-resizable AND kai-resizable-item; only the group
    // exposes maximize/restore.
    const item = elementMeta.find((e) => e.tag === 'kai-resizable-item');
    expect(item?.methods ?? []).toEqual([]);
    expect(methodsSection(await textFor({ name: 'kai-resizable-item' }))).toBeUndefined();
  });
});

describe('component_reference serves the catalog', () => {
  const textFor = async (name: string) => {
    const out = await reference.handler({ name });
    return (out.content as { type: string; text: string }[])[0].text;
  };

  it('kai-chat carries the reactivity invariant, statement included', async () => {
    const text = await textFor('kai-chat');
    expect(text).toContain('### Invariants');
    expect(text).toContain('reactivity-two-halves');
    expect(text).toContain('A new array reference NOTIFIES');
  });

  it('kai-conversations names the recipes it appears in', async () => {
    const text = await textFor('kai-conversations');
    expect(text).toContain('### Appears in surface recipes');
    expect(text).toContain('workspace-chat');
  });

  it('an element in no recipe still gets universal invariants, and no fabricated membership', async () => {
    const text = await textFor('kai-kbd');
    expect(text).toContain('### Invariants');
    expect(text).toContain('props-not-attributes'); // universal: applies to every element
    expect(text).not.toContain('### Appears in surface recipes');
  });
});

/**
 * The rendering is the last place the catalog's honesty can be lost. Three of the
 * seven records are enforced by NOTHING and two more by only half of what they
 * say, so a section that prints seven bullets and no coverage would hand a
 * harness exactly the overstatement this branch spent five rounds removing from
 * the records themselves. These probes read the STATUS off the raw literals
 * rather than restating it, so they follow a record that changes status.
 */
describe('component_reference does not overstate what the catalog enforces', () => {
  const textFor = async (name: string) => {
    const out = await reference.handler({ name });
    return (out.content as { type: string; text: string }[])[0].text;
  };

  /** Sliced by heading so a match elsewhere in the reference cannot stand in for one here. */
  const sectionOf = (text: string, heading: string): string | undefined => {
    const start = text.indexOf(`### ${heading}`);
    if (start === -1) return undefined;
    const rest = text.slice(start + 4);
    const next = rest.indexOf('\n### ');
    return next === -1 ? rest : rest.slice(0, next);
  };

  /**
   * The heading line for one invariant, not merely a line mentioning its id: a
   * statement is free to name another record (props-not-attributes names
   * reactivity-two-halves), and a probe that matched that line would be reading
   * the coverage of the wrong invariant.
   */
  const rowFor = (section: string, id: string): string | undefined =>
    section.split('\n').find((l) => l.startsWith(`#### ${id}`));

  const openIds = invariants.filter((i) => i.status === 'open').map((i) => i.id);
  const partialIds = invariants.filter((i) => i.status === 'partial').map((i) => i.id);

  it('the fixture is the one this whole describe assumes: some records are NOT enforced', () => {
    // Without this the probes below can pass by there being nothing to catch.
    expect(openIds.length).toBeGreaterThan(0);
    expect(partialIds.length).toBeGreaterThan(0);
  });

  it('every open invariant on kai-chat is rendered as enforced by nothing', async () => {
    const section = sectionOf(await textFor('kai-chat'), 'Invariants')!;
    expect(section).toBeDefined();
    const missing = openIds.filter((id) => {
      const line = rowFor(section, id);
      return !line || !/not enforced/i.test(line);
    });
    expect(missing).toEqual([]);
  });

  it('every partial invariant on kai-chat is rendered as partial, not as covered', async () => {
    const section = sectionOf(await textFor('kai-chat'), 'Invariants')!;
    const missing = partialIds.filter((id) => {
      const line = rowFor(section, id);
      return !line || !/partially enforced/i.test(line);
    });
    expect(missing).toEqual([]);
  });

  it('an enforced invariant names the guard that enforces it — the positive control for the two above', async () => {
    const section = sectionOf(await textFor('kai-chat'), 'Invariants')!;
    const line = rowFor(section, 'events-non-bubbling')!;
    expect(line).toBeDefined();
    // Not "not enforced", not "partially enforced" — and it names its real guard.
    expect(line).not.toMatch(/not enforced|partially enforced/i);
    expect(line).toContain('src/elements/define.tsx');
  });

  it('upgrade-race is served with the delivery scope that makes it conditional', async () => {
    // appliesTo.targets, not tags — so the tag filter alone would print it as if
    // it held on every page. A bundler app reading it unqualified would either
    // add whenDefined ceremony it does not need or distrust the section.
    const section = sectionOf(await textFor('kai-chat'), 'Invariants')!;
    const line = rowFor(section, 'upgrade-race')!;
    expect(line).toContain('script-tag');
  });

  // Task 4 moved the long form (diagnosis + wrong/right examples) off every
  // per-element lookup and onto the { name: 'invariants' } appendix, served
  // once for the whole catalog instead of once per applicable element. These
  // two probes now read that appendix — the fact (the pair, the symptom/cause)
  // is unchanged, only where it is reachable moved, per the task's own
  // "move it, don't delete it" rule.
  it('serves the wrong/right pairs, which are the part a weak model can pattern-match', async () => {
    const text = await textFor('invariants');
    const wrong = invariants.find((i) => i.id === 'host-coordinates')!.examples[0]!;
    expect(text).toContain(wrong.wrong);
    expect(text).toContain(wrong.right);
  });

  it('serves the diagnosis rows, symptom and cause', async () => {
    const text = await textFor('invariants');
    const d = invariants.find((i) => i.id === 'events-non-bubbling')!.diagnosis[0]!;
    expect(text).toContain(d.symptom);
    expect(text).toContain(d.cause);
  });

  it('a per-element lookup states the id and statement but points to the appendix, not the examples', async () => {
    // The positive control for the dedup test: kai-chat's OWN response no
    // longer carries host-coordinates' wrong/right pair inline — it carries
    // the id, the statement, and a pointer to where the pair actually lives.
    const text = await textFor('kai-chat');
    const wrong = invariants.find((i) => i.id === 'host-coordinates')!.examples[0]!;
    expect(text).toContain('host-coordinates');
    expect(text).not.toContain(wrong.wrong);
    expect(text).toMatch(/name: "invariants"/);
  });

  /**
   * The other half of the same dedup, which shipped without its signpost.
   *
   * Both appendices were extracted in the same pass and only the invariants one
   * grew a pointer, so the corrected composition note — the rail is a fixed-width
   * column, the collapse is the rail's own, `<kai-chat>` does not react to it —
   * sat in the recipes appendix with nothing in any element lookup mentioning it
   * exists. A kai-chat lookup printed the nesting line with that caveat stripped
   * and no way to learn there was more.
   *
   * The population is derived from the recipe catalog, not written as kai-chat: a
   * fifth ingredient is covered here the day it is added.
   */
  it('an element with a recipe section points at the recipes appendix, as the invariants section does at its own', async () => {
    const ingredients = listElements().filter((tag) =>
      surfaceRecipes.some((r) => r.ingredients.includes(tag)),
    );
    expect(ingredients.length).toBeGreaterThan(0);

    for (const tag of ingredients) {
      const section = sectionOf(await textFor(tag), 'Appears in surface recipes');
      expect(section, `${tag} is a recipe ingredient and has no recipe section`).toBeDefined();
      expect(section, `${tag}: recipe section does not point at the recipes appendix`).toMatch(
        /name: "recipes"/,
      );
    }

    // and no signpost where there is no section to point from — a pointer on an
    // element in no recipe is the "fabricated membership" failure in another form
    const outsiders = listElements().filter((tag) => !ingredients.includes(tag));
    expect(outsiders.length).toBeGreaterThan(0);
    for (const tag of outsiders.slice(0, 5)) {
      expect(await textFor(tag), `${tag} is in no recipe but points at the recipes appendix`).not.toMatch(
        /name: "recipes"/,
      );
    }
  });

  it('a recipe row carries the ingredients, so the membership is actionable', async () => {
    const section = sectionOf(await textFor('kai-conversations'), 'Appears in surface recipes')!;
    expect(section).toBeDefined();
    const recipe = surfaceRecipes.find((r) => r.id === 'workspace-chat')!;
    for (const ingredient of recipe.ingredients) expect(section).toContain(ingredient);
  });

  it('a recipe row says WHERE the parts go, which no other row on the page does', async () => {
    // The question a builder could not answer from the MCP: is the rail a child
    // of <kai-chat> or a sibling beside it? Ingredients, wiring and invariants
    // are all silent on it — the wiring rows say which event drives which
    // property and nothing about nesting — so an element lookup that omitted
    // the composition left the reader to guess, and one did.
    const placement = surfaceRecipes
      .flatMap((r) => r.composition ?? [])
      .find((c) => c.child === 'kai-conversations');
    expect(placement, 'no composition record to render').toBeDefined();
    const section = sectionOf(await textFor('kai-conversations'), 'Appears in surface recipes')!;
    expect(section).toContain(`<${placement!.child} slot="${placement!.slot}">`);
    expect(section).toContain(`INSIDE \`<${placement!.parent}>\``);
  });

  it('the header summary counts BOTH kinds of gap, so a summary of it cannot invent coverage', async () => {
    // "3 of the 7 are enforced by NOTHING" is the quotable half, and a reader
    // compressing it emits "3 unenforced, 4 enforced" — while two of that four
    // are partial. The line names both numerators so there is nothing to invent.
    const section = sectionOf(await textFor('kai-chat'), 'Invariants')!;
    expect(section).toContain(`${openIds.length} of the ${invariants.length} below`);
    expect(section).toContain(`${partialIds.length} more by only half`);
  });

  it('an unknown tag gets no catalog sections at all', async () => {
    // The absence probe with its positive control beside it: the same helper,
    // the same headings, one tag that has them and one that must not.
    expect(await textFor('kai-nonexistent')).not.toContain('### Invariants');
    expect(await textFor('kai-chat')).toContain('### Invariants');
  });
});

/**
 * The coverage sentence over count combinations the real catalog cannot instance
 * — it has exactly one (3 open, 2 partial, 7 total) and would have to be mutated
 * to show the others. Synthetic records instead, so the rule is pinned rather
 * than today's arithmetic.
 */
describe('coverageSummary', () => {
  const rec = (id: string, status: TInvariant['status']): TInvariant => ({
    id,
    statement: 's',
    appliesTo: {},
    enforcedBy: status === 'open' ? { kind: 'none' } : { kind: 'lint', script: 'lint:x' },
    status,
    diagnosis: [],
    examples: [],
  });

  it('says nothing when every record is fully enforced', () => {
    expect(coverageSummary([rec('a', 'enforced'), rec('b', 'enforced')])).toBe('');
    expect(coverageSummary([])).toBe('');
  });

  it('names both gaps when both exist, each numerator moving on its own', () => {
    const both = coverageSummary([
      rec('a', 'open'),
      rec('b', 'open'),
      rec('c', 'partial'),
      rec('d', 'enforced'),
    ]);
    expect(both).toContain('2 of the 4 below are enforced by NOTHING at all');
    expect(both).toContain('1 more by only half of what it says');

    // Move ONLY the partial count: the open clause must not follow it.
    const morePartial = coverageSummary([
      rec('a', 'open'),
      rec('b', 'open'),
      rec('c', 'partial'),
      rec('d', 'partial'),
    ]);
    expect(morePartial).toContain('2 of the 4 below are enforced by NOTHING at all');
    expect(morePartial).toContain('2 more by only half of what they say');
  });

  it('still reports partial coverage when nothing at all is unenforced', () => {
    // The failure mode this guards: a `partial` record going silent because the
    // sentence was keyed on the open count alone.
    const only = coverageSummary([rec('a', 'partial'), rec('b', 'enforced'), rec('c', 'enforced')]);
    expect(only).toContain('1 of the 3 below is enforced by only half of what it says');
    expect(only).not.toContain('NOTHING');
  });

  it('reports an unenforced record with no partial one, and does not imply a second gap', () => {
    const only = coverageSummary([rec('a', 'open'), rec('b', 'enforced')]);
    expect(only).toContain('1 of the 2 below is enforced by NOTHING at all');
    expect(only).not.toContain('half of what');
  });

  it('is what the served section actually uses — not a parallel implementation', async () => {
    // Every catalog invariant applies to kai-chat, so the served sentence must be
    // byte-identical to this call over the whole list. If the renderer ever grows
    // its own copy of the arithmetic, this goes red instead of drifting.
    const sentence = coverageSummary(invariants).trim();
    expect(sentence.length).toBeGreaterThan(0);
    const out = await reference.handler({ name: 'kai-chat' });
    expect((out.content as { text: string }[])[0].text).toContain(sentence);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 4 — stop repeating the universal records on every element
//
// Round 1 asserted a byte budget (<6000) that turned out to be a guess made
// while drafting the plan, not a derived number: the seven invariant
// statements alone are 5386 B and SHOULD stay inline (an element stating its
// own invariants is the point of them), which made the budget unreachable
// without deleting the thing the task exists to preserve. Round 2 replaces it
// with a STRUCTURAL pair: the moved content is provably absent from a
// per-element lookup AND provably present in its appendix. Absence alone would
// pass on an appendix that silently lost content too — the presence half is
// the positive control that proves the probe can see the thing it claims
// moved. Both halves are derived from the catalog records themselves, so the
// test follows the catalog rather than a restatement of it.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors `invariantsFor` in tools/reference.ts — do not guess the scoping rule. */
function applies(inv: TInvariant, tag: string): boolean {
  return !inv.appliesTo.tags || inv.appliesTo.tags.includes(tag);
}

describe('component_reference — Task 4: no repeated universal records', () => {
  it('still states every invariant that applies to the element', async () => {
    // The control that makes the absence assertions below meaningful: it
    // proves ids are not silently gone, only the diagnosis/examples beneath
    // them.
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { text: string }[])[0].text;
    for (const inv of invariants.filter((i) => applies(i, 'kai-chat'))) {
      expect(text, `invariant missing: ${inv.id}`).toMatch(inv.id);
    }
  });

  it('an invariant diagnosis and its wrong/right examples are absent from a per-element lookup, and present once in the invariants appendix', async () => {
    const perElement = await textFor({ name: 'kai-chat' });
    const appendix = await textFor({ name: 'invariants' });

    const applicable = invariants.filter((i) => applies(i, 'kai-chat'));
    // The fixture is non-vacuous: kai-chat must actually carry diagnosis rows
    // and examples for this to prove anything.
    expect(applicable.some((i) => i.diagnosis.length > 0)).toBe(true);
    expect(applicable.some((i) => i.examples.length > 0)).toBe(true);

    for (const inv of applicable) {
      for (const d of inv.diagnosis) {
        expect(perElement, `${inv.id} diagnosis leaked inline: "${d.symptom}"`).not.toContain(d.symptom);
        expect(perElement, `${inv.id} diagnosis leaked inline: "${d.cause}"`).not.toContain(d.cause);
        expect(appendix, `${inv.id} diagnosis missing from appendix: "${d.symptom}"`).toContain(d.symptom);
        expect(appendix, `${inv.id} diagnosis missing from appendix: "${d.cause}"`).toContain(d.cause);
      }
      for (const ex of inv.examples) {
        expect(perElement, `${inv.id} wrong example leaked inline`).not.toContain(ex.wrong);
        expect(perElement, `${inv.id} right example leaked inline`).not.toContain(ex.right);
        expect(appendix, `${inv.id} wrong example missing from appendix`).toContain(ex.wrong);
        expect(appendix, `${inv.id} right example missing from appendix`).toContain(ex.right);
      }
    }
  });

  it('a recipe wiring note is absent from a per-element lookup, and present once in the recipes appendix', async () => {
    const perElement = await textFor({ name: 'kai-chat' });
    const appendix = await textFor({ name: 'recipes' });

    const recipesForKaiChat = surfaceRecipes.filter((r) => r.ingredients.includes('kai-chat'));
    const notes = recipesForKaiChat.flatMap((r) => r.wiring.map((w) => w.note)).filter((n): n is string => !!n);
    // Non-vacuous: kai-chat's recipes must actually carry notes.
    expect(notes.length).toBeGreaterThan(0);

    for (const note of notes) {
      expect(perElement, `wiring note leaked inline: "${note}"`).not.toContain(note);
      expect(appendix, `wiring note missing from appendix: "${note}"`).toContain(note);
    }

    // The edge itself (event out of A, property into B) is a compact fact, not
    // bulk prose — it stays inline, unlike the note behind it.
    for (const r of recipesForKaiChat) {
      for (const w of r.wiring) {
        expect(perElement).toContain(`fires \`${w.event}\` → host sets \`${w.to}.${w.property}\``);
      }
    }
  });

  it('regression ratchet: shared bytes between two elements stay in the same order of magnitude', async () => {
    const a = (await reference.handler({ name: 'kai-chat' })).content as { text: string }[];
    const b = (await reference.handler({ name: 'kai-conversations' })).content as { text: string }[];

    const linesB = new Set(b[0].text.split('\n'));
    const shared = a[0].text
      .split('\n')
      .filter((l) => l.trim().length > 0 && linesB.has(l));
    const sharedBytes = shared.join('\n').length;

    // NOT a target — no one derived 12000. This is a ratchet: it exists to catch
    // gross re-duplication (e.g. someone re-inlining the appendix content, or a
    // future invariant landing with its whole body pasted onto every element),
    // not to enforce a budget. Measured when set, 2026-08-18, after task 4's
    // invariant AND recipe-wiring dedup: 9223 bytes (down from a pre-task-4
    // baseline of 18059). Headroom is deliberate: the seven invariant statements
    // (5386 B) are meant to stay inline in full, so this number moves with the
    // catalog's own prose, not with rendering choices.
    expect(sharedBytes).toBeLessThan(12000);
  });
});
