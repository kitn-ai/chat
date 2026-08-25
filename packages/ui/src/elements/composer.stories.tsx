import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onSettled, onCleanup } from 'solid-js';
import './register'; // side effect: registers all kai-* custom elements (incl. kai-composer)
import { attachKaiActions } from '../stories/docs/story-actions';
import type { TriggerDef } from '../components/composer';
import type { ComposerDoc } from '../primitives/composer-model';
import { expect } from 'storybook/test';
import { specDescription } from '../stories/docs/element-controls';

// The web components are custom DOM elements, declare the tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-composer': JSX.HTMLAttributes<HTMLElement> & {
        placeholder?: string;
        disabled?: boolean;
        loading?: boolean;
        'max-height'?: number | string;
        'submit-on-enter'?: boolean;
      };
    }
  }
}

interface ComposerEl extends HTMLElement {
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  maxHeight?: number | string;
  submitOnEnter?: boolean;
  triggers?: TriggerDef[];
  highlights?: unknown[];
  value?: string | ComposerDoc;
}

// Minimal inline data: URI icon, a plain colored square with a glyph.
function imgData(fill: string, glyph: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="4" fill="${fill}"/><text x="16" y="22" font-size="16" text-anchor="middle" fill="white">${glyph}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const SKILL_ICON = imgData('#7c3aed', '▶');

const HTML_SNIPPET = `<!-- Works in any framework or plain HTML -->
<kai-composer id="composer" style="display:block; width:100%;"></kai-composer>

<script type="module">
  import '@kitn.ai/ui/elements'; // registers the custom elements

  const composer = document.getElementById('composer');
  composer.placeholder = 'Ask anything…';
  composer.triggers = [
    {
      char: '/',
      kind: 'skill',
      items: [
        { id: 'summarize', label: 'Summarize' },
        { id: 'translate', label: 'Translate' },
      ],
    },
  ];

  // Events are CustomEvents on the element (non-bubbling).
  composer.addEventListener('kai-submit', (e) => console.log('submit:', e.detail));
  composer.addEventListener('kai-value-change', (e) => console.log('change:', e.detail));
</script>`;

const meta = {
  title: 'Test Fixtures/Composer',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: specDescription('kai-composer', [
        '`<kai-composer>` is a framework-agnostic **web component** for rich prompt input. It types like a plain textarea but supports atomic inline entity pills (skills, mentions) via `/` and `@` trigger menus, keyword highlighting via the CSS Custom Highlight API, and emits a structured `{ doc, text, entities }` payload.',
        '**When to use:** any non-Solid app (React, Vue, Svelte, plain HTML) that needs a prompt input with entity-pill support.',
        '**How to use:** register once with `import \'@kitn.ai/ui/elements\'`. Set **JS properties** for `triggers`, `value`, and `highlights` (arrays/objects). Scalars (`placeholder`, `disabled`, `loading`) work as attributes. Listen for **CustomEvents** (`kai-submit`, `kai-value-change`, `kai-entity-add`, `kai-entity-remove`, `kai-trigger`, `kai-trigger-close`) directly on the element.',
        '**Not an RTE**: no bold/italic. Entity pills are the only non-text nodes; the content surface is `contenteditable="plaintext-only"`.',
      ]),
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Default
// ---------------------------------------------------------------------------

/** The element used the plain-HTML / any-framework way. */
export const Default: Story = {
  render: () => {
    let el: ComposerEl | undefined;
    // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
    // and register them once at the owner scope (same lifecycle as 1.x).
    const settledDisposers: (() => void)[] = [];
    onCleanup(() => { for (const d of settledDisposers) d(); });
    onSettled(() => {
      if (!el) return;
      el.placeholder = 'Ask anything…';
      // Log every declared CustomEvent (kai-submit, kai-value-change, kai-trigger, …).
      settledDisposers.push(attachKaiActions(el));
    });
    return (
      <div style={{ padding: '16px', width: '100%' }}>
        <kai-composer
          ref={(e: HTMLElement) => (el = e as ComposerEl)}
          style={{ display: 'block', width: '100%' }}
        />
      </div>
    );
  },
  parameters: { docs: { source: { code: HTML_SNIPPET, language: 'html' } } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    // kai-composer renders into a Shadow Root, we must pierce it.
    const host = canvasElement.querySelector('kai-composer') as HTMLElement | null;
    expect(host).toBeTruthy();
    const shadow = (host as HTMLElement).shadowRoot;
    expect(shadow).toBeTruthy();
    // The editable surface must be inside the shadow root.
    const editable = shadow!.querySelector('[data-kai-composer-editable]');
    expect(editable).toBeTruthy();
  },
};

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const SKILL_SNIPPET = `<kai-composer id="composer" style="display:block; width:100%;"></kai-composer>

<script type="module">
  import '@kitn.ai/ui/elements';

  const composer = document.getElementById('composer');
  composer.placeholder = 'Type / to pick a skill…';
  composer.triggers = [{
    char: '/',
    kind: 'skill',
    items: [
      { id: 'record-replay', label: 'Record & Replay', promptText: 'Use the Record & Replay skill.' },
      { id: 'summarize', label: 'Summarize' },
    ],
  }];

  composer.addEventListener('kai-submit', (e) => console.log('submit:', e.detail));
</script>`;

/** Type `/` to open the skill picker. Select an item to insert a pill. */
export const Skills: Story = {
  render: () => {
    let el: ComposerEl | undefined;
    // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
    // and register them once at the owner scope (same lifecycle as 1.x).
    const settledDisposers2: (() => void)[] = [];
    onCleanup(() => { for (const d of settledDisposers2) d(); });
    onSettled(() => {
      if (!el) return;
      el.placeholder = 'Type / to pick a skill…';
      el.triggers = [
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
            { id: 'summarize', label: 'Summarize' },
          ],
        },
      ];
      // Log every declared CustomEvent (kai-submit, kai-trigger, kai-entity-add, …).
      settledDisposers2.push(attachKaiActions(el));
    });
    return (
      <div style={{ padding: '16px', width: '100%' }}>
        <kai-composer
          ref={(e: HTMLElement) => (el = e as ComposerEl)}
          style={{ display: 'block', width: '100%' }}
        />
      </div>
    );
  },
  parameters: { docs: { source: { code: SKILL_SNIPPET, language: 'html' } } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    // NOTE: full /-menu → select → backspace keyboard flow is verified by the
    // IVP (tests/e2e/composer-ivp.spec.ts), not here, userEvent can't reliably
    // drive contenteditable selection in this harness (focus races, synthetic
    // input events don't update the DOM the same way a real key sequence does).
    //
    // What we assert: the element is upgraded and the editable is in its shadow root.
    const host = canvasElement.querySelector('kai-composer') as HTMLElement | null;
    expect(host).toBeTruthy();
    const shadow = (host as HTMLElement).shadowRoot;
    expect(shadow).toBeTruthy();
    const editable = shadow!.querySelector('[data-kai-composer-editable]');
    expect(editable).toBeTruthy();
  },
};

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

