import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const URL = 'http://localhost:8000/examples/demos/composable/index.html';
const AXE = readFileSync('./node_modules/axe-core/axe.min.js', 'utf-8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

async function runAxe(label) {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => {
    // axe traverses open shadow roots by default.
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    });
    // A target whose first entry is itself an array crosses a shadow boundary => inside a kit custom element.
    const inKit = (node) => Array.isArray(node.target?.[0]);
    const hostOf = (node) => {
      const t = node.target?.[0];
      return Array.isArray(t) ? t[0] : '(light-dom)';
    };
    const offenderClass = (node) => {
      const t = node.target?.[0];
      const sel = Array.isArray(t) ? t[t.length - 1] : t;
      return sel;
    };
    return r.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help,
      total: v.nodes.length,
      kit: v.nodes.filter(inKit).length,
      chrome: v.nodes.filter((n) => !inKit(n)).length,
      kitOffenders: [...new Set(v.nodes.filter(inKit).map((n) => `${hostOf(n)} :: ${offenderClass(n)}`))].slice(0, 12),
      chromeOffenders: [...new Set(v.nodes.filter((n) => !inKit(n)).map(offenderClass))].slice(0, 6),
    }));
  });
  console.log(`\n======== axe (${label}) — ${res.length} violation types ========`);
  for (const v of res) {
    console.log(`\n[${v.impact}] ${v.id} — ${v.help}`);
    console.log(`  nodes: ${v.total} total | KIT: ${v.kit} | showcase-chrome: ${v.chrome}`);
    if (v.kitOffenders.length) console.log('  KIT offenders:\n' + v.kitOffenders.map((o) => '    - ' + o).join('\n'));
    if (v.chromeOffenders.length) console.log('  chrome offenders: ' + v.chromeOffenders.join(' | '));
  }
  return res;
}

// LIGHT (elements default theme=auto; Playwright defaults to light color-scheme)
const light = await runAxe('light');
// DARK — emulate dark color-scheme AND set theme="dark" on every kitn element (how the showcase does it)
await page.emulateMedia({ colorScheme: 'dark' });
await page.evaluate(() => {
  document.documentElement.classList.add('dark'); document.documentElement.classList.remove('light');
  document.querySelectorAll('*').forEach((el) => { if (el.tagName.startsWith('KC-')) el.setAttribute('theme', 'dark'); });
});
await page.waitForTimeout(400);
const dark = await runAxe('dark');
await page.emulateMedia({ colorScheme: 'light' });
await page.evaluate(() => {
  document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light');
  document.querySelectorAll('*').forEach((el) => { if (el.tagName.startsWith('KC-')) el.setAttribute('theme', 'light'); });
});
await page.waitForTimeout(300);

// ---- KEYBOARD TAB-ORDER AUDIT ----
console.log('\n\n======== KEYBOARD TAB ORDER (first 50 tab stops) ========');
const deepActiveFn = () => {
  let el = document.activeElement;
  const path = [];
  while (el) {
    path.push(el.tagName.toLowerCase());
    if (el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    else break;
  }
  const label = el ? (el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim().slice(0, 28) || '(no name)') : '(none)';
  return { tag: el ? el.tagName.toLowerCase() : 'none', label, host: path[0], depth: path.length };
};

await page.evaluate(() => (document.activeElement && document.activeElement.blur && document.activeElement.blur()));
await page.evaluate(() => window.scrollTo(0, 0));
await page.mouse.click(640, 5); // focus near top of body
const stops = [];
for (let i = 0; i < 50; i++) {
  await page.keyboard.press('Tab');
  const a = await page.evaluate(deepActiveFn);
  stops.push(a);
}
stops.forEach((s, i) => console.log(`${String(i + 1).padStart(2)}. <${s.tag}> ${s.label}  [host:${s.host} depth:${s.depth}]`));

// ---- SPECIFIC: conversation-list interactive controls reachable by keyboard? ----
console.log('\n======== conversation-list controls (tabbable?) ========');
const clInfo = await page.evaluate(() => {
  const el = document.querySelector('kai-conversations');
  if (!el?.shadowRoot) return { __err: 'no kai-conversations' };
  const sr = el.shadowRoot;
  const focusables = [...sr.querySelectorAll('button, a, [tabindex], [role="button"], [role="menuitem"]')];
  return {
    count: focusables.length,
    items: focusables.map((f) => ({
      tag: f.tagName.toLowerCase(),
      name: f.getAttribute('aria-label') || (f.textContent || '').trim().slice(0, 24) || '(no name)',
      tabindex: f.getAttribute('tabindex'),
      disabled: f.hasAttribute('disabled'),
    })),
  };
});
console.log(JSON.stringify(clInfo, null, 2));

// ---- SPECIFIC: model-switcher dropdown trigger tabbable + opens via keyboard? ----
console.log('\n======== model-switcher trigger reachable & keyboard-openable? ========');
const ms = await page.evaluate(() => {
  const el = document.querySelector('kai-model-switcher');
  if (!el?.shadowRoot) return { __err: 'no kai-model-switcher' };
  const trg = el.shadowRoot.querySelector('button[aria-haspopup="menu"]');
  if (!trg) return { __err: 'no trigger' };
  return {
    tabindex: trg.getAttribute('tabindex'),
    hasAccessibleName: !!(trg.getAttribute('aria-label') || (trg.textContent || '').trim()),
    name: (trg.textContent || '').trim().slice(0, 24),
  };
});
console.log(JSON.stringify(ms, null, 2));

await browser.close();
