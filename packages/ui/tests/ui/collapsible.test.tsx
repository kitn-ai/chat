import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../src/ui/collapsible';

describe('Collapsible', () => {
  it('trigger has aria-expanded reflecting controlled open + toggles via onOpenChange', () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <Collapsible open={open()} onOpenChange={setOpen}>
        <CollapsibleTrigger data-testid="trg">Toggle</CollapsibleTrigger>
        <CollapsibleContent><p>Body</p></CollapsibleContent>
      </Collapsible>
    ));
    const trg = screen.getByTestId('trg');
    expect(trg.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trg);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(open()).toBe(true);
    expect(trg.getAttribute('aria-expanded')).toBe('true');
  });

  it('content links to trigger via aria-controls', () => {
    const [open] = createSignal(true);
    render(() => (
      <Collapsible open={open()} onOpenChange={() => {}}>
        <CollapsibleTrigger data-testid="trg">Toggle</CollapsibleTrigger>
        <CollapsibleContent data-testid="body">Body</CollapsibleContent>
      </Collapsible>
    ));
    const id = screen.getByTestId('trg').getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(screen.getByTestId('body').id).toBe(id);
  });

  it('uncontrolled defaultOpen toggles internally', () => {
    render(() => (
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger data-testid="trg">Toggle</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    const trg = screen.getByTestId('trg');
    expect(trg.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trg);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(trg.getAttribute('aria-expanded')).toBe('true');
  });

  it('trigger exposes data-state reflecting open', () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <Collapsible open={open()} onOpenChange={setOpen}>
        <CollapsibleTrigger data-testid="trg">Toggle</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    const trg = screen.getByTestId('trg');
    expect(trg.getAttribute('data-state')).toBe('closed');
    fireEvent.click(trg);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(trg.getAttribute('data-state')).toBe('open');
  });

  it('as render-prop receives aria attrs and toggles', () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <Collapsible open={open()} onOpenChange={setOpen}>
        <CollapsibleTrigger as={(p: any) => <a href="#" {...p} data-testid="trg">Toggle</a>} />
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    const trg = screen.getByTestId('trg');
    expect(trg.getAttribute('aria-expanded')).toBe('false');
    expect(trg.getAttribute('aria-controls')).toBeTruthy();
    fireEvent.click(trg);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(open()).toBe(true);
  });

  it('content is inert when closed and not when open', () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <Collapsible open={open()} onOpenChange={setOpen}>
        <CollapsibleTrigger data-testid="trg">Toggle</CollapsibleTrigger>
        <CollapsibleContent data-testid="body">Body</CollapsibleContent>
      </Collapsible>
    ));
    expect(screen.getByTestId('body').hasAttribute('inert')).toBe(true);
    fireEvent.click(screen.getByTestId('trg'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(screen.getByTestId('body').hasAttribute('inert')).toBe(false);
  });

  it('consumer id does not override the content id used by aria-controls', () => {
    const [open] = createSignal(true);
    render(() => (
      <Collapsible open={open()} onOpenChange={() => {}}>
        <CollapsibleTrigger data-testid="trg">Toggle</CollapsibleTrigger>
        <CollapsibleContent id="consumer-id" data-testid="body">Body</CollapsibleContent>
      </Collapsible>
    ));
    const controls = screen.getByTestId('trg').getAttribute('aria-controls');
    expect(screen.getByTestId('body').id).toBe(controls);
  });

  it('uncontrolled mode fires onOpenChange', () => {
    let called: boolean | undefined;
    render(() => (
      <Collapsible defaultOpen={false} onOpenChange={(v) => { called = v; }}>
        <CollapsibleTrigger data-testid="trg">Toggle</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    fireEvent.click(screen.getByTestId('trg'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(called).toBe(true);
  });
});
