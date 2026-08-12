// @vitest-environment node
//
// THE CARD CONTRACT IS WRITTEN TWICE. THIS ASSERTS THE TWO COPIES AGREE.
//
// `ConfirmCardData` & co (src/primitives/card-data-types.ts, plus
// `LinkPreviewData` in primitives/link-preview.ts and `EmbedCardData` in
// primitives/embed-providers.ts) and the JSON Schemas in
// src/primitives/card-schemas/ describe the SAME payloads for the same consumer.
// They were maintained independently and nothing compared them: the four schema
// suites in this directory never mention a payload type name, so a developer could
// type against one surface and validate against the other and find out at runtime.
//
// WHY THIS CHECKS INSTEAD OF GENERATING
// -------------------------------------
// Deriving either side from the other was measured and ruled out; do not
// re-litigate it from this file:
//
//   • form.schema.json does NOT describe `FormDefinition`. Its `properties`
//     keyword is literally `{"type":"object"}`, so a generator yields
//     `properties: Record<string, unknown>` and loses `FormField` whole — 20
//     fields, the `x-kai-widget` enum, the recursion. That gap is DELIBERATE:
//     kai-form's data IS a JSON Schema, so describing it fully means handing a
//     model a meta-schema.
//   • artifact.schema.json puts its src-or-files rule in a root `anyOf`. A
//     faithful generator turns that into a TS union, enforcing at compile time
//     what `validateAgainstSchema` has no `anyOf` applicator for at runtime — a
//     third behaviour, worse than the two.
//   • The documents carry model-facing annotations (`x-kai-control`,
//     `x-kai-unique`) that are not type information at all.
//     scripts/gen-card-validation-schemas.mjs exists precisely because the
//     authored schemas are not what the client consumes.
//
// So: check, do not generate. The check is the deliverable, which is why the
// coverage boundary below is spelled out rather than implied.
//
// WHAT THIS COVERS
// ----------------
// Per card type, at the root and at every nested object the SCHEMA describes
// (following `properties` and `items` only):
//
//   1. KEY SETS. The type's members and the schema's `properties` keys must be
//      the same set. A key on one side and not the other is an error naming the
//      card type, the path and the key.
//   2. REQUIRED vs OPTIONAL. A member without `?` must be in the schema's
//      `required` array, and vice versa.
//   3. STRING ENUMS. A schema `enum`/`const` of strings must equal the TS
//      string-literal union at that key, in both directions — a schema enum
//      against a bare `string` is a real weakening and fails here.
//   4. SCALAR KINDS. `type: 'string' | 'number' | 'integer' | 'boolean' |
//      'array' | 'object'` must match what the TS side actually is.
//   5. REACHABILITY, FROM THE SERVER-SAFE ENTRY. Each payload type — and every
//      named type its declaration depends on — must be exported from
//      src/schemas/index.ts. Not "from some public barrel": from THAT one.
//
//      THIS CHECK USED TO SAY "SOME BARREL", AND THAT IS EXACTLY WHAT IT MISSED.
//      Resolution followed [src/index.ts, src/schemas/index.ts] and took the
//      first hit, so a payload type exported only from src/index.ts satisfied it.
//      `LinkPreviewData` and `EmbedCardData` were in that state for the whole
//      life of this file: five of the seven payload types reached the server-safe
//      entry, those two did not, and this suite ran 11 green tests over the gap.
//      Measured on the tarball, before the fix — a throwaway Node project with
//      `lib: ["ESNext"]` and no DOM, importing from the published subpath:
//
//        probe.ts(5,3): error TS2305: Module '"@kitn.ai/ui/schemas"' has no
//                       exported member 'EmbedCardData'.
//        probe.ts(7,3): error TS2305: Module '"@kitn.ai/ui/schemas"' has no
//                       exported member 'LinkPreviewData'.
//
//      src/index.ts is the SOLID-BEARING barrel. A backend route — the only
//      reader this entry has — cannot import from it, so "reachable from either"
//      is not the contract and never was. The barrel list is still used to
//      RESOLVE declarations for the shape walk below, because a declaration has
//      to be found wherever it lives; the reachability ASSERTION is separate and
//      names one entry.
//
//      The dependency half matters for the same reason one layer in:
//      `EmbedCardData.provider` is `EmbedProvider`, and a payload type whose
//      member types are unreachable leaves a consumer unable to name half of
//      what they are building. Those names are collected off the AST, never
//      listed.
//
// WHAT THIS DOES NOT COVER — read this before trusting a green run
// ----------------------------------------------------------------
//   • Value constraints: `minItems`, `maxItems`, `minLength`, `maxLength`,
//     `minimum`, `maximum`, `pattern`, `format`. TypeScript cannot express them,
//     so a schema could demand `minItems: 1` while the type says `T[]` and this
//     stays green. That is not a gap that can be closed here.
//   • Conditional and disjunctive applicators: `anyOf`, `allOf`, `oneOf`, `if`,
//     `then`. artifact's src-or-files rule and embed's provider-conditional
//     requireds live entirely in those keywords and are INVISIBLE to this check.
//     Both types declare every such key optional, which this check reads as
//     agreement, because at the key-set level it is.
//   • `default`, `description`, `additionalProperties`. The first two are not
//     shape. The third changes nothing here: this check demands exact key-set
//     parity everywhere, which is stricter than `additionalProperties` in either
//     of its states.
//   • Anything below a declared divergence (see DIVERGENCES) — by definition.
//
// That boundary is not left to prose. `KEYWORDS_READ` and `KEYWORDS_IGNORED`
// classify every keyword this check may encounter, and an unclassified keyword
// appearing in any card schema is a hard FAILURE. A new applicator cannot quietly
// widen the uncovered surface.
//
// PAIRS ARE DERIVED, NEVER LISTED
// -------------------------------
// The pair set comes from `cardSchemas` — the 7 card-DATA schemas, which
// `verify:schemas` already proves account for every file in the directory and for
// nothing else. The TS type name comes from each schema's own `title` when that
// is a valid identifier (6 of 7 today). A schema whose title is not an identifier
// must name its type in DIVERGENCES, and a schema that does neither FAILS. So a
// new card type is covered the moment it is added, or the suite goes red saying
// exactly what is missing. There is no hand-written pair list to fall behind.

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cardSchemas } from './index';
import type { CardSchemaName } from './index';

