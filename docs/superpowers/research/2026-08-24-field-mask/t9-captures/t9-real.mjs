/**
 * T9 · REAL-MODE acceptance for the model-facing mask hints.
 *
 * ONE session, minimal spend. What it is actually asking, in order:
 *
 *   1. Do the hints reach the provider AS BYTES? The projected `kai_parameters`
 *      tool definition is read out of the OUTGOING request body this page posted,
 *      not inferred from the registry — a projection that strips `x-kai-format`
 *      would still look right in the source and be gone on the wire.
 *   2. Does the model USE them? It authors the form; nothing can pin a format onto
 *      a field it invents (`CardRequireRule` cannot reach inside a form's
 *      `properties`). Whether the card comes back carrying `x-kai-format` is a
 *      measurement, not a guarantee, and it is reported either way.
 *   3. Does the round trip carry the CANONICAL value? The form is filled by real
 *      per-key typing (`pressSequentially`), submitted, and the follow-up request
 *      is read for what the console actually posted.
 *
 * Retries the elicitation ONCE: under `tool_choice: 'auto'` a small model
 * sometimes narrates the call instead of making one (the app's own F-24/D4 note),
 * and a route anecdote is not a verdict.
 *
 * Usage: node t9-real.mjs [modelLabel]  — with the app's dev server up AND a key
 * in examples/apps/ops-console/.env. The model itself comes from that file; the
 * label is only used to name the capture files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { open, submitPrompt, EV } from './lib.mjs';

const LABEL = process.argv[2] ?? 'deepseek';
const CAPTURE_ONLY = process.argv.includes('--capture-only');

const results = [];
let failed = 0;
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail ?? null)?.slice(0, 500)}`);
}
function note(name, detail) {
  results.push({ name, observation: detail });
  console.log(`NOTE  ${name}  ${JSON.stringify(detail ?? null)?.slice(0, 600)}`);
}

/* --------------------------------------------------------- browser probes -- */

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
      inputmode: el.getAttribute('inputmode'),
      autocomplete: el.getAttribute('autocomplete'),
    }));
}

/** The form card's DATA as the client parsed it — the model's own field schema. */
function formCardData() {
  const out = [];
  (function walk(root) {
    for (const el of root.querySelectorAll('kai-form')) out.push(el.data ?? el.getAttribute('data'));
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  })(document);
  return out;
}

function activeDeep() {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a ? { tag: a.tagName.toLowerCase(), id: a.id || '', value: a.value ?? null } : null;
}

