/**
 * The README every project-shaped delivery form ships (spec 3.5): two or
 * three lines saying what the block needs, plus the one framework-config line
 * where there is one.
 *
 * ONE TEMPLATE, in its own module. The html and react renderers must not
 * import `./index` (it re-exports them, so that is a cycle), which is the same
 * reason `FormFile` lives in `../contract/types`. Two hand-written READMEs
 * would drift the way two hand-written anything in this package drifts.
 *
 * THE CDN FORM HAS NO README, and that is deliberate: it is one pasted file
 * with no directory to put one in. Its `docs` reaches a user through the CLI's
 * closing note instead.
 *
 * WHAT MUST NOT APPEAR HERE: `EventSource`, `text/event-stream` or
 * `.getReader(`. `verify:blocks [html-binder]` scans every file of the html
 * form for a hand-rolled stream reader, and a README quoting one would fail
 * the block on its own documentation.
 */
import type { Block } from '../registry';

/** The file name both renderers emit and `create-kai add` prints back. */
export const README_FILE = 'README.md';

/**
 * "What the block needs" (spec 3.5), derived rather than left to ride on
 * `manifest.docs` alone. The three shipped blocks all carry a `docs` sentence
 * today, so this is currently invisible in every generated
 * README - but a future block with envVars or a route dependency and NO
 * `docs` would otherwise ship a README that says nothing about what it needs,
 * which is the gap the adversarial review flagged. `null` when the block
 * declares neither, so `renderReadme` adds nothing rather than an empty line.
 */
function needsLine(block: Block): string | null {
  const envVars = Object.keys(block.manifest.envVars ?? {});
  if (envVars.length > 0) return `Needs ${envVars.join(', ')} set.`;
  const routes = (block.manifest.registryDependencies ?? []).filter((d) => d.startsWith('route:'));
  if (routes.length > 0) {
    return `Needs a server route: ${routes.map((r) => r.slice('route:'.length)).join(', ')}.`;
  }
  return null;
}

/**
 * `lines` is the form-specific middle: how a consumer of THIS form renders the
 * block, and the one config line their framework needs. Everything around it
 * is the block's own manifest, so a block edits its README by editing its
 * manifest.
 */
export function renderReadme(block: Block, lines: readonly string[]): string {
  const needs = needsLine(block);
  return [
    `# ${block.manifest.title}`,
    '',
    block.manifest.description,
    '',
    ...lines,
    ...(needs ? ['', needs] : []),
    ...(block.manifest.docs ? ['', block.manifest.docs] : []),
    '',
  ].join('\n');
}
