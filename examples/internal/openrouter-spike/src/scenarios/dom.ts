// Shadow-piercing assertion helpers for the scenario modules.
//
// THE RULE these exist to enforce: an assertion must look at what a user can
// SEE. `<kai-thread>` renders into an OPEN shadow root, and Playwright's css /
// text engines pierce open shadow roots, so `page.getByText(...)` reaches the
// tool panel's "Completed" chip and a card's buttons directly. Reading
// `window.__kaiHarness.messages` would prove the wire adapter ran and would say
// nothing about whether anything rendered — a previous version of this very app
// showed a "Completed" badge seeded from fixture data while the live loop had
// never run once.
//
// "Expanded" is likewise defined as CONTENT THE USER CAN SEE, not an attribute:
// a closed <kai-tool> keeps its panel in the DOM at `grid-rows-[0fr]` and a
// closed <kai-reasoning> keeps its body at `max-height: 0px`, so both collapse
// to a zero-height box that Playwright correctly reports as not visible. That is
// the check that would have caught the remount bug; `data-state` would not,
// because the freshly remounted panel reported `closed` perfectly happily.
//
// No `@playwright/test` VALUE is imported: everything works through methods on
// the `Page`/`Locator` objects the runner passes in, which keeps these modules
// importable from the browser bundle.
import type { Locator, Page } from '@playwright/test';
import { WEATHER_CARD_TAG } from '../cards';
import { ScenarioAssertionError } from './types';

/** Default wait for a piece of rendered state to appear. Generous, because a
 *  live model turn plus a tool round can take a few seconds. */
export const VISIBLE_TIMEOUT = 20_000;

function quote(text: string | RegExp): string {
  return typeof text === 'string' ? JSON.stringify(text) : String(text);
}

/** Assert some text is VISIBLE somewhere on the page (shadow roots included). */
export async function seesText(
  page: Page,
  text: string | RegExp,
  opts: { because?: string; timeout?: number } = {},
): Promise<void> {
  const loc = page.getByText(text).first();
  try {
    await loc.waitFor({ state: 'visible', timeout: opts.timeout ?? VISIBLE_TIMEOUT });
  } catch {
    throw new ScenarioAssertionError(
      `expected visible text ${quote(text)}${opts.because ? ` — ${opts.because}` : ''}, ` +
        `but nothing matching it became visible within ${opts.timeout ?? VISIBLE_TIMEOUT}ms`,
    );
  }
}

/** Assert an accessible-name match is visible (buttons, links, headings…). */
export async function seesRole(
  page: Page,
  role: Parameters<Page['getByRole']>[0],
  name: string | RegExp,
  opts: { because?: string; timeout?: number } = {},
): Promise<void> {
  const loc = page.getByRole(role, { name }).first();
  try {
    await loc.waitFor({ state: 'visible', timeout: opts.timeout ?? VISIBLE_TIMEOUT });
  } catch {
    throw new ScenarioAssertionError(
      `expected a visible ${role} named ${quote(name)}${opts.because ? ` — ${opts.because}` : ''}, ` +
        `but none became visible within ${opts.timeout ?? VISIBLE_TIMEOUT}ms`,
    );
  }
}

/** Assert a specific element renders. `state` is `visible` by default; pass
 *  `attached` for something with no box of its own (a custom element wrapping
 *  its own shadow content). Raw `locator.waitFor()` throws Playwright's own
 *  "Timeout 20000ms exceeded" with the selector in a call log, which says
 *  nothing about what was being proved — and a `knownGap` precondition is the
 *  one place a mystery timeout must never be mistaken for the gap itself. */
export async function seesElement(
  locator: Locator,
  what: string,
  opts: { because?: string; state?: 'visible' | 'attached'; timeout?: number } = {},
): Promise<void> {
  const timeout = opts.timeout ?? VISIBLE_TIMEOUT;
  try {
    await locator.first().waitFor({ state: opts.state ?? 'visible', timeout });
  } catch {
    throw new ScenarioAssertionError(
      `expected ${what} to render${opts.because ? ` — ${opts.because}` : ''}, ` +
        `but nothing matched within ${timeout}ms`,
    );
  }
}

