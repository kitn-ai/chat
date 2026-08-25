/**
 * Unit tests for the declarative `<kai-suggestion>` light-DOM API of
 * `<kai-suggestions>`.
 *
 * Strategy: the `defineWebComponent` call registers a real Shadow-DOM custom
 * element which requires a full browser environment (Constructable Stylesheets,
 * shadow roots, etc.) and is therefore not suitable for jsdom unit tests.
 * Instead we:
 *   1. Test the exported `parseSuggestionNode` helper in isolation — it has no
 *      DOM dependencies beyond `Element`, which jsdom provides perfectly.
 *   2. Test that the merged list of prop + slotted items renders chip buttons
 *      and fires click handlers correctly via `PromptSuggestion` directly,
 *      mirroring the pattern used in `message-action-bar.test.tsx`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { For, flush } from 'solid-js';
import { parseSuggestionNode } from './prompt-suggestions';
import { PromptSuggestion } from '../components/prompt-suggestion';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// parseSuggestionNode — pure helper
// ---------------------------------------------------------------------------

describe('parseSuggestionNode', () => {
  function makeNode(textContent: string, value?: string): Element {
    const el = document.createElement('kai-suggestion');
    el.textContent = textContent;
    if (value !== undefined) el.setAttribute('value', value);
    return el;
  }

  it('uses textContent as label', () => {
    const item = parseSuggestionNode(makeNode('Use Vue'));
    expect(item).toMatchObject({ label: 'Use Vue' });
  });

  it('uses value attribute as value when present', () => {
    const item = parseSuggestionNode(makeNode('Use Vue', 'vue'));
    expect(item).toMatchObject({ label: 'Use Vue', value: 'vue' });
  });

  it('falls back to textContent as value when value attribute is absent', () => {
    const item = parseSuggestionNode(makeNode('Use Vue'));
    expect(item).toMatchObject({ label: 'Use Vue', value: 'Use Vue' });
  });

  it('trims leading/trailing whitespace from textContent', () => {
    const item = parseSuggestionNode(makeNode('  Explain the architecture  '));
    expect(item).toMatchObject({ label: 'Explain the architecture' });
  });

  it('handles empty textContent with a value attribute', () => {
    const item = parseSuggestionNode(makeNode('', 'vue'));
    expect(item).toMatchObject({ label: '', value: 'vue' });
  });
});

// ---------------------------------------------------------------------------
// Merge + render: prop suggestions + slotted suggestions combine correctly
// ---------------------------------------------------------------------------

type Item = string | { label: string; value?: string };

const labelOf = (s: Item) => (typeof s === 'string' ? s : s.label);
const valueOf = (s: Item) => (typeof s === 'string' ? s : s.value ?? s.label);

/**
 * Minimal test harness that renders a list of `Item`s as `PromptSuggestion`
 * chips and records which value was clicked — mirrors the render path in
 * `prompt-suggestions.tsx`.
 */
function SuggestionList(props: { items: Item[]; onSelect: (value: string) => void }) {
  return (
    <div>
      <For each={props.items}>
        {(s) => (
          <PromptSuggestion onClick={() => props.onSelect(valueOf(s))}>
            {labelOf(s)}
          </PromptSuggestion>
        )}
      </For>
    </div>
  );
}

