# block-driver — the V-1 harness

The composition spike's `fine-drive.mjs`
(`docs/superpowers/research/2026-08-31-composition-spike/cdn-widget-src/`)
generalized into a reusable Playwright/Chromium driver. A scenario module
declares pages, sequential UI states, user-level actions, behavioral probes,
computed-style probes and hard expectations as data; the driver runs them
light + dark, enforces zero console errors, writes a stable-named screenshot
per state (`<page>-<scheme>-<state>.png`) and a JSON verdict. Exit 1 on any
red.

## Layout

- `driver.mjs` — the runner. Flag reference in its header comment.
- `serve.mjs` — static page server; mounts the built `dist/` at `/kit/` the
  way a CDN serves `@kitn.ai/ui@<version>/dist/`.
- `scenarios/kai-chat-facade.mjs` — the facade's eight-state story (plus a
  reload-restore state), restated from `fine-drive.mjs` as data.
- `pages/kai-chat-facade/` — the harness page: the spike's facade widget page
  (index.html + app.js), unchanged in behavior.
- `baselines/kai-chat-facade.json` — the recorded pre-refactor verdict
  (probe + computed-style values, per scheme per state).
- `baselines/screenshots/` — the pre-refactor screenshot set (committed, per
  the spike-shots precedent).

## Modes

- **record** (`--record <file>`): run + write the verdict = the baseline.
- **check** (`--baseline <file>`): run + deep-diff every probe/style value
  against a recorded baseline; any mismatch is red.
- **parity** (`--pages a,b`): run two pages and diff them state-for-state
  (the spike's facade-vs-fine comparison; block-vs-facade later).

All modes also enforce each state's `expect` map and zero console
errors/warnings (`scenario.consoleIgnore` regexes waive named ones loudly).

## Task 2.2 gate (P-9 parity)

After refactoring the facade, from `packages/ui` (build first):

```sh
node scripts/block-driver/driver.mjs scripts/block-driver/scenarios/kai-chat-facade.mjs \
  --serve scripts/block-driver/pages/kai-chat-facade \
  --baseline scripts/block-driver/baselines/kai-chat-facade.json \
  --shots <after-shots-dir>
```

Green means every behavioral and computed-style value matches the recorded
pre-refactor facade, both schemes; the `<after-shots-dir>` set pairs with
`baselines/screenshots/` name-for-name for the owner's eyeball pass.

Port default is 8952; never point it at 4400/4401/8931. This guard has been
watched failing (a planted wrong expectation and a planted page defect each
went red with named states before the recorded green) — re-plant one before
trusting structural changes to the driver itself.
