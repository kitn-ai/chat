import type { Scenario } from './types';
import { pickTools } from '../tools';
import {
  controlledPanel,
  expand,
  fail,
  panelShowsContent,
  reasoningBody,
  reasoningTrigger,
  toolTrigger,
} from './dom';

/**
 * S18 — the regression test for a bug a browser is the only place to see.
 *
 * `MessageBody` used to render its part groups through a `<For>`. `<For>` is
 * REFERENCE-keyed, and a streaming message gets a brand-new `parts` array every
 * delta, so every chunk tore down and rebuilt every row. Expanding a tool panel
 * or a reasoning block mid-stream therefore did nothing at all: the disclosure
 * opened and was discarded microseconds later by the next token. The fix was
 * `<Index>`, which keys by position and hands each row a signal.
 *
 * jsdom cannot see this — the panel state is only observable as LAYOUT, and the
 * failure mode is a remount that leaves the DOM looking structurally identical.
 * So the check is: open both disclosures while the stream is still running, then
 * confirm, after many more deltas have landed, that they are still open AND that
 * their content GREW. Still-open-but-frozen would mean the row stopped updating,
 * which is the opposite bug.
 *
 * REPLAY, slowly, because it needs a stream that is reliably still open.
 */
export const s18ExpandMidStream: Scenario = {
  id: 'S18-expand-mid-stream',
  title: 'Expanding a panel mid-stream stays open',
  proves: 'a disclosure opened during a stream survives every subsequent delta and keeps updating',
  prompt: "Think about the weather in Paris, then look it up and tell me what to wear.",
  tools: pickTools('get_weather'),
  mode: 'replay',
  replayDelayMs: 45,
  async during(page) {
    // ── reasoning: open it while the reasoning text is still arriving ────────
    // The fixture streams ~32 reasoning fragments at 45ms before the tool call
    // starts, so there is well over a second of live stream after this click.
    const rTrigger = reasoningTrigger(page);
    await rTrigger.waitFor({ state: 'visible', timeout: 20_000 });
    const rBody = reasoningBody(rTrigger);
    await expand(rTrigger, rBody, 'reasoning');
    const reasoningAtOpen = ((await rBody.textContent()) ?? '').length;

    await page.waitForTimeout(900);

    if (!(await panelShowsContent(rBody))) {
      fail('the reasoning panel closed itself while the stream continued — the row was remounted');
    }
    const reasoningNow = ((await rBody.textContent()) ?? '').length;
    if (reasoningNow <= reasoningAtOpen) {
      fail(
        `the reasoning panel stayed open but stopped updating (${reasoningAtOpen} → ${reasoningNow} chars): ` +
          'the row is mounted but no longer reading through its accessor',
      );
    }

    // ── tool: open it while the arguments are still streaming ───────────────
    const tTrigger = toolTrigger(page, 'get_weather');
    await tTrigger.waitFor({ state: 'visible', timeout: 20_000 });
    const tPanel = await controlledPanel(page, tTrigger);
    await expand(tTrigger, tPanel, 'get_weather tool');

    // Long enough to cover the two further re-renders every tool part gets: the
    // input-available patch at settle, and the output-available patch after the
    // tool runs. Either one used to close the panel.
    await page.waitForTimeout(900);
    if (!(await panelShowsContent(tPanel))) {
      fail('the tool panel closed itself while the stream continued — the row was remounted');
    }
  },
  async assert(page) {
    // Still open after the stream SETTLED, too: `done()` is another re-render.
    const rTrigger = reasoningTrigger(page);
    if (!(await panelShowsContent(reasoningBody(rTrigger)))) {
      fail('the reasoning panel closed when the stream settled');
    }
    const tTrigger = toolTrigger(page, 'get_weather');
    const tPanel = await controlledPanel(page, tTrigger);
    if (!(await panelShowsContent(tPanel))) fail('the tool panel closed when the stream settled');

    // And the panel the user left open now shows the finished result, which is
    // the whole reason they opened it.
    const body = (await tPanel.textContent()) ?? '';
    if (!body.includes('Light rain')) {
      fail(`the open tool panel never showed the tool output: ${JSON.stringify(body.slice(0, 160))}`);
    }
  },
};
