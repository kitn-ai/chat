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
 *
 * NOTE on `<kai-source>`'s hover card: `HoverCardContent` portals into a
 * per-element `portalNode` div that `defineWebComponent` renders INSIDE the
 * element's own shadow root (`src/elements/define.tsx`'s default
 * `ChatConfig portalMount`), not into `document.body` — a standalone
 * `<kai-source>` has no `<kai-chat>` ancestor to hand it a different mount.
 * So the domain header has to be queried through `kai-source`'s own
 * `shadowRoot`, not the top-level `document`.
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

  // Open the citation's hover card for real — mirrors how a reader actually
  // reaches this text. `openDelay` is 150ms (source.tsx); the trigger's own
  // `<a>` lives inside kai-source's shadow root.
  const sourceTrigger = page.locator('kai-source a');
  await sourceTrigger.hover();
  await page.waitForTimeout(500);

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

    // The hover card portals into a `portalNode` div INSIDE kai-source's own
    // shadow root (see the file header note), not document.body.
    const source = mounts.querySelector('kai-source') as HTMLElement;
    const sourceRoot = source.shadowRoot!;
    const domain = Array.from(sourceRoot.querySelectorAll('div')).find(
      (d) => (d.textContent ?? '').trim() === 'kitn.dev' && d.classList.contains('truncate'),
    ) as HTMLElement | null;

    return {
      reasoningLabelColor: reasoningLabel ? getComputedStyle(reasoningLabel).color : null,
      terminalCaretColor: terminalCaret ? getComputedStyle(terminalCaret).color : null,
      dotsLabelColor: dotsLabel ? getComputedStyle(dotsLabel).color : null,
      matchedColor: matched ? getComputedStyle(matched).color : null,
      folderIconColor: folderIcon ? getComputedStyle(folderIcon).color : null,
      domainColor: domain ? getComputedStyle(domain).color : null,
      btnBg: innerBtn ? getComputedStyle(innerBtn).backgroundColor : null,
      foundAll: !!(reasoningLabel && terminalCaret && dotsLabel && matched && folderIcon && domain && innerBtn),
    };
  });

  expect(result.foundAll, `some target nodes did not render: ${JSON.stringify(result)}`).toBe(true);

  for (const [name, color] of [
    ['reasoning "Thinking" label', result.reasoningLabelColor],
    ['terminal loader caret', result.terminalCaretColor],
    ['loading-dots label', result.dotsLabelColor],
    ['matched suggestion highlight', result.matchedColor],
    ['file-tree folder icon', result.folderIconColor],
    ['citation domain header (SourceContent)', result.domainColor],
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
