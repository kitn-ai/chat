/**
 * THE WIZARD MUST NEVER EMIT WHAT THE SCHEMA REJECTS, AND MUST NEVER GO SILENT
 * ON A SCHEMA KEY IT HAS NOT CONSCIOUSLY CLASSIFIED.
 *
 * Two independent guarantees, mirroring `menu-honesty.test.ts`'s own two-guard
 * shape:
 *
 *  - Registry drift (W-2): every key `ConstructSchema` actually has — read off
 *    the real zod object, never hand-listed — must appear in `WIZARD_REGISTRY`
 *    with a real classification. A new schema key goes red here until someone
 *    consciously decides whether the wizard asks it, states it, or leaves it
 *    alone.
 *  - Full-matrix validation: every construct `composeConstruct` can produce,
 *    enumerated programmatically over the whole answer space, must validate
 *    against the real schema and keep the schema's own cross-field laws
 *    (history off => no conversations key; provider is always the keyless
 *    promise).
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONSTRUCT_SCHEMA_URL, ConstructSchema } from '@kitn.ai/ui/construct';
import { buildableTemplates } from '@kitn.ai/ui/construct/templates';

import {
  composeConstruct,
  constructTagName,
  emitConstruct,
  runDevPreview,
  runWizard,
  shapeAxis,
  WIZARD_REGISTRY,
  type ShapeId,
  type SpawnLike,
  type WizardAnswers,
  type WizardIo,
} from '../src/wizard';
import { decideAxis } from '../src/axes';
import { validateProjectName } from '../src/args';

/**
 * Unwrap a zod schema down to the plain `ZodObject` carrying `.shape` — zod 4
 * wraps `.optional()` (and `.strict()` does not add a wrapper of its own), so
 * `.unwrap()` peels exactly the layers `composeConstruct`'s own fields put on.
 * A small helper rather than hand-listing the keys underneath, per the
 * registry drift rule this test exists to enforce.
 */
function shapeOf(schema: unknown): Record<string, unknown> {
  let s = schema as { unwrap?: () => unknown; shape?: Record<string, unknown> };
  while (typeof s.unwrap === 'function') {
    s = s.unwrap() as typeof s;
  }
  if (!s.shape) {
    throw new Error('shapeOf: reached a schema with no .shape after unwrapping');
  }
  return s.shape;
}

describe('WIZARD_REGISTRY tracks every real schema key (no drift)', () => {
  const topKeys = Object.keys(shapeOf(ConstructSchema));
  const capabilitiesKeys = Object.keys(
    shapeOf((ConstructSchema as unknown as { shape: Record<string, unknown> }).shape.capabilities),
  );

  it('classifies every top-level ConstructSchema key', () => {
    for (const key of topKeys) {
      expect(WIZARD_REGISTRY, `top-level key "${key}" is not classified in WIZARD_REGISTRY`).toHaveProperty(
        key,
      );
    }
  });

  it('classifies every capabilities key as "capabilities.<key>"', () => {
    for (const key of capabilitiesKeys) {
      const regKey = `capabilities.${key}`;
      expect(
        WIZARD_REGISTRY,
        `capabilities key "${key}" is not classified in WIZARD_REGISTRY as "${regKey}"`,
      ).toHaveProperty(regKey);
    }
  });

  it('carries no phantom keys the schema does not have', () => {
    const known = new Set([...topKeys, ...capabilitiesKeys.map((k) => `capabilities.${k}`)]);
    for (const key of Object.keys(WIZARD_REGISTRY)) {
      expect(known.has(key), `WIZARD_REGISTRY has "${key}", which is not a real schema key`).toBe(true);
    }
  });

  it('every entry has a real reason and a valid status', () => {
    for (const [key, entry] of Object.entries(WIZARD_REGISTRY)) {
      expect(['asked', 'stated', 'not-asked']).toContain(entry.status);
      expect(entry.reason.length, `"${key}" has no real reason`).toBeGreaterThan(10);
    }
  });
});

// The full answer matrix, enumerated rather than hand-picked.
const BOOLS = [false, true];
const SHAPES: WizardAnswers['shape'][] = ['widget', 'scratch'];
const STARTER_SETS: string[][] = [[], ['one starter'], ['a', 'b', 'c', 'd', 'e', 'f']];
const OPTIONAL_STRINGS = ['', 'a real value'];

