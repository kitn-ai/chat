import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * A branded `--kai-color-primary` must color CONTROLS, never message CONTENT.
 *
 * `MessageBody`'s user-message bubble used to set `text-primary` on the text
 * part, toking the message's own words to `--color-primary` — the documented
 * consumer BRAND override (`theme.css` `--kai-color-primary`, line ~20). Any
 * consumer that brands primary (a pink CTA color, say) got brand-pink message
 * text on every thread surface, which is backwards: "accent brands controls,
 * never content" (owner-ruled; see `component-scope-boundary` memory). The fix
 * drops the override so the user bubble falls through to `MessageContent`'s own
 * base `text-foreground`, exactly like the assistant path already does.
 *
 * This has to run against the BUILT bundle in a bare, Tailwind-free harness —
 * same reasoning as `focus-ring-paints.spec.ts`: a real consumer app never
 * loads Tailwind at document level, and this guard is about what a branded
 * `--kai-color-primary` custom property actually resolves to for a shadow-root
 * element, which only the real cascade (not a class-name assertion) can prove.
 * A jsdom check can and does pin the CLASS LIST (see
 * `tests/components/message-user-text-class.test.tsx`), but only a real
 * Chromium can prove the class doesn't compute to the branded color, which is
 * the entire point of the defect.
 *
 * NEGATIVE assertion: the user message TEXT's computed color must NOT equal
 * the loud branded primary.
 * POSITIVE control: a `<kai-button>` (default/filled variant, the one that is
 * SUPPOSED to carry the brand) in the same document DOES take it — proving the
 * branding pipeline itself works and the negative result isn't just "nothing
 * is wired up".
 */

const LOUD_PRIMARY = 'rgb(233, 30, 99)'; // #e91e63 — a loud, unambiguous brand pink

async function mountUserMessage(page: Page) {
  await page.evaluate(() => {
    const mounts = document.getElementById('mounts')!;
    mounts.replaceChildren();

    const msg = document.createElement('kai-message') as HTMLElement & { role?: string; message?: unknown };
    msg.role = 'user';
    msg.message = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello from the user' }] };
    mounts.appendChild(msg);

    const btn = document.createElement('kai-button') as HTMLElement;
    btn.textContent = 'Send';
    mounts.appendChild(btn);
  });
  await page.waitForTimeout(250);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__kaiReady === true, undefined, { timeout: 30_000 });
  await page.waitForTimeout(300);
});

test('branded --kai-color-primary does NOT color user message text, but DOES color a primary button', async ({ page }) => {
  // Brand it loud, on an ancestor of #mounts — exactly how a real consumer sets
  // it (any ancestor; custom properties inherit through the shadow boundary).
  await page.evaluate((loud) => {
    document.getElementById('mounts')!.style.setProperty('--kai-color-primary', loud);
  }, LOUD_PRIMARY);

  await mountUserMessage(page);

  const result = await page.evaluate(() => {
    const mounts = document.getElementById('mounts')!;
    const msg = mounts.querySelector('kai-message') as HTMLElement;
    const btn = mounts.querySelector('kai-button') as HTMLElement;

    const bubble = msg.shadowRoot?.querySelector('[part="bubble content"]') as HTMLElement | null;
    const innerBtn = btn.shadowRoot?.querySelector('button') as HTMLElement | null;

    return {
      bubbleFound: !!bubble,
      innerBtnFound: !!innerBtn,
      bubbleColor: bubble ? getComputedStyle(bubble).color : null,
      btnBg: innerBtn ? getComputedStyle(innerBtn).backgroundColor : null,
    };
  });

  expect(result.bubbleFound, 'user message bubble content ([part="bubble content"]) did not render').toBe(true);
  expect(result.innerBtnFound, 'kai-button did not render an inner <button>').toBe(true);

  expect(
    result.bubbleColor,
    `user message TEXT took the branded primary color directly (${result.bubbleColor}) — content is ` +
      'branded, which is exactly the regression this guard exists to catch.',
  ).not.toBe(LOUD_PRIMARY);

  // POSITIVE CONTROL: if this fails, the branding pipeline itself is broken
  // (e.g. the harness page/build doesn't wire --kai-color-primary at all), and
  // the negative result above would be meaningless.
  expect(
    result.btnBg,
    `POSITIVE CONTROL FAILED: a default/filled kai-button did not take the branded primary color ` +
      `(got ${result.btnBg}, expected ${LOUD_PRIMARY}) — the branding pipeline isn't proven to work in ` +
      'this harness, so the negative assertion above proves nothing.',
  ).toBe(LOUD_PRIMARY);
});

test('unbranded (default theme): user message text is NOT literally rgb(233,30,99) either way (sanity)', async ({ page }) => {
  // No brand override here — just confirms the harness renders a real color at
  // all (catches a totally blank/transparent bubble silently "passing" the
  // negative assertion above for the wrong reason).
  await mountUserMessage(page);
  const color = await page.evaluate(() => {
    const bubble = document
      .querySelector('kai-message')!
      .shadowRoot!.querySelector('[part="bubble content"]') as HTMLElement;
    return getComputedStyle(bubble).color;
  });
  expect(color).not.toBe('');
  expect(color).not.toBe(LOUD_PRIMARY);
});
