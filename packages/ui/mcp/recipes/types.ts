/**
 * A CODE recipe: a complete, compiling composition the MCP serves as files.
 *
 * Distinct from a `TSurfaceRecipe` (../catalog/catalog-types.ts) on purpose:
 * the catalog record is DATA — ingredients, wiring edges, invariants, each
 * resolved and executed by its own guards — while a code recipe is the full
 * host module a builder pastes. The two meet on `id`: a code recipe whose id
 * also names a surface recipe is that record's body.
 *
 * `verify:scaffold` compiles every `lang: 'ts'` file of every registered code
 * recipe with a stock consumer tsconfig, resolving `@kitn.ai/ui` through the
 * shipped exports map — the same gate the scaffolder's emitted string literals
 * go through, because this code is string literals with the same failure mode.
 */
export interface CodeRecipeFile {
  /** Path inside the consumer's app, e.g. `src/main.ts`. */
  path: string;
  lang: 'ts' | 'html' | 'css';
  code: string;
}

export interface CodeRecipe {
  /** Kebab-case id, e.g. `composed-thread`. Also the component_reference topic name. */
  id: string;
  title: string;
  intent: string;
  /** The kai-* tags the composition places. */
  ingredients: string[];
  /** The teaching notes served above the files — the WHY a prop table cannot carry. */
  notes: string[];
  files: CodeRecipeFile[];
}
