import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const EV = '/Users/home/Projects/kitn-ai/kitn-chat/.superpowers/sdd/2026-08-24-form-field-formats/t9-captures';
export const CONSOLE_URL = 'http://localhost:5182/';

export function mkdir(p) { fs.mkdirSync(p, { recursive: true }); return p; }

/** Launch a browser + page with full console/page-error/network capture. */
export async function open(name, opts = {}) {
  const dir = mkdir(path.join(EV, name));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  const errors = [];
  const requests = [];
  ctx.on('console', (m) => logs.push({ type: m.type(), text: m.text(), url: m.location()?.url }));
  ctx.on('weberror', (e) => errors.push(String(e.error())));
  page.on('pageerror', (e) => errors.push(String(e)));
  ctx.on('request', (r) => {
    if (r.url().includes('/api/chat')) requests.push({ method: r.method(), url: r.url(), body: r.postData() });
  });
  // capture SSE bytes for /api/chat
  const sse = [];
  ctx.on('response', async (r) => {
    if (r.url().includes('/api/chat')) {
      try { sse.push({ status: r.status(), headers: r.headers(), body: (await r.body()).toString('utf8') }); }
      catch (e) { sse.push({ status: r.status(), error: String(e) }); }
    }
  });
  const shot = async (label) => {
    const f = path.join(dir, `${label}.png`);
    await page.screenshot({ path: f, fullPage: false });
    return f;
  };
  const save = (label, data) => {
    const f = path.join(dir, label);
    fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    return f;
  };
  const finish = () => {
    save('console-logs.json', logs);
    save('page-errors.json', errors);
    save('api-chat-requests.json', requests);
    save('api-chat-sse.json', sse);
    return { logs, errors, requests, sse, dir };
  };
  if (!opts.noNav) await page.goto(CONSOLE_URL, { waitUntil: 'domcontentloaded' });
  return { browser, ctx, page, logs, errors, requests, sse, shot, save, finish, dir };
}

/** Deep (shadow-piercing) DOM description of the thread's cards, via JS. */
export const DEEP_PROBE = `(() => {
  function walk(node, depth, out) {
    if (depth > 40) return;
    if (node.nodeType === 1) {
      const el = node;
      const tag = el.tagName.toLowerCase();
      out.push({ d: depth, tag, cls: el.className && typeof el.className === 'string' ? el.className : undefined,
                 text: el.children.length === 0 ? (el.textContent || '').trim().slice(0, 120) : undefined,
                 shadow: !!el.shadowRoot });
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1, out);
    }
    for (const c of node.children || []) walk(c, depth + 1, out);
  }
  const out = [];
  walk(document.body, 0, out);
  return out;
})()`;

/** Collect all elements matching a selector across every shadow root. */
export const QSA_DEEP = `(sel) => {
  const found = [];
  function walk(root) {
    for (const el of root.querySelectorAll('*')) {
      if (el.matches(sel)) found.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }
  walk(document);
  return found;
}`;

export async function submitPrompt(page, text) {
  // The prompt input is a contenteditable div in kai-chat's shadow DOM.
  const box = page.locator('kai-chat [contenteditable]').first();
  await box.click();
  await box.type(text, { delay: 5 });
  await page.keyboard.press('Enter');
}

export async function waitForCard(page, cardTag, timeout = 20000) {
  await page.locator(cardTag).first().waitFor({ state: 'visible', timeout });
}

/** The KEY assertion, one function, reused for the probe-can-fail demonstration.
 *  Returns the real (shadow-piercing) DOM facts about cards of `tag` in the thread. */
export const CARD_FACTS = `(tag) => {
  const out = [];
  function walk(root) {
    for (const el of root.querySelectorAll('*')) {
      if (el.tagName.toLowerCase() === tag) {
        const sr = el.shadowRoot;
        const btns = sr ? [...sr.querySelectorAll('button')].map((b) => ({ label: b.textContent.trim(), disabled: b.disabled })) : [];
        const r = el.getBoundingClientRect();
        out.push({
          tag,
          hasShadow: !!sr,
          shadowText: sr ? sr.textContent.replace(/\\s+/g, ' ').trim().slice(0, 400) : null,
          buttons: btns,
          rect: { w: Math.round(r.width), h: Math.round(r.height) },
          visible: r.width > 0 && r.height > 0,
          inThread: !!el.closest('kai-chat') || (() => { let n = el; while (n) { const rt = n.getRootNode(); if (rt.host && rt.host.tagName && rt.host.tagName.toLowerCase() === 'kai-chat') return true; n = rt.host; } return false; })(),
        });
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }
  walk(document);
  return out;
}`;


/** Call CARD_FACTS as an expression (Playwright evaluates strings as expressions). */
export function cardFacts(page, tag) {
  return page.evaluate(`(${CARD_FACTS})(${JSON.stringify(tag)})`);
}

/** Shadow-piercing visible text of a subtree (style/script excluded). */
export const DEEP_TEXT = `(rootSel) => {
  const skip = new Set(['STYLE','SCRIPT','TEMPLATE']);
  let out = '';
  function walk(node) {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue + ' ';
      else if (c.nodeType === 1 && !skip.has(c.tagName)) {
        if (c.shadowRoot) walk(c.shadowRoot);
        walk(c);
      }
    }
  }
  const root = document.querySelector(rootSel);
  if (root && root.shadowRoot) walk(root.shadowRoot);
  if (root) walk(root);
  return out.replace(/\\s+/g, ' ').trim();
}`;
export function deepText(page, sel = 'kai-chat') {
  return page.evaluate(`(${DEEP_TEXT})(${JSON.stringify(sel)})`);
}
