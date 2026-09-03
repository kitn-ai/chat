import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { GalleryPage, formsAvailable, installCommandFor, languageFor, zipHrefFor, type GalleryBlock } from './GalleryPage';

afterEach(cleanup);

const block = (name: string, title: string, categories: string[], extra: Partial<GalleryBlock> = {}): GalleryBlock => ({
  name,
  title,
  description: `${title} description`,
  categories,
  forms: {
    html: [
      { path: `${name}.html`, content: `<p>${name} page</p>` },
      { path: `${name}.js`, content: `console.log('${name}');` },
    ],
    react: [
      { path: 'SupportWidget.tsx', content: `export default function SupportWidget() {}` },
      { path: `${name}.js`, content: `export async function initBlock() {}` },
    ],
    cdn: [{ path: `${name}.html`, content: `<!doctype html><p>${name} cdn</p>` }],
  },
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
    // ...with the caption saying add picks the framework itself.
    expect(screen.getByText(/add auto-detects your framework/)).toBeInTheDocument();
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

  it('the framework selector (derived from the shared form axis) re-renders the tree for the selected form, defaulting to html', () => {
    const { container } = render(() => <GalleryPage blocks={BLOCKS} defaultTab="code" />);
    const group = screen.getByRole('group', { name: 'Framework' });
    // The authored truth is the default tab.
    expect(screen.getByRole('button', { name: 'HTML' })).toHaveAttribute('aria-pressed', 'true');
    expect(group).toHaveTextContent('React');
    expect(group).toHaveTextContent('CDN single file');
    fireEvent.click(screen.getByRole('button', { name: 'React' }));
    // The react form's tree and contents replace the html ones.
    expect(screen.getByRole('treeitem', { name: /SupportWidget\.tsx/ })).toBeInTheDocument();
    expect(screen.queryByRole('treeitem', { name: /support-widget\.html/ })).not.toBeInTheDocument();
    expect(container.textContent).toContain('export default function SupportWidget()');
  });

  it('a form the block does not carry is not offered (menu honesty)', () => {
    const htmlOnly = { ...block('assistant', 'Assistant', ['assistant']), forms: { html: [{ path: 'assistant.html', content: '<p>a</p>' }] } };
    expect(formsAvailable(htmlOnly).map((f) => f.id)).toEqual(['html']);
    render(() => <GalleryPage blocks={[htmlOnly]} defaultTab="code" />);
    expect(screen.queryByRole('button', { name: 'React' })).not.toBeInTheDocument();
  });

  it('the code header carries the per-file Copy (icon, accessible label) and the Download zip for the selected form', () => {
    render(() => <GalleryPage blocks={BLOCKS} defaultTab="code" />);
    expect(screen.getByRole('button', { name: 'Copy file' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download the HTML files as a zip/ })).toBeInTheDocument();
    // One derivation for the zip URL, shared with the server's route shape.
    expect(zipHrefFor('support-widget', 'react')).toBe('/gallery/api/zip/support-widget/react');
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
    expect(languageFor('SupportWidget.tsx')).toBe('tsx');
    expect(languageFor('x.json')).toBe('json');
    expect(languageFor('README')).toBe('text');
  });
});
