import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * A branded `--kai-color-primary` must color CONTROLS, never CONTENT/CHROME.
 *
 * Same class of defect as `message-text-token.spec.ts` (the user-message-text
 * fix), found a second time via `attach` passthrough investigation and a third
 * time live: an owner branding a construct widget purple (#7c3aed) watched the
 * accent bleed onto the reasoning "Thinking" label, loader status text, a
 * matched-suggestion highlight, a file-tree folder icon, and a citation's
 * domain header — none of which are controls. Each used to hardcode
 * `text-primary`, the BRAND token (`--color-primary` /
 * `--kai-color-primary`), on plain content/chrome text. Fixed by swapping to
 * `text-foreground` (or `text-foreground/NN` where the original carried an
 * opacity modifier) — the same content token the message-text fix used,
 * because jsdom can't compute the real Tailwind cascade (this repo's
 * "compiled.css trap"; see `vitest.config.ts` / `focus-ring-paints.spec.ts`'s
 * header), so only a real Chromium proves the class doesn't compute to the
 * branded color. Runs against the BUILT bundle in the same bare, Tailwind-free
 * harness as every other guard in this family.
 *
 * POSITIVE CONTROL: a `<kai-button>` (default/filled variant — the one
 * that IS supposed to carry the brand) takes the loud color, so a run where
 * nothing is wired up can't pass by accident.
 */

const LOUD_PRIMARY = 'rgb(124, 58, 237)'; // #7c3aed — the branded purple from the live owner demo

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__kaiReady === true, undefined, { timeout: 30_000 });
  await page.waitForTimeout(300);
  await page.evaluate((loud) => {
    document.getElementById('mounts')!.style.setProperty('--kai-color-primary', loud);
  }, LOUD_PRIMARY);
});

async function mountAll(page: Page) {
  await page.evaluate(() => {
    const mounts = document.getElementById('mounts')!;
    mounts.replaceChildren();

    const reasoning = document.createElement('kai-reasoning') as HTMLElement & { text?: string; label?: string };
    reasoning.text = 'Weighing the options.';
    reasoning.label = 'Thinking';
    mounts.appendChild(reasoning);

    const terminal = document.createElement('kai-loader') as HTMLElement & { variant?: string };
    terminal.variant = 'terminal';
    mounts.appendChild(terminal);

    const dots = document.createElement('kai-loader') as HTMLElement & { variant?: string; text?: string };
    dots.variant = 'loading-dots';
    dots.text = 'Thinking';
    mounts.appendChild(dots);

    const suggestions = document.createElement('kai-suggestions') as HTMLElement & {
      suggestions?: string[];
      highlight?: string;
    };
    suggestions.suggestions = ['Explain this in plain language'];
    suggestions.highlight = 'lang';
    mounts.appendChild(suggestions);

    const fileTree = document.createElement('kai-file-tree') as HTMLElement & {
      files?: { path: string }[];
    };
    fileTree.files = [{ path: 'src/app.ts' }, { path: 'src/lib/util.ts' }];
    mounts.appendChild(fileTree);

    const source = document.createElement('kai-source') as HTMLElement & { href?: string };
    source.href = 'https://kitn.dev';
    mounts.appendChild(source);

    const btn = document.createElement('kai-button') as HTMLElement;
    btn.textContent = 'Send';
    mounts.appendChild(btn);
  });
  await page.waitForTimeout(300);
}

test('branded --kai-color-primary does not color content/chrome text, but DOES color a primary button', async ({ page }) => {
  await mountAll(page);

  const result = await page.evaluate(() => {
    const mounts = document.getElementById('mounts')!;
    const q = (sel: string, root: ShadowRoot | Document) => root.querySelector(sel) as HTMLElement | null;

    const reasoning = mounts.querySelector('kai-reasoning') as HTMLElement;
    const reasoningLabel = reasoning.shadowRoot?.querySelector('button span') as HTMLElement | null;

    const loaders = Array.from(mounts.querySelectorAll('kai-loader'));
    const terminalCaret = (() => {
      const root = loaders[0]!.shadowRoot!;
      return Array.from(root.querySelectorAll('span')).find((s) => s.textContent === '>') ?? null;
    })();
    const dotsLabel = (() => {
      const root = loaders[1]!.shadowRoot!;
      return Array.from(root.querySelectorAll('span')).find((s) => (s.textContent ?? '').includes('Thinking')) ?? null;
    })();

    const suggestions = mounts.querySelector('kai-suggestions') as HTMLElement;
    const matched = (() => {
      const root = suggestions.shadowRoot!;
      return Array.from(root.querySelectorAll('span')).find((s) => s.textContent === 'lang') ?? null;
    })();

    const fileTree = mounts.querySelector('kai-file-tree') as HTMLElement;
    const folderIcon = fileTree.shadowRoot?.querySelector('svg') as SVGElement | null;

    const btn = mounts.querySelector('kai-button') as HTMLElement;
    const innerBtn = btn.shadowRoot?.querySelector('button') as HTMLElement | null;

    return {
      reasoningLabelColor: reasoningLabel ? getComputedStyle(reasoningLabel).color : null,
      terminalCaretColor: terminalCaret ? getComputedStyle(terminalCaret).color : null,
      dotsLabelColor: dotsLabel ? getComputedStyle(dotsLabel).color : null,
      matchedColor: matched ? getComputedStyle(matched).color : null,
      folderIconColor: folderIcon ? getComputedStyle(folderIcon).color : null,
      btnBg: innerBtn ? getComputedStyle(innerBtn).backgroundColor : null,
      foundAll: !!(reasoningLabel && terminalCaret && dotsLabel && matched && folderIcon && innerBtn),
    };
  });

  expect(result.foundAll, `some target nodes did not render: ${JSON.stringify(result)}`).toBe(true);

  for (const [name, color] of [
    ['reasoning "Thinking" label', result.reasoningLabelColor],
    ['terminal loader caret', result.terminalCaretColor],
    ['loading-dots label', result.dotsLabelColor],
    ['matched suggestion highlight', result.matchedColor],
    ['file-tree folder icon', result.folderIconColor],
  ] as const) {
    expect(color, `${name} took the branded primary color directly (${color}) — content/chrome is branded.`).not.toBe(
      LOUD_PRIMARY,
    );
  }

  // POSITIVE CONTROL — if this fails, nothing in this harness is proven wired,
  // and every negative result above is meaningless.
  expect(
    result.btnBg,
    `POSITIVE CONTROL FAILED: a default kai-button did not take the branded primary color (got ${result.btnBg}).`,
  ).toBe(LOUD_PRIMARY);
});

// source.tsx's SourceContent domain header (the 6th changed site) is
// deliberately NOT covered here. Its `HoverCardContent` never opened in this
// bare harness — confirmed with both a real `.focus()` and a real Playwright
// `.hover()` on the trigger, with `ctx.open()`'s own `aria-describedby` side
// effect also never appearing — despite the identical trigger/focusin wiring
// working correctly in `tests/ui/hover-card.test.tsx` (jsdom) and this
// exact harness proving out for every other element above. This looks like a
// pre-existing environment gap in the bare/no-Storybook harness (nothing here
// tests HoverCardContent's real-browser open+render path before this), not a
// regression from this fix — see the report for the investigation. The
// site's own jsdom pin (`source-list.test.tsx`, which DOES open the card
// successfully via fake timers) stands in as the class-list guard for now.
