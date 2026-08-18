// The gates the EVALUATOR can run by itself, over an agent's emitted output.
//
// Three of the rubric's dimensions are objectively checkable from the output
// text plus the catalog, so they are not left to judgement. Two more (does it
// compile, does it register, does it stream) need real tooling and are supplied
// from outside; see rubric.mjs.
//
// EVERY SCAN REPORTS WHAT IT LOOKED AT. A scan of zero files is not a pass — it
// is a scan of zero files, and it says so, because "no hits" and "nothing was
// loaded" are the same output and only one of them means anything. Callers must
// read `filesScanned`.

import { NEEDLE_TABLE, variantsOf } from './audit-needles.mjs';

/** Extensions treated as CODE. Prose is judged, not scanned. */
export const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.html', '.astro'];

export const isCodeFile = (name) => CODE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/**
 * Positions where a `kai-*` string is unambiguously an ELEMENT TAG.
 *
 * This is the whole reason the scan is trustworthy, so it is worth being precise
 * about what it deliberately does NOT match:
 *
 *  - `kai-submit`, `kai-conversation-select` and every other EVENT name shares
 *    the prefix. A bare /kai-[a-z-]+/ would report every event as a fabricated
 *    element. Events never appear after `<`.
 *  - Prose. An agent that correctly writes "there is no kai-datagrid element"
 *    is doing the right thing, and flagging it would punish the honest answer —
 *    which is the single most valuable behaviour this deck measures. Prose is
 *    scored by the judged honesty-bound dimension instead, and this scan is run
 *    over emitted CODE only.
 *  - `--kai-*` theme tokens: a CSS custom property is not a tag, and the leading
 *    `--` is excluded explicitly rather than by luck.
 */
const TAG_POSITIONS = [
  { what: 'markup', re: /<\/?(kai-[a-z0-9-]+)/g },
  { what: 'customElements', re: /customElements\.(?:define|whenDefined|get)\(\s*['"`](kai-[a-z0-9-]+)['"`]/g },
  { what: 'createElement', re: /createElement\(\s*['"`](kai-[a-z0-9-]+)['"`]/g },
  { what: 'query', re: /querySelector(?:All)?\(\s*['"`](kai-[a-z0-9-]+)['"`]/g },
];

/**
 * @param {string} text
 * @returns {{ tag: string, where: string }[]}
 */
export function tagsUsedIn(text) {
  /** @type {{ tag: string, where: string }[]} */
  const found = [];
  for (const { what, re } of TAG_POSITIONS) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
      // `--kai-x` cannot reach the markup branch (`<` precedes it), and the
      // quoted branches require an opening quote, so no token here is a token.
      found.push({ tag: m[1], where: what });
    }
  }
  return found;
}

/**
 * MECHANICAL GATE — elements-exist. Every `kai-*` tag used as a tag must be one
 * the kit actually ships.
 *
 * A tag WITHOUT the `kai-` prefix is not checked and must not be: registering
 * your own `<my-grid>` and pointing `kai-chat.cardTypes` at it is a correct
 * answer to the refusal scenario, not a fabrication. The kit's namespace is the
 * only namespace this gate owns.
 *
 * @param {{ files: { name: string, text: string }[], knownTags: Iterable<string> }} input
 */
export function gateElementsExist({ files, knownTags }) {
  const known = new Set(knownTags);
  if (!known.size) {
    throw new Error(
      'gateElementsExist was given an empty known-tag set. Every tag would be reported fabricated, which is a broken input, not a finding.',
    );
  }
  const code = files.filter((f) => isCodeFile(f.name));
  /** @type {{ tag: string, file: string, where: string }[]} */
  const fabricated = [];
  /** @type {Set<string>} */
  const used = new Set();
  for (const f of code) {
    for (const hit of tagsUsedIn(f.text)) {
      used.add(hit.tag);
      if (!known.has(hit.tag)) fabricated.push({ tag: hit.tag, file: f.name, where: hit.where });
    }
  }
  return {
    id: 'elements-exist',
    passed: fabricated.length === 0,
    filesScanned: code.length,
    vacuous: code.length === 0,
    tagsUsed: [...used].sort(),
    fabricated,
    detail: fabricated.length
      ? `${new Set(fabricated.map((f) => f.tag)).size} fabricated tag(s) in ${fabricated.length} place(s): ${[
          ...new Set(fabricated.map((f) => f.tag)),
        ].join(', ')}`
      : `${used.size} kai-* tag(s) used, all of which the kit ships`,
  };
}

/**
 * MECHANICAL GATE — audit-clean. The pack's own self-audit, run over the output
 * instead of trusting the agent to have run it.
 *
 * The needles and their quote variants come from `audit-needles.mjs`, the same
 * table the pack prints, so this cannot drift from what the agent was told to
 * check. It is a FLOOR and not a proof — the module that owns the needles says
 * so at length — and the report repeats that rather than implying a clean scan
 * means the invariants were honoured.
 *
 * @param {{ files: { name: string, text: string }[] }} input
 */
export function gateAuditClean({ files }) {
  const code = files.filter((f) => isCodeFile(f.name));
  /** @type {{ key: string, invariant: string, needle: string, file: string }[]} */
  const hits = [];
  for (const f of code) {
    for (const [key, record] of Object.entries(NEEDLE_TABLE)) {
      for (const variant of variantsOf(record.needle)) {
        if (f.text.includes(variant)) {
          hits.push({ key, invariant: key.split('#')[0], needle: variant, file: f.name });
          break;
        }
      }
    }
  }
  return {
    id: 'audit-clean',
    passed: hits.length === 0,
    filesScanned: code.length,
    vacuous: code.length === 0,
    hits,
    detail: hits.length
      ? `${hits.length} wrong-form hit(s): ${[...new Set(hits.map((h) => h.key))].join(', ')}`
      : `no wrong-form needle fired across ${Object.keys(NEEDLE_TABLE).length} needles — a floor, not a proof`,
  };
}

/**
 * CONTAMINATION CONTROL. The packer redacts every scenario's scoring lines out
 * of `agent/`, so a scoring line appearing VERBATIM in the agent's output means
 * the agent read `judge/`. That run is not a measurement of the catalog, it is a
 * measurement of the answer key, and it must be refused rather than scored.
 *
 * Checked over EVERY scenario's lines, not this run's, because a pack for S1 is
 * still contaminated by an agent that read S2's key.
 *
 * @param {{ files: { name: string, text: string }[], scenarios: { id: string, scoring: string[] }[] }} input
 */
export function scanJudgeLeak({ files, scenarios }) {
  /** @type {{ scenario: string, line: string, file: string }[]} */
  const leaks = [];
  for (const f of files) {
    for (const s of scenarios) {
      for (const line of s.scoring) {
        if (f.text.includes(line)) leaks.push({ scenario: s.id, line, file: f.name });
      }
    }
  }
  return { clean: leaks.length === 0, filesScanned: files.length, leaks };
}
