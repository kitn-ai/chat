import { test, expect, type Page } from '@playwright/test';

/**
 * IVP (Independent Visual Proof) for <kai-composer>.
 *
 * Drives the real web component rendered by Storybook with NATIVE keyboard
 * events — the full `/`-menu → select → pill → submit and atomic-Backspace
 * flows that the jsdom unit tests and synthetic-userEvent story tests cannot
 * reliably prove. Also screenshots the result for visual comparison against the
 * design reference (icon + label pill rendered inline with typed text).
 *
 * Run: `npm run test:composer-ivp`
 * (Storybook must be serving on :6006.)
 */

const SKILLS_STORY = '/iframe.html?id=test-fixtures-composer--skills&viewMode=story';
const PREFILLED_STORY = '/iframe.html?id=test-fixtures-composer--prefilled&viewMode=story';
const DEFAULT_STORY = '/iframe.html?id=test-fixtures-composer--default&viewMode=story';
const HIGHLIGHTED_STORY = '/iframe.html?id=test-fixtures-composer--highlighted&viewMode=story';

/** Locator for the editable surface inside the element's (open) shadow root.
 *  Playwright pierces open shadow roots automatically. */
function editable(page: Page) {
  return page.locator('[data-kai-composer-editable]');
}
function pills(page: Page) {
  return page.locator('[data-kai-entity]');
}
function menuOptions(page: Page) {
  return page.locator('[role="option"]');
}

/** Install a capture for kai-submit on the host element. */
async function captureSubmit(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector('kai-composer');
    (window as unknown as { __submits: unknown[] }).__submits = [];
    host?.addEventListener('kai-submit', (e) => {
      (window as unknown as { __submits: unknown[] }).__submits.push(
        (e as CustomEvent).detail,
      );
    });
  });
}

async function readSubmits(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __submits: unknown[] }).__submits,
  );
}

