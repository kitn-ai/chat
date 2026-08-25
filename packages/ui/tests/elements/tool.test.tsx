/**
 * `<kai-tool>` — the collapsible tool-call panel.
 *
 * WHY THIS FILE EXISTS. kai-tool is a core agentic element and it renders
 * MODEL-CONTROLLED text: the tool name, every argument the model streamed, the
 * output the tool returned, and the provider's error string. Before this file the
 * only thing in the tree that had ever watched it draw was
 * `tests/agent-tooling/emitted-card-path.live.test.ts`, and that file saw it
 * render and then deliberately steered AROUND it — its header comment says so:
 *
 *   "THE ASSERTION IS SCOPED TO THE CARD, AND THAT IS LOAD-BEARING. `<kai-tool>`
 *    renders the model's arguments a few inches up the same thread, so an unscoped
 *    `textContent` match on 'Delete the production database?' is satisfied by the
 *    tool panel's echo whether or not a card ever drew."
 *
 * That is the correct call for THAT test — but it means the one place in the repo
 * that had observed kai-tool painting a model's arguments treated the painting as
 * NOISE and asserted nothing about it. So the panel's own rendering had never been
 * pinned by anything. This file pins it.
 *
 * CONVENTIONS FOLLOWED. Assertions run against the real custom element rather than
 * the Solid component (`dock.test.tsx`, `semantic-state.aria.test.tsx`), every
 * negative assertion is paired with a positive one over the SAME harness
 * (`reactivity-contract.test.tsx`'s rule), and the hostile-input groups assert the
 * source text stays VISIBLE as well as inert (`markdown-xss.test.tsx`'s rule —
 * escaping is the correct rendering, and a filter that deleted the text would pass
 * the security assertion while being a worse UI).
 *
 * WHAT JSDOM CANNOT SEE, stated rather than papered over. The collapsed body is
 * hidden by a `grid-rows-[0fr]` + `overflow: hidden` pair that jsdom neither lays
 * out nor computes, so no test here can prove a sighted user cannot READ the
 * collapsed error text. What is asserted instead is the DOM state a browser and an
 * AT act on: the body carries `inert` and `data-closed`, the trigger reports
 * `aria-expanded="false"`, and the error affordance lives OUTSIDE that subtree.
 */
import { flush as flushSync } from 'solid-js';
import { afterEach, describe, expect, test } from 'vitest';
import '../../src/elements/tool';
import type { ToolPart } from '../../src/components/tool-types';

/**
 * Past a macrotask, not just a microtask. The facade's `open` reflection lands in
 * `attributeChangedCallback`, a task later than the Solid effect that wrote it; a
 * bare `await Promise.resolve()` reads before it and passes vacuously.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type Tool = HTMLElement & Record<string, unknown> & {
  tool?: ToolPart;
  show(): void; hide(): void; toggle(): void;
};

async function mount(tool?: ToolPart): Promise<Tool> {
  const el = document.createElement('kai-tool') as Tool;
  if (tool) el.tool = tool;
  document.body.appendChild(el);
  await flush();
  return el;
}

const shadow = (el: Tool) => el.shadowRoot!;
/** The disclosure header — a real <button>, and the ONLY thing outside the body. */
const trigger = (el: Tool) => shadow(el).querySelector('button[aria-expanded]') as HTMLButtonElement;
/** The collapsible body, found through the trigger's own `aria-controls`. */
const body = (el: Tool) => shadow(el).getElementById(trigger(el).getAttribute('aria-controls')!)!;
const expanded = (el: Tool) => trigger(el).getAttribute('aria-expanded') === 'true';
/** The `<div>` following a labelled section heading, e.g. `Input` / `Output` / `Error`. */
function section(el: Tool, heading: string): HTMLElement | null {
  const h = [...body(el).querySelectorAll('h4')].find((n) => n.textContent?.trim() === heading);
  return (h?.nextElementSibling as HTMLElement) ?? null;
}

/** A tool part as `upsertToolPart` would hand one over, at a chosen lifecycle state. */
const part = (over: Partial<ToolPart> = {}): ToolPart => ({
  type: 'search_web',
  state: 'input-streaming',
  toolCallId: 'call_abc123',
  ...over,
});

