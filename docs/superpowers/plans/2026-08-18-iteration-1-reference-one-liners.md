# Iteration 1: the reference one-liners — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five documentation gaps an agent hit while building a chat app from `component_reference` output alone, four of which produced silent failures.

**Architecture:** Every gap but one is a *rendering* gap, not a knowledge gap — the generators already produce the data and `formatReference` drops it on the floor. The CEM (`dist/custom-elements.json`) already carries each event's `type.text` and each element's class `name`; `element-manifest.json` already carries the per-element entry map. So four of five tasks are "print what we already have", and the fifth removes ~18 KB of duplication.

**Tech Stack:** TypeScript, vitest (`--project=unit`), the `kai` MCP server (`packages/ui/src/agent-tooling/`).

**Spec:** `docs/superpowers/specs/2026-08-18-iteration-ladder-design.md`

## Global Constraints

- Branch: `feat/reference-one-liners`, off `main`, in the main checkout. **No worktree.**
- Run tests with `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`. **Never `nx test`** — this repo's nx cache has produced wrong verdicts in both directions.
- Run `verify:generated` **alone**, never concurrently with a vitest run: it rewrites artifacts into the source tree and makes a concurrent run fail spuriously.
- **Never hand-edit** `packages/ui/src/agent-tooling/catalog/derived.json`, `src/elements/element-meta.json`, or `dist/custom-elements.json` — all generated.
- **Never hand-edit the package version.** release-please owns it.
- **Derive, don't type.** Any list, count, path or version must be read from where it lives. This plan was nearly written with a hand-derived import path that is wrong for 10 of 80 elements.
- Copy/voice: sound like a sharp human engineer, follow `apps/docs/STYLE.md`. No emoji.
- Commit after each task with a conventional-commit message.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `packages/ui/src/agent-tooling/mcp/tools/reference.ts` | renders one element's reference document | modify — 4 of 5 tasks |
| `packages/ui/src/agent-tooling/mcp/reference.test.ts` | the reference tool's suite | modify — every task |
| `packages/ui/src/agent-tooling/mcp/manifest.ts` | resolves the CEM + element manifest | modify — Task 1 only, to expose the per-element entry map |
| `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` | emits scaffolded front ends | modify — Task 5 only |

---

### Task 1: Say how to make the element exist

The top-ranked finding. `component_reference` describes an element's entire API across 39 KB and never says `import '@kitn.ai/ui/elements'`. Omit it and you get a blank page, **zero console errors**, a property that assigns and reads back correctly in devtools, and `customElements.whenDefined()` that never resolves. The information exists in the `debug` tool — filed under recovering from failure rather than building.

This task also names the TypeScript interface, because it is the same insertion point and a reviewer would accept or reject them together.

**Files:**
- Modify: `packages/ui/src/agent-tooling/mcp/manifest.ts`
- Modify: `packages/ui/src/agent-tooling/mcp/tools/reference.ts:451-467`
- Test: `packages/ui/src/agent-tooling/mcp/reference.test.ts`

**Interfaces:**
- Consumes: `getElement(tag)` from `./manifest`, whose returned declaration carries `.name` (e.g. `"KaiChatElement"`) and `.tagName`.
- Produces: `entryForTag(tag: string): string | undefined` exported from `./manifest` — the per-element entry basename, or `undefined` when the element has no per-element entry.

- [ ] **Step 1: Write the failing test**

Add to `packages/ui/src/agent-tooling/mcp/reference.test.ts`, inside the top-level `describe('component_reference', ...)`:

```ts
  it('opens with how to register the element, before any API surface', async () => {
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { type: string; text: string }[])[0].text;

    expect(text).toMatch(/### Getting the element/);
    expect(text).toMatch(/import '@kitn\.ai\/ui\/elements'/);
    // it must come BEFORE the props, or a reader who stops early still misses it
    expect(text.indexOf('### Getting the element')).toBeLessThan(
      text.indexOf('### Props (JavaScript properties)'),
    );
    // and it must name the silent failure, which is the whole reason this exists
    expect(text).toMatch(/whenDefined/);
  });

  it('names the shipped TypeScript interface', async () => {
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/KaiChatElement/);
  });

  it('uses the real per-element entry, not the tag with kai- stripped', async () => {
    // kai-conversations resolves to 'conversation-list'. Ten of eighty elements do
    // not match the naive derivation, so this asserts the manifest is consulted.
    const out = await reference.handler({ name: 'kai-conversations' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/@kitn\.ai\/ui\/elements\/conversation-list/);
    expect(text).not.toMatch(/@kitn\.ai\/ui\/elements\/conversations'/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`

