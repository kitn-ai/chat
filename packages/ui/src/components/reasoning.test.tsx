import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { Reasoning, ReasoningTrigger, ReasoningContent } from './reasoning';

// jsdom has no ResizeObserver; ReasoningContent wires one when it mounts (same
// stub as message.test.tsx / thread.test.tsx).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(cleanup);

const trigger = (c: HTMLElement) => c.querySelector('button') as HTMLButtonElement;
/** The panel the trigger says it controls — resolved THROUGH aria-controls, so a
 *  broken/absent wire cannot be papered over by grabbing the node some other way. */
const panel = (c: HTMLElement) => {
  const id = trigger(c).getAttribute('aria-controls');
  return id ? (c.querySelector(`[id="${CSS.escape(id)}"]`) as HTMLElement | null) : null;
};

function renderReasoning(props: { open?: boolean; disabled?: boolean; isStreaming?: boolean } = {}) {
  return render(() => (
    <Reasoning open={props.open} disabled={props.disabled} isStreaming={props.isStreaming}>
      <ReasoningTrigger>Thinking</ReasoningTrigger>
      <ReasoningContent>Weighing the options.</ReasoningContent>
    </Reasoning>
  ));
}

// Content/chrome, not a control: the label used to carry `text-primary`, the
// BRAND token, so a consumer's branded --kai-color-primary bled onto the
// "Thinking" label. Cheap jsdom pin on the class list only — jsdom can't
// resolve the real Tailwind cascade (see message.test.tsx's equivalent note),
// so it can't prove the class doesn't compute to the branded color; that lives
// in tests/e2e/content-brand-bleed.spec.ts.
describe('ReasoningTrigger label text token', () => {
  it('never emits text-primary on the label; uses text-foreground', () => {
    const { container } = renderReasoning();
    const label = trigger(container).querySelector('span');
    expect(label).toBeTruthy();
    const classes = (label!.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).not.toContain('text-primary');
    expect(classes).toContain('text-foreground');
  });
});

