/**
 * `<kai-response-stream>` — the typewriter/fade text-reveal element.
 *
 * WHY THIS FILE EXISTS. Until it, kai-response-stream was on the coverage guard's
 * punch list as `kind: 'nothing'`, with the guard's own note calling it "the worst
 * place in this list for a gap given the kit streams by default". Nothing had ever
 * asserted the reveal happens, the modes differ, the AsyncIterable property path
 * works, or `kai-complete` fires — and `kai-complete` is the consumer's only
 * signal that the reveal is done (enable the input, scroll to bottom, …).
 *
 * CONVENTIONS FOLLOWED (tool.test.tsx, #296's backfill): real registered element;
 * `text` accepts an AsyncIterable, which cannot be written in markup, so
 * markup-then-assign is driven alongside the property path; negative assertions
 * are paired with positives over the same harness. Timing is polled against real
 * timers because the reveal IS timer-driven — each poll has a hard deadline, so a
 * hang fails rather than wedging the suite.
 */
import { afterEach, describe, expect, test } from 'vitest';
import '../../src/elements/response-stream';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Poll until `fn` is truthy or the deadline passes; returns the final verdict. */
async function until(fn: () => boolean, ms = 3000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return fn();
}

afterEach(() => {
  document.body.replaceChildren();
});

type Stream = HTMLElement & {
  text?: string | AsyncIterable<string>;
  mode?: 'typewriter' | 'fade';
  speed?: number;
  as?: string;
};

const shadow = (el: Stream) => el.shadowRoot!;
/**
 * The revealed text. Scoped to the component's own container (`.text-body`, the
 * class the facade pins on it) because the shadow root's textContent also carries
 * the injected compiled-CSS <style>, which would swamp any equality match.
 */
const visible = (el: Stream) => shadow(el).querySelector('.text-body')?.textContent ?? '';

async function mount(setup?: (el: Stream) => void): Promise<Stream> {
  const el = document.createElement('kai-response-stream') as Stream;
  setup?.(el);
  document.body.appendChild(el);
  await flush();
  return el;
}

const TEXT = 'The quick brown fox jumps over the lazy dog, twice, for good measure.';

describe('typewriter (the default mode)', () => {
  test('reveals PROGRESSIVELY: a partial state is observable before the full text', async () => {
    const el = await mount((e) => { e.text = TEXT; e.speed = 20; });

    // A partial render is the mode's whole point — full-text-at-once would pass a
    // bare "eventually shows the text" assertion while being the fade behaviour.
    const sawPartial = await until(() => {
      const t = visible(el);
      return t.length > 0 && t.length < TEXT.length && TEXT.startsWith(t);
    });
    expect(sawPartial, 'must pass through a partial, prefix-shaped state').toBe(true);

    expect(await until(() => visible(el) === TEXT)).toBe(true);
  });

  test('markup + `speed` ATTRIBUTE: <kai-response-stream> streams its attribute text', async () => {
    document.body.innerHTML = '<kai-response-stream text="Hello from markup" speed="1"></kai-response-stream>';
    const el = document.querySelector('kai-response-stream') as Stream;
    expect(await until(() => visible(el) === 'Hello from markup')).toBe(true);
  });

  test('kai-complete fires exactly once, and only AFTER the full text is visible', async () => {
    const el = await mount((e) => { e.text = TEXT; e.speed = 1; });
    let count = 0;
    let textAtFire = '';
    el.addEventListener('kai-complete', () => { count += 1; textAtFire = visible(el); });

    expect(await until(() => count > 0)).toBe(true);
    expect(textAtFire, 'completion must not announce before the reveal finished').toBe(TEXT);
    await new Promise((r) => setTimeout(r, 50));
    expect(count, 'once, not once per tick').toBe(1);
  });

  test('a NEW `text` string restarts the reveal from the beginning', async () => {
    const el = await mount((e) => { e.text = 'First message.'; e.speed = 1; });
    expect(await until(() => visible(el) === 'First message.')).toBe(true);

    el.text = 'Second, unrelated message.';
    await flush();
    expect(await until(() => visible(el) === 'Second, unrelated message.')).toBe(true);
    expect(visible(el), 'the old text must be gone, not appended to').not.toContain('First');
  });
});

