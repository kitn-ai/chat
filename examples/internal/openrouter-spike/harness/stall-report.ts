// What was true when a phase wait timed out.
//
// THE PROBLEM THIS SOLVES. `waitForSelector('html[data-kai-phase="running"]')`
// timing out is the single most confusing failure this harness produces, because
// at least FOUR unrelated things present with that identical signature:
//
//   · `packages/ui/dist/` was rebuilt underneath the run (a concurrent session,
//     or a build in the same command as the gate). Measured: a replay failed this
//     way and reproduced as a clean pass five minutes later with no code change.
//   · an environmental stall that MOVES between scenarios run to run — observed
//     on S04, then on S14 and S15, in three consecutive control passes.
//   · the page dying outright (`Target page, context or browser has been closed`).
//   · the known `S14-attachments` control flake.
//
// So a diagnostic that NAMES a cause is a claim, and it will be confidently wrong
// on three of those four. This one only REPORTS WHAT IT OBSERVED and leaves the
// conclusion to a human. That distinction is the whole design:
//
//   naming a cause     — "the build moved under this run"   (wrong 3 times in 4)
//   reporting a state  — "dist mtime changed during the run" (never wrong)
//
// Every probe here is failure-tolerant on purpose. This runs at the moment
// something has already gone wrong, and a diagnostic that throws while explaining
// a failure replaces the real error with its own.
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The built kit the spike actually loads. `@kitn.ai/ui` resolves through
 *  node_modules and the exports map, so this file — not `src/` — is what the app
 *  under test is running. */
const DIST = resolve(HERE, '../../../../packages/ui/dist/index.js');

function distStamp(): string {
  try {
    return String(statSync(DIST).mtimeMs);
  } catch {
    return 'absent';
  }
}

/** Captured once, when the spec file loads, so a mid-run rebuild is visible as a
 *  CHANGE rather than as an absolute number nobody can interpret. */
const DIST_AT_START = distStamp();

/** Observations, gathered defensively. No conclusions. */
export async function stallReport(page: Page, waitingFor: string): Promise<string> {
  const lines: string[] = ['', `stalled waiting for: ${waitingFor}`];

  const distNow = distStamp();
  lines.push(
    distNow === DIST_AT_START
      ? `  dist:      unchanged during this run (${DIST_AT_START})`
      : `  dist:      CHANGED during this run — was ${DIST_AT_START}, now ${distNow}`,
  );

  if (page.isClosed()) {
    // Nothing below can run against a closed page, and saying so is more useful
    // than five lines of "unavailable".
    lines.push('  page:      CLOSED — the browser context died before this wait finished');
    lines.push('  (no further observations possible)');
    return lines.join('\n');
  }
  lines.push('  page:      open');

  // Did the DOM reach a DIFFERENT phase? `running` never appearing and the turn
  // having already finished look identical from a timeout.
  try {
    const phase = await page.evaluate(() => document.documentElement.dataset.kaiPhase ?? '(none)');
    lines.push(`  phase:     ${phase}`);
  } catch (e) {
    lines.push(`  phase:     unreadable (${(e as Error).message.split('\n')[0]})`);
  }

  // Is the dev server still answering at all? A stalled page and a dead server
  // produce the same timeout.
  try {
    const res = await page.request.get('/api/config', { timeout: 5_000 });
    lines.push(`  /api/config: HTTP ${res.status()}`);
  } catch (e) {
    lines.push(`  /api/config: no answer (${(e as Error).message.split('\n')[0]})`);
  }

  lines.push(
    '',
    '  These are OBSERVATIONS, not a diagnosis. This signature has at least four',
    '  unrelated causes (a mid-run rebuild, a stall that moves between scenarios,',
    '  a dead page, the S14 control flake). Re-run against a settled tree before',
    '  treating any of it as a finding — a conformance failure that cannot be',
    '  reproduced is a report about the tree, not about the kit.',
  );
  return lines.join('\n');
}

/** `waitForSelector`, with the observations attached if it times out. */
export async function waitForPhase(
  page: Page,
  selector: string,
  timeout: number,
): Promise<void> {
  try {
    await page.waitForSelector(selector, { timeout });
  } catch (e) {
    const report = await stallReport(page, selector).catch(
      (reportErr) => `\n(stall report itself failed: ${(reportErr as Error).message})`,
    );
    throw new Error(`${(e as Error).message}\n${report}`);
  }
}
