// Generic, data-driven multi-framework code generator.
//
// One source of truth — the kit's generated element-meta.json — drives the
// snippet for every framework, for every kai-* element. The interactive
// playground feeds the live control state in; focused examples feed a fixed
// config. This replaces the hand-authored per-element `*-code.ts` files so the
// docs scale to ~40 elements without drift.
//
// Conventions match the kit's own framework-usage.json:
//   - scalar props      → attributes (HTML/Vue/Svelte/Angular) / props (React/Solid)
//   - non-scalar props  → JS properties (`el.items = …`, `:items.prop`, `[items]`)
//   - events            → addEventListener / onX / @kai-x / on:kai-x / (kai-x)

export const FRAMEWORKS = ['HTML', 'React', 'Vue', 'Svelte', 'Angular', 'Solid'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export const LANG: Record<Framework, string> = {
  HTML: 'html', React: 'tsx', Vue: 'vue', Svelte: 'svelte', Angular: 'html', Solid: 'tsx',
};

export interface PropMeta {
  name: string;
  scalar: boolean;
  type?: string;
  displayType?: string;
  default?: string;
}
export interface EventMeta { name: string }
export interface ElementMeta {
  tag: string;
  displayName: string;
  className?: string;
  hasSolid?: boolean;
  props: PropMeta[];
  events?: EventMeta[];
}

/** State = the control values to render. Keys are prop names; a key that is
 *  absent (or holds the prop's default) is omitted from the output. */
export type State = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Prop introspection (from element-meta displayType strings)
// ---------------------------------------------------------------------------

const camelToKebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** A boolean prop reads as `undefined | false | true` (or `boolean`). */
export function isBooleanProp(p: PropMeta): boolean {
  const t = (p.displayType ?? p.type ?? '').replace(/\s/g, '');
  return /(^|\|)false(\||$)/.test(t) && /(^|\|)true(\||$)/.test(t) || t.includes('boolean');
}

/** Enum string options, e.g. `undefined | "grid" | "inline" | "list"` → [grid…]. */
export function enumOptions(p: PropMeta): string[] {
  const t = p.displayType ?? p.type ?? '';
  const matches = [...t.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return matches;
}

/** A string prop reads as `undefined | string`. */
export function isStringProp(p: PropMeta): boolean {
  const t = (p.displayType ?? p.type ?? '').replace(/\s/g, '');
  return t.includes('string') && enumOptions(p).length === 0;
}

/** Default value parsed from element-meta (strips quotes), or undefined. */
export function defaultValue(p: PropMeta): unknown {
  if (p.default == null) return undefined;
  const d = p.default.trim();
  if (d === 'true') return true;
  if (d === 'false') return false;
  if (d === '[]' || d === 'undefined') return undefined;
  const m = d.match(/^['"](.*)['"]$/);
  return m ? m[1] : d;
}

// ---------------------------------------------------------------------------
// Resolve a State into the attributes / property-bindings / events to emit
// ---------------------------------------------------------------------------

interface Resolved {
  /** scalar props with a non-default value: { name, value } */
  attrs: { name: string; value: unknown; bool: boolean }[];
  /** non-scalar props to bind as JS properties (value = the variable name) */
  properties: string[];
  /** event names to wire up */
  events: string[];
}

function resolve(meta: ElementMeta, state: State): Resolved {
  const attrs: Resolved['attrs'] = [];
  const properties: string[] = [];

  for (const p of meta.props) {
    const has = Object.prototype.hasOwnProperty.call(state, p.name);
    if (!p.scalar) {
      // Non-scalar (arrays/objects) — bound as a property when sample data exists.
      if (has && state[p.name] != null) properties.push(p.name);
      continue;
    }
    const value = has ? state[p.name] : defaultValue(p);
    if (value === undefined || value === null || value === '') continue;
    if (isBooleanProp(p)) {
      // Omit a boolean only when it matches its default. A boolean whose default
      // is `true` set to `false` IS meaningful and must be rendered explicitly.
      if (value === (defaultValue(p) === true)) continue;
    } else if (value === defaultValue(p) && !has) {
      continue; // enum/string at its untouched default
    }
    attrs.push({ name: p.name, value, bool: isBooleanProp(p) });
  }

  return { attrs, properties, events: (meta.events ?? []).map((e) => e.name) };
}

const handlerName = (evt: string) =>
  'on' + evt.replace(/^kai-/, '').split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('');

// ---------------------------------------------------------------------------
// Per-framework renderers
// ---------------------------------------------------------------------------

// A boolean set to false (only emitted when its default is true) can't be a bare
// HTML attribute, so it's set as a property; every other framework binds it.
const falseBool = (a: Resolved['attrs'][number]) => a.bool && a.value === false;

function htmlCode(meta: ElementMeta, r: Resolved): string {
  const attrs = r.attrs
    .filter((a) => !falseBool(a))
    .map((a) => (a.bool ? camelToKebab(a.name) : `${camelToKebab(a.name)}="${a.value}"`));
  const falseBools = r.attrs.filter(falseBool);
  const open = `<${meta.tag}${attrs.length ? ' ' + attrs.join(' ') : ''}></${meta.tag}>`;
  const lines = [
    `<script type="module" src="https://cdn.jsdelivr.net/npm/@kitn.ai/ui/dist/kai.es.js"></script>`,
    '',
    open,
  ];
  if (r.properties.length || r.events.length || falseBools.length) {
    lines.push('<script type="module">', `  const el = document.querySelector('${meta.tag}');`);
    for (const a of falseBools) lines.push(`  el.${a.name} = false;`);
    for (const prop of r.properties) lines.push(`  el.${prop} = ${prop}; // your data`);
    for (const evt of r.events) lines.push(`  el.addEventListener('${evt}', (e) => console.log(e.detail));`);
    lines.push('</script>');
  }
  return lines.join('\n');
}

function jsxCode(meta: ElementMeta, r: Resolved, importLine: string): string {
  const lines: string[] = [importLine, ''];
  const indent = '  ';
  const parts: string[] = [];
  for (const a of r.attrs) parts.push(a.bool ? (a.value ? a.name : `${a.name}={false}`) : `${a.name}="${a.value}"`);
  for (const prop of r.properties) parts.push(`${prop}={${prop}}`);
  for (const evt of r.events) parts.push(`${handlerName(evt)}={(e) => console.log(e.detail)}`);
  const Name = meta.displayName.replace(/\s/g, '');
  if (!parts.length) { lines.push(`<${Name} />;`); return lines.join('\n'); }
  lines.push(`<${Name}`, ...parts.map((p) => indent + p), `/>;`);
  return lines.join('\n');
}

function vueCode(meta: ElementMeta, r: Resolved): string {
  const parts: string[] = [];
  for (const a of r.attrs) parts.push(a.bool ? (a.value ? camelToKebab(a.name) : `:${camelToKebab(a.name)}="false"`) : `${camelToKebab(a.name)}="${a.value}"`);
  for (const prop of r.properties) parts.push(`:${camelToKebab(prop)}.prop="${prop}"`);
  for (const evt of r.events) parts.push(`@${evt}="${handlerName(evt)}"`);
  const indent = '  ';
  const tag = parts.length
    ? `<${meta.tag}\n${parts.map((p) => indent + p).join('\n')}\n></${meta.tag}>`
    : `<${meta.tag}></${meta.tag}>`;
  return `<script setup>\nimport '@kitn.ai/ui/elements';\n</script>\n\n<template>\n  ${tag.replace(/\n/g, '\n  ')}\n</template>`;
}

function svelteCode(meta: ElementMeta, r: Resolved): string {
  const parts: string[] = [];
  for (const a of r.attrs) parts.push(a.bool ? (a.value ? camelToKebab(a.name) : `${camelToKebab(a.name)}={false}`) : `${camelToKebab(a.name)}="${a.value}"`);
  for (const prop of r.properties) parts.push(`{${prop}}`);
  for (const evt of r.events) parts.push(`on:${evt}={${handlerName(evt)}}`);
  const indent = '  ';
  const tag = parts.length
    ? `<${meta.tag}\n${parts.map((p) => indent + p).join('\n')}\n></${meta.tag}>`
    : `<${meta.tag}></${meta.tag}>`;
  return `<script>\n  import '@kitn.ai/ui/elements';\n</script>\n\n${tag}`;
}

function angularCode(meta: ElementMeta, r: Resolved): string {
  const parts: string[] = [];
  for (const a of r.attrs) parts.push(a.bool ? (a.value ? camelToKebab(a.name) : `[${a.name}]="false"`) : `${camelToKebab(a.name)}="${a.value}"`);
  for (const prop of r.properties) parts.push(`[${prop}]="${prop}"`);
  for (const evt of r.events) parts.push(`(${evt})="${handlerName(evt)}($event)"`);
  if (!parts.length) return `<${meta.tag}></${meta.tag}>`;
  return `<${meta.tag}\n${parts.map((p) => '  ' + p).join('\n')}\n></${meta.tag}>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateSnippets(meta: ElementMeta, state: State = {}): Record<Framework, string> {
  const r = resolve(meta, state);
  const Name = meta.displayName.replace(/\s/g, '');
  return {
    HTML: htmlCode(meta, r),
    React: jsxCode(meta, r, `import { ${Name} } from '@kitn.ai/ui/react';`),
    Vue: vueCode(meta, r),
    Svelte: svelteCode(meta, r),
    Angular: angularCode(meta, r),
    Solid: jsxCode(meta, r, `import { ${Name} } from '@kitn.ai/ui';`),
  };
}

/** Controls a generic playground can render, derived from the element's props. */
export type ControlKind =
  | { prop: string; kind: 'boolean'; default: boolean }
  | { prop: string; kind: 'enum'; options: string[]; default?: string }
  | { prop: string; kind: 'string'; default?: string };

// Controlled-value bindings: scalar props that, when set, switch an element into
// controlled mode and disable its own click-to-toggle UI (e.g. kai-popover `open`,
// kai-dialog `open`). Exposing them as casual Playground toggles
// makes the live demo look broken, so drive those via the element's own trigger.
const CONTROLLED_BINDING_PROPS = new Set(['open', 'startCollapsed', 'endCollapsed']);

// Per-element controls to hide. kai-artifact: `tab` is redundant with its own
// in-component Preview|Code toggle; `sandbox` is set by the sample (which sets
// allow-same-origin for a docs-demo-only reason it documents in full -- do not
// read that as a recommendation) and a freeform string control would both
// clutter the bar and override it.
const CONTROL_EXCLUDE: Record<string, Set<string>> = {
  'kai-artifact': new Set(['tab', 'sandbox']),
};

export function controlsFor(meta: ElementMeta): ControlKind[] {
  const controls: ControlKind[] = [];
  const excluded = CONTROL_EXCLUDE[meta.tag];
  for (const p of meta.props) {
    if (!p.scalar) continue;
    if (CONTROLLED_BINDING_PROPS.has(p.name)) continue;
    if (excluded?.has(p.name)) continue;
    const opts = enumOptions(p);
    if (opts.length) controls.push({ prop: p.name, kind: 'enum', options: opts, default: defaultValue(p) as string });
    else if (isBooleanProp(p)) controls.push({ prop: p.name, kind: 'boolean', default: Boolean(defaultValue(p)) });
    else if (isStringProp(p)) controls.push({ prop: p.name, kind: 'string', default: defaultValue(p) as string });
  }
  return controls;
}