Expected: 3 failures. The first two fail on the missing `### Getting the element` / `KaiChatElement`; the third fails because no import path is rendered at all. **Read the failure messages** — if any fails for a different reason than the one stated here, stop and find out why before implementing.

- [ ] **Step 3: Expose the per-element entry map**

In `packages/ui/src/agent-tooling/mcp/manifest.ts`, add — placing it beside the other manifest readers and matching their existing import/caching style:

```ts
/**
 * The per-element entry basename for a tag, e.g. 'kai-chat' -> 'chat'.
 *
 * Read from element-manifest.json's `tags` map rather than derived by stripping
 * the `kai-` prefix: TEN of the eighty elements do not match that derivation
 * (`kai-conversations` -> `conversation-list`), so a derived path would emit a
 * broken import for them.
 */
export function entryForTag(tag: string): string | undefined {
  const tags = elementManifest().tags as Record<string, string> | undefined;
  return tags?.[tag];
}
```

If `elementManifest()` does not already exist in that file, read how the CEM is loaded there and follow the same pattern to read `../../elements/element-manifest.json`; do not invent a second resolution strategy.

- [ ] **Step 4: Render the section**

In `packages/ui/src/agent-tooling/mcp/tools/reference.ts`, import `entryForTag` alongside the existing `./manifest` imports. Then insert immediately after the header block (currently ending at line 457, `lines.push('', el.description.trim())`) and **before** the `### AI/UI contract` push:

