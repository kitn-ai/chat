import type { Meta, StoryObj, Decorator } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { Monitor, Sun, Moon, X, ChevronLeft } from 'lucide-solid';
import { SettingsGroup, SettingItem } from './settings-group';
import { Segmented } from './segmented';
import { Switch } from './switch';
import { Select } from './select';
import { Nav, type KaiNavItem } from './nav';
import { componentDescription } from '../stories/docs/element-controls';

// --- A composed SETTINGS SCREEN ------------------------------------------
//
// This is a standalone example, not a primitive: it ASSEMBLES the building
// blocks (`Nav`, `SettingsGroup`/`SettingItem`, `Segmented`, `Switch`, `Select`)
// into a full settings surface. The SAME `<SettingsContent />` is rendered by
// BOTH hosts — the settings CHROME (left category rail + grouped rows + uniform
// controls) is host-agnostic. Whether it lives in a modal or on a dedicated page
// is the HOST's concern; the content never changes.

/** Left-rail categories. A status dot + a meta value show the Nav primitive off. */
const CATEGORIES: KaiNavItem[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'monitor' },
  { id: 'account', label: 'Account', icon: 'briefcase' },
  { id: 'permissions', label: 'Permissions', icon: 'lock', status: { tone: 'warning', label: 'Review' } },
  { id: 'usage', label: 'Usage', icon: 'clock', meta: '82%' },
];

/** The kit's `Select`. This used to be a hand-styled native `<select>` with a note
 *  saying a real build would swap in a menu trigger; the kit owns a select now, so the
 *  screen shows the real control instead of a stand-in. `containerClass` narrows it,
 *  because a settings row's control is not full width. */
function LanguageSelect() {
  return (
    <Select
      aria-label="Language"
      value="auto"
      containerClass="w-44"
      options={[
        { value: 'auto', label: 'Auto Detect' },
        { value: 'en', label: 'English' },
        { value: 'es', label: 'Español' },
        { value: 'de', label: 'Deutsch' },
        { value: 'ja', label: '日本語' },
      ]}
    />
  );
}

/** The reusable two-pane settings body: category rail on the left, scrollable
 *  grouped content on the right. Fills its host (a modal panel or a full page). */
