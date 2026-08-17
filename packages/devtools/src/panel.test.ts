import { beforeEach, describe, expect, it } from 'vitest';
import { defineKaiDevtools, KaiDevtoolsElement } from './panel';
import type { WireDiagnosticEvent } from './contract';

const ev = (o: Record<string, unknown>) => o as unknown as WireDiagnosticEvent;

/** A healthy stream, a wrong-dialect stream and a 401, so every status and both
 *  filters have something to bite on. */
const HEALTHY = [
  ev({ type: 'wire.open', t: 0, streamId: 'wire-1', format: 'openai.chat-completions', source: 'response' }),
  ev({ type: 'wire.frame', t: 10, streamId: 'wire-1', seq: 1, bytes: 90, chunks: 1, fields: ['model', 'text'], model: 'openai/gpt-4o-mini' }),
  ev({ type: 'wire.part', t: 11, streamId: 'wire-1', variant: 'text', index: 0, chars: 5 }),
  ev({ type: 'wire.close', t: 20, streamId: 'wire-1', frames: 1, chunks: 1, parts: { text: 1 }, finishReason: 'stop', ms: 20 }),
];
const DIALECT = [
  ev({ type: 'wire.open', t: 30, streamId: 'wire-2', format: 'openai.chat-completions', source: 'response' }),
  ev({ type: 'wire.frame', t: 31, streamId: 'wire-2', seq: 1, bytes: 120, chunks: 1, fields: ['usage'] }),
  ev({ type: 'wire.close', t: 33, streamId: 'wire-2', frames: 1, chunks: 1, parts: {}, finishReason: null, errorCode: 'empty-turn', ms: 3 }),
];
const FAILED = [
  ev({ type: 'wire.failed', t: 40, streamId: 'wire-3', status: 401, statusText: 'Unauthorized', bodyBytes: 88, bodyIsJson: true, providerCode: 'invalid_api_key' }),
];

beforeEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
  defineKaiDevtools();
});

function mount(events: WireDiagnosticEvent[] = []): KaiDevtoolsElement {
  const el = document.createElement('kai-devtools') as KaiDevtoolsElement;
  el.setAttribute('hook-version', '1');
  document.body.appendChild(el);
  if (events.length) el.pushAll(events);
  return el;
}

const sr = (el: KaiDevtoolsElement) => el.shadowRoot!;
const text = (el: KaiDevtoolsElement) => sr(el).textContent ?? '';
const rows = (el: KaiDevtoolsElement) => [...sr(el).querySelectorAll('.row')];
const click = (el: KaiDevtoolsElement, sel: string) =>
  (sr(el).querySelector(sel) as HTMLElement).click();
/** Evidence sections are collapsed by default; open one to inspect it. */
const open = (el: KaiDevtoolsElement, section: string) =>
  (sr(el).querySelector(`[data-section="${section}"]`) as HTMLElement).click();

describe('launcher and drawer', () => {
  it('opens by default on first activation, so nobody thinks it is broken', () => {
    const el = mount();
    expect(sr(el).querySelector('.drawer')).not.toBeNull();
    expect(sr(el).querySelector('.launcher')).toBeNull();
  });

  it('closes to a launcher pill and reopens, persisting the choice', () => {
    const el = mount(HEALTHY);
    click(el, '[data-act="close"]');
    const launcher = sr(el).querySelector('.launcher');
    expect(launcher).not.toBeNull();
    expect(sr(el).querySelector('.drawer')).toBeNull();
    // The stream count travels on the pill.
    expect(launcher!.textContent).toContain('1');
    expect(window.localStorage.getItem('kai-devtools:ui')).toContain('"open":false');
    // And a fresh element honours it.
    const again = mount(HEALTHY);
    expect(sr(again).querySelector('.drawer')).toBeNull();

    click(again, '.launcher');
    expect(sr(again).querySelector('.drawer')).not.toBeNull();
  });

  it('shows a red dot on the pill when a stream failed or came back empty', () => {
    const ok = mount(HEALTHY);
    click(ok, '[data-act="close"]');
    expect(sr(ok).querySelector('.launcher .alert')).toBeNull();

    window.localStorage.clear();
    const bad = mount([...HEALTHY, ...FAILED]);
    click(bad, '[data-act="close"]');
    expect(sr(bad).querySelector('.launcher .alert')).not.toBeNull();
  });

  it('never writes the activation key', () => {
    const el = mount(HEALTHY);
    click(el, '[data-act="close"]');
    // Remembering that the drawer was open is not consent to record.
    expect(window.localStorage.getItem('kai-devtools')).toBeNull();
  });
});

