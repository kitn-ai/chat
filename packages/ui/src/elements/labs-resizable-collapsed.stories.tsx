import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, onSettled, onCleanup } from 'solid-js';
import type { JSX } from '@solidjs/web';
import './register'; // side effect: registers the custom elements
import { attachKaiActions } from '../stories/docs/story-actions';

// The web components are custom DOM elements, so declare the tags for JSX. This
// labs story declares its own intrinsic types (including the new `collapsed`
// boolean) so it can set `collapsed` as a plain JSX boolean, the bug repro.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-resizable': JSX.HTMLAttributes<HTMLElement> & { orientation?: string };
      'kai-resizable-item': JSX.HTMLAttributes<HTMLElement> & {
        size?: string;
        min?: string;
        max?: string;
        locked?: boolean | string;
        hidden?: boolean | string;
        collapsed?: boolean | string;
      };
    }
  }
}

/** A labelled placeholder pane so the layout is visible in stories. */
function Pane(props: { label: string; tone?: 'muted' | 'plain' }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        padding: '16px',
        background: props.tone === 'plain' ? 'transparent' : 'var(--color-muted, #f4f4f5)',
        color: 'var(--color-muted-foreground, #71717a)',
        'font-size': '13px',
      }}
    >
      {props.label}
    </div>
  );
}

/** A bordered, sized frame the group fills. */
function Frame(props: { children: JSX.Element }) {
  return (
    <div
      style={{
        height: '256px',
        width: '100%',
        'max-width': '768px',
        border: '1px solid var(--color-border, #e4e4e7)',
        'border-radius': '8px',
        overflow: 'hidden',
      }}
    >
      {props.children}
    </div>
  );
}

const COLLAPSED_SNIPPET = `<!-- A bare boolean \`collapsed\` collapses the panel at the FIRST render,
     from React / Solid / Vue / Svelte JSX or plain HTML. \`hidden\` does not,
     because a JSX boolean sets neither the \`hidden\` attribute nor the IDL
     property on a custom element, so the parent never sees it and the panel
     renders visible. Use \`collapsed\` for declarative collapse. -->
<kai-resizable orientation="horizontal" style="display:block;height:256px">
  <kai-resizable-item size="28%" min="140px" collapsed> …list… </kai-resizable-item>
  <kai-resizable-item> …chat… </kai-resizable-item>
</kai-resizable>`;

const meta = {
  title: 'Labs/Resizable Collapsed',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Labs: the `collapsed` boolean on `<kai-resizable-item>`. A bare `<kai-resizable-item collapsed>` written in framework JSX (React / Solid / Vue / Svelte) collapses the panel at the **first** render: the panel starts hidden, no imperative `setAttribute` needed. This fixes the bug where `hidden` as a JSX boolean did nothing because it set neither the attribute nor the IDL property on a custom element, so `<kai-resizable>` never saw it and the panel rendered visible.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/**
 * The bug repro: a plain JSX boolean `collapsed` on the first item. The panel must
 * start COLLAPSED at mount; only the Chat panel is visible until you expand it.
 * (Before the fix, `hidden` as a JSX boolean left the panel visible at mount.)
 */
export const CollapsedAtMount: Story = {
  name: 'Collapsed at mount',
  render: () => {
    const [collapsed, setCollapsed] = createSignal(true);
    let groupEl: HTMLElement | undefined;
    // Log the group's declared events (kai-change on drag, kai-maximize-change).
    onSettled(() => {
      if (groupEl) // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return attachKaiActions(groupEl);
    });
    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          style={{
            'align-self': 'flex-start',
            padding: '4px 12px',
            'font-size': '13px',
            border: '1px solid var(--color-border, #e4e4e7)',
            'border-radius': '6px',
            cursor: 'pointer',
          }}
        >
          {collapsed() ? 'Expand list' : 'Collapse list'}
        </button>
        <Frame>
          {/* `collapsed` is a PLAIN JSX boolean, no imperative setAttribute. The
              facade reflects it to the attribute the parent reads, so the panel
              starts collapsed at the very first render. */}
          <kai-resizable orientation="horizontal" ref={(e) => (groupEl = e as HTMLElement)}>
            <kai-resizable-item size="28%" min="140px" collapsed={collapsed()}>
              <Pane label="List" />
            </kai-resizable-item>
            <kai-resizable-item>
              <Pane label="Chat (the list panel starts collapsed)" tone="plain" />
            </kai-resizable-item>
          </kai-resizable>
        </Frame>
      </div>
    );
  },
  parameters: { docs: { source: { code: COLLAPSED_SNIPPET, language: 'html' } } },
};
