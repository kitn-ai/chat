import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, onCleanup, flush } from 'solid-js';
import {
  toast, getToasts, ensureMounted, isToastRegionMounted,
  resolveDuration, DEFAULT_TOAST_DURATION, ACTION_TOAST_FLOOR,
  configureToasts,
  type ToastItem,
} from './toast-store';

function find(id: string): ToastItem | undefined {
  flush(); // V2-FLUSH: store writes stage until the microtask; commit before reading
  return getToasts().find((t) => t.id === id);
}

beforeEach(() => {
  toast.clear();
  flush(); // V2-FLUSH: commit the staged store write
  // remove any region the previous test mounted
  document.querySelectorAll('kai-toast-region').forEach((el) => el.remove());
});
afterEach(() => {
  toast.clear();
  flush(); // V2-FLUSH: commit the staged store write
  document.querySelectorAll('kai-toast-region').forEach((el) => el.remove());
});

describe('toast() — basics', () => {
  it('returns a handle with an id and pushes the toast', () => {
    const handle = toast('Hello');
    flush(); // V2-FLUSH: commit the staged store write
    expect(handle.id).toBeTruthy();
    expect(find(handle.id)?.message).toBe('Hello');
    expect(find(handle.id)?.variant).toBe('neutral');
  });

  it('toast.success raises a success-variant toast', () => {
    const handle = toast.success('Saved');
    flush(); // V2-FLUSH: commit the staged store write
    expect(find(handle.id)?.variant).toBe('success');
  });

  it('reuses an id to update the toast in place (no duplicate)', () => {
    const a = toast('First', { id: 'fixed' });
    flush(); // V2-FLUSH: commit the staged store write
    const before = getToasts().length;
    toast('Second', { id: 'fixed' });
    flush(); // V2-FLUSH: commit the staged store write
    expect(getToasts().length).toBe(before); // same count
    expect(find('fixed')?.message).toBe('Second');
    expect(a.id).toBe('fixed');
  });

  it('handle.update patches the toast in place', () => {
    const handle = toast('Working');
    flush(); // V2-FLUSH: commit the staged store write
    handle.update({ message: 'Done', variant: 'success' });
    flush(); // V2-FLUSH: commit the staged store write
    expect(find(handle.id)?.message).toBe('Done');
    expect(find(handle.id)?.variant).toBe('success');
  });

  it('handle.dismiss removes the toast', () => {
    const handle = toast('Bye');
    flush(); // V2-FLUSH: commit the staged store write
    expect(find(handle.id)).toBeTruthy();
    handle.dismiss();
    flush(); // V2-FLUSH: commit the staged store write
    expect(find(handle.id)).toBeUndefined();
  });

  it('toast.dismiss(id) removes by id', () => {
    const handle = toast('Bye');
    flush(); // V2-FLUSH: commit the staged store write
    toast.dismiss(handle.id);
    flush(); // V2-FLUSH: commit the staged store write
    expect(find(handle.id)).toBeUndefined();
  });

  it('newly raised toasts are appended after existing ones', () => {
    const a = toast('A');
    flush(); // V2-FLUSH: commit the staged store write
    const b = toast('B');
    flush(); // V2-FLUSH: commit the staged store write
    const ids = getToasts().map((t) => t.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });
});

describe('toast() — appearance / inverse / description', () => {
  it('defaults to the pill appearance and non-inverse', () => {
    const h = toast('Saved');
    flush(); // V2-FLUSH: commit the staged store write
    expect(find(h.id)?.appearance).toBe('pill');
    expect(find(h.id)?.inverse).toBe(false);
  });

  it('carries through appearance / inverse / description from options', () => {
    const h = toast('Deployed', { appearance: 'card', inverse: true, description: 'Live in 30s' });
    flush(); // V2-FLUSH: commit the staged store write
    expect(find(h.id)?.appearance).toBe('card');
    expect(find(h.id)?.inverse).toBe(true);
    expect(find(h.id)?.description).toBe('Live in 30s');
  });

  it('inherits the configured appearance / inverse defaults, with per-toast override', () => {
    configureToasts({ appearance: 'card', inverse: true });
    flush(); // V2-FLUSH: commit the staged store write
    const inherited = toast('A');
    flush(); // V2-FLUSH: commit the staged store write
    expect(find(inherited.id)?.appearance).toBe('card');
    expect(find(inherited.id)?.inverse).toBe(true);
    // per-toast wins over the config default
    const overridden = toast('B', { appearance: 'pill', inverse: false });
    flush(); // V2-FLUSH: commit the staged store write
    expect(find(overridden.id)?.appearance).toBe('pill');
    expect(find(overridden.id)?.inverse).toBe(false);
    configureToasts({ appearance: 'pill', inverse: false }); // reset
    flush(); // V2-FLUSH: commit the staged store write
  });
});

describe('clear-on-cleanup — story-unmount mechanism', () => {
  // The Storybook decorator (.storybook/preview.ts) wraps every story in a Solid
  // component whose `onCleanup` calls `toast.clear()`, so sticky toasts raised by
  // one story don't leak onto the next. The decorator itself is hard to unit-test,
  // but this proves the underlying mechanism: disposing a reactive root whose
  // `onCleanup` clears the store empties `getToasts()` even for sticky toasts.
  it('disposing a root whose onCleanup calls toast.clear() empties the store', () => {
    const dispose = createRoot((d) => {
      onCleanup(() => toast.clear());
      return d;
    });
    // Raise a couple of toasts INCLUDING a sticky one (duration 0) — the kind AMUX
    // raises that would otherwise survive a story unmount.
    toast.warning('agent needs you', { duration: 0 });
    flush(); // V2-FLUSH: commit the staged store write
    toast('heads up');
    flush(); // V2-FLUSH: commit the staged store write
    expect(getToasts().length).toBeGreaterThan(0);

    dispose(); // simulate the story unmounting
    expect(getToasts()).toHaveLength(0);
  });
});

describe('resolveDuration — action floor', () => {
  it('defaults to DEFAULT_TOAST_DURATION', () => {
    expect(resolveDuration({})).toBe(DEFAULT_TOAST_DURATION);
  });

  it('floors duration to ACTION_TOAST_FLOOR when an action is present', () => {
    expect(resolveDuration({ duration: 2000, action: { label: 'x', onAction: () => {} } }))
      .toBe(ACTION_TOAST_FLOOR);
  });

  it('keeps a longer-than-floor duration when an action is present', () => {
    expect(resolveDuration({ duration: 8000, action: { label: 'x', onAction: () => {} } }))
      .toBe(8000);
  });

  it('honours an explicit 0 (sticky) even with an action', () => {
    expect(resolveDuration({ duration: 0, action: { label: 'x', onAction: () => {} } })).toBe(0);
  });
});

describe('ensureMounted', () => {
  it('creates exactly one <kai-toast-region> on document.body', () => {
    ensureMounted();
    flush(); // V2-FLUSH: commit the staged store write
    ensureMounted();
    flush(); // V2-FLUSH: commit the staged store write
    ensureMounted();
    flush(); // V2-FLUSH: commit the staged store write
    expect(document.querySelectorAll('kai-toast-region')).toHaveLength(1);
    expect(isToastRegionMounted()).toBe(true);
  });

  it('binds the reactive store to the region\'s toasts property', () => {
    toast('Bound');
    flush(); // V2-FLUSH: commit the staged store write
    const el = document.querySelector('kai-toast-region') as HTMLElement & { toasts: ToastItem[] };
    expect(el).toBeTruthy();
    expect(el.toasts.some((t) => t.message === 'Bound')).toBe(true);
  });

  it('is created lazily on the first toast() call', () => {
    expect(document.querySelector('kai-toast-region')).toBeNull();
    toast('First');
    flush(); // V2-FLUSH: commit the staged store write
    expect(document.querySelector('kai-toast-region')).not.toBeNull();
  });
});

describe('configureToasts — singleton region config', () => {
  afterEach(() => {
    document.querySelectorAll('kai-toast-region').forEach((n) => n.remove());
    configureToasts({ stack: 'expanded', position: 'top-center', max: 3 }); // reset
    flush(); // V2-FLUSH: commit the staged store write
    toast.clear();
    flush(); // V2-FLUSH: commit the staged store write
  });

  it('applies stack/position/max to the region mounted on the next toast', () => {
    configureToasts({ stack: 'collapsed', position: 'bottom-right', max: 2 });
    flush(); // V2-FLUSH: commit the staged store write
    toast('hi');
    flush(); // V2-FLUSH: commit the staged store write
    const region = document.querySelector('kai-toast-region')!;
    expect(region.getAttribute('stack')).toBe('collapsed');
    expect(region.getAttribute('position')).toBe('bottom-right');
    expect(region.getAttribute('max')).toBe('2');
  });

  it('updates an already-mounted region when called after mount', () => {
    toast('first'); // mounts with defaults
    flush(); // V2-FLUSH: commit the staged store write
    const region = document.querySelector('kai-toast-region')!;
    expect(region.getAttribute('stack')).not.toBe('collapsed');
    configureToasts({ stack: 'collapsed' });
    flush(); // V2-FLUSH: commit the staged store write
    expect(region.getAttribute('stack')).toBe('collapsed');
  });

  it('reflects appearance / inverse defaults onto the region element', () => {
    configureToasts({ appearance: 'card', inverse: true });
    flush(); // V2-FLUSH: commit the staged store write
    toast('hi');
    flush(); // V2-FLUSH: commit the staged store write
    const region = document.querySelector('kai-toast-region')!;
    expect(region.getAttribute('appearance')).toBe('card');
    expect(region.hasAttribute('inverse')).toBe(true);
    // turning inverse back off removes the attribute
    configureToasts({ inverse: false });
    flush(); // V2-FLUSH: commit the staged store write
    expect(region.hasAttribute('inverse')).toBe(false);
    configureToasts({ appearance: 'pill' }); // reset
    flush(); // V2-FLUSH: commit the staged store write
  });
});