describe('the stream list', () => {
  it('renders one row per stream with a status class', () => {
    const el = mount([...HEALTHY, ...DIALECT, ...FAILED]);
    expect(rows(el)).toHaveLength(3);
    expect(rows(el)[0].className).toContain('ok');
    expect(rows(el)[1].className).toContain('empty');
    expect(rows(el)[2].className).toContain('failed');
  });

  it('selects the clicked stream and swaps the inspector', () => {
    const el = mount([...HEALTHY, ...DIALECT]);
    // First row is selected by default.
    expect(rows(el)[0].getAttribute('aria-selected')).toBe('true');
    expect(text(el)).toContain('openai/gpt-4o-mini');

    (rows(el)[1] as HTMLElement).click();
    expect(rows(el)[1].getAttribute('aria-selected')).toBe('true');
    expect(rows(el)[0].getAttribute('aria-selected')).toBe('false');
    // wire-2 stated no model, and the inspector must not borrow wire-1's.
    expect(text(el)).not.toContain('openai/gpt-4o-mini');
    expect(text(el)).toContain('empty-turn');
  });

  it('moves selection with the arrow keys', () => {
    const el = mount([...HEALTHY, ...DIALECT, ...FAILED]);
    const list = sr(el).querySelector('.list') as HTMLElement;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(rows(el)[1].getAttribute('aria-selected')).toBe('true');
    sr(el)
      .querySelector('.list')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(rows(el)[0].getAttribute('aria-selected')).toBe('true');
  });
});