// ---------------------------------------------------------------------------
// It draws at all — the assertion the live card test stepped around
// ---------------------------------------------------------------------------

describe('the panel renders the tool call', () => {
  test('nothing renders without a `tool`, and the SAME element renders once given one', async () => {
    // The facade is `<Show when={props.tool}>`. Paired over one harness so every
    // "the panel shows X" assertion below cannot be passing against a blank element.
    const el = await mount();
    expect(shadow(el).querySelector('button[aria-expanded]')).toBeNull();

    el.tool = part({ state: 'input-available', input: { query: 'kitn ui docs' } });
    await flush();
    expect(trigger(el)).not.toBeNull();
    expect(trigger(el).textContent).toContain('search_web');
  });

  test('the header carries the tool NAME and the state badge', async () => {
    const el = await mount(part({ state: 'input-available', input: { query: 'kitn ui docs' } }));
    expect(trigger(el).textContent).toContain('search_web');
    expect(trigger(el).textContent).toContain('Ready');
  });

  test('every ARGUMENT the model sent is rendered, key and value', async () => {
    const el = await mount(part({
      state: 'input-available',
      input: { query: 'kitn ui docs', limit: 5, safe: true, filters: { lang: 'en' } },
    }));
    const input = section(el, 'Input')!;
    expect(input, 'the Input section must exist').not.toBeNull();
    expect(input.textContent).toContain('query:');
    expect(input.textContent).toContain('kitn ui docs');
    expect(input.textContent).toContain('limit:');
    expect(input.textContent).toContain('5');
    expect(input.textContent).toContain('safe:');
    expect(input.textContent).toContain('true');
    // Object values are pretty-printed JSON, not `[object Object]`.
    expect(input.textContent).toContain('"lang": "en"');
    expect(input.textContent).not.toContain('[object Object]');
  });

  test('the OUTPUT is rendered as pretty-printed JSON in a <pre>', async () => {
    const el = await mount(part({
      state: 'output-available',
      input: { query: 'kitn ui docs' },
      output: { results: 2, top: 'https://ui.kitn.ai' },
    }));
    const output = section(el, 'Output')!;
    expect(output.querySelector('pre')).not.toBeNull();
    expect(output.textContent).toContain('"results": 2');
    expect(output.textContent).toContain('https://ui.kitn.ai');
  });

  test('the tool-call id is shown, so a panel can be tied back to a provider log', async () => {
    const el = await mount(part({ state: 'output-available', output: { ok: true } }));
    expect(body(el).textContent).toContain('Call ID: call_abc123');
  });

  test('an empty `input` object draws no empty Input section (the pair for the case above)', async () => {
    const el = await mount(part({ state: 'input-available', input: {} }));
    expect(section(el, 'Input')).toBeNull();
    // Paired: the same element grows one as soon as there is an argument.
    el.tool = part({ state: 'input-available', input: { query: 'x' } });
    await flush();
    expect(section(el, 'Input')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The real lifecycle, driven the way a stream drives it
// ---------------------------------------------------------------------------

describe('the tool lifecycle, state by state', () => {
  test('input-streaming -> input-available -> output-available', async () => {
    // Driven through NEW OBJECTS each time, which is the kit's reactivity contract
    // for an edited item (CLAUDE.md): the array reference notifies, the item's
    // object identity is what makes the change visible.
    const el = await mount(part({ state: 'input-streaming' }));
    expect(trigger(el).textContent).toContain('Processing');
    expect(body(el).textContent).toContain('Processing tool call...');
    expect(section(el, 'Output')).toBeNull();

    el.tool = part({ state: 'input-available', input: { query: 'kitn ui docs' } });
    await flush();
    expect(trigger(el).textContent).toContain('Ready');
    expect(trigger(el).textContent, 'the old state label must be gone, not merely joined').not.toContain('Processing');
    expect(body(el).textContent).not.toContain('Processing tool call...');
    expect(section(el, 'Input')!.textContent).toContain('kitn ui docs');

    el.tool = part({
      state: 'output-available',
      input: { query: 'kitn ui docs' },
      output: { results: 2 },
    });
    await flush();
    expect(trigger(el).textContent).toContain('Completed');
    expect(trigger(el).textContent).not.toContain('Ready');
    expect(section(el, 'Output')!.textContent).toContain('"results": 2');
    // The arguments survive the arrival of the output — a completed call still
    // shows what it was called WITH.
    expect(section(el, 'Input')!.textContent).toContain('kitn ui docs');
  });

  test('input-streaming -> output-error', async () => {
    const el = await mount(part({ state: 'input-streaming' }));
    expect(trigger(el).textContent).toContain('Processing');

    el.tool = part({
      state: 'output-error',
      input: { query: 'kitn ui docs' },
      errorText: 'upstream timed out after 30s',
    });
    await flush();
    expect(trigger(el).textContent).toContain('Error');
    expect(trigger(el).textContent).not.toContain('Processing');
    expect(section(el, 'Error')!.textContent).toContain('upstream timed out after 30s');
  });

  test('each state gets its own badge word and its own icon', async () => {
    const el = await mount(part({ state: 'input-streaming' }));
    const seen = new Map<string, string>();
    for (const [state, label] of [
      ['input-streaming', 'Processing'],
      ['input-available', 'Ready'],
      ['output-available', 'Completed'],
      ['output-error', 'Error'],
    ] as const) {
      el.tool = part({ state });
      await flush();
      expect(trigger(el).textContent, `${state} must read "${label}"`).toContain(label);
      // The icon is the non-text half of the same signal. Lucide stamps the glyph
      // name into the class, which is the only handle jsdom has on "which icon".
      const icon = trigger(el).querySelector('svg[class*="lucide-"]')!;
      const name = [...icon.classList].find((c) => c.startsWith('lucide-') && c !== 'lucide-icon')!;
      seen.set(state, name);
    }
    // Four states, four DISTINCT glyphs — otherwise the icon carries no information.
    expect(new Set(seen.values()).size, `one glyph per state, got ${[...seen]}`).toBe(4);
  });

  test('output-error with no errorText still reads as failed (no blank panel)', async () => {
    const el = await mount(part({ state: 'output-error' }));
    expect(trigger(el).textContent).toContain('Error');
    expect(section(el, 'Error'), 'no Error section without errorText').toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FIX1 — the collapsed/expanded split for a FAILED call
// ---------------------------------------------------------------------------

describe('a failure is visible collapsed; the reason is one click away', () => {
  const failing = part({
    state: 'output-error',
    input: { query: 'kitn ui docs' },
    errorText: 'upstream timed out after 30s',
  });

  test('collapsed: the error affordance is in the header, OUTSIDE the collapsed body', async () => {
    // The split this pins is structural, and it is the half a browser needs to be
    // right: the badge and icon sit on the trigger, which is never inert and never
    // collapsed, while the reason sits inside the region the trigger controls.
    const el = await mount(failing);
    expect(expanded(el)).toBe(false);

    expect(trigger(el).textContent).toContain('Error');
    expect(trigger(el).querySelector('svg[class*="lucide-circle-x"]')).not.toBeNull();
    expect(trigger(el).contains(section(el, 'Error')), 'the reason must NOT be in the header').toBe(false);

    // jsdom lays nothing out, so this asserts the DOM state the browser and the AT
    // act on rather than pixels: the body is inert and marked closed.
    expect(body(el).hasAttribute('inert')).toBe(true);
    expect(body(el).hasAttribute('data-closed')).toBe(true);
    expect(body(el).contains(section(el, 'Error'))).toBe(true);
  });

  test('expanded: the same body carries the reason and is no longer inert', async () => {
    // The pair. Without it, "the reason is inside an inert region" would pass just
    // as well against a panel that never renders the reason at all.
    const el = await mount(failing);
    trigger(el).click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();

    expect(expanded(el)).toBe(true);
    expect(body(el).hasAttribute('inert')).toBe(false);
    expect(body(el).hasAttribute('data-closed')).toBe(false);
    expect(section(el, 'Error')!.textContent).toContain('upstream timed out after 30s');
  });

  test('the header never leaks the reason text, in either state', async () => {
    const el = await mount(failing);
    expect(trigger(el).textContent).not.toContain('upstream timed out');
    trigger(el).click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();
    expect(trigger(el).textContent).not.toContain('upstream timed out');
  });
});

// ---------------------------------------------------------------------------
// Hostile, model-controlled content — through the panel's OWN path
// ---------------------------------------------------------------------------

/** Every element the panel actually created, so an injected tag cannot hide. */
const tags = (root: ParentNode) => new Set([...root.querySelectorAll('*')].map((n) => n.tagName.toLowerCase()));
/** Any live event-handler attribute anywhere under `root`. */
const handlerAttrs = (root: ParentNode) =>
  [...root.querySelectorAll('*')].flatMap((n) => [...n.attributes].map((a) => a.name)).filter((n) => /^on/i.test(n));

describe('hostile model output renders VISIBLE and INERT', () => {
  // An attacker does not need a hostile provider here: influencing the model's
  // OUTPUT is enough, and a tool call is model output end to end — the name, the
  // arguments and (via a compromised or merely echoing tool) the result.
  const XSS = '<script>alert(1)</script>';
  const IMG = '<img src=x onerror="alert(1)">';

  test('a script tag in an ARGUMENT string is text, not a script', async () => {
    const el = await mount(part({ state: 'input-available', input: { query: XSS } }));
    const input = section(el, 'Input')!;
    // Inert.
    expect(tags(shadow(el)).has('script')).toBe(false);
    expect(shadow(el).querySelector('script')).toBeNull();
    // Visible — escaping is the correct rendering; deleting the text would pass
    // the assertion above while being a worse UI.
    expect(input.textContent).toContain(XSS);
  });

  test('an event-handler attribute in an ARGUMENT string creates no element and no handler', async () => {
    const el = await mount(part({ state: 'input-available', input: { html: IMG } }));
    expect(tags(shadow(el)).has('img'), 'no <img> may be created from an argument').toBe(false);
    expect(handlerAttrs(shadow(el)), 'no on* attribute may reach the DOM').toEqual([]);
    expect(section(el, 'Input')!.textContent).toContain(IMG);
  });

  test('a hostile ARGUMENT KEY is escaped too — the key is model-controlled as well', async () => {
    const el = await mount(part({ state: 'input-available', input: { [IMG]: 'value' } }));
    expect(tags(shadow(el)).has('img')).toBe(false);
    expect(handlerAttrs(shadow(el))).toEqual([]);
    expect(section(el, 'Input')!.textContent).toContain(IMG);
  });

  test('a hostile TOOL NAME renders in the header as text', async () => {
    // `type` is whatever the provider frame said the tool was called; nothing
    // between the wire and this header constrains it to an identifier.
    const el = await mount(part({ type: IMG, state: 'input-available', input: { q: 'x' } }));
    expect(tags(shadow(el)).has('img')).toBe(false);
    expect(handlerAttrs(shadow(el))).toEqual([]);
    expect(trigger(el).textContent).toContain(IMG);
  });

  test('a hostile OUTPUT string is escaped inside the <pre>', async () => {
    const el = await mount(part({ state: 'output-available', output: { html: XSS, more: IMG } }));
    expect(tags(shadow(el)).has('script')).toBe(false);
    expect(tags(shadow(el)).has('img')).toBe(false);
    expect(handlerAttrs(shadow(el))).toEqual([]);
    const output = section(el, 'Output')!;
    // JSON.stringify escapes the quotes, so match on the distinctive substrings.
    expect(output.textContent).toContain('<script>alert(1)</script>');
    expect(output.textContent).toContain('onerror=');
  });

  test('a hostile errorText is escaped inside the Error region', async () => {
    const el = await mount(part({ state: 'output-error', errorText: `failed: ${IMG}` }));
    expect(tags(shadow(el)).has('img')).toBe(false);
    expect(handlerAttrs(shadow(el))).toEqual([]);
    expect(section(el, 'Error')!.textContent).toContain(IMG);
  });

  test('THE CONTROL: the same harness DOES create an element when the kit means to', async () => {
    // Without this, every assertion above would pass against a panel that renders
    // nothing at all. The state icon is an <svg> the kit itself builds, so its
    // presence proves the tag census is looking at a real render.
    const el = await mount(part({ state: 'output-available', output: { html: XSS } }));
    expect(tags(shadow(el)).has('svg')).toBe(true);
    expect(tags(shadow(el)).has('pre')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Disclosure — the surface wireDisclosure installs
// ---------------------------------------------------------------------------

describe('collapse / expand', () => {
  const p = part({ state: 'output-available', input: { q: 'x' }, output: { ok: true } });

  test('starts collapsed and the trigger toggles both ways', async () => {
    const el = await mount(p);
    expect(expanded(el)).toBe(false);

    trigger(el).click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();
    expect(expanded(el)).toBe(true);
    expect(body(el).hasAttribute('inert')).toBe(false);

    trigger(el).click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();
    expect(expanded(el)).toBe(false);
    expect(body(el).hasAttribute('inert')).toBe(true);
  });

  test('show() / hide() / toggle() — the kit disclosure vocabulary, not open()/close()', async () => {
    const el = await mount(p);
    expect(typeof el.show).toBe('function');
    expect(typeof el.hide).toBe('function');
    expect(typeof el.toggle).toBe('function');
    expect((el as Record<string, unknown>).close).toBeUndefined();

    el.show();
    await flush();
    expect(expanded(el)).toBe(true);

    el.toggle();
    await flush();
    expect(expanded(el)).toBe(false);

    el.toggle();
    await flush();
    expect(expanded(el)).toBe(true);

    el.hide();
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('the `open` PROPERTY and the `open` ATTRIBUTE each drive it both ways', async () => {
    const el = await mount(p);
    el.open = true;
    await flush();
    expect(expanded(el)).toBe(true);
    el.open = false;
    await flush();
    expect(expanded(el)).toBe(false);

    el.setAttribute('open', '');
    await flush();
    expect(expanded(el)).toBe(true);
    el.removeAttribute('open');
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('the collapsed body stays MOUNTED — collapsing is not unmounting', async () => {
    // It matters here specifically: the panel is an inspector, and a body that
    // unmounted would lose scroll position and re-run the JSON formatting on every
    // open. `data-state` is the styling handle that requires it to stay.
    const el = await mount(p);
    const before = body(el);
    el.show();
    await flush();
    el.hide();
    await flush();
    expect(body(el)).toBe(before);
    expect(before.isConnected).toBe(true);
    expect(section(el, 'Output')!.textContent).toContain('"ok": true');
  });

  test('the trigger is a real <button type="button"> wired to the body it controls', async () => {
    const el = await mount(p);
    expect(trigger(el).tagName).toBe('BUTTON');
    expect(trigger(el).getAttribute('type')).toBe('button');
    expect(trigger(el).getAttribute('aria-controls')).toBe(body(el).id);
    expect(body(el).id).toBeTruthy();
  });
});

describe('declarative HTML — the 13-facade bug class', () => {
  // The defect wireDisclosure's ordering comment describes: the outward reflection
  // deleted the author's attribute before the inward one had read it, so the plain
  // HTML spelling never opened and only `default-open` did.
  test('<kai-tool open> is open when the tool is seeded before connect', async () => {
    const el = document.createElement('kai-tool') as Tool;
    el.setAttribute('open', '');
    el.tool = part({ state: 'output-available', output: { ok: true } });
    document.body.appendChild(el);
    await flush();
    expect(expanded(el)).toBe(true);
  });

  // FIXED — was a real defect, and it was the 13-facade bug class resurfacing in a
  // facade that gates its own subtree.
  //
  // kai-tool renders `<Show when={props.tool}>`, so with no `tool` yet there is no
  // Collapsible, no controller, and `wireDisclosure`'s `api` was still undefined when
  // its effects first ran. The getter it was handed closed over a bare `let`, NOT a
  // signal — so when the controller finally arrived, nothing re-ran. A bare `open`
  // attribute never changes `props.open`, so the inward effect had no second chance
  // either.
  //
  // It mattered because `tool` is an OBJECT prop and therefore cannot be written in
  // markup: markup-then-assign is the only sequence a consumer of the HTML spelling
  // has. Every ordering below was measured RED before the fix except the first, and
  // the `open="true"` row was the loudest — `el.open` read back `true` while the panel
  // was collapsed, so the element's own answer to "am I open" disagreed with what it
  // drew. (Setting `el.open` AFTER `tool` always worked, because that path re-runs the
  // effect, which is why nothing else in this file ever noticed.)
  //
  // The fix is one line of reactivity in the facade: the controller is a signal now,
  // exactly as `Tool` already does internally, so wireDisclosure's effects re-run when
  // it lands. Each ordering is a row rather than a sentence, because the bug lived in
  // the ORDERING and a single case would have kept most of it.
  test.each([
    ['connect, then the `open` attribute, then `tool`', async (el: Tool) => {
      document.body.appendChild(el);
      await flush();
      el.setAttribute('open', '');
      el.tool = part({ state: 'output-available', output: { ok: true } });
    }],
    ['`el.open = true`, then `el.tool = …`', async (el: Tool) => {
      document.body.appendChild(el);
      await flush();
      el.open = true;
      el.tool = part({ state: 'output-available', output: { ok: true } });
    }],
  ])('<kai-tool> honours `open` when set BEFORE the tool — %s', async (_name, drive) => {
    const el = document.createElement('kai-tool') as Tool;
    await drive(el);
    await flush();
    expect(expanded(el)).toBe(true);
    expect(el.open, 'the property and the rendering must agree').toBe(true);
  });

  test.each(['<kai-tool open></kai-tool>', '<kai-tool open="true"></kai-tool>'])(
    '%s in markup is open once `tool` is assigned',
    async (markup) => {
      document.body.innerHTML = markup;
      const el = document.querySelector('kai-tool') as Tool;
      el.tool = part({ state: 'output-available', output: { ok: true } });
      await flush();
      expect(expanded(el)).toBe(true);
      expect(el.open, 'the property and the rendering must agree').toBe(true);
    },
  );

  test('a tool that arrives LATE still lands closed when nothing asked for open', async () => {
    // The pair for the four rows above. Without it, "the panel is open" could be
    // passing because a late-arriving controller now opens unconditionally.
    document.body.innerHTML = '<kai-tool></kai-tool>';
    const el = document.querySelector('kai-tool') as Tool;
    el.tool = part({ state: 'output-available', output: { ok: true } });
    await flush();
    expect(expanded(el)).toBe(false);
    expect(el.hasAttribute('open')).toBe(false);
  });

  test('<kai-tool default-open> is open', async () => {
    document.body.innerHTML = '<kai-tool default-open></kai-tool>';
    const el = document.querySelector('kai-tool') as Tool;
    el.tool = part({ state: 'output-available', output: { ok: true } });
    await flush();
    expect(expanded(el)).toBe(true);
  });

  test('<kai-tool open="false"> is closed, and so is a bare <kai-tool>', async () => {
    document.body.innerHTML = '<kai-tool open="false"></kai-tool><kai-tool></kai-tool>';
    const [a, b] = [...document.querySelectorAll('kai-tool')] as Tool[];
    a.tool = part({ state: 'output-available' });
    b.tool = part({ state: 'output-available' });
    await flush();
    expect(expanded(a)).toBe(false);
    expect(expanded(b)).toBe(false);
  });

  test('a `tool` property set BEFORE upgrade survives it', async () => {
    // component-register harvests the pre-upgrade own value in connectedCallback.
    // This is the ONE prop kai-tool has that is not a scalar, so it is the one the
    // harvest has to get right.
    const el = document.createElement('kai-tool') as Tool;
    el.tool = part({ state: 'output-available', input: { q: 'seeded before upgrade' } });
    document.body.appendChild(el);
    await flush();
    expect(trigger(el).textContent).toContain('search_web');
    expect(section(el, 'Input')!.textContent).toContain('seeded before upgrade');
  });
});

describe('reflected boolean read-back', () => {
  // findings G-05, the write-only-property class: a reflected flag used to leave
  // `el.open === undefined` while `[open]` sat on the host.
  test('`open` reads back what was set, and reflects to the attribute', async () => {
    const el = await mount(part({ state: 'output-available' }));
    el.open = true;
    await flush();
    expect(el.hasAttribute('open')).toBe(true);
    expect(el.open).toBe(true);

    el.open = false;
    await flush();
    expect(el.hasAttribute('open')).toBe(false);
    expect(el.open).toBe(false);
  });

  test('a bare `open` attribute reads back as true, not undefined', async () => {
    const el = document.createElement('kai-tool') as Tool;
    el.setAttribute('open', '');
    el.tool = part({ state: 'output-available' });
    document.body.appendChild(el);
    await flush();
    expect(el.open).toBe(true);
  });

  test('a trigger click reflects OUT to the attribute and the property', async () => {
    const el = await mount(part({ state: 'output-available' }));
    trigger(el).click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();
    expect(el.hasAttribute('open')).toBe(true);
    expect(el.open).toBe(true);
  });

  test('a bare `disabled` attribute reads back as true, not undefined', async () => {
    const el = document.createElement('kai-tool') as Tool;
    el.setAttribute('disabled', '');
    el.tool = part({ state: 'output-available' });
    document.body.appendChild(el);
    await flush();
    expect(el.disabled).toBe(true);
  });

  test('`defaultOpen` is a FLAG prop, NOT a reflected one — stated, not assumed', async () => {
    // kai-tool reflects `open` and `disabled`; `defaultOpen` is deliberately neither.
    // It is a one-shot seed read at render time through `flag()`, so there is nothing
    // for a reflection to keep in sync and a read-back contract would be inventing
    // one. What IS asserted is the behaviour the seed exists for.
    //
    // (kai-dock DOES reflect `defaultOpen`. That divergence is real and it is not
    // swept here — `reflected-boolean-coverage.test.ts` owns the class.)
    const el = document.createElement('kai-tool') as Tool;
    el.setAttribute('default-open', '');
    el.setAttribute('disabled', '');
    el.tool = part({ state: 'output-available' });
    document.body.appendChild(el);
    await flush();
    expect(el.hasAttribute('open'), 'default-open drives the OPEN state').toBe(true);
    expect(expanded(el)).toBe(true);
    expect(trigger(el).disabled, 'and disabled still gates the trigger alongside it').toBe(true);
  });
});

describe('`disabled` gates the trigger, not the methods', () => {
  test('<kai-tool disabled> in markup: a real disabled button that does not toggle', async () => {
    document.body.innerHTML = '<kai-tool disabled></kai-tool>';
    const el = document.querySelector('kai-tool') as Tool;
    el.tool = part({ state: 'output-available' });
    await flush();
    expect(trigger(el).disabled).toBe(true);

    trigger(el).click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();
    expect(expanded(el)).toBe(false);

    el.show();
    await flush();
    expect(expanded(el), 'show() is gated by disabled, like every other kai disclosure').toBe(false);
  });

  test('`el.disabled = true` at runtime gates the trigger, and clearing it restores', async () => {
    const el = await mount(part({ state: 'output-available' }));
    el.disabled = true;
    await flush();
    expect(trigger(el).disabled).toBe(true);
    trigger(el).click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();
    expect(expanded(el)).toBe(false);

    // Paired: the same harness opens once disabled is gone, so "did not open"
    // cannot be passing because nothing can ever open.
    el.disabled = false;
    await flush();
    expect(trigger(el).disabled).toBe(false);
    trigger(el).click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();
    expect(expanded(el)).toBe(true);
  });

  test('setAttribute("disabled") at RUNTIME gates the trigger, and removing it restores', async () => {
    // FIXED — was a real, if narrow, defect. `flag('disabled')` reads `props.disabled`
    // (reactive) and falls back to `element.hasAttribute('disabled')` (NOT reactive).
    // A bare attribute added after mount is parsed by component-register to
    // `undefined`, so the prop never changed and nothing re-rendered; a later unrelated
    // re-render did not pick it up either, because the memo over `props.disabled` had
    // no reason to recompute.
    //
    // kai-dock never had the problem, and the difference was one line: it calls
    // `reflectFlag('disabled')`, whose coercing setter resolves the `undefined`
    // write-back back through `resolveFlag` to `true`. kai-tool now does the same. The
    // same consumer gesture used to work on one kai disclosure and silently do nothing
    // on another, while `flag()`'s own doc comment advertises `<el disabled>` as a
    // supported spelling without saying it was parse-time only.
    const el = await mount(part({ state: 'output-available' }));
    el.setAttribute('disabled', '');
    await flush();
    expect(trigger(el).disabled).toBe(true);
    expect(el.disabled, 'the reflected prop reads back what the attribute says').toBe(true);

    // Paired: removal is the direction that used to "work" by doing nothing, so it
    // proves the new wiring is live in both directions rather than stuck ON.
    el.removeAttribute('disabled');
    await flush();
    expect(trigger(el).disabled).toBe(false);
    expect(el.disabled).toBe(false);
  });

  test('`disabled` reflects OUT too — the property writes the attribute', async () => {
    const el = await mount(part({ state: 'output-available' }));
    el.disabled = true;
    await flush();
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.disabled).toBe(true);

    el.disabled = false;
    await flush();
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.disabled).toBe(false);
  });

  test('hide() still works while disabled — closing is never gated', async () => {
    const el = await mount(part({ state: 'output-available' }));
    el.show();
    await flush();
    expect(expanded(el)).toBe(true);

    el.disabled = true;
    await flush();
    el.hide();
    await flush();
    expect(expanded(el)).toBe(false);
  });
});

describe('kai-open-change', () => {
  test('fires once per real change with { open }', async () => {
    const el = await mount(part({ state: 'output-available' }));
    const seen: unknown[] = [];
    el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));

    el.show();
    await flush();
    el.hide();
    await flush();

    expect(seen).toEqual([{ open: true }, { open: false }]);
  });

  test('does NOT fire on mount — neither closed, nor `default-open`, nor `open`', async () => {
    for (const markup of ['<kai-tool></kai-tool>', '<kai-tool default-open></kai-tool>', '<kai-tool open></kai-tool>']) {
      document.body.innerHTML = markup;
      const el = document.querySelector('kai-tool') as Tool;
      const seen: unknown[] = [];
      el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));
      el.tool = part({ state: 'output-available' });
      await flush();
      expect(seen, `${markup} must not announce a change at mount`).toEqual([]);
    }

    // …and the ordering that ACTUALLY opens must be silent too. Without this row the
    // three above could all be passing because the open state never moved at all
    // (see the KNOWN DEFECT above), which would make "no event" vacuously true.
    const seeded = document.createElement('kai-tool') as Tool;
    seeded.setAttribute('open', '');
    seeded.tool = part({ state: 'output-available' });
    const heard: unknown[] = [];
    seeded.addEventListener('kai-open-change', (e) => heard.push((e as CustomEvent).detail));
    document.body.appendChild(seeded);
    await flush();
    expect(expanded(seeded), 'this row must really be open, or it proves nothing').toBe(true);
    expect(heard, 'an element that mounts already open must not announce a change').toEqual([]);
  });

  test('setting `open` to the value it already holds fires nothing', async () => {
    const el = await mount(part({ state: 'output-available' }));
    el.show();
    await flush();

    const seen: unknown[] = [];
    el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));
    el.open = true;
    await flush();
    expect(seen).toEqual([]);

    // Paired: a real change over the same listener still fires.
    el.open = false;
    await flush();
    expect(seen).toEqual([{ open: false }]);
  });

  test('a new `tool` object does NOT fire an open change', async () => {
    // Streaming replaces this object on every chunk. If the disclosure wiring
    // reacted to that, a consumer's kai-open-change handler would run per token.
    const el = await mount(part({ state: 'input-streaming' }));
    const seen: unknown[] = [];
    el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));

    for (const state of ['input-available', 'output-available'] as const) {
      el.tool = part({ state, input: { q: 'x' }, output: { ok: true } });
      await flush();
    }
    expect(seen).toEqual([]);

    // Paired: the same listener still hears a real toggle.
    el.show();
    await flush();
    expect(seen).toEqual([{ open: true }]);
  });

  test('is non-bubbling and non-composed, like every other kai-* event', async () => {
    const el = await mount(part({ state: 'output-available' }));
    let event: Event | undefined;
    el.addEventListener('kai-open-change', (e) => { event = e; });
    el.show();
    await flush();

    expect(event).toBeInstanceOf(CustomEvent);
    expect(event!.bubbles).toBe(false);
    expect(event!.composed).toBe(false);
  });
});
