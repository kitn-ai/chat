import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { DerivedBuilderPanel, FIELD_OVERRIDES } from './builder-panel-derived';
import { schemaNodeAt, getAtPath } from './construct-form-paths';
import { buildableTemplates, type BuildableTemplate } from '../agent-tooling/construct/templates';
import type { Construct } from '../agent-tooling/construct/schema';

afterEach(cleanup);

const tpl = (id: string): BuildableTemplate => buildableTemplates().find((t) => t.id === id)!;

function Controlled(props: { template: BuildableTemplate; onChange?: (v: Construct) => void }) {
  const [value, setValue] = createSignal(props.template.starter);
  return (
    <DerivedBuilderPanel
      value={value()}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      template={props.template}
    />
  );
}

describe('derivation (B-19)', () => {
  for (const t of buildableTemplates()) {
    it(`${t.id}: renders exactly its manifest's sections, in manifest order`, () => {
      const { container } = render(() => <Controlled template={t} />);
      const rendered = [...container.querySelectorAll('[data-derived-section]')].map((el) =>
        el.getAttribute('data-derived-section'),
      );
      expect(rendered).toEqual(t.controls.map((s) => s.id));
    });
  }

  it('override drift: every FIELD_OVERRIDES key is a live schema path — a rename goes red here (B-19)', () => {
    for (const path of Object.keys(FIELD_OVERRIDES)) {
      expect(schemaNodeAt(path), path).toBeDefined();
    }
  });
});

describe('a11y (B-25)', () => {
  it('derived scalar fields carry a real label/for association', () => {
    render(() => <Controlled template={tpl('inAppAssistant')} />);
    // aside.width is a plain derived ZodString — no override, pure walk.
    const width = screen.getByLabelText('Width');
    expect(width.tagName).toBe('INPUT');
    expect(width.getAttribute('id')).toBeTruthy();
  });

  it('grouped controls are named groups', () => {
    render(() => <Controlled template={tpl('research')} />);
    expect(screen.getByRole('group', { name: 'Your messages' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Assistant messages' })).toBeInTheDocument();
  });

  it('disabled-with-reason surfaces the reason to AT via aria-describedby', () => {
    // inAppAssistant's starter has history: local — flip to a starter without it.
    const t = tpl('assistant');
    const noHistory: BuildableTemplate = {
      ...t,
      starter: { ...t.starter, capabilities: { starters: ['hi'] } },
    };
    render(() => <Controlled template={noHistory} />);
    const conversations = screen.getByRole('switch', { name: 'Conversations' });
    expect(conversations).toBeDisabled();
    expect(conversations).toHaveAccessibleDescription(/needs history set to local or endpoint/i);
  });
});

describe('edits go through construct-form-paths', () => {
  it('presence: toggling a z.literal(true) switch off DELETES the key', () => {
    const onChange = vi.fn();
    render(() => <Controlled template={tpl('workspace')} onChange={onChange} />);
    const palette = screen.getByRole('switch', { name: 'Command palette' });
    expect(palette).toHaveAttribute('aria-checked', 'true');
    palette.click();
    const next = onChange.mock.calls.at(-1)![0] as Construct;
    expect(getAtPath(next, 'shell.commandPalette')).toBeUndefined();
  });

  it('anchored boolean: the sources strip switch reads ON from an absent key and writes explicit false', () => {
    const t = tpl('research');
    const absent: BuildableTemplate = {
      ...t,
      starter: {
        ...t.starter,
        capabilities: { ...t.starter.capabilities, sources: undefined },
      } as Construct,
    };
    const onChange = vi.fn();
    render(() => <Controlled template={absent} onChange={onChange} />);
    const strip = screen.getByRole('switch', { name: 'Sources strip' });
    expect(strip).toHaveAttribute('aria-checked', 'true'); // absent = the kit default ON
    strip.click();
    const next = onChange.mock.calls.at(-1)![0] as Construct;
    expect(getAtPath(next, 'capabilities.sources.strip')).toBe(false);
  });

  it('problems render beside their section, pathed', () => {
    render(() => (
      <DerivedBuilderPanel
        value={tpl('widget').starter}
        onChange={() => {}}
        template={tpl('widget')}
        problems={[{ path: 'name', message: 'must be a valid custom-element tag' }]}
      />
    ));
    expect(screen.getByText(/must be a valid custom-element tag/)).toBeInTheDocument();
  });
});
