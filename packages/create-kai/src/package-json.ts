/**
 * The starter -> standalone-consumer rewrite.
 *
 * A starter is a workspace member; an emitted project is a published-package
 * consumer. That is the entire difference, and keeping it to one function is
 * what lets the rest of the tree be a byte-for-byte copy of a CI-built starter.
 */

/**
 * The monorepo-local spec shapes a starter can carry for the kit. Two are in the
 * tree today (`workspace:*` for the SPA starters, `file:../../../packages/ui`
 * for the SSR ones), so the rewrite has more than one input shape to handle and
 * a check for exactly one of them would pass on five starters and silently ship
 * a `file:` path on the other two.
 */
const LOCAL_KIT_SPEC = /^(?:workspace:|file:|link:)/;

/** Whether a kit spec is a monorepo-local link that must not reach a user. */
export function isLocalKitSpec(spec: string): boolean {
  return LOCAL_KIT_SPEC.test(spec);
}

export interface RewriteOptions {
  /** the emitted project's `name` */
  name: string;
  /** the `@kitn.ai/ui` spec to pin, e.g. `^0.21.0` or `file:/tmp/kit.tgz` */
  kit: string;
  /** extra runtime deps the chosen gateway needs — `integration.deps.npm` */
  gatewayDeps?: readonly string[];
  /** resolved specs for `gatewayDeps`, when the caller knows them */
  gatewayDepSpec?: (pkg: string) => string;
}

export interface RewriteResult {
  json: Record<string, unknown>;
  /** how the kit was specified before the rewrite, for the caller to report */
  previousKitSpec: string | undefined;
}

/**
 * Rewrite a starter's `package.json` into a standalone consumer's.
 *
 * Pure and synchronous so the golden tests can assert the emitted object
 * directly. It deliberately does NOT reformat or reorder anything it did not
 * change: the less this function touches, the smaller the surface on which an
 * emitted project can differ from the reviewed starter.
 */
export function rewritePackageJson(source: string, options: RewriteOptions): RewriteResult {
  const json = JSON.parse(source) as Record<string, unknown>;

  json.name = options.name;
  json.version = '0.1.0';
  // `private` on a starter marks it as an un-published workspace member. An
  // emitted project is the user's own; leaving it would silently block them
  // publishing it, and removing it costs nothing since npm's default is public
  // only on an explicit `npm publish`.
  delete json.private;

  const deps = (json.dependencies ?? {}) as Record<string, string>;
  const previousKitSpec = deps['@kitn.ai/ui'];
  if (previousKitSpec === undefined) {
    // Every starter depends on the kit. A starter that does not is either a new
    // shape this function has not been taught or a broken template, and both
    // should stop the scaffold rather than emit a project missing its one
    // required dependency.
    throw new Error(
      'create-kai: template package.json declares no `@kitn.ai/ui` dependency — refusing to emit it',
    );
  }
  deps['@kitn.ai/ui'] = options.kit;

  for (const pkg of options.gatewayDeps ?? []) {
    // The gateway's own declared deps (`integration.deps.npm`), never a list
    // restated in the CLI. `*` is a deliberate placeholder only when the caller
    // has no resolved spec — the install then picks latest, which is what a
    // hand-written `npm install <pkg>` would do.
    deps[pkg] = options.gatewayDepSpec?.(pkg) ?? '*';
  }
  json.dependencies = deps;

  return { json, previousKitSpec };
}

/** Serialize with npm's own formatting (2 spaces, trailing newline). */
export function stringifyPackageJson(json: Record<string, unknown>): string {
  return `${JSON.stringify(json, null, 2)}\n`;
}