describe('the AsyncIterable property path — the shape a live model stream hands over', () => {
  /** An async iterable the test can push into and close, like an SSE reader. */
  function channel() {
    const chunks: string[] = [];
    let closed = false;
    let wake: (() => void) | undefined;
    const iterable: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        let i = 0;
        while (true) {
          if (i < chunks.length) { yield chunks[i++]; continue; }
          if (closed) return;
          await new Promise<void>((r) => { wake = r; });
        }
      },
    };
    return {
      iterable,
      push(chunk: string) { chunks.push(chunk); wake?.(); },
      close() { closed = true; wake?.(); },
    };
  }

  test('chunks accumulate as they arrive, and kai-complete fires after the close', async () => {
    const ch = channel();
    const el = await mount((e) => { e.speed = 1; e.text = ch.iterable; });
    let completed = 0;
    el.addEventListener('kai-complete', () => { completed += 1; });

    ch.push('Streaming ');
    expect(await until(() => visible(el) === 'Streaming ')).toBe(true);
    expect(completed, 'an OPEN stream must not announce completion').toBe(0);

    ch.push('tokens arrive.');
    expect(await until(() => visible(el) === 'Streaming tokens arrive.')).toBe(true);

    ch.close();
    expect(await until(() => completed === 1)).toBe(true);
  });
});

describe('fade mode', () => {
  test('mode="fade" renders per-word fade segments carrying the full text at once', async () => {
    const el = await mount((e) => { e.mode = 'fade'; e.text = 'fade in three words'; });
    await flush();
    const spans = [...shadow(el).querySelectorAll('span.fade-segment')];
    // Words AND the whitespace between them are segments; at minimum one per word.
    expect(spans.length).toBeGreaterThanOrEqual(4);
    expect(visible(el)).toContain('fade in three words');
    // The stagger is CSS-driven: each segment carries its own animation-delay.
    const delays = spans.map((s) => (s as HTMLElement).style.getPropertyValue('animation-delay'));
    expect(new Set(delays).size, 'segments must be staggered, not simultaneous').toBeGreaterThan(1);
  });

  test('typewriter mode renders NO fade segments (the pair)', async () => {
    const el = await mount((e) => { e.text = 'plain reveal'; e.speed = 1; });
    expect(await until(() => visible(el) === 'plain reveal')).toBe(true);
    expect(shadow(el).querySelector('span.fade-segment')).toBeNull();
  });

  test('kai-complete fires for a fade-mode STRING', async () => {
    // This was a shipped defect: use-text-stream.ts's string+fade branch carried a
    // comment — "isComplete fires after animation has time to play" — that no code
    // fulfilled: nothing on that path ever called setIsComplete(true), so the
    // consumer's re-enable-the-input signal never came. (The ASYNC-ITERABLE fade
    // path always completed, in consumeAsyncIterable's .then.) Now wired: a timer
    // of segments * segmentDelay + fadeDuration announces completion — a timer,
    // not a same-tick fire, because the consumer attaches its listener a beat
    // after mount and a 0ms fire raced past it. Began life as a `test.fails`
    // probe; now the guard.
    const el = await mount((e) => { e.mode = 'fade'; e.text = 'short'; });
    let completed = 0;
    el.addEventListener('kai-complete', () => { completed += 1; });
    expect(await until(() => completed > 0), 'fade with a string must eventually complete').toBe(true);
  });
});

describe('event and prop contracts', () => {
  test('kai-complete does NOT fire at MOUNT with nothing to stream', async () => {
    // The same no-event-on-mount contract kai-tool pins for kai-open-change. This
    // was a shipped defect: useTextStream's isComplete signal INITIALISES true,
    // and ResponseStream's `createEffect(on(() => stream.isComplete(), …))` was
    // not deferred, so the first run saw `true` and called onComplete — one
    // spurious kai-complete per mount for any element whose text arrives as a
    // property a beat later (markup-then-assign, the ONLY sequence the
    // AsyncIterable path has). Fixed with `{ defer: true }` on that `on`. Began
    // life as a `test.fails` probe; now the guard.
    const el = document.createElement('kai-response-stream') as Stream;
    const seen: Event[] = [];
    el.addEventListener('kai-complete', (e) => seen.push(e));
    document.body.appendChild(el);
    await flush();
    expect(seen, 'an element that never streamed must not announce completion').toEqual([]);
  });

  test('kai-complete is a non-bubbling, non-composed CustomEvent', async () => {
    const el = await mount((e) => { e.text = 'x'; e.speed = 1; });
    let event: Event | undefined;
    el.addEventListener('kai-complete', (e) => { event = e; });
    expect(await until(() => event !== undefined)).toBe(true);
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event!.bubbles).toBe(false);
    expect(event!.composed).toBe(false);
  });

  test('the documented `as` prop renders the requested tag', async () => {
    // This was a shipped defect: the facade documents `as` as "Element tag to
    // render as" and forwards it, ResponseStream declared it in its props and
    // splitProps list — then rendered a hard-coded `<div>` regardless. Now a
    // `<Dynamic>` honours it (default stays `div`). Began life as a `test.fails`
    // probe; now the guard.
    const el = await mount((e) => { e.as = 'p'; e.text = 'a paragraph'; e.speed = 1; });
    expect(await until(() => visible(el) === 'a paragraph')).toBe(true);
    expect(shadow(el).querySelector('p'), 'the facade documents `as` as "Element tag to render as"').not.toBeNull();
  });
});
