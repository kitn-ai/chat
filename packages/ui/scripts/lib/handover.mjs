// Handover isolation: what the agent is given, and what must not be reachable
// from it.
//
// This lives apart from acceptance-run.mjs because that file is a CLI -- it runs
// work at import time -- and a test that wants to exercise the checks should not
// have to launch a run to do it.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

/** Shared with --prune-handovers so the sweep only ever matches our own directories. */
export const HANDOVER_PREFIX = 'kai-handover-';

/** Every file under `root`, as repo-relative-to-root paths. */
export function filesUnder(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, rel);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out;
}

/**
 * CONTAMINATION CONTROL, and an honest statement of its limit.
 *
 * WHAT THIS ENFORCES, all three now actually checked rather than two checked and
 * one hoped for:
 *
 *  1. CONTENTS — the handover is a copy of `agent/` and nothing else. No
 *     `judge/`, no `PACK.md`, no other run's files, and no scoring line.
 *  2. LOCATION — it is not inside the runs directory, AND no ancestor of it
 *     holds run material. The second half is new: the first version checked only
 *     (1) and the runs-directory case, so "`..` reaches no answer key" was a
 *     property of the TMPDIR default rather than of this function.
 *  3. COMPLETENESS — nothing packed went missing on the way over, so a truncated
 *     handover cannot look like a clean one.
 *
 * WHAT IT DOES NOT ENFORCE: an agent's filesystem access. This script sandboxes
 * nothing. If the harness driving the agent can read the disk, it can read the
 * judge directory whatever this checks. The backstop on the other side is the
 * evaluator's leak scan — and read that function's own note before leaning on
 * it, because it detects COPY-PASTE of a scoring line and not an agent that read
 * the key and paraphrased. Together they make leakage require deliberate effort
 * and leave a trace; neither makes it impossible.
 */
export function verifyHandover({ handoverDir, sourceDir, runsDir, scoringLines }) {
  const problems = [];

  const rel = relative(resolve(runsDir), resolve(handoverDir));
  if (rel && !rel.startsWith('..')) {
    problems.push(
      `the handover directory ${handoverDir} is INSIDE the runs directory ${runsDir}. An agent given it can walk up into the judge material and into every other run. Point --handover somewhere else.`,
    );
  }

  // "`..` REACHES NO ANSWER KEY" IS NOW ENFORCED, not asserted.
  //
  // The check above only refused a handover inside `runsDir`, which left
  // `../handovers/S6` accepted while a judge directory sat two levels up under a
  // different name. The original claim was therefore a property of the TMPDIR
  // default rather than of the check — true in practice, unenforced in fact.
  // So walk the ancestors and refuse if any of them holds this tool's own
  // artifacts. Bounded, and matched on OUR filenames rather than on a generic
  // word like "judge", so an unrelated directory in someone's home cannot
  // trigger it.
  let dir = resolve(handoverDir);
  for (let up = 0; up < 8; up += 1) {
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      break;
    }
    const artifacts = entries.filter((e) => e === 'run-info.json' || e === 'PACK.md' || e === 'judge');
    if (artifacts.length) {
      problems.push(
        `an acceptance-run artifact (${artifacts.join(', ')}) sits at ${dir}, an ancestor of the handover. Walking up from the handover reaches it, so the agent is one \`..\` away from an answer key. Put the handover somewhere with no run material above it.`,
      );
      break;
    }
  }

  const got = filesUnder(handoverDir);
  const want = filesUnder(sourceDir);
  const extra = got.filter((f) => !want.includes(f));
  const missing = want.filter((f) => !got.includes(f));
  if (extra.length) problems.push(`the handover carries ${extra.length} file(s) the pack did not: ${extra.join(', ')}`);
  if (missing.length) problems.push(`the handover is missing ${missing.length} packed file(s): ${missing.join(', ')}`);

  const judgey = got.filter((f) => /(^|\/)judge(\/|$)/i.test(f) || /JUDGE\.md$/i.test(f) || /^PACK\.md$/i.test(f));
  if (judgey.length) problems.push(`judge material reached the handover: ${judgey.join(', ')}`);

  // The packer redacts every scenario's scoring lines out of agent/. Re-checked
  // here rather than assumed: this is the last point before an agent reads it.
  const leaked = [];
  for (const f of got) {
    const text = readFileSync(join(handoverDir, f), 'utf8');
    for (const line of scoringLines) if (text.includes(line)) leaked.push(`${f}: ${line}`);
  }
  if (leaked.length) problems.push(`a scoring line survived redaction into the handover: ${leaked.join(' | ')}`);

  return { ok: problems.length === 0, problems, fileCount: got.length, files: got };
}

/** A digest over the handed-over bytes, so a later evaluation can prove which pack was read. */
export function digestOf(root) {
  const h = createHash('sha256');
  for (const f of filesUnder(root)) {
    h.update(f);
    h.update('\0');
    h.update(readFileSync(join(root, f)));
    h.update('\0');
  }
  return `sha256:${h.digest('hex')}`;
}

