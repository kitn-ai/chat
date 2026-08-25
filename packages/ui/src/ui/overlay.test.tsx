/**
 * Regression tests for createPresence: the show-once latch.
 *
 * createPresence keeps a node mounted through its CSS exit animation. On the
 * NO-animation close path (jsdom, and real overlays with no exit animation such
 * as the composer's `/`/`@` trigger menu) it unmounts on a queued microtask.
 * The latch bug class: after one open -> close cycle, a stale close microtask
 * unmounts the node even though `show()` has gone true again, so a menu gated by
 * `<Show when={present()}>` never re-renders. createEffect is deferred, so a
 * re-show can land after the close queued its microtask but before its open
 * branch reruns; the fix re-reads `show()` at fire time and bails while visible.
 *
 * These drive createPresence directly and assert the reopen invariant:
 * a show -> false -> true sequence must always end with present() === true.
 */
import { describe, it, expect } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { render } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import { createPresence } from './overlay';

// Both Solid's (deferred) effect queue and createPresence's queueMicrotask land
// on the microtask queue; a macrotask flush drains everything queued so far.
const flush = () => new Promise((r) => setTimeout(r, 0));
const micro = () => Promise.resolve();

describe('createPresence', () => {
  it('a plain div exercises the no-animation close path in jsdom', () => {
    // The latch only lives on the no-anim branch, so the test element must take
    // it. Replicate createPresence's own hasAnim probe: no anim name or 0s
    // duration -> no-anim path (unmount via microtask, not animationend).
    const el = document.createElement('div');
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const hasAnim = cs.animationName !== 'none' && parseFloat(cs.animationDuration || '0') > 0;
    expect(hasAnim).toBe(false);
    el.remove();
  });

  it('reopens after a full open -> close -> open cycle (no-anim path)', async () => {
    await createRoot(async (dispose) => {
      const [show, setShow] = createSignal(false);
      const { present, setRef } = createPresence(show);
      const el = document.createElement('div');
      document.body.appendChild(el);
      setRef(el);
      // V2-SHAPE: v2 rejects reactive writes inside an owned scope's synchronous
      // execution (REACTIVE_WRITE_IN_OWNED_SCOPE); one microtask exits the root's
      // sync scope so the drives below run as plain external writes, as they
      // effectively did under 1.x.
      await micro();

      setShow(true);
      await flush();
      expect(present()).toBe(true); // open #1

      setShow(false);
      await flush();
      expect(present()).toBe(false); // close #1, no-anim microtask unmount

      setShow(true);
      await flush();
      expect(present()).toBe(true); // reopen, must NOT stay latched false

      el.remove();
      dispose();
    });
  });

  it('survives two full open/close cycles', async () => {
    await createRoot(async (dispose) => {
      const [show, setShow] = createSignal(false);
      const { present, setRef } = createPresence(show);
      const el = document.createElement('div');
      document.body.appendChild(el);
      setRef(el);
      await micro(); // V2-SHAPE: see the note in the first cycle test

      for (let i = 0; i < 2; i++) {
        setShow(true);
        await flush();
        expect(present()).toBe(true);
        setShow(false);
        await flush();
        expect(present()).toBe(false);
      }
      setShow(true);
      await flush();
      expect(present()).toBe(true);

      el.remove();
      dispose();
    });
  });

  it('recovers when a re-show lands after the close microtask fired', async () => {
    // Mirrors the deferred-effect interleaving: let the close microtask run
    // (present -> false) and only then re-show. The reopen must return present
    // to true rather than being swallowed by the just-fired close.
    await createRoot(async (dispose) => {
      const [show, setShow] = createSignal(false);
      const { present, setRef } = createPresence(show);
      const el = document.createElement('div');
      document.body.appendChild(el);
      setRef(el);
      // V2-SHAPE: v2 rejects reactive writes inside an owned scope's synchronous
      // execution (REACTIVE_WRITE_IN_OWNED_SCOPE); one microtask exits the root's
      // sync scope so the drives below run as plain external writes, as they
      // effectively did under 1.x.
      await micro();

      setShow(true);
      await flush();
      expect(present()).toBe(true);

      setShow(false);
      await micro(); // one microtask: the close's setPresent(false) fires
      setShow(true);
      await flush();
      expect(present()).toBe(true);

      el.remove();
      dispose();
    });
  });

  it('a rapid close -> reopen within one tick ends up present (generation race)', async () => {
    await createRoot(async (dispose) => {
      const [show, setShow] = createSignal(false);
      const { present, setRef } = createPresence(show);
      const el = document.createElement('div');
      document.body.appendChild(el);
      setRef(el);
      // V2-SHAPE: v2 rejects reactive writes inside an owned scope's synchronous
      // execution (REACTIVE_WRITE_IN_OWNED_SCOPE); one microtask exits the root's
      // sync scope so the drives below run as plain external writes, as they
      // effectively did under 1.x.
      await micro();

      setShow(true);
      await flush();
      expect(present()).toBe(true);

      // close then immediately reopen, before the close microtask can fire.
      setShow(false);
      setShow(true);
      await flush();
      expect(present()).toBe(true);

      el.remove();
      dispose();
    });
  });

  it('the no-anim close still unmounts when it should stay closed', async () => {
    await createRoot(async (dispose) => {
      const [show, setShow] = createSignal(false);
      const { present, setRef } = createPresence(show);
      const el = document.createElement('div');
      document.body.appendChild(el);
      setRef(el);
      // V2-SHAPE: v2 rejects reactive writes inside an owned scope's synchronous
      // execution (REACTIVE_WRITE_IN_OWNED_SCOPE); one microtask exits the root's
      // sync scope so the drives below run as plain external writes, as they
      // effectively did under 1.x.
      await micro();

      setShow(true);
      await flush();
      expect(present()).toBe(true);

      setShow(false);
      await flush();
      expect(present()).toBe(false); // a genuine close must unmount

      el.remove();
      dispose();
    });
  });

  it('a <Show>-gated node re-mounts across open/close/open (composer menu shape)', async () => {
    // The exact consumer shape: setRef attached to the child of
    // <Show when={present()}>, so the node unmounts on close and a fresh node
    // mounts on reopen. Guards against the menu opening exactly once.
    const [show, setShow] = createSignal(false);
    let presentAcc!: () => boolean;
    const { container } = render(() => {
      const { present, setRef } = createPresence(show);
      presentAcc = present;
      return (
        <Show when={present()}>
          <div ref={setRef} data-testid="menu">menu</div>
        </Show>
      );
    });
    const node = () => container.querySelector('[data-testid="menu"]');

    setShow(true);
    await flush();
    expect(node()).not.toBeNull();

    setShow(false);
    await flush();
    expect(node()).toBeNull();

    setShow(true);
    await flush();
    expect(node()).not.toBeNull();
    expect(presentAcc()).toBe(true);
  });
});
