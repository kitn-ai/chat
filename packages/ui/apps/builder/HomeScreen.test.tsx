/**
 * The home screen's own contract (owner ask, 2026-08-31): every construct in
 * the directory is a card carrying name/template/last-modified, invalid files
 * are listed-but-inert (decide loudly: visible, never openable), and the New
 * construct tile is always there. The list/open/refresh wiring lives in
 * App.tsx and its test; this file is the surface alone.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { HomeScreen, relativeTime, type ConstructListing } from './HomeScreen';

afterEach(cleanup);

const listing = (over: Partial<ConstructListing> = {}): ConstructListing => ({
  file: 'acme-support.construct.json',
  name: 'acme-support',
  templateId: 'widget',
  templateName: 'Support widget',
  updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  valid: true,
  ...over,
});

describe('HomeScreen', () => {
  it('renders a card per construct — tag name, template label, last-modified — plus the New tile', () => {
    render(() => (
      <HomeScreen
        constructs={[
          listing(),
          listing({ file: 'acme-desk.construct.json', name: 'acme-desk', templateId: 'assistant', templateName: 'Assistant' }),
        ]}
        onOpen={() => {}}
        onNew={() => {}}
      />
    ));
    expect(screen.getByText('<acme-support>')).toBeInTheDocument();
    expect(screen.getByText('<acme-desk>')).toBeInTheDocument();
    expect(screen.getByText('Support widget')).toBeInTheDocument();
    expect(screen.getAllByText(/Edited 5 min ago/)).toHaveLength(2);
    expect(screen.getByText('New construct')).toBeInTheDocument();
  });

  it('clicking a card opens THAT construct file; the New tile routes to the picker', () => {
    const onOpen = vi.fn();
    const onNew = vi.fn();
    render(() => (
      <HomeScreen constructs={[listing(), listing({ file: 'acme-desk.construct.json', name: 'acme-desk' })]} onOpen={onOpen} onNew={onNew} />
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Open acme-desk' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('acme-desk.construct.json');
    fireEvent.click(screen.getByText('New construct'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('an INVALID construct is listed but inert: disabled card naming the file, no template label, no open', () => {
    const onOpen = vi.fn();
    render(() => (
      <HomeScreen constructs={[listing({ valid: false, name: 'broken', file: 'broken.construct.json', templateId: undefined, templateName: undefined })]} onOpen={onOpen} onNew={() => {}} />
    ));
    const card = screen.getByRole('button', { name: 'Open broken' });
    expect(card).toBeDisabled();
    expect(screen.getByText(/invalid construct file — fix broken\.construct\.json by hand/)).toBeInTheDocument();
    fireEvent.click(card);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('while one construct is opening, its card says so and every card is disabled (one open at a time)', () => {
    render(() => (
      <HomeScreen
        constructs={[listing(), listing({ file: 'acme-desk.construct.json', name: 'acme-desk' })]}
        opening="acme-support.construct.json"
        onOpen={() => {}}
        onNew={() => {}}
      />
    ));
    expect(screen.getByText('Opening…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open acme-desk' })).toBeDisabled();
    expect(screen.getByText('New construct').closest('button')).toBeDisabled();
  });

  it('relativeTime: the wording the cards render, across the scale', () => {
    const now = Date.parse('2026-08-31T12:00:00Z');
    const at = (msAgo: number) => new Date(now - msAgo).toISOString();
    expect(relativeTime(at(10_000), now)).toBe('just now');
    expect(relativeTime(at(5 * 60_000), now)).toBe('5 min ago');
    expect(relativeTime(at(3 * 3_600_000), now)).toBe('3 h ago');
    expect(relativeTime(at(2 * 86_400_000), now)).toBe('2 d ago');
    expect(relativeTime(at(90 * 86_400_000), now)).toMatch(/2026|6\/2|02\.06|06/); // locale date past a month
    expect(relativeTime('garbage', now)).toBe('');
  });
});
