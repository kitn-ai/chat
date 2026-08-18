import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import type { Page, ElementHandle } from '@playwright/test';

/**
 * Does a keyboard focus indicator actually PAINT inside a `kai-*` shadow root?
 *
 * This guard asserts pixels, not classes. Asserting that a button carries
 * `focus-visible:ring-2` proves nothing: the utility compiles to a `box-shadow`
 * built out of `--tw-*` custom properties whose initial values come only from
 * `@property`, and `@property` is DOCUMENT-GLOBAL — a copy inside a shadow root
 * is ignored whether it arrives via `adoptedStyleSheets` or a `<style>` tag.
 * Unregistered, those vars are the empty token, the whole `box-shadow`
 * shorthand is invalid at computed-value time, and it drops. The class is
 * present and correct; nothing paints.
 *
 * WHY THIS SUITE CANNOT PASS VACUOUSLY — four independent ways, all required:
 *
 *  1. NO DOCUMENT TAILWIND. Storybook (`.storybook/styles.css`) and the docs
 *     site both load Tailwind at document level, which registers every `--tw-*`
 *     globally and makes shadow-root rings paint. That is exactly why this
 *     defect stayed invisible. Every test here first asserts the harness
 *     document has no `@property --tw-*` and no `--tw-ring-shadow` — as a
 *     stylesheet scan AND as a computed-value probe. Reproduce Storybook's
 *     condition and the suite fails instead of going green.
 *  2. A COUNT FLOOR, derived from the element manifest rather than a hand-typed
 *     list. If a component stops rendering, or registration regresses, the
 *     population shrinks and the floor fires — a suite that tests nothing can
 *     no longer report success.
 *  3. A NEGATIVE CONTROL. A button with `outline:none` and no ring must report
 *     ~0 changed pixels. If it reports a ring, the differ is broken and every
 *     positive result in the run is worthless.
 *  4. A POSITIVE CONTROL. A button with a literal, var-free outline must report
 *     a large diff. Together with (3) this brackets the differ from both sides,
 *     so neither "always zero" nor "always huge" can masquerade as a pass.
 *
 * Each measurement also computes its own NOISE FLOOR (two consecutive blurred
 * screenshots) so an element that animates cannot manufacture a diff and score
 * itself a focus ring.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '../..');

/** The element population is DERIVED from the generated manifest, never typed here. */
const MANIFEST: Array<{ tag: string }> = JSON.parse(
  readFileSync(path.join(PKG, 'src/elements/element-meta.json'), 'utf8'),
);
const TAGS = MANIFEST.map((e) => e.tag).filter(Boolean);

/**
 * Floors, not exact counts — exact counts rot on every component added. These
 * are set well under the observed population (80 elements / 24 with focusables
 * / 39 focusables when mounted bare) so ordinary growth never trips them, but a
 * collapse to "nothing rendered" always does.
 */
const MIN_ELEMENTS_IN_MANIFEST = 70;
const MIN_ELEMENTS_WITH_FOCUSABLES = 18;
const MIN_FOCUSABLES_MEASURED = 28;

/** A 2px ring around even a small control changes far more than this. */
const MIN_RING_PIXELS = 20;

/**
 * What a keyboard user can actually Tab to. Two subtleties, both of which this
 * selector originally got wrong and both of which made it under-report:
 *
 *  - `[contenteditable]:not([contenteditable="false"])`, NOT
 *    `[contenteditable="true"]`. The composer sets
 *    `contentEditable="plaintext-only"`, a real tab stop that the ="true" form
 *    never matches — the single most important text surface in the kit was
 *    being skipped silently.
 *  - `:not([tabindex="-1"])` on EVERY clause, not just the `[tabindex]` one. A
 *    `<button tabindex="-1">` is out of the tab order but still matches
 *    `button:not([disabled])`, so natively-focusable elements opted out of Tab
 *    were still being counted as tab stops.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
]
  .map((s) => `${s}:not([tabindex="-1"])`)
  .join(',');

/* ------------------------------------------------------------------ helpers */

/**
 * The anti-vacuity assertion. Runs before every measurement in this file.
 * Checks the document two ways: what its stylesheets SAY, and what the engine
 * actually COMPUTED. A registered `<length>`-ish property reports its initial
 * value; an unregistered one reports the empty string.
 */
