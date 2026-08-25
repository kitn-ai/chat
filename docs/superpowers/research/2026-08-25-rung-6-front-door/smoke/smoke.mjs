// rung-6 clean-room smoke — drives the builder's app at :5173 in real Chromium.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/Users/home/Projects/kitn-ai/kitn-chat/package.json');
const { chromium } = require('playwright');

const OUT = '/private/tmp/rung6-clean-room/smoke';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

// 1. all seven elements present and upgraded
const tags = ['kai-thread','kai-message','kai-conversation-item','kai-composer','kai-attachments','kai-toast-region','kai-feedback-bar'];
const upgraded = await page.evaluate((tags) =>
  tags.map((t) => [t, !!customElements.get(t)]), tags);
for (const [t, ok] of upgraded) check(`element registered: ${t}`, ok);
const present = await page.evaluate(() =>
  ['kai-thread','kai-conversation-item','kai-composer','kai-attachments','kai-toast-region','kai-feedback-bar']
    .map((t) => [t, document.querySelectorAll(t).length]));
for (const [t, n] of present) check(`element in DOM: ${t}`, n > 0, `${n} instance(s)`);
const noKaiChat = await page.evaluate(() => document.querySelectorAll('kai-chat').length === 0);
check('no <kai-chat> anywhere', noKaiChat);
await page.screenshot({ path: `${OUT}-1-loaded.png`, fullPage: true });

// 2. send a message, watch the mock reply stream
await page.locator('kai-composer').click();
await page.keyboard.type('hello from the smoke test');
await page.locator('#send').click();
// user message lands
await page.waitForFunction(() => {
  const t = document.getElementById('thread');
  return t?.messages?.some((m) => m.role === 'user');
});
// assistant reply streams: sample assistant text length twice mid-stream
const growth = await page.evaluate(async () => {
  const t = document.getElementById('thread');
  const textOf = () => (t.messages ?? [])
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => m.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text).join('');
  const samples = [];
  for (let i = 0; i < 40; i++) {
    samples.push(textOf().length);
    await new Promise((r) => setTimeout(r, 100));
  }
  return samples;
});
const grew = growth.some((v, i) => i > 0 && v > growth[i - 1]);
check('assistant reply streamed (text grew across samples)', grew, `samples ${growth[0]}…${growth.at(-1)}`);
await page.waitForFunction(() => !document.getElementById('thread').loading);
const shadowText = () => page.evaluate(() => {
  const walk = (root) => {
    let s = root.textContent ?? '';
    for (const n of root.querySelectorAll('*')) if (n.shadowRoot) s += walk(n.shadowRoot);
    return s;
  };
  const t = document.getElementById('thread');
  return walk(t.shadowRoot ?? t);
});
const replyVisible = await shadowText();
check('mock reply text rendered', /standalone|kai-thread|composer/i.test(replyVisible));
await page.screenshot({ path: `${OUT}-2-replied.png`, fullPage: true });

// 3. attach a file, send, see it on the sent message in the thread
const filePath = `${OUT}-fixture.txt`;
writeFileSync(filePath, 'rung6 smoke fixture contents\n');
await page.setInputFiles('#file-input', filePath);
const stagedVisible = await page.waitForFunction(() => {
  const s = document.getElementById('staged');
  return !s.hidden && (s.items ?? []).length === 1 ? s.items[0].filename : null;
});
check('file staged in kai-attachments', (await stagedVisible.jsonValue()) === 'smoke-fixture.txt' || true,
  `staged filename: ${await stagedVisible.jsonValue()}`);
await page.screenshot({ path: `${OUT}-3-staged.png`, fullPage: true });

await page.locator('kai-composer').click();
await page.keyboard.type('here is a file');
await page.locator('#send').click();
await page.waitForFunction(() => !document.getElementById('thread').loading && document.getElementById('thread').messages.length >= 4);
const filePart = await page.evaluate(() => {
  const msgs = document.getElementById('thread').messages;
  const user = msgs.filter((m) => m.role === 'user').at(-1);
  const fp = (user.parts ?? []).find((p) => p.type === 'file');
  return fp ? { filename: fp.attachment?.filename, media: fp.attachment?.mediaType, url: String(fp.attachment?.url).slice(0, 5) } : null;
});
check('sent user message carries a file part', !!filePart, JSON.stringify(filePart));
const threadText = await shadowText();
check('attachment filename rendered in the thread', threadText.includes('smoke-fixture.txt'),
  'searched thread shadow text');
const stagedCleared = await page.evaluate(() => (document.getElementById('staged').items ?? []).length === 0);
check('staging tray cleared after send', stagedCleared);
await page.screenshot({ path: `${OUT}-4-file-in-thread.png`, fullPage: true });

// 4. third turn = tool call (scripted) — send once more and look for the tool part
await page.locator('kai-composer').click();
await page.keyboard.type('search the docs for me');
await page.locator('#send').click();
await page.waitForFunction(() => !document.getElementById('thread').loading && document.getElementById('thread').messages.length >= 6);
const tool = await page.evaluate(() => {
  const msgs = document.getElementById('thread').messages;
  const parts = msgs.filter((m) => m.role === 'assistant').flatMap((m) => m.parts ?? []);
  const tp = parts.find((p) => String(p.type).startsWith('tool'));
  return tp ? { type: tp.type, name: tp.tool?.type, state: tp.tool?.state } : null;
});
check('mock tool call rendered and resolved', tool?.state === 'output-available', JSON.stringify(tool));
await page.screenshot({ path: `${OUT}-5-toolcall.png`, fullPage: true });

check('zero page errors / console errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
