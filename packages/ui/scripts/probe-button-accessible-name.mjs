/**
 * Measure the ACCESSIBLE NAME chromium computes for the kit's `label`-prop
 * family — `<kai-button>`, `<kai-menu>`, `<kai-checkpoint>` — across every
 * combination of visible text and the `label` prop.
 *
 * WHY THIS EXISTS: `kai-button`'s `label` is documented as "REQUIRED for
 * icon-only buttons; ignored when you slot visible text", but the facade
 * applied `aria-label` unconditionally. Whether that is a code bug or a stale
 * sentence cannot be settled by reading either side — "accessible name" is
 * COMPUTED from the FLATTENED tree (slotted light-DOM text is a child of the
 * shadow `<button>` for naming purposes), and jsdom has no accessibility tree
 * at all, so no unit test can see it. This reads chromium's own AX tree over
 * CDP (Accessibility.getFullAXTree), joined to the DOM by backendNodeId so each
 * control is identified structurally rather than by document order.
 *
 *   node scripts/probe-button-accessible-name.mjs [--headed]
 *
 * The WCAG stake is 2.5.3 Label in Name: the accessible name must contain the
 * visible text. A speech-input user says what they see, so a button reading
 * "Save" whose accessible name is "Submit" cannot be activated by voice at all.
 *
 * The sibling elements are in the table because an inconsistency across the
 * family is worse than either behaviour alone: `kai-checkpoint` already drops
 * `aria-label` when its label is visible, so the kit HAS decided this once.
 *
 * READ THE ICON-ONLY ROWS BEFORE TRUSTING A FIX. Suppressing `aria-label`
 * whenever anything is slotted leaves icon-only controls NAMELESS, which is a
 * worse defect than the one being fixed. Rows `icon-only`, `icon-slotted-svg`
 * and `icon-size-suppresses-slot` are the guard on the guard: `icon`/`icon-sm`
 * do not render the default slot at all, so text slotted into one is invisible
 * and `label` must still win there.
 *
 * Exits 1 when any row's measured name differs from EXPECT. EXPECT encodes the
 * DOCUMENTED contract, so on an unfixed tree the `both-*` rows go red and the
 * icon rows stay green — that split is the diagnosis.
 */
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Each case: the markup, what a sighted user READS on the button, and the
 * accessible name the documented contract implies. `visible: null` means there
 * is no visible text — the icon-only shape, where `label` is the only name
 * available and MUST be emitted.
 */
