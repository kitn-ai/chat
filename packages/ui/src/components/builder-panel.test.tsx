/**
 * A design-round rendering smoke test, not a behavior suite (this is a
 * story-first design surface — see builder-panel.stories.tsx and
 * RECOMMENDATION.md). Pins the sections exist, the composed kit controls are
 * the ones doing the rendering (not hand-rolled inputs), and the two named
 * patterns from the spike — presence-as-boolean, cross-field visibility —
 * actually behave as designed.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { BuilderPanel, type BuilderConstruct, ACCEPT_CHIPS } from './builder-panel';
import { BuilderLayout } from './builder-layout';

afterEach(cleanup);

const BASE: BuilderConstruct = { name: 'acme-support', layout: 'widget' };

function ControlledPanel(props: { initial: BuilderConstruct; onChange?: (v: BuilderConstruct) => void }) {
  const [value, setValue] = createSignal(props.initial);
  return (
    <BuilderPanel
      value={value()}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

describe('BuilderPanel', () => {
  it('renders every section as a design-surface hook (BASE defaults to layout: widget, so Widget is present too)', () => {
    render(() => <ControlledPanel initial={BASE} />);
    for (const title of ['Identity', 'Layout', 'Widget', 'Theme', 'Home', 'Capabilities', 'Raw JSON']) {
      expect(document.querySelector(`[data-builder-section="${title}"]`)).toBeInTheDocument();
    }
  });

  it('renders no part= attribute on the panel-authored chrome (sections/rows) — only the reused kit primitives (Input/Select/…) carry their own baked-in parts', () => {
    const { container } = render(() => <ControlledPanel initial={BASE} />);
    const root = container.querySelector('[data-builder-panel]');
    expect(root).not.toBeNull();
    expect(root).not.toHaveAttribute('part');
    for (const section of container.querySelectorAll('[data-builder-section]')) {
      expect(section).not.toHaveAttribute('part');
    }
  });

  it('composes from the kit widgets, not raw <input>/<select>', () => {
    render(() => <ControlledPanel initial={BASE} />);
    // The kit's Select renders a real <select>; RadioGroup real <input type=radio>;
    // Switch a role=switch button. Presence of these (rather than bespoke divs)
    // is the "reuse existing form components" check for this design round.
    expect(document.querySelector('select')).toBeInTheDocument();
    expect(document.querySelectorAll('input[type="radio"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[role="switch"]').length).toBeGreaterThan(0);
  });

  it('presence-as-boolean: toggling the Home switch adds/removes the whole home object', () => {
    const onChange = vi.fn();
    render(() => <ControlledPanel initial={BASE} onChange={onChange} />);
    const homeSwitch = screen.getByRole('switch', { name: 'Home tab' });
    expect(homeSwitch).toHaveAttribute('aria-checked', 'false');
    homeSwitch.click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ home: {} }));
  });

  it('cross-field visibility: Conversations is disabled with a reason when History is none', () => {
    const withHistoryNone: BuilderConstruct = {
      ...BASE,
      capabilities: { history: { persistence: 'none' } },
    };
    render(() => <ControlledPanel initial={withHistoryNone} />);
    const conversationsSwitch = screen.getByRole('switch', { name: 'Conversations' });
    expect(conversationsSwitch).toBeDisabled();
    expect(screen.getByText(/needs history set to local or endpoint/i)).toBeInTheDocument();
  });

  it('cross-field visibility: Conversations is enabled once History is local', () => {
    const withHistoryLocal: BuilderConstruct = {
      ...BASE,
      capabilities: { history: { persistence: 'local' } },
    };
    render(() => <ControlledPanel initial={withHistoryLocal} />);
    const conversationsSwitch = screen.getByRole('switch', { name: 'Conversations' });
    expect(conversationsSwitch).not.toBeDisabled();
  });

  describe('layout (owner ruling, design round 8: custom excluded, Widget section is layout-scoped)', () => {
    it('does not offer Custom as a layout choice', () => {
      render(() => <ControlledPanel initial={BASE} />);
      expect(screen.queryByRole('radio', { name: /custom/i })).toBeNull();
      expect(screen.queryByText('Custom')).toBeNull();
    });

    it('offers exactly the four supported layouts', () => {
      render(() => <ControlledPanel initial={BASE} />);
      for (const label of ['Widget', 'Fullscreen', 'Aside', 'Split']) {
        expect(screen.getByRole('radio', { name: new RegExp(`^${label}`, 'i') })).toBeInTheDocument();
      }
    });

    it('shows the eject-for-custom hint under the layout radio', () => {
      render(() => <ControlledPanel initial={BASE} />);
      expect(screen.getByText('Need a custom composition? Eject and compose by hand.')).toBeInTheDocument();
    });

    it('the Widget section is present when layout is widget', () => {
      render(() => <ControlledPanel initial={{ ...BASE, layout: 'widget' }} />);
      expect(document.querySelector('[data-builder-section="Widget"]')).toBeInTheDocument();
    });

    it('the Widget section is hidden entirely (unmounted, not disabled) for every other layout', () => {
      for (const layout of ['fullscreen', 'aside', 'split'] as const) {
        const { unmount } = render(() => <ControlledPanel initial={{ ...BASE, layout }} />);
        expect(document.querySelector('[data-builder-section="Widget"]')).toBeNull();
        unmount();
      }
    });

    it('switching layout away from widget and back reveals/hides the Widget section live', () => {
      render(() => <ControlledPanel initial={BASE} />);
      expect(document.querySelector('[data-builder-section="Widget"]')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('radio', { name: /^Fullscreen/i }));
      expect(document.querySelector('[data-builder-section="Widget"]')).toBeNull();
      fireEvent.click(screen.getByRole('radio', { name: /^Widget/i }));
      expect(document.querySelector('[data-builder-section="Widget"]')).toBeInTheDocument();
    });

    it('editing the Widget fields (position, launcher icon, open by default) updates the construct', () => {
      const onChange = vi.fn();
      render(() => <ControlledPanel initial={BASE} onChange={onChange} />);

      // Scoped to the Widget section, not `getByRole('combobox')`: Theme's
      // Mode select and Capabilities' History select are also `<select>`s
      // rendered on the same (layout: widget) construct, so an unscoped
      // role query would be ambiguous.
      const positionSelect = document.querySelector('[data-builder-section="Widget"] select')!;
      fireEvent.change(positionSelect, { target: { value: 'top-start' } });
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ widget: expect.objectContaining({ position: 'top-start' }) }),
      );

      const launcherIcon = screen.getByPlaceholderText('https://…/icon.svg');
      fireEvent.input(launcherIcon, { target: { value: 'https://acme.example/icon.svg' } });
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ widget: expect.objectContaining({ launcherIcon: 'https://acme.example/icon.svg' }) }),
      );

      screen.getByRole('switch', { name: 'Open by default' }).click();
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ widget: expect.objectContaining({ defaultOpen: true }) }),
      );
    });
  });

  describe('attachments accept editor (owner feedback, design round 2)', () => {
    it('enabling Attachments defaults accept to Images + PDFs, the stated wizard default', () => {
      const onChange = vi.fn();
      render(() => <ControlledPanel initial={BASE} onChange={onChange} />);
      screen.getByRole('switch', { name: 'Attachments' }).click();
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilities: expect.objectContaining({ attachments: { accept: ['image/*', 'application/pdf'] } }),
        }),
      );
    });

    it('a chip lights up (aria-pressed) exactly when all of its patterns are present', () => {
      const withAttachments: BuilderConstruct = {
        ...BASE,
        capabilities: { attachments: { accept: ['image/*', 'application/pdf'] } },
      };
      render(() => <ControlledPanel initial={withAttachments} />);
      const imagesChip = screen.getByRole('button', { name: 'Images' });
      const pdfsChip = screen.getByRole('button', { name: 'PDFs' });
      const audioChip = screen.getByRole('button', { name: 'Audio' });
      expect(imagesChip).toHaveAttribute('aria-pressed', 'true');
      expect(pdfsChip).toHaveAttribute('aria-pressed', 'true');
      expect(audioChip).toHaveAttribute('aria-pressed', 'false');
    });

    it('clicking a lit chip removes exactly its patterns; the raw muted list stays honest', () => {
      const onChange = vi.fn();
      const withAttachments: BuilderConstruct = {
        ...BASE,
        capabilities: { attachments: { accept: ['image/*', 'application/pdf'] } },
      };
      render(() => <ControlledPanel initial={withAttachments} onChange={onChange} />);
      screen.getByRole('button', { name: 'PDFs' }).click();
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilities: expect.objectContaining({ attachments: { accept: ['image/*'] } }),
        }),
      );
    });

    it('there is no always-visible raw MIME summary under the chips — the raw list lives only inside Advanced (owner ruling, design round 5)', () => {
      const withAttachments: BuilderConstruct = {
        ...BASE,
        capabilities: { attachments: { accept: ['image/*', 'application/pdf'] } },
      };
      render(() => <ControlledPanel initial={withAttachments} />);
      // The Advanced <details> is collapsed by default, so its content —
      // including [data-builder-accept-raw] — isn't in the accessibility
      // tree / doesn't render visibly, but it's still present in the DOM
      // (a <details> hides its content via the `open` attribute, not by
      // omitting it). Assert there's exactly one such hook, and that it
      // lives INSIDE the details, not as a sibling of the chip row.
      const editor = document.querySelector('[data-builder-accept-editor]')!;
      const raw = editor.querySelector('[data-builder-accept-raw]');
      expect(raw).not.toBeNull();
      expect(raw!.closest('details')).not.toBeNull();
      // Nothing else under the chip row carries the hook or the old
      // comma-joined summary text directly as a sibling <p>.
      const chipRow = editor.querySelector('[role="group"][aria-label="Common file types"]')!;
      expect(chipRow.nextElementSibling?.matches('details')).toBe(true);
    });

    it('a hand-added MIME type lives in the Advanced raw list (one per line) but lights no chip', () => {
      const withExtra: BuilderConstruct = {
        ...BASE,
        capabilities: { attachments: { accept: ['image/*', 'application/pdf', 'application/json'] } },
      };
      render(() => <ControlledPanel initial={withExtra} />);
      expect(document.querySelector('[data-builder-accept-raw]')).toHaveValue(
        'image/*\napplication/pdf\napplication/json',
      );
      for (const chip of ACCEPT_CHIPS) {
        if (chip.id === 'images' || chip.id === 'pdfs') continue;
        expect(screen.getByRole('button', { name: chip.label })).toHaveAttribute('aria-pressed', 'false');
      }
    });

    it('the Advanced raw field is a collapsed-by-default autosizing textarea holding the same list, one pattern per line', () => {
      const withAttachments: BuilderConstruct = {
        ...BASE,
        capabilities: { attachments: { accept: ['image/*', 'application/pdf'] } },
      };
      render(() => <ControlledPanel initial={withAttachments} />);
      const details = document.querySelector('[data-builder-accept-editor] details');
      expect(details).not.toBeNull();
      expect((details as HTMLDetailsElement).open).toBe(false);
      const raw = screen.getByLabelText('Exact MIME types, one per line');
      expect(raw.tagName).toBe('TEXTAREA');
      expect(raw).toHaveValue('image/*\napplication/pdf');
    });

    it('editing the Advanced textarea commits on blur, splitting on newlines or commas', () => {
      const onChange = vi.fn();
      render(() => <ControlledPanel initial={{ ...BASE, capabilities: { attachments: { accept: [] } } }} onChange={onChange} />);
      const raw = screen.getByLabelText('Exact MIME types, one per line');
      fireEvent.input(raw, { target: { value: 'image/*\napplication/pdf, text/csv' } });
      fireEvent.blur(raw);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilities: expect.objectContaining({
            attachments: { accept: ['image/*', 'application/pdf', 'text/csv'] },
          }),
        }),
      );
    });
  });
});

describe('BuilderLayout', () => {
  it('renders the panel and preview slots plus the toolbar chrome', () => {
    render(() => (
      <BuilderLayout name="acme-support" panel={<div data-testid="panel-slot" />} preview={<div data-testid="preview-slot" />} />
    ));
    expect(screen.getByTestId('panel-slot')).toBeInTheDocument();
    expect(screen.getByTestId('preview-slot')).toBeInTheDocument();
    expect(screen.getByText('acme-support')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Preview viewport' })).toBeInTheDocument();
  });

  it('renders no part= attributes', () => {
    const { container } = render(() => (
      <BuilderLayout name="acme-support" panel={<div />} preview={<div />} />
    ));
    expect(container.querySelector('[part]')).toBeNull();
  });

  // Round A4: the viewport chips constrain the preview frame's width —
  // desktop is the historical "fill, no wrapper width" stub behavior;
  // tablet/mobile wrap `preview` in a frame sized per `FRAME_WIDTH`
  // (builder-layout.tsx). Reads `[data-builder-preview-frame]`'s own
  // `style.width`, not just the chip's `aria-pressed`, so a chip that
  // toggled visually but did nothing to the frame would fail these.
  describe('viewport chips', () => {
    it('defaults to desktop: no width constraint on the preview frame', () => {
      const { container } = render(() => (
        <BuilderLayout name="acme-support" panel={<div />} preview={<div data-testid="preview-slot" />} />
      ));
      const frame = container.querySelector('[data-builder-preview-frame]') as HTMLElement;
      expect(frame).toHaveAttribute('data-builder-viewport', 'desktop');
      expect(frame.style.width).toBe('');
    });

    it('selecting Tablet sets the frame to 768px', () => {
      const { container } = render(() => (
        <BuilderLayout name="acme-support" panel={<div />} preview={<div />} />
      ));
      fireEvent.click(screen.getByRole('button', { name: /Tablet/i }));
      const frame = container.querySelector('[data-builder-preview-frame]') as HTMLElement;
      expect(frame).toHaveAttribute('data-builder-viewport', 'tablet');
      expect(frame.style.width).toBe('768px');
      expect(screen.getByRole('button', { name: /Tablet/i })).toHaveAttribute('aria-pressed', 'true');
    });

    it('selecting Mobile sets the frame to 390px', () => {
      const { container } = render(() => (
        <BuilderLayout name="acme-support" panel={<div />} preview={<div />} />
      ));
      fireEvent.click(screen.getByRole('button', { name: /Mobile/i }));
      const frame = container.querySelector('[data-builder-preview-frame]') as HTMLElement;
      expect(frame).toHaveAttribute('data-builder-viewport', 'mobile');
      expect(frame.style.width).toBe('390px');
    });

    it('switching back to Desktop clears the width constraint', () => {
      const { container } = render(() => (
        <BuilderLayout name="acme-support" panel={<div />} preview={<div />} />
      ));
      fireEvent.click(screen.getByRole('button', { name: /Mobile/i }));
      fireEvent.click(screen.getByRole('button', { name: /Desktop/i }));
      const frame = container.querySelector('[data-builder-preview-frame]') as HTMLElement;
      expect(frame).toHaveAttribute('data-builder-viewport', 'desktop');
      expect(frame.style.width).toBe('');
    });

    it('supports a controlled viewport, reporting selection via onViewportChange rather than switching itself', () => {
      const onViewportChange = vi.fn();
      const { container } = render(() => (
        <BuilderLayout
          name="acme-support"
          panel={<div />}
          preview={<div />}
          viewport="desktop"
          onViewportChange={onViewportChange}
        />
      ));
      fireEvent.click(screen.getByRole('button', { name: /Mobile/i }));
      expect(onViewportChange).toHaveBeenCalledWith('mobile');
      // Controlled: the prop didn't change, so the frame stays at desktop.
      const frame = container.querySelector('[data-builder-preview-frame]') as HTMLElement;
      expect(frame).toHaveAttribute('data-builder-viewport', 'desktop');
    });
  });
});
