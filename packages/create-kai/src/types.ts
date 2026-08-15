/** How an emitted project reaches the kit. Mirrors `kai.json`'s `registration`. */
export type Registration = 'elements' | 'solid';

export type Layout = 'full-screen' | 'widget';
export type WidgetStyle = 'fab' | 'side';

/**
 * Everything the generator needs, with every prompt already answered.
 *
 * The flow's only job is to produce one of these; the generator never prompts.
 * That split is what makes `--yes` and the interactive path the same code below
 * this point, so the zero-config run and a fully-answered run cannot diverge.
 */
export interface ProjectPlan {
  /** absolute path to the directory to create */
  dir: string;
  /** the emitted `package.json` name */
  name: string;
  frameworkId: string;
  layout: Layout;
  widgetStyle: WidgetStyle | null;
  featureIds: readonly string[];
  /** integration id from the kit catalog */
  gatewayId: string;
  /**
   * The `@kitn.ai/ui` spec written into the emitted `package.json`.
   *
   * Defaults to a caret range over the kit version this CLI was built against
   * (see `scripts/build.mjs`), and is overridable with `--kit` so the smoke test
   * can install a locally packed tarball through the same code path a user hits
   * rather than around it.
   */
  kit: string;
  /**
   * The exact `@kitn.ai/ui` version this CLI was BUILT against.
   *
   * A different fact from `kit`, not a resolved form of it, and the two can
   * disagree — see the field docblock in `src/kai-json.ts`, which is where this
   * ends up and where the reasoning lives.
   */
  kitBuiltAgainst: string;
}
