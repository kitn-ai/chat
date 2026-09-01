import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { GalleryPage, installCommandFor, languageFor, type GalleryBlock } from './GalleryPage';

afterEach(cleanup);

const block = (name: string, title: string, categories: string[], extra: Partial<GalleryBlock> = {}): GalleryBlock => ({
  name,
  title,
  description: `${title} description`,
  categories,
  files: [
    { path: `${name}.html`, content: `<p>${name} page</p>` },
    { path: `${name}.js`, content: `console.log('${name}');` },
  ],
  preview: <p>{title} stub preview</p>,
  ...extra,
});

const BLOCKS: GalleryBlock[] = [
  block('support-widget', 'Support widget', ['widget'], { cdnHtml: '<html></html>', docs: 'Runs against a mock.' }),
  block('assistant', 'Assistant', ['assistant']),
];

describe('GalleryPage', () => {
  it('leads with the primary affordances (owner ruling): the install one-liner and the file-tree code view', () => {
    render(() => <GalleryPage blocks={BLOCKS} defaultTab="code" />);
    expect(screen.getByText(installCommandFor('support-widget'))).toBeInTheDocument();
    // The Code tab shows the add-form file tree...
    expect(screen.getByRole('tree')).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /support-widget\.html/ })).toBeInTheDocument();
    // ...and the CDN form is a labeled SECONDARY row, never presented as the block.
    expect(screen.getByText(/Try it standalone/)).toBeInTheDocument();
  });

  it('selecting a file in the tree swaps the code view to that file', () => {
    const { container } = render(() => <GalleryPage blocks={BLOCKS} defaultTab="code" />);
    expect(container.textContent).toContain('<p>support-widget page</p>');
    fireEvent.click(screen.getByRole('treeitem', { name: /support-widget\.js/ }));
    expect(container.textContent).toContain("console.log('support-widget');");
  });

  it('category nav filters the block list; selecting a block shows its description', () => {
    render(() => <GalleryPage blocks={BLOCKS} />);
    fireEvent.click(screen.getByRole('button', { name: 'assistant' }));
    expect(screen.queryByRole('button', { name: 'Support widget' })).not.toBeInTheDocument();
    expect(screen.getByText('Assistant description')).toBeInTheDocument();
  });

  it('a block without a cdnHtml renders no standalone row (nothing dead, menu honesty)', () => {
    render(() => <GalleryPage blocks={[BLOCKS[1]]} />);
    expect(screen.queryByText(/Try it standalone/)).not.toBeInTheDocument();
  });

  it('languageFor maps block file extensions onto highlighter ids', () => {
    expect(languageFor('a.html')).toBe('html');
    expect(languageFor('a.css')).toBe('css');
    expect(languageFor('mock.js')).toBe('javascript');
    expect(languageFor('x.json')).toBe('json');
    expect(languageFor('README')).toBe('text');
  });
});