const CASES = [
  {
    id: 'slotted-only',
    what: 'slotted text only, no label prop',
    html: '<kai-button>Save</kai-button>',
    visible: 'Save',
    expect: 'Save',
  },
  {
    id: 'icon-only',
    what: 'label only, icon size (the documented icon-only shape)',
    html: '<kai-button size="icon" icon="mic" label="Voice input"></kai-button>',
    visible: null,
    expect: 'Voice input',
  },
  {
    id: 'label-only-text-size',
    what: 'label only, default size, nothing slotted',
    html: '<kai-button label="Voice input"></kai-button>',
    visible: null,
    expect: 'Voice input',
  },
  {
    id: 'both-agreeing',
    what: 'slotted text + label saying the same thing',
    html: '<kai-button label="Save">Save</kai-button>',
    visible: 'Save',
    expect: 'Save',
  },
  {
    id: 'both-disagreeing',
    what: 'slotted text + label saying something ELSE (the WCAG 2.5.3 case)',
    html: '<kai-button label="Submit">Save</kai-button>',
    visible: 'Save',
    expect: 'Save',
  },
  {
    id: 'both-superset',
    what: 'slotted text + a label that CONTAINS it ("Save changes" / "Save")',
    html: '<kai-button label="Save changes">Save</kai-button>',
    visible: 'Save',
    expect: 'Save',
  },
  {
    id: 'icon-slotted-svg',
    what: 'label + a slotted SVG in the NAMED icon slot (the docstring example)',
    html: '<kai-button label="Ship"><svg slot="icon" viewBox="0 0 24 24" width="16" height="16"><path d="M2 2h20v20H2z"/></svg></kai-button>',
    visible: null,
    expect: 'Ship',
  },
  {
    id: 'icon-size-suppresses-slot',
    what: 'icon size + label + text slotted anyway (the size hides the slot, so the text is NOT visible)',
    html: '<kai-button size="icon" icon="mic" label="Voice input">Talk</kai-button>',
    visible: null,
    expect: 'Voice input',
  },
  {
    id: 'icon-prop-plus-text',
    what: 'leading icon prop + slotted text + a disagreeing label',
    html: '<kai-button icon="plus" label="Create item">New</kai-button>',
    visible: 'New',
    expect: 'New',
  },
  {
    id: 'whitespace-slot',
    what: 'label + only whitespace slotted (whitespace is not visible text)',
    html: '<kai-button label="Voice input">   \n  </kai-button>',
    visible: null,
    expect: 'Voice input',
  },

  // ── the siblings, for family consistency ─────────────────────────────────
  // kai-checkpoint already resolves this the documented way (it drops
  // aria-label when its label is visible); kai-menu is the one to compare
  // against, since its `label` is documented "for an icon-only trigger".
  {
    id: 'menu:icon-only',
    tag: 'kai-menu',
    what: 'kai-menu, icon-only trigger named by label',
    html: '<kai-menu label="Open menu"></kai-menu>',
    visible: null,
    expect: 'Open menu',
  },
  {
    id: 'menu:trigger-label-only',
    tag: 'kai-menu',
    what: 'kai-menu, visible triggerLabel, no label prop',
    html: '<kai-menu trigger-label="High"></kai-menu>',
    visible: 'High',
    expect: 'High',
  },
  {
    id: 'menu:both-disagreeing',
    tag: 'kai-menu',
    what: 'kai-menu, visible triggerLabel + a disagreeing label prop',
    html: '<kai-menu trigger-label="High" label="Reasoning effort"></kai-menu>',
    visible: 'High',
    expect: 'High',
  },
  {
    id: 'menu:slotted-trigger',
    tag: 'kai-menu',
    what: 'kai-menu, slotted visible trigger + a disagreeing label prop',
    html: '<kai-menu label="Reasoning effort"><span slot="trigger">High</span></kai-menu>',
    visible: 'High',
    // NOT 'High'. `slot="trigger"` is documented as VISUAL content — a `+`, an
    // `<svg>` — and `label` is documented as the name for it, so the override is
    // the contract here and the element's own docstring example
    // (`<span slot="trigger">+</span>` named "Open menu") depends on it. A glyph
    // cannot be told from a word programmatically, and guessing would silently
    // rename that example "+".
    expect: 'Reasoning effort',
    // ...but the risk is real when the consumer slots a WORD, so it is printed
    // rather than absorbed. Changing `expect` to make a row green is how a check
    // stops proving anything; this field is the alternative.
    openRisk:
      'UNRESOLVED: slotting a real word into slot="trigger" while setting `label` still ' +
      'breaks WCAG 2.5.3, and the element cannot tell that word from a glyph. Documented ' +
      'on the `label` prop, not enforced. A lint/dev-warning is the plausible fix.',
  },
  {
    id: 'checkpoint:icon-only',
    tag: 'kai-checkpoint',
    what: 'kai-checkpoint, icon-only, named by tooltip',
    html: '<kai-checkpoint tooltip="Restore checkpoint"></kai-checkpoint>',
    visible: null,
    expect: 'Restore checkpoint',
  },
  {
    id: 'checkpoint:visible-label',
    tag: 'kai-checkpoint',
    what: 'kai-checkpoint, visible label + a disagreeing tooltip (already resolved the documented way)',
    html: '<kai-checkpoint label="Checkpoint 3" tooltip="Restore checkpoint"></kai-checkpoint>',
    visible: 'Checkpoint 3',
    expect: 'Checkpoint 3',
  },
];

