#!/usr/bin/env node
// Stamp the standing prohibitions and a role's report shape into a brief,
// reading `docs/superpowers/briefs/template.md` AT RUN TIME.
//
// WHY IT EXISTS
// The standing constraints (no `git checkout`, no rebuilds, no subagents,
// watch-it-fail-first, ...) were being retyped into every implementer brief
// by hand, and were simply absent from every reviewer brief -- nobody had
// ever been asked to retype them there. A re-reviewer, lacking the "never
// `git checkout`" line, ran exactly that into a live working tree to verify
// a reported red/green. The fix is ONE file the prohibitions live in
// (`docs/superpowers/briefs/template.md`); this script is the only sanctioned
// way to turn it into an actual brief, so both roles get it the same way.
//
// WHY THIS SCRIPT NEVER INLINES THE TEMPLATE TEXT
// If the constraints text is copied into this script as a string literal,
// there are two copies again the moment either one is edited, and the whole
// point -- ONE file -- is gone. Every run reads template.md fresh off disk.
//
// WHAT IT ASSERTS
// The generated brief always contains the "Standing constraints (all roles)"
// section, verbatim from the template, plus the requested role's skeleton.
// Placeholder substitution only fills placeholders it was explicitly given a
// value for; an unset `{{KEY}}` is left VISIBLE in the output rather than
// silently dropped, because a brief that quietly loses a placeholder is
// exactly the kind of quiet failure this repo's guards exist to rule out. A
// missing template file, or a template missing a required section heading,
// is a hard failure -- a generator that can emit a brief with no
// constraints section is the defect this guard exists to prevent.
//
// Usage:
//   node scripts/brief.mjs --role implementer --out /tmp/brief.md --set TASK="..." --set FILES="..."
//   node scripts/brief.mjs --role reviewer                # prints to stdout
//   node scripts/brief.mjs --self-test
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_PATH = join(SCRIPT_DIR, '..', 'docs/superpowers/briefs/template.md');

const CONSTRAINTS_HEADING = 'Standing constraints (all roles)';
const ROLE_HEADINGS = {
  implementer: 'Implementer brief',
  reviewer: 'Reviewer brief',
};

function fail(message, details = []) {
  const lines = [''];
  lines.push(`✗ brief: ${message}`);
  for (const d of details) lines.push(`  - ${d}`);
  console.error(lines.join('\n'));
  process.exit(1);
}

/** Split a `## Heading` markdown file into a Map of heading text -> body
 *  text (everything up to the next `## ` heading or EOF, trimmed). */
function extractSections(text) {
  const lines = text.split('\n');
  const raw = new Map();
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      current = m[1];
      raw.set(current, []);
    } else if (current !== null) {
      raw.get(current).push(line);
    }
  }
  const sections = new Map();
  for (const [heading, bodyLines] of raw) sections.set(heading, bodyLines.join('\n').trim());
  return sections;
}

/** Replace every `{{KEY}}` for which `subs` has an OWN key; anything else is
 *  left exactly as written -- that visibility is the point, not a bug. */
function substitute(text, subs) {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(subs, key) ? subs[key] : match,
  );
}

/** Read template.md and build the requested role's brief. Throws (does not
 *  exit) so callers -- including the self-test -- can assert on the message. */
function buildBrief(templatePath, role, subs) {
  if (!existsSync(templatePath)) {
    throw new Error(`no template at ${templatePath}`);
  }
  const text = readFileSync(templatePath, 'utf8');
  const sections = extractSections(text);

  if (!sections.has(CONSTRAINTS_HEADING)) {
    throw new Error(
      `${templatePath} has no "## ${CONSTRAINTS_HEADING}" section -- a brief with no constraints section is the exact defect this guard exists to prevent`,
    );
  }

  const roleHeading = ROLE_HEADINGS[role];
  if (!roleHeading) {
    throw new Error(`unknown role "${role}" (known: ${Object.keys(ROLE_HEADINGS).join(', ')})`);
  }
  if (!sections.has(roleHeading)) {
    throw new Error(`${templatePath} has no "## ${roleHeading}" section`);
  }

  const out =
    `## ${CONSTRAINTS_HEADING}\n\n${sections.get(CONSTRAINTS_HEADING)}\n\n` +
    `## ${roleHeading}\n\n${sections.get(roleHeading)}\n`;
  return substitute(out, subs);
}