/** Assert a locator eventually resolves to at least `n` nodes. */
export async function seesAtLeast(
  page: Page,
  locator: Locator,
  n: number,
  what: string,
  timeout = VISIBLE_TIMEOUT,
): Promise<void> {
  const deadline = Date.now() + timeout;
  let seen = 0;
  for (;;) {
    seen = await locator.count();
    if (seen >= n) return;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(120);
  }
  throw new ScenarioAssertionError(`expected at least ${n} ${what}, saw ${seen} after ${timeout}ms`);
}

/** Assert a locator resolves to EXACTLY `n` nodes right now. */
export async function seesExactly(locator: Locator, n: number, what: string): Promise<void> {
  const seen = await locator.count();
  if (seen !== n) throw new ScenarioAssertionError(`expected exactly ${n} ${what}, saw ${seen}`);
}

/** Assert text is NOT visible. Polls for `settle` ms so it cannot pass merely by
 *  running before the thing had a chance to appear. */
export async function neverSeesText(
  page: Page,
  text: string | RegExp,
  what: string,
  settle = 1500,
): Promise<void> {
  const deadline = Date.now() + settle;
  while (Date.now() < deadline) {
    if (await page.getByText(text).first().isVisible().catch(() => false)) {
      throw new ScenarioAssertionError(`expected ${what}, but ${quote(text)} is visible`);
    }
    await page.waitForTimeout(100);
  }
}

/** Every rendered message-content bubble, in document order. `part="bubble
 *  content"` is published API (it is what a consumer targets with `::part`), so
 *  it is a stable handle on "the prose the user reads". */
export function bubbles(page: Page): Locator {
  return page.locator('[part~="content"]');
}

/** The last bubble — the assistant's answer, in a one-turn thread. */
export function answer(page: Page): Locator {
  return bubbles(page).last();
}

/** Wait until the answer holds at least `min` characters, and hand back how many.
 *
 *  Uses a LOCATOR, not `page.waitForFunction`: the thread renders inside an open
 *  shadow root, and `document.querySelector` does not pierce shadow roots even
 *  though Playwright's locators do. A `waitForFunction` written against
 *  `document` here would simply never resolve. */
export async function waitForAnswerLength(page: Page, min: number, timeout = VISIBLE_TIMEOUT): Promise<number> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const n = ((await answer(page).textContent().catch(() => '')) ?? '').length;
    if (n >= min) return n;
    if (Date.now() > deadline) return n;
    await page.waitForTimeout(100);
  }
}

/** Assert the assistant produced at least `min` characters of visible prose. */
export async function seesProse(page: Page, min: number, timeout = VISIBLE_TIMEOUT): Promise<string> {
  const deadline = Date.now() + timeout;
  let text = '';
  for (;;) {
    text = ((await answer(page).textContent().catch(() => '')) ?? '').trim();
    if (text.length >= min) return text;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(150);
  }
  throw new ScenarioAssertionError(
    `expected at least ${min} characters of visible assistant prose, saw ${text.length}: ${JSON.stringify(text.slice(0, 120))}`,
  );
}

/** Vertical document order of a locator, for asserting stream order SURVIVED
 *  into the layout (parts render where they arrived, not grouped by kind). */
export async function topOf(locator: Locator, what: string): Promise<number> {
  const box = await locator.first().boundingBox().catch(() => null);
  if (!box) throw new ScenarioAssertionError(`${what} has no layout box — it is not rendered`);
  return box.y;
}

/** Assert `a` renders above `b`. */
export async function rendersAbove(a: Locator, aWhat: string, b: Locator, bWhat: string): Promise<void> {
  const [ay, by] = [await topOf(a, aWhat), await topOf(b, bWhat)];
  if (!(ay < by)) {
    throw new ScenarioAssertionError(`expected ${aWhat} to render above ${bWhat}, but y=${ay} is not above y=${by}`);
  }
}

// ── disclosures ──────────────────────────────────────────────────────────────

/** The `<kai-tool>` panel trigger for a given tool. The trigger carries the tool
 *  NAME in a font-mono span, which is the only user-visible handle on "which
 *  tool is this". */
export function toolTrigger(page: Page, toolName: string): Locator {
  return page.locator('button[aria-controls]').filter({ hasText: toolName }).first();
}

