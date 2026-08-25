import { test, expect, type Page } from '@playwright/test';

/**
 * PROBE-CAN-FAIL EVIDENCE, not a suite to land.
 *
 * Every test here is the GREEN assertion from `input-mask-ivp.spec.ts` run
 * against the broken precondition that spec sets up in its RED half. All of
 * them are EXPECTED TO FAIL; the recorded failure output is the proof that the
 * shipped assertions are not vacuous. Nothing here reverts anything in git —
 * each mutation is made in the page.
 *
 *   npx playwright test --config .../t6-evidence/playwright.mutants.config.ts
 */

const STORY = '/iframe.html?viewMode=story&id=components-primitives-input--masked-formats';

async function boot(page: Page): Promise<void> {
  await page.goto(STORY);
  await page.waitForSelector('input');
  await page.evaluate(async () => {
    const { createInputMask } = await import('/src/primitives/input-mask.ts');
    (window as any).__probes = {};
    (window as any).__mk = (id: string, options: Record<string, unknown>) => {
      const el = document.createElement('input');
      el.id = id;
      document.body.prepend(el);
      (window as any).__probes[id] = { el, mask: createInputMask(el, options) };
    };
  });
}
const mk = (page: Page, id: string, o: Record<string, unknown>) =>
  page.evaluate(([i, opt]) => (window as any).__mk(i, opt), [id, o] as const);
const detach = (page: Page, id: string) =>
  page.evaluate((i) => {
    (window as any).__probes[i].mask.detach();
    (window as any).__probes[i].el.value = '';
  }, id);

test('MUTANT 1 (expected red): scenario 1 green assertions with the masker detached', async ({ page }) => {
  await boot(page);
  await mk(page, 'm1', { format: '@@@-####', caseMode: 'upper' });
  await detach(page, 'm1');
  await page.locator('#m1').click();
  await page.locator('#m1').pressSequentially('chg4821');
  // the SHIPPED assertion:
  await expect(page.locator('#m1')).toHaveValue('CHG-4821');
});

test('MUTANT 2 (expected red): scenario 2 "value unchanged at capacity" with the masker detached', async ({ page }) => {
  await boot(page);
  await mk(page, 'm2', { format: '@@@-####', caseMode: 'upper' });
  await page.locator('#m2').click();
  await page.locator('#m2').pressSequentially('chg4821');
  await page.evaluate(() => (window as any).__probes.m2.mask.detach());
  await page.keyboard.press('End');
  await page.locator('#m2').pressSequentially('9');
  // the SHIPPED assertion:
  await expect(page.locator('#m2')).toHaveValue('CHG-4821');
});

test('MUTANT 3 (expected red): scenario 3 §5.7 against the NAIVE normalizer (one line deleted)', async ({ page }) => {
  await boot(page);
  const planted = await page.evaluate(async () => {
    const absolutize = (t: string) =>
      t.replace(/(from\s*")(\/[^"]*)(")/g, (_m, a: string, p: string, c: string) => a + location.origin + p + c);
    const blob = (t: string) => URL.createObjectURL(new Blob([t], { type: 'text/javascript' }));
    const fm = await (await fetch('/src/primitives/field-mask.ts')).text();
    const naive = fm.replace(/^.*=== token\.toLowerCase\(\)\) read \+= 1;.*$/m, '');
    if (naive === fm) throw new Error('plant did not apply');
    let im = await (await fetch('/src/primitives/input-mask.ts')).text();
    im = im.replace('"/src/primitives/field-mask.ts"', JSON.stringify(blob(absolutize(naive))));
    const mod: any = await import(/* @vite-ignore */ blob(absolutize(im)));
    const el = document.createElement('input');
    document.body.append(el);
    const m = mod.createInputMask(el, { format: 'V-***' });
    m.setValue('V-123');
    return el.value;
  });
  // the SHIPPED assertion:
  expect(planted, 'no character lost to the leading literal').toBe('V-123');
});

test('MUTANT 4 (expected red): scenario 4 "caret after the auto-inserted literal" with the masker detached', async ({ page }) => {
  await boot(page);
  await mk(page, 'm4', { format: '##/##/####' });
  await detach(page, 'm4');
  await page.locator('#m4').click();
  await page.locator('#m4').pressSequentially('123');
  const caret = await page.locator('#m4').evaluate((el: HTMLInputElement) => el.selectionStart);
  // the SHIPPED assertion:
  expect(caret, 'caret sits after the auto-inserted literal').toBe(4);
});

test('MUTANT 5 (expected red): scenario 5 "deferred, not applied" with the composition ended early', async ({ page, context }) => {
  await boot(page);
  const cdp = await context.newCDPSession(page);
  await mk(page, 'm5', { format: '@@@@@@@@' });
  await page.locator('#m5').click();
  await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
  await page.evaluate(() =>
    (window as any).__probes.m5.el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })),
  );
  await page.evaluate(() => (window as any).__probes.m5.mask.setValue('ABCD'));
  // the SHIPPED assertion:
  await expect(page.locator('#m5'), 'deferred, not applied').toHaveValue('にほ');
});

test('MUTANT 6 (expected red): scenario 6 "the text is restored exactly" with the masker detached', async ({ page }) => {
  await boot(page);
  await mk(page, 'm6', { format: '###-###-####' });
  await detach(page, 'm6');
  await page.locator('#m6').click();
  await page.locator('#m6').pressSequentially('5551234567');
  await page.evaluate(() => {
    const el = (window as any).__probes.m6.el as HTMLInputElement;
    el.setSelectionRange(10, 10);
    el.value = '55512345';
    el.setSelectionRange(8, 8);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.keyboard.press('ControlOrMeta+z');
  // the SHIPPED assertion (modulo the literals the detached field never gets):
  expect(await page.locator('#m6').inputValue(), 'the text is restored exactly').toBe('5551234567');
});

test('MUTANT 7 (expected red): scenario 7 canonical assertion against the FORMATTED field', async ({ page, context }) => {
  await boot(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  await mk(page, 'm7', { format: '###-###-####', semantic: 'tel', copyPolicy: 'formatted' });
  await page.locator('#m7').click();
  await page.locator('#m7').pressSequentially('5551234567');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  // the SHIPPED canonical assertion, run against the 'formatted' field:
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('5551234567');
});

test('MUTANT 8 (expected red): scenario 8 story assertion against a bare unmasked input', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const el = document.createElement('input');
    el.id = 'm8';
    document.body.prepend(el);
  });
  await page.locator('#m8').click();
  await page.locator('#m8').pressSequentially('12252026');
  // the SHIPPED assertion:
  await expect(page.locator('#m8')).toHaveValue('12/25/2026');
});
