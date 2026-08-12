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

/** Every rendered message-content bubble, in document order, WHOEVER wrote it.
 *  `part="bubble content"` is published API (it is what a consumer targets with
 *  `::part`), so it is a stable handle on "the prose somebody reads".
 *
 *  This is a POSITIONAL set and nothing more. Read the note under
 *  `bubblesOf` before reaching for `.last()` on it. */
export function bubbles(page: Page): Locator {
  return page.locator('[part~="content"]');
}

// ── which bubble belongs to WHOM ─────────────────────────────────────────────
//
// There used to be one helper here, `answer() = bubbles().last()`, described as
// "the assistant's answer". It is not. It is a POSITION, and until the assistant
// emits its first text delta the last bubble on screen is the user's own ECHOED
// PROMPT — so for the opening of every single turn `answer()` silently meant
// "the user". That is not a hypothetical: S17 clicked Stop at ~50ms, compared
// the 89-character prompt to itself, reported `grew=0`, and passed vacuously for
// its entire existence. `seesProse` had the identical defect and S01–S05 were
// green only because they happen to assert after the stream finished — green by
// WHEN THEY RUN, not by construction. Measured on this fixture set: pointed at
// the pre-delta window, `seesProse(page, 60)` hands S04 the user's own
// 153-character prompt, which satisfies its length bound AND all three of its
// `prose.includes(city)` checks, because the prompt names the three cities.
//
// So the assistant's bubble is now selected by SPEAKER. The kit does not put the
// speaker in the rendered DOM — `<Message role>` emits `data-role` /
// `role="article"` / `aria-label`, but neither `Thread` nor `ChatThread` passes
// it, so every row in a real `<kai-thread>` is an unlabelled generic div (see
// HARNESS.md, "The thread renders no role"). Until it does, the speaker has to
// be read off the two independent things the kit DOES render differently:
//
//   row alignment   user rows carry `items-end`, assistant rows `items-start`
//   bubble skin     user bubbles carry `bg-muted rounded-2xl`, assistant ones
//                   are markdown-rendered and carry `chat-markdown`
//
// Neither is a contract, so neither is trusted alone. Selection is by alignment;
// `assertBubbleRolesAreLegible` then requires the skin signal to AGREE with it
// and the two to account for every bubble on the page. Drop `items-start` from
// assistant rows and the locator matches nothing, so a scenario goes red on a
// timeout it can explain. Add `items-start` to USER rows — the regression that
// would quietly restore the original defect — and the two signals disagree and
// every read fails naming the drift. What must never happen again is the middle
// case: a locator that still resolves, to the wrong speaker, and stays green.

type Speaker = 'user' | 'assistant';

/** Signal 1: how the row is aligned. This is what SELECTS. */
const ROW_OF: Record<Speaker, string> = {
  user: '[part~="row"].items-end',
  assistant: '[part~="row"].items-start',
};

/** Signal 2: how the bubble is skinned. This is what CROSS-CHECKS. Independent
 *  of signal 1 — a different component sets it, off a different prop. */
const SKIN_OF: Record<Speaker, string> = {
  user: '[part~="content"].bg-muted',
  assistant: '[part~="content"].chat-markdown',
};

/** Every content bubble written by `who`, in document order. */
export function bubblesOf(page: Page, who: Speaker): Locator {
  return page.locator(`${ROW_OF[who]} [part~="content"]`);
}

/**
 * The assistant's current prose bubble — the last one IT wrote, never the
 * user's echo. A message renders one bubble per text part, so on a turn that
 * interleaves `text → tool → card → text` this is the closing prose, which is
 * what the scenarios that reach for it mean.
 *
 * Resolves to NOTHING until the assistant has actually emitted text. That is
 * the point: an assertion made too early now fails as "no assistant prose"
 * instead of passing off the prompt.
 */
export function assistantBubble(page: Page): Locator {
  return bubblesOf(page, 'assistant').last();
}

/** The last bubble on screen REGARDLESS of who wrote it — position, not
 *  speaker. Kept because "whatever is at the bottom of the thread" is a real
 *  thing to want; named so that no caller can mistake it for the assistant's
 *  answer, which is exactly what the old `answer()` invited. */
export function lastBubble(page: Page): Locator {
  return bubbles(page).last();
}

/**
 * Assert the harness can still tell a user bubble from an assistant one.
 *
 * Both signals are styling, and styling is not a contract — so this is what
 * stands between "the locator means the assistant" and "the locator used to
 * mean the assistant". It fails if either holds:
 *
 *  - the two speakers' bubbles do not add up to every bubble on the page
 *    (something rendered that classifies as neither, or as both), or
 *  - the alignment signal and the skin signal disagree about how many bubbles
 *    each speaker has.
 *
 * Called on the PASS path of every read below, because a wrong classification
 * that still resolves is precisely the failure that stays green.
 */
export async function assertBubbleRolesAreLegible(page: Page): Promise<void> {
  const [all, user, assistant, userSkin, assistantSkin] = await Promise.all([
    bubbles(page).count(),
    bubblesOf(page, 'user').count(),
    bubblesOf(page, 'assistant').count(),
    page.locator(SKIN_OF.user).count(),
    page.locator(SKIN_OF.assistant).count(),
  ]);
  const drift =
    `${all} bubble(s) on screen; by row alignment ${user} user + ${assistant} assistant; ` +
    `by bubble skin ${userSkin} user + ${assistantSkin} assistant`;
  if (user + assistant !== all) {
    throw new ScenarioAssertionError(
      `the harness can no longer tell which bubble belongs to which speaker — ${drift}. ` +
        'Every bubble must classify as exactly one speaker; one that classifies as neither (or ' +
        'both) means the kit changed how it renders a message row, and the assistant locator is ' +
        'now guesswork. Re-derive it before trusting any prose assertion.',
    );
  }
  if (user !== userSkin || assistant !== assistantSkin) {
    throw new ScenarioAssertionError(
      `the two speaker signals disagree — ${drift}. Row alignment and bubble skin are set by ` +
        'different components off different props; when they stop agreeing, one of them has ' +
        'stopped tracking the speaker and the assistant locator can silently resolve to the ' +
        "user's echoed prompt. That is the defect this cross-check exists to prevent.",
    );
  }
}