async function assertDocumentHasNoTailwind(page: Page) {
  const contamination = await page.evaluate(() => {
    const hits: string[] = [];
    const walk = (rules: CSSRuleList | undefined, origin: string) => {
      if (!rules) return;
      for (const rule of Array.from(rules)) {
        const text = rule.cssText || '';
        if (text.startsWith('@property') && text.includes('--tw-')) {
          hits.push(`${origin}: ${text.slice(0, 80)}`);
        } else if (text.includes('--tw-ring-shadow')) {
          hits.push(`${origin}: --tw-ring-shadow in ${text.slice(0, 80)}`);
        }
        walk((rule as CSSGroupingRule).cssRules, origin);
      }
    };
    Array.from(document.styleSheets).forEach((sheet, i) => {
      try {
        walk(sheet.cssRules, `styleSheets[${i}]`);
      } catch {
        hits.push(`styleSheets[${i}]: unreadable (cross-origin?) — refusing to trust this document`);
      }
    });
    (document.adoptedStyleSheets || []).forEach((sheet, i) => {
      walk(sheet.cssRules, `document.adoptedStyleSheets[${i}]`);
    });
    // Computed-value probe: if `@property --tw-ring-shadow` were registered at
    // document level this returns its initial value instead of ''.
    const computed = getComputedStyle(document.body).getPropertyValue('--tw-ring-shadow').trim();
    if (computed !== '') hits.push(`document.body computed --tw-ring-shadow = "${computed}" (registered globally!)`);
    return hits;
  });

  expect(
    contamination,
    'The harness document must contain NO Tailwind. Document-level Tailwind registers every --tw-* ' +
      'property globally, which makes shadow-root rings paint and reproduces the exact Storybook ' +
      'condition that hid this defect for months. A green run under these conditions proves nothing.',
  ).toEqual([]);
}

/** The CSS this suite's assertions are ultimately about, read from source. */
const SOURCE_CSS = readFileSync(path.join(PKG, 'src/elements/compiled.css'), 'utf8');

/**
 * REFUSE TO MEASURE A STALE BUNDLE.
 *
 * This suite drives `dist/`, so it is only ever as true as the last build — and
 * there is a specific trap here that has now bitten twice in this repo (PR
 * #284's hover-card suite had the identical shape). `npm run build:elements`
 * exits 0 while leaving `dist/register-impl-*.js` BYTE-IDENTICAL, and that file
 * carries the injected element CSS. So you can revert the fix in
 * `src/elements/compiled.css`, "rebuild", and watch this suite report a serene
 * 38/38 against CSS that no longer exists in source. Nothing else in the repo
 * compares dist against src; in CI only step ordering protects it, and step
 * ordering is not an assertion.
 *
 * Name the cause precisely: `pnpm exec nx build ui` DOES rebuild correctly. The
 * trap is the narrower `build:elements` target, not the NX cache.
 *
 * WHY A STRUCTURAL DIGEST rather than comparing the CSS text. The bundle's CSS
 * is not a verbatim copy: Vite re-minifies it, rewriting values (`calc(1.5 / 1)`
 * becomes `1.5`) and collapsing duplicate declarations, so byte equality is
 * unattainable and sampling text slices false-positives. Measured: 8 of 231
 * source slices are absent from a perfectly fresh dist. What minification does
 * NOT change is structure. So both sides are parsed by the SAME browser CSSOM
 * and reduced to an ordered list of rule preludes plus the set of property names
 * each rule declares — immune to value rewriting and to declaration dedup, while
 * still flipping the moment an `@supports` condition, a selector or a property
 * appears or disappears. The `@supports` gate at the heart of this fix is a
 * prelude, so reverting it is caught.
 *
 * Honest limit: a change to a property's VALUE alone (recolouring the ring
 * without touching any selector or property name) would not move this digest.
 */