function parseArgs(argv) {
  const opts = { role: undefined, out: undefined, template: undefined, set: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--role') opts.role = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--template') opts.template = argv[++i];
    else if (a === '--set') {
      const kv = argv[++i];
      const eq = kv === undefined ? -1 : kv.indexOf('=');
      if (eq === -1) fail(`--set value ${JSON.stringify(kv)} is not KEY=VALUE.`);
      opts.set[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
  }
  return opts;
}

function run() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.role) fail('--role <implementer|reviewer> is required.');
  const templatePath = opts.template ?? DEFAULT_TEMPLATE_PATH;

  let brief;
  try {
    brief = buildBrief(templatePath, opts.role, opts.set);
  } catch (err) {
    fail(err.message);
  }

  if (opts.out) {
    writeFileSync(opts.out, brief);
    console.log(`✓ brief: wrote ${opts.role} brief to ${opts.out}`);
  } else {
    process.stdout.write(brief);
  }
}

// ---------------------------------------------------------------------------
// self-test
// ---------------------------------------------------------------------------

const VALID_FIXTURE = `# fixture template

## Standing constraints (all roles)

- No \`git checkout\` -- ever.
- Never rebuild unless told to.

## Implementer brief

TASK: {{TASK}}
FILES: {{FILES}}

## Reviewer brief

CHANGE: {{CHANGE}}
`;

const MISSING_CONSTRAINTS_FIXTURE = `# fixture template, no constraints section

## Implementer brief

TASK: {{TASK}}
`;

function selfTest() {
  let dir;
  const cases = [];
  const record = (name, fn) => {
    try {
      fn();
      cases.push({ name, ok: true });
    } catch (err) {
      cases.push({ name, ok: false, error: err.message });
    }
  };
  const assert = (cond, message) => {
    if (!cond) throw new Error(message);
  };

  try {
    dir = mkdtempSync(join(tmpdir(), 'brief-selftest-'));
    const validPath = join(dir, 'valid-template.md');
    const missingConstraintsPath = join(dir, 'no-constraints-template.md');
    writeFileSync(validPath, VALID_FIXTURE);
    writeFileSync(missingConstraintsPath, MISSING_CONSTRAINTS_FIXTURE);

    record('implementer role emits the constraints section', () => {
      const out = buildBrief(validPath, 'implementer', {});
      assert(out.includes('## Standing constraints (all roles)'), 'missing constraints heading');
      assert(out.includes('No `git checkout` -- ever.'), 'missing constraints body');
      assert(out.includes('## Implementer brief'), 'missing role heading');
    });

    record('reviewer role emits the constraints section', () => {
      const out = buildBrief(validPath, 'reviewer', {});
      assert(out.includes('## Standing constraints (all roles)'), 'missing constraints heading');
      assert(out.includes('No `git checkout` -- ever.'), 'missing constraints body');
      assert(out.includes('## Reviewer brief'), 'missing role heading');
    });

    record('a template missing the constraints section FAILS', () => {
      let threw = false;
      try {
        buildBrief(missingConstraintsPath, 'implementer', {});
      } catch (err) {
        threw = true;
        assert(/Standing constraints/.test(err.message), `error should name the missing section, got: ${err.message}`);
      }
      assert(threw, 'expected buildBrief to throw on a template missing the constraints section');
    });

    record('a missing template file FAILS', () => {
      let threw = false;
      try {
        buildBrief(join(dir, 'does-not-exist.md'), 'implementer', {});
      } catch (err) {
        threw = true;
      }
      assert(threw, 'expected buildBrief to throw when the template file does not exist');
    });

    record('placeholder substitution works, unset placeholders stay visible', () => {
      const out = buildBrief(validPath, 'implementer', { TASK: 'fix the widget' });
      assert(out.includes('TASK: fix the widget'), 'TASK placeholder was not substituted');
      assert(out.includes('FILES: {{FILES}}'), 'unset FILES placeholder should remain visible, not be dropped');
    });

    record('unknown role fails', () => {
      let threw = false;
      try {
        buildBrief(validPath, 'astrologer', {});
      } catch (err) {
        threw = true;
        assert(/unknown role/.test(err.message), `error should say unknown role, got: ${err.message}`);
      }
      assert(threw, 'expected buildBrief to throw for an unknown role');
    });

    const failed = cases.filter((c) => !c.ok);
    console.log('brief --self-test:');
    for (const c of cases) {
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ` -- ${c.error}`}`);
    }
    if (failed.length > 0) {
      fail(`${failed.length} of ${cases.length} self-test case(s) failed.`, failed.map((c) => `${c.name}: ${c.error}`));
    }
    console.log(`✓ brief: all ${cases.length} self-test cases passed.`);
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

const argv = process.argv.slice(2);
if (argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
} else {
  run();
}
