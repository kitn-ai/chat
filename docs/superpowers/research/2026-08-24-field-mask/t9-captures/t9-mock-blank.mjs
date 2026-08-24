/**
 * T9 side-probe · the field NOBODY TOUCHED.
 *
 * The main probe filled every masked field, which is exactly the case that cannot
 * see the failure that matters here: an empty masked input renders its guide
 * (`mm/dd/yyyy`) as the element's own `.value`, so the question "does an untouched
 * optional field submit the guide as if it were a date" is unanswered by a run
 * that typed into it. A fabricated maintenance window is the same class of defect
 * as the `CHG-0000` this app already refuses.
 *
 * Fills the REQUIRED fields only, submits, and reads the posted payload.
 */
import { open, submitPrompt } from './lib.mjs';

const results = [];
let failed = 0;
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail ?? null)?.slice(0, 400)}`);
}

function focusById(id) {
  let found = null;
  (function walk(root) {
    for (const el of root.querySelectorAll('input, textarea')) if (el.id === id) found = el;
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  })(document);
  if (!found) return null;
  found.focus();
  return { id: found.id, value: found.value };
}

function controlIds() {
  const out = [];
  (function walk(root) {
    for (const el of root.querySelectorAll('input, textarea, select')) out.push({ id: el.id, value: el.value });
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  })(document);
  return out;
}

async function main() {
  const app = await open('mock-blank', {});
  const { page } = app;
  await page.waitForTimeout(700);
  await submitPrompt(page, 'Deploy the payments service to production');
  await page.locator('kai-form').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(600);

  const ids = await page.evaluate(controlIds);
  app.save('blank-controls.json', ids);
  const ticketId = ids.find((c) => c.id.startsWith('f-ticket-'))?.id;

  await page.evaluate(focusById, ticketId);
  for (const ch of 'chg4821') {
    await page.keyboard.press(ch);
    await page.waitForTimeout(50);
  }
  await app.shot('01-only-ticket-filled');

  await page.evaluate(() => {
    const out = [];
    (function walk(root) {
      for (const el of root.querySelectorAll('button')) out.push(el);
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    })(document);
    const inForm = out.filter((el) => {
      let n = el;
      while (n) {
        const rt = n.getRootNode();
        if (rt.host && rt.host.tagName && rt.host.tagName.toLowerCase() === 'kai-form') return true;
        n = rt.host;
      }
      return false;
    });
    const submit = inForm.find((b) => !/dismiss/i.test(b.textContent.trim())) ?? inForm.at(-1);
    if (submit) submit.click();
  });
  await page.locator('kai-confirm').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(600);
  await app.shot('02-approval');

  const req = app.requests.filter((r) => r.method === 'POST').at(-1);
  const parsed = req?.body ? JSON.parse(req.body) : null;
  app.save('blank-submit-request.json', parsed);
  console.log('params:', JSON.stringify(parsed?.params));

  check('the required ticket still submits canonical', parsed?.params?.ticket === 'CHG-4821', parsed?.params);
  check(
    'an UNTOUCHED masked date does NOT submit its guide as a value',
    parsed?.params?.window === undefined || parsed?.params?.window === '',
    { window: parsed?.params?.window },
  );
  check(
    'an UNTOUCHED tel field does not submit anything either',
    parsed?.params?.oncall === undefined || parsed?.params?.oncall === '',
    { oncall: parsed?.params?.oncall },
  );

  const thread = await page.evaluate(() => {
    const chat = document.querySelector('kai-chat');
    let s = '';
    const walk = (n) => {
      if (n.nodeType === 3) s += n.textContent + ' ';
      if (n.shadowRoot) walk(n.shadowRoot);
      for (const c of n.childNodes) walk(c);
    };
    if (chat) walk(chat);
    return s.replace(/\s+/g, ' ').trim();
  });
  app.save('blank-thread.txt', thread);
  check('and no invented window reaches the next turn', !thread.includes('mm/dd/yyyy'), {
    hasGuideInThread: thread.includes('mm/dd/yyyy'),
  });

  app.finish();
  app.save('t9-mock-blank-results.json', results);
  await app.browser.close();
  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}  (${results.length} checks)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
