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

**First slice of v1.** A `ready` framework has been scaffolded, installed from
the registry, built by its own build script, and driven in a browser — a message
sent, and a reply streaming into `<kai-thread>`. Remaining frameworks, layouts
and gateways are declared in the tables but not offered.

**`create-kai --list` is the roster.** This paragraph used to name which
frameworks were ready, and it was wrong within a day of each one landing — so
the list lives in `src/frameworks.ts` and at runtime in `--list --json`, and
nowhere else.

Vue went first among the `registration: 'elements'` + `composedWorkspace: true`
cells and paid for the shared machinery: a framework could go `ready` with **no
patches at all** and the build would still print "2 patches verified", shipping
the kit's own example title and `nx build ui` into a user's project. That hole
is closed by the repo-internals check below, which reads the emitted output
instead of the patch list — and it is what caught Svelte and HTML on their first
`ready` build, naming every offending line, exactly as intended.

Each of the later cells then needed only its own patches. The one decision
neither React nor Vue had to make: the vanilla template's vite config describes
ITSELF ("unlike the React/Vue examples", "this is the showcase"), which is true
of a starter in `examples/` and false of the project a user just scaffolded.
Nothing in the repo-internals list catches that — it is not an unfollowable
instruction, just a sentence about the wrong project — so that patch rewrites
the paragraph rather than stopping short of it.

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
| `scripts/build.mjs` repo-internals check | the patch you did **not** write. The patch check above proves the declared patches match; it passes vacuously on a framework with an empty patch list, which is how Vue's first `ready` build emitted "@kitn.ai/ui Vue example" as the browser-tab title and told the user to run `nx build ui`. This one patches in memory and greps the RESULT |
| `scripts/build.mjs` app-path check | `paths.app` naming a file the template does not have. It is written into `kai.json` and quoted in the emitted README, and nothing else opens it at build time — so React's `src/App.tsx` copied onto a Vue row would go unnoticed |
| `scripts/build.mjs` devDep check | a devDependency range disagreeing with `packages/ui`. `.npmrc` sets `node-linker=hoisted`, so one version wins workspace-wide — an `@types/node: ^22` here downgraded the KIT from 26 and broke its emitted-code suite |
| `test/kit-contract.test.ts` | a template importing something the kit does not export |
| `scripts/verify-pack.mjs` | npm stripping `.gitignore` out of the tarball, and templates missing from `files` |
| `scripts/smoke.mjs` | an emitted project that installs but does not build. `--framework all` covers every ready framework; without a flag it only ever built React, which meant it answered "does React still build" no matter which framework you had just turned on |

## Publish gate

`create-kai` pins `^<kit version>`, derived at build time from
`packages/ui/package.json`. It must not publish until the kit version it pins is
on npm and carries everything the templates import.

Check before publishing, against the tarball the pin resolves to:

```bash
npm pack @kitn.ai/ui@<pinned> && tar -xzf kitn.ai-ui-<pinned>.tgz
KAI_KIT_ROOT=./package npx vitest run test/kit-contract.test.ts
```

Green means an emitted project will build for a user.

**The blocker this section used to describe is cleared.** It read: the latest
published kit is 0.20.1, which predates `@kitn.ai/ui/wire`, `MessagePart` and
`createMockResponder`, so an emitted project installs cleanly and then fails
`npm run build` with nine type errors. **0.21.0 is published and carries all
three.** The gate above is green against it for every ready template, and
every ready framework's emitted project, pinned to `^0.21.0`, installs from the
registry, passes its own build script, and streams in a browser.

Re-run it against whatever the pin resolves to; do not read this paragraph as
standing permission.

## Adding a framework

`src/frameworks.ts` is the table. Flip `status` to `ready` and drop its `note`,
add its patches to `src/patches.ts`, and the build copies its template, the
prompt offers it, and `--list` reports it.

The build tells you which patches you owe: flip the status first and run it, and
the repo-internals check names every repo-internal line the template would ship,
file by file. That is the intended order — you are not expected to find them by
reading.

Then find out whether it actually runs:

```bash
node scripts/smoke.mjs --framework <id>   # scaffold -> install -> build
node scripts/smoke.mjs --framework <id> --keep   # ... and leave it to `npm run dev`
```

**`--keep` and a browser are the step that counts.** A framework is not `ready`
because it built; it is `ready` because a message sent in a real browser streamed
a reply into `<kai-thread>`. Vue's build was green before its patches existed and
while its README pointed at `src/App.tsx`.

When you drive it, assert on the RIGHT PAGE and on GROWTH:

- Every Vite starter's dev script has a fixed `server.port`, and Vite does
  **not** use `strictPort` — a port already in use makes it quietly serve on the
  next one instead. Drive it with `--port <n> --strictPort`, and kill by
  process GROUP (`spawn(..., { detached: true })` + `process.kill(-pid)`);
  killing the `npm` wrapper alone orphans the `vite` child, which then squats
  the port for the next framework you test. Both traps fired here: the html run
  hit a leaked svelte server on 5176 and "passed", and because all these
  starters render the same design the screenshots were pixel-identical, which
  read as success. Assert `document.title` — every scaffold patches it to the
  project name — so the run is bound to the app you meant to test.
- Sample `<kai-thread>` on an interval and require the text to GROW across
  several distinct samples. One non-empty read is satisfied by the seeded
  conversation that is already on screen before you type anything.
- The composer is `contenteditable="plaintext-only"` inside a shadow root, not a
  `textarea`. A bare `textarea` selector finds the sidebar's search box instead.
