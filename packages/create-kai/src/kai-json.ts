/**
 * `kai.json` — written in v1, read in v2.
 *
 * Nothing reads it today. It exists so a later `add` command never has to infer
 * a project's shape, which is the single thing that makes shadcn's `add`
 * tractable: the tool owns a file describing the project instead of re-deriving
 * it on every command. Thirty lines now is the difference between v2 being a
 * feature and v2 being a rewrite.
 *
 * `registration` is the field that earns its keep — `solid` for a Solid project
 * (direct component imports) and `elements` everywhere else (`kai-*` web
 * components). Inferring it after the fact means parsing the entry file.
 */
import type { FrameworkDef } from './frameworks';
import type { ProjectPlan } from './types';

/** Bumped when the shape changes incompatibly, not when a field is added. */
export const KAI_JSON_VERSION = 1;

export const KAI_JSON_SCHEMA_URL = 'https://ui.kitn.ai/schema/kai.json';

export interface KaiJson {
  $schema: string;
  version: number;
  framework: string;
  /** The `@kitn.ai/ui` range written into the emitted `package.json`. */
  kit: string;
  /**
   * The exact `@kitn.ai/ui` version the CLI that wrote this file was built
   * against — the templates in this project are that version's shape.
   *
   * WHY BOTH THIS AND `kit`. They answer different questions, and `package.json`
   * can only ever answer the first: `kit` is the constraint the project was
   * given, this is the point it started from. After one `npm update` the
   * installed version has moved and nothing in the project remembers what it was
   * scaffolded against — which is exactly the question a later `add` or
   * `upgrade` has to answer to know which migration applies.
   *
   * WHAT IT IS NOT, stated here because the name is one letter of context away
   * from implying it: this is NOT the version npm installed. Three ways they
   * separate, all ordinary:
   *
   *   · `--kit` was passed, so `kit` points somewhere else entirely — another
   *     range, a dist-tag, or a `file:` tarball. This field still truthfully
   *     reports which CLI generation emitted the files, which is the fact a
   *     migration needs; it is deliberately NOT rewritten to match the override.
   *   · The range resolved higher within its own minor (`^0.25.0` picking up a
   *     later `0.25.x`).
   *   · The user upgraded afterwards.
   *
   * Reading the truly-installed version would mean reading
   * `node_modules/@kitn.ai/ui/package.json` after the install step — cheap, but
   * only meaningful when `--no-install` was not passed, so it would be present
   * on some projects and absent on others. A field that is sometimes there is
   * worse than one that is always there and means one thing. Recorded at build
   * time, this is always present and always exact.
   */
  kitBuiltAgainst: string;
  layout: string;
  widgetStyle: string | null;
  features: string[];
  gateway: string;
  registration: string;
  /**
   * The five copied paths, plus `route`.
   *
   * `route` is DERIVED from `framework.route` rather than stored beside the
   * others on `FrameworkDef.paths`, because the build guard that grades that
   * block asserts each path names a file the template already has — true of the
   * five, false of a route by construction. The docblock on `FrameworkDef.route`
   * has the full reasoning. It is `null` for a framework create-kai cannot emit
   * a route for, and for a project on the mock gateway, which needs no route at
   * all: a v2 `add` reading this can tell "no route here" from "route lives at
   * X" without re-deriving either.
   */
  paths: FrameworkDef['paths'] & { route: string | null };
  theme: { tokens: string; default: string };
}

export function buildKaiJson(plan: ProjectPlan, framework: FrameworkDef): KaiJson {
  return {
    $schema: KAI_JSON_SCHEMA_URL,
    version: KAI_JSON_VERSION,
    framework: plan.frameworkId,
    kit: plan.kit,
    kitBuiltAgainst: plan.kitBuiltAgainst,
    layout: plan.layout,
    widgetStyle: plan.widgetStyle,
    features: [...plan.featureIds],
    gateway: plan.gatewayId,
    registration: framework.registration,
    paths: {
      ...framework.paths,
      // No gateway means no route was written, so reporting where one WOULD go
      // would be reporting a file that does not exist.
      route: plan.gatewayId === 'mock' ? null : (framework.route?.file ?? null),
    },
    theme: { tokens: '@kitn.ai/ui/theme.tokens.css', default: 'dark' },
  };
}

export function stringifyKaiJson(json: KaiJson): string {
  return `${JSON.stringify(json, null, 2)}\n`;
}
