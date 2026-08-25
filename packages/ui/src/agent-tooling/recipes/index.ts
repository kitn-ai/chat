import type { CodeRecipe } from './types';
import { composedThread } from './composed-thread';

export type { CodeRecipe, CodeRecipeFile } from './types';

/**
 * The code-recipe registry.
 *
 * Registered here → served by `component_reference({ name: "<id>" })` AND
 * compiled by `verify:scaffold` (which loads this list through the registry
 * bundle, so adding an entry moves that gate's printed cell count by itself —
 * the same derive-don't-list contract as the integration and surface axes).
 */
export const codeRecipes: CodeRecipe[] = [composedThread];

export function listCodeRecipes(): CodeRecipe[] {
  return codeRecipes;
}

export function getCodeRecipe(id: string): CodeRecipe | undefined {
  return codeRecipes.find((r) => r.id === id);
}
