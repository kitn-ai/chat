/**
 * Measure what an author-supplied HTML attribute is worth after `customElements.define()`
 * upgrades the elements the parser already produced.
 *
 * WHY A REAL BROWSER: the whole defect lives in native reflected IDL setters
 * (`Element.prototype.role`, `HTMLElement.prototype.hidden`,
 * `HTMLElement.prototype.autofocus`). jsdom implements the first two and NOT the
 * third, so a jsdom-only reading would silently under-report — it cannot see the
 * `autofocus` case at all. This probe reads chromium.
 *
 * WHY PARSED HTML AND NOT createElement: the bug is specifically the upgrade of
 * elements that are ALREADY in the document when `define()` runs. `createElement`
 * after registration constructs against a prototype that already carries the
 * facade's own accessors, so it cannot reproduce anything.
 *
 *   node scripts/probe-upgrade-attribute-loss.mjs [--headed]
 *
 * Exits 1 when any case has lost the author's value. Run it with the fix reverted
 * to watch it go red; the three FAIL rows are the defect.
 */
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// The markup is PARSED first; the module script (deferred by definition) then
// imports the element modules, whose top-level defineWebComponent() calls run
// customElements.define() and synchronously upgrade everything above.
const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>upgrade probe</title></head>
<body>
  <kai-message id="m" role="user">hello from the author</kai-message>

  <div style="height:200px;width:600px">
    <kai-resizable id="rz">
      <kai-resizable-item id="i0">visible panel</kai-resizable-item>
      <kai-resizable-item id="i1" hidden>hidden panel</kai-resizable-item>
    </kai-resizable>
  </div>

  <kai-confirm id="cf" autofocus></kai-confirm>

  <script type="module">
    const $ = (id) => document.getElementById(id);

    const before = {
      registered: !!customElements.get('kai-message'),
      roleAttr: $('m').getAttribute('role'),
      hiddenAttr: $('i1').getAttribute('hidden'),
      autofocusAttr: $('cf').getAttribute('autofocus'),
    };

    let error = null;
    try {
      await import('/src/elements/message.tsx');
      await import('/src/elements/resizable.tsx');
      await import('/src/elements/confirm-card.tsx');
    } catch (e) { error = String((e && e.stack) || e); }

    // Let solid render and the parent's readItems() settle.
    await new Promise((r) => setTimeout(r, 600));

    // A confirm card needs a definition to render any actions at all, and it has to
    // be handed over AFTER the upgrade: component-register's constructor assigns
    // undefined over every declared prop, which clobbers an object set on the
    // un-upgraded element. (A separate prop-before-upgrade wrinkle, not the
    // attribute defect — the autofocus ATTRIBUTE has to survive on its own, which
    // is what is being measured.)
    $('cf').data = { body: 'Delete it?', actions: [{ id: 'ok', label: 'OK', default: true }, { id: 'no', label: 'Cancel' }] };
    await new Promise((r) => setTimeout(r, 300));

    const row = $('m').shadowRoot?.querySelector('[role="article"]');
    const after = {
      error,
      registered: !!customElements.get('kai-message'),

      // --- role on <kai-message> -------------------------------------------
      // The facade deliberately keeps the speaker OFF the host as an ARIA role
      // (neither 'user' nor 'assistant' is a valid ARIA role), so the ATTRIBUTE
      // is expected to be gone either way. What must survive is the VALUE.
      roleAttr: $('m').getAttribute('role'),
      roleProp: $('m').role ?? null,
      rowLabel: row?.getAttribute('aria-label') ?? null,
      rowDataRole: row?.getAttribute('data-role') ?? null,

      // --- hidden on <kai-resizable-item> -----------------------------------
      hiddenAttr: $('i1').getAttribute('hidden'),
      hiddenProp: $('i1').hidden,
      hiddenDisplay: getComputedStyle($('i1')).display,
      hiddenSlot: $('i1').getAttribute('slot'),
      panelCount: $('rz').shadowRoot?.querySelectorAll('[data-panel]').length ?? -1,

      // --- autofocus on <kai-confirm> ---------------------------------------
      autofocusAttr: $('cf').getAttribute('autofocus'),
      autofocusProp: $('cf').autofocus,
      activeHost: document.activeElement?.tagName?.toLowerCase() ?? null,
      focusedAction: $('cf').shadowRoot?.activeElement?.getAttribute('data-action-id') ?? null,
    };

    window.__probe = { before, after };
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
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__probe, null, { timeout: 60_000 });
const { before, after } = await page.evaluate(() => window.__probe);
await browser.close();
await server.close();

if (after.error) {
  console.error('module import failed:\n' + after.error);
  process.exit(2);
}

// Each case: what the author wrote, what survived, and the pass condition.
const cases = [
  {
    name: 'role → <kai-message role="user">',
    before: `role attr ${JSON.stringify(before.roleAttr)} (registered: ${before.registered})`,
    after: `role attr ${JSON.stringify(after.roleAttr)} · el.role ${JSON.stringify(after.roleProp)} · row ${JSON.stringify(after.rowLabel)}`,
    ok: after.roleProp === 'user' && after.rowLabel === 'User message',
    want: `el.role "user" and the row labelled "User message" (the attribute is lifted off the host on purpose)`,
  },
  {
    name: 'hidden → <kai-resizable-item hidden>',
    before: `hidden attr ${JSON.stringify(before.hiddenAttr)}`,
    after: `hidden attr ${JSON.stringify(after.hiddenAttr)} · el.hidden ${JSON.stringify(after.hiddenProp)} · display ${after.hiddenDisplay} · slot ${JSON.stringify(after.hiddenSlot)} · panels ${after.panelCount}`,
    ok: after.hiddenAttr !== null && after.hiddenSlot === null && after.panelCount === 1,
    want: `the hidden attribute intact, the item unslotted, and ONE panel rendered`,
  },
  {
    name: 'autofocus → <kai-confirm autofocus>',
    before: `autofocus attr ${JSON.stringify(before.autofocusAttr)}`,
    after: `autofocus attr ${JSON.stringify(after.autofocusAttr)} · el.autofocus ${JSON.stringify(after.autofocusProp)} · focused ${JSON.stringify(after.focusedAction)}`,
    ok: after.autofocusAttr !== null && after.focusedAction === 'ok',
    want: `the autofocus attribute intact and the default action focused`,
  },
];

let failed = 0;
for (const c of cases) {
  const verdict = c.ok ? 'PASS' : 'FAIL';
  if (!c.ok) failed++;
  console.log(`\n${verdict}  ${c.name}`);
  console.log(`  before define(): ${c.before}`);
  console.log(`  after  define(): ${c.after}`);
  if (!c.ok) console.log(`  wanted         : ${c.want}`);
}
if (consoleErrors.length) console.log('\npage errors:\n  ' + consoleErrors.join('\n  '));
console.log(`\n${cases.length - failed}/${cases.length} cases kept the author's value.`);
process.exit(failed ? 1 : 0);