function* answerMatrix(): Generator<WizardAnswers> {
  for (const shape of SHAPES) {
    for (const home of BOOLS) {
      for (const attachments of BOOLS) {
        for (const history of BOOLS) {
          for (const starters of STARTER_SETS) {
            for (const headerTitle of OPTIONAL_STRINGS) {
              for (const accent of OPTIONAL_STRINGS) {
                for (const homeGreeting of OPTIONAL_STRINGS) {
                  yield {
                    name: 'kai-wizard-app',
                    shape,
                    headerTitle,
                    home,
                    homeGreeting,
                    starters,
                    attachments,
                    history,
                    accent,
                  };
                }
              }
            }
          }
        }
      }
    }
  }
}

describe('composeConstruct: every cell of the answer matrix validates', () => {
  const cells = [...answerMatrix()];

  it('is not vacuous', () => {
    expect(cells.length).toBeGreaterThan(50);
  });

  for (const [i, answers] of cells.entries()) {
    it(`cell ${i}: ${JSON.stringify(answers)}`, () => {
      const construct = composeConstruct(answers);
      const result = ConstructSchema.safeParse(construct);
      expect(
        result.success,
        `safeParse failed for ${JSON.stringify(answers)}: ${
          result.success ? '' : JSON.stringify(result.error.issues)
        }`,
      ).toBe(true);

      const c = construct as {
        capabilities?: { conversations?: boolean; history?: unknown };
        provider: unknown;
      };
      if (answers.history) {
        expect(c.capabilities?.conversations).toBe(true);
      } else {
        expect(c.capabilities?.conversations).toBeUndefined();
      }
      expect(c.provider).toEqual({ mode: 'mock' });
    });
  }
});

describe('runWizard: the SET of keys it asks/states matches the registry exactly', () => {
  /**
   * A tightened replacement for a prior version of this block that only
   * asserted nonzero counts — which would stay green even if runWizard asked
   * a 'not-asked' key, skipped an 'asked' key, or drifted from the registry
   * in either direction. This version maps every `io.text`/`io.confirm`/
   * `io.multilineList` call to the exact registry key it corresponds to (by
   * matching the literal prompt message runWizard sends), and every
   * `io.state` call to the exact registry key it corresponds to (by matching
   * the literal label). An unrecognized message/label fails loudly rather
   * than being silently uncounted, so a new or reworded prompt in
   * `wizard.ts` has to be taught to this map or the test fails — it cannot
   * pass by accident.
   *
   * Two keys are 'asked' in the registry but are NOT runWizard's own
   * question: 'layout' is asked upstream by `shapeAxis`, before runWizard is
   * ever called (runWizard only receives the already-decided `shape`), and
   * 'capabilities' is the container — its actual questions live on the
   * capabilities.* entries, not on 'capabilities' itself. Both are excluded
   * from the expected-asked set below, and the exclusion is the whole reason
   * this comment exists: a set difference should never speak for itself.
   */
  const ASK_MESSAGE_TO_KEY: Record<string, string> = {
    'Header title? (leave blank for none)': 'header',
    'Accent color? (leave blank for the kit default)': 'theme',
    'Show a home/greeting screen?': 'home',
    'Greeting title? (leave blank for the default)': 'home',
    "Starter prompts (comma-separated, up to 6, blank to keep the template's)": 'capabilities.starters',
    'Allow file attachments?': 'capabilities.attachments',
    'Persist conversation history in this browser?': 'capabilities.history',
  };
  const STATE_LABEL_TO_KEY: Record<string, string> = {
    Schema: '$schema',
    Name: 'name',
    Provider: 'provider',
    Conversations: 'capabilities.conversations',
  };

  function spyIo(): { io: WizardIo; askedKeys: Set<string>; statedKeys: Set<string> } {
    const askedKeys = new Set<string>();
    const statedKeys = new Set<string>();
    const mapAsk = (msg: string): string => {
      const key = ASK_MESSAGE_TO_KEY[msg];
      expect(key, `runWizard asked an unmapped message: "${msg}" — teach it to ASK_MESSAGE_TO_KEY`).toBeDefined();
      askedKeys.add(key);
      return key;
    };
    const io: WizardIo = {
      async text(msg: string, initial?: string) {
        mapAsk(msg);
        return initial ?? '';
      },
      async confirm(msg: string, initial: boolean) {
        mapAsk(msg);
        return initial;
      },
      async multilineList(msg: string) {
        mapAsk(msg);
        return [];
      },
      state(label: string) {
        const key = STATE_LABEL_TO_KEY[label];
        expect(key, `runWizard stated an unmapped label: "${label}" — teach it to STATE_LABEL_TO_KEY`).toBeDefined();
        statedKeys.add(key);
      },
    };
    return { io, askedKeys, statedKeys };
  }

  // The spy's confirm() returns the initial value runWizard passes. Run this
  // against 'scratch' specifically: its starter has no history of its own, so
  // `history`'s initial defaults to `true` (the `shape === 'scratch'` half of
  // runWizard's own default) and the starter-has-no-history guard lets the
  // conditional 'Conversations' state call fire — so the expected-stated set
  // below can be the FULL stated set with no carve-out for it. A template
  // shape whose starter already persists (e.g. 'widget') would NOT restate
  // Conversations, since nothing changed from the starter's own value.
  const EXPECTED_ASKED = new Set(
    Object.entries(WIZARD_REGISTRY)
      .filter(([, e]) => e.status === 'asked')
      .map(([k]) => k)
      .filter((k) => k !== 'layout' && k !== 'capabilities'),
  );
  const EXPECTED_STATED = new Set(
    Object.entries(WIZARD_REGISTRY)
      .filter(([, e]) => e.status === 'stated')
      .map(([k]) => k),
  );

  it('is not vacuous: the expected sets are non-empty', () => {
    expect(EXPECTED_ASKED.size).toBeGreaterThan(0);
    expect(EXPECTED_STATED.size).toBeGreaterThan(0);
  });

  it('interactive mode asks exactly the asked keys (minus layout/capabilities) and states exactly the stated keys', async () => {
    const { io, askedKeys, statedKeys } = spyIo();
    await runWizard('scratch', 'kai-app', io, false);
    expect(askedKeys).toEqual(EXPECTED_ASKED);
    expect(statedKeys).toEqual(EXPECTED_STATED);
  });

  it('non-interactive mode asks nothing and states nothing, and still returns defaults', async () => {
    const { io, askedKeys, statedKeys } = spyIo();
    const answers = await runWizard('scratch', 'kai-app', io, true);
    expect(askedKeys).toEqual(new Set());
    expect(statedKeys).toEqual(new Set());
    expect(answers.name).toBe('kai-app');
    expect(answers.shape).toBe('scratch');
    // The defaults themselves must still compose into a valid construct.
    const construct = composeConstruct(answers);
    expect(ConstructSchema.safeParse(construct).success).toBe(true);
  });
});

