/**
 * T9 · keyless (mock) acceptance for the masked parameters form.
 *
 * The app is on its scripted turn, so nothing here depends on a key: the mask is
 * a rendering fact and must hold with no provider in the loop at all.
 *
 * Typing is PER KEY (`keyboard.press` one at a time, plus a `pressSequentially`
 * pass on the date field). `fill()` sets the value in one shot and never enters
 * the beforeinput path the masker lives on, which is how an earlier round missed
 * a per-key defect entirely.
 *
 * Run with the app's keyless `npm run dev` up on 5182/5183.
 */
import { open, submitPrompt } from './lib.mjs';

const results = [];
let failed = 0;
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail ?? null)?.slice(0, 400)}`);
}

/** Every control inside the kai-form card, by id, piercing shadow roots. */
function formControls() {
  const controls = [];
  (function walk(root) {
    for (const el of root.querySelectorAll('input, textarea, select')) controls.push(el);
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  })(document);
  return controls
    .filter((el) => {
      let n = el;
      while (n) {
        const rt = n.getRootNode();
        if (rt.host && rt.host.tagName && rt.host.tagName.toLowerCase() === 'kai-form') return true;
        n = rt.host;
      }
      return false;
    })
    .map((el) => ({
      id: el.id,
      tag: el.tagName.toLowerCase(),
      value: el.value,
      placeholder: el.placeholder ?? null,
      inputmode: el.getAttribute('inputmode'),
      autocomplete: el.getAttribute('autocomplete'),
      describedby: el.getAttribute('aria-describedby'),
    }));
}

function focusById(id) {
  let found = null;
  (function walk(root) {
    for (const el of root.querySelectorAll('input, textarea')) if (el.id === id) found = el;
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  })(document);
  if (!found) return null;
  window.__t9node = found;
  found.focus();
  return { id: found.id, value: found.value };
}

function activeDeep() {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a
    ? { tag: a.tagName.toLowerCase(), id: a.id || '', value: a.value ?? null, sameNode: a === window.__t9node }
    : null;
}

const KEYMAP = { '-': 'Minus', '/': 'Slash' };

async function typePerKey(page, text) {
  const trace = [];
  for (const ch of text) {
    await page.keyboard.press(KEYMAP[ch] ?? ch);
    await page.waitForTimeout(60);
    trace.push({ key: ch, active: await page.evaluate(activeDeep) });
  }
  return trace;
}

async function main() {
  const app = await open('mock', {});
  const { page } = app;

  await page.waitForTimeout(700);
  await submitPrompt(page, 'Deploy the payments service to production');
  await page.locator('kai-form').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(600);
  await app.shot('01-parameters-form');

  const controls = await page.evaluate(formControls);
  app.save('mock-form-controls.json', controls);
  console.log('controls:', JSON.stringify(controls));

  const ticketId = controls.find((c) => c.id.startsWith('f-ticket-'))?.id;
  const windowId = controls.find((c) => c.id.startsWith('f-window-'))?.id;
  const oncallId = controls.find((c) => c.id.startsWith('f-oncall-'))?.id;

  check('the masked fields are all on the card', !!ticketId && !!windowId && !!oncallId, {
    ticketId,
    windowId,
    oncallId,
  });

  /* ------------------------------------------------ ticket · CHG-#### mask -- */

  const armed = await page.evaluate(focusById, ticketId);
  check('the change-ticket input took focus', !!armed, armed);

  const ticketTrace = await typePerKey(page, 'chg4821');
  app.save('mock-ticket-keystrokes.json', ticketTrace);
  console.log('ticket:', JSON.stringify(ticketTrace.map((t) => [t.key, t.active?.value])));

  check(
    'typing `chg4821` ONE KEY AT A TIME shows CHG-4821',
    ticketTrace.at(-1)?.active?.value === 'CHG-4821',
    { finalValue: ticketTrace.at(-1)?.active?.value },
  );
  check(
    'focus stayed on the SAME input node for every key',
    ticketTrace.every((t) => t.active && t.active.sameNode === true),
    { lostAt: ticketTrace.filter((t) => !t.active?.sameNode).map((t) => t.key) },
  );
  await app.shot('02-ticket-masked');

  /* -------------------------------------------------- window · ##/##/#### -- */

  const windowArmed = await page.evaluate(focusById, windowId);
  check('the maintenance-window input took focus', !!windowArmed, windowArmed);
  const windowSeq = await (async () => {
    const input = page.locator(`kai-form input#${windowId}`);
    await input.click();
    await input.pressSequentially('09152026', { delay: 45 });
    await page.waitForTimeout(150);
    return { value: await input.inputValue(), focused: await page.evaluate(activeDeep) };
  })();
  app.save('mock-window-presssequentially.json', windowSeq);
  console.log('window:', JSON.stringify(windowSeq));
  check(
    'the DATE mask formats 09152026 into 09/15/2026 via pressSequentially',
    windowSeq.value === '09/15/2026',
    windowSeq,
  );

  /* ------------------------------------------------------- oncall · tel ----- */

  const oncallArmed = await page.evaluate(focusById, oncallId);
  check('the on-call input took focus', !!oncallArmed, oncallArmed);
  const oncallTrace = await typePerKey(page, '4155550142');
  app.save('mock-oncall-keystrokes.json', oncallTrace);
  console.log('oncall:', JSON.stringify(oncallTrace.at(-1)));
  check(
    'the `tel` SEMANTIC formats 4155550142 as 415-555-0142 on screen',
    oncallTrace.at(-1)?.active?.value === '415-555-0142',
    { finalValue: oncallTrace.at(-1)?.active?.value },
  );

  const afterTyping = await page.evaluate(formControls);
  app.save('mock-form-controls-filled.json', afterTyping);
  const oncallCtl = afterTyping.find((c) => c.id === oncallId);
  check('and `tel` carried its tier-1 attributes onto the control', oncallCtl?.inputmode === 'tel' && oncallCtl?.autocomplete === 'tel', oncallCtl);

  await app.shot('03-all-fields-masked');

  /* ---------------------------------------------------------- submit -------- */

  const buttons = await page.evaluate(() => {
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
    return { labels: inForm.map((b) => b.textContent.trim()), clicked: submit && submit.textContent.trim() };
  });
  app.save('mock-form-buttons.json', buttons);

  await page.locator('kai-confirm').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(700);
  await app.shot('04-approval-after-submit');

  // The request the console posted for the follow-up turn IS the submitted payload.
  const submitReq = app.requests.filter((r) => r.method === 'POST').at(-1);
  const parsed = submitReq?.body ? JSON.parse(submitReq.body) : null;
  app.save('mock-submit-request.json', parsed);
  console.log('submitted params:', JSON.stringify(parsed?.params));

  check(
    'the SUBMITTED ticket is the canonical masked value CHG-4821',
    parsed?.params?.ticket === 'CHG-4821',
    { params: parsed?.params },
  );
  check(
    'the submitted date keeps its literals (custom canonical = formatted)',
    parsed?.params?.window === '09/15/2026',
    { window: parsed?.params?.window },
  );
  check(
    'the submitted phone number is DIGITS (tel canonical strips separators)',
    parsed?.params?.oncall === '4155550142',
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
  app.save('mock-thread-after-submit.txt', thread);
  check('the next turn reads CHG-4821 back', thread.includes('CHG-4821'), {
    hasTicket: thread.includes('CHG-4821'),
  });
  check('the next turn reads the window back', thread.includes('09/15/2026'), {
    hasWindow: thread.includes('09/15/2026'),
  });

  /* ------------------------------------------- the run board sees the ticket */

  const approved = await page.evaluate(() => {
    const out = [];
    (function walk(root) {
      for (const el of root.querySelectorAll('button')) out.push(el);
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    })(document);
    const btn = out.find((b) => /approve/i.test(b.textContent));
    if (btn) btn.click();
    return btn ? btn.textContent.trim() : null;
  });
  await page.waitForTimeout(2500);
  await app.shot('05-board-after-approve');
  const boardText = await page.evaluate(() => {
    const frame = document.querySelector('kai-remote');
    return frame ? frame.outerHTML.slice(0, 200) : null;
  });
  // Read the board's own state from NODE, not from the console page: the console
  // origin is 5182 and the board 5183, and a cross-origin read here would be
  // testing CORS rather than the run.
  const boardApi = await fetch('http://localhost:5183/api/run')
    .then((r) => r.text())
    .catch((e) => `fetch failed: ${e}`);
  app.save('mock-board-run.json', { approved, boardText, boardApi });
  check('the run the board is showing carries the TYPED ticket, not a default', String(boardApi).includes('CHG-4821'), {
    approved,
    boardApi: String(boardApi).slice(0, 300),
  });

  const captured = app.finish();
  app.save('t9-mock-results.json', results);
  await app.browser.close();
  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}  (${results.length} checks)  evidence: ${app.dir}`);
  console.log('page errors:', JSON.stringify(captured.errors).slice(0, 500));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
