/**
 * The /blocks view: what the card RENDERS and what it SETS.
 *
 * The kai-* elements do not upgrade here. jsdom loads no kit, so
 * <kai-file-tree> is an unknown element with no shadow root and no behaviour.
 * That is the right level for this suite anyway: the card's job is to render
 * the right tags in the right mode, to set array and object props as JS
 * PROPERTIES on the right elements, and to listen for the elements' own
 * non-bubbling events. So the assertions read the tree the view renders (tags,
 * attributes, text, data-testids), the properties the effects assigned to the
 * element objects, and the callbacks. How an element paints those properties
 * is packages/ui's suite, not this one.
 *
 * Every event a viewer would cause is dispatched ON the element that owns it,
 * because kai-* events do not bubble.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@solidjs/testing-library';
import { FRAMEWORK_BLOCK_FORMS } from '@kitn.ai/blocks/forms';
import { BlocksPage } from '../src/components/blocks/BlocksPage';
import { formUrl } from '../src/lib/blocks-source';
import type { FormPayload, RegistryItem } from '../src/lib/blocks-source';

const items: RegistryItem[] = [
  {
    name: 'support-widget',
    title: 'Support Widget',
    description: 'Docked support chat.',
    categories: ['assistant', 'widget'],
    meta: { iframeHeight: '720px' },
  },
  {
    name: 'assistant',
    title: 'Assistant',
    description: 'Full-page assistant.',
    categories: ['assistant', 'full-page'],
    meta: { iframeHeight: '800px' },
  },
];

// A fixture for EVERY block x EVERY framework the renderers emit. The default
// framework after localStorage.clear() is FRAMEWORK_BLOCK_FORMS[0], which is
// `html`, so a react-only fixture set would send every default-path test down
// the form-error branch. Derived from the same axis the page reads, so PR B2
// cannot leave this file half-covered without failing the floor below.
const TARGET_ROOT: Record<string, string> = { html: 'blocks', react: 'src/components' };
const forms: Record<string, FormPayload> = {};
for (const item of items) {
  for (const form of FRAMEWORK_BLOCK_FORMS) {
    const root = TARGET_ROOT[form.id] ?? 'src/components';
    const file = form.id === 'react' ? `${item.title.replace(/\s/g, '')}.tsx` : `${item.name}.html`;
    forms[`${item.name}:${form.id}`] = {
      block: item.name,
      form: form.id,
      files: [
        {
          path: file,
          content: `/* ${item.name} ${form.id} */\n`,
          target: `${root}/${item.name}/${file}`,
        },
      ],
    };
  }
}

const loadForm = vi.fn(async (id: string, form: string) => {
  const payload = forms[`${id}:${form}`];
  if (!payload) throw new Error(`no fixture for ${id}:${form}`);
  return payload;
});

/** Drive the card's mode the way a viewer does: kai-segmented's own event.
 *  kai-* events do not bubble, so it is dispatched ON the element. */
const setMode = (card: HTMLElement, value: 'preview' | 'code'): void => {
  within(card)
    .getByTestId('mode-toggle')
    .dispatchEvent(new CustomEvent('kai-change', { detail: { value } }));
};

const setFramework = (card: HTMLElement, value: string): void => {
  within(card)
    .getByTestId('framework-select')
    .dispatchEvent(new CustomEvent('kai-change', { detail: { value } }));
};

/** Every card in code mode, which is where the framework controls exist. */
async function allCardsInCodeMode(): Promise<HTMLElement[]> {
  const cards = items.map((i) => screen.getByTestId(`block-card-${i.name}`));
  for (const card of cards) setMode(card, 'code');
  await waitFor(() => {
    for (const card of cards) expect(within(card).queryByTestId('framework-select')).not.toBeNull();
  });
  return cards;
}

beforeEach(() => {
  localStorage.clear();
  loadForm.mockClear();
});

describe('the fixtures cover the whole axis', () => {
  it('has a payload for every block x every framework renderer', () => {
    expect(Object.keys(forms).length).toBe(items.length * FRAMEWORK_BLOCK_FORMS.length);
    expect(FRAMEWORK_BLOCK_FORMS.length).toBeGreaterThan(0);
  });
});

describe('the add command is per card', () => {
  it('renders one command per block, each carrying ITS OWN id', () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const commands = screen.getAllByTestId('add-command').map((el) => el.textContent?.trim());
    expect(commands).toEqual([
      'npx create-kai add support-widget',
      'npx create-kai add assistant',
    ]);
  });

  it('two cards do not print the same command, the mockup defect', () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const commands = screen.getAllByTestId('add-command').map((el) => el.textContent?.trim());
    expect(new Set(commands).size).toBe(commands.length);
    expect(commands.length).toBeGreaterThan(1);
  });

  it('never names a framework: the CLI detects it from the project', () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    for (const el of screen.getAllByTestId('add-command')) {
      for (const form of FRAMEWORK_BLOCK_FORMS) {
        expect(el.textContent).not.toContain(` ${form.id}`);
      }
    }
  });
});

describe('the framework dropdown', () => {
  it('offers exactly the renderers that exist, on every card', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    for (const card of await allCardsInCodeMode()) {
      const select = within(card).getByTestId('framework-select') as HTMLElement & {
        options?: { value: string; label: string }[];
      };
      expect(select.options).toEqual(
        FRAMEWORK_BLOCK_FORMS.map((f) => ({ value: f.id, label: f.label })),
      );
    }
  });

  it('is global and sticky: choosing on one card moves every card and survives a remount', async () => {
    const first = render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const cards = await allCardsInCodeMode();
    setFramework(cards[0], 'react');
    await waitFor(() => {
      for (const card of cards) {
        const select = within(card).getByTestId('framework-select') as HTMLElement & {
          value?: string;
        };
        expect(select.value).toBe('react');
      }
    });
    expect(localStorage.getItem('kai-blocks-framework')).toBe('react');
    first.unmount();

    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    for (const card of await allCardsInCodeMode()) {
      const select = within(card).getByTestId('framework-select') as HTMLElement & {
        value?: string;
      };
      expect(select.value).toBe('react');
    }
  });
});

describe('code mode', () => {
  it('displays FormFile.target byte for byte, not the bare file name', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => {
      const tree = within(card).getByTestId('file-tree') as HTMLElement & {
        files?: { path: string }[];
      };
      // The DEFAULT framework, whatever the renderer list leads with.
      const target = forms[`support-widget:${FRAMEWORK_BLOCK_FORMS[0].id}`].files[0].target;
      expect(tree.files?.map((f) => f.path)).toEqual([target]);
      expect(within(card).getByTestId('active-path').textContent?.trim()).toBe(target);
    });
  });

  it('re-sets the tree when the card returns to code mode, a fresh element gets fresh props', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => expect(within(card).queryByTestId('file-tree')).not.toBeNull());
    setMode(card, 'preview');
    await waitFor(() => expect(within(card).queryByTestId('file-tree')).toBeNull());
    setMode(card, 'code');
    await waitFor(() => {
      const tree = within(card).getByTestId('file-tree') as HTMLElement & { files?: unknown[] };
      expect(tree.files?.length).toBe(1);
    });
  });

  it('loads the new framework for THAT card only when the dropdown changes', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-assistant');
    setMode(card, 'code');
    await waitFor(() =>
      expect(loadForm).toHaveBeenCalledWith('assistant', FRAMEWORK_BLOCK_FORMS[0].id),
    );
    loadForm.mockClear();

    setFramework(card, 'react');
    await waitFor(() => expect(loadForm).toHaveBeenCalledWith('assistant', 'react'));
    // support-widget never entered code mode, so nothing was fetched for it.
    expect(loadForm.mock.calls.every((c) => c[0] === 'assistant')).toBe(true);
    await waitFor(() => {
      const tree = within(card).getByTestId('file-tree') as HTMLElement & {
        files?: { path: string }[];
      };
      expect(tree.files?.[0]?.path).toBe(forms['assistant:react'].files[0].target);
    });
  });

  it('turns the code element own copy button off, because the file header carries one', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => {
      const code = within(card).getByTestId('code-block') as HTMLElement & { copy?: boolean };
      expect(code.copy).toBe(false);
      expect(within(card).queryByTestId('file-copy')).not.toBeNull();
    });
  });
});

describe('the toolbar', () => {
  it('shows the viewport group in preview mode and the framework row in code mode, never both', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    expect(within(card).queryByTestId('viewport-group')).not.toBeNull();
    expect(within(card).queryByTestId('framework-select')).toBeNull();

    setMode(card, 'code');
    await waitFor(() => {
      expect(within(card).queryByTestId('framework-select')).not.toBeNull();
      expect(within(card).queryByTestId('viewport-group')).toBeNull();
    });
  });

  it('keeps the add-command pill in BOTH modes', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    expect(within(card).queryByTestId('add-command')).not.toBeNull();
    setMode(card, 'code');
    await waitFor(() => expect(within(card).queryByTestId('add-command')).not.toBeNull());
  });

  it('gives the Download button VISIBLE text, not just an accessible name', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() =>
      expect(within(card).getByTestId('download-zip').textContent).toContain('.zip'),
    );
  });

  it('has no "Built from" row', () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    expect(screen.queryByText(/built from/i)).toBeNull();
  });
});

describe('the preview', () => {
  it('sizes the frame from the manifest and reloads on refresh', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-assistant');
    const frame = within(card).getByTestId('preview-frame') as HTMLIFrameElement;
    expect(frame.style.height).toBe('800px');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    const before = frame.getAttribute('src');
    within(card).getByTestId('preview-refresh').dispatchEvent(new CustomEvent('kai-click'));
    await waitFor(() =>
      expect(
        (within(card).getByTestId('preview-frame') as HTMLIFrameElement).getAttribute('src'),
      ).not.toBe(before),
    );
  });
});

describe('the category strip', () => {
  it('is derived from the items and filters them in place', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    expect(screen.getAllByTestId('category').map((el) => el.textContent?.trim())).toEqual([
      'all',
      'assistant',
      'widget',
      'full-page',
    ]);
    (document.querySelector('[data-category="widget"]') as HTMLElement).click();
    await waitFor(() => {
      expect(screen.queryByTestId('block-card-assistant')).toBeNull();
      expect(screen.queryByTestId('block-card-support-widget')).not.toBeNull();
    });
  });
});

describe('a form that will not load', () => {
  it('says so on the card instead of quietly hiding the framework', async () => {
    const failing = vi.fn(async () => {
      throw new Error('404');
    });
    render(() => <BlocksPage items={[items[0]]} loadForm={failing} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => expect(within(card).getByTestId('form-error')).toBeTruthy());
  });

  it('names the PATH that did not load, not just the rejection message', async () => {
    // R4, decide loudly: the card knows the URL it asked for, and a fetch
    // rejection does not carry one. The message says which file is missing so
    // a reader can check it, whatever the loader threw.
    const failing = vi.fn(async () => {
      throw new Error('404');
    });
    render(() => <BlocksPage items={[items[0]]} loadForm={failing} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => {
      const message = within(card).getByTestId('form-error').textContent ?? '';
      expect(message).toContain(formUrl('support-widget', FRAMEWORK_BLOCK_FORMS[0].id));
    });
  });

  it('disables Download, because there is nothing to zip', async () => {
    // Read as a PROPERTY, because that is what the card sets. Solid renders a
    // boolean on a custom element as a property, never an attribute (a string
    // like `label` becomes an attribute; `disabled={true}` does not), and the
    // kit rescues properties set before upgrade, so the property is what the
    // real element reads.
    const failing = vi.fn(async () => {
      throw new Error('404');
    });
    render(() => <BlocksPage items={[items[0]]} loadForm={failing} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => expect(within(card).getByTestId('form-error')).toBeTruthy());
    const button = within(card).getByTestId('download-zip') as HTMLElement & {
      disabled?: boolean;
    };
    expect(button.disabled).toBe(true);
  });

  it('leaves Download enabled once a payload IS loaded, so the case above is not vacuous', async () => {
    render(() => <BlocksPage items={[items[0]]} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => expect(within(card).queryByTestId('file-tree')).not.toBeNull());
    await waitFor(() => {
      const button = within(card).getByTestId('download-zip') as HTMLElement & {
        disabled?: boolean;
      };
      expect(button.disabled).toBe(false);
    });
  });
});

describe('two loads in flight', () => {
  it('ignores a stale load that resolves after a newer one', async () => {
    // Switching framework twice on a slow connection: the first request can
    // land LAST. Without a guard the card would show the framework the reader
    // moved away from, with the dropdown still reading the newer one.
    const release: Record<string, () => void> = {};
    const slow = vi.fn(
      (id: string, form: string) =>
        new Promise<FormPayload>((resolve) => {
          release[form] = () => resolve(forms[`${id}:${form}`]);
        }),
    );
    render(() => <BlocksPage items={[items[0]]} loadForm={slow} />);
    const card = screen.getByTestId('block-card-support-widget');
    const first = FRAMEWORK_BLOCK_FORMS[0].id;

    setMode(card, 'code');
    await waitFor(() => expect(release[first]).toBeTypeOf('function'));
    setFramework(card, 'react');
    await waitFor(() => expect(release.react).toBeTypeOf('function'));

    // The NEWER load lands first.
    release.react();
    await waitFor(() => {
      const tree = within(card).getByTestId('file-tree') as HTMLElement & {
        files?: { path: string }[];
      };
      expect(tree.files?.[0]?.path).toBe(forms['support-widget:react'].files[0].target);
    });

    // Then the stale one arrives and must be dropped on the floor.
    release[first]();
    await new Promise((r) => setTimeout(r, 0));
    const tree = within(card).getByTestId('file-tree') as HTMLElement & {
      files?: { path: string }[];
    };
    expect(tree.files?.[0]?.path).toBe(forms['support-widget:react'].files[0].target);
    expect(within(card).getByTestId('active-path').textContent?.trim()).toBe(
      forms['support-widget:react'].files[0].target,
    );
  });
});