function SettingsContent() {
  const [active, setActive] = createSignal('general');
  const [appearance, setAppearance] = createSignal('system');

  return (
    <div class="flex h-full min-h-0 w-full overflow-hidden text-foreground">
      <aside class="w-56 shrink-0 overflow-y-auto border-r border-border bg-surface p-3 scrollbar-thin">
        <h2 class="px-2 pb-2 text-sm font-semibold text-foreground">Settings</h2>
        <Nav items={CATEGORIES} value={active()} onItemSelect={setActive} />
      </aside>

      <div class="min-w-0 flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div class="flex max-w-2xl flex-col gap-8">
          <SettingsGroup heading="General" description="How the app looks and behaves for you.">
            <SettingItem
              label="Appearance"
              description="Match your system theme or pin a mode."
              control={
                <Segmented
                  value={appearance()}
                  onChange={setAppearance}
                  options={[
                    { value: 'system', label: 'System', icon: <Monitor size={14} /> },
                    { value: 'light', label: 'Light', icon: <Sun size={14} /> },
                    { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
                  ]}
                />
              }
            />
            <SettingItem
              label="Reduce motion"
              description="Minimize non-essential animations and transitions."
              control={<Switch defaultChecked={false} label="Reduce motion" />}
            />
            <SettingItem
              label="Language"
              description="The interface language."
              control={<LanguageSelect />}
            />
          </SettingsGroup>

          <SettingsGroup heading="Permissions" description="What the agent may do without asking first.">
            <SettingItem
              label="Default permissions"
              description="Ask before running commands or editing files."
              control={<Switch defaultChecked={true} label="Default permissions" />}
            />
            <SettingItem
              label="Auto-review"
              description="Surface a diff review after each batch of edits."
              control={<Switch defaultChecked={true} label="Auto-review" />}
            />
            <SettingItem
              label="Full access"
              description="Skip all confirmation prompts. Use with caution."
              control={<Switch defaultChecked={false} label="Full access" />}
            />
          </SettingsGroup>
        </div>
      </div>
    </div>
  );
}

// Bound every story (story AND autodocs view) in a positioned, fixed-height frame.
// `relative` gives the modal's `absolute inset-0` a containing block; the height cap
// keeps the full page from blowing up the autodocs preview block.
const previewFrame: Decorator = (Story) => (
  <div class="relative h-[640px] w-full overflow-hidden rounded-xl border border-border bg-background">
    {Story()}
  </div>
);

const meta = {
  title: 'Labs/Settings',
  tags: ['autodocs'],
  decorators: [previewFrame],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: componentDescription([
        'A composed settings SCREEN, assembled from the primitives: a two-pane body (left category `Nav` rail + grouped `SettingItem` rows with uniform controls: `Switch`, `Segmented`, `Select`).',
        'Settings CONTENT differs per app, but the chrome is identical everywhere, so the same `SettingsContent` drops into either a modal (`AsModal`) or a full page (`AsPage`) unchanged. The host owns the frame; the content stays host-agnostic.',
      ]),
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Docs source snippets -------------------------------------------------
//
// Faithful, copy-pasteable rebuilds of what each story renders. The two-pane
// `SettingsContent` body is shared verbatim by both hosts (modal + page), so it
// lives in one const and each host snippet interpolates it beneath its own
// imports. Trimmed to a representative couple of rows per group, but complete
// enough to rebuild the panel and shows every control type used here.

const SETTINGS_CONTENT_SNIPPET = `// Left-rail categories for the Nav primitive.
const CATEGORIES = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'monitor' },
  { id: 'account', label: 'Account', icon: 'briefcase' },
  { id: 'permissions', label: 'Permissions', icon: 'lock' },
  { id: 'usage', label: 'Usage', icon: 'clock' },
];

// The two-pane settings body: category rail on the left, scrollable grouped
// content on the right. Host-agnostic — reused unchanged by both hosts below.
function SettingsContent() {
  const [active, setActive] = createSignal('general');
  const [appearance, setAppearance] = createSignal('system');

  return (
    <div class="flex h-full min-h-0 w-full overflow-hidden text-foreground">
      <aside class="w-56 shrink-0 overflow-y-auto border-r border-border bg-surface p-3">
        <h2 class="px-2 pb-2 text-sm font-semibold">Settings</h2>
        <Nav items={CATEGORIES} value={active()} onItemSelect={setActive} />
      </aside>

      <div class="min-w-0 flex-1 overflow-y-auto p-6">
        <div class="flex max-w-2xl flex-col gap-8">
          <SettingsGroup heading="General" description="How the app looks and behaves for you.">
            {/* control: Segmented */}
            <SettingItem
              label="Appearance"
              description="Match your system theme or pin a mode."
              control={
                <Segmented
                  value={appearance()}
                  onChange={setAppearance}
                  options={[
                    { value: 'system', label: 'System', icon: <Monitor size={14} /> },
                    { value: 'light', label: 'Light', icon: <Sun size={14} /> },
                    { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
                  ]}
                />
              }
            />
            {/* control: Switch */}
            <SettingItem
              label="Reduce motion"
              description="Minimize non-essential animations and transitions."
              control={<Switch defaultChecked={false} label="Reduce motion" />}
            />
            {/* control: Select */}
            <SettingItem
              label="Language"
              description="The interface language."
              control={
                <Select
                  aria-label="Language"
                  value="auto"
                  containerClass="w-44"
                  options={[
                    { value: 'auto', label: 'Auto Detect' },
                    { value: 'en', label: 'English' },
                    { value: 'es', label: 'Español' },
                  ]}
                />
              }
            />
          </SettingsGroup>

          <SettingsGroup heading="Permissions" description="What the agent may do without asking first.">
            <SettingItem
              label="Default permissions"
              description="Ask before running commands or editing files."
              control={<Switch defaultChecked={true} label="Default permissions" />}
            />
            <SettingItem
              label="Full access"
              description="Skip all confirmation prompts. Use with caution."
              control={<Switch defaultChecked={false} label="Full access" />}
            />
          </SettingsGroup>
        </div>
      </div>
    </div>
  );
}`;

const AS_MODAL_SNIPPET = `import { createSignal } from 'solid-js';
import { Monitor, Sun, Moon, X } from 'lucide-solid';
import { SettingsGroup, SettingItem, Segmented, Select, Switch, Nav } from '@kitn.ai/ui/solid';

${SETTINGS_CONTENT_SNIPPET}

// MOCK modal host: a fixed backdrop + a centered panel. The real version will
// mount <SettingsContent /> inside a future kai-dialog that owns the overlay.
function SettingsModal() {
  return (
    <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div class="relative flex max-h-[90%] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <button
          type="button"
          aria-label="Close"
          class="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X size={16} />
        </button>
        <SettingsContent />
      </div>
    </div>
  );
}`;

const AS_PAGE_SNIPPET = `import { createSignal } from 'solid-js';
import { Monitor, Sun, Moon, ChevronLeft } from 'lucide-solid';
import { SettingsGroup, SettingItem, Segmented, Select, Switch, Nav } from '@kitn.ai/ui/solid';

${SETTINGS_CONTENT_SNIPPET}

// Full-page host: a "Back to app" top bar over the same two-pane body.
function SettingsPage() {
  return (
    <div class="flex h-screen flex-col bg-background text-foreground">
      <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft size={16} />
          Back to app
        </button>
        <span class="text-sm font-medium">Settings</span>
      </header>
      <div class="min-h-0 flex-1">
        <SettingsContent />
      </div>
    </div>
  );
}`;

/**
 * Settings as a centered modal. NOTE: this is a MOCK modal (a fixed backdrop + a
 * rounded panel) for the prototype; the real version will mount `SettingsContent`
 * inside a future `kai-dialog`. The two-pane body is identical to `AsPage`.
 */
export const AsModal: Story = {
  render: () => (
    // MOCK modal: `absolute inset-0` so it is contained by the bounded preview frame
    // above and renders in BOTH story and docs. Production would use `fixed` (or a
    // future kai-dialog) to cover the viewport.
    <div class="absolute inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div class="relative flex max-h-[90%] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <button
          type="button"
          aria-label="Close"
          class="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={16} />
        </button>
        <SettingsContent />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: AS_MODAL_SNIPPET,
      },
    },
  },
};

/**
 * Settings as a dedicated full-height page (a "Back to app" top bar over the same
 * two-pane body), like Codex's settings environment. Same `SettingsContent`.
 */
export const AsPage: Story = {
  render: () => (
    // `h-full` fills the bounded preview frame instead of the full viewport, so the
    // page fits the 640px frame in both story and docs; the panes scroll internally.
    <div class="flex h-full flex-col bg-background text-foreground">
      <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft size={16} />
          Back to app
        </button>
        <span class="text-sm font-medium text-foreground">Settings</span>
      </header>
      <div class="min-h-0 flex-1">
        <SettingsContent />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: AS_PAGE_SNIPPET,
      },
    },
  },
};
