// The gates the EVALUATOR can run by itself, over an agent's emitted output.
//
// `elements-exist` and `audit-clean` are objectively checkable from the output
// text plus the catalog, so they are not left to judgement. The rest of the
// mechanical dimensions -- does it compile, does it register, does it stream --
// need real tooling and are supplied from outside.
//
// NO COUNTS HERE ON PURPOSE. This comment used to say "Three ... Two more" and
// had them exactly backwards, in the file whose whole job is to stop a confident
// claim being made without looking. The split is a fact `rubric.mjs` already
// holds -- `DIMENSIONS.filter(d => d.runner === 'evaluator')` -- so the names go
// here and the arithmetic stays where it can be derived. It is pinned by
// `acceptance-eval.test.ts`, which asserts this list against `DIMENSIONS`.
//
// EVERY SCAN REPORTS WHAT IT LOOKED AT. A scan of zero files is not a pass — it
// is a scan of zero files, and it says so, because "no hits" and "nothing was
// loaded" are the same output and only one of them means anything. Callers must
// read `filesScanned`.

import { NEEDLE_TABLE, variantsOf } from './audit-needles.mjs';

/** Extensions treated as CODE. Prose is judged, not scanned. */
export const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.html', '.htm', '.astro', '.py',
];

/**
 * Files whose CONTENT is read for fenced code. Deliberately only the markdown
 * family: anything else that is not a code file is treated as UNREAD, and an
 * unread file blocks the "no subject" verdict rather than being ignored.
 *
 * `.txt` is NOT here on purpose. A `main.txt` full of raw code has no fences, so
 * fence-extracting it would find nothing and the scan would then claim there was
 * no code — a confident verdict produced by not looking, which is the failure
 * this whole area keeps producing.
 */
export const PROSE_EXTENSIONS = ['.md', '.markdown', '.mdx'];

export const isCodeFile = (name) => CODE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
export const isProseFile = (name) => PROSE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/**
 * Files the scan did NOT read at all: neither code, nor prose it extracts fences
 * from. Their existence means "we found no code" cannot be upgraded to "there is
 * no code", so the scorer refuses a not-applicable verdict while any exist.
 */
export const unreadFiles = (files) => files.filter((f) => !isCodeFile(f.name) && !isProseFile(f.name)).map((f) => f.name);

/**
 * The language token, stripped of the decorations real markdown carries:
 * ```{html}``` (R-style braces), ```html,twoslash``` (comma attributes) and
 * ```html:src/main.ts``` (path annotations) all mean html. Each of those forms
 * previously fell through as an unknown language, so the block was skipped and
 * the gate went on to describe the file as containing no code.
 */
const normaliseFenceLang = (lang) => String(lang).toLowerCase().replace(/^[{[(]|[}\])]$/g, '').split(/[,;:{}]/)[0].trim();

/** Fence languages that mean "this block is code the agent is proposing". */
const CODE_FENCE_LANGS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'javascript', 'typescript', 'html', 'vue', 'svelte', 'astro']);

/**
 * Every CommonMark fenced block: THREE OR MORE backticks, or three or more
 * tildes, with a closing fence of the same character and at least the same
 * length.
 *
 * A regex for exactly three backticks is what shipped, and it did not merely
 * miss the other forms — IT FAILED OPEN when they were mixed. A `~~~html` block
 * was invisible, so a fabricated tag inside it was never seen; and because a
 * recognised ```ts block elsewhere in the file made the scan non-vacuous, the
 * gate reported a CLEAN PASS rather than "nothing to look at". That is the H2
 * failure mode again in a narrower disguise: a confident verdict produced by not
 * looking.
 *
 * @param {string} text
 * @returns {{ lang: string, text: string }[]}
 */
export function fencedBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let open = null;
  for (const line of lines) {
    const fence = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*(.*)$/.exec(line);
    if (open) {
      // A closing fence is the same character, at least as long, and carries no
      // info string. Anything else is content — including a shorter run of the
      // same character, which is why length is compared rather than equality.
      if (fence && fence[1][0] === open.char && fence[1].length >= open.length && fence[2].trim() === '') {
        blocks.push({ lang: open.lang, text: open.body.join('\n') });
        open = null;
      } else {
        open.body.push(line);
      }
      continue;
    }
    if (!fence) continue;
    // Backtick info strings may not contain a backtick (CommonMark); the info
    // string is the first word, so `ts twoslash` is still ts.
    const info = fence[2].trim();
    if (fence[1][0] === '`' && info.includes('`')) continue;
    open = { char: fence[1][0], length: fence[1].length, lang: info.split(/\s+/)[0] ?? '', body: [] };
  }
  // An UNCLOSED fence still yields its content. Dropping it would let a
  // truncated answer hide code from the gates, which is the fail-open direction.
  if (open) blocks.push({ lang: open.lang, text: open.body.join('\n') });
  return blocks;
}