async function assertServedBundleIsFresh(page: Page) {
  const result = await page.evaluate((srcCss: string) => {
    const digestOf = (rules: CSSRuleList): string => {
      const parts: string[] = [];
      const walk = (list: CSSRuleList) => {
        for (const r of Array.from(list) as any[]) {
          const raw: string =
            r.selectorText ?? r.conditionText ?? r.name ?? r.media?.mediaText ?? '';
          // Minification differs only in punctuation spacing here
          // (`in lab, red` vs `in lab,red`). Collapsing space AROUND punctuation
          // normalizes that while preserving descendant combinators, which are
          // spaces NOT adjacent to punctuation.
          const prelude = raw
            .replace(/\s*([,()])\s*/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
          const props = r.style
            ? [...new Set(Array.from(r.style) as string[])].sort().join(',')
            : '';
          // One entry per SELECTOR, not per rule: the minifier merges rules that
          // share declarations (`.a{x}.b{x}` becomes `.a,.b{x}`), and flattening
          // makes both forms produce the same entries.
          for (const sel of prelude.split(',')) {
            parts.push(`${r.type}|${sel}|${props}`);
          }
          if (r.cssRules) walk(r.cssRules);
        }
      };
      walk(rules);
      // Sorted multiset: also absorbs rule REORDERING by the minifier. Trades
      // cascade-order sensitivity for freedom from false positives, which is the
      // right trade for a freshness check.
      return parts.sort().join('\n');
    };

    const host = document.createElement('kai-button');
    document.getElementById('mounts')!.appendChild(host);
    const root = (host as HTMLElement).shadowRoot;
    if (!root) return { ok: false, reason: 'kai-button did not attach a shadow root' };
    const served = Array.from(root.adoptedStyleSheets)
      .map((s) => digestOf(s.cssRules))
      .join('\n');
    host.remove();
    if (!served) return { ok: false, reason: 'no adopted stylesheet found in the shadow root' };

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(srcCss);
    const fromSource = digestOf(sheet.cssRules);

    if (served === fromSource) return { ok: true, reason: '' };
    let i = 0;
    while (i < Math.min(served.length, fromSource.length) && served[i] === fromSource[i]) i++;
    return {
      ok: false,
      reason:
        `first divergence at char ${i}\n` +
        `  served (dist/): …${served.slice(Math.max(0, i - 70), i + 70)}…\n` +
        `  source (src/) : …${fromSource.slice(Math.max(0, i - 70), i + 70)}…`,
    };
  }, SOURCE_CSS);

  expect(
    result.ok,
    'THE SERVED BUNDLE IS STALE — dist/ does not match src/elements/compiled.css, so this suite ' +
      'would be measuring CSS that is no longer in source and could report a green run over a ' +
      'reverted fix.\n\n' +
      `${result.reason}\n\n` +
      'Rebuild with:  pnpm exec nx build ui\n' +
      'NOT `npm run build:elements` — that target exits 0 while leaving dist/register-impl-*.js ' +
      'untouched, which is exactly how a stale bundle survives a "successful" rebuild. ' +
      '(`nx build ui` rebuilds correctly; the NX cache is not the problem.)',
  ).toBe(true);
}

type Measurement = { changed: number; noise: number };

/** Screenshot a padded region around `handle` blurred (twice) and focused, and count changed pixels. */
async function measureFocusPaint(page: Page, handle: ElementHandle<Element>): Promise<Measurement> {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) return { changed: -1, noise: -1 };

  const PAD = 10;
  const clip = {
    x: Math.max(0, box.x - PAD),
    y: Math.max(0, box.y - PAD),
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  };

  const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  const shoot = async () => PNG.sync.read(await page.screenshot({ clip }));

  await blur();
  await page.waitForTimeout(120);
  const blurredA = await shoot();
  await page.waitForTimeout(120);
  // Second blurred frame: anything that differs here is animation, not focus.
  const blurredB = await shoot();

  await handle.evaluate((el) => (el as HTMLElement).focus());
  await page.waitForTimeout(160);
  const focused = await shoot();

  return { changed: diffPixels(blurredA, focused), noise: diffPixels(blurredA, blurredB) };
}

function diffPixels(a: PNG, b: PNG): number {
  if (a.width !== b.width || a.height !== b.height) return -1;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    // Tolerance absorbs antialiasing jitter; a real ring is far louder than this.
    if (
      Math.abs(a.data[i] - b.data[i]) > 8 ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > 8 ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > 8
    ) {
      n++;
    }
  }
  return n;
}

/** A measurement counts as a focus indicator only if it beats both the floor and its own noise. */
function paints({ changed, noise }: Measurement): boolean {
  return changed >= MIN_RING_PIXELS && changed > noise * 3 + 8;
}

