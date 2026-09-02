import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * IVP for the stateful input masker (`src/primitives/input-mask.ts`) and the
 * `Input` masking surface it backs. Spec: §5 of
 * `docs/superpowers/specs/2026-08-24-form-field-formats-design.md`.
 *
 * THIS FILE EXISTS FOR EXACTLY WHAT jsdom CANNOT PROVE. The unit suite
 * (`tests/primitives/input-mask.test.ts`) says so at the top of itself, and the
 * list there is this file's scope, one probe per item:
 *
 *   1. `beforeinput` CANCELATION. jsdom builds a cancelable `beforeinput` but
 *      nothing in jsdom writes `.value` because of one, so "we canceled, so the
 *      browser did not write" is asserted there only as "preventDefault was
 *      called". Here the browser is the one holding the pen (scenario 2).
 *   2. CARET. `setSelectionRange` in jsdom is bookkeeping. Scenario 4 measures
 *      `selectionStart`/`selectionEnd` numerically after a real key.
 *   3. COMPOSITION / IME. jsdom never composes. Scenario 5 drives a REAL
 *      composition through CDP `Input.imeSetComposition`.
 *   4. THE CLIPBOARD. jsdom has neither `ClipboardEvent` nor `DataTransfer`.
 *      Scenarios 3 and 7 use the system clipboard through real Ctrl/Cmd+V/C.
 *   5. §5.7 IN A LIVE FIELD -- pasting `V-123` into `V-***`.
 *   6. THE UNDO-CARET IMPRECISION recorded in `input-mask.ts`'s header and in
 *      task-3-review.md's Minor. Scenario 6 MEASURES it. It is recorded, not
 *      asserted away.
 *   7. THE CARET WINDOW on a GUIDED field -- the owner's validation bar.
 *      Scenarios 9 and 10 drive real mouse clicks into a rendered literal prefix
 *      and into an unfilled guide tail, plus real Home/End/ArrowLeft, and read
 *      the resulting offsets numerically. jsdom can dispatch `selectionchange`
 *      but cannot decide WHERE a pixel lands, which is the whole question here.
 *
 * HOW IT BOOTS. Storybook dev (:6006) is a Vite dev server rooted at
 * `packages/ui`, so the page can `import('/src/primitives/input-mask.ts')` and
 * get the REAL module -- no bundling step, no fixture copy that can drift from
 * the source. The probes then mount their own bare `<input>`s in that page, so
 * every scenario picks its own `format` (the stories cannot express `V-***`).
 * Scenario 8 is the cross-check that the shipped story still masks.
 * `storybook-static` cannot register web components, so dev is the only option
 * (MEMORY: defer-IVP-to-end).
 *
 * PROBE-CAN-FAIL. Every scenario carries its own red, produced in the page --
 * never by a git revert -- and each red asserts a SPECIFIC wrong answer, not
 * merely "different":
 *   - `detach()` reverts the masker off the field and the probe must then read
 *     the browser's unmasked behavior (scenarios 1, 2, 4, 6).
 *   - Scenario 3 rebuilds the REAL module from the dev server's own transformed
 *     source with ONE LINE DELETED -- the literal-consuming line in
 *     `normalizeToRaw` -- imported as a blob module. That is the naive
 *     normalizer §5.7 is about, and it must produce the reference's `V-V12`.
 *   - Scenario 5 clears the composition early so the deferred write lands
 *     immediately.
 *   - Scenario 7 checks each policy's expectation against the OTHER policy's
 *     field.
 *   - Scenario 8 runs the same keystrokes into a bare unmasked input.
 *
 * CI: NOT WIRED, deliberately and exactly like the rest of this family
 * (menu / composer / command / slots IVPs). Each is a `--project` of
 * `config/playwright/storybook.config.ts` + an npm script; the root
 * `playwright.config.ts` `testMatch`es only `remote-element.spec.ts`. The
 * required CI `test` job runs the menu and command ones and not this one. This
 * file follows that arrangement.
 *
 * Run: `npm run test:input-mask-ivp`
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root: packages/ui/tests/e2e -> ../../../.. */
// The task text's location, and it is TRACKED. `.superpowers/` is gitignored, so
// evidence written there evaporates -- which is the exact failure HANDOFF §5 names.
const DEFAULT_EVIDENCE_DIR = resolve(HERE, '../../../..', 'docs/superpowers/research/2026-08-24-field-mask');
const SHOT_ROOT = process.env.INPUT_MASK_EVIDENCE_DIR
  ? resolve(process.env.INPUT_MASK_EVIDENCE_DIR)
  : DEFAULT_EVIDENCE_DIR;