```ts
  // ── Getting the element ────────────────────────────────────────────────────
  // FIRST, above every other section. An element that never upgrades renders
  // nothing and logs NOTHING: the property assigns and reads back fine, and
  // whenDefined() never settles, so the listener is never attached. That symptom
  // is also what props-not-attributes blames on a different cause, so a reader
  // who has the invariants and not this line is steered to the wrong diagnosis.
  const entry = entryForTag(tag);
  const iface = el.name;
  lines.push(
    '',
    '### Getting the element',
    'Register it before you use it. If you skip this the element never upgrades: ' +
      'nothing renders, **no error and no warning is logged**, a property you set ' +
      'assigns and reads back correctly, and ' +
      `\`customElements.whenDefined('${tag}')\` never resolves.`,
    '',
    '```ts',
    "import '@kitn.ai/ui/elements';",
    ...(entry ? [`import '@kitn.ai/ui/elements/${entry}'; // or just this one`] : []),
    '```',
  );
  if (iface) {
    lines.push(
      '',
      `TypeScript: \`import type { ${iface} } from '@kitn.ai/ui/elements';\` — ` +
        'the element interface ships with the package; do not hand-roll a structural type.',
    );
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: PASS, with no previously-passing test now failing.

- [ ] **Step 6: Prove the entry map is right for every element, not just the two tested**

Run:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui && node -e "
const fs=require('fs');
const tags=JSON.parse(fs.readFileSync('src/elements/element-manifest.json','utf8')).tags;
const files=new Set(fs.readdirSync('dist/elements').filter(f=>f.endsWith('.js')).map(f=>f.replace(/\.js\$/,'')));
const bad=Object.entries(tags).filter(([,e])=>!files.has(e));
console.log(bad.length===0?'OK: every mapped entry exists in dist/elements':'BROKEN: '+JSON.stringify(bad));
"
```
Expected: `OK: every mapped entry exists in dist/elements`. If it reports BROKEN, the map and the build disagree — stop and report rather than working around it.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/agent-tooling/mcp/manifest.ts packages/ui/src/agent-tooling/mcp/tools/reference.ts packages/ui/src/agent-tooling/mcp/reference.test.ts
git commit -m "feat(mcp): component_reference says how to make the element exist

An element that never upgrades renders nothing and logs nothing, and
whenDefined() never resolves. The reference described 39 KB of API and
never named the registration import."
```

---

### Task 2: Put the payload on the event

`### Events` lists nine events for `kai-chat` as prose with no payload. The CEM already carries each one fully typed — `kai-submit` is `CustomEvent<{ value: string; attachments: {...}[] }>` in `type.text` — and the renderer discards it.

**Files:**
- Modify: `packages/ui/src/agent-tooling/mcp/tools/reference.ts:514-521`
- Test: `packages/ui/src/agent-tooling/mcp/reference.test.ts`

**Interfaces:**
- Consumes: `el.events[].type.text`, of the form `CustomEvent<PAYLOAD>` (or occasionally a bare payload).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```ts
  it('gives every event its payload shape, not just a sentence', async () => {
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { type: string; text: string }[])[0].text;

    const events = text.slice(
      text.indexOf('### Events'),
      text.indexOf('### Methods'),
    );
    // the payload, unwrapped from CustomEvent<...>
    expect(events).toMatch(/kai-submit/);
    expect(events).toMatch(/value: string/);
    expect(events).not.toMatch(/CustomEvent</); // unwrapped, not raw

    // no event may be listed without a detail, since the manifest types all of them
    const listed = events.split('\n').filter((l) => l.startsWith('- **kai-'));
    expect(listed.length).toBeGreaterThan(0);
    for (const line of listed) {
      expect(line, `event line carries no detail: ${line}`).toMatch(/`detail`:/);
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts -t 'payload shape'`
Expected: FAIL — `value: string` absent, and every event line missing `` `detail`: ``.

- [ ] **Step 3: Implement**

Add above `formatReference` in `reference.ts`:

```ts
/**
 * The payload out of `CustomEvent<T>`. The manifest types every event, but as the
 * wrapper — printing that raw teaches a reader to write `CustomEvent<...>` where a
 * payload belongs. A type that is not wrapped is returned unchanged.
 */
function eventDetail(typeText: string | undefined): string | undefined {
  const t = typeText?.trim();
  if (!t) return undefined;
  const m = /^CustomEvent<([\s\S]*)>$/.exec(t);
  return (m ? m[1] : t).trim() || undefined;
}
```

Then replace the loop body at lines 517-520:

```ts
    for (const ev of events) {
      const desc = ev.description?.trim() ?? '';
      const detail = eventDetail(ev.type?.text);
      lines.push(
        detail
          ? `- **${ev.name}** — ${desc} \`detail\`: \`${detail}\``
          : `- **${ev.name}** — ${desc}`,
      );
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/mcp/tools/reference.ts packages/ui/src/agent-tooling/mcp/reference.test.ts
git commit -m "feat(mcp): put each event's payload shape on the event