// Loaded through node's CJS loader rather than an ESM import, for the reason
// src/elements/inline-element-types.test.ts gives: it keeps vite from
// transforming typescript.js when this file runs on its own.
const ts: typeof import('typescript') = createRequire(import.meta.url)('typescript');

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '../..');

/**
 * `@kitn.ai/ui/schemas` — the server-safe entry, and the ONE surface a backend
 * route can import a payload type from. The reachability assertion names this
 * file and nothing else; see "REACHABILITY" above for what the two-barrel form
 * let through.
 */
const SERVER_SAFE_ENTRY = resolve(PKG_ROOT, 'src/schemas/index.ts');

/** Where a DECLARATION may be found for the shape walk. Deliberately wider than
 *  `SERVER_SAFE_ENTRY`: the walk has to read a type wherever it is authored, and
 *  conflating "can I read this" with "may a consumer import this" is the bug the
 *  header describes. */
const BARRELS = [resolve(PKG_ROOT, 'src/index.ts'), SERVER_SAFE_ENTRY];

// ─────────────────────────────────────────────────────────────────────────────
// Declared divergences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where the two surfaces legitimately differ.
 *
 * A skipped entry is an untested contract wearing a passing check, so nothing is
 * skipped: a divergence is DECLARED, at a path, with a reason, and every entry is
 * re-verified against the schema on each run. An entry whose condition no longer
 * holds FAILS as stale, so a divergence cannot outlive the thing it excused.
 */
type Divergence =
  | {
      kind: 'title-is-not-a-type-name';
      cardType: CardSchemaName;
      /** The payload type this schema describes, since `title` cannot say so. */
      typeName: string;
      why: string;
    }
  | {
      kind: 'schema-omits-shape';
      cardType: CardSchemaName;
      /** `$` = root, `$.foo` = properties.foo, `$.foo[]` = properties.foo.items. */
      path: string;
      why: string;
    };