mkdirSync(SHOT_ROOT, { recursive: true });

/** The story is both the host page for the bare-input probes and scenario 8's subject. */
const STORY = '/iframe.html?viewMode=story&id=components-primitives-input--masked-formats';

interface ProbeState {
  value: string;
  start: number | null;
  end: number | null;
  focused: boolean;
  /** Identity token stamped on the element at creation -- a re-created node loses it. */
  token: string;
  sameNode: boolean;
  events: Array<Record<string, unknown>>;
}

declare global {
  interface Window {
    __mk: (id: string, options: Record<string, unknown>) => void;
    __st: (id: string) => ProbeState;
    __probes: Record<string, { el: HTMLInputElement; mask: { detach(): void; setValue(v: string): void }; events: Array<Record<string, unknown>>; token: string }>;
  }
}

/** Console/page errors for the whole test. Asserted empty at the end of each. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
  return errors;
}

/** Boot the story page and install the in-page probe factory over the REAL module. */
async function boot(page: Page): Promise<string[]> {
  const errors = watchErrors(page);
  await page.goto(STORY);
  await page.waitForSelector('input');
  await page.evaluate(async () => {
    // Through the specifier VARIABLE, not a literal: this path is resolved by the
    // dev server at runtime, and tsc (moduleResolution bundler) would try to
    // resolve the literal from the test file's own directory and fail.
    const modulePath = '/src/primitives/input-mask.ts';
    const { createInputMask } = (await import(/* @vite-ignore */ modulePath)) as {
      createInputMask: (el: HTMLInputElement, o: Record<string, unknown>) => {
        detach(): void;
        setValue(v: string): void;
      };
    };
    window.__probes = {};
    window.__mk = (id, options) => {
      const el = document.createElement('input');
      el.id = id;
      el.setAttribute('aria-label', id);
      el.style.cssText = 'display:block;width:22rem;margin:.25rem 0;padding:.4rem;font:16px ui-monospace,monospace';
      document.body.prepend(el);
      const events: Array<Record<string, unknown>> = [];
      const token = `${id}-${Math.random()}`;
      const mask = createInputMask(el, {
        ...options,
        onInput: (d: unknown) => events.push({ t: 'input', ...(d as object) }),
        onReject: (d: unknown) => events.push({ t: 'reject', ...(d as object) }),
      });
      window.__probes[id] = { el, mask, events, token };
    };
    window.__st = (id) => {
      const p = window.__probes[id]!;
      const live = document.getElementById(id);
      return {
        value: p.el.value,
        start: p.el.selectionStart,
        end: p.el.selectionEnd,
        focused: document.activeElement === p.el,
        token: p.token,
        sameNode: live === p.el,
        events: p.events.slice(),
      };
    };
  });
  return errors;
}

const mk = (page: Page, id: string, options: Record<string, unknown>) =>
  page.evaluate(([i, o]) => window.__mk(i as string, o as Record<string, unknown>), [id, options] as const);
const st = (page: Page, id: string) => page.evaluate((i) => window.__st(i), id);
const detach = (page: Page, id: string) =>
  page.evaluate((i) => {
    window.__probes[i]!.mask.detach();
    window.__probes[i]!.el.value = '';
  }, id);

