import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn } from 'storybook/test';
import { createSignal } from 'solid-js';
import { Paperclip, Github, Sparkles, Globe, Settings, Plus, FileText } from 'lucide-solid';
import {
  Dropdown, DropdownTrigger, DropdownContent, DropdownItem,
  DropdownSeparator, DropdownLabel, DropdownCheckboxItem,
  DropdownSub, DropdownSubTrigger, DropdownSubContent,
} from './dropdown';
import { buttonVariants } from './button';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Dropdown',
  component: Dropdown,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A `role="menu"` for a list of actions, with roving arrow-key focus, type-ahead, and Escape/outside-click dismissal.',
        'Compose `Dropdown` › `DropdownTrigger` + `DropdownContent` › `DropdownItem`. Also exports `DropdownCheckboxItem`, `DropdownSeparator`, `DropdownLabel`, and `DropdownSub*` for nested submenus.',
      ]),
    },
  },
  argTypes: {
    onSelect: {
      action: 'select',
      description: 'Per-item handler (`DropdownItem` / `DropdownCheckboxItem`). Fires the item label when chosen.',
      table: { category: 'Events' },
    },
  },
  args: {
    onSelect: fn(),
  },
  render: (args) => <DropdownDemo onSelect={args.onSelect} />,
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Per-item select handler, surfaced to the Actions panel. Each demo also keeps a
 *  local signal so the UI shows the last selection inline. */
type SelectHandler = (label: string) => void;

const IMPORT = `import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

function DropdownDemo(props: { onSelect?: SelectHandler }) {
  const [last, setLast] = createSignal<string>();
  const select = (label: string) => { setLast(label); props.onSelect?.(label); };
  return (
    <div class="space-y-3">
      <Dropdown>
        <DropdownTrigger class={buttonVariants({ variant: 'outline' })}>Actions ▾</DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => select('Rename')}>Rename</DropdownItem>
          <DropdownItem onSelect={() => select('Duplicate')}>Duplicate</DropdownItem>
          <DropdownItem onSelect={() => select('Archive')}>Archive</DropdownItem>
        </DropdownContent>
      </Dropdown>
      <p class="text-xs text-muted-foreground">Last selected: {last() ?? '—'}</p>
    </div>
  );
}

/** Click the trigger (or focus it and press ↓ / Enter) to open the menu; Arrow keys move, Escape closes. */
export const Playground: Story = {
  ...src(`<Dropdown>
  <DropdownTrigger class={buttonVariants({ variant: 'outline' })}>Actions ▾</DropdownTrigger>
  <DropdownContent>
    <DropdownItem onSelect={() => rename()}>Rename</DropdownItem>
    <DropdownItem onSelect={() => duplicate()}>Duplicate</DropdownItem>
    <DropdownItem onSelect={() => archive()}>Archive</DropdownItem>
  </DropdownContent>
</Dropdown>`),
};

const CASCADE_IMPORT = `import {
  Dropdown, DropdownTrigger, DropdownContent, DropdownItem,
  DropdownLabel, DropdownSeparator, DropdownCheckboxItem,
  DropdownSub, DropdownSubTrigger, DropdownSubContent,
} from '@kitn.ai/ui/solid';`;

function CascadingMenuDemo(props: { onSelect?: SelectHandler }) {
  const [webSearch, setWebSearch] = createSignal(true);
  const [last, setLast] = createSignal<string>();
  const select = (label: string) => { setLast(label); props.onSelect?.(label); };
  const toggleWebSearch = () => { setWebSearch((v) => !v); props.onSelect?.(`Web search: ${webSearch() ? 'on' : 'off'}`); };
  return (
    <div class="space-y-3">
      <Dropdown>
        <DropdownTrigger
          class={buttonVariants({ variant: 'outline', size: 'icon' })}
          aria-label="Add"
        >
          <Plus class="h-4 w-4" />
        </DropdownTrigger>
        <DropdownContent class="min-w-[15rem]">
          <DropdownLabel>Actions</DropdownLabel>
          <DropdownItem onSelect={() => select('Add files or photos')}>
            <Paperclip class="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            Add files or photos
            <span class="ml-auto pl-4 text-xs tracking-widest text-muted-foreground">⌘U</span>
          </DropdownItem>
          <DropdownItem onSelect={() => select('Add from GitHub')}>
            <Github class="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            Add from GitHub
          </DropdownItem>
          <DropdownSub>
            <DropdownSubTrigger>
              <Sparkles class="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              Skills
            </DropdownSubTrigger>
            <DropdownSubContent class="min-w-[12rem]">
              <DropdownItem onSelect={() => select('skill-creator')}>
                <Sparkles class="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                skill-creator
              </DropdownItem>
              <DropdownItem onSelect={() => select('Manage skills')}>
                <Settings class="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                Manage skills
              </DropdownItem>
              <DropdownItem onSelect={() => select('Add skill')}>
                <FileText class="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                Add skill
              </DropdownItem>
            </DropdownSubContent>
          </DropdownSub>
          <DropdownSeparator />
          <DropdownCheckboxItem checked={webSearch()} onSelect={toggleWebSearch}>
            <Globe class="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            Web search
          </DropdownCheckboxItem>
        </DropdownContent>
      </Dropdown>
      <p class="text-xs text-muted-foreground">
        Last action: {last() ?? '—'} · Web search: {webSearch() ? 'on' : 'off'}
      </p>
    </div>
  );
}

/**
 * The composer's Plus action menu: a section `DropdownLabel`, items with leading
 * icons + a trailing keyboard-shortcut span, a `DropdownSub` ("Skills") that
 * opens a nested menu on hover / ArrowRight, a `DropdownSeparator`, and a
 * `DropdownCheckboxItem` ("Web search") that toggles in place without closing.
 */
export const CascadingMenu: Story = {
  render: (args: { onSelect?: SelectHandler }) => <CascadingMenuDemo onSelect={args.onSelect} />,
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: `${CASCADE_IMPORT}

<Dropdown>
  <DropdownTrigger aria-label="Add"><Plus /></DropdownTrigger>
  <DropdownContent>
    <DropdownLabel>Actions</DropdownLabel>
    <DropdownItem onSelect={addFiles}>
      <Paperclip /> Add files or photos
      <span class="ml-auto text-xs text-muted-foreground">⌘U</span>
    </DropdownItem>
    <DropdownItem onSelect={addFromGitHub}><Github /> Add from GitHub</DropdownItem>
    <DropdownSub>
      <DropdownSubTrigger><Sparkles /> Skills</DropdownSubTrigger>
      <DropdownSubContent>
        <DropdownItem onSelect={() => run('skill-creator')}>skill-creator</DropdownItem>
        <DropdownItem onSelect={manageSkills}>Manage skills</DropdownItem>
        <DropdownItem onSelect={addSkill}>Add skill</DropdownItem>
      </DropdownSubContent>
    </DropdownSub>
    <DropdownSeparator />
    <DropdownCheckboxItem checked={webSearch()} onSelect={() => setWebSearch((v) => !v)}>
      <Globe /> Web search
    </DropdownCheckboxItem>
  </DropdownContent>
</Dropdown>`,
      },
    },
  },
};
