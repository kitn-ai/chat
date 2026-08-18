import { beforeEach, describe, expect, it } from 'vitest';
import { defineKaiDevtools, KaiDevtoolsElement } from './panel';
import type { WireDiagnosticEvent } from './contract';

const ev = (o: Record<string, unknown>) => o as unknown as WireDiagnosticEvent;

/** A healthy call: frames in, chunks out, a text part, a stated model. */
const HEALTHY = [
  ev({ type: 'wire.open', t: 0, streamId: 'wire-1', format: 'openai.chat-completions', source: 'response' }),
  ev({ type: 'wire.frame', t: 100, streamId: 'wire-1', seq: 1, bytes: 90, chunks: 1, fields: ['model', 'text'], model: 'openai/gpt-4o-mini' }),
  ev({ type: 'wire.part', t: 110, streamId: 'wire-1', variant: 'text', index: 0, chars: 8 }),
  ev({ type: 'wire.close', t: 900, streamId: 'wire-1', frames: 1, chunks: 1, parts: { text: 1 }, finishReason: 'stop', ms: 900 }),
];

/** Frames arrive and parse to nothing: the wrong-dialect signature. */
const BROKEN = [
  ev({ type: 'wire.open', t: 2000, streamId: 'wire-2', format: 'openai.chat-completions', source: 'response' }),
  ...[1, 2, 3, 4, 5].map((n) =>
    ev({ type: 'wire.frame', t: 2000 + n, streamId: 'wire-2', seq: n, bytes: 100, chunks: 0, fields: [] }),
  ),
  ev({ type: 'wire.close', t: 2010, streamId: 'wire-2', frames: 5, chunks: 0, parts: {}, finishReason: null, errorCode: 'empty-stream', ms: 10 }),
];

beforeEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
  defineKaiDevtools();
});

function mount(events: WireDiagnosticEvent[] = [], attrs: Record<string, string> = {}) {
  const el = document.createElement('kai-devtools') as KaiDevtoolsElement;
  el.setAttribute('hook-version', '1');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  if (events.length) el.pushAll(events);
  return el;
}

const sr = (el: KaiDevtoolsElement) => el.shadowRoot!;
const q = (el: KaiDevtoolsElement, sel: string) => sr(el).querySelector(sel) as HTMLElement | null;
const all = (el: KaiDevtoolsElement, sel: string) => [...sr(el).querySelectorAll(sel)] as HTMLElement[];
const text = (el: KaiDevtoolsElement, sel: string) => q(el, sel)?.textContent?.trim() ?? '';

describe('the cold open', () => {
  it('leads with a healthy verdict and still lists the calls', () => {
    const el = mount(HEALTHY);
    expect(text(el, '[data-testid="verdict"]')).toBe(
      '1 model call · 1 model · 900ms · nothing anomalous',
    );
    expect(q(el, '[data-testid="verdict"]')!.dataset.anomalous).toBe('false');
    // The list stays: a lone verdict with nothing under it reads as broken.
    expect(all(el, '[data-testid="call-row"]')).toHaveLength(1);
  });

  it('replaces the verdict with the finding when a call went wrong', () => {
    const el = mount([...HEALTHY, ...BROKEN]);
    expect(text(el, '[data-testid="verdict"]')).toBe(
      '1 of 2 calls produced no content. 5 frames arrived, none parsed.',
    );
    expect(q(el, '[data-testid="verdict"]')!.dataset.anomalous).toBe('true');
  });

  it('shows the empty state before anything has been recorded', () => {
    const el = mount();
    expect(text(el, '[data-testid="verdict"]')).toBe('Recording. Trigger a request.');
    expect(all(el, '[data-testid="call-row"]')).toHaveLength(0);
  });

  it('renders an unreported model as an em dash, never inferred', () => {
    const el = mount(BROKEN);
    const row = all(el, '[data-testid="call-row"]')[0];
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toContain('gpt');
  });
});