/** The element modules the cases need, deduped. */
const TAGS = [...new Set(CASES.map((c) => c.tag ?? 'kai-button'))];
const MODULE_OF = {
  'kai-button': '/src/elements/button.tsx',
  'kai-menu': '/src/elements/menu.tsx',
  'kai-checkpoint': '/src/elements/checkpoint.tsx',
};

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>kai label-prop accessible names</title></head>
<body>
  <main>
${CASES.map((c) => {
  const tag = c.tag ?? 'kai-button';
  return `    <div data-case="${c.id}">${c.html.replace(new RegExp(`<${tag}`), `<${tag} data-case-host="${c.id}"`)}</div>`;
}).join('\n')}
  </main>

  <script type="module">
    let error = null;
    try {
${TAGS.map((t) => `      await import('${MODULE_OF[t]}');`).join('\n')}
    } catch (e) { error = String((e && e.stack) || e); }

    await Promise.all(${JSON.stringify(TAGS)}.map((t) => customElements.whenDefined(t).catch(() => {})));
    // Let solid render and the shadow stylesheet adopt.
    await new Promise((r) => setTimeout(r, 500));

    // Tag the INNER <button> (the thing that actually carries the role) with the
    // case id, so the CDP join keys on something we chose rather than on order.
    const seen = {};
    for (const host of document.querySelectorAll('[data-case-host]')) {
      const id = host.getAttribute('data-case-host');
      const btn = host.shadowRoot?.querySelector('button');
      if (btn) btn.setAttribute('data-probe', id);
      const defaultSlot = host.shadowRoot?.querySelector('slot:not([name])');
      // What a sighted user READS. innerText on the shadow button does NOT
      // flatten slot assignments, so read the assigned nodes directly (plus any
      // shadow-rendered text) instead — a "" here next to visible text would be
      // an artefact of the measurement, not a finding.
      const shadowText = btn ? [...btn.childNodes]
        .filter((n) => n.nodeName !== 'SLOT')
        .map((n) => (n.textContent || '').trim()).join(' ').trim() : '';
      const slotText = defaultSlot
        ? defaultSlot.assignedNodes({ flatten: true }).map((n) => (n.textContent || '').trim()).join(' ').trim()
        : '';
      seen[id] = {
        found: !!btn,
        ariaLabel: btn ? btn.getAttribute('aria-label') : null,
        renderedText: [shadowText, slotText].filter(Boolean).join(' '),
        // Whether the default slot is even rendered at this size.
        defaultSlotRendered: !!defaultSlot,
      };
    }

    window.__probe = { error, seen };
  </script>