function deepThreadText() {
  const chat = document.querySelector('kai-chat');
  const skip = new Set(['STYLE', 'SCRIPT', 'TEMPLATE']);
  let s = '';
  const walk = (n) => {
    if (n.nodeType === 3) s += n.textContent + ' ';
    if (n.nodeType === 1 && skip.has(n.tagName)) return;
    if (n.shadowRoot) walk(n.shadowRoot);
    for (const c of n.childNodes) walk(c);
  };
  if (chat) walk(chat);
  return s.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ main -- */

async function main() {
  const app = await open(`real-${LABEL}`, {});
  const { page } = app;
  const dir = app.dir;
  await page.waitForTimeout(700);

  /* ------------------------------------------- turn 1 · elicit the form ---- */

  let gotForm = false;
  let attempts = 0;
  while (!gotForm && attempts < 2) {
    attempts++;
    await submitPrompt(
      page,
      attempts === 1
        ? 'Deploy the payments service to production.'
        : 'Ask me for the deployment parameters as a form: region, change ticket, maintenance window start date, on-call contact number.',
    );
    try {
      await page.locator('kai-form').first().waitFor({ state: 'visible', timeout: 60000 });
      gotForm = true;
    } catch {
      console.log(`attempt ${attempts}: no form card`);
      await page.waitForTimeout(1500);
    }
  }
  await page.waitForTimeout(800);
  await app.shot('01-turn1');

  const t1req = app.requests.filter((r) => r.method === 'POST').at(-1);
  const t1body = t1req?.body ? JSON.parse(t1req.body) : null;
  fs.writeFileSync(path.join(dir, `turn1-request-${LABEL}.json`), JSON.stringify(t1body, null, 2));
  fs.writeFileSync(
    path.join(dir, `turn1-request-raw-${LABEL}.txt`),
    app.requests.map((r) => `${r.method} ${r.url}\n${r.body}`).join('\n\n---\n\n'),
  );
  const t1sse = app.sse.at(-1);
  fs.writeFileSync(path.join(dir, `turn1-sse-${LABEL}.txt`), String(t1sse?.body ?? ''));

  /* ---- 1. the hints on the wire, read out of the request BYTES ------------ */

  // THE WIRE BYTES. The browser posts `{messages, intent, params}` — the tools are
  // added server-side, so the outgoing OpenRouter body is captured in the dev
  // server process by capture-upstream.mjs and read back here as raw text.
  const upstreamLog = process.env.T9_UPSTREAM_LOG;
  const upstream = fs.existsSync(upstreamLog ?? '')
    ? fs
        .readFileSync(upstreamLog, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  fs.writeFileSync(path.join(dir, `turn1-upstream-request-${LABEL}.json`), JSON.stringify(upstream.at(-1) ?? null, null, 2));
  const rawBody = upstream.at(-1)?.body ?? '';
  const upBody = rawBody ? JSON.parse(rawBody) : null;
  const paramTool = (upBody?.tools ?? []).find((t) => t?.function?.name === 'kai_parameters');
  const fieldNode = paramTool?.function?.parameters?.properties?.properties?.additionalProperties;
  const fieldKeys = fieldNode ? Object.keys(fieldNode.properties ?? {}) : [];
  fs.writeFileSync(
    path.join(dir, `turn1-tooldef-kai_parameters-${LABEL}.json`),
    JSON.stringify(paramTool ?? null, null, 2),
  );

  check('the request the app SENT UPSTREAM carries the kai_parameters tool', !!paramTool, {
    tools: (upBody?.tools ?? []).map((t) => t?.function?.name),
    model: upBody?.model,
    upstreamCalls: upstream.length,
  });
  check(
    'x-kai-format / x-kai-mask / x-kai-mask-guide are present in the REQUEST BYTES',
    rawBody.includes('x-kai-format') && rawBody.includes('x-kai-mask') && rawBody.includes('x-kai-mask-guide'),
    {
      format: rawBody.includes('x-kai-format'),
      mask: rawBody.includes('x-kai-mask'),
      guide: rawBody.includes('x-kai-mask-guide'),
      bytes: rawBody.length,
    },
  );
  check(
    'and they sit on the FIELD schema of the form tool, with x-kai-format enum-constrained',
    fieldKeys.includes('x-kai-format') &&
      fieldKeys.includes('x-kai-mask') &&
      fieldKeys.includes('x-kai-mask-guide') &&
      Array.isArray(fieldNode?.properties?.['x-kai-format']?.enum),
    { fieldKeys, enum: fieldNode?.properties?.['x-kai-format']?.enum },
  );

  /* ---- 2. what the model did with them ----------------------------------- */

  const cardData = await page.evaluate(formCardData);
  fs.writeFileSync(path.join(dir, `turn1-formcard-${LABEL}.json`), JSON.stringify(cardData, null, 2));
  const props = cardData?.[0]?.properties ?? {};
  const hinted = Object.entries(props)
    .filter(([, v]) => v && (v['x-kai-format'] || v['x-kai-mask']))
    .map(([k, v]) => ({
      field: k,
      format: v['x-kai-format'],
      mask: v['x-kai-mask'],
      guide: v['x-kai-mask-guide'],
    }));

  check('the model answered with a form card', !!cardData?.[0]?.properties, {
    title: cardData?.[0]?.title,
    fields: Object.keys(props),
    attempts,
  });
  note('what the model did with the hints', {
    fieldsDeclaringAMask: hinted,
    allFields: Object.entries(props).map(([k, v]) => ({
      field: k,
      title: v?.title,
      format: v?.['x-kai-format'] ?? null,
      mask: v?.['x-kai-mask'] ?? null,
      pattern: v?.pattern ?? null,
    })),
  });

  if (CAPTURE_ONLY) {
    app.finish();
    fs.writeFileSync(path.join(dir, `t9-real-results-${LABEL}.json`), JSON.stringify(results, null, 2));
    await app.browser.close();
    console.log(`\nCAPTURE-ONLY  ${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} (${results.length} entries)  ${dir}`);
    process.exit(failed === 0 ? 0 : 1);
  }

  /* ---- 3. fill it for real and read the round trip ------------------------ */

  const controls = await page.evaluate(formControls);
  fs.writeFileSync(path.join(dir, `turn1-controls-${LABEL}.json`), JSON.stringify(controls, null, 2));
  const ticketKey = Object.keys(props).find((k) => /ticket|change|chg/i.test(k) || /ticket|change/i.test(props[k]?.title ?? ''));
  const ticketCtl = controls.find((c) => c.id.startsWith(`f-${ticketKey}-`));
  check('a change-ticket field exists on the card the model authored', !!ticketCtl, { ticketKey, ids: controls.map((c) => c.id) });

  let typed = null;
  if (ticketCtl) {
    const input = page.locator(`kai-form input#${ticketCtl.id}`);
    await input.click();
    await input.pressSequentially('chg4821', { delay: 60 });
    await page.waitForTimeout(200);
    typed = { value: await input.inputValue(), focused: await page.evaluate(activeDeep) };
    fs.writeFileSync(path.join(dir, `turn1-typed-${LABEL}.json`), JSON.stringify(typed, null, 2));
    console.log('typed:', JSON.stringify(typed));
    check(
      'typing `chg4821` per key into the model-authored ticket field yields CHG-4821',
      typed.value === 'CHG-4821',
      typed,
    );
  }

  // Anything else the model made required has to be answered or the form will not
  // submit; fill every still-empty control with something shaped for it.
  const filled = await (async () => {
    const out = [];
    for (const c of await page.evaluate(formControls)) {
      // NOT "value is empty": an empty masked input renders its GUIDE as `.value`
      // (`mm/dd/yyyy`), so an emptiness test skips exactly the masked fields this
      // run exists to fill — and the first run of this script did, leaving a
      // required date blank and never reaching turn 2. Skip the one field already
      // typed instead.
      if (ticketCtl && c.id === ticketCtl.id) continue;
      const field = Object.entries(props).find(([k]) => c.id.startsWith(`f-${k}-`));
      const schema = field?.[1] ?? {};
      const mask = String(schema['x-kai-mask'] ?? '');
      let text = 'noted';
      if (schema['x-kai-format'] === 'tel' || /phone|contact|oncall|on_call/i.test(field?.[0] ?? '')) text = '4155550142';
      else if (/date|window|when|schedule/i.test(field?.[0] ?? '') || mask.includes('##/##')) text = '09152026';
      else if (/region|zone/i.test(field?.[0] ?? '')) text = 'us-east-1';
      else if (c.tag === 'select') continue;
      const loc = page.locator(`kai-form ${c.tag}#${c.id}`);
      try {
        await loc.click({ timeout: 3000 });
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('Backspace');
        await loc.pressSequentially(text, { delay: 25 });
        out.push({ id: c.id, typed: text, shows: await loc.inputValue() });
      } catch (e) {
        out.push({ id: c.id, error: String(e).slice(0, 120) });
      }
    }
    return out;
  })();
  fs.writeFileSync(path.join(dir, `turn1-otherfields-${LABEL}.json`), JSON.stringify(filled, null, 2));

  // Whatever the model chose for the NON-masked fields — a radio group, a select,
  // a checkbox — answer it so a required-field error cannot be what stops the
  // round trip. Radios in this kit render with no id, which is why the typed pass
  // above cannot reach them.
  const answered = await page.evaluate(() => {
    const controls = [];
    (function walk(root) {
      for (const el of root.querySelectorAll('input, select')) controls.push(el);
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    })(document);
    const inForm = controls.filter((el) => {
      let n = el;
      while (n) {
        const rt = n.getRootNode();
        if (rt.host && rt.host.tagName && rt.host.tagName.toLowerCase() === 'kai-form') return true;
        n = rt.host;
      }
      return false;
    });
    const out = [];
    const groupsDone = new Set();
    for (const el of inForm) {
      if (el.tagName === 'SELECT' && !el.value) {
        el.value = el.options[el.options.length - 1]?.value ?? '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
        out.push({ kind: 'select', value: el.value });
      } else if (el.type === 'radio') {
        const key = el.name || 'unnamed';
        if (groupsDone.has(key)) continue;
        const group = inForm.filter((o) => o.type === 'radio' && (o.name || 'unnamed') === key);
        if (!group.some((o) => o.checked)) {
          group[0].click();
          out.push({ kind: 'radio', name: key, value: group[0].value });
        }
        groupsDone.add(key);
      }
    }
    return out;
  });
  fs.writeFileSync(path.join(dir, `turn1-answered-${LABEL}.json`), JSON.stringify(answered, null, 2));
  await page.waitForTimeout(300);
  await app.shot('02-form-filled');

  const beforeSubmit = app.requests.length;
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

  // Wait for the follow-up request AND for the reply to finish streaming.
  for (let i = 0; i < 80 && app.requests.length === beforeSubmit; i++) await page.waitForTimeout(250);
  if (app.requests.length === beforeSubmit) {
    // The submit never left the card. Say WHY here rather than at the assertion,
    // so a diagnosis does not cost another provider call.
    const blocked = await page.evaluate(() => {
      const out = [];
      (function walk(root) {
        for (const el of root.querySelectorAll('[role="alert"], .text-destructive, [aria-invalid="true"]'))
          out.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 160), id: el.id });
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
      })(document);
      return out;
    });
    fs.writeFileSync(path.join(dir, `turn2-submit-blocked-${LABEL}.json`), JSON.stringify(blocked, null, 2));
    note('the form did not submit — what it complained about', blocked);
  }
  await page.waitForTimeout(9000);
  await app.shot('03-turn2');

  const t2req = app.requests.filter((r) => r.method === 'POST').at(-1);
  const t2body = t2req?.body ? JSON.parse(t2req.body) : null;
  fs.writeFileSync(path.join(dir, `turn2-request-${LABEL}.json`), JSON.stringify(t2body, null, 2));
  const t2sse = app.sse.at(-1);
  fs.writeFileSync(path.join(dir, `turn2-sse-${LABEL}.txt`), String(t2sse?.body ?? ''));
  console.log('turn2 params:', JSON.stringify(t2body?.params));

  check(
    "turn 2's request carries the CANONICAL masked value",
    JSON.stringify(t2body?.params ?? {}).includes('CHG-4821'),
    { params: t2body?.params, intent: t2body?.intent },
  );

  const thread = await page.evaluate(deepThreadText);
  fs.writeFileSync(path.join(dir, `turn2-thread-${LABEL}.txt`), thread);
  check("the model's reply reads CHG-4821 back", thread.includes('CHG-4821'), {
    tail: thread.slice(-500),
  });

  const captured = app.finish();
  fs.writeFileSync(path.join(dir, `t9-real-results-${LABEL}.json`), JSON.stringify(results, null, 2));
  await app.browser.close();
  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}  (${results.length} entries)  evidence: ${dir}`);
  console.log('page errors:', JSON.stringify(captured.errors).slice(0, 400));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