The manifest types all of them; the renderer printed only the sentence."
```

---

### Task 3: Make the element list discoverable

`component_reference`'s `name` parameter has no description and no enum, so nothing tells a caller that omitting it returns the index. The index already exists — it is unreachable by anyone who does not already know.

**Files:**
- Modify: `packages/ui/src/agent-tooling/mcp/tools/reference.ts:597-606`
- Test: `packages/ui/src/agent-tooling/mcp/reference.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('tells the caller, in the schema, how to discover what exists', async () => {
    const shape = (reference.inputSchema as unknown as {
      shape: { name: { description?: string } };
    }).shape;
    const desc = shape.name.description ?? '';
    expect(desc).toMatch(/omit/i);
    expect(desc).toMatch(/list/i);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts -t 'how to discover'`
Expected: FAIL — description is `undefined`, so the string is empty.

If `reference.inputSchema` is not a zod object at runtime and the cast throws, read how `verify:tool-schemas` inspects schemas and follow that instead; do not weaken the assertion to make it pass.

- [ ] **Step 3: Implement**

```ts
    name: z
      .string()
      .optional()
      .describe(
        'The element tag, e.g. "kai-chat". Omit it (or pass "list") to get the ' +
          'index of every element with a one-line summary, then ask again for the one you want.',
      ),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/mcp/tools/reference.ts packages/ui/src/agent-tooling/mcp/reference.test.ts
git commit -m "feat(mcp): describe the name parameter so the element index is reachable"
```

---

### Task 4: Stop repeating the universal records on every element

Measured on this tree: `kai-chat.md` and `kai-conversations.md` share **156 identical non-empty lines, ~18 KB**. That is paid on every one of 80 lookups. The demo settled the open question about payload size — the problem was never length, it was absence — so this task removes duplication **without removing any fact**.

**Files:**
- Modify: `packages/ui/src/agent-tooling/mcp/tools/reference.ts`
- Test: `packages/ui/src/agent-tooling/mcp/reference.test.ts`

**Interfaces:**
- Consumes: `catalogSectionLines(tag)` at `reference.ts:374` and `coverageSummary` (already exported).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```ts
  it('does not repeat the same universal block on every element', async () => {
    const a = (await reference.handler({ name: 'kai-chat' }))
      .content as { text: string }[];
    const b = (await reference.handler({ name: 'kai-conversations' }))
      .content as { text: string }[];

    const linesB = new Set(b[0].text.split('\n'));
    const shared = a[0].text
      .split('\n')
      .filter((l) => l.trim().length > 0 && linesB.has(l));
    const sharedBytes = shared.join('\n').length;

    // was ~18 KB before this task. The budget is deliberately generous: headings
    // and the contract note SHOULD repeat. What must not repeat is bulk prose.
    expect(sharedBytes).toBeLessThan(6000);
  });

  it('still states every invariant that applies to the element', async () => {
    const out = await reference.handler({ name: 'kai-chat' });
    const text = (out.content as { text: string }[])[0].text;
    for (const inv of invariants.filter((i) => applies(i, 'kai-chat'))) {
      expect(text, `invariant missing: ${inv.id}`).toMatch(inv.id);
    }
  });
```

Define `applies` in the test file next to the new tests, reusing whatever predicate `invariantsFor` uses in `reference.ts` (read it at line 250 and mirror it — do not guess the scoping rule).

- [ ] **Step 2: Run the tests to verify the first fails and the second passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: the dedup test FAILS at roughly 18000; the invariant-coverage test PASSES. **The second passing now is the point** — it is the control that proves the next step removes bytes without removing facts.

- [ ] **Step 3: Implement**

Read `catalogSectionLines` (line 374) and `exampleLines` (line 319) first. The bulk is the invariant bodies: statement plus wrong/right examples, repeated in full on every element the invariant applies to.

Replace the full body with a one-line statement plus the id, and emit the long-form examples **once** under a single trailing section. Do not delete any invariant, any id, any `enforcedBy` tag, or any example — move them. The second test above fails if an id disappears.

- [ ] **Step 4: Run the full reference suite**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: PASS, both new tests and every pre-existing one.

- [ ] **Step 5: Confirm the drift lint still resolves every claim**

Run: `pnpm --filter @kitn.ai/ui run lint:catalog-drift`
Expected: exit 0, `71` self-test cases, recipes/invariants/inventory rows resolved clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/agent-tooling/mcp/tools/reference.ts packages/ui/src/agent-tooling/mcp/reference.test.ts
git commit -m "perf(mcp): state each invariant once, not in full on all 80 elements

Removes ~18 KB of duplication per lookup pair without dropping a fact;
the invariant-coverage test is the control that proves it."
```

---

### Task 5: Wire every component the scaffold emits

`scaffold` accepts a multi-component surface, emits `<kai-conversations>` into the markup, and produces a `main.ts` that mentions it **zero** times — no `conversations` property, no `kai-conversation-select` listener, no thread map. Paste it verbatim and you get a working chat beside an empty grey rail, with no error and no clue. The wiring it omits already exists as prose in `component_reference`'s `workspace-chat` recipe.

**Files:**
- Modify: `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts`
- Test: `packages/ui/src/agent-tooling/mcp/scaffold.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the existing scaffold suite (match its existing call style — read a neighbouring test first):

```ts
  it('does not emit a component it leaves unwired', async () => {
    const out = await scaffold.handler({
      components: ['kai-chat', 'kai-conversations'],
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;

    expect(text).toMatch(/kai-conversations/); // it is in the markup
    // ...so it must also be wired, or explicitly declared unwired
    const wired =
      /\.conversations\s*=/.test(text) &&
      /kai-conversation-select/.test(text);
    const declared = /NOT WIRED/.test(text);
    expect(
      wired || declared,
      'kai-conversations is emitted with neither wiring nor a NOT WIRED notice',
    ).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/scaffold.test.ts -t 'unwired'`
Expected: FAIL — neither wiring nor a notice is present.

- [ ] **Step 3: Implement**

Preferred: emit the wiring — set `el.conversations`, add a `kai-conversation-select` listener that swaps `kai-chat.messages` from a thread map, and track `activeId`. The `workspace-chat` recipe already states the contract (`detail is {id}`).

Minimum acceptable if the emitted-code surface makes full wiring too large for one task: emit an honest notice naming exactly what is missing —

```
<!-- NOT WIRED: kai-conversations needs el.conversations (a JS property) and a
     kai-conversation-select listener that sets kai-chat.messages. See the
     workspace-chat recipe via the component_reference MCP tool. -->
```

**Do not** emit a bare "wire data props" comment; that is what shipped and it is what the demo followed into an empty rail.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/scaffold.test.ts`
Expected: PASS.

- [ ] **Step 5: Compile the emitted code**

Run: `pnpm --filter @kitn.ai/ui run verify:scaffold`
Expected: exit 0. Read the cell counts it prints; they must not drop. This gate compiles the emitted front ends with `tsc --strict`, so it is what catches wiring that reads well and does not typecheck.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/agent-tooling/mcp/tools/scaffold.ts packages/ui/src/agent-tooling/mcp/scaffold.test.ts
git commit -m "fix(scaffold): wire every component it emits, or say plainly that it did not"
```

---

## Final verification (after all tasks)

- [ ] **Full gate set** — each run separately, `verify:generated` never alongside a vitest run:

```bash
pnpm --filter @kitn.ai/ui run typecheck
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run lint:catalog-drift
pnpm --filter @kitn.ai/ui run verify:scaffold
pnpm --filter @kitn.ai/ui run verify:pack
```

- [ ] **The acceptance criterion: re-run the demo.** Rebuild (`npx nx build ui --skip-nx-cache`), then repeat the 2026-08-18 procedure exactly — a sandbox whose installed `@kitn.ai/ui` has every `.ts`/`.tsx`/`.css` deleted from `src/`, and a fresh agent that builds a chat app with a conversations sidebar using ONLY the MCP over stdio.

  **Two things make this measurement valid, and both were nearly missed last time:**
  1. **Build first, and record the bundle's SHA-256 before and after the run.** The prior demo measured a `dist/` built 15 hours stale and its top three findings were exactly what the fix had already added.
  2. **The measuring agent must NOT receive the project `CLAUDE.md`**, which states four of the seven invariants. Subagents inherit it by default. Contamination inflates the "got it right" column, so it cannot manufacture an absence — but it voids every "the MCP taught me this" claim.

  **Pass condition:** the agent does not hit gaps 1-4 (registration, TS interface, event payloads, discovery). Gaps it *does* hit are iteration 1's real output — they are the input to the next iteration, not a failure.

## Self-Review

- **Spec coverage:** spec items 1+2 → Task 1; item 3 → Task 2; item 4 → Task 3; item 5 → Task 4; item 6 → Task 5. All six covered.
- **Placeholders:** none. Every code step carries real code. Two steps deliberately say "read X first and mirror it" rather than guessing a predicate or a file's caching style — that is an instruction to derive, not a placeholder.
- **Type consistency:** `entryForTag` is defined in Task 1 and used only there. `eventDetail` is local to Task 2. `coverageSummary` and `invariantsFor` are pre-existing and unchanged.
