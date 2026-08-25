import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onSettled, onCleanup } from 'solid-js';
import './register'; // side effect: registers <kai-prompt-input> et al.
import { attachKaiActions } from '../stories/docs/story-actions';
import type { AttachmentData } from '../components/attachments';

// Wire a kai-* element's declared CustomEvents to the Actions panel from a `ref`.
const withActions = (e: Element) => onSettled(() => { // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return attachKaiActions(e as HTMLElement); }); // V2-PORT (R2): braced — a non-function return crashes dev

// Labs: the <kai-prompt-input> composition slots. Dogfoods real kit components
// where they fit: a <kai-notice> above the card, a <kai-attachments> row (with
// hover-card previews) in the input-top slot, a <kai-button> in the toolbar. All
// on the kit's theme tokens, so it reads correctly in light and dark and doubles
// as a copy-paste reference. Content ABOVE the card is your own layout, not a
// slot: only the holes you can't reach from outside (inside the card / toolbar)
// are slots. Component events log to the Actions panel.

declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-prompt-input': JSX.HTMLAttributes<HTMLElement> & { theme?: string; placeholder?: string; loading?: boolean; disabled?: boolean; voice?: boolean; 'web-search'?: boolean; attach?: boolean; submit?: string; 'suggestion-mode'?: string };
      'kai-notice': JSX.HTMLAttributes<HTMLElement> & { severity?: string; icon?: string; dismissible?: boolean };
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-attachments': JSX.HTMLAttributes<HTMLElement> & { variant?: string };
    }
  }
}

type AttachmentsEl = HTMLElement & {
  items?: AttachmentData[];
  hoverCard?: boolean;
  removable?: boolean;
  showMediaType?: boolean;
};

// A couple of attached files for the input-top row. The image carries a `url`,
// so its hover-card shows a real preview; the PDF shows type + name.
const attachmentItems: AttachmentData[] = [
  { id: 'a1', type: 'file', filename: 'architecture.png', mediaType: 'image/png', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop' },
  { id: 'a2', type: 'file', filename: 'q3-report.pdf', mediaType: 'application/pdf' },
];

const meta = {
  title: 'Labs/Prompt Input Slots',
  parameters: { layout: 'padded' },
} satisfies Meta;
export default meta;
type Story = StoryObj;

// ── 1. SLOTS: input-top + toolbar-start + toolbar-end projected in. The notice
//    above the card is the consumer's OWN layout (a sibling div), NOT a slot:
//    outer content is light DOM you already control. Only the holes you can't
//    reach from outside (inside the card / toolbar) are slots. ─────────────────
export const Slots: Story = {
  name: 'Add toolbar & input content',
  render: () => (
    <div>
      {/* Above the card = your own layout, not a slot. Dogfood <kai-notice>. */}
      <kai-notice severity="warning" dismissible style={{ display: 'block', 'margin-bottom': '8px' }} ref={withActions}>
        Model X is unavailable.
        <a slot="action" href="#" style="color:var(--color-foreground);font-weight:600">Learn more</a>
      </kai-notice>
      <kai-prompt-input style={{ display: 'block' }} ref={withActions}>
        {/* input-top: attached files above the textarea; dogfood <kai-attachments>
            with hover-card previews. Hover a chip to preview; × removes it. */}
        <kai-attachments
          slot="input-top"
          variant="inline"
          style="display:block;margin:8px 8px 0"
          ref={(e) => {
            const el = e as AttachmentsEl;
            el.items = attachmentItems;
            el.hoverCard = true;
            el.removable = true;
            el.showMediaType = true;
            // Log every declared event (kai-remove) to the Actions panel.
            withActions(el);
          }}
        />
        {/* toolbar-start: a kit button, before the textarea controls. */}
        <kai-button slot="toolbar-start" variant="subtle" size="icon" icon="plus" label="Open menu" ref={withActions} />
        {/* toolbar-end: trailing controls, before the Send button. */}
        <span
          slot="toolbar-end"
          style="display:inline-flex;align-items:center;padding:0 10px;height:30px;font:12px/1 system-ui;color:var(--color-muted-foreground)"
        >
          Opus 4.8
        </span>
      </kai-prompt-input>
    </div>
  ),
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<!-- Content ABOVE the card is your own layout (a sibling), not a slot. -->
<kai-notice severity="warning" dismissible>
  Model X is unavailable. <a slot="action" href="#">Learn more</a>
</kai-notice>

<kai-prompt-input>
  <!-- attached files, with hover-card previews, above the textarea -->
  <kai-attachments slot="input-top" variant="inline" hover-card removable show-media-type></kai-attachments>
  <kai-button slot="toolbar-start" variant="subtle" size="icon" icon="plus" label="Open menu"></kai-button>
  <span slot="toolbar-end">Opus 4.8</span>
</kai-prompt-input>

<script type="module">
  // Array/object props are set as JS properties, never attributes.
  document.querySelector('kai-attachments').items = [
    { id: 'a1', type: 'file', filename: 'architecture.png', mediaType: 'image/png', url: '/architecture.png' },
  ];
  document.querySelector('kai-attachments')
    .addEventListener('kai-remove', (e) => console.log('removed', e.detail));
</script>`,
      },
    },
  },
};

// ── 2. DROP-IN: no slots projected → regression baseline (toolbar must start
//    cleanly at the attach button, no phantom gap). ───────────────────────────
export const DropIn: Story = {
  name: 'Defaults (no slots)',
  render: () => (
    <kai-prompt-input style={{ display: 'block' }} ref={withActions} />
  ),
  parameters: {
    docs: {
      source: { language: 'html', code: `<kai-prompt-input></kai-prompt-input>` },
    },
  },
};