// Kit-decides-HOW (owner request): while streaming, the label renders with the
// kit's own TextShimmer (the common "Thinking…" shimmer) instead of static
// text; once settled it's the plain neutral span from the test above. Every
// consumer gets this for free.
describe('ReasoningTrigger label streaming shimmer', () => {
  it('wraps the label in TextShimmer while isStreaming is true', () => {
    const { container } = renderReasoning({ isStreaming: true });
    const label = trigger(container).querySelector('span');
    expect(label).toBeTruthy();
    const classes = (label!.getAttribute('class') ?? '').split(/\s+/);
    // TextShimmer's own signature classes (text-shimmer.tsx): transparent text
    // clipped to a shimmering background-image, animated via the `shimmer` keyframe.
    expect(classes).toContain('text-transparent');
    expect(classes.some((c) => c.startsWith('animate-[kai-shimmer'))).toBe(true);
    expect(classes).not.toContain('text-primary');
  });

  it('renders plain static neutral text once settled (isStreaming false/undefined)', () => {
    const { container } = renderReasoning({ isStreaming: false });
    const label = trigger(container).querySelector('span');
    expect(label).toBeTruthy();
    const classes = (label!.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('text-foreground');
    expect(classes).not.toContain('text-transparent');
    expect(classes.some((c) => c.startsWith('animate-[kai-shimmer'))).toBe(false);
  });
});

describe('Reasoning disclosure aria wiring', () => {
  it('renders an explicit type="button" trigger', () => {
    const { container } = renderReasoning();
    expect(trigger(container)).toHaveAttribute('type', 'button');
  });

  it('points aria-controls at the content panel it actually toggles', () => {
    const { container } = renderReasoning();
    const id = trigger(container).getAttribute('aria-controls');
    expect(id).toBeTruthy();

    const target = panel(container);
    expect(target).not.toBeNull();
    // …and it is the CONTENT, not some other node that happens to carry the id.
    expect(target!.textContent).toContain('Weighing the options.');
  });

  it('reports the collapsed state through aria-expanded and the data-* handles', () => {
    const { container } = renderReasoning();
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(trigger(container)).toHaveAttribute('data-state', 'closed');
    expect(trigger(container)).toHaveAttribute('data-closed', '');
    expect(trigger(container)).not.toHaveAttribute('data-expanded');
    expect(panel(container)).toHaveAttribute('data-state', 'closed');
  });

  it('flips every state handle when the trigger is clicked open', () => {
    const { container } = renderReasoning();
    fireEvent.click(trigger(container));

    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(trigger(container)).toHaveAttribute('data-state', 'open');
    expect(trigger(container)).toHaveAttribute('data-expanded', '');
    expect(trigger(container)).not.toHaveAttribute('data-closed');
    expect(panel(container)).toHaveAttribute('data-state', 'open');
  });

  it('flips back on a second click', () => {
    const { container } = renderReasoning();
    fireEvent.click(trigger(container));
    fireEvent.click(trigger(container));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(panel(container)).toHaveAttribute('data-state', 'closed');
  });

  it('tracks a CONTROLLED open prop without a click', () => {
    const [open, setOpen] = createSignal(false);
    const { container } = render(() => (
      <Reasoning open={open()}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');

    setOpen(true);
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(panel(container)).toHaveAttribute('data-state', 'open');
  });

  it('gives two sibling disclosures DISTINCT content ids', () => {
    // A message renders several reasoning blocks; a shared id would make
    // aria-controls point at the wrong panel for every one after the first.
    const { container } = render(() => (
      <div>
        <Reasoning>
          <ReasoningTrigger>First</ReasoningTrigger>
          <ReasoningContent>One.</ReasoningContent>
        </Reasoning>
        <Reasoning>
          <ReasoningTrigger>Second</ReasoningTrigger>
          <ReasoningContent>Two.</ReasoningContent>
        </Reasoning>
      </div>
    ));
    const ids = [...container.querySelectorAll('button')].map((b) => b.getAttribute('aria-controls'));
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('still lets a consumer override a generated attribute (rest spreads LAST)', () => {
    const { container } = render(() => (
      <Reasoning>
        <ReasoningTrigger aria-label="Show the chain of thought" data-state="custom">
          Thinking
        </ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(trigger(container)).toHaveAttribute('aria-label', 'Show the chain of thought');
    expect(trigger(container)).toHaveAttribute('data-state', 'custom');
    // …while the attributes the consumer did NOT override are still generated.
    // Without this the assertions above would pass just as happily with the
    // whole aria wiring deleted.
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(trigger(container)).toHaveAttribute('aria-controls');
  });

  it('keeps the disabled trigger from changing aria-expanded', () => {
    const { container } = renderReasoning({ disabled: true });
    expect(trigger(container)).toBeDisabled();
    fireEvent.click(trigger(container));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
  });
});

/** A Reasoning whose panel holds a focusable child, plus a sibling control
 *  OUTSIDE the disclosure — so a test can tell "focus was handed back to the
 *  trigger" from "focus never moved" and from "focus was stolen". */
function renderFocusable() {
  const [open, setOpen] = createSignal(true);
  const result = render(() => (
    <div>
      <Reasoning open={open()}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>
          <button type="button" data-testid="inside">Copy</button>
        </ReasoningContent>
      </Reasoning>
      <button type="button" data-testid="outside">After</button>
    </div>
  ));
  return { ...result, setOpen };
}

// Task 19f (owner ruling 2026-08-26): the streaming auto-open/auto-close
// effect is now gated behind `openOnStream`, default false — the panel starts
// per `defaultOpen` and streaming only changes the trigger's label (shimmer),
// never the open state. `openOnStream=true` reproduces the pre-19f `full`
// behavior losslessly.
describe('openOnStream gates the streaming auto-open effect (Task 19f)', () => {
  it('default (openOnStream absent): isStreaming=true does NOT auto-open', () => {
    const { container } = render(() => (
      <Reasoning isStreaming={true}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
  });

  it('openOnStream=true, defaultOpen unset: isStreaming=true auto-opens (pre-19f behavior reproduced)', () => {
    const [streaming, setStreaming] = createSignal(false);
    const { container } = render(() => (
      <Reasoning isStreaming={streaming()} openOnStream={true}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    setStreaming(true);
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
  });

  it('openOnStream=true: auto-closes when streaming ends (unchanged from before)', () => {
    const [streaming, setStreaming] = createSignal(true);
    const { container } = render(() => (
      <Reasoning isStreaming={streaming()} openOnStream={true}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    setStreaming(false);
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
  });

  it('defaultOpen=true, openOnStream absent: starts open, streaming never closes it', () => {
    const [streaming, setStreaming] = createSignal(true);
    const { container } = render(() => (
      <Reasoning isStreaming={streaming()} defaultOpen={true}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    setStreaming(false);
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Reasoning collapsed content leaves the tab order', () => {
  // NOTE ON WHAT THESE PROVE: jsdom parses `inert` as an attribute but does NOT
  // enforce it — nothing inside an inert subtree actually becomes unfocusable
  // there. So these assert the ATTRIBUTE (the instruction to the engine) and the
  // focus hand-off we drive ourselves. The engine honouring it — focus() refused
  // inside a collapsed panel, Tab skipping it — is proved in a real browser by
  // the `KeyboardReachability` story's play function.
  it('marks the collapsed panel inert, so it is neither focusable nor announced', () => {
    const { container } = renderReasoning();
    expect(panel(container)).toHaveAttribute('inert');
  });

  it('drops inert when the panel opens', () => {
    const { container } = renderReasoning();
    fireEvent.click(trigger(container));
    expect(panel(container)).not.toHaveAttribute('inert');
  });

  it('re-applies inert when the panel collapses again', () => {
    const { container } = renderReasoning();
    fireEvent.click(trigger(container));
    fireEvent.click(trigger(container));
    expect(panel(container)).toHaveAttribute('inert');
  });

  it('follows a CONTROLLED open prop, not just the trigger', () => {
    const [open, setOpen] = createSignal(false);
    const { container } = render(() => (
      <Reasoning open={open()}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(panel(container)).toHaveAttribute('inert');
    setOpen(true);
    expect(panel(container)).not.toHaveAttribute('inert');
  });

  it('hands focus back to the trigger when a panel holding focus collapses', () => {
    // Without this, `inert` drops the focused node and the browser resets focus
    // to <body> — the user's tab position silently jumps to the top of the page.
    const { container, getByTestId, setOpen } = renderFocusable();
    const inside = getByTestId('inside');
    inside.focus();
    expect(document.activeElement).toBe(inside);

    setOpen(false);
    expect(document.activeElement).toBe(trigger(container));
  });

  it('does NOT steal focus when the collapsing panel never held it', () => {
    const { getByTestId, setOpen } = renderFocusable();
    const outside = getByTestId('outside');
    outside.focus();

    setOpen(false);
    expect(document.activeElement).toBe(outside);
  });

  it('leaves focus alone when an already-collapsed panel re-renders', () => {
    const { getByTestId, setOpen } = renderFocusable();
    setOpen(false);
    const outside = getByTestId('outside');
    outside.focus();
    setOpen(true);
    setOpen(false);
    expect(document.activeElement).toBe(outside);
  });

  it('still hands a consumer ref the trigger button', () => {
    // The trigger now takes its own ref to register itself as the focus target;
    // a consumer's ref must survive that.
    let seen: HTMLButtonElement | undefined;
    const { container } = render(() => (
      <Reasoning>
        <ReasoningTrigger ref={(el) => { seen = el; }}>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(seen).toBe(trigger(container));
  });

  it('still animates max-height 0 → measured → 0 across a toggle', () => {
    // The regression this change was deferred over: `inert` must not disturb the
    // max-height transition the panel drives from its own effect.
    const { container } = renderReasoning();
    const p = panel(container)!;
    const inner = p.firstElementChild as HTMLElement;
    // jsdom has no layout — scrollHeight is always 0, which would make the
    // "measured" step vacuously equal to the collapsed one.
    Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: 120 });

    expect(p.style.maxHeight).toBe('0px');
    fireEvent.click(trigger(container));
    expect(p.style.maxHeight).toBe('120px');
    fireEvent.click(trigger(container));
    expect(p.style.maxHeight).toBe('0px');
  });
});