test.describe('input-mask IVP (real Chromium)', () => {
  // ---------------------------------------------------------------------------
  // 1. Per-key typing, with focus and node identity checked on EVERY key.
  // ---------------------------------------------------------------------------
  test('1. pressSequentially: chg4821 -> CHG-4821, per key, focus + node identity held', async ({ page }) => {
    const errors = await boot(page);
    await mk(page, 'p1', { format: '@@@-####', caseMode: 'upper' });
    const field = page.locator('#p1');
    await field.click();

    // Measured in a real browser, not predicted: the caret jumps 3 -> 5 on the
    // '4' because the mask inserts the '-' in front of it.
    const expected: Array<[string, string, number]> = [
      ['c', 'C', 1],
      ['h', 'CH', 2],
      ['g', 'CHG', 3],
      ['4', 'CHG-4', 5],
      ['8', 'CHG-48', 6],
      ['2', 'CHG-482', 7],
      ['1', 'CHG-4821', 8],
    ];
    const first = await st(page, 'p1');
    for (const [key, value, caret] of expected) {
      // Note on method: `pressSequentially` focuses the locator on each call, so
      // the focus assertion below is what catches a focus loss caused by the
      // PREVIOUS key -- it runs before the next call can silently restore it.
      await field.pressSequentially(key);
      const s = await st(page, 'p1');
      expect(s.value, `after '${key}'`).toBe(value);
      expect(s.start, `caret after '${key}'`).toBe(caret);
      expect(s.end).toBe(caret);
      expect(s.focused, `focus retained after '${key}'`).toBe(true);
      expect(s.sameNode, `node identity after '${key}'`).toBe(true);
      expect(s.token).toBe(first.token);
    }
    await page.screenshot({ path: join(SHOT_ROOT, 's1-per-key-typing.png') });

    // RED: revert the behavior in the page -- detach the masker and retype. The
    // browser alone produces the unmasked, unfolded string, so every assertion
    // above would fail.
    await detach(page, 'p1');
    await field.click();
    await field.pressSequentially('chg4821');
    const red = await st(page, 'p1');
    expect(red.value, 'probe-can-fail: unmasked field').toBe('chg4821');
    expect(red.start).toBe(7);

    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 2. Real `beforeinput` cancelation: at capacity the browser does NOT write.
  // ---------------------------------------------------------------------------
  test('2. typing at capacity is refused and the value is unchanged (real cancelation)', async ({ page }) => {
    const errors = await boot(page);
    await mk(page, 'p2', { format: '@@@-####', caseMode: 'upper' });
    const field = page.locator('#p2');
    await field.click();
    await field.pressSequentially('chg4821');
    const full = await st(page, 'p2');
    expect(full.value).toBe('CHG-4821');

    await field.pressSequentially('9');
    const after = await st(page, 'p2');
    // The browser held the pen here. jsdom could only say `preventDefault` ran.
    expect(after.value, 'value unchanged at capacity').toBe('CHG-4821');
    expect(after.start).toBe(8);
    // ...and it decided LOUDLY (§5.3).
    expect(after.events.at(-1)).toMatchObject({ t: 'reject', reason: 'full', data: '9' });

    // RED: detach and press the same key -- now the browser appends and the
    // "unchanged" assertion above is false.
    await page.evaluate(() => window.__probes.p2!.mask.detach());
    await field.click();
    await page.keyboard.press('End');
    await field.pressSequentially('9');
    expect((await st(page, 'p2')).value, 'probe-can-fail: uncanceled key writes').toBe('CHG-48219');

    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 3. §5.7 live: paste `V-123` into `V-***` through the SYSTEM clipboard.
  // ---------------------------------------------------------------------------
  test('3. paste V-123 into V-*** keeps every character (§5.7) -- naive normalizer reddens it', async ({ page, context }) => {
    const errors = await boot(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(page.url()).origin,
    });
    await mk(page, 'p3', { format: 'V-***' });
    const field = page.locator('#p3');
    await page.evaluate(() => navigator.clipboard.writeText('V-123'));
    await field.click();
    await page.keyboard.press('ControlOrMeta+v');

    const s = await st(page, 'p3');
    expect(s.value, 'no character lost to the leading literal').toBe('V-123');
    expect(s.start).toBe(5);
    // Nothing was clipped, so nothing was reported: no over-capacity noise.
    expect(s.events.filter((e) => e.t === 'reject')).toEqual([]);
    await page.screenshot({ path: join(SHOT_ROOT, 's3-paste-literal-prefix.png') });

    // RED, and the sharpest one in the file: rebuild the REAL module from the
    // dev server's own transformed source with the literal-consuming line of
    // `normalizeToRaw` DELETED, and import it as a blob module. That is the
    // naive normalizer the reference shipped, and it must lose a character.
    const planted = await page.evaluate(async () => {
      const absolutize = (t: string) =>
        t.replace(/(from\s*")(\/[^"]*)(")/g, (_m, a: string, p: string, c: string) => a + location.origin + p + c);
      const blob = (t: string) => URL.createObjectURL(new Blob([t], { type: 'text/javascript' }));

      const fieldMask = await (await fetch('/src/primitives/field-mask.ts')).text();
      // The one line that makes the normalizer literal-aware.
      const naive = fieldMask.replace(/^.*=== token\.toLowerCase\(\)\) read \+= 1;.*$/m, '');
      if (naive === fieldMask) throw new Error('plant did not apply -- the guard line moved');
      const naiveUrl = blob(absolutize(naive));

      let inputMask = await (await fetch('/src/primitives/input-mask.ts')).text();
      inputMask = inputMask.replace('"/src/primitives/field-mask.ts"', JSON.stringify(naiveUrl));
      const mod = (await import(/* @vite-ignore */ blob(absolutize(inputMask)))) as {
        createInputMask: (el: HTMLInputElement, o: Record<string, unknown>) => { setValue(v: string): void; detach(): void };
      };

      const el = document.createElement('input');
      document.body.append(el);
      const m = mod.createInputMask(el, { format: 'V-***' });
      m.setValue('V-123');
      const out = el.value;
      m.detach();
      el.remove();
      return out;
    });
    expect(planted, 'probe-can-fail: the reference defect, in a real browser').toBe('V-V12');

    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 4. Caret across a literal, mid-value insertion, selection replace, backspace.
  // ---------------------------------------------------------------------------
  test('4. caret: literal boundary, mid-value insert, selection replace, backspace across a separator', async ({ page }) => {
    const errors = await boot(page);
    await mk(page, 'p4', { format: '##/##/####' });
    const field = page.locator('#p4');
    await field.click();

    await field.pressSequentially('12');
    expect(await st(page, 'p4')).toMatchObject({ value: '12', start: 2, end: 2 });

    // The auto-inserted '/' arrives with the '3'; the caret must land AFTER it.
    await field.pressSequentially('3');
    const boundary = await st(page, 'p4');
    expect(boundary.value).toBe('12/3');
    expect(boundary.start, 'caret sits after the auto-inserted literal').toBe(4);
    expect(boundary.end).toBe(4);
    await page.screenshot({ path: join(SHOT_ROOT, 's4-caret-literal-boundary.png') });

    // Mid-value insertion at the very start: everything shifts right, caret sane.
    await page.evaluate(() => window.__probes.p4!.el.setSelectionRange(0, 0));
    await field.pressSequentially('9');
    expect(await st(page, 'p4')).toMatchObject({ value: '91/23', start: 1, end: 1 });

    // Selection replace: two characters selected, one typed.
    await page.evaluate(() => window.__probes.p4!.el.setSelectionRange(0, 2));
    await field.pressSequentially('7');
    expect(await st(page, 'p4')).toMatchObject({ value: '72/3', start: 1, end: 1 });

    // Backspace with the caret immediately AFTER the '/': the separator is not
    // content, so the character in front of it goes.
    await page.evaluate(() => window.__probes.p4!.el.setSelectionRange(3, 3));
    await page.keyboard.press('Backspace');
    expect(await st(page, 'p4')).toMatchObject({ value: '73', start: 1, end: 1 });

    // RED: detach, retype -- no literal is inserted, so the caret after '123'
    // is 3, not 4. The boundary assertion above cannot pass vacuously.
    await detach(page, 'p4');
    await field.click();
    await field.pressSequentially('123');
    const red = await st(page, 'p4');
    expect(red.value, 'probe-can-fail: unmasked').toBe('123');
    expect(red.start, 'probe-can-fail: no literal to step over').toBe(3);

    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 5. A REAL composition (CDP), and a consumer write deferred to compositionend.
  // ---------------------------------------------------------------------------
  test('5. IME: a real composition survives intact; a mid-composition write lands on compositionend', async ({ page, context }) => {
    const errors = await boot(page);
    const cdp = await context.newCDPSession(page);
    await mk(page, 'p5', { format: '@@@@@@@@' });
    await page.evaluate(() => {
      const p = window.__probes.p5!;
      (p as unknown as { log: string[] }).log = [];
      for (const k of ['compositionstart', 'compositionupdate', 'compositionend']) {
        p.el.addEventListener(k, () => (p as unknown as { log: string[] }).log.push(k));
      }
    });
    const log = () => page.evaluate(() => (window.__probes.p5! as unknown as { log: string[] }).log.slice());
    await page.locator('#p5').click();

    // A genuine IME composition, driven by the browser's own input pipeline.
    await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
    expect(await page.locator('#p5').inputValue(), 'the masker stands down mid-composition').toBe('にほ');
    expect(await log()).toContain('compositionstart');

    // §5.2 applied to the masker's OWN writes: a controlled consumer re-render
    // calling setValue mid-composition must not rewrite `.value` and kill the
    // composition. It is held.
    await page.evaluate(() => window.__probes.p5!.mask.setValue('ABCD'));
    expect(await page.locator('#p5').inputValue(), 'deferred, not applied').toBe('にほ');

    // Commit the composition. The deferred write wins, exactly once.
    await cdp.send('Input.insertText', { text: 'にほん' });
    expect(await log()).toContain('compositionend');
    const after = await st(page, 'p5');
    expect(after.value, 'the deferred write lands on compositionend').toBe('ABCD');
    await page.screenshot({ path: join(SHOT_ROOT, 's5-ime-deferred-write.png') });

    // RED: revert the precondition in the page -- end the composition first, so
    // there is nothing to defer and the write lands immediately.
    await mk(page, 'p5b', { format: '@@@@@@@@' });
    await page.locator('#p5b').click();
    await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
    await page.evaluate(() => window.__probes.p5b!.el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await page.evaluate(() => window.__probes.p5b!.mask.setValue('ABCD'));
    expect(await page.locator('#p5b').inputValue(), 'probe-can-fail: no composition, no deferral').toBe('ABCD');

    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 6. Undo -- text AND caret, on both paths. The fallback caret is RECORDED.
  // ---------------------------------------------------------------------------
  test('6. undo restores the prior text and caret; the diff-fallback caret is measured, not asserted away', async ({ page }, testInfo) => {
    const errors = await boot(page);
    await mk(page, 'p6', { format: '###-###-####' });
    const field = page.locator('#p6');
    await field.click();

    await field.pressSequentially('555');
    await page.keyboard.press('ArrowLeft'); // a nav key breaks the typing run
    await page.keyboard.press('End');
    await field.pressSequentially('1234');
    expect(await st(page, 'p6')).toMatchObject({ value: '555-123-4', start: 9 });

    await page.keyboard.press('ControlOrMeta+z');
    const undone = await st(page, 'p6');
    expect(undone.value, 'the second run is undone whole').toBe('555');
    expect(undone.start, 'and the caret comes back with it').toBe(3);
    expect(undone.end).toBe(3);

    await page.keyboard.press('ControlOrMeta+z');
    expect(await st(page, 'p6')).toMatchObject({ value: '', start: 0 });
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await st(page, 'p6')).toMatchObject({ value: '555', start: 3 });
    await page.screenshot({ path: join(SHOT_ROOT, 's6-undo-redo.png') });

    // The DIFF-FALLBACK path -- the browser mutated the field and the masker
    // only saw `input`. `input-mask.ts`'s header and task-3-review.md's Minor
    // both say the undo entry then holds the POST-edit caret against the
    // PRE-edit text. Task 3 deferred the measurement here. This is that
    // measurement: it is RECORDED, not turned into a pass or a failure.
    await mk(page, 'p6b', { format: '###-###-####' });
    await page.locator('#p6b').click();
    await page.locator('#p6b').pressSequentially('5551234567');
    const preEditCaret = (await st(page, 'p6b')).start;
    await page.evaluate(() => {
      const el = window.__probes.p6b!.el;
      el.setSelectionRange(12, 12);
      el.value = '555-123-45'; // a browser-driven edit the masker never intercepted
      el.setSelectionRange(10, 10);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(await page.locator('#p6b').inputValue(), 'the fallback reconciled the browser edit').toBe('555-123-45');
    await page.keyboard.press('ControlOrMeta+z');
    const fallback = await st(page, 'p6b');

    // The TEXT is the part that matters, and it is correct.
    expect(fallback.value, 'the text is restored exactly').toBe('555-123-4567');
    // The caret is the known imprecision. Record the number; assert only that
    // it is in range (which is the guarantee the module actually makes).
    expect(fallback.start).not.toBeNull();
    expect(fallback.start!).toBeGreaterThanOrEqual(0);
    expect(fallback.start!).toBeLessThanOrEqual(fallback.value.length);
    await testInfo.attach('undo-caret-on-the-diff-fallback-path', {
      body: JSON.stringify(
        {
          preEditCaret,
          caretUserHadWhenTheBrowserEdited: 12,
          caretAfterUndo: fallback.start,
          text: fallback.value,
          verdict:
            fallback.start === preEditCaret
              ? 'the documented imprecision did NOT reproduce'
              : 'the documented imprecision REPRODUCES: the caret is plausible, not the one the user had',
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });

    // RED, aimed at the load-bearing assertion just above ("the text is
    // restored exactly"): run the identical browser-driven edit on a field with
    // NO masker. The native history knows nothing about a programmatic `.value`
    // write, so Ctrl+Z restores nothing and the field keeps the truncated text.
    await mk(page, 'p6c', { format: '###-###-####' });
    await detach(page, 'p6c');
    await page.locator('#p6c').click();
    await page.locator('#p6c').pressSequentially('5551234567');
    await page.evaluate(() => {
      const el = window.__probes.p6c!.el;
      el.setSelectionRange(10, 10);
      el.value = '55512345';
      el.setSelectionRange(8, 8);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.keyboard.press('ControlOrMeta+z');
    expect((await st(page, 'p6c')).value, 'probe-can-fail: no masker, nothing restored').toBe('55512345');

    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 7. Copy policy, read back off the SYSTEM clipboard.
  // ---------------------------------------------------------------------------
  test('7. copy policy: formatted vs canonical on a real select-all + copy', async ({ page, context }) => {
    const errors = await boot(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(page.url()).origin,
    });
    const read = () => page.evaluate(() => navigator.clipboard.readText());

    await mk(page, 'p7f', { format: '###-###-####', semantic: 'tel', copyPolicy: 'formatted' });
    await mk(page, 'p7c', { format: '###-###-####', semantic: 'tel', copyPolicy: 'canonical' });

    for (const id of ['p7f', 'p7c']) {
      await page.locator(`#${id}`).click();
      await page.locator(`#${id}`).pressSequentially('5551234567');
    }

    await page.locator('#p7f').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    const formatted = await read();
    expect(formatted, "copyPolicy 'formatted' puts the literals on the clipboard").toBe('555-123-4567');

    await page.locator('#p7c').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    const canonical = await read();
    expect(canonical, "copyPolicy 'canonical' puts the submitted value on the clipboard").toBe('5551234567');

    // RED: each expectation checked against the other field. The two policies
    // are genuinely distinguishable, so neither assertion is vacuous.
    expect(formatted).not.toBe(canonical);
    expect(canonical, 'probe-can-fail: canonical is not the formatted text').not.toBe('555-123-4567');
    await page.screenshot({ path: join(SHOT_ROOT, 's7-copy-policy.png') });

    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 9. CARET FLOOR: a leading literal run is not enterable. Owner's bar, ticket
  //    case: "I could only go back to the start of ####; the CHG- would remain."
  // ---------------------------------------------------------------------------
  test('9. floor: focus, Home, ArrowLeft and a real click into `CHG-` all land on the first fill', async ({ page }) => {
    const errors = await boot(page);
    await mk(page, 'p9', { format: 'CHG-####', guide: 'CHG-    ' });
    const field = page.locator('#p9');
    const box = (await field.boundingBox())!;
    // Inside the rendered `CHG-` prefix: the probe styles the field 16px monospace
    // with .4rem padding, so a few pixels past the left edge is character 0.
    const inPrefix = { x: box.x + 8, y: box.y + box.height / 2 };

    // FOCUS. Not covered by `selectionchange`: entering a field whose caret is
    // already at 0 changes no selection, so nothing fires and only the `focus`
    // clamp puts the caret on the floor.
    await page.evaluate(() => window.__probes.p9!.el.setSelectionRange(0, 0));
    await page.evaluate(() => window.__probes.p9!.el.focus());
    expect((await st(page, 'p9')).start, 'focus lands at CHG-|####').toBe(4);

    await field.pressSequentially('4821');
    expect(await st(page, 'p9')).toMatchObject({ value: 'CHG-4821', start: 8 });

    await page.keyboard.press('Home');
    expect((await st(page, 'p9')).start, 'Home stops at the floor, not 0').toBe(4);

    await page.keyboard.press('ArrowLeft');
    expect((await st(page, 'p9')).start, 'ArrowLeft cannot walk out of the floor').toBe(4);

    // A REAL mouse click, with the browser choosing the offset from the pixel.
    await page.mouse.click(inPrefix.x, inPrefix.y);
    expect((await st(page, 'p9')).start, 'a click in the prefix snaps right').toBe(4);

    // A drag-selection that starts inside the prefix clamps its anchor too.
    await page.keyboard.press('ControlOrMeta+a');
    const all = await st(page, 'p9');
    expect([all.start, all.end], 'select-all covers the editable window only').toEqual([4, 8]);
    await page.screenshot({ path: join(SHOT_ROOT, 's9-caret-floor.png') });

    // Backspace at the floor is a no-op even with content ahead of it -- there is nothing
    // BEHIND the caret, and the literal run is not content. This is the owner's sentence
    // measured directly: "I could only go back to the start of ####; the CHG- would remain."
    await page.evaluate(() => window.__probes.p9!.el.setSelectionRange(5, 5));
    await page.keyboard.press('Backspace');
    expect((await st(page, 'p9')).value, 'the first fill went').toBe('CHG-821 ');
    expect((await st(page, 'p9')).start, 'and the caret is now on the floor').toBe(4);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    expect((await st(page, 'p9')).value, 'further backspaces at the floor do nothing').toBe('CHG-821 ');

    // Emptying it from the frontier still leaves the prefix standing.
    await page.keyboard.press('End');
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Backspace');
    const emptied = await st(page, 'p9');
    expect(emptied.value, 'the prefix survives an emptied field').toBe('CHG-    ');
    expect(emptied.start, 'and the caret rests on the floor').toBe(4);

    // RED: detach the masker and repeat the two measurements. The browser alone
    // puts the caret wherever it was asked to, inside the literal run.
    await page.evaluate(() => window.__probes.p9!.mask.detach());
    await page.mouse.click(inPrefix.x, inPrefix.y);
    expect((await st(page, 'p9')).start, 'probe-can-fail: unclamped click rests in the prefix').toBe(0);
    await page.keyboard.press('Home');
    expect((await st(page, 'p9')).start, 'probe-can-fail: unclamped Home goes to 0').toBe(0);

    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 10. FILL FRONTIER: the guide tail is a template, not a place to stand.
  //     Owner's date case, in his own notation: `12/23/4|yyy`.
  // ---------------------------------------------------------------------------
  test('10. frontier: End and a real click into the `yyy` tail both snap back to one past the last filled character', async ({ page }) => {
    const errors = await boot(page);
    await mk(page, 'p10', { format: '##/##/####', guide: 'mm/dd/yyyy' });
    const field = page.locator('#p10');
    await field.click();

    // The guide renders as the template it is, and typing overwrites it positionally.
    expect((await st(page, 'p10')).value, 'the empty field shows the template').toBe('mm/dd/yyyy');
    await field.pressSequentially('12234');
    const typed = await st(page, 'p10');
    expect(typed.value).toBe('12/23/4yyy');
    expect(typed.start, 'caret sits at 12/23/4|yyy').toBe(7);

    const box = (await field.boundingBox())!;
    const inTail = { x: box.x + box.width - 10, y: box.y + box.height / 2 };

    await page.keyboard.press('End');
    expect((await st(page, 'p10')).start, 'End stops at the frontier, not the format end').toBe(7);

    await page.mouse.click(inTail.x, inTail.y);
    expect((await st(page, 'p10')).start, 'a click into the tail snaps back').toBe(7);
    await page.screenshot({ path: join(SHOT_ROOT, 's10-fill-frontier.png') });

    // A selection dragged into the tail clamps as well.
    await page.evaluate(() => window.__probes.p10!.el.setSelectionRange(3, 10));
    await page.evaluate(() => window.__probes.p10!.el.dispatchEvent(new Event('selectionchange', { bubbles: true })));
    const dragged = await st(page, 'p10');
    expect([dragged.start, dragged.end], 'selection cannot extend into the guide tail').toEqual([3, 7]);

    // A caret BETWEEN filled characters is legal and is not disturbed.
    await page.mouse.click(box.x + 8, box.y + box.height / 2);
    const mid = await st(page, 'p10');
    expect(mid.start, 'the floor is 0 here -- no leading literal run').toBe(0);

    // RED: detach and repeat. The browser parks the caret at the end of the
    // template, which is the behavior the owner reported as wrong.
    await page.evaluate(() => window.__probes.p10!.mask.detach());
    await field.click();
    await page.keyboard.press('End');
    expect((await st(page, 'p10')).start, 'probe-can-fail: unclamped End reaches the template end').toBe(10);
    await page.mouse.click(inTail.x, inTail.y);
    expect((await st(page, 'p10')).start, 'probe-can-fail: unclamped click rests in the tail').toBe(10);

    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 8. The shipped story still masks (the composition the consumer actually sees).
  // ---------------------------------------------------------------------------
  test('8. MaskedFormats story: the date field masks in the real app composition', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(STORY);

    const date = page.getByLabel('Renewal date');
    await expect(date).toBeVisible();
    await date.click();
    await date.pressSequentially('12252026');
    await expect(date).toHaveValue('12/25/2026');
    expect(await date.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(10);

    // The ticket field, same story, the lenient normalizer.
    const ticket = page.getByLabel('Ticket');
    await ticket.click();
    await ticket.pressSequentially('chg4821');
    await expect(ticket).toHaveValue('CHG-4821');
    await page.screenshot({ path: join(SHOT_ROOT, 's8-story-masked-formats.png') });

    // RED: the same keystrokes into a bare unmasked input on the same page.
    await page.evaluate(() => {
      const el = document.createElement('input');
      el.id = 'plain';
      el.setAttribute('aria-label', 'plain control');
      document.body.prepend(el);
    });
    await page.locator('#plain').click();
    await page.locator('#plain').pressSequentially('12252026');
    await expect(page.locator('#plain'), 'probe-can-fail: an unmasked control').toHaveValue('12252026');

    expect(errors).toEqual([]);
  });
});