async function mountOnly(page: Page, tag: string) {
  await page.evaluate((t) => {
    const mounts = document.getElementById('mounts')!;
    mounts.replaceChildren(document.createElement(t));
  }, tag);
  await page.waitForTimeout(220);
}

async function focusablesOf(page: Page, selectorRoot: 'mounts' | 'controls') {
  const handle = await page.evaluateHandle(
    ({ rootId, sel }) => {
      const out: Element[] = [];
      const collect = (root: ParentNode) => {
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.matches(sel)) out.push(el);
          if ((el as HTMLElement).shadowRoot) collect((el as HTMLElement).shadowRoot!);
        }
      };
      const host = document.getElementById(rootId);
      if (host) collect(host);
      // Only things a user could actually SEE. A control at `opacity: 0` (the
      // scroll-to-bottom button in its resting state) has no pixels to change,
      // so measuring paint on it says nothing about focus styling. Those are a
      // separate defect — focusable but invisible — reported by the companion
      // check below rather than silently folded into this one.
      return out.filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01;
      });
    },
    { rootId: selectorRoot, sel: FOCUSABLE_SELECTOR },
  );
  const props = await handle.getProperties();
  return Array.from(props.values())
    .map((p) => p.asElement())
    .filter((e): e is ElementHandle<Element> => !!e);
}

/* -------------------------------------------------------------------- tests */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__kaiReady === true, undefined, { timeout: 30_000 });
  await page.waitForTimeout(600);
  // Before EVERY test, not once: no measurement in this file is allowed to run
  // against a bundle that does not match source.
  await assertServedBundleIsFresh(page);
});

test('the harness document contains no Tailwind (anti-vacuity precondition)', async ({ page }) => {
  await assertDocumentHasNoTailwind(page);

  // And prove the probe can actually detect contamination, so an always-empty
  // result cannot be mistaken for cleanliness.
  const detected = await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('@property --tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const computed = getComputedStyle(document.body).getPropertyValue('--tw-ring-shadow').trim();
    document.adoptedStyleSheets = [];
    return computed;
  });
  expect(detected, 'the contamination probe itself must be able to see document-level Tailwind').not.toBe('');
});

test('the element population meets its floor (a shrunken suite cannot pass)', async ({ page }) => {
  await assertDocumentHasNoTailwind(page);
  expect(TAGS.length, 'element manifest looks truncated').toBeGreaterThanOrEqual(MIN_ELEMENTS_IN_MANIFEST);

  const undefined_ = await page.evaluate(
    (tags) => tags.filter((t) => !customElements.get(t)),
    TAGS,
  );
  expect(
    undefined_.length,
    `custom elements failed to register: ${undefined_.join(', ')}`,
  ).toBeLessThanOrEqual(2);
});