test.describe('kai-composer IVP', () => {
  test('type / → select skill → pill inserted → submit emits structured doc', async ({ page }) => {
    await page.goto(SKILLS_STORY);
    await expect(editable(page)).toBeVisible();
    await captureSubmit(page);

    // Focus the editable and open the skill menu with a real "/" keystroke.
    await editable(page).click();
    await page.keyboard.type('/');

    // The caret-anchored menu appears with the configured skills.
    await expect(menuOptions(page).first()).toBeVisible();
    await expect(page.getByText('Record & Replay')).toBeVisible();

    // Select the first item (Record & Replay) with Enter — must NOT submit.
    await page.keyboard.press('Enter');

    // An atomic entity pill is now present. Skills render as LIGHT decorated
    // text led by their sigil (`/`), not an icon chip (per-kind decoration).
    await expect(pills(page)).toHaveCount(1);
    await expect(pills(page).first()).toContainText('Record & Replay');
    await expect(pills(page).first().locator('.kai-composer-pill-sigil')).toHaveText('/');
    expect(await readSubmits(page)).toHaveLength(0); // Enter selected, didn't submit

    // Continue typing — reproduces the reference image exactly.
    await page.keyboard.type(" I'm going to show y");

    // Screenshot the reproduced reference (pill + trailing text).
    await page
      .locator('kai-composer')
      .screenshot({ path: 'tests/e2e/__screenshots__/composer-skill-inline.png' });

    // Submit with Enter (menu closed now) → kai-submit fires.
    await page.keyboard.press('Enter');

    const submits = (await readSubmits(page)) as Array<{
      text: string;
      doc: Array<{ type: string; text?: string; entity?: { id: string; kind: string } }>;
      entities: Array<{ id: string }>;
    }>;
    expect(submits).toHaveLength(1);
    const detail = submits[0];
    // Default flatten uses promptText for the skill, then the trailing text.
    expect(detail.text).toBe("Use the Record & Replay skill. I'm going to show y");
    // Structured doc carries the entity reference for downstream expansion.
    expect(detail.doc[0]).toMatchObject({ type: 'entity', entity: { id: 'record-replay', kind: 'skill' } });
    expect(detail.doc[1]).toMatchObject({ type: 'text', text: " I'm going to show y" });
    expect(detail.entities).toHaveLength(1);
    expect(detail.entities[0].id).toBe('record-replay');
  });

  test('the trigger menu is anchored at the caret, not parked at the page origin', async ({ page }) => {
    await page.goto(SKILLS_STORY);
    await expect(editable(page)).toBeVisible();
    await editable(page).click();
    await page.keyboard.type('hello /'); // caret well away from (0,0)
    await expect(menuOptions(page).first()).toBeVisible();
    const menu = await page.locator('[role="listbox"]').boundingBox();
    const ed = await editable(page).boundingBox();
    // The menu must sit BELOW the caret line, not at the top-left page origin.
    expect(menu!.y).toBeGreaterThan(ed!.y);
    expect(menu!.x).toBeGreaterThan(5);
  });

  test('a trigger typed immediately after a pill opens the menu (no space needed)', async ({ page }) => {
    await page.goto(SKILLS_STORY);
    await expect(editable(page)).toBeVisible();
    await editable(page).click();
    await page.keyboard.type('/');
    await expect(menuOptions(page).first()).toBeVisible();
    await page.keyboard.press('Enter');             // insert a pill
    await expect(pills(page)).toHaveCount(1);
    // Immediately type '/' again — no leading space — the menu must reopen.
    await page.keyboard.type('/');
    await expect(menuOptions(page).first()).toBeVisible();
  });

  test('the menu excludes skills already added to the field', async ({ page }) => {
    await page.goto(SKILLS_STORY);
    await expect(editable(page)).toBeVisible();
    await editable(page).click();
    await page.keyboard.type('/');
    await expect(page.getByRole('option', { name: 'Record & Replay' })).toBeVisible();
    await page.keyboard.press('Enter');             // add Record & Replay
    await expect(pills(page)).toHaveCount(1);
    // Reopen the menu — Record & Replay must no longer be offered; Summarize still is.
    await page.keyboard.type('/');
    await expect(page.getByRole('option', { name: 'Summarize' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Record & Replay' })).toHaveCount(0);
  });

  test('Backspace removes the whole pill atomically', async ({ page }) => {
    await page.goto(SKILLS_STORY);
    await expect(editable(page)).toBeVisible();

    await editable(page).click();
    await page.keyboard.type('/');
    await expect(menuOptions(page).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(pills(page)).toHaveCount(1);

    // Caret sits right after the pill (+ its ZWSP). One Backspace deletes it whole.
    await page.keyboard.press('Backspace');
    await expect(pills(page)).toHaveCount(0);
    // The editable is empty text-wise (no stray label characters left behind).
    await expect(editable(page)).toHaveText(/^[​]*$/);
  });

  test('Arrow keys select a pill as one unit; arrow again steps past; Backspace deletes it', async ({ page }) => {
    await page.goto(SKILLS_STORY);
    await expect(editable(page)).toBeVisible();

    await editable(page).click();
    await page.keyboard.type('/');
    await expect(menuOptions(page).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(pills(page)).toHaveCount(1);

    const selected = page.locator('[data-kai-entity][data-selected]');

    // Caret sits after the pill — ArrowLeft selects the WHOLE pill as one unit.
    await page.keyboard.press('ArrowLeft');
    await expect(selected).toHaveCount(1);

    // ArrowLeft again steps the caret PAST the pill (deselects, doesn't enter it).
    await page.keyboard.press('ArrowLeft');
    await expect(selected).toHaveCount(0);

    // Caret is now before the pill — ArrowRight re-selects it as one unit.
    await page.keyboard.press('ArrowRight');
    await expect(selected).toHaveCount(1);

    // Backspace on a selected pill removes the whole unit (and emits no submit).
    await page.keyboard.press('Backspace');
    await expect(pills(page)).toHaveCount(0);
    await expect(selected).toHaveCount(0);
  });

  test('Backward arrow selects a pill across the zero-width filler typing leaves (regression)', async ({ page }) => {
    // Reproduces the real flow: text + a menu-inserted pill + more text leaves
    // empty/ZWSP filler nodes around the pill. Backward selection must skip them
    // (forward worked; backward used to walk past the pill without selecting).
    await page.goto(SKILLS_STORY);
    await expect(editable(page)).toBeVisible();
    await editable(page).click();
    await page.keyboard.type('hello ');
    await page.keyboard.type('/');
    await expect(menuOptions(page).first()).toBeVisible();
    await page.keyboard.press('Enter'); // insert the skill pill
    await page.keyboard.type(' world');
    await expect(pills(page)).toHaveCount(1);

    const selected = page.locator('[data-kai-entity][data-selected]');

    // Walk backward from the end — the pill MUST get selected before we pass it.
    await page.keyboard.press('End');
    let got = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('ArrowLeft');
      if (await selected.count()) { got = true; break; }
    }
    expect(got).toBe(true);

    // One more ArrowLeft steps past it (deselects, caret now before the pill).
    await page.keyboard.press('ArrowLeft');
    await expect(selected).toHaveCount(0);
  });

  test('keyword highlights register via the CSS Custom Highlight API', async ({ page }) => {
    await page.goto(HIGHLIGHTED_STORY);
    await expect(editable(page)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { CSS: { highlights?: { size: number } } }).CSS.highlights?.size ?? 0))
      .toBeGreaterThan(0);
  });

  test('setting highlights AFTER mount still registers (reactive highlights, the docs flow)', async ({ page }) => {
    // Reproduces how the docs <Example> wires props: the element mounts first,
    // then `value` and `highlights` are assigned as separate properties. The
    // deferred value-effect recomputes on `value`, so `highlights` must be
    // reactive on its own or it never applies.
    await page.goto(DEFAULT_STORY);
    await expect(editable(page)).toBeVisible();
    await page.evaluate(() => {
      const host = document.querySelector('kai-composer') as unknown as { value: string; highlights: unknown[] };
      host.value = 'Deploy TICKET-123 now';
      host.highlights = ['deploy', { pattern: 'TICKET-\\d+' }];
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { CSS: { highlights?: { size: number } } }).CSS.highlights?.size ?? 0))
      .toBeGreaterThan(0);
  });

  test('Prefilled doc renders a pill inline with text (reference shape)', async ({ page }) => {
    await page.goto(PREFILLED_STORY);
    await expect(editable(page)).toBeVisible();
    await expect(pills(page)).toHaveCount(1);
    await expect(pills(page).first()).toContainText('Record & Replay');
    await expect(editable(page)).toContainText("I'm going to show y");
    await page
      .locator('kai-composer')
      .screenshot({ path: 'tests/e2e/__screenshots__/composer-prefilled.png' });
  });

  test('placeholder reappears after the field is cleared (bogus <br> handled)', async ({ page }) => {
    await page.goto(DEFAULT_STORY);
    const ed = editable(page);
    await expect(ed).toBeVisible();
    // Placeholder is a ::before pseudo-element gated by the .kai-composer-empty class.
    await expect(ed).toHaveClass(/kai-composer-empty/);      // shown while empty
    await ed.click();
    await page.keyboard.type('hello');
    await expect(ed).not.toHaveClass(/kai-composer-empty/);  // hidden while typing
    for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
    await expect(ed).toHaveClass(/kai-composer-empty/);      // reappears once cleared (lone <br> ⇒ empty)
  });

  test('Tab selects the highlighted menu item (like Enter)', async ({ page }) => {
    await page.goto(SKILLS_STORY);
    await expect(editable(page)).toBeVisible();
    await editable(page).click();
    await page.keyboard.type('/');
    await expect(menuOptions(page).first()).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(pills(page)).toHaveCount(1);
    await expect(pills(page).first()).toContainText('Record & Replay');
  });

  test('after clearing, the caret returns to the START (not after the placeholder)', async ({ page }) => {
    await page.goto(DEFAULT_STORY);
    const ed = editable(page);
    await expect(ed).toBeVisible();
    await ed.click();
    await page.keyboard.type('hi');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(ed).toHaveClass(/kai-composer-empty/); // placeholder shown again
    const m = await page.evaluate(() => {
      const root = document.querySelector('kai-composer')!.shadowRoot!;
      const el = root.querySelector('[data-kai-composer-editable]') as HTMLElement;
      const sel = (root as unknown as { getSelection?: () => Selection }).getSelection?.() ?? document.getSelection()!;
      const caretX = sel.getRangeAt(0).cloneRange().getBoundingClientRect().left;
      return {
        caretOffsetFromLeft: caretX - el.getBoundingClientRect().left,
        beforePosition: getComputedStyle(el, '::before').position,
      };
    });
    expect(m.beforePosition).toBe('absolute');         // placeholder taken out of flow
    expect(m.caretOffsetFromLeft).toBeLessThan(24);    // caret at the start, not past the placeholder text
  });

  test('undo/redo steps through pills correctly (custom doc-snapshot history)', async ({ page }) => {
    await page.goto(SKILLS_STORY);
    const ed = editable(page);
    await expect(ed).toBeVisible();
    await ed.click();
    await page.keyboard.type('hello ');
    await page.keyboard.type('/');
    await expect(menuOptions(page).first()).toBeVisible();
    await page.keyboard.press('Enter');            // insert pill
    await expect(pills(page)).toHaveCount(1);
    await page.keyboard.type(' world');
    await expect(ed).toContainText('world');
    await expect(pills(page)).toHaveCount(1);

    // Undo #1: removes " world", pill stays.
    await page.keyboard.press('Meta+z');
    await expect(ed).not.toContainText('world');
    await expect(pills(page)).toHaveCount(1);
    // Undo #2: removes the PILL (native undo left it stuck — this is the core fix).
    await page.keyboard.press('Meta+z');
    await expect(pills(page)).toHaveCount(0);

    // Redo: the pill comes back intact (native redo corrupted ordering).
    await page.keyboard.press('Meta+Shift+z'); // re-add pill step
    await expect(pills(page)).toHaveCount(1);
    await expect(pills(page).first()).toContainText('Record & Replay');
    await page.keyboard.press('Meta+Shift+z'); // re-add " world"
    await expect(ed).toContainText('world');
    await expect(pills(page)).toHaveCount(1);
  });

  test('emits kai-focus/kai-blur on the host; native keydown reaches the host too', async ({ page }) => {
    await page.goto(SKILLS_STORY);
    await expect(editable(page)).toBeVisible();
    await page.evaluate(() => {
      const host = document.querySelector('kai-composer')!;
      const w = window as unknown as { __ev: { focus: number; blur: number; nativeKeydown: number } };
      w.__ev = { focus: 0, blur: 0, nativeKeydown: 0 };
      host.addEventListener('kai-focus', () => { w.__ev.focus++; });
      host.addEventListener('kai-blur', () => { w.__ev.blur++; });
      // keydown is composed → it crosses the shadow boundary to the host natively,
      // so consumers don't need a kai-keydown wrapper.
      host.addEventListener('keydown', () => { w.__ev.nativeKeydown++; });
    });

    await editable(page).click();        // focus
    await page.keyboard.type('x');       // native keydown reaches the host
    await page.mouse.click(2, 2);        // click outside → blur

    const ev = await page.evaluate(() => (window as unknown as {
      __ev: { focus: number; blur: number; nativeKeydown: number };
    }).__ev);

    expect(ev.focus).toBeGreaterThanOrEqual(1);
    expect(ev.blur).toBeGreaterThanOrEqual(1);
    expect(ev.nativeKeydown).toBeGreaterThanOrEqual(1); // composed native keydown reaches the host
  });
});