const MENTION_SNIPPET = `<kai-composer id="composer" style="display:block; width:100%;"></kai-composer>

<script type="module">
  import '@kitn.ai/ui/elements';

  const composer = document.getElementById('composer');
  composer.placeholder = 'Type @ to mention someone…';
  composer.triggers = [{
    char: '@',
    kind: 'mention',
    items: [
      { id: 'alice', label: 'Alice Kim' },
      { id: 'bob', label: 'Bob Chen' },
    ],
  }];

  composer.addEventListener('kai-submit', (e) => console.log('submit:', e.detail));
</script>`;

/** Type `@` to mention a collaborator. */
export const Mentions: Story = {
  render: () => {
    let el: ComposerEl | undefined;
    // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
    // and register them once at the owner scope (same lifecycle as 1.x).
    const settledDisposers3: (() => void)[] = [];
    onCleanup(() => { for (const d of settledDisposers3) d(); });
    onSettled(() => {
      if (!el) return;
      el.placeholder = 'Type @ to mention someone…';
      el.triggers = [
        {
          char: '@',
          kind: 'mention',
          items: [
            { id: 'alice', label: 'Alice Kim', icon: imgData('#0369a1', 'A') },
            { id: 'bob', label: 'Bob Chen', icon: imgData('#0f766e', 'B') },
          ],
        },
      ];
      // Log every declared CustomEvent (kai-submit, kai-trigger, kai-entity-add, …).
      settledDisposers3.push(attachKaiActions(el));
    });
    return (
      <div style={{ padding: '16px', width: '100%' }}>
        <kai-composer
          ref={(e: HTMLElement) => (el = e as ComposerEl)}
          style={{ display: 'block', width: '100%' }}
        />
      </div>
    );
  },
  parameters: { docs: { source: { code: MENTION_SNIPPET, language: 'html' } } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    // NOTE: @-menu keyboard flow deferred to IVP, userEvent can't reliably
    // drive contenteditable selection in this harness.
    const host = canvasElement.querySelector('kai-composer') as HTMLElement | null;
    expect(host).toBeTruthy();
    const shadow = (host as HTMLElement).shadowRoot;
    expect(shadow).toBeTruthy();
    const editable = shadow!.querySelector('[data-kai-composer-editable]');
    expect(editable).toBeTruthy();
  },
};