describe("runWizard: template seeding states 'Template'/'Variant' and seeds initials from the starter (B-17a)", () => {
  function recordingIo(): {
    io: WizardIo;
    states: [string, string][];
    initials: Record<string, unknown>;
  } {
    const states: [string, string][] = [];
    const initials: Record<string, unknown> = {};
    const io: WizardIo = {
      async text(msg, initial) {
        initials[msg] = initial;
        return initial ?? '';
      },
      async confirm(msg, initial) {
        initials[msg] = initial;
        return initial;
      },
      async multilineList() {
        return [];
      },
      state(label, statement) {
        states.push([label, statement]);
      },
    };
    return { io, states, initials };
  }

  it("states 'Template' for a template shape but not 'Variant' for a non-workspace template", async () => {
    const { io, states } = recordingIo();
    await runWizard('widget', 'kai-app', io, false);
    expect(states.some(([label]) => label === 'Template')).toBe(true);
    expect(states.some(([label]) => label === 'Variant')).toBe(false);
  });

  it("states both 'Template' and 'Variant' for the workspace shape", async () => {
    const { io, states } = recordingIo();
    await runWizard('workspace', 'kai-app', io, false);
    expect(states.some(([label]) => label === 'Template')).toBe(true);
    expect(states.some(([label]) => label === 'Variant')).toBe(true);
  });

  it("does not state 'Template' for scratch", async () => {
    const { io, states } = recordingIo();
    await runWizard('scratch', 'kai-app', io, false);
    expect(states.some(([label]) => label === 'Template')).toBe(false);
  });

  it('seeds io.text/io.confirm initial values from the template starter (assistant)', async () => {
    const { io, initials } = recordingIo();
    await runWizard('assistant', 'kai-app', io, false);
    expect(initials['Header title? (leave blank for none)']).toBe('Assistant');
    expect(initials['Accent color? (leave blank for the kit default)']).toBe('#7c3aed');
    expect(initials['Allow file attachments?']).toBe(true);
    expect(initials['Persist conversation history in this browser?']).toBe(true);
  });
});

