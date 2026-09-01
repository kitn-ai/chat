import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
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

describe('bespoke editor accessible names (B-25 regression coverage)', () => {
  // Each case queries an accessible-name (getByLabelText) for a bespoke
  // override editor's own control(s) — a future control that loses its
  // label/for association (or its aria-label) fails HERE, in unit, rather
  // than only surfacing under a Storybook axe pass.

  it('AccentEditor / UnreadColorEditor: theme color fields reachable by label', () => {
    render(() => <Controlled template={tpl('widget')} />);
    expect(screen.getByLabelText('Accent')).toBeInTheDocument();
    expect(screen.getByLabelText('Unread color')).toBeInTheDocument();
  });

  it('AttachmentsEditor: the enable switch and the common-file-types group are reachable by name', () => {
    render(() => <Controlled template={tpl('widget')} />);
    expect(screen.getByRole('switch', { name: 'Attachments' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Common file types' })).toBeInTheDocument();
  });

  it('HistoryEditor: persistence select and (once endpoint) the URL field are reachable by label', () => {
    render(() => <Controlled template={tpl('widget')} />);
    const persistence = screen.getByLabelText('History');
    expect(persistence.tagName).toBe('SELECT');
    fireEvent.change(persistence, { target: { value: 'endpoint' } });
    expect(screen.getByLabelText('Endpoint URL').tagName).toBe('INPUT');
  });

  it('MessageActionsEditor: role-scoped groups reachable by name', () => {
    render(() => <Controlled template={tpl('research')} />);
    expect(screen.getByRole('group', { name: 'Your messages' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Assistant messages' })).toBeInTheDocument();
  });

  it('MessageActionsEditor: the role label is also VISIBLE text, not aria-label only (design-parity fix — two role groups back to back used to render as one flat unlabeled list)', () => {
    render(() => <Controlled template={tpl('research')} />);
    expect(screen.getByText('Your messages')).toBeVisible();
    expect(screen.getByText('Assistant messages')).toBeVisible();
  });

  it('CardsEditor: renders read-only, honest about no editor (design-parity fix — in-app assistant now wires the Cards section)', () => {
    render(() => <Controlled template={tpl('inAppAssistant')} />);
    // inAppAssistantStarter declares no cards — the honest "decide loudly"
    // fallback, not a silently empty section.
    expect(screen.getByText('No cards declared.')).toBeInTheDocument();
  });

  it('SlashTriggersEditor / MentionTriggersEditor: row inputs reachable by label', () => {
    render(() => <Controlled template={tpl('workspace')} />);
    expect(screen.getByLabelText('slash command 1 label')).toBeInTheDocument();
    expect(screen.getByLabelText('mention 1 label')).toBeInTheDocument();
  });

  it('HeaderActionsEditor: row label/variant reachable by label', () => {
    render(() => <Controlled template={tpl('workspace')} />);
    expect(screen.getByLabelText('Action 1 label')).toBeInTheDocument();
    expect(screen.getByLabelText('Action 1 variant')).toBeInTheDocument();
  });

  it('UserMenuEditor: name and plan reachable by label (regression: were bare <label>s)', () => {
    render(() => <Controlled template={tpl('workspace')} />);
    // "Name" is ambiguous with the always-present Identity section's own
    // "Name" field, so assert BOTH resolve rather than picking one string —
    // a UserMenuEditor field that drops its `for` disappears from this list.
    expect(screen.getAllByLabelText('Name')).toHaveLength(2);
    expect(screen.getByLabelText('Plan')).toBeInTheDocument();
  });

  it('HomeEditor: greeting title/subtitle reachable by label (regression: were bare <label>s)', () => {
    render(() => <Controlled template={tpl('widget')} />);
    expect(screen.getByLabelText('Greeting title')).toBeInTheDocument();
    expect(screen.getByLabelText('Greeting subtitle')).toBeInTheDocument();
  });

  it('ProviderEditor: mode select and (once endpoint) URL/wire fields reachable by label (regression: were bare <label>s)', () => {
    render(() => <Controlled template={tpl('widget')} />);
    // "Mode" is ambiguous with Theme's own derived "Mode" select, so assert
    // BOTH resolve rather than picking one string.
    expect(screen.getAllByLabelText('Mode')).toHaveLength(2);
    const [mode] = screen.getAllByLabelText('Mode').filter((el) => el.tagName === 'SELECT' && el.closest('section')?.getAttribute('data-derived-section') === 'provider');
    fireEvent.change(mode, { target: { value: 'endpoint' } });
    expect(screen.getByLabelText('Endpoint URL').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Wire format').tagName).toBe('SELECT');
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

describe('work-surface section visibility (2026-08-30)', () => {
  it('renders on layout: split — the Workspace template', () => {
    const { container } = render(() => <Controlled template={tpl('workspace')} />);
    expect(container.querySelector('[data-derived-section="workSurface"]')).toBeInTheDocument();
    expect(screen.getByText('Work surface')).toBeInTheDocument();
  });

  it('is hidden on every non-split layout, even if a manifest asks for it', () => {
    const workspace = tpl('workspace');
    for (const other of ['widget', 'inAppAssistant', 'assistant', 'research'] as const) {
      const hybrid = { ...tpl(other), controls: workspace.controls } as BuildableTemplate;
      const { container, unmount } = render(() => <Controlled template={hybrid} />);
      expect(
        container.querySelector('[data-derived-section="workSurface"]'),
        `${other} must not show the work-surface section`,
      ).toBeNull();
      unmount();
    }
  });

  it('labels the work-surface fields the way the design story labels them', () => {
    render(() => <Controlled template={tpl('workspace')} />);
    for (const label of ['Pane kind', 'Preview URL', 'Device toggle', 'URL bar', 'Open in new tab', 'Expand', 'Code view']) {
      expect(screen.getByText(label), label).toBeInTheDocument();
    }
  });

  it('the widget and aside sections still hide correctly after the layout-scope fix', () => {
    const { container: widgetPanel } = render(() => <Controlled template={tpl('widget')} />);
    expect(widgetPanel.querySelector('[data-derived-section="widget"]')).toBeInTheDocument();
    cleanup();
    const { container: asidePanel } = render(() => <Controlled template={tpl('inAppAssistant')} />);
    expect(asidePanel.querySelector('[data-derived-section="aside"]')).toBeInTheDocument();
    expect(asidePanel.querySelector('[data-derived-section="widget"]')).toBeNull();
  });
});

describe('hints (S-4 — off reads as a choice, not an absence)', () => {
  it('renders the manifest hint under its control', () => {
    render(() => <Controlled template={tpl('workspace')} />);
    expect(screen.getByText(/Endpoint needs your own chat route/)).toBeInTheDocument();
    expect(screen.getByText(/Local keeps history in this browser/)).toBeInTheDocument();
  });

  it('renders no hint for a path that has none', () => {
    const { container } = render(() => <Controlled template={tpl('widget')} />);
    const identity = container.querySelector('[data-derived-section="identity"]')!;
    expect(identity.querySelector('[data-derived-hint]')).toBeNull();
  });
});