describe('suggestion chip rendering and click events', () => {
  it('renders one chip per item', () => {
    const { getByText } = render(() => (
      <SuggestionList
        items={['Explain the architecture', 'Show me a code example']}
        onSelect={() => {}}
      />
    ));
    expect(getByText('Explain the architecture')).toBeInTheDocument();
    expect(getByText('Show me a code example')).toBeInTheDocument();
  });

  it('fires onSelect with the string value when a string item is clicked', () => {
    const onSelect = vi.fn();
    const { getByText } = render(() => (
      <SuggestionList items={['Use Vue']} onSelect={onSelect} />
    ));
    fireEvent.click(getByText('Use Vue'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).toHaveBeenCalledWith('Use Vue');
  });

  it('fires onSelect with item.value for an object item with an explicit value', () => {
    const onSelect = vi.fn();
    const { getByText } = render(() => (
      <SuggestionList
        items={[{ label: 'Use Vue', value: 'vue' }]}
        onSelect={onSelect}
      />
    ));
    fireEvent.click(getByText('Use Vue'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).toHaveBeenCalledWith('vue');
  });

  it('falls back to label as value for an object item without explicit value', () => {
    const onSelect = vi.fn();
    const { getByText } = render(() => (
      <SuggestionList
        items={[{ label: 'Use Vue' }]}
        onSelect={onSelect}
      />
    ));
    fireEvent.click(getByText('Use Vue'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).toHaveBeenCalledWith('Use Vue');
  });

  it('renders prop items before declarative (slotted) items', () => {
    // Simulate the merge: prop first, slotted second.
    const propItems: Item[] = [{ label: 'Prop item', value: 'prop' }];
    const slottedItems: Item[] = [{ label: 'Slotted item', value: 'slotted' }];
    const merged = [...propItems, ...slottedItems];

    const { getAllByRole } = render(() => (
      <SuggestionList items={merged} onSelect={() => {}} />
    ));
    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('Prop item');
    expect(buttons[1]).toHaveTextContent('Slotted item');
  });

  it('parseSuggestionNode produces items that render and fire the correct value', () => {
    // End-to-end: parse a DOM node → render it → click → verify event value.
    const onSelect = vi.fn();
    const el = document.createElement('kai-suggestion');
    el.textContent = 'Use Vue';
    el.setAttribute('value', 'vue');

    const parsed = parseSuggestionNode(el);
    const { getByText } = render(() => (
      <SuggestionList items={[parsed]} onSelect={onSelect} />
    ));
    fireEvent.click(getByText('Use Vue'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).toHaveBeenCalledWith('vue');
  });
});

// ---------------------------------------------------------------------------
// layout="list" — the vertical "Ideas for you" rows (icon + label + hover)
// ---------------------------------------------------------------------------

type ListItem = { label: string; value?: string; icon?: string };

/** Harness mirroring the `layout="list"` render path in `prompt-suggestions.tsx`:
 *  full-width rows with a leading icon, passed to `PromptSuggestion` via `list`. */
function SuggestionRows(props: { items: ListItem[]; onSelect: (value: string) => void }) {
  return (
    <div class="flex flex-col gap-0.5">
      <For each={props.items}>
        {(s) => (
          <PromptSuggestion
            list
            icon={s.icon}
            onClick={() => props.onSelect(s.value ?? s.label)}
          >
            {s.label}
          </PromptSuggestion>
        )}
      </For>
    </div>
  );
}

describe('layout="list" rendering', () => {
  const ideas: ListItem[] = [
    { label: 'Send me a daily briefing', value: 'briefing', icon: 'sparkles' },
    { label: 'Organize my inbox', value: 'inbox', icon: 'folder' },
    { label: 'Customize Cowork for me', value: 'customize', icon: 'settings' },
  ];

  it('renders one full-width row per item with its label', () => {
    const { getByText } = render(() => (
      <SuggestionRows items={ideas} onSelect={() => {}} />
    ));
    for (const idea of ideas) expect(getByText(idea.label)).toBeInTheDocument();
  });

  it('renders the leading icon for a row', () => {
    // `icon="sparkles"` resolves to a lucide-solid <svg>; a text icon renders
    // as a <span>. Either way the row still carries its label.
    const { getByText, getAllByRole } = render(() => (
      <SuggestionRows
        items={[{ label: 'Send me a daily briefing', icon: '✦' }]}
        onSelect={() => {}}
      />
    ));
    const button = getAllByRole('button')[0];
    expect(button).toBeInTheDocument();
    expect(getByText('✦')).toBeInTheDocument();
    expect(getByText('Send me a daily briefing')).toBeInTheDocument();
  });

  it('fires onSelect with the row value when a list row is clicked', () => {
    const onSelect = vi.fn();
    const { getByText } = render(() => (
      <SuggestionRows items={ideas} onSelect={onSelect} />
    ));
    fireEvent.click(getByText('Organize my inbox'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).toHaveBeenCalledWith('inbox');
  });
});