describe('emitConstruct: writes the construct file to disk', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-emit-construct-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const ANSWERS: WizardAnswers = {
    name: 'kai-widget-app',
    shape: 'widget',
    headerTitle: '',
    home: false,
    homeGreeting: '',
    starters: [],
    attachments: false,
    history: false,
    accent: '',
  };

  it('writes valid 2-space JSON with a trailing newline that reparses and validates', async () => {
    const dir = path.join(root, 'proj');
    const { file } = await emitConstruct(dir, ANSWERS);

    const raw = await readFile(file, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.endsWith('\n\n')).toBe(false);

    const parsed = JSON.parse(raw);
    expect(ConstructSchema.safeParse(parsed).success).toBe(true);
    expect(parsed.name).toBe('kai-widget-app');
    expect(parsed.layout).toBe('widget');

    // `$schema` is `z.string().optional()` in the real schema — safeParse
    // above would pass for ANY string there, so it proves nothing about
    // WHICH url shipped. This is the actual drift guard for the
    // `__CONSTRUCT_SCHEMA_URL__` esbuild define (see wizard.ts's header):
    // an exact match against the real, live `CONSTRUCT_SCHEMA_URL` import.
    expect(parsed.$schema).toBe(CONSTRUCT_SCHEMA_URL);

    // 2-space indentation: the JSON round-trips through JSON.stringify(_, null, 2).
    expect(raw).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
  });

  it('names the file after the project and returns a devCommand naming that file', async () => {
    const dir = path.join(root, 'my-app');
    const { file, devCommand } = await emitConstruct(dir, ANSWERS);

    expect(path.basename(file)).toBe('kai-widget-app.construct.json');
    expect(devCommand).toContain('npx @kitn.ai/ui dev');
    expect(devCommand).toContain(path.basename(file));
  });

  it('refuses a non-empty target dir loudly', async () => {
    const dir = path.join(root, 'occupied');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'existing.txt'), 'hi', 'utf8');

    await expect(emitConstruct(dir, ANSWERS)).rejects.toThrow(/already exists and is not empty/);
  });

  it('writes into an already-existing but empty dir without complaint', async () => {
    const dir = path.join(root, 'empty-already');
    await mkdir(dir, { recursive: true });

    const { file } = await emitConstruct(dir, ANSWERS);
    expect(await readFile(file, 'utf8')).toBeTruthy();
  });

  // The actual bug fix round 3 exists for: `create-kai myapp --shape widget
  // --yes` used to write `"name": "myapp"` into the construct — a valid
  // PROJECT name, but not a valid custom-element TAG (no hyphen) — so the
  // tool's own printed next step (`npx @kitn.ai/ui dev ...`) rejected the
  // file it had just created.
  it('derives a schema-valid tag when the project name has no hyphen, and reports it as constructName', async () => {
    const dir = path.join(root, 'myapp');
    const { file, constructName } = await emitConstruct(dir, { ...ANSWERS, name: 'myapp' });

    expect(constructName).toBe('myapp-widget');
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    expect(parsed.name).toBe('myapp-widget');
    expect(ConstructSchema.safeParse(parsed).success).toBe(true);

    // The FILE keeps the plain project name — only `Construct.name` needed
    // the tag rule (see constructTagName's header in wizard.ts).
    expect(path.basename(file)).toBe('myapp.construct.json');
  });

  it('an already-valid tag name passes through unchanged as constructName', async () => {
    const dir = path.join(root, 'already-valid');
    const { constructName } = await emitConstruct(dir, { ...ANSWERS, name: 'kai-widget-app' });
    expect(constructName).toBe('kai-widget-app');
  });
});

