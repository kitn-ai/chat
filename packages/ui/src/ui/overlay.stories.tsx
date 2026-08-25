import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show } from 'solid-js';
import { Portal } from '@solidjs/web';
import { createPresence, usePosition, useDismiss } from './overlay';
import { buttonVariants } from './button';

/**
 * `overlay.tsx` is not a component; it's the small DIY toolkit that every
 * floating surface in the kit (Tooltip, HoverCard, Dropdown) is built from,
 * replacing the former third-party UI dependency. Three primitives:
 *
 * - `usePosition(ref, floating, opts)`: anchors `floating` to `ref` via
 *   @floating-ui/dom with flip/shift, tracking it on scroll/resize.
 * - `createPresence(open)`: keeps a node mounted through its CSS exit
 *   animation, then unmounts on `animationend`.
 * - `useDismiss({ enabled, onDismiss, refs })`: Escape + outside-pointerdown
 *   dismissal (no scroll lock).
 *
 * Plus an `As` polymorphic helper for trigger elements.
 */
const meta: Meta = {
  title: 'Components/Primitives/Overlay Core',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'The hooks toolkit (not a renderable component) behind `Tooltip`, `HoverCard`, and `Dropdown`. `usePosition(ref, floating, opts)` anchors a node via `@floating-ui/dom`; `createPresence(open)` keeps it mounted through its CSS exit animation; and `useDismiss({ enabled, onDismiss, refs })` handles Escape + outside-click. An `As` helper renders a polymorphic trigger.',
          'Reach for `Tooltip` / `HoverCard` / `Dropdown` first; use these only for a floating surface they don\'t cover.',
        ].join('\n\n'),
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function PopoverDemo() {
  const [open, setOpen] = createSignal(false);
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const [content, setContent] = createSignal<HTMLElement>();
  const presence = createPresence(open);
  const position = usePosition(trigger, content, { placement: 'bottom-start', gutter: 6 });
  useDismiss({ enabled: open, onDismiss: () => setOpen(false), refs: () => [trigger(), content()] });

  return (
    <>
      <button
        ref={setTrigger}
        type="button"
        class={buttonVariants({ variant: 'outline' })}
        onClick={() => setOpen(!open())}
      >
        {open() ? 'Close' : 'Open'} popover
      </button>
      <Show when={presence.present()}>
        <Portal>
          <div
            ref={(el) => { setContent(el); presence.setRef(el); }}
            data-expanded={presence.state() === 'open' ? '' : undefined}
            data-closed={presence.state() === 'closed' ? '' : undefined}
            style={{ position: 'fixed', left: `${position.pos().x}px`, top: `${position.pos().y}px` }}
            class="z-50 w-64 rounded-lg bg-card p-3 text-sm text-foreground shadow-lg animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95"
          >
            Positioned by <code class="text-xs">usePosition</code>, kept mounted through its
            exit animation by <code class="text-xs">createPresence</code>, and closed on
            Escape / outside-click by <code class="text-xs">useDismiss</code>.
          </div>
        </Portal>
      </Show>
    </>
  );
}

/** A minimal popover hand-built from the three overlay primitives. Click to toggle; click outside or press Escape to dismiss. */
export const MinimalPopover: Story = {
  render: () => <PopoverDemo />,
  parameters: {
    docs: {
      source: {
        code: `import { createPresence, usePosition, useDismiss } from '@kitn.ai/ui/solid';

function PopoverDemo() {
  const [open, setOpen] = createSignal(false);
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const [content, setContent] = createSignal<HTMLElement>();
  const presence = createPresence(open);
  const position = usePosition(trigger, content, { placement: 'bottom-start', gutter: 6 });
  useDismiss({ enabled: open, onDismiss: () => setOpen(false), refs: () => [trigger(), content()] });

  return (
    <>
      <button ref={setTrigger} onClick={() => setOpen(!open())}>Toggle</button>
      <Show when={presence.present()}>
        <Portal>
          <div
            ref={(el) => { setContent(el); presence.setRef(el); }}
            style={{ position: 'fixed', left: \`\${position.pos().x}px\`, top: \`\${position.pos().y}px\` }}
          >
            …content…
          </div>
        </Portal>
      </Show>
    </>
  );
}`,
        language: 'tsx',
      },
    },
  },
};
