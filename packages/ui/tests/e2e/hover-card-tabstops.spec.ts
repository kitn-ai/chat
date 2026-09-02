import { test, expect, type Page } from '@playwright/test';

/**
 * ★ THE KEYBOARD, PRESSED. NOT SIMULATED.
 *
 * This file exists because a keyboard claim in this repo has now been verified
 * by a non-keyboard mechanism twice, and both times it hid a real defect:
 *
 *   1. `tests/ui/hover-card.test.tsx` asserted "opens on focus (keyboard)" with
 *      `fireEvent.focusIn(trigger)`, which proves the handler is wired and
 *      nothing about whether focus can arrive. The trigger set no `tabindex`,
 *      so Tab skipped it entirely.
 *   2. The replacement used `el.focus()`. That moves focus for real, but
 *      programmatic focus is not the Tab key: it does not consult tab order,
 *      and — measured here — it takes a different code path through Solid's
 *      event delegation, so a card that opens on `.focus()` can stay shut on a
 *      real Tab.
 *
 * jsdom has no tab-order engine and cannot press Tab, so no amount of care in
 * that layer can close this. `page.keyboard.press('Tab')` can. Everything in
 * this file goes through it.
 *
 * Run: `npm run test:hovercard`
 */

const FIXTURE = '/tests/e2e/fixtures/hover-card-tabstops.html';

/** Where focus is, following into shadow roots, as a stable id-ish label. */
async function activeLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    let el: Element | null = document.activeElement;
    // document.activeElement stops at the shadow host; walk down.
    while (el && (el as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot?.activeElement) {
      el = (el as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot.activeElement;
    }
    if (!el) return 'none';
    if (el.id) return `#${el.id}`;
    const host = el.getRootNode() as ShadowRoot;
    const hostId = host instanceof ShadowRoot ? (host.host as HTMLElement).id : '';
    return `${hostId ? `${hostId}>` : ''}${el.tagName.toLowerCase()}${
      el.hasAttribute('tabindex') ? `[tabindex=${el.getAttribute('tabindex')}]` : ''
    }`;
  });
}

/**
 * Tab from `#before` until focus reaches `#after`, collecting every stop in
 * between. The sentinels are what make the count trustworthy: a run that never
 * reaches `#after` is a broken widget, not a small number.
 */
async function tabStopsBetweenSentinels(page: Page): Promise<string[]> {
  await page.locator('#before').focus();
  const stops: string[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const label = await activeLabel(page);
    if (label === '#after') return stops;
    stops.push(label);
  }
  throw new Error(`Tab never reached #after; stops so far: ${JSON.stringify(stops)}`);
}

/**
 * Tab until focus is on the TRIGGER inside `hostId`, however many stops that
 * takes. Deliberately not a fixed count: the stop count is what the other
 * describe block measures, and hard-coding it here would make these tests fail
 * for that reason instead of their own.
 */
async function tabToTriggerInside(page: Page, hostId: string): Promise<void> {
  await page.locator('#before').focus();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const label = await activeLabel(page);
    if (label.startsWith(`${hostId}>`) && label.includes('span')) return;
    if (label === '#after') break;
  }
  throw new Error(`never reached the trigger inside #${hostId} by tabbing`);
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('body[data-ready="1"]')).toBeAttached();
});

test.describe('exactly one tab stop per hover card, in every child configuration', () => {
  test('A slotted focusable child does not also make the trigger a stop', async ({ page }) => {
    const stops = await tabStopsBetweenSentinels(page);
    // The slotted <a> is the stop for card A. If the trigger stamps its own
    // tabindex, A contributes TWO and this list grows.
    const aStops = stops.filter((s) => s === '#a-link' || s.startsWith('a>'));
    expect(aStops, `stops inside kai-hover-card#a: ${JSON.stringify(stops)}`).toHaveLength(1);
    expect(aStops[0]).toBe('#a-link');
  });

  test('an inert slotted child leaves the trigger as the one stop', async ({ page }) => {
    const stops = await tabStopsBetweenSentinels(page);
    const bStops = stops.filter((s) => s === '#b-inert' || s.startsWith('b>'));
    expect(bStops, `stops inside kai-hover-card#b: ${JSON.stringify(stops)}`).toHaveLength(1);
    // ...and it is the TRIGGER, not the inert div.
    expect(bStops[0]).toContain('span');
  });

  test('a direct focusable child stays a single stop', async ({ page }) => {
    const stops = await tabStopsBetweenSentinels(page);
    const cStops = stops.filter((s) => s.startsWith('c>'));
    expect(cStops, `stops inside kai-source#c: ${JSON.stringify(stops)}`).toHaveLength(1);
  });

  /**
   * A card that CANNOT open must not be a tab stop at all.
   *
   * `HoverCardRoot.enter()` early-returns while `disabled`, so a focusable
   * disabled trigger is a stop that announces nothing and reveals nothing —
   * exactly the dead stop the `aria-describedby` rationale on `HoverCardTrigger`
   * argues against. It is also a regression rather than a pre-existing gap: the
   * trigger was never focusable before this branch. No shipped composition sets
   * `disabled` (attachments never do), which is why it was not caught by the
   * thread measurements.
   */
  test('a disabled hover card is not a tab stop at all', async ({ page }) => {
    const stops = await tabStopsBetweenSentinels(page);
    expect(
      stops.filter((s) => s === '#e-inert' || s.startsWith('e>')),
      `a disabled card must contribute zero stops — tab stops: ${JSON.stringify(stops)}`,
    ).toHaveLength(0);
  });

  test('no hover card anywhere contributes more than one stop', async ({ page }) => {
    // The blunt version of the three above: it catches an extra stop appearing
    // somewhere none of them thought to look. Scoped per widget rather than as
    // one total, because config D is an entire `<kai-chat>` — a scroll region, a
    // composer and its buttons are all legitimate stops, and folding them into a
    // single expected number would make this assertion a magic constant that
    // breaks whenever the composer gains a control.
    const stops = await tabStopsBetweenSentinels(page);
    const ctx = `tab stops: ${JSON.stringify(stops)}`;

    expect(stops.filter((s) => s === '#a-link' || s.startsWith('a>')), ctx).toHaveLength(1);
    expect(stops.filter((s) => s === '#b-inert' || s.startsWith('b>')), ctx).toHaveLength(1);
    expect(stops.filter((s) => s.startsWith('c>')), ctx).toHaveLength(1);
    // Inside the chat, exactly one stop belongs to the attachment tile's trigger.
    expect(stops.filter((s) => s === 'd>span[tabindex=0]'), ctx).toHaveLength(1);
  });
});

