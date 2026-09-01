/**
 * P-4 (blocks-and-parts design 2026-08-31) — the generic list row.
 *
 * Three interaction modes, decided by props and pinned here because each maps
 * to a different ROOT ELEMENT (real platform semantics, not re-implemented):
 * safe `href` = anchor, `onActivate` = button, neither = plain div. The
 * unsafe-href rule is the HomePanel precedent verbatim: a scheme the kit's
 * URL policy rejects renders the INERT row, label visible, and never gets
 * promoted into a button that still fires a handler.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { Row } from './row';

afterEach(cleanup);

describe('anatomy', () => {
  it('renders leading, title, subtitle, trailing and chevron regions with their part names', () => {
    const { container } = render(() => (
      <Row
        leading={<span>L</span>}
        subtitle={<span>Guides and FAQs</span>}
        trailing={<span>2m ago</span>}
        chevron
      >
        Help center
      </Row>
    ));
    const row = container.querySelector('[part="row"]')!;
    expect(row.querySelector('[part="leading"]')).toHaveTextContent('L');
    expect(row.querySelector('[part="title"]')).toHaveTextContent('Help center');
    expect(row.querySelector('[part="subtitle"]')).toHaveTextContent('Guides and FAQs');
    expect(row.querySelector('[part="trailing"]')).toHaveTextContent('2m ago');
    expect(row.querySelector('[part="chevron"]')).toBeTruthy();
    expect(row.querySelector('[part="chevron"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('empty regions render no wrapper at all', () => {
    const { container } = render(() => <Row>Just a title</Row>);
    expect(container.querySelector('[part="leading"]')).toBeNull();
    expect(container.querySelector('[part="subtitle"]')).toBeNull();
    expect(container.querySelector('[part="trailing"]')).toBeNull();
    expect(container.querySelector('[part="chevron"]')).toBeNull();
  });
});

describe('interaction modes', () => {
  it('non-interactive by default: a plain div, no button, no anchor', () => {
    const { container } = render(() => <Row>Version</Row>);
    const row = container.querySelector('[part="row"]')!;
    expect(row.tagName).toBe('DIV');
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('onActivate makes the row a real <button> and clicking fires it', () => {
    const onActivate = vi.fn();
    const { container } = render(() => <Row onActivate={onActivate}>Account</Row>);
    const row = container.querySelector('[part="row"]')!;
    expect(row.tagName).toBe('BUTTON');
    expect(row).toHaveAttribute('type', 'button');
    (row as HTMLButtonElement).click();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('a safe href makes the row a real hardened anchor', () => {
    const { container } = render(() => <Row href="https://ui.kitn.ai">Help center</Row>);
    const row = container.querySelector('[part="row"]')!;
    expect(row.tagName).toBe('A');
    expect(row).toHaveAttribute('href', 'https://ui.kitn.ai');
    expect(row).toHaveAttribute('target', '_blank');
    expect(row).toHaveAttribute('rel', 'noreferrer noopener');
  });
});

describe('unsafe-href rule (the HomePanel precedent)', () => {
  it('a javascript: href renders the inert row: label visible, no anchor, no button', () => {
    // eslint-disable-next-line no-script-url
    const { container } = render(() => <Row href="javascript:alert(1)">Help center</Row>);
    expect(container.textContent).toContain('Help center'); // escaping into visibility
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('an unsafe href is never downgraded into a button, even with onActivate also set', () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      // eslint-disable-next-line no-script-url
      <Row href="javascript:alert(1)" onActivate={onActivate}>
        Help center
      </Row>
    ));
    const row = container.querySelector('[part="row"]')!;
    expect(row.tagName).toBe('DIV');
    (row as HTMLElement).click();
    expect(onActivate).not.toHaveBeenCalled();
  });
});
