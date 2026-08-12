// Test-only loader for scripts/gen-card-validation-schemas.mjs.
//
// The specifier is a runtime variable on purpose, the same way
// src/elements/inline-element-types.test.ts loads gen-element-types.mjs: the script
// is plain ESM outside `include`, and a static import would need `allowJs`.
//
// The interface below is a hand-written type for a JavaScript module, which is a
// restatement and therefore a drift risk. It is kept as narrow as the tests need,
// and the drift it could hide is the harmless direction: a wrong shape here fails at
// runtime in the test that uses it, immediately, rather than passing while covering
// nothing. The alternative (a sibling `.d.mts`) would be a WIDER restatement of the
// same module with the same risk.
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** One keyword the projection could not account for, with where it was found. */
export interface UnclassifiedKeyword {
  path: string;
  keyword: string;
}

export interface CardValidationGenerator {
  CARD_TYPES: string[];
  STRIPPED: Readonly<Record<string, string>>;
  NOT_ENFORCED: Readonly<Record<string, string>>;
  OUT_FILE: string;
  enforcedKeywords(source?: string): Set<string>;
  scanUnclassified(doc: unknown, enforced: Set<string>): UnclassifiedKeyword[];
  projectSchema(doc: unknown, enforced: Set<string>): Record<string, unknown> | undefined;
  build(): { enforced: Set<string>; projections: Record<string, unknown>; source: string };
}

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function loadGenerator(): Promise<CardValidationGenerator> {
  const url = pathToFileURL(resolve(PKG_ROOT, 'scripts/gen-card-validation-schemas.mjs')).href;
  return (await import(/* @vite-ignore */ url)) as CardValidationGenerator;
}
