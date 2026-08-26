import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import { Loader } from '../../src/components/loader';

describe('Loader', () => {
  it('renders bars variant', () => {
    const { container } = render(() => <Loader variant="bars" />);
    expect(container.querySelector('.sr-only')).toBeTruthy();
  });
  it('renders text-shimmer with custom text', () => {
    render(() => <Loader variant="text-shimmer" text="Thinking..." />);
    expect(screen.getByText('Thinking...')).toBeTruthy();
  });
  it('renders loading-dots variant', () => {
    const { container } = render(() => <Loader variant="loading-dots" />);
    expect(container.querySelector('.inline-flex')).toBeTruthy();
  });
  it('renders pulse-dot variant', () => {
    const { container } = render(() => <Loader variant="pulse-dot" />);
    expect(container.querySelector('.rounded-full')).toBeTruthy();
  });
});

// Content/chrome, not controls: the terminal caret and the loading-dots
// label+dots used to carry `text-primary`, the BRAND token. Cheap jsdom pin on
// the class list only — see tests/e2e/content-brand-bleed.spec.ts for the real
// computed-color proof (jsdom can't resolve the Tailwind cascade).
describe('Loader text tokens (no brand bleed onto status chrome)', () => {
  it('terminal variant: never emits text-primary on the caret', () => {
    const { container } = render(() => <Loader variant="terminal" />);
    const caret = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === '>');
    expect(caret).toBeTruthy();
    const classes = (caret!.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).not.toContain('text-primary');
    expect(classes).toContain('text-foreground');
  });

  it('loading-dots variant: never emits text-primary on the label or the dots', () => {
    const { container } = render(() => <Loader variant="loading-dots" />);
    const spans = Array.from(container.querySelectorAll('span'));
    const withPrimary = spans.filter((s) => (s.getAttribute('class') ?? '').split(/\s+/).includes('text-primary'));
    expect(withPrimary).toHaveLength(0);
    const label = spans.find((s) => (s.textContent ?? '').includes('Thinking'));
    expect(label).toBeTruthy();
    expect((label!.getAttribute('class') ?? '').split(/\s+/)).toContain('text-foreground');
  });
});