describe('constructTagName: derives a schema-valid Construct.name from any valid project name', () => {
  it('passes an already-valid tag through unchanged', () => {
    expect(constructTagName('kai-widget-app', 'widget')).toBe('kai-widget-app');
    expect(constructTagName('my-app', 'chat')).toBe('my-app');
    // A tag with extra hyphens is still valid on its own terms — passthrough,
    // no suffix appended.
    expect(constructTagName('my--app', 'widget')).toBe('my--app');
  });

  it('appends a shape-based suffix when the name has no hyphen', () => {
    expect(constructTagName('myapp', 'widget')).toBe('myapp-widget');
    expect(constructTagName('myapp', 'chat')).toBe('myapp-chat');
    expect(constructTagName('app2', 'widget')).toBe('app2-widget');
  });

  it('sanitizes uppercase, dots, underscores, and tildes before appending the suffix', () => {
    expect(constructTagName('MyApp', 'widget')).toBe('myapp-widget');
    expect(constructTagName('my.app', 'widget')).toBe('my-app-widget');
    expect(constructTagName('my_app', 'widget')).toBe('my-app-widget');
    expect(constructTagName('my~app', 'widget')).toBe('my-app-widget');
  });

  it('prefixes a non-letter first character (digit, hyphen, scoped @) so the tag still starts with a letter', () => {
    expect(constructTagName('2cool', 'widget')).toBe('k-2cool-widget');
    expect(constructTagName('-leading', 'widget')).toBe('leading-widget');
    expect(constructTagName('@scope/name', 'widget')).toBe('scope-name-widget');
  });

  it('never produces an empty base, even for a name that sanitizes to nothing', () => {
    expect(constructTagName('___', 'widget')).toBe('k-widget');
    expect(constructTagName('~~~', 'chat')).toBe('k-chat');
  });

  it('trims a trailing hyphen rather than doubling up before the suffix', () => {
    // `my-` is accepted by `validateProjectName` but does not itself match
    // the tag rule (nothing follows the hyphen) — sanitizing has to TRIM it,
    // not just append a suffix onto it (which would double the hyphen).
    expect(constructTagName('my-', 'widget')).toBe('my-widget');
    expect(constructTagName('my-', 'chat')).toBe('my-chat');
  });

  // THE PROPERTY THAT ACTUALLY MATTERS: not that this function's OWN mirror
  // regex agrees with itself, but that its output survives the REAL, live
  // `ConstructSchema` — the one the private tag regex in
  // `packages/ui/src/agent-tooling/construct/schema.ts` actually enforces
  // and which this file cannot import (see `constructTagName`'s header on
  // why it isn't a live import). `validateProjectName` (src/args.ts) accepts
  // a broader character set than the construct schema does — this fixture
  // enumerates one representative of every class its regex actually accepts
  // (verified below, not assumed), covering every way the two rulesets are
  // known to disagree: no hyphen, digit-first, hyphen-first, scoped `@`, and
  // the punctuation `validateProjectName` allows that the tag rule forbids
  // (`. _ ~`).
  const REPRESENTATIVE_PROJECT_NAMES = [
    'myapp', // plain word, no hyphen
    'my-app', // already hyphenated — a real tag on its own
    'app2', // trailing digit
    '2cool', // LEADING digit
    'a', // single character
    '-leading', // leading hyphen
    'my-', // TRAILING hyphen — sanitizing has to trim it, not just keep it
    'my.app', // dot
    'my_app', // underscore
    'my~app', // tilde
    '@scope/name', // scoped package name
    'my--app', // a run of hyphens
  ];

  // `*` is NOT in `validateProjectName`'s contract for a bare (unscoped) name
  // — `validateProjectName('*')` returns a real error, so it can never reach
  // `constructTagName` through `index.ts`'s own name-validation gate. It only
  // appears in the SCOPE half of a scoped name (`@*/x` is accepted), which
  // `'@scope/name'` above already exercises for the scope-stripping behaviour.
  // Noted here rather than added to the fixture list above, since a fixture
  // that isn't actually reachable would test a case this function never has
  // to handle.
  it('"*" alone is outside validateProjectName\'s contract (kept out of the fixture list above on purpose)', () => {
    expect(validateProjectName('*')).not.toBeNull();
  });

  it('is not vacuous, and every fixture is actually accepted by validateProjectName', () => {
    expect(REPRESENTATIVE_PROJECT_NAMES.length).toBeGreaterThan(5);
    for (const name of REPRESENTATIVE_PROJECT_NAMES) {
      expect(validateProjectName(name), `fixture "${name}" is not a validateProjectName-accepted name`).toBeNull();
    }
  });

  for (const name of REPRESENTATIVE_PROJECT_NAMES) {
    for (const shape of ['widget', 'scratch'] as const) {
      it(`"${name}" (${shape}) derives a name that safeParses under the real ConstructSchema`, () => {
        const answers: WizardAnswers = {
          name,
          shape,
          headerTitle: '',
          home: false,
          homeGreeting: '',
          starters: [],
          attachments: false,
          history: false,
          accent: '',
        };
        const construct = composeConstruct(answers) as { name: string; layout: string };
        const result = ConstructSchema.safeParse(construct);
        expect(
          result.success,
          `composeConstruct(${JSON.stringify(answers)}) -> name "${construct.name}" failed: ` +
            `${result.success ? '' : JSON.stringify(result.error.issues)}`,
        ).toBe(true);
        // 'widget' shape's construct.layout is 'widget'; 'scratch' composes a
        // 'fullscreen' construct, both mapping onto constructTagName's
        // 'widget' | 'chat' kind exactly the way composeConstruct itself does.
        const kind = construct.layout === 'widget' ? 'widget' : 'chat';
        expect(construct.name).toBe(constructTagName(name, kind));
      });
    }
  }
});

