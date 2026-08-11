import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn, within, expect } from 'storybook/test';
import { Composer } from './composer';
import type { TriggerDef, ComposerProps } from './composer';
import type { ComposerDoc } from '../primitives/composer-model';
import { componentDescription } from '../stories/docs/element-controls';

// Minimal inline data: URI icon, a plain colored square with a glyph.
function imgData(fill: string, glyph: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="4" fill="${fill}"/><text x="16" y="22" font-size="16" text-anchor="middle" fill="white">${glyph}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const SKILL_ICON = imgData('#7c3aed', '▶');

const meta = {
  title: 'Components/Elements/Composer',
  component: Composer,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A plain-text prompt input with atomic entity pills (skills, mentions) via `/` and `@` trigger menus, keyword highlighting through the CSS Custom Highlight API, and a structured `{ doc, text, entities }` submit event. Not an RTE: `contenteditable="plaintext-only"`; pills are the only non-text nodes.',
        'On `<kai-composer>`, array/object props (`value`, `triggers`, `highlights`) are set as JS properties; scalars (`placeholder`, `disabled`, `loading`, `maxHeight`, `submitOnEnter`) work as attributes.',
      ]),
    },
  },
  argTypes: {
    placeholder: {
      control: 'text',
      description: 'Placeholder text shown when the composer is empty.',
    },
    disabled: {
      control: 'boolean',
      description: 'Disables the composer (non-interactive).',
      table: { defaultValue: { summary: 'false' } },
    },
    loading: {
      control: 'boolean',
      description: 'Shows a busy/streaming state and blocks submit.',
      table: { defaultValue: { summary: 'false' } },
    },
    maxHeight: {
      control: 'number',
      description: 'Maximum height in px before the content area scrolls.',
      table: { defaultValue: { summary: '240' } },
    },
    submitOnEnter: {
      control: 'boolean',
      description: 'Whether Enter (without Shift) fires onSubmit.',
      table: { defaultValue: { summary: 'true' } },
    },
    onSubmit: {
      action: 'submit',
      description: 'Fired with `{ doc, text, entities }` on Enter or programmatic submit.',
      table: { category: 'Events' },
    },
    onChange: {
      action: 'change',
      description: 'Fired with `{ doc, text, entities }` on every input event.',
      table: { category: 'Events' },
    },
    onTrigger: {
      action: 'trigger',
      description: 'A trigger char (`/`, `@`) opened the menu: `{ char, query, rect }`.',
      table: { category: 'Events' },
    },
    onTriggerClose: {
      action: 'trigger-close',
      description: 'The trigger menu closed (selection, Escape, or no longer matching).',
      table: { category: 'Events' },
    },
    onEntityAdd: {
      action: 'entity-add',
      description: 'An entity pill (skill/mention) was inserted into the doc.',
      table: { category: 'Events' },
    },
    onEntityRemove: {
      action: 'entity-remove',
      description: 'An entity pill was removed from the doc.',
      table: { category: 'Events' },
    },
    onFocus: {
      action: 'focus',
      description: 'The editable surface gained focus.',
      table: { category: 'Events' },
    },
    onBlur: {
      action: 'blur',
      description: 'The editable surface lost focus.',
      table: { category: 'Events' },
    },
  },
  args: {
    placeholder: 'Ask anything…',
    disabled: false,
    loading: false,
    maxHeight: 240,
    submitOnEnter: true,
    onSubmit: fn(),
    onChange: fn(),
    onTrigger: fn(),
    onTriggerClose: fn(),
    onEntityAdd: fn(),
    onEntityRemove: fn(),
    onFocus: fn(),
    onBlur: fn(),
  },
  render: (args: ComposerProps) => (
    <div class="max-w-2xl">
      <Composer {...args} />
    </div>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj;

const IMPORT = `import { Composer, type TriggerDef, type ComposerDoc } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

/** Args-driven: toggle disabled/loading and edit the placeholder via Controls. */
export const Playground: Story = {
  ...src(`<Composer
  placeholder="Ask anything…"
  submitOnEnter
  onSubmit={({ doc, text, entities }) => send({ text, entities })}
  onChange={({ text }) => setDraft(text)}
/>`),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    // The editable surface must be present.
    const editable = canvas.getByRole('textbox');
    expect(editable).toBeTruthy();
    // The placeholder (a ::before pseudo-element) is configured via data-placeholder.
    expect((editable as HTMLElement).getAttribute('data-placeholder')).toBe('Ask anything…');
  },
};

// ---------------------------------------------------------------------------
// WithSkills, a / trigger with skill items
// ---------------------------------------------------------------------------

const SKILL_TRIGGERS: TriggerDef[] = [
  {
    char: '/',
    kind: 'skill',
    items: [
      {
        id: 'record-replay',
        label: 'Record & Replay',
        icon: SKILL_ICON,
        promptText: 'Use the Record & Replay skill.',
      },
      {
        id: 'summarize',
        label: 'Summarize',
      },
    ],
  },
];

/** Type `/` in the composer to open the skill picker. Select an item to insert
 *  a pill. */
export const WithSkills: Story = {
  args: {
    placeholder: 'Type / to pick a skill…',
    triggers: SKILL_TRIGGERS,
    onSubmit: fn(),
    onChange: fn(),
  },
  ...src(`// A trigger char opens a menu of items; picking one inserts an atomic pill.
const triggers: TriggerDef[] = [
  {
    char: '/',
    kind: 'skill',
    items: [
      { id: 'record-replay', label: 'Record & Replay', icon: skillIcon,
        promptText: 'Use the Record & Replay skill.' },
      { id: 'summarize', label: 'Summarize' },
    ],
  },
];

<Composer
  placeholder="Type / to pick a skill…"
  triggers={triggers}
  onSubmit={({ text, entities }) => send({ text, entities })}
  onEntityAdd={(e) => console.log('added', e)}
/>`),
  render: (args: ComposerProps) => (
    <div class="max-w-2xl">
      <Composer {...args} />
    </div>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    // NOTE: full /-menu → select → backspace keyboard flow is verified by the
    // IVP (tests/e2e/composer-ivp.spec.ts), not here, userEvent can't reliably
    // drive contenteditable selection in this harness (focus races, synthetic
    // input events don't update the DOM the same way a real key sequence does).
    //
    // What we CAN reliably assert: the component mounts correctly and the
    // editable surface is present.
    const canvas = within(canvasElement);
    const editable = canvas.getByRole('textbox');
    expect(editable).toBeTruthy();
    // The placeholder is configured + shown before any typing.
    expect((editable as HTMLElement).getAttribute('data-placeholder')).toBe('Type / to pick a skill…');
  },
};

// ---------------------------------------------------------------------------
// WithMentions, a @ trigger with mention items
// ---------------------------------------------------------------------------

const MENTION_TRIGGERS: TriggerDef[] = [
  {
    char: '@',
    kind: 'mention',
    items: [
      { id: 'alice', label: 'Alice Kim', icon: imgData('#0369a1', 'A') },
      { id: 'bob', label: 'Bob Chen', icon: imgData('#0f766e', 'B') },
    ],
  },
];

/** Type `@` to mention a collaborator. */
export const WithMentions: Story = {
  args: {
    placeholder: 'Type @ to mention someone…',
    triggers: MENTION_TRIGGERS,
    onSubmit: fn(),
    onChange: fn(),
  },
  ...src(`const triggers: TriggerDef[] = [
  {
    char: '@',
    kind: 'mention',
    items: [
      { id: 'alice', label: 'Alice Kim', icon: '/avatars/alice.png' },
      { id: 'bob', label: 'Bob Chen', icon: '/avatars/bob.png' },
    ],
  },
];

<Composer
  placeholder="Type @ to mention someone…"
  triggers={triggers}
  onSubmit={({ text, entities }) => send({ text, entities })}
/>`),
  render: (args: ComposerProps) => (
    <div class="max-w-2xl">
      <Composer {...args} />
    </div>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    // NOTE: full @-menu → select keyboard flow is verified by the IVP
    // userEvent can't reliably drive contenteditable in Storybook browser tests.
    const canvas = within(canvasElement);
    const editable = canvas.getByRole('textbox');
    expect(editable).toBeTruthy();
    expect((editable as HTMLElement).getAttribute('data-placeholder')).toBe('Type @ to mention someone…');
  },
};

// ---------------------------------------------------------------------------
// Prefilled, a doc with an entity pill + trailing text
// ---------------------------------------------------------------------------

const PREFILLED_DOC: ComposerDoc = [
  {
    type: 'entity',
    entity: {
      kind: 'skill',
      id: 'record-replay',
      label: 'Record & Replay',
      icon: SKILL_ICON,
    },
  },
  { type: 'text', text: " I'm going to show y" },
];

/** A pre-populated doc: an entity pill followed by text.
 *  The pill renders as an atomic inline chip and the trailing text is editable. */
export const Prefilled: Story = {
  args: {
    value: PREFILLED_DOC,
    placeholder: 'Ask anything…',
    onSubmit: fn(),
    onChange: fn(),
  },
  ...src(`// Seed the composer with a structured doc: an entity pill + trailing text.
const value: ComposerDoc = [
  { type: 'entity', entity: { kind: 'skill', id: 'record-replay',
    label: 'Record & Replay', icon: skillIcon } },
  { type: 'text', text: " I'm going to show y" },
];

<Composer value={value} onSubmit={({ text, entities }) => send({ text, entities })} />`),
  render: (args: ComposerProps) => (
    <div class="max-w-2xl">
      <Composer {...args} />
    </div>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    // The entity pill must render with the data-kai-entity attribute.
    const pill = canvasElement.querySelector('[data-kai-entity]');
    expect(pill).toBeTruthy();
    // The pill must contain the label text.
    expect(pill!.textContent).toContain('Record & Replay');
    // The trailing text must also be present somewhere in the editable.
    const editable = canvas.getByRole('textbox');
    expect(editable.textContent).toContain("I'm going to show y");
  },
};

// ---------------------------------------------------------------------------
// Highlighted, keyword highlight rules
// ---------------------------------------------------------------------------

/** Keywords matching `highlights` rules are decorated via the CSS Custom
 *  Highlight API (browsers that don't support it simply show plain text). */
export const Highlighted: Story = {
  args: {
    value: 'Please deploy this fix for TICKET-123 and also TICKET-456 soon.',
    highlights: [
      'deploy',
      { pattern: 'TICKET-\\d+', class: 'tok' },
    ],
    placeholder: 'Ask anything…',
    onSubmit: fn(),
    onChange: fn(),
  },
  ...src(`// A highlight rule is a literal string or a { pattern, class } regex rule.
const highlights = [
  'deploy',
  { pattern: 'TICKET-\\\\d+', class: 'tok' },
];

<Composer
  value="Please deploy this fix for TICKET-123 and also TICKET-456 soon."
  highlights={highlights}
  onChange={({ text }) => setDraft(text)}
/>`),
  render: (args: ComposerProps) => (
    <div class="max-w-2xl">
      <Composer {...args} />
    </div>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const editable = canvas.getByRole('textbox');
    expect(editable).toBeTruthy();
    // The text content must include the pre-filled value.
    expect(editable.textContent).toContain('deploy');
    expect(editable.textContent).toContain('TICKET-123');
  },
};