/**
 * The text a locator renders RIGHT NOW, or `''` if it currently matches nothing.
 *
 * Not `locator.textContent()` on its own, which WAITS for a match — and with no
 * `actionTimeout` configured it waits until the whole test times out. That never
 * came up while the assistant locator was `bubbles().last()`, because on a
 * thread with a user message in it that always matched something (the echoed
 * prompt, which is the whole defect). Selecting by speaker means "the assistant
 * has not spoken yet" is now an ordinary, expected answer, and it has to read as
 * `''` in a few milliseconds rather than as a two-minute mystery timeout with no
 * assertion message attached. `count()` does not wait; `textContent()` is only
 * reached once there is something to read.
 */
export async function textNow(locator: Locator): Promise<string> {
  if ((await locator.count()) === 0) return '';
  return (await locator.textContent({ timeout: 2_000 }).catch(() => '')) ?? '';
}

/** How many characters a locator renders right now; `0` if it matches nothing. */
export async function textLength(locator: Locator): Promise<number> {
  return (await textNow(locator)).length;
}

/** Wait until `locator` holds at least `min` characters, and hand back how many
 *  it had when the wait ended — which is UNDER `min` if it timed out, so callers
 *  can report the shortfall rather than a bare timeout.
 *
 *  Takes a LOCATOR, not a page: "the answer" is not `bubbles().last()`. While
 *  the assistant is still streaming its first text delta the last bubble is the
 *  ECHOED PROMPT, and a caller that measured it would be watching the user's own
 *  words. Pass `assistantBubble(page)`, or pin whatever else you actually mean.
 *
 *  A locator rather than `page.waitForFunction` because the thread renders in an
 *  open shadow root: `document.querySelector` does not pierce it, so a
 *  `waitForFunction` written against `document` would simply never resolve. */
export async function waitForMinLength(
  locator: Locator,
  min: number,
  timeout = VISIBLE_TIMEOUT,
): Promise<number> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const n = await textLength(locator);
    if (n >= min) return n;
    if (Date.now() > deadline) return n;
    await locator.page().waitForTimeout(50);
  }
}

/** Poll `locator` until its rendered length has been UNCHANGED for `quietMs`,
 *  and hand back that settled length. `null` means it was still changing when
 *  `timeout` ran out.
 *
 *  This is how you assert "it stopped" without asserting "it stopped instantly".
 *  Bytes already on the wire when an abort fires still arrive, so the honest
 *  claim about a cancelled stream is that growth CEASES — not that it ceases
 *  before the next frame, which is a race the network gets to win. */
export async function waitForStableLength(
  locator: Locator,
  opts: { quietMs?: number; timeout?: number; pollMs?: number } = {},
): Promise<number | null> {
  const quietMs = opts.quietMs ?? 600;
  const pollMs = opts.pollMs ?? 50;
  const deadline = Date.now() + (opts.timeout ?? 8_000);
  let value = await textLength(locator);
  let steadySince = Date.now();
  for (;;) {
    await locator.page().waitForTimeout(pollMs);
    const n = await textLength(locator);
    if (n !== value) {
      value = n;
      steadySince = Date.now();
    } else if (Date.now() - steadySince >= quietMs) {
      return value;
    }
    if (Date.now() > deadline) return null;
  }
}

/**
 * Assert THE ASSISTANT produced at least `min` characters of visible prose, and
 * hand that prose back.
 *
 * Reads `assistantBubble`, so it cannot be satisfied by the echoed prompt. The
 * name says the speaker for the same reason: the version called `seesProse`
 * read `bubbles().last()` and every call site read as if it said "assistant"
 * while the code said "whatever is at the bottom".
 */
export async function seesAssistantProse(
  page: Page,
  min: number,
  timeout = VISIBLE_TIMEOUT,
): Promise<string> {
  const deadline = Date.now() + timeout;
  let text = '';
  for (;;) {
    text = (await textNow(assistantBubble(page))).trim();
    if (text.length >= min) {
      // Only now: a classification that resolves to the WRONG speaker is the
      // failure that stays green, so the cross-check guards the pass.
      await assertBubbleRolesAreLegible(page);
      return text;
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(150);
  }
  // Say what was actually on screen. "Saw 0" against a page full of the user's
  // own words is the single most confusing way this can fail, and it is also
  // the most likely: it means the assertion ran before the assistant spoke.
  const others = await bubbles(page).allTextContents();
  throw new ScenarioAssertionError(
    `expected at least ${min} characters of visible ASSISTANT prose, saw ${text.length}: ` +
      `${JSON.stringify(text.slice(0, 120))}. ` +
      `${others.length} bubble(s) are on screen: ${JSON.stringify(others.map((t) => t.trim().slice(0, 60)))}. ` +
      'If the assistant has not spoken yet, this assertion is simply early — it will not fall ' +
      "back to the user's echoed prompt to find something long enough.",
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
