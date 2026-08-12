# create-kai

Scaffold a runnable [`@kitn.ai/ui`](https://ui.kitn.ai) chat app.

```bash
npm create kai@latest
npx create-kai my-app
```

Press Enter through every prompt and you get React + full-screen + conversation
history + the kit's local mock: a project that streams a reply on the first
`npm run dev`, with no API key and no backend.

## Status

**First slice of v1. Not publishable yet — see Publish gate.** The zero-config
path (React · full-screen · conversation history · mock) runs end to end. Other
frameworks, layouts and gateways are declared in the tables but not offered;
`create-kai --list` prints exactly what is ready and what is not.

## How it is put together

Two sources of truth, neither of them copied:

- **Templates** are `examples/starters/*`, copied into `dist/templates/` by
  `scripts/build.mjs`. The starters are CI-built, so drift is caught there.
  Everything except the `package.json` rewrite and the patches in
  `src/patches.ts` is a byte-for-byte copy.
- **Gateways and renderable surfaces** come from
  `packages/ui/src/agent-tooling/`, imported by relative path and bundled at
  build time (`src/catalog.ts`). Env var names, `deps`, `keyExposure`, route
  templates and `renderSurface` are read, never restated. A second copy of any
  of those has a build failure as its failure mode.

The CLI is bundled to one zero-dependency file so `npx` cold start is fast. It
is **not** the `kai` MCP (`npx @kitn.ai/ui mcp`), and it is not a runtime
dependency of anything it scaffolds.

## Commands

```bash
npm run build          # copy templates, verify patches, bundle dist/index.js
npm test               # unit + golden + the kit-contract drift guard
npm run typecheck
npm run verify:pack    # assert the PUBLISHED tarball is shippable
npm run smoke          # scaffold -> install -> build, against the workspace kit
```

`npm run build` must run before `npm test` (the tests read `dist/templates`),
and `nx build ui` must have run before the kit-contract test (it reads the kit's
built `.d.ts`).

## The guards, and what each one is for

Every one of these has been watched failing; a guard nobody has seen go red is
not evidence.

| Guard | Catches |
|---|---|
| `scripts/build.mjs` patch check | a template patch that silently stopped matching, which would ship `workspace:*` instructions into a user's project |
| `scripts/build.mjs` devDep check | a devDependency range disagreeing with `packages/ui`. `.npmrc` sets `node-linker=hoisted`, so one version wins workspace-wide — an `@types/node: ^22` here downgraded the KIT from 26 and broke its emitted-code suite |
| `test/kit-contract.test.ts` | a template importing something the kit does not export |
| `scripts/verify-pack.mjs` | npm stripping `.gitignore` out of the tarball, and templates missing from `files` |
| `scripts/smoke.mjs` | an emitted project that installs but does not build |

## Publish gate

`create-kai` pins `^<kit version>`, derived at build time from
`packages/ui/package.json`. **It must not publish until a kit version containing
the `parts[]` migration is on npm.** Today the latest published kit is 0.20.1,
which predates `@kitn.ai/ui/wire`, `MessagePart` and `createMockResponder` — all
of which the React starter imports. An emitted project pinned to `^0.20.1`
installs cleanly and then fails `npm run build` with nine type errors.

Check before publishing, against the tarball the pin resolves to:

```bash
npm pack @kitn.ai/ui@<pinned> && tar -xzf kitn.ai-ui-<pinned>.tgz
KAI_KIT_ROOT=./package npx vitest run test/kit-contract.test.ts
```

Green means an emitted project will build for a user. Run against 0.20.1 today
it fails, which is correct.

## Adding a framework

`src/frameworks.ts` is the table. Flip `status` to `ready`, add its patches to
`src/patches.ts`, and the build copies its template, the prompt offers it, and
`--list` reports it. `scripts/smoke.mjs` is how you find out whether it runs.