describe('filters', () => {
  it('status pills carry live counts and narrow the list', () => {
    const el = mount([...HEALTHY, ...DIALECT, ...FAILED]);
    const pill = (s: string) => sr(el).querySelector(`[data-status="${s}"]`) as HTMLElement;
    expect(pill('ok').textContent).toContain('1');
    expect(pill('empty').textContent).toContain('1');
    expect(pill('failed').textContent).toContain('1');

    pill('failed').click();
    expect(pill('failed').getAttribute('aria-pressed')).toBe('true');
    expect(rows(el)).toHaveLength(1);
    expect(rows(el)[0].textContent).toContain('wire-3');

    pill('failed').click();
    expect(rows(el)).toHaveLength(3);
  });

  it('the text filter matches id, format, model and error code', () => {
    const el = mount([...HEALTHY, ...DIALECT, ...FAILED]);
    const type = (v: string) => {
      const input = sr(el).querySelector('.search') as HTMLInputElement;
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    type('wire-2');
    expect(rows(el)).toHaveLength(1);

    type('gpt-4o-mini'); // model, stated only by wire-1
    expect(rows(el)).toHaveLength(1);
    expect(rows(el)[0].textContent).toContain('wire-1');

    type('invalid_api_key'); // error code
    expect(rows(el)).toHaveLength(1);
    expect(rows(el)[0].textContent).toContain('wire-3');

    type('chat-completions'); // format
    expect(rows(el)).toHaveLength(2);

    type('');
    expect(rows(el)).toHaveLength(3);
  });

  it('clear empties the panel back to its empty state', () => {
    const el = mount([...HEALTHY, ...DIALECT]);
    click(el, '[data-act="clear"]');
    expect(rows(el)).toHaveLength(0);
    expect(text(el)).toContain('No streams yet');
  });
});

describe('the inspector', () => {
  it('renders one frames row per wire.frame, with its fields as chips', () => {
    const el = mount(HEALTHY);
    open(el, 'frames');
    const chips = [...sr(el).querySelectorAll('.chip')].map((c) => c.textContent);
    expect(chips).toEqual(['model', 'text']);
    // Content keys are emphasised; metadata keys are not. An all-hollow row is
    // the wrong-dialect signature, and that has to be visible, not inferred.
    const content = [...sr(el).querySelectorAll('.chip.content')].map((c) => c.textContent);
    expect(content).toEqual(['text']);
  });

  it('a metadata-only frame has no emphasised chip', () => {
    const el = mount(DIALECT);
    open(el, 'frames');
    expect([...sr(el).querySelectorAll('.chip')].map((c) => c.textContent)).toEqual(['usage']);
    expect(sr(el).querySelectorAll('.chip.content')).toHaveLength(0);
  });

  it('renders an unreported model as an em dash, never invented', () => {
    const el = mount(DIALECT);
    expect(sr(el).querySelector('.v.absent')).not.toBeNull();
    expect(text(el)).toContain('—');
  });

  it('scopes the raw event log to the selected stream', () => {
    const el = mount([...HEALTHY, ...DIALECT]);
    open(el, 'raw');
    const lines = () => [...sr(el).querySelectorAll('.raw div')].length;
    expect(lines()).toBe(HEALTHY.length);
    (rows(el)[1] as HTMLElement).click();
    expect(lines()).toBe(DIALECT.length);
  });

  it('shows an empty state when there is nothing to inspect', () => {
    const el = mount();
    expect(text(el)).toContain('No streams yet');
  });
});

describe('the metadata boundary', () => {
  it('renders field NAMES but never a value from the stream', () => {
    const SECRET = 'the user said something private';
    const el = mount([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-9', format: 'openai.chat-completions', source: 'response' }),
      // A hostile event carrying content-shaped fields the panel must ignore.
      ev({ type: 'wire.frame', t: 1, streamId: 'wire-9', seq: 1, bytes: 10, chunks: 1, fields: ['text'], text: SECRET }),
      ev({ type: 'wire.part', t: 2, streamId: 'wire-9', variant: 'text', index: 0, chars: SECRET.length, delta: SECRET }),
    ]);
    expect(text(el)).toContain('text');
    expect(text(el)).toContain(String(SECRET.length));
    expect(text(el)).not.toContain(SECRET);
    expect(sr(el).innerHTML).not.toContain(SECRET);
  });
});

describe('the report card', () => {
  it('leads the inspector, above the summary grid', () => {
    const el = mount(HEALTHY);
    const secs = [...sr(el).querySelectorAll('.inspector .sec-h, .inspector .disc')].map(
      (n) => n.textContent!.trim().split(' ')[0],
    );
    expect(secs[0]).toBe('Report');
    expect(secs[1]).toBe('Summary');
  });

  it('a healthy stream shows no failing check', () => {
    const el = mount(HEALTHY);
    expect(sr(el).querySelectorAll('.finding.fail')).toHaveLength(0);
    expect(text(el)).toContain('1 text part from 1 frame.');
  });

  it('a wrong-dialect stream states the observation before the suspicion', () => {
    const el = mount(DIALECT);
    const fails = [...sr(el).querySelectorAll('.finding.fail .say')].map((n) => n.textContent);
    expect(fails.join(' ')).toContain('1 frame arrived and no message part was produced.');
    expect(fails.join(' ')).toContain('no frame carried a content key');
  });
});

describe('evidence disclosures', () => {
  it('are collapsed by default and toggle open, remembering the choice', () => {
    const el = mount(HEALTHY);
    const frames = () => sr(el).querySelector('[data-section="frames"]') as HTMLElement;
    expect(frames().getAttribute('aria-expanded')).toBe('false');
    // Collapsed means the table is not in the DOM at all.
    expect(sr(el).querySelector('.inspector table')).toBeNull();

    frames().click();
    expect(frames().getAttribute('aria-expanded')).toBe('true');
    expect(sr(el).querySelector('.inspector table')).not.toBeNull();
    expect(window.localStorage.getItem('kai-devtools:ui')).toContain('"frames":true');

    // A fresh element honours it.
    const again = mount(HEALTHY);
    expect(
      (again.shadowRoot!.querySelector('[data-section="frames"]') as HTMLElement).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');
  });

  it('shows all three sections with their counts', () => {
    const el = mount(HEALTHY);
    const labels = [...sr(el).querySelectorAll('[data-section]')].map((n) =>
      n.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(labels).toEqual(['▸Frames (1)', '▸Parts (1)', '▸Raw events (4)']);
  });
});