const DIVERGENCES: readonly Divergence[] = [
  {
    kind: 'title-is-not-a-type-name',
    cardType: 'form',
    typeName: 'FormDefinition',
    why:
      "form.schema.json's title is prose ('kai-form data (a form definition)') rather than " +
      'a type name, because the document describes a form definition rather than a named ' +
      'payload struct. The type it corresponds to is FormDefinition.',
  },
  {
    kind: 'schema-omits-shape',
    cardType: 'form',
    path: '$.properties',
    why:
      "DELIBERATE and load-bearing. kai-form's data IS a JSON Schema, so `properties` is a " +
      'map of field definitions. The schema stops at `{"type":"object"}` rather than ' +
      'describing `FormField` (20 keys, the x-kai-widget enum, the recursion) because ' +
      'describing it fully means handing a model a meta-schema to fill in. TypeScript can ' +
      'afford `Record<string, FormField>`; the model-facing document cannot. This is the ' +
      'single reason FormDefinition cannot be generated from its schema.',
  },
  {
    kind: 'schema-omits-shape',
    cardType: 'choice',
    path: '$.allowOther',
    why:
      '`ChoiceAllowOther` is `boolean | { label?; placeholder? }` — a scalar-or-object ' +
      'union. The schema describes it with a description plus `x-kai-control: allow-other` ' +
      'and no `type`/`properties`, because the validator has no applicator that would make ' +
      'a two-shape union checkable, and a `properties` block would wrongly imply the object ' +
      'form is the only one. The object half is therefore unchecked here.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Schema keyword classification — the coverage boundary, enforced
// ─────────────────────────────────────────────────────────────────────────────

/** Keywords this check actually reads. `title` is read at the ROOT only, to derive
 *  the type name; it is never compared as a constraint. */
const KEYWORDS_READ = new Set(['title', 'type', 'required', 'properties', 'items', 'enum', 'const']);

/** Keywords this check deliberately ignores, and why. An unlisted keyword is a
 *  hard failure — see `it('classifies every keyword ...')`. */
const KEYWORDS_IGNORED: Readonly<Record<string, string>> = {
  $schema: 'document identity, not shape',
  $id: 'document identity, not shape',
  description: 'prose',
  default: 'a value, not a key set; a TS property type carries no default',
  additionalProperties:
    'this check demands exact key-set parity everywhere, which is stricter than either state of this keyword',
  minItems: 'value constraint TypeScript cannot express',
  maxItems: 'value constraint TypeScript cannot express',
  minLength: 'value constraint TypeScript cannot express',
  maxLength: 'value constraint TypeScript cannot express',
  minimum: 'value constraint TypeScript cannot express',
  maximum: 'value constraint TypeScript cannot express',
  pattern: 'value constraint TypeScript cannot express',
  format: 'value constraint TypeScript cannot express',
  anyOf: 'disjunctive applicator; NOT covered (artifact src-or-files lives here)',
  allOf: 'applicator; NOT covered (embed provider-conditional requireds live here)',
  oneOf: 'disjunctive applicator; NOT covered (artifact.height number-or-string lives here)',
  if: 'conditional applicator; NOT covered',
  then: 'conditional applicator; NOT covered',
  else: 'conditional applicator; NOT covered',
  not: 'applicator; NOT covered',
};

/** `x-kai-*` are model-facing UI annotations, never type information. */
const isAnnotation = (keyword: string) => keyword.startsWith('x-kai-');

// ─────────────────────────────────────────────────────────────────────────────
// Schema-side helpers
// ─────────────────────────────────────────────────────────────────────────────

type SchemaNode = Record<string, unknown>;

const isNode = (value: unknown): value is SchemaNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every schema node reachable from `root`, INCLUDING through applicators. Used
 *  only for keyword classification — the parity walk deliberately follows a
 *  narrower path (`properties`/`items`). */
function allSchemaNodes(root: SchemaNode): SchemaNode[] {
  const out: SchemaNode[] = [];
  const visit = (node: unknown) => {
    if (!isNode(node)) return;
    out.push(node);
    const props = node.properties;
    if (isNode(props)) for (const child of Object.values(props)) visit(child);
    visit(node.items);
    for (const key of ['if', 'then', 'else', 'not']) visit(node[key]);
    for (const key of ['anyOf', 'allOf', 'oneOf']) {
      const branch = node[key];
      if (Array.isArray(branch)) for (const child of branch) visit(child);
    }
  };
  visit(root);
  return out;
}

const schemaProperties = (node: SchemaNode): SchemaNode =>
  isNode(node.properties) ? node.properties : {};

const schemaRequired = (node: SchemaNode): Set<string> =>
  new Set(Array.isArray(node.required) ? (node.required as string[]) : []);

/** `$` / `$.foo` / `$.foo[]` / `$.foo[].bar` -> the node, or undefined. */
function schemaNodeAt(root: SchemaNode, path: string): SchemaNode | undefined {
  if (path === '$') return root;
  let node: SchemaNode | undefined = root;
  for (const step of path.slice(2).split('.')) {
    const key = step.endsWith('[]') ? step.slice(0, -2) : step;
    node = node && schemaProperties(node)[key] ? (schemaProperties(node)[key] as SchemaNode) : undefined;
    if (node && step.endsWith('[]')) node = isNode(node.items) ? node.items : undefined;
    if (!node) return undefined;
  }
  return node;
}

/** The schema's string enumeration at this node, or undefined if it has none. */
function schemaEnum(node: SchemaNode): string[] | undefined {
  if (typeof node.const === 'string') return [node.const];
  if (Array.isArray(node.enum) && node.enum.every((v) => typeof v === 'string')) {
    return node.enum as string[];
  }
  return undefined;
}

/** True when the node describes an object's members (directly or via `items`). */
const describesShape = (node: SchemaNode): boolean =>
  isNode(node.properties) || (isNode(node.items) && isNode((node.items as SchemaNode).properties));

/**
 * How many object nodes the parity walk OUGHT to visit for this schema, counted
 * straight off the document by following `properties`/`items` — the same route
 * the walk takes, derived independently of it.
 *
 * This is what makes the walk's own tally mean something. Without it, a walker
 * that quietly stopped recursing would visit 7 roots, report zero errors and stay
 * green while every nested shape (`ConfirmAction`, `ChoiceOption`,
 * `ChoiceOptionMedia`, `TasksTask`, `ArtifactCardFile`) went unchecked.
 */
function countDescribedObjects(node: SchemaNode): number {
  if (!isNode(node.properties)) return 0;
  let total = 1;
  for (const child of Object.values(schemaProperties(node))) {
    if (!isNode(child)) continue;
    total += countDescribedObjects(child);
    if (isNode(child.items)) total += countDescribedObjects(child.items as SchemaNode);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript-side helpers — PARSE ONLY, no program, no lib
// ─────────────────────────────────────────────────────────────────────────────
//
// A full `ts.createProgram` would need the DOM lib and cost seconds, which is why
// the tsc-based guards in this repo carry per-file timeout exceptions. Nothing
// here needs a checker: the payload types are object literals, interfaces, string
// unions and arrays over one another. `ts.createSourceFile` parses each module in
// under a millisecond, so this file stays inside the strict 5000ms default and out
// of test-timeout-budgets.ts.

type TypeDecl = import('typescript').TypeAliasDeclaration | import('typescript').InterfaceDeclaration;

interface ParsedModule {
  path: string;
  file: import('typescript').SourceFile;
  /** Type aliases + interfaces declared in this file, by name. */
  decls: Map<string, TypeDecl>;
  /** `export … { X as Y } from './z'` -> Y -> { module, original: X }. */
  reexports: Map<string, { module: string; original: string }>;
  /** `import type { X as Y } from './z'` -> Y -> { module, original: X }. Read
   *  ONLY by the dependency walk, to answer "is this name authored in our tree
   *  or is it a TypeScript global?" — the shape walk's resolution order is
   *  deliberately left alone. */
  imports: Map<string, { module: string; original: string }>;
  /** `export * from './z'` — a form this resolver refuses rather than guesses at. */
  starExports: string[];
}

const moduleCache = new Map<string, ParsedModule>();

function resolveSpecifier(fromFile: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined; // package specifiers are out of scope
  const base = resolve(dirname(fromFile), spec);
  // `base` itself first (an explicit extension), then the extension-less forms.
  // A bare `base` can name a DIRECTORY, so each candidate must be a real file.
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
  }
  return undefined;
}

function parseModule(path: string): ParsedModule {
  const cached = moduleCache.get(path);
  if (cached) return cached;

  const text = readFileSync(path, 'utf8');
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const decls = new Map<string, TypeDecl>();
  const reexports = new Map<string, { module: string; original: string }>();
  const imports = new Map<string, { module: string; original: string }>();
  const starExports: string[] = [];

  for (const stmt of file.statements) {
    if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) {
      decls.set(stmt.name.text, stmt);
      continue;
    }
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const target = resolveSpecifier(path, stmt.moduleSpecifier.text);
      const bindings = stmt.importClause?.namedBindings;
      if (target && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, {
            module: target,
            original: (element.propertyName ?? element.name).text,
          });
        }
      }
      continue;
    }
    if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const target = resolveSpecifier(path, stmt.moduleSpecifier.text);
    if (!target) continue;
    if (!stmt.exportClause) {
      starExports.push(target);
      continue;
    }
    if (!ts.isNamedExports(stmt.exportClause)) continue;
    for (const element of stmt.exportClause.elements) {
      reexports.set(element.name.text, {
        module: target,
        original: (element.propertyName ?? element.name).text,
      });
    }
  }

  const parsed: ParsedModule = { path, file, decls, reexports, imports, starExports };
  moduleCache.set(path, parsed);
  return parsed;
}