describe('runDevPreview: a live-preview spawn failure decides loudly, not silently', () => {
  /**
   * A fake `SpawnLike` — no real child process. `emit` is called from the
   * test AFTER `runDevPreview` has already attached its listeners (both event
   * names are registered synchronously inside the same tick `spawnFn` runs
   * in), so this mirrors how Node's real `close`/`error` events land.
   */
  function fakeSpawn(): { spawnFn: SpawnLike; fireError(err: Error): void; fireClose(code: number | null, signal: NodeJS.Signals | null): void } {
    const errorListeners: ((err: Error) => void)[] = [];
    const closeListeners: ((code: number | null, signal: NodeJS.Signals | null) => void)[] = [];
    const spawnFn: SpawnLike = () => ({
      on: (event: 'error' | 'close', listener: never) => {
        if (event === 'error') errorListeners.push(listener as (err: Error) => void);
        if (event === 'close') closeListeners.push(listener as (code: number | null, signal: NodeJS.Signals | null) => void);
        return undefined;
      },
    });
    return {
      spawnFn,
      fireError: (err) => errorListeners.forEach((l) => l(err)),
      fireClose: (code, signal) => closeListeners.forEach((l) => l(code, signal)),
    };
  }

  it('a spawn error (e.g. ENOENT) resolves ok:false with the error message, never rejects', async () => {
    const { spawnFn, fireError } = fakeSpawn();
    const outcomePromise = runDevPreview('npx @kitn.ai/ui dev app.construct.json', '/tmp/app', spawnFn);
    fireError(new Error('spawn npx ENOENT'));
    const outcome = await outcomePromise;
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('ENOENT');
  });

  it('the child exiting on its own with a nonzero code resolves ok:false naming the code', async () => {
    const { spawnFn, fireClose } = fakeSpawn();
    const outcomePromise = runDevPreview('npx @kitn.ai/ui dev app.construct.json', '/tmp/app', spawnFn);
    fireClose(1, null);
    const outcome = await outcomePromise;
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('1');
  });

  it('a clean exit (code 0) resolves ok:true with no message', async () => {
    const { spawnFn, fireClose } = fakeSpawn();
    const outcomePromise = runDevPreview('npx @kitn.ai/ui dev app.construct.json', '/tmp/app', spawnFn);
    fireClose(0, null);
    const outcome = await outcomePromise;
    expect(outcome).toEqual({ ok: true, message: null });
  });

  it('a signal-terminated end (Ctrl-C: code null) resolves ok:true — the normal way to stop a live preview, not a failure', async () => {
    const { spawnFn, fireClose } = fakeSpawn();
    const outcomePromise = runDevPreview('npx @kitn.ai/ui dev app.construct.json', '/tmp/app', spawnFn);
    fireClose(null, 'SIGINT');
    const outcome = await outcomePromise;
    expect(outcome).toEqual({ ok: true, message: null });
  });
});