test.describe('the focus-open path works on a real Tab, not only on .focus()', () => {
  test('tabbing onto a trigger opens its card and resolves aria-describedby', async ({ page }) => {
    // Card B: inert children, so the trigger itself is the stop — the exact
    // configuration where `aria-describedby` is the reason the stop is worth
    // arriving at, and the exact one where Solid's DELEGATED focusin did not
    // fire on a real Tab.
    await tabToTriggerInside(page, 'b');

    const state = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 400)); // openDelay + a margin
      const host = document.getElementById('b') as HTMLElement & { shadowRoot: ShadowRoot };
      const root = host.shadowRoot;
      const trigger = root.querySelector('[tabindex="0"]') as HTMLElement | null;
      const describedby = trigger?.getAttribute('aria-describedby') ?? null;
      const card = root.querySelector('[data-hovercard-content]');
      return {
        describedby,
        cardOpen: !!card,
        // The card's own content is SLOTTED here, so `textContent` on the
        // shadow node is "" by definition — assert the projection instead.
        cardProjects: !!(card?.querySelector('slot[name="card"]') as HTMLSlotElement | null)
          ?.assignedElements().length,
        describedbyResolves: describedby
          ? !!(root.querySelector(`#${CSS.escape(describedby)}`))
          : false,
      };
    });

    expect(state.cardOpen, 'the card must open on a real Tab').toBe(true);
    expect(state.describedby, 'aria-describedby must be set while open').not.toBeNull();
    expect(state.describedbyResolves, 'aria-describedby must point at a real node').toBe(true);
    expect(state.cardProjects, 'the card content must actually project').toBe(true);
  });

  /**
   * ★★ DO NOT SIMPLIFY THIS AWAY INTO THE PRIMITIVE FIXTURES ABOVE. THIS IS THE
   * TEST THAT DISCRIMINATES.
   *
   * An attachment tile inside a mounted `<kai-chat>` has no slot anywhere near
   * its trigger and sits much deeper in the shadow tree than config B, and that
   * difference is not cosmetic — it is the whole reason this file exists:
   *
   *   - When the focus-open regression was live, config B (`<kai-hover-card>`
   *     with an inert slotted child) OPENED correctly on a real Tab. A suite
   *     built only from the primitive would have reported the bug ABSENT.
   *   - Independent verification later broke the fix a second way, and again
   *     only this test went red — the primitive-fixture tests both stayed green.
   *
   * Twice now, "the primitive works" has been false evidence about the
   * composition that ships. Keep a REAL `<kai-chat>` in this file.
   */
  test('tabbing onto an attachment tile in a real thread opens its card', async ({ page }) => {
    await tabToTriggerInside(page, 'd');

    const state = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 400));
      const host = document.getElementById('d') as HTMLElement & { shadowRoot: ShadowRoot };
      const root = host.shadowRoot;
      const trigger = root.querySelector('.group [tabindex="0"]') as HTMLElement | null;
      const card = root.querySelector('[data-hovercard-content]');
      return {
        describedby: trigger?.getAttribute('aria-describedby') ?? null,
        cardOpen: !!card,
        cardText: card?.textContent?.trim() ?? null,
      };
    });

    expect(state.cardOpen, 'the tile card must open on a real Tab').toBe(true);
    expect(state.describedby, 'aria-describedby must be set while open').not.toBeNull();
    // Not slotted here — the thread composes the card content directly.
    expect(state.cardText).toContain('application/pdf');
  });

  test('tabbing away closes it again', async ({ page }) => {
    await tabToTriggerInside(page, 'b');
    await page.waitForTimeout(400);
    // Prove it was OPEN first, or "closed" is indistinguishable from "never
    // opened" and this test passes vacuously on a completely broken trigger.
    const openedFirst = await page.evaluate(() => {
      const host = document.getElementById('b') as HTMLElement & { shadowRoot: ShadowRoot };
      return !!host.shadowRoot.querySelector('[data-hovercard-content]');
    });
    expect(openedFirst, 'must be open before closing means anything').toBe(true);

    await page.keyboard.press('Tab'); // away
    await page.waitForTimeout(700); // closeDelay 300 + presence unmount + margin

    const open = await page.evaluate(() => {
      const host = document.getElementById('b') as HTMLElement & { shadowRoot: ShadowRoot };
      return !!host.shadowRoot.querySelector('[data-hovercard-content]');
    });
    expect(open).toBe(false);
  });
});