// ---------------------------------------------------------------------------
// Prefilled
// ---------------------------------------------------------------------------

const PREFILLED_SNIPPET = `<kai-composer id="composer" style="display:block; width:100%;"></kai-composer>

<script type="module">
  import '@kitn.ai/ui/elements';

  const composer = document.getElementById('composer');
  composer.value = [
    {
      type: 'entity',
      entity: { kind: 'skill', id: 'record-replay', label: 'Record & Replay' },
    },
    { type: 'text', text: " I'm going to show y" },
  ];

  composer.addEventListener('kai-submit', (e) => console.log('submit:', e.detail));
</script>`;

/** Pre-populate via the `value` property: a doc containing an entity pill
 *  followed by text. The pill renders as an atomic inline chip. */
export const Prefilled: Story = {
  render: () => {
    let el: ComposerEl | undefined;
    // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
    // and register them once at the owner scope (same lifecycle as 1.x).
    const settledDisposers4: (() => void)[] = [];
    onCleanup(() => { for (const d of settledDisposers4) d(); });
    onSettled(() => {
      if (!el) return;
      el.value = [
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
      // Log every declared CustomEvent (kai-submit, kai-value-change, …).
      settledDisposers4.push(attachKaiActions(el));
    });
    return (
      <div style={{ padding: '16px', width: '100%' }}>
        <kai-composer
          ref={(e: HTMLElement) => (el = e as ComposerEl)}
          style={{ display: 'block', width: '100%' }}
        />
      </div>
    );
  },
  parameters: { docs: { source: { code: PREFILLED_SNIPPET, language: 'html' } } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    // kai-composer renders into Shadow DOM, pierce the root to assert structure.
    const host = canvasElement.querySelector('kai-composer') as HTMLElement | null;
    expect(host).toBeTruthy();
    const shadow = (host as HTMLElement).shadowRoot;
    expect(shadow).toBeTruthy();
    // The entity pill must render with the data-kai-entity attribute.
    const pill = shadow!.querySelector('[data-kai-entity]');
    expect(pill).toBeTruthy();
    // The pill must contain the label text.
    expect(pill!.textContent).toContain('Record & Replay');
    // The trailing text must be present in the editable.
    const editable = shadow!.querySelector('[data-kai-composer-editable]') as HTMLElement | null;
    expect(editable).toBeTruthy();
    expect(editable!.textContent).toContain("I'm going to show y");
  },
};

// ---------------------------------------------------------------------------
// Pill kinds (decoration per kind)
// ---------------------------------------------------------------------------

/** All three pill skins in one field, seeded via a doc `value`: skills and
 *  agents render LIGHT (decorated inline text led by their sigil: `/`, `@`),
 *  while a plugin renders as a richer chip (it bundles tools/skills/agents, so
 *  it reads differently at a glance). */
export const PillKinds: Story = {
  name: 'Pill kinds (skill / agent / plugin)',
  render: () => {
    let el: ComposerEl | undefined;
    // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
    // and register them once at the owner scope (same lifecycle as 1.x).
    const settledDisposers5: (() => void)[] = [];
    onCleanup(() => { for (const d of settledDisposers5) d(); });
    onSettled(() => {
      if (!el) return;
      el.value = [
        { type: 'text', text: 'Review ' },
        // Capitalized labels on purpose: the pill DISPLAY lowercases them (CSS),
        // while the entity label + emitted payload keep the original casing.
        { type: 'entity', entity: { kind: 'skill', id: 'record-replay', label: 'Record-Replay' } },
        { type: 'text', text: ' then ask ' },
        { type: 'entity', entity: { kind: 'agent', id: 'code-reviewer', label: 'Code-Reviewer' } },
        { type: 'text', text: ' to use ' },
        { type: 'entity', entity: { kind: 'plugin', id: 'documents', label: 'Documents', icon: imgData('#2563eb', 'D') } },
        { type: 'text', text: ' on this PR.' },
      ];
      // Log every declared CustomEvent (kai-submit, kai-entity-remove, …).
      settledDisposers5.push(attachKaiActions(el));
    });
    return (
      <div style={{ padding: '16px', width: '100%' }}>
        <kai-composer
          ref={(e: HTMLElement) => (el = e as ComposerEl)}
          style={{ display: 'block', width: '100%' }}
        />
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Highlighted
// ---------------------------------------------------------------------------

const HIGHLIGHT_SNIPPET = `<kai-composer id="composer" style="display:block; width:100%;"></kai-composer>

<script type="module">
  import '@kitn.ai/ui/elements';

  const composer = document.getElementById('composer');
  composer.value = 'Please deploy this fix for TICKET-123 and TICKET-456 soon.';
  composer.highlights = [
    'deploy',
    { pattern: 'TICKET-\\\\d+', class: 'tok' },
  ];
</script>`;

/** Keywords matching `highlights` rules are decorated via the CSS Custom
 *  Highlight API (browsers that don't support it show plain text). */
export const Highlighted: Story = {
  render: () => {
    let el: ComposerEl | undefined;
    // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
    // and register them once at the owner scope (same lifecycle as 1.x).
    const settledDisposers6: (() => void)[] = [];
    onCleanup(() => { for (const d of settledDisposers6) d(); });
    onSettled(() => {
      if (!el) return;
      el.value = 'Please deploy this fix for TICKET-123 and TICKET-456 soon.';
      el.highlights = [
        'deploy',
        { pattern: 'TICKET-\\d+', class: 'tok' },
      ];
      // Log every declared CustomEvent (kai-submit, kai-value-change, …).
      settledDisposers6.push(attachKaiActions(el));
    });
    return (
      <div style={{ padding: '16px', width: '100%' }}>
        <kai-composer
          ref={(e: HTMLElement) => (el = e as ComposerEl)}
          style={{ display: 'block', width: '100%' }}
        />
      </div>
    );
  },
  parameters: { docs: { source: { code: HIGHLIGHT_SNIPPET, language: 'html' } } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const host = canvasElement.querySelector('kai-composer') as HTMLElement | null;
    expect(host).toBeTruthy();
    const shadow = (host as HTMLElement).shadowRoot;
    expect(shadow).toBeTruthy();
    const editable = shadow!.querySelector('[data-kai-composer-editable]') as HTMLElement | null;
    expect(editable).toBeTruthy();
    expect(editable!.textContent).toContain('deploy');
    expect(editable!.textContent).toContain('TICKET-123');
  },
};