</body></html>`;

function servePage() {
  return {
    name: 'probe-page',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?')) {
          server.transformIndexHtml(req.url, PAGE).then((html) => {
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          }, next);
          return;
        }
        next();
      });
    },
  };
}

const server = await createServer({
  root,
  configFile: false,
  plugins: [servePage(), solidPlugin()],
  server: { port: 0, strictPort: false },
  logLevel: 'warn',
});
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__probe, null, { timeout: 60_000 });
const probe = await page.evaluate(() => window.__probe);

if (probe.error) {
  console.error('module import failed:\n' + probe.error);
  await browser.close();
  await server.close();
  process.exit(2);
}

// --- the AX read -----------------------------------------------------------
// `pierce: true` walks shadow roots, the only way to reach the inner <button>;
// the AX tree references the same backendNodeId, so a button is matched by
// identity rather than by index into a tree whose shape can change.
const cdp = await page.context().newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('Accessibility.enable');

const { root: domRoot } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
const byBackendId = new Map();
(function walk(node) {
  const attrs = {};
  for (let i = 0; i < (node.attributes?.length ?? 0); i += 2) attrs[node.attributes[i]] = node.attributes[i + 1];
  byBackendId.set(node.backendNodeId, { name: node.nodeName, attrs });
  for (const child of node.children ?? []) walk(child);
  for (const sr of node.shadowRoots ?? []) walk(sr);
  if (node.contentDocument) walk(node.contentDocument);
})(domRoot);

const { nodes: axNodes } = await cdp.send('Accessibility.getFullAXTree');
const axByBackendId = new Map();
for (const n of axNodes) if (n.backendDOMNodeId != null) axByBackendId.set(n.backendDOMNodeId, n);

await browser.close();
await server.close();

// --- report ----------------------------------------------------------------
let failed = 0;
const rows = [];

for (const c of CASES) {
  const dom = probe.seen[c.id];
  if (!dom?.found) {
    failed++;
    rows.push({ c, ok: false, axName: '(no inner <button>)', axRole: '-', dom: null });
    continue;
  }

  const entry = [...byBackendId.entries()].find(([, v]) => v.attrs['data-probe'] === c.id);
  if (!entry) {
    failed++;
    rows.push({ c, ok: false, axName: '(not in pierced DOM)', axRole: '-', dom });
    continue;
  }

  const ax = axByBackendId.get(entry[0]);
  const axRole = ax?.role?.value ?? '(absent from AX tree)';
  const axName = ax?.name?.value ?? '';
  const axFrom = ax?.name?.sources?.find((s) => s.superseded !== true && s.value != null)?.type ?? '?';

  // The contract: the measured name must equal the documented one, AND (WCAG
  // 2.5.3) whenever there IS visible text the name must contain it. A row with
  // a declared `openRisk` is exempt from the WCAG half ONLY because the risk is
  // reported instead — see the summary printed after the table.
  const nameMatches = axName === c.expect;
  const labelInName = c.visible == null || axName.toLowerCase().includes(c.visible.toLowerCase());
  const ok = axRole === 'button' && nameMatches && (labelInName || !!c.openRisk);
  if (!ok) failed++;

  rows.push({ c, ok, axName, axRole, axFrom, dom, labelInName });
}

const pad = (s, n) => String(s).padEnd(n);
console.log('');
console.log(`${pad('case', 30)}${pad('visible', 16)}${pad('aria-label attr', 22)}${pad('AX name', 22)}${pad('from', 12)}ok`);
console.log('-'.repeat(106));
for (const r of rows) {
  console.log(
    pad(r.c.id, 30) +
    pad(JSON.stringify(r.c.visible), 16) +
    pad(JSON.stringify(r.dom?.ariaLabel ?? null), 22) +
    pad(JSON.stringify(r.axName), 22) +
    pad(r.axFrom ?? '-', 12) +
    (r.ok ? (r.c.openRisk ? 'PASS*' : 'PASS') : 'FAIL')
  );
}

// Printed whether or not the run is green: a known-and-documented breach that
// stops being visible is indistinguishable from one that was fixed.
const risky = rows.filter((r) => r.c.openRisk && r.labelInName === false);
if (risky.length) {
  console.log('');
  for (const r of risky) {
    console.log(`PASS* ${r.c.id} — passes the DOCUMENTED contract, still carries a WCAG 2.5.3 risk`);
    console.log(`      html   ${r.c.html}`);
    console.log(`      name   ${JSON.stringify(r.axName)} does not contain the visible ${JSON.stringify(r.c.visible)}`);
    console.log(`      ${r.c.openRisk}`);
  }
}

console.log('');
for (const r of rows.filter((x) => !x.ok)) {
  console.log(`FAIL  ${r.c.id} — ${r.c.what}`);
  console.log(`      html            ${r.c.html}`);
  console.log(`      AX role         ${JSON.stringify(r.axRole)}`);
  console.log(`      AX name         ${JSON.stringify(r.axName)}`);
  console.log(`      documented name ${JSON.stringify(r.c.expect)}`);
  if (r.c.visible != null && r.labelInName === false) {
    console.log(`      WCAG 2.5.3      visible text ${JSON.stringify(r.c.visible)} is NOT contained in the accessible name`);
  }
  console.log(`      rendered text   ${JSON.stringify(r.dom?.renderedText ?? null)}  default slot rendered: ${r.dom?.defaultSlotRendered}`);
}

if (pageErrors.length) console.log('\npage errors:\n  ' + pageErrors.join('\n  '));
console.log(`\n${rows.length - failed}/${rows.length} cases match the documented contract.`);
process.exit(failed ? 1 : 0);
