# @kitn.ai/blocks

The authored kai blocks, the registry that understands their layout, and the
shared form renderer. Private: never published, bundled into `create-kai` and
read by the docs site's `/blocks` section, which is the browse surface.

## What is here

- `blocks/<id>/` -- one directory per block. A directory IS a block when it
  holds a `registry-item.json`. Adding a block is adding a directory; nothing
  anywhere holds a list.
- `src/registry.ts` -- manifest validation, the directory-scan discovery, the
  derived index and per-block item JSON, the CDN-form generator, and
  `checkBlockContracts`.
- `src/contract/` -- the authored contract. `parse-template.ts` parses the
  binding grammar off the page with parse5 and is the ONE owner of it, so every
  refusal is written once and surfaced verbatim; `analyze-controller.ts` reads
  the controller's declared shape (`createController`, `<Component>State`,
  `<Component>Actions` with its `boot`, `<Component>Refs`) and cross-checks it
  against the bindings the page declares; `types.ts` is the parsed tree both
  halves speak.
- `src/forms/` -- the renderers every delivery form goes through, so what the
  blocks page shows is byte-for-byte what `create-kai add` writes. `html.ts`
  emits the page plus a generated binder, `react.ts` a typed-wrapper tree over
  the controller, `cdn.ts` the inlined and pinned paste form, and `index.ts` is
  the barrel the consumers import.
- `src/targets.ts` -- the ONE install-root table (`src/components/<id>` and its
  per-framework variants), so the path the blocks page displays is the path the
  CLI writes.

## What this package may depend on

`src/registry.ts` depends on NOTHING outside this package -- not on
`@kitn.ai/ui`, not on `zod`, not on `node:*`. Its only imports are
`./contract/parse-template` and `./contract/analyze-controller`, so parse5
arrives transitively and by that one route. It is what `create-kai`
bundle-imports for validation and what `bundleGraphProblem` grades, and it
stays a leaf.

`src/contract/**` and `src/forms/**` depend on `parse5`, and on nothing else.
The binding grammar is attributes on a tree with a scope in it, and a regex
cannot see a tree; the predecessor (`bodyToJsx`) refused everything it could
not translate, which was honest and does not scale to a grammar. parse5 ships
its own types, imports no `node:*` module, and compiles under this package's
`"types": []` / DOM-free `lib` (measured, both with and without
`skipLibCheck`), so neither tsconfig option relaxes for it.

The two facts the registry needs from the kit still arrive by injection, from
callers that have a filesystem:

| Injected input | Read from |
|---|---|
| `routeIntegrations` | `listIntegrations()` in `packages/ui/mcp/registry.ts` |
| `nonscalarByTag` | `packages/ui/src/elements/element-nonscalar.json` |
| `version` | `packages/ui/package.json` |

`tsconfig.json` declares no ambient type packages, which is what enforces the
`node:*` half mechanically rather than by convention.

## No build step

The `exports` map points at TypeScript source. Every consumer bundles it:
`packages/ui/scripts/gen-blocks.mjs` and `verify-blocks.mjs` through their
esbuild round trip, `create-kai` through its CLI bundle, and the docs site's
`/blocks` section through astro. A build here would put a build ordering
between this package and the ui build and buy nothing.

## The authored block sources are in no tsconfig here

`blocks/<id>/<id>.controller.ts` imports `@kitn.ai/ui/state`, `/wire`,
`/stores` and `/elements`, and this package must not depend on the kit. That is
the direction the package move established, and a path mapping would put a
build ordering back between the two. So `tsconfig.json` covers `src/**` and not
`blocks/**`, and the controllers are checked where a CONSUMER checks them: the
react compile cell in `pnpm --filter @kitn.ai/ui run verify:scaffold` compiles
the emitted tree against the SHIPPED declarations in a consumer-shaped harness,
and `pnpm --filter @kitn.ai/ui run verify:blocks:react` then runs it in a real
browser. That is a stronger check than a local pass, not a weaker one, and it
is not theoretical: the compile cell's first honest run found a real TS7053 in
an authored controller that nothing in the repo had ever type-checked.

## Gates

    pnpm --filter @kitn.ai/blocks run typecheck
    pnpm --filter @kitn.ai/blocks exec vitest run

The block CELLS live in the ui package because they need the kit's build
outputs:

- `pnpm --filter @kitn.ai/ui run verify:blocks` -- every block's contracts,
  freshness, pins, its recorded browser baseline, and the two structural cells
  over the emitted forms (`html-binder`, `react-tree`). It prints the blocks
  and checks it ran, and its `--self-test` plants each failure class first.
- `pnpm --filter @kitn.ai/ui run verify:blocks:react` -- react is the one
  framework form this repo tests AT RUNTIME: grep, `tsc --strict`, then the
  block driver against the react page in a real browser.
- `pnpm --filter @kitn.ai/ui run verify:scaffold` -- carries the block compile
  cells (blocks x forms), and prints the axis and the cell count it ran.
