/**
 * Measure the ACCESSIBLE ROLE AND NAME of a message row as a consumer actually
 * gets it — through a populated `<kai-thread>` and `<kai-chat>`, not through
 * `<Message>` rendered on its own.
 *
 * WHY THIS EXISTS: `Message` gained `role="article"` + a speaker `aria-label` in
 * c80080e, and that fix was verified on `Message` in ISOLATION — rendered
 * directly, role asserted, axe clean. Neither `Thread` nor `ChatThread` passed
 * `role` when rendering the list, so every row a real consumer sees stayed an
 * unlabelled generic div. Verifying a mechanism is not verifying the thing that
 * uses it, and this probe is the difference: it drives the composed path.
 *
 * WHY A REAL BROWSER: "accessible role" and "accessible name" are COMPUTED, not
 * attributes. jsdom has no accessibility tree at all, so a jsdom assertion can
 * only ever check the markup we wrote and never what a screen reader would be
 * handed. This reads chromium's own AX tree via CDP
 * (Accessibility.getFullAXTree), joined to the DOM by backendNodeId so each row
 * is identified structurally rather than by position, and then runs axe-core
 * over the populated element.
 *
 *   node scripts/probe-thread-row-semantics.mjs [--headed]
 *
 * Exits 1 when any row lacks a speaker role or name, or when axe reports an ARIA
 * violation. Run it with the fix reverted to watch it go red: every row reports
 * AX role "none", AX name "", ignored=true (uninteresting).
 *
 * READ THIS BEFORE TRUSTING THE AXE LINE. Axe is NOT what catches this defect,
 * and it was measured saying so: with the fix reverted, all four ARIA rules
 * below report 0 violations on both elements while every row is unlabelled. Axe
 * has no rule for "a message row ought to name its speaker" — it can only judge
 * a role that is PRESENT and wrong, which is the c80080e defect (`role="user"`
 * on a div), not this one. The axe run is kept as a regression guard against
 * reintroducing THAT, and the load-bearing check here is the AX-tree read above
 * it. A green axe line on its own means nothing; do not cite it as coverage.
 */
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const axeSource = readFileSync(
  path.join(root, '..', '..', 'node_modules', 'axe-core', 'axe.min.js'),
  'utf-8',
);

// Two speakers, so the probe reads the NAME and not merely the presence of one.
// A fix that hardcoded a single label would pass a one-message page.
const MESSAGES = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'What is the capital of France?' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Paris.' }] },
  // With an avatar, because that is the OTHER <Message> call site in both
  // components — a fix applied to only the fallback branch must not pass here.
  { id: 'm3', role: 'user', avatar: { fallback: 'RT' }, parts: [{ type: 'text', text: 'Thanks.' }] },
];

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>thread row semantics</title></head>
<body>
  <main>
    <div style="height:400px;width:700px"><kai-thread id="th"></kai-thread></div>
    <div style="height:500px;width:700px"><kai-chat id="ch"></kai-chat></div>
  </main>

  <script type="module">
    let error = null;
    try {
      await import('/src/elements/thread.tsx');
      await import('/src/elements/chat.tsx');
    } catch (e) { error = String((e && e.stack) || e); }

    const messages = ${JSON.stringify(MESSAGES)};
    document.getElementById('th').messages = messages;
    document.getElementById('ch').messages = messages;

    // Let solid render and the stick-to-bottom primitive settle.
    await new Promise((r) => setTimeout(r, 800));

    // Tag every row with a stable id BEFORE the AX read, so the CDP join keys on
    // something we chose rather than on document order.
    const tag = (hostId) => {
      const host = document.getElementById(hostId);
      const rows = [...(host.shadowRoot?.querySelectorAll('[part="row"]') ?? [])];
      rows.forEach((r, i) => r.setAttribute('data-probe', hostId + ':' + i));
      return rows.length;
    };

    window.__probe = { error, rows: { th: tag('th'), ch: tag('ch') } };
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
// `pierce: true` walks shadow roots, which is the only way to reach the rows;
// the map it builds is backendNodeId -> the attributes we tagged, and the AX
// tree references the same backendNodeId. Joining on it means a row is matched
// by identity, never by index into a tree whose shape can change.
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