describe('the colour rule', () => {
  it('marks only the rows that have a finding, and never uses green', () => {
    const el = mount([...HEALTHY, ...BROKEN]);
    const markers = all(el, '[data-testid="row-marker"]');
    expect(markers).toHaveLength(2);
    // Healthy row: no colour at all.
    expect(markers[0].className).toContain('bg-transparent');
    // Troubled row: red.
    expect(markers[1].className).toContain('bg-red-500');

    // NOTHING anywhere in the cold open is green. Absence of red is the
    // healthy signal; a green badge on every fine thing is the noise this
    // design exists to remove.
    expect(sr(el).innerHTML).not.toMatch(/green|emerald|lime|teal/);
  });

  it('uses amber only for a call still in flight', () => {
    const el = mount([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-9', format: 'f', source: 'response' }),
      ev({ type: 'wire.frame', t: 10, streamId: 'wire-9', seq: 1, bytes: 10, chunks: 1, fields: ['text'] }),
      ev({ type: 'wire.part', t: 11, streamId: 'wire-9', variant: 'text', index: 0, chars: 3 }),
    ]);
    expect(all(el, '[data-testid="row-marker"]')[0].className).toContain('bg-amber-500');
  });
});

describe('click-through to the inspector', () => {
  it('opens on a row click and comes back', () => {
    const el = mount([...HEALTHY, ...BROKEN]);
    expect(q(el, '[data-testid="inspector"]')).toBeNull();

    all(el, '[data-testid="call-row"]')[1].click();
    expect(q(el, '[data-testid="inspector"]')).not.toBeNull();
    // The findings lead, as plain sentences.
    const findings = all(el, '[data-testid="finding"]');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].textContent).toContain('5 frames arrived and no message part was produced.');

    q(el, '[data-testid="back"]')!.click();
    expect(q(el, '[data-testid="inspector"]')).toBeNull();
    expect(all(el, '[data-testid="call-row"]')).toHaveLength(2);
  });

  it('keeps every evidence section collapsed until asked', () => {
    const el = mount(HEALTHY);
    all(el, '[data-testid="call-row"]')[0].click();

    const sections = all(el, '[data-section]').map((s) => s.textContent!.replace(/\s+/g, ' ').trim());
    // The caret and the label are adjacent nodes, so textContent has no space.
    expect(sections).toEqual(['▸Frames (1)', '▸Parts (1)', '▸Raw events (4)']);
    for (const s of all(el, '[data-section]')) {
      expect(s.getAttribute('aria-expanded')).toBe('false');
    }

    q(el, '[data-section="frames"]')!.click();
    expect(q(el, '[data-section="frames"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('says so plainly when a call has nothing wrong', () => {
    const el = mount(HEALTHY);
    all(el, '[data-testid="call-row"]')[0].click();
    expect(sr(el).textContent).toContain('Nothing anomalous on this call.');
  });
});

describe('the launcher', () => {
  it('collapses to a pill carrying the call count, and reopens', () => {
    const el = mount(HEALTHY);
    q(el, '[data-testid="close"]')!.click();

    const launcher = q(el, '[data-testid="launcher"]');
    expect(launcher).not.toBeNull();
    expect(launcher!.textContent).toContain('kai');
    expect(launcher!.textContent).toContain('1');
    expect(q(el, '[data-testid="drawer"]')).toBeNull();
    // No finding, so no dot.
    expect(q(el, '[data-testid="launcher-alert"]')).toBeNull();

    launcher!.click();
    expect(q(el, '[data-testid="drawer"]')).not.toBeNull();
  });

  it('carries a single red dot when any call has a finding', () => {
    const el = mount([...HEALTHY, ...BROKEN]);
    q(el, '[data-testid="close"]')!.click();
    expect(q(el, '[data-testid="launcher-alert"]')).not.toBeNull();
  });

  it('persists open/closed under the panel key, never the activation key', () => {
    const el = mount(HEALTHY);
    q(el, '[data-testid="close"]')!.click();
    expect(window.localStorage.getItem('kai-devtools:ui')).toContain('"open":false');
    // Remembering a layout preference is not consent to record.
    expect(window.localStorage.getItem('kai-devtools')).toBeNull();
  });
});

describe('the payload indicator', () => {
  it('is absent by default and stated persistently when armed', () => {
    expect(q(mount(HEALTHY), '[data-testid="payload-indicator"]')).toBeNull();

    const armed = mount(HEALTHY, { payload: '' });
    const badge = q(armed, '[data-testid="payload-indicator"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('content capture on');
  });
});
