# @kitn.ai/blocks

The authored kai blocks, the registry that understands their layout, and the
shared form renderer. Private: never published, bundled into `create-kai` and
the `packages/ui/apps/gallery` page served by `kai dev`. The docs site is a
future consumer, not a current one.

## What is here

- `blocks/<id>/` -- one directory per block. A directory IS a block when it
  holds a `registry-item.json`. Adding a block is adding a directory; nothing
  anywhere holds a list.
- `src/registry.ts` -- manifest validation, the directory-scan discovery, the
  derived index and per-block item JSON, the CDN-form generator, and
  `checkBlockContracts`.
- `src/forms.ts` -- the one renderer every delivery form goes through, so what
  the gallery shows is byte-for-byte what `create-kai add` writes.

## This package depends on nothing

Not on `@kitn.ai/ui`, not on `zod`, not on `node:*`. The two facts the registry
needs from the kit arrive by injection, from callers that have a filesystem:

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
esbuild round trip, `create-kai` through its CLI bundle, and the
`packages/ui/apps/gallery` page through vite. A build here would put a build
ordering between this package and the ui build and buy nothing.

## Gates

    pnpm --filter @kitn.ai/blocks run typecheck
    pnpm --filter @kitn.ai/blocks exec vitest run

The block CELLS -- every block's contracts, freshness, pins and its recorded
browser baseline -- are `pnpm --filter @kitn.ai/ui run verify:blocks`, which
lives in the ui package because it needs the kit's build outputs.
