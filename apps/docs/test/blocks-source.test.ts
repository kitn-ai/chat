import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FRAMEWORK_BLOCK_FORMS } from '@kitn.ai/blocks/forms';
import {
  frameworkOptions,
  addCommandFor,
  formUrl,
  previewUrl,
  readFramework,
  writeFramework,
  languageFor,
} from '../src/lib/blocks-source';

describe('the framework dropdown is the renderer list, never a typed one', () => {
  it('equals FRAMEWORK_BLOCK_FORMS, value and label, in order', () => {
    expect(frameworkOptions()).toEqual(
      FRAMEWORK_BLOCK_FORMS.map((f) => ({ value: f.id, label: f.label })),
    );
  });

  it('never offers cdn: it is the preview source and the no-project form, not a framework', () => {
    expect(frameworkOptions().some((o) => o.value === 'cdn')).toBe(false);
  });

  it('is not empty -- a dropdown with no rows would satisfy an equality test vacuously', () => {
    expect(frameworkOptions().length).toBeGreaterThan(0);
  });
});

describe('addCommandFor', () => {
  it('carries the block id it was given, and no framework', () => {
    expect(addCommandFor('support-widget')).toBe('npx create-kai add support-widget');
    expect(addCommandFor('assistant')).toBe('npx create-kai add assistant');
  });

  it('two different ids give two different commands', () => {
    expect(addCommandFor('assistant')).not.toBe(addCommandFor('support-widget'));
  });
});

describe('urls', () => {
  it('form JSON is the per-form artifact gen-blocks writes', () => {
    expect(formUrl('support-widget', 'react')).toBe('/blocks/f/support-widget.react.json');
  });
  it('the preview href comes from the generated preview source, per block', () => {
    expect(previewUrl('assistant')).toMatch(/^\/blocks\/(r\/assistant\.cdn\.html|local\/assistant\.html)$/);
  });
});

describe('the sticky framework choice', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('round-trips', () => {
    writeFramework('react');
    expect(readFramework()).toBe('react');
  });

  it('falls back to the first offered framework when nothing is stored', () => {
    expect(readFramework()).toBe(FRAMEWORK_BLOCK_FORMS[0].id);
  });

  it('ignores a stored value no renderer emits', () => {
    localStorage.setItem('kai-blocks-framework', 'fortran');
    expect(readFramework()).toBe(FRAMEWORK_BLOCK_FORMS[0].id);
  });

  it('a private window that THROWS on read renders the default rather than blowing up', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(readFramework()).toBe(FRAMEWORK_BLOCK_FORMS[0].id);
  });

  it('a private window that THROWS on write is not an error the page shows', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => writeFramework('react')).not.toThrow();
  });
});

describe('languageFor', () => {
  it('maps the extensions the block forms actually emit', () => {
    expect(languageFor('src/components/x/X.tsx')).toBe('tsx');
    expect(languageFor('blocks/x/x.html')).toBe('html');
    expect(languageFor('blocks/x/x.css')).toBe('css');
    expect(languageFor('blocks/x/x.js')).toBe('javascript');
    expect(languageFor('src/components/x/x.controller.ts')).toBe('typescript');
    expect(languageFor('src/components/x/README.md')).toBe('markdown');
  });
});