// --- axe over each populated element ---------------------------------------
await page.addScriptTag({ content: axeSource });
const axeResults = await page.evaluate(async () => {
  const out = {};
  for (const id of ['th', 'ch']) {
    const results = await window.axe.run(document.getElementById(id), {
      runOnly: { type: 'rule', values: ['aria-roles', 'aria-allowed-role', 'aria-prohibited-attr', 'aria-valid-attr-value'] },
    });
    out[id] = {
      violations: results.violations.map((v) => `${v.id} [${v.impact}]: ${v.nodes.map((n) => n.failureSummary?.trim().replace(/\s+/g, ' ')).join(' | ')}`),
      passes: results.passes.map((p) => p.id),
    };
  }
  return out;
});

await browser.close();
await server.close();

// --- report ----------------------------------------------------------------
const HOSTS = { th: '<kai-thread>', ch: '<kai-chat>' };
const WANT_NAME = { user: 'User message', assistant: 'Assistant message' };

let failed = 0;
let checked = 0;

for (const [hostId, hostLabel] of Object.entries(HOSTS)) {
  console.log(`\n${hostLabel} — ${probe.rows[hostId]} row(s)`);
  if (probe.rows[hostId] !== MESSAGES.length) {
    failed++;
    console.log(`  FAIL  expected ${MESSAGES.length} rows, found ${probe.rows[hostId]} — the probe is not reading what it thinks it is`);
    continue;
  }

  for (let i = 0; i < MESSAGES.length; i++) {
    const key = `${hostId}:${i}`;
    const entry = [...byBackendId.entries()].find(([, v]) => v.attrs['data-probe'] === key);
    if (!entry) { failed++; console.log(`  FAIL  row ${i}: not found in the pierced DOM`); continue; }

    const [backendNodeId, dom] = entry;
    const ax = axByBackendId.get(backendNodeId);
    const axRole = ax?.role?.value ?? '(absent from AX tree)';
    const axName = ax?.name?.value ?? '';
    const axIgnored = ax?.ignored === true;
    const axIgnoredWhy = (ax?.ignoredReasons ?? []).map((r) => r.name).join(',');
    const speaker = MESSAGES[i].role;
    const wantName = WANT_NAME[speaker];
    const avatar = MESSAGES[i].avatar ? ' (avatar branch)' : '';

    const ok = axRole === 'article' && axName === wantName;
    checked++;
    if (!ok) failed++;

    console.log(`  ${ok ? 'PASS' : 'FAIL'}  row ${i} — ${speaker}${avatar}`);
    console.log(`        DOM   role=${JSON.stringify(dom.attrs.role ?? null)} aria-label=${JSON.stringify(dom.attrs['aria-label'] ?? null)} data-role=${JSON.stringify(dom.attrs['data-role'] ?? null)}`);
    console.log(`        AX    role=${JSON.stringify(axRole)} name=${JSON.stringify(axName)} ignored=${axIgnored}${axIgnoredWhy ? ` (${axIgnoredWhy})` : ''}`);
    if (!ok) console.log(`        want  AX role "article" and AX name ${JSON.stringify(wantName)}`);
  }

  const axe = axeResults[hostId];
  if (axe.violations.length) {
    failed++;
    console.log(`  FAIL  axe: ${axe.violations.length} violation(s)`);
    for (const v of axe.violations) console.log(`        ${v}`);
  } else {
    // Deliberately not called a PASS: this line is green with the fix reverted
    // too (measured). See the note at the top of the file.
    console.log(`  ---   axe: 0 ARIA violations (ran: ${axe.passes.join(', ') || 'no rule had applicable nodes'}) — cannot see a MISSING role; not the check that catches this`);
  }
}

if (pageErrors.length) console.log('\npage errors:\n  ' + pageErrors.join('\n  '));
console.log(`\n${checked - Math.min(failed, checked)}/${checked} rows carry a speaker role and name.`);
process.exit(failed ? 1 : 0);
