/**
 * The editable text surfaces pin their own text alignment.
 *
 * THE BUG. `text-align` INHERITS. `Empty`'s root carried `text-center`, and
 * `Empty` slots arbitrary content — including a `PromptInput` — so the centering
 * reached in and centered both the placeholder and the typed text of the input.
 * Measured in Chromium: editable and placeholder `::before` both computed
 * `center`, typed text sat 149px from each edge. `Composer` (the control
 * `PromptInput` wraps) had the identical hole in its DEFAULT editable class and
 * reproduced the same way on `components-elements-composer--playground`.
 *
 * THE PIN. An input control's reading direction is a fact about the control, so
 * it states it rather than inheriting it: `text-start` on the editable's class.
 * LOGICAL (`start`), never `text-left` — `text-left` pins the physical edge and
 * would put text on the left of an RTL field, a worse bug than the one it fixes.
 *
 * WHAT THIS TEST CAN AND CANNOT SEE. jsdom has no cascade for INHERITED
 * properties — the negative control below shows an unpinned child of a centered
 * ancestor computing `''`, not `center` — so jsdom cannot reproduce the leak
 * itself. What it CAN do is resolve a class rule, so this file pins two things
 * that together make the fix real, and stops short of pretending to measure the
 * third:
 *   1. the CLASS: both editables emit `text-start` (this is a class-level
 *      assertion, not a computed-value one);
 *   2. that `text-start` is a REAL utility Tailwind emitted into the generated
 *      `compiled.css` as `text-align:start` — the check that would catch a typo
 *      or a Tailwind version that never shipped the logical utility, which is
 *      exactly how a class-level pin goes quietly inert;
 *   3. that with that rule loaded, the editable resolves to `start` under a
 *      centered ancestor.
 * The end-to-end consequence (real inheritance actually being stopped) is only
 * observable in a real browser and was measured there before and after the fix.
 *
 * `Composer` is covered separately from `PromptInput` on purpose: `editableCls()`
 * is `props.editableClass ?? cn(...)`, and a passed `editableClass` REPLACES the
 * default wholesale. `PromptInput` passes one, so it exercises a different string
 * than a bare `Composer` does and a fix to either alone leaves the other broken.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@solidjs/testing-library';
import compiledCss from '../../src/elements/compiled.css?inline';
import { PromptInput, PromptInputTextarea } from '../../src/components/prompt-input';
import { Composer } from '../../src/components/composer';

afterEach(cleanup);

const editableOf = (container: HTMLElement) =>
  container.querySelector('[data-kai-composer-editable]') as HTMLElement;

describe('editable text alignment is pinned, not inherited', () => {
  it('PromptInput emits text-start on its editable', () => {
    const { container } = render(() => (
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Type here..." />
      </PromptInput>
    ));
    expect(editableOf(container).classList.contains('text-start')).toBe(true);
  });

  it('Composer emits text-start on its DEFAULT editable class (no editableClass passed)', () => {
    const { container } = render(() => <Composer placeholder="Ask anything…" />);
    expect(editableOf(container).classList.contains('text-start')).toBe(true);
  });

  it('text-start is a real utility in the generated compiled.css', () => {
    // Not decoration: a class-level pin is only worth anything if the class
    // resolves. Tailwind 4 emits the logical utility; an earlier version or a
    // typo'd name would leave both assertions above green over a dead class.
    expect(compiledCss).toMatch(/\.text-start\s*\{[^}]*text-align:\s*start/);
  });

  it('resolves to start under a centered ancestor, where an unpinned element does not', () => {
    const style = document.createElement('style');
    style.textContent = '.text-start{text-align:start}';
    document.head.appendChild(style);
    const centered = document.createElement('div');
    centered.style.textAlign = 'center';
    document.body.appendChild(centered);
    try {
      const { container } = render(() => <Composer placeholder="Ask anything…" />, {
        container: centered.appendChild(document.createElement('div')),
      });
      const editable = editableOf(container);
      expect(getComputedStyle(editable).textAlign).toBe('start');
      expect(getComputedStyle(editable).textAlign).not.toBe('center');

      // Negative control + documentation of the limit: jsdom does not propagate
      // inherited properties, so an UNPINNED sibling reads '' here rather than
      // the 'center' a browser would report. That is precisely why the leak
      // itself is measured in Chromium and only the pin is measured here.
      const unpinned = centered.appendChild(document.createElement('div'));
      expect(getComputedStyle(centered).textAlign).toBe('center');
      expect(getComputedStyle(unpinned).textAlign).not.toBe('center');
    } finally {
      style.remove();
      centered.remove();
    }
  });
});