describe('shapeAxis: the buildable-template list + scratch + app (B-17a)', () => {
  it('derives its template options from the registry, in registry order, then scratch, then app', () => {
    const axis = shapeAxis();
    expect(axis.options.map((o) => o.id)).toEqual([
      ...buildableTemplates().map((t) => t.id),
      'scratch',
      'app',
    ]);
  });
  it('labels/hints come from the registry, never restated', () => {
    const axis = shapeAxis();
    for (const t of buildableTemplates()) {
      const opt = axis.options.find((o) => o.id === t.id)!;
      expect(opt.label).toBe(t.name);
      expect(opt.hint).toBe(t.description);
    }
  });
  it('is a real choice with a reason (the ask-or-state law needs both)', () => {
    expect(decideAxis(shapeAxis()).ask).toBe(true);
    expect(shapeAxis().because.length).toBeGreaterThan(10);
  });
});

describe('composeConstruct: template seeding (B-17a)', () => {
  /** The non-interactive answers for a shape — every "keep" sentinel. */
  const keep = (shape: Exclude<ShapeId, 'app'>, name = 'my-proj'): WizardAnswers => {
    const starter = shape === 'scratch' ? undefined : buildableTemplates().find((t) => t.id === shape)!.starter;
    return {
      name,
      shape,
      headerTitle: undefined,
      home: undefined,
      homeGreeting: '',
      starters: [],
      attachments: Boolean(starter?.capabilities?.attachments),
      history: Boolean(starter?.capabilities?.history && starter.capabilities.history.persistence !== 'none'),
      accent: undefined,
    };
  };

  for (const t of buildableTemplates()) {
    it(`${t.id}: unanswered answers round-trip the starter unchanged except $schema/name`, () => {
      const out = composeConstruct(keep(t.id)) as Record<string, unknown>;
      const expected = structuredClone(t.starter) as Record<string, unknown>;
      expected.$schema = CONSTRUCT_SCHEMA_URL;
      expected.name = out.name; // asserted separately below
      expect(out).toEqual(expected);
      expect(ConstructSchema.safeParse(out).success).toBe(true);
    });
  }

  it('the emitted name derives from the PROJECT name and the starter layout, not the starter name', () => {
    const out = composeConstruct(keep('widget', 'acme')) as { name: string };
    expect(out.name).toBe('acme-widget');
    const chat = composeConstruct(keep('research', 'acme')) as { name: string };
    expect(chat.name).toBe('acme-chat');
  });

  it('asked answers OVERRIDE starter fields; blank text answers CLEAR them', () => {
    const answers = { ...keep('assistant'), headerTitle: 'My Bot', accent: '' };
    const out = composeConstruct(answers) as { header?: { title?: string }; theme?: { accent?: string; mode: string } };
    expect(out.header?.title).toBe('My Bot');
    expect(out.theme?.accent).toBeUndefined();
    expect(out.theme?.mode).toBe('system'); // mode survives an accent clear
  });

  it('history off strips history AND conversations (the schema forbids the orphan)', () => {
    const out = composeConstruct({ ...keep('assistant'), history: false }) as {
      capabilities?: Record<string, unknown>;
    };
    expect(out.capabilities?.history).toBeUndefined();
    expect(out.capabilities?.conversations).toBeUndefined();
    expect(ConstructSchema.safeParse(out).success).toBe(true);
  });

  it("history on over a starter WITHOUT it gets the local+conversations pair; research's history-without-conversations shape is preserved", () => {
    const scratch = composeConstruct({ ...keep('scratch'), history: true }) as {
      capabilities?: Record<string, unknown>;
    };
    expect(scratch.capabilities?.history).toEqual({ persistence: 'local' });
    expect(scratch.capabilities?.conversations).toBe(true);
    const research = composeConstruct(keep('research')) as { capabilities?: Record<string, unknown> };
    expect(research.capabilities?.history).toEqual({ persistence: 'local' });
    expect(research.capabilities?.conversations).toBeUndefined();
  });

  it('scratch is the bare fullscreen construct — everything off', () => {
    // 'my-proj' already matches constructTagName's own tag rule (a letter, a
    // hyphen, more letters) — it passes through UNCHANGED, the same
    // already-valid-tag rule 'kai-widget-app' etc. exercise elsewhere in this
    // file. No shape-based suffix is appended here, unlike the hyphen-free
    // 'acme' case tested above.
    const out = composeConstruct(keep('scratch', 'my-proj'));
    expect(out).toEqual({
      $schema: CONSTRUCT_SCHEMA_URL,
      name: 'my-proj',
      layout: 'fullscreen',
      provider: { mode: 'mock' },
    });
    expect(ConstructSchema.safeParse(out).success).toBe(true);
  });
});
