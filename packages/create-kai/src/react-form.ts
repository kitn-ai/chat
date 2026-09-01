/**
 * The block form renderers moved to the kit's shared pure module layer —
 * `packages/ui/src/agent-tooling/blocks/forms.ts` — so the `kai dev` gallery
 * and this CLI render every delivery form through ONE renderer (the same
 * precedent as `registry.ts`, which `blocks.ts` already bundle-imports; the
 * rationale comments travel with the functions). This shim keeps the CLI's
 * historical import path alive; add nothing here — new form logic belongs in
 * the shared module.
 */
export {
  bodyToJsx,
  componentName,
  kaiTagsIn,
  renderComponent,
  renderEntryTypings,
  renderJsxTypings,
  wrapEntryScript,
  wrapWcEntryScript,
} from '../../ui/src/agent-tooling/blocks/forms';
