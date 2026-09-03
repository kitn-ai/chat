/**
 * The cdn delivery form: the single-file paste form.
 *
 * It renders the HTML FORM first and inlines that, rather than reaching for
 * the authored files: the page a visitor pastes and the page `add` writes
 * then differ only in how their imports resolve, which is the whole claim the
 * cdn form makes. It is also the only way this form can exist at all under
 * the authored contract, because an authored page carries no script for the
 * inliner to inline -- the entry script is GENERATED.
 *
 * `generateCdnForm` in ../registry is UNCHANGED and stays exported: it is the
 * INLINER, and this is what feeds it a rendered page. A caller reaching for
 * it directly with an authored block is the defect this module removes.
 */
import { generateCdnForm, type Block, type CdnFormOptions } from '../registry';
import { isAuthoredContractPage } from '../contract/parse-template';
import type { FormFile } from '../contract/types';
import { renderHtmlForm } from './html';

/**
 * The CDN single-file form: `generateCdnForm`'s output as one `<name>.html`.
 * A block that composes OTHER blocks cannot be a single paste file, and the
 * refusal names that rather than emitting a partial composition.
 */
export function renderCdnFormFiles(block: Block, opts: CdnFormOptions): FormFile[] {
  if ((block.manifest.registryDependencies ?? []).some((dep) => !dep.startsWith('route:'))) {
    throw new Error(
      `${block.name} composes other blocks, and the single-file paste form cannot carry them yet; run \`create-kai add\` inside a project instead`,
    );
  }
  const form = generateCdnForm(renderedPage(block), opts);
  if (!form.html) throw new Error(`${block.name}: the paste form cannot be generated: ${form.errors.join('; ')}`);
  return [{ path: `${block.name}.html`, content: form.html, target: `${block.name}.html` }];
}

/**
 * The page the inliner is handed: the rendered HTML FORM for a block on the
 * authored contract, and the AUTHORED files for one that is not.
 *
 * TRANSITIONAL, with one deletion site. Task 12 converts the last two blocks
 * and the contract becomes mandatory; this branch and its predicate go with
 * it, and every block renders through the html form. Until then a block whose
 * page declares no binding still carries its own `<script type="module">`,
 * which is what the inliner has always taken, and refusing it here would take
 * the two unconverted blocks out of `gen-blocks` a full task early.
 */
function renderedPage(block: Block): Block {
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page');
  const pageHtml = pageEntry ? block.files.get(pageEntry.path) : undefined;
  if (pageHtml === undefined || !isAuthoredContractPage(pageHtml)) return block;

  // `autoloader`, not the default: the register-all rewrite exists for
  // bundlers, and this form runs off raw CDN URLs in a plain page.
  const html = renderHtmlForm(block, { registration: 'autoloader' });
  return {
    name: block.name,
    manifest: {
      ...block.manifest,
      files: html.map((f) => ({
        path: f.path,
        type: f.path.endsWith('.html') ? ('registry:page' as const) : ('registry:file' as const),
      })),
    },
    files: new Map(html.map((f) => [f.path, f.content])),
  };
}