/** Find `name` starting at `modulePath`, following named re-exports. */
function lookupExported(
  modulePath: string,
  name: string,
  seen = new Set<string>(),
): { module: ParsedModule; decl: TypeDecl } | undefined {
  const key = `${modulePath}#${name}`;
  if (seen.has(key)) return undefined;
  seen.add(key);

  const mod = parseModule(modulePath);
  const local = mod.decls.get(name);
  if (local) return { module: mod, decl: local };

  const via = mod.reexports.get(name);
  if (via) return lookupExported(via.module, via.original, seen);

  // `export * from` would let a type be reachable by a path this resolver does
  // not walk. Refuse rather than report a false "not exported".
  if (mod.starExports.length > 0) {
    throw new Error(
      `${relative(PKG_ROOT, modulePath)} uses \`export * from\`, which this resolver does not ` +
        `follow. Teach it that form before relying on the reachability claim for "${name}".`,
    );
  }
  return undefined;
}

/** Resolve a payload type by name through the PUBLIC barrels. */
function resolvePublicType(name: string): { module: ParsedModule; decl: TypeDecl } | undefined {
  for (const barrel of BARRELS) {
    const found = lookupExported(barrel, name);
    if (found) return found;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reachability from the server-safe entry
// ─────────────────────────────────────────────────────────────────────────────

/** Can a backend route importing `@kitn.ai/ui/schemas` name this type? */
const reachableFromServerSafeEntry = (name: string): boolean =>
  lookupExported(SERVER_SAFE_ENTRY, name) !== undefined;

/**
 * Names that resolve to a TypeScript global rather than to a declaration in this
 * package, and so cannot be exported from anywhere.
 *
 * Exhaustive on purpose, exactly like `KEYWORDS_IGNORED` above: a referenced name
 * that is neither found in this package's tree nor listed here is a hard FAILURE,
 * because the alternative is a walk that skips what it does not recognise. That
 * is the difference between this list and the hand-written list of PAYLOAD types
 * that used to be the bug — this one enumerates the language, not our contract.
 */
const TS_GLOBAL_TYPES: Readonly<Record<string, string>> = {
  Array: 'TypeScript global',
  ReadonlyArray: 'TypeScript global',
  Promise: 'TypeScript global',
  Record: 'TypeScript utility type',
  Readonly: 'TypeScript utility type',
  Partial: 'TypeScript utility type',
  Required: 'TypeScript utility type',
  Pick: 'TypeScript utility type',
  Omit: 'TypeScript utility type',
  Exclude: 'TypeScript utility type',
  Extract: 'TypeScript utility type',
  NonNullable: 'TypeScript utility type',
};

/**
 * Where a name referenced INSIDE `module` is declared, if this package declares
 * it at all: the module's own scope — local declarations, then what it imports,
 * then what it re-exports.
 *
 * IT DOES NOT FALL BACK TO THE PUBLIC BARRELS, AND THAT IS THE POINT
 * ------------------------------------------------------------------
 * `resolvePublicType` answers "is this name EXPORTED somewhere", which is the
 * question being audited — using it to decide whether the package DECLARES a
 * type makes the walk assume its own conclusion. A member type declared in a
 * sibling module and exported from nowhere is exactly the bug this guard exists
 * to catch, and a barrel fallback classifies it as foreign ("this package does
 * not declare it") instead, which is false and points at the wrong fix.
 *
 * That is not a hypothetical. It was the first version of this function, and it
 * silently disabled the `imports` branch below: deleting that branch left every
 * test green, because the barrel fallback answered instead. Measured again with
 * the fallback gone, deleting it goes red — see `follows an \`import type\` to
 * the module that declares it`.
 *
 * DORMANT ON THE PAYLOAD WALK TODAY — MEASURED, NOT ASSUMED
 * ---------------------------------------------------------
 * Every name the seven payload types reference resolves on the FIRST branch:
 * `ConfirmAction`, `ChoiceOption`, `ChoiceOptionMedia`, `TasksTask`,
 * `ArtifactCardFile`, `ArtifactCardTab` and `FormField` are declared beside their
 * payload in card-data-types.ts, and `EmbedProvider` beside `EmbedCardData` in
 * embed-providers.ts. Stubbing this function to local declarations alone leaves
 * the reachability suite green. So the import-following half is covered by its
 * own test rather than by the payload walk, deliberately: it is what keeps the
 * guard honest the day a member type is authored one module over.
 */
function declarationOf(
  name: string,
  module: ParsedModule,
): { module: ParsedModule; decl: TypeDecl } | undefined {
  const local = module.decls.get(name);
  if (local) return { module, decl: local };
  for (const via of [module.imports.get(name), module.reexports.get(name)]) {
    if (!via) continue;
    const found = lookupExported(via.module, via.original);
    if (found) return found;
  }
  return undefined;
}

interface DependencyScan {
  /** Named types this package declares, reached transitively from the root. */
  inTree: string[];
  /** Referenced names this package does not declare and TS_GLOBAL_TYPES does not
   *  classify. Never silently skipped — see the reachability suite. */
  unclassified: string[];
}

/**
 * Every named type a declaration depends on, transitively, read off the AST.
 *
 * There is no list of member types anywhere in this file and there must never be
 * one: `ChoiceOption`, `ConfirmAction`, `TasksTask`, `ArtifactCardFile`,
 * `FormField` and `EmbedProvider` are all found by walking, so a payload type
 * that grows an eighth member type is covered the moment it is written.
 */
function scanDependencies(root: { module: ParsedModule; decl: TypeDecl }): DependencyScan {
  const inTree = new Set<string>();
  const unclassified = new Set<string>();
  const seen = new Set<string>();
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.module.path}#${current.decl.name.text}`;
    if (seen.has(key)) continue; // `FormField` is self-referential
    seen.add(key);

    const visit = (node: import('typescript').Node): void => {
      if (ts.isTypeReferenceNode(node)) {
        let entity: import('typescript').EntityName = node.typeName;
        while (ts.isQualifiedName(entity)) entity = entity.left;
        const name = entity.text;
        const declared = declarationOf(name, current.module);
        if (declared) {
          inTree.add(name);
          queue.push(declared);
        } else if (!(name in TS_GLOBAL_TYPES)) {
          unclassified.add(name);
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(current.decl, visit);
  }

  inTree.delete(root.decl.name.text); // the root is asserted on its own
  return { inTree: [...inTree].sort(), unclassified: [...unclassified].sort() };
}

// The TS shape vocabulary this check understands. Anything outside it becomes
// `unresolved`, which is an error at the site rather than a silent skip.
type TsShape =
  | { kind: 'object'; members: Map<string, { optional: boolean; type: import('typescript').TypeNode; module: ParsedModule }> }
  | { kind: 'record' }
  | { kind: 'array'; element: { type: import('typescript').TypeNode; module: ParsedModule } }
  | { kind: 'string-literals'; values: string[] }
  | { kind: 'keyword'; name: string }
  | { kind: 'union'; parts: TsShape[] }
  | { kind: 'unresolved'; text: string };

const KEYWORD_KINDS = new Map<import('typescript').SyntaxKind, string>([
  [ts.SyntaxKind.StringKeyword, 'string'],
  [ts.SyntaxKind.NumberKeyword, 'number'],
  [ts.SyntaxKind.BooleanKeyword, 'boolean'],
  [ts.SyntaxKind.UnknownKeyword, 'unknown'],
  [ts.SyntaxKind.AnyKeyword, 'any'],
  [ts.SyntaxKind.UndefinedKeyword, 'undefined'],
  [ts.SyntaxKind.NullKeyword, 'null'],
  [ts.SyntaxKind.ObjectKeyword, 'object'],
]);

function membersOf(
  elements: readonly import('typescript').TypeElement[],
  module: ParsedModule,
): TsShape {
  const members = new Map<string, { optional: boolean; type: import('typescript').TypeNode; module: ParsedModule }>();
  let hasIndexSignature = false;
  for (const member of elements) {
    if (ts.isIndexSignatureDeclaration(member)) {
      hasIndexSignature = true;
      continue;
    }
    if (!ts.isPropertySignature(member) || !member.type) continue;
    const name = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : undefined;
    if (name === undefined) continue;
    members.set(name, { optional: member.questionToken !== undefined, type: member.type, module });
  }
  if (members.size === 0 && hasIndexSignature) return { kind: 'record' };
  return { kind: 'object', members };
}

function shapeOfDecl(decl: TypeDecl, module: ParsedModule, depth: number): TsShape {
  if (ts.isInterfaceDeclaration(decl)) {
    if (decl.heritageClauses?.length) {
      return {
        kind: 'unresolved',
        text: `interface ${decl.name.text} extends … (inherited members are not walked)`,
      };
    }
    return membersOf(decl.members, module);
  }
  return shapeOf(decl.type, module, depth + 1);
}

/** Resolve a type node to a shape. Bounded depth: the payload graph is shallow,
 *  and `FormField` is self-referential. */
function shapeOf(node: import('typescript').TypeNode, module: ParsedModule, depth = 0): TsShape {
  if (depth > 12) return { kind: 'unresolved', text: 'recursion limit' };

  if (ts.isParenthesizedTypeNode(node)) return shapeOf(node.type, module, depth + 1);
  if (ts.isTypeLiteralNode(node)) return membersOf(node.members, module);
  if (ts.isArrayTypeNode(node)) return { kind: 'array', element: { type: node.elementType, module } };

  const keyword = KEYWORD_KINDS.get(node.kind);
  if (keyword) return { kind: 'keyword', name: keyword };

  if (ts.isLiteralTypeNode(node)) {
    if (ts.isStringLiteral(node.literal)) return { kind: 'string-literals', values: [node.literal.text] };
    if (node.literal.kind === ts.SyntaxKind.NullKeyword) return { kind: 'keyword', name: 'null' };
    return { kind: 'unresolved', text: node.getText(module.file) };
  }

  if (ts.isUnionTypeNode(node)) {
    const parts = node.types.map((t) => shapeOf(t, module, depth + 1));
    if (parts.every((p) => p.kind === 'string-literals')) {
      return {
        kind: 'string-literals',
        values: parts.flatMap((p) => (p as { values: string[] }).values),
      };
    }
    return { kind: 'union', parts };
  }

  if (ts.isTypeReferenceNode(node)) {
    const name = ts.isIdentifier(node.typeName) ? node.typeName.text : node.typeName.getText(module.file);
    if (name === 'Array' || name === 'ReadonlyArray') {
      const arg = node.typeArguments?.[0];
      return arg ? { kind: 'array', element: { type: arg, module } } : { kind: 'unresolved', text: name };
    }
    if (name === 'Record') return { kind: 'record' };
    // Local first, then the module's own re-exports, then the public barrels.
    const local = module.decls.get(name);
    if (local) return shapeOfDecl(local, module, depth + 1);
    const via = module.reexports.get(name);
    if (via) {
      const found = lookupExported(via.module, via.original);
      if (found) return shapeOfDecl(found.decl, found.module, depth + 1);
    }
    const pub = resolvePublicType(name);
    if (pub) return shapeOfDecl(pub.decl, pub.module, depth + 1);
    return { kind: 'unresolved', text: name };
  }

  return { kind: 'unresolved', text: node.getText(module.file) };
}

/** Drop the `undefined`/`null` arms of a union so an optional member compares as
 *  its underlying shape. */
function stripNullish(shape: TsShape): TsShape {
  if (shape.kind !== 'union') return shape;
  const parts = shape.parts.filter((p) => !(p.kind === 'keyword' && (p.name === 'undefined' || p.name === 'null')));
  if (parts.length === 1) return parts[0]!;
  return { kind: 'union', parts };
}

const shapeParts = (shape: TsShape): TsShape[] => (shape.kind === 'union' ? shape.parts : [shape]);

/**
 * Does the TS side describe an object's members anywhere in this position?
 *
 * ANY union arm counts, not all of them: `ChoiceAllowOther` is
 * `boolean | { label?; placeholder? }`, and the object arm is exactly the part a
 * schema that describes no `properties` leaves unchecked. Requiring every arm to
 * be an object would let that case slip through as "not really a shape".
 *
 * Arrays are deliberately NOT counted here — the caller descends into
 * `items`/element separately, and counting them would double-report.
 */
const tsHasShape = (shape: TsShape): boolean =>
  shapeParts(shape).some((p) => p.kind === 'record' || (p.kind === 'object' && p.members.size > 0));

const describeShape = (shape: TsShape): string => {
  switch (shape.kind) {
    case 'object':
      return `{ ${[...shape.members.keys()].join(', ')} }`;
    case 'record':
      return 'Record<…>';
    case 'array':
      return 'T[]';
    case 'string-literals':
      return shape.values.map((v) => `'${v}'`).join(' | ');
    case 'keyword':
      return shape.name;
    case 'union':
      return shape.parts.map(describeShape).join(' | ');
    case 'unresolved':
      return `<unresolved: ${shape.text}>`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pair derivation
// ─────────────────────────────────────────────────────────────────────────────

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

interface Pair {
  cardType: CardSchemaName;
  typeName: string;
  schema: SchemaNode;
  /** How the type name was arrived at, so a failure can say where to look. */
  via: 'schema title' | 'declared divergence';
}

const titleDivergences = DIVERGENCES.filter(
  (d): d is Extract<Divergence, { kind: 'title-is-not-a-type-name' }> => d.kind === 'title-is-not-a-type-name',
);

const omitDivergences = DIVERGENCES.filter(
  (d): d is Extract<Divergence, { kind: 'schema-omits-shape' }> => d.kind === 'schema-omits-shape',
);

/** One pair per card-DATA schema. Never a literal list — see the header. */
function derivePairs(): { pairs: Pair[]; unmapped: string[] } {
  const pairs: Pair[] = [];
  const unmapped: string[] = [];
  for (const [cardType, schema] of Object.entries(cardSchemas) as [CardSchemaName, SchemaNode][]) {
    const title = typeof schema.title === 'string' ? schema.title : '';
    if (IDENTIFIER.test(title)) {
      pairs.push({ cardType, typeName: title, schema, via: 'schema title' });
      continue;
    }
    const declared = titleDivergences.find((d) => d.cardType === cardType);
    if (declared) {
      pairs.push({ cardType, typeName: declared.typeName, schema, via: 'declared divergence' });
      continue;
    }
    unmapped.push(
      `${cardType}.schema.json: title ${JSON.stringify(title)} is not a TypeScript identifier and no ` +
        `'title-is-not-a-type-name' divergence names the payload type it describes. Add one, or make ` +
        `the title the type name.`,
    );
  }
  return { pairs, unmapped };
}

const { pairs, unmapped } = derivePairs();

// ─────────────────────────────────────────────────────────────────────────────
// The comparison
// ─────────────────────────────────────────────────────────────────────────────

interface Compared {
  errors: string[];
  /** Object nodes actually walked. Zero means nothing was examined. */
  nodes: number;
  /** Individual keys compared. */
  keys: number;
}

function comparePair(pair: Pair): Compared {
  const errors: string[] = [];
  const declaredOmissions = new Set(
    omitDivergences.filter((d) => d.cardType === pair.cardType).map((d) => d.path),
  );
  const counts = { nodes: 0, keys: 0 };

  const resolved = resolvePublicType(pair.typeName);
  if (!resolved) {
    errors.push(
      `${pair.cardType}: the payload type \`${pair.typeName}\` (via ${pair.via}) is not exported from ` +
        `src/index.ts or src/schemas/index.ts. A payload type a consumer cannot import is not a contract.`,
    );
    return { errors, ...counts };
  }

  const at = (path: string) => `${pair.cardType} (${pair.typeName}) at ${path}`;

  const walk = (schemaNode: SchemaNode, shape: TsShape, path: string) => {
    if (shape.kind !== 'object') {
      errors.push(
        `${at(path)}: the schema describes an object but the type is ${describeShape(shape)}.`,
      );
      return;
    }
    counts.nodes += 1;

    const schemaProps = schemaProperties(schemaNode);
    const required = schemaRequired(schemaNode);
    const schemaKeys = Object.keys(schemaProps);
    const tsKeys = [...shape.members.keys()];

    for (const key of tsKeys) {
      if (!schemaKeys.includes(key)) {
        errors.push(
          `${at(path)}: key "${key}" is declared on the TYPE but missing from ` +
            `${pair.cardType}.schema.json.`,
        );
      }
    }
    for (const key of schemaKeys) {
      if (!shape.members.has(key)) {
        errors.push(
          `${at(path)}: key "${key}" is declared in ${pair.cardType}.schema.json but missing from ` +
            `the TYPE \`${pair.typeName}\`.`,
        );
      }
    }

    for (const key of schemaKeys) {
      const member = shape.members.get(key);
      if (!member) continue;
      counts.keys += 1;

      const childSchema = schemaProps[key] as SchemaNode;
      const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;

      // 2. required vs optional
      const requiredInSchema = required.has(key);
      if (requiredInSchema && member.optional) {
        errors.push(
          `${at(path)}: key "${key}" is REQUIRED in ${pair.cardType}.schema.json but optional (\`${key}?\`) on the type.`,
        );
      } else if (!requiredInSchema && !member.optional) {
        errors.push(
          `${at(path)}: key "${key}" is required on the TYPE but not listed in ` +
            `${pair.cardType}.schema.json's \`required\`.`,
        );
      }

      const memberShape = stripNullish(shapeOf(member.type, member.module));
      if (memberShape.kind === 'unresolved') {
        errors.push(
          `${at(path)}: key "${key}" resolves to ${describeShape(memberShape)}, which this check ` +
            `cannot read. Teach it that form rather than leaving the key unchecked.`,
        );
        continue;
      }

      // 3. string enums, both directions
      const enumValues = schemaEnum(childSchema);
      const literalPart = shapeParts(memberShape).find((p) => p.kind === 'string-literals') as
        | { kind: 'string-literals'; values: string[] }
        | undefined;
      if (enumValues && !literalPart) {
        errors.push(
          `${at(path)}: key "${key}" is an enum in ${pair.cardType}.schema.json ` +
            `(${enumValues.map((v) => `'${v}'`).join(' | ')}) but the type says ${describeShape(memberShape)}.`,
        );
      } else if (enumValues && literalPart) {
        const a = [...enumValues].sort();
        const b = [...literalPart.values].sort();
        if (a.join('|') !== b.join('|')) {
          errors.push(
            `${at(path)}: key "${key}" enum mismatch — schema has [${a.join(', ')}], type has [${b.join(', ')}].`,
          );
        }
      } else if (!enumValues && literalPart) {
        errors.push(
          `${at(path)}: key "${key}" is a string-literal union on the type ` +
            `(${describeShape(literalPart)}) but ${pair.cardType}.schema.json constrains no \`enum\`/\`const\`, ` +
            `so the schema accepts any string.`,
        );
      }

      // 4. scalar kinds
      const schemaType = typeof childSchema.type === 'string' ? (childSchema.type as string) : undefined;
      const parts = shapeParts(memberShape);
      const kindOk = (): boolean => {
        switch (schemaType) {
          case 'string':
            return parts.some((p) => (p.kind === 'keyword' && p.name === 'string') || p.kind === 'string-literals');
          case 'number':
          case 'integer':
            return parts.some((p) => p.kind === 'keyword' && p.name === 'number');
          case 'boolean':
            return parts.some((p) => p.kind === 'keyword' && p.name === 'boolean');
          case 'array':
            return parts.some((p) => p.kind === 'array');
          case 'object':
            return parts.some((p) => p.kind === 'object' || p.kind === 'record');
          default:
            return true; // no `type` keyword — nothing asserted
        }
      };
      if (!kindOk()) {
        errors.push(
          `${at(path)}: key "${key}" is \`type: '${schemaType}'\` in ${pair.cardType}.schema.json but ` +
            `${describeShape(memberShape)} on the type.`,
        );
      }

      // 1 (cont.) + descent
      const arrayPart = parts.find((p) => p.kind === 'array') as
        | { kind: 'array'; element: { type: import('typescript').TypeNode; module: ParsedModule } }
        | undefined;
      const itemsSchema = isNode(childSchema.items) ? (childSchema.items as SchemaNode) : undefined;

      if (arrayPart && itemsSchema) {
        const elementShape = stripNullish(shapeOf(arrayPart.element.type, arrayPart.element.module));
        if (isNode(itemsSchema.properties)) {
          walk(itemsSchema, elementShape, `${childPath}[]`);
        } else if (tsHasShape(elementShape) && !declaredOmissions.has(`${childPath}[]`)) {
          errors.push(
            `${at(childPath)}[]: the type's element is ${describeShape(elementShape)} but ` +
              `${pair.cardType}.schema.json describes no \`properties\` for it, and no ` +
              `'schema-omits-shape' divergence declares that gap.`,
          );
        }
        continue;
      }

      if (isNode(childSchema.properties)) {
        walk(childSchema, memberShape, childPath);
        continue;
      }

      if (tsHasShape(memberShape) && !declaredOmissions.has(childPath)) {
        errors.push(
          `${at(childPath)}: the type is ${describeShape(memberShape)} but ${pair.cardType}.schema.json ` +
            `describes no \`properties\` for it, and no 'schema-omits-shape' divergence declares that gap. ` +
            `An undescribed shape is an unchecked contract.`,
        );
      }
    }
  };

  walk(pair.schema, shapeOfDecl(resolved.decl, resolved.module, 0), '$');
  return { errors, ...counts };
}

const results = new Map<CardSchemaName, Compared>(pairs.map((p) => [p.cardType, comparePair(p)]));

// ─────────────────────────────────────────────────────────────────────────────

describe('card payload types vs src/primitives/card-schemas', () => {
  it('derives a pair for every card-DATA schema, and finds at least one', () => {
    // "No findings" and "nothing was examined" are the same number unless this
    // is asserted. Zero pairs is a FAILURE, not a vacuous pass.
    expect(unmapped).toEqual([]);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.length).toBe(Object.keys(cardSchemas).length);
    expect(pairs.map((p) => p.cardType).sort()).toEqual(Object.keys(cardSchemas).sort());

    // Snapshot of the derivation as it stands, so the pairing itself is visible
    // in the suite rather than only its verdict.
    expect(Object.fromEntries(pairs.map((p) => [p.cardType, p.typeName]))).toEqual({
      artifact: 'ArtifactCardData',
      choice: 'ChoiceCardData',
      confirm: 'ConfirmCardData',
      embed: 'EmbedCardData',
      form: 'FormDefinition',
      link: 'LinkPreviewData',
      tasks: 'TasksCardData',
    });
  });

  it('exports every card payload type, and every type they name, from the SERVER-SAFE entry', () => {
    // The pair set is derived from `cardSchemas` (see "PAIRS ARE DERIVED"), and
    // the member types are read off each declaration's AST, so nothing here is a
    // restatement of names that could fall behind the contract. A new card type
    // is covered by its schema landing; a new member type by being written.
    //
    // What this asserts is narrower and stricter than "publicly exported": the
    // ONE entry a Node/no-DOM backend can import. The two-barrel form this
    // replaces is what let `LinkPreviewData` and `EmbedCardData` sit outside the
    // server-safe entry while 11 tests here ran green.
    const missing: string[] = [];
    const unclassified: string[] = [];
    let namesChecked = 0;

    for (const pair of pairs) {
      const resolved = resolvePublicType(pair.typeName);
      if (!resolved) {
        missing.push(
          `${pair.cardType}: \`${pair.typeName}\` (via ${pair.via}) is exported from no public barrel at all.`,
        );
        continue;
      }

      namesChecked += 1;
      if (!reachableFromServerSafeEntry(pair.typeName)) {
        missing.push(
          `${pair.cardType}: payload type \`${pair.typeName}\` is NOT exported from ` +
            `src/schemas/index.ts. A route importing '@kitn.ai/ui/schemas' gets TS2305 for it. ` +
            `Being exported from src/index.ts does not count — that barrel carries Solid, which ` +
            `is the entire reason the server-safe one exists.`,
        );
      }

      const deps = scanDependencies(resolved);
      for (const dep of deps.inTree) {
        namesChecked += 1;
        if (!reachableFromServerSafeEntry(dep)) {
          missing.push(
            `${pair.cardType}: \`${pair.typeName}\` names \`${dep}\`, which is NOT exported from ` +
              `src/schemas/index.ts. A member type a consumer cannot import leaves them writing ` +
              `casts against their own payload.`,
          );
        }
      }
      for (const name of deps.unclassified) {
        unclassified.push(
          `${pair.cardType}: \`${pair.typeName}\` references \`${name}\`, for which this walk found no ` +
            `declaration in the referencing module's scope, and which TS_GLOBAL_TYPES does not classify. ` +
            `If it is a TypeScript global, classify it there; if this package declares it, teach ` +
            `\`declarationOf\` to reach it and then export it from src/schemas/index.ts. An unclassified ` +
            `name is one this walk would otherwise skip in silence.`,
        );
      }
    }

    expect(unclassified).toEqual([]);
    expect(missing).toEqual([]);
    // Strictly greater than the pair count: the member types were walked too, so
    // "nothing wrong" cannot be "nothing examined" wearing the same number.
    expect(namesChecked).toBeGreaterThan(pairs.length);
  });

  it('follows an `import type` to the module that declares it', () => {
    // The `imports` branch of `declarationOf` is dormant on this tree (see its
    // doc comment — measured, not assumed), and a dormant branch in a guard is
    // one nobody has watched work. So it is exercised here directly, against a
    // real module: primitives/link-preview.ts declares `LinkPreviewEnvelope` and
    // reaches `CardEnvelope` through `import type { CardEnvelope } from
    // './card-contract'`. Resolving that name from inside link-preview.ts can
    // only succeed by following the import.
    const linkPreview = parseModule(resolve(PKG_ROOT, 'src/primitives/link-preview.ts'));
    expect(linkPreview.decls.has('LinkPreviewEnvelope')).toBe(true);
    // Not a local declaration, and not a re-export — so the first and third
    // branches cannot be what answers this.
    expect(linkPreview.decls.has('CardEnvelope')).toBe(false);
    expect(linkPreview.reexports.has('CardEnvelope')).toBe(false);
    expect(linkPreview.imports.get('CardEnvelope')?.module).toBe(
      resolve(PKG_ROOT, 'src/primitives/card-contract.ts'),
    );

    const found = declarationOf('CardEnvelope', linkPreview);
    expect(found?.decl.name.text).toBe('CardEnvelope');
    expect(found?.module.path).toBe(resolve(PKG_ROOT, 'src/primitives/card-contract.ts'));
  });

  it('visits every object node its schema describes, nested ones included', () => {
    // A pair that compared zero keys would report zero errors and prove nothing;
    // a walk that visited only the 7 roots would prove almost nothing and look
    // identical. Both are asserted, and the per-pair node count is derived from
    // the schema document independently of the walk that produced it.
    const thin = pairs
      .map((p) => ({ cardType: p.cardType, ...results.get(p.cardType)! }))
      .filter((r) => r.nodes === 0 || r.keys === 0);
    expect(thin).toEqual([]);

    const visited = Object.fromEntries(pairs.map((p) => [p.cardType, results.get(p.cardType)!.nodes]));
    const expected = Object.fromEntries(pairs.map((p) => [p.cardType, countDescribedObjects(p.schema)]));
    expect(visited).toEqual(expected);

    const totals = [...results.values()].reduce(
      (acc, r) => ({ nodes: acc.nodes + r.nodes, keys: acc.keys + r.keys }),
      { nodes: 0, keys: 0 },
    );
    // Strictly greater than the pair count: at least one NESTED object was walked.
    expect(totals.nodes).toBeGreaterThan(pairs.length);
    expect(totals.keys).toBeGreaterThan(0);
  });

  it.each(pairs.map((p) => [p.cardType, p.typeName] as const))(
    '%s: `%s` and its schema agree on keys, optionality, enums and scalar kinds',
    (cardType) => {
      expect(results.get(cardType)!.errors).toEqual([]);
    },
  );

  it('keeps every declared divergence honest — a stale one fails', () => {
    const stale: string[] = [];
    for (const divergence of DIVERGENCES) {
      const schema = (cardSchemas as Record<string, SchemaNode>)[divergence.cardType];
      if (!schema) {
        stale.push(`${divergence.cardType}: no such card schema; the divergence outlived its card type.`);
        continue;
      }
      if (!divergence.why.trim()) {
        stale.push(`${divergence.cardType}: a divergence without a reason is a skip.`);
      }
      if (divergence.kind === 'title-is-not-a-type-name') {
        if (IDENTIFIER.test(String(schema.title ?? ''))) {
          stale.push(
            `${divergence.cardType}: title ${JSON.stringify(schema.title)} IS a valid type name now — ` +
              `drop the 'title-is-not-a-type-name' divergence and let the derivation do it.`,
          );
        }
        continue;
      }
      const node = schemaNodeAt(schema, divergence.path);
      if (!node) {
        stale.push(
          `${divergence.cardType} ${divergence.path}: no such node in the schema; the divergence points at nothing.`,
        );
        continue;
      }
      if (describesShape(node)) {
        stale.push(
          `${divergence.cardType} ${divergence.path}: the schema DOES describe this shape now — ` +
            `drop the 'schema-omits-shape' divergence so the shape gets checked.`,
        );
      }
    }
    expect(stale).toEqual([]);
  });

  it('classifies every keyword the card schemas use, so uncovered ground cannot grow silently', () => {
    const unclassified = new Set<string>();
    for (const [cardType, schema] of Object.entries(cardSchemas)) {
      for (const node of allSchemaNodes(schema as SchemaNode)) {
        for (const keyword of Object.keys(node)) {
          if (KEYWORDS_READ.has(keyword) || isAnnotation(keyword)) continue;
          if (keyword in KEYWORDS_IGNORED) continue;
          unclassified.add(`${cardType}: "${keyword}"`);
        }
      }
    }
    // A new keyword must be classified as read-or-ignored before it lands, or
    // this check would quietly stop covering the shape it constrains.
    expect([...unclassified].sort()).toEqual([]);
  });
});