test('controls: the differ sees a literal outline and does NOT see a suppressed one', async ({ page }) => {
  await assertDocumentHasNoTailwind(page);

  await page.evaluate(() => {
    const wrap = document.createElement('div');
    wrap.id = 'controls';
    document.body.appendChild(wrap);
    const root = wrap.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        button { display:block; margin:16px; padding:8px 14px; background:#eee; border:1px solid #999; font:14px system-ui; }
        /* NEGATIVE control: focus is actively suppressed, exactly like a site
           that sets focus-visible:outline-none and relies on an inert ring. */
        #neg, #neg:focus, #neg:focus-visible { outline: none !important; box-shadow: none !important; }
        /* POSITIVE control: a literal, var-free outline that cannot depend on @property. */
        #pos:focus-visible { outline: 2px solid #1a6ef4; outline-offset: 2px; }
        #pos { outline: none; }
      </style>
      <button id="neg">suppressed</button>
      <button id="pos">literal outline</button>`;
  });
  await page.waitForTimeout(200);

  const [neg, pos] = await (async () => {
    const h = await page.evaluateHandle(() => {
      const r = document.getElementById('controls')!.shadowRoot!;
      return [r.getElementById('neg'), r.getElementById('pos')];
    });
    const props = await h.getProperties();
    return Array.from(props.values()).map((p) => p.asElement() as ElementHandle<Element>);
  })();

  const negM = await measureFocusPaint(page, neg);
  const posM = await measureFocusPaint(page, pos);
  console.log(`  [control] suppressed: changed=${negM.changed} noise=${negM.noise}`);
  console.log(`  [control] literal outline: changed=${posM.changed} noise=${posM.noise}`);

  expect(
    paints(negM),
    `NEGATIVE CONTROL PAINTED (changed=${negM.changed}). The differ is broken — every positive ` +
      'result in this run is meaningless.',
  ).toBe(false);
  expect(
    paints(posM),
    `POSITIVE CONTROL DID NOT PAINT (changed=${posM.changed}, noise=${posM.noise}). The differ ` +
      'cannot see a ring that is definitely there, so a green run would prove nothing.',
  ).toBe(true);
});

test('every focusable control in every kai-* element paints a focus indicator', async ({ page }) => {
  await assertDocumentHasNoTailwind(page);

  const failures: string[] = [];
  const passes: string[] = [];
  let elementsWithFocusables = 0;
  let measured = 0;

  for (const tag of TAGS) {
    await mountOnly(page, tag);
    const handles = await focusablesOf(page, 'mounts');
    if (handles.length === 0) continue;
    elementsWithFocusables++;

    for (let i = 0; i < handles.length; i++) {
      const m = await measureFocusPaint(page, handles[i]);
      if (m.changed < 0) continue;
      measured++;
      const desc = await handles[i].evaluate((el) => {
        const t = el.tagName.toLowerCase();
        const label = el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24);
        return `${t}${label ? ` "${label}"` : ''}`;
      });
      const line = `${tag} › ${desc} — changed=${m.changed} noise=${m.noise}`;
      if (paints(m)) passes.push(line);
      else failures.push(line);
    }
  }

  console.log(`\nmeasured ${measured} focusable controls across ${elementsWithFocusables} elements`);
  console.log(`paints a focus indicator: ${passes.length} | NO focus indicator: ${failures.length}`);

  // Floors first: if the population collapsed, report THAT, not a green run.
  expect(
    elementsWithFocusables,
    'far fewer elements rendered focusable controls than expected — the suite is measuring almost nothing',
  ).toBeGreaterThanOrEqual(MIN_ELEMENTS_WITH_FOCUSABLES);
  expect(
    measured,
    'far fewer focusable controls were measured than expected — the suite is measuring almost nothing',
  ).toBeGreaterThanOrEqual(MIN_FOCUSABLES_MEASURED);

  expect(
    failures,
    `${failures.length} focusable control(s) show NO visible focus indicator to a keyboard user:\n` +
      failures.map((f) => `  ✗ ${f}`).join('\n'),
  ).toEqual([]);
});

/**
 * The other half of "no visible focus indicator": a control the user can Tab to
 * but cannot see at all. Excluding these from the paint measurement above is
 * only honest if something still fails on them, otherwise hiding a control
 * becomes a way to make the paint guard go quiet.
 */
test('no kai-* element leaves an invisible control in the tab order', async ({ page }) => {
  await assertDocumentHasNoTailwind(page);

  const offenders: string[] = [];
  for (const tag of TAGS) {
    await mountOnly(page, tag);
    const found = await page.evaluate(
      ({ sel, tag }) => {
        const out: Element[] = [];
        const collect = (root: ParentNode) => {
          for (const el of Array.from(root.querySelectorAll('*'))) {
            if (el.matches(sel)) out.push(el);
            if ((el as HTMLElement).shadowRoot) collect((el as HTMLElement).shadowRoot!);
          }
        };
        collect(document.getElementById('mounts')!);
        return out
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width <= 2 || r.height <= 2) return false;
            const cs = getComputedStyle(el);
            return cs.visibility === 'hidden' || Number(cs.opacity) <= 0.01;
          })
          .map((el) => {
            const label = el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24);
            return `${tag} › ${el.tagName.toLowerCase()}${label ? ` "${label}"` : ''}`;
          });
      },
      { sel: FOCUSABLE_SELECTOR, tag },
    );
    offenders.push(...found);
  }

  expect(
    offenders,
    'these controls are invisible (opacity 0 / visibility hidden) yet still reachable by Tab, ' +
      'so a keyboard user lands on something they cannot see:\n' +
      offenders.map((o) => `  ✗ ${o}`).join('\n'),
  ).toEqual([]);
});
