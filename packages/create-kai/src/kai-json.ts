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
  kit: string;
  layout: string;
  widgetStyle: string | null;
  features: string[];
  gateway: string;
  registration: string;
  paths: FrameworkDef['paths'];
  theme: { tokens: string; default: string };
}

export function buildKaiJson(plan: ProjectPlan, framework: FrameworkDef): KaiJson {
  return {
    $schema: KAI_JSON_SCHEMA_URL,
    version: KAI_JSON_VERSION,
    framework: plan.frameworkId,
    kit: plan.kit,
    layout: plan.layout,
    widgetStyle: plan.widgetStyle,
    features: [...plan.featureIds],
    gateway: plan.gatewayId,
    registration: framework.registration,
    paths: framework.paths,
    theme: { tokens: '@kitn.ai/ui/theme.tokens.css', default: 'dark' },
  };
}

export function stringifyKaiJson(json: KaiJson): string {
  return `${JSON.stringify(json, null, 2)}\n`;
}