/** The panel a disclosure trigger controls, resolved through `aria-controls`. */
export async function controlledPanel(page: Page, trigger: Locator): Promise<Locator> {
  const id = await trigger.getAttribute('aria-controls');
  if (!id) throw new ScenarioAssertionError('disclosure trigger has no aria-controls to follow');
  // CSS.escape equivalent for the ids Solid's createUniqueId emits (`cl-9`).
  return page.locator(`[id="${id}"]`);
}

/** The `<kai-reasoning>` trigger. `label` is the reasoning part's own label,
 *  which the spike sets to "Thinking". */
export function reasoningTrigger(page: Page, label = 'Thinking'): Locator {
  return page.getByRole('button', { name: label }).first();
}

/** The reasoning body: the sibling div immediately after the trigger. Reasoning
 *  predates the Collapsible primitive and has no aria-controls (a gap worth
 *  noting — it also means no `aria-expanded`). */
export function reasoningBody(trigger: Locator): Locator {
  return trigger.locator('xpath=following-sibling::div[1]');
}

/** Is any content inside this panel actually visible to a user? */
export async function panelShowsContent(panel: Locator): Promise<boolean> {
  const box = await panel.boundingBox().catch(() => null);
  return !!box && box.height > 1;
}

/** Click a disclosure trigger and confirm its panel really opened. */
export async function expand(trigger: Locator, panel: Locator, what: string): Promise<void> {
  await trigger.click();
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (await panelShowsContent(panel)) return;
    await trigger.page().waitForTimeout(80);
  }
  throw new ScenarioAssertionError(`clicked the ${what} trigger but its panel never became visible`);
}

// ── the consumer card seam ───────────────────────────────────────────────────

/**
 * Every `<spike-weather-card>` the THREAD rendered.
 *
 * This is the only handle in the harness on the consumer `cardTypes` seam, and
 * the tag is the whole point: `weather` is not one of the kit's seven built-in
 * card types, so an element with this name on screen can ONLY have come from
 * `ThreadView` handing `<kai-thread>` a `cardTypes` entry and `mergeCardTags`
 * putting it in the map. Scoped to `kai-thread` so it can never count something
 * the app rendered outside the message list.
 */
export function consumerCards(page: Page): Locator {
  return page.locator(`kai-thread ${WEATHER_CARD_TAG}`);
}

/**
 * Assert the seam rendered EXACTLY `n` cards, each showing data that came out of
 * the tool run.
 *
 * The count is not decoration. "A card-producing scenario ran" and "the seam
 * rendered a card per tool call" are different facts, and only the second one
 * says the seam works: an upsert bug, a `mergeCardTags` regression that drops the
 * consumer entry for the second envelope, or a card that renders once and then
 * stops all read as "a card exists".
 *
 * `expect` is scoped INSIDE the card for the reason S13 learned the hard way: the
 * <kai-tool> panel a few inches up the thread echoes the tool's own output, so an
 * unscoped `getByText('Light rain')` passes off the panel while the card renders
 * as empty chrome. Empty chrome is exactly what a payload the card cannot read
 * produces, which is the failure this is here to catch.
 */
export async function seesConsumerCards(
  page: Page,
  n: number,
  expect: string[],
): Promise<void> {
  const cards = consumerCards(page);
  await seesElement(cards, `a <${WEATHER_CARD_TAG}> card`, {
    because:
      '`weather` is not a built-in card type — it can only render through the consumer `cardTypes` seam',
  });
  // Settle first: the count is the assertion, so reading it the instant the
  // first card appears would race a second one that is still arriving.
  await seesAtLeast(page, cards, n, `<${WEATHER_CARD_TAG}> cards`);
  const seen = await cards.count();
  if (seen !== n) {
    fail(
      `expected exactly ${n} consumer card(s) from the \`cardTypes\` seam, saw ${seen}. ` +
        'One per distinct observation: `AssistantStream.addCard` upserts on the envelope id.',
    );
  }
  for (let i = 0; i < expect.length; i++) {
    await seesElement(cards.nth(i).getByText(expect[i]), `"${expect[i]}" inside consumer card ${i + 1}`, {
      because:
        "the card must show the TOOL's own output, not just exist — the tool panel above it echoes the same text",
    });
  }
}

/** Fail with a formatted message. Used where a scenario's own logic decides. */
export function fail(message: string): never {
  throw new ScenarioAssertionError(message);
}
