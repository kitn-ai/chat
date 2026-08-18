/**
 * CAPABILITY 3 — which `kai-*` elements are DEFINED in this realm.
 *
 * The question is hydration, and it is nastier than it sounds because the
 * failure has no symptom. An undefined custom element is a perfectly valid,
 * perfectly inert `HTMLElement`: an SSR page whose markup contains `<kai-chat>`
 * but whose element bundle never loaded renders empty boxes, throws nothing and
 * logs nothing. The SSR starters already answer this by hand for a hard-coded
 * handful (`HydrationBadge.tsx` in the nextjs and tanstack-start starters);
 * this generalises it over every tag the register-all bundle owns.
 *
 * The suite deliberately runs with only SOME elements imported, so `defined` and
 * `notDefined` are both non-empty — a snapshot test where everything is
 * registered cannot tell a working partition from `notDefined` being hardcoded
 * empty.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { subscribeWireDiagnostics, type KaiDiagnosticEvent } from '../wire/diagnostics';
import { emitElementRegistry } from './element-diagnostics';
import type { ElementRegistryEvent } from './diagnostic-events';
import manifest from './element-manifest.json';

// Exactly two of the 79, so the partition has something on both sides.
import './conversation-list';
import './agent-card';

let events: KaiDiagnosticEvent[] = [];
let off: (() => void) | undefined;

beforeEach(() => {
  events = [];
  off = subscribeWireDiagnostics((e) => events.push(e));
});
afterEach(() => off?.());

const snapshots = () =>
  events.filter((e): e is ElementRegistryEvent => e.type === 'element.registry');

describe('element.registry', () => {
  it('partitions every manifest tag into defined and not-defined', () => {
    const event = emitElementRegistry();

    expect(event).toBeDefined();
    expect(snapshots()).toHaveLength(1);
    expect(snapshots()[0]).toBe(event);

    const { defined, notDefined, total } = event!;
    // Both sides populated: the two imported above are defined, and the ~77
    // this file never imported are not.
    expect(defined).toContain('kai-conversations');
    expect(defined).toContain('kai-agent-card');
    expect(notDefined).toContain('kai-chat');
    expect(notDefined.length).toBeGreaterThan(0);

    // The partition is exact — no tag lost, none counted twice.
    expect(defined.length + notDefined.length).toBe(total);
    expect(total).toBe(Object.keys(manifest.tags).length);
    expect(new Set([...defined, ...notDefined]).size).toBe(total);
  });

  it('agrees with customElements.get() tag by tag', () => {
    // The control that stops this being a restatement of the implementation:
    // every verdict is checked against the registry independently.
    const event = emitElementRegistry()!;
    for (const tag of event.defined) expect(customElements.get(tag)).toBeTruthy();
    for (const tag of event.notDefined) expect(customElements.get(tag)).toBeUndefined();
  });

  it('carries the shared envelope', () => {
    const event = emitElementRegistry()!;
    expect(event.type).toBe('element.registry');
    expect(typeof event.t).toBe('number');
  });

  it('emits nothing, and returns undefined, with no subscriber', () => {
    off?.();
    off = undefined;

    expect(emitElementRegistry()).toBeUndefined();

    events = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    expect(snapshots()).toHaveLength(0);
  });

  it('reports a tag that becomes defined later as defined', async () => {
    const before = emitElementRegistry()!;
    expect(before.notDefined).toContain('kai-badge');

    // Registering is a side effect of importing the element module — which is
    // exactly how a lazily-loaded or autoloaded element arrives in a real page.
    await import('./badge');

    const after = emitElementRegistry()!;
    expect(after.defined).toContain('kai-badge');
    expect(after.notDefined).not.toContain('kai-badge');
    expect(after.total).toBe(before.total);
  });
});
