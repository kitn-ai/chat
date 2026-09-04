/**
 * What the /blocks page reads, and where it reads it from.
 *
 * THE DROPDOWN IS THE RENDERER LIST. `FRAMEWORK_BLOCK_FORMS` is the axis
 * `packages/ui/scripts/gen-blocks.mjs` iterates to emit dist/blocks/f/, and
 * the axis the compile cells run. Reading it here rather than restating it is
 * what makes PR B2's four renderers appear on this page without anyone editing
 * this file, and what stops the page ever offering a framework nothing emits.
 * That is the create-kai menu-honesty rule applied to a page instead of a
 * prompt (packages/create-kai/test/menu-honesty.test.ts).
 */
import { FRAMEWORK_BLOCK_FORMS, type BlockFormId, type FormFile } from '@kitn.ai/blocks/forms';
import { BLOCKS_PREVIEW } from '../generated/blocks-preview';

export type { BlockFormId, FormFile };

/** One entry of dist/blocks/registry.json. */
export interface RegistryItem {
  name: string;
  title: string;
  description: string;
  categories: string[];
  docs?: string;
  meta?: { iframeHeight?: string };
}

/** The rendered tree of one block in one framework: dist/blocks/f/<id>.<form>.json. */
export interface FormPayload {
  block: string;
  form: BlockFormId;
  files: FormFile[];
}

/** The one name for the sticky framework key. Later tasks and the guard read
 *  this rather than restating the string. */
export const STORAGE_KEY = 'kai-blocks-framework';

/** The dropdown's rows. Derived, in the renderers' own order. */
export function frameworkOptions(): { value: BlockFormId; label: string }[] {
  return FRAMEWORK_BLOCK_FORMS.map((form) => ({ value: form.id, label: form.label }));
}

/** The default when nothing is stored: the first renderer, which is `html`,
 *  the authored truth. */
export function defaultFramework(): BlockFormId {
  return frameworkOptions()[0].value;
}

/** The add command, derived from THIS block's id. No framework in it: the CLI
 *  detects the host from the project, and with no project emits the single
 *  file form. */
export function addCommandFor(id: string): string {
  return `npx create-kai add ${id}`;
}

export function registryUrl(): string {
  return '/blocks/registry.json';
}

export function formUrl(id: string, form: BlockFormId): string {
  return `/blocks/f/${id}.${form}.json`;
}

/** The preview page for one block, against whichever kit the copy script
 *  chose. `.cdn.html` in production, `.html` under KAI_BLOCKS_KIT=local. */
export function previewUrl(id: string): string {
  return BLOCKS_PREVIEW.mode === 'local'
    ? `${BLOCKS_PREVIEW.previewDir}/${id}.html`
    : `${BLOCKS_PREVIEW.previewDir}/${id}.cdn.html`;
}

/** The words the footer says. One definition, generated from KAI_BLOCKS_KIT. */
export function previewFooter(): string {
  return BLOCKS_PREVIEW.footer;
}

/** The viewer's framework choice, global across every card and sticky.
 *  Every access is wrapped: a private window or blocked site data throws on
 *  read AND on write, and neither is worth a broken page. */
export function readFramework(): BlockFormId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const match = frameworkOptions().find((o) => o.value === stored);
    return match ? match.value : defaultFramework();
  } catch {
    return defaultFramework();
  }
}

export function writeFramework(form: BlockFormId): void {
  try {
    localStorage.setItem(STORAGE_KEY, form);
  } catch {
    // A viewer who cannot persist a preference still gets a working page.
  }
}

/** Highlighter language for a file the renderers emit. */
export function languageFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1);
  switch (ext) {
    case 'html': return 'html';
    case 'css': return 'css';
    case 'js': case 'mjs': return 'javascript';
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'vue': return 'vue';
    case 'svelte': return 'svelte';
    case 'json': return 'json';
    case 'md': return 'markdown';
    default: return 'text';
  }
}

