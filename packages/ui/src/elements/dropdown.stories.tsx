import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import './register'; // side effect: registers all kai-* custom elements (incl. kai-dropdown)
import { attachKaiActions } from '../stories/docs/story-actions';

// Declare the custom element tag for SolidJS JSX.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-dropdown': JSX.HTMLAttributes<HTMLElement> & {
        theme?: string;
        'trigger-icon'?: string;
        'trigger-label'?: string;
        'trigger-icon-trailing'?: string;
        label?: string;
        full?: boolean;
        open?: boolean;
        'default-open'?: boolean;
        disabled?: boolean;
      };
    }
  }
}

const meta = {
  title: 'Labs/Dropdown',
  parameters: { layout: 'padded' },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/**
 * The sibling of `kai-menu`, split by who owns the body. `kai-menu` renders a JSON
 * `items` tree; `kai-dropdown` hands you the surface and projects whatever you slot
 * into it — the shape a framework consumer needs when the rows are their own
 * components rather than data.
 *
 * Rows carry `role="menuitem"`, so the surface is a real menu to assistive tech and
 * they join roving focus: ArrowUp/Down, Home/End and typeahead all reach them even
 * though they are slotted light DOM.
 */
export const SlottedRows: Story = {
  render: () => (
    <kai-dropdown
      label="Row actions"
      ref={(el: HTMLElement) => attachKaiActions(el, 'kai-dropdown')}
    >
      <span slot="trigger" aria-hidden="true">&#8942;</span>
      <div role="menuitem" tabindex="-1" style={{ padding: '6px 8px', cursor: 'pointer' }}>Rename</div>
      <div role="menuitem" tabindex="-1" style={{ padding: '6px 8px', cursor: 'pointer' }}>Duplicate</div>
      <div role="separator" style={{ height: '1px', margin: '4px -4px', background: 'var(--color-border)' }} />
      <div role="menuitem" tabindex="-1" style={{ padding: '6px 8px', cursor: 'pointer', color: 'var(--color-destructive)' }}>Delete</div>
    </kai-dropdown>
  ),
};

/**
 * A labelled trigger with a trailing chevron — the "select" look. The visible
 * `trigger-label` IS the accessible name, so `label` is deliberately absent here
 * (an accessible name that does not contain the visible text is unreachable by
 * speech input; WCAG 2.5.3).
 */
export const LabelledTrigger: Story = {
  render: () => (
    <kai-dropdown
      trigger-label="Sort by"
      trigger-icon-trailing="chevron-down"
      ref={(el: HTMLElement) => attachKaiActions(el, 'kai-dropdown')}
    >
      <button type="button" role="menuitem" style={{ display: 'block', width: '100%', padding: '6px 8px', 'text-align': 'left' }}>Newest</button>
      <button type="button" role="menuitem" style={{ display: 'block', width: '100%', padding: '6px 8px', 'text-align': 'left' }}>Oldest</button>
      <button type="button" role="menuitem" style={{ display: 'block', width: '100%', padding: '6px 8px', 'text-align': 'left' }}>Name</button>
    </kai-dropdown>
  ),
};
