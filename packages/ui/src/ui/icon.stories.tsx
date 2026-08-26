import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { For } from 'solid-js';
import { renderIcon, ICON_NAMES } from './icon';
import { componentDescription } from '../stories/docs/element-controls';

// ICON_NAMES is DERIVED from NAMED_ICONS (src/ui/icon.tsx). It used to be a
// hand-typed copy here, and it had already drifted: thirteen registered names
// (the git, theme and list-action glyphs) were missing from the control and the
// gallery, so icons that shipped were invisible to anyone browsing for them.
const NAMES = [...ICON_NAMES];

type IconArgs = { name: string; size: 'sm' | 'md' | 'lg' };
const SIZE: Record<string, string> = { sm: 'size-4', md: 'size-5', lg: 'size-7' };

const meta = {
  title: 'Components/Primitives/Icon',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        '`renderIcon(name, opts)` resolves an item icon. A curated name maps to a lucide-solid glyph; a URL, path, or data URI renders an `<img>`; anything else renders as text. Used for `kai-menu` / `kai-command` item icons, and exposed as the web component `<kai-icon name="...">`.',
      ]),
    },
  },
  argTypes: {
    name: {
      control: 'select',
      options: NAMES,
      description: 'A curated icon name from `NAMED_ICONS`.',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Sizing applied via the `class` option (`size-4` / `size-5` / `size-7`).',
      table: { defaultValue: { summary: 'md' } },
    },
  },
  args: {
    name: 'sparkles',
    size: 'md',
  },
  // The call MUST sit inside JSX. `renderIcon` is a plain function that reads
  // its argument eagerly; only a JSX expression container gets compiled into a
  // tracked `insert`, and the Storybook Solid renderer runs the story body once
  // (untracked) and then relies on those inserts. Returning the call directly is
  // what made the `name` control need a "reload story" to take effect. Pinned by
  // icon.test.tsx.
  render: (args) => (
    <span class="inline-flex text-foreground">
      {renderIcon(args.name, { class: `${SIZE[args.size] ?? 'size-5'} text-foreground` })}
    </span>
  ),
} satisfies Meta<IconArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

// `renderIcon` is a helper, not a component. The web-component equivalent is
// `<kai-icon name="...">`, noted in the snippets below.
const IMPORT = `import { renderIcon } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: pick a name and a size. */
export const Playground: Story = {
  ...src(`renderIcon('sparkles', { class: 'size-5' })\n\n// Web component: <kai-icon name="sparkles" />`),
};

/** The full curated set. Pass any of these names to `renderIcon`. */
export const Curated: Story = {
  render: () => (
    <div class="grid grid-cols-3 gap-3 sm:grid-cols-5">
      <For each={NAMES}>
        {(name) => (
          <div class="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-center">
            {renderIcon(name, { class: 'size-5 text-foreground' })}
            <span class="text-xs text-muted-foreground">{name}</span>
          </div>
        )}
      </For>
    </div>
  ),
  ...src(`renderIcon('paperclip', { class: 'size-5' })\nrenderIcon('globe', { class: 'size-5' })\nrenderIcon('code', { class: 'size-5' })`),
};

/** Size is set through the `class` option. */
export const Sizing: Story = {
  render: () => (
    <div class="flex items-end gap-5 text-foreground">
      {renderIcon('sparkles', { class: 'size-4' })}
      {renderIcon('sparkles', { class: 'size-5' })}
      {renderIcon('sparkles', { class: 'size-7' })}
      {renderIcon('sparkles', { class: 'size-10' })}
    </div>
  ),
  ...src(`renderIcon('sparkles', { class: 'size-4' })\nrenderIcon('sparkles', { class: 'size-7' })\nrenderIcon('sparkles', { class: 'size-10' })`),
};

/**
 * Fallbacks: an unknown name that looks like a URL / data URI renders an `<img>`;
 * any other string (an emoji, say) renders as text.
 */
export const Fallbacks: Story = {
  render: () => {
    const avatar =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="10" fill="%23d6409f"/></svg>';
    return (
      <div class="flex items-center gap-5 text-foreground">
        <div class="flex flex-col items-center gap-2 text-center">
          {renderIcon(avatar, { class: 'size-5 rounded-full' })}
          <span class="text-xs text-muted-foreground">URL / data URI</span>
        </div>
        <div class="flex flex-col items-center gap-2 text-center">
          {renderIcon('🐱', { class: 'size-5 text-base leading-none' })}
          <span class="text-xs text-muted-foreground">text / emoji</span>
        </div>
      </div>
    );
  },
  ...src(`renderIcon('https://example.com/avatar.png', { class: 'size-5 rounded-full' })\nrenderIcon('🐱', { class: 'size-5' })`),
};