/**
 * THE UNITS THE GATES ACTUALLY SCAN: every code file, plus every fenced code
 * block inside a prose file.
 *
 * Fences are included because of a real hole. Several scenarios — the debugging
 * one especially — are answered as prose with the fix in a fenced block, and a
 * gate that only read `.ts` files saw nothing at all. It then scored a clean
 * pass on the strength of having opened zero files, taking a third of that
 * scenario's weight for it.
 *
 * Prose OUTSIDE a fence is still never scanned, and that is not an oversight: an
 * answer that says "there is no <kai-datagrid> in this kit" is the best possible
 * answer to the refusal scenario, and flagging it for naming the thing it
 * declined to invent would punish exactly the behaviour the deck exists to
 * reward. The fence is the boundary between "here is code I am giving you" and
 * "here is me talking about code".
 *
 * KNOWN RESIDUAL, and it applies to BOTH evaluator-run gates rather than only
 * the tag one:
 *
 *  - `gateElementsExist` reads a fenced `<kai-datagrid>` as a proposal even when
 *    the surrounding prose says "do not write this".
 *  - `gateAuditClean` has the identical shape: a ```ts block illustrating
 *    `chat.messages.push(m)` as the WRONG form fires `reactivity-two-halves#0`,
 *    which is the pack's own teaching example quoted back at it.
 *
 * Accepted in both cases. The alternative — ignoring fences — silently
 * un-measures every prose-shaped answer, which is the larger and quieter error,
 * and a false positive here is visible in the report where a false negative is
 * not. A judge who sees it can attribute it as a `pack-defect`.
 *
 * @param {{ name: string, text: string }[]} files
 * @returns {{ name: string, text: string }[]}
 */
export function codeUnits(files) {
  /** @type {{ name: string, text: string }[]} */
  const units = [];
  for (const f of files) {
    if (isCodeFile(f.name)) {
      units.push(f);
      continue;
    }
    // Only PROSE files are fence-extracted. Anything else that is not code is
    // unread, and `unreadFiles` reports it rather than letting it pass as
    // "nothing to see".
    if (!isProseFile(f.name)) continue;
    let index = 0;
    for (const block of fencedBlocks(f.text)) {
      if (!CODE_FENCE_LANGS.has(normaliseFenceLang(block.lang))) continue;
      units.push({ name: `${f.name}#fence${index++}`, text: block.text });
    }
  }
  return units;
}

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
  const code = codeUnits(files);
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
    filesSeen: files.length,
    unread: unreadFiles(files),
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
  const code = codeUnits(files);
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
    filesSeen: files.length,
    unread: unreadFiles(files),
    vacuous: code.length === 0,
    hits,
    detail: hits.length
      ? `${hits.length} wrong-form hit(s): ${[...new Set(hits.map((h) => h.key))].join(', ')}`
      : `no wrong-form needle fired across ${Object.keys(NEEDLE_TABLE).length} needles — a floor, not a proof`,
  };
}

/**
 * CONTAMINATION BACKSTOP — and read what it is before relying on it.
 *
 * WHAT IT CATCHES: an answer key that was COPY-PASTED. The packer redacts every
 * scenario's scoring line out of `agent/`, so a scoring line reappearing in the
 * output means the text came from `judge/`. Checked over EVERY scenario's lines
 * rather than this run's, because a pack for S1 is still contaminated by an
 * agent that read S2's key.
 *
 * WHAT IT DOES NOT CATCH, stated plainly because the honest bound matters more
 * than the guard: AN AGENT THAT READ THE KEY AND WROTE IN ITS OWN WORDS. A
 * reviewer defeated the original form with capitalisation, a doubled space, a
 * newline mid-line, half a line, a paraphrase and an en-dash. Case and
 * whitespace are normalised below because that is cheap and closes the
 * accidental half; the rest is not closable by string matching, and widening the
 * match toward paraphrase would only trade misses for false accusations of
 * cheating. So: THIS DETECTS COPY-PASTE, NOT READING. The real control is
 * structural — the agent is handed `agent/` and never told where `judge/` is.
 *
 * @param {{ files: { name: string, text: string }[], scenarios: { id: string, scoring: string[] }[] }} input
 */
export function scanJudgeLeak({ files, scenarios }) {
  // Case-folded, whitespace-collapsed, and the dash forms unified — the three
  // rewrites a copy-paste picks up on its own from a formatter or an editor.
  const normalise = (s) =>
    s
      .toLowerCase()
      .replace(/[‐-―]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

  /** @type {{ scenario: string, line: string, file: string }[]} */
  const leaks = [];
  for (const f of files) {
    const haystack = normalise(f.text);
    for (const s of scenarios) {
      for (const line of s.scoring) {
        if (haystack.includes(normalise(line))) leaks.push({ scenario: s.id, line, file: f.name });
      }
    }
  }
  return {
    clean: leaks.length === 0,
    filesScanned: files.length,
    leaks,
    detects: 'copy-paste of a scoring line, case- and whitespace-insensitive. NOT paraphrase, and NOT an agent that read the key and wrote its own words.',
  };
}
