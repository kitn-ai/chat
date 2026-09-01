import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn } from 'storybook/test';
import { Row } from './row';
import { renderIcon } from '../ui/icon';
import { componentDescription } from '../stories/docs/element-controls';

/**
 * The generic mobile list row (P-4): leading region, title + optional
 * subtitle, trailing region, optional chevron, pressable when interactive.
 * Stub-data story-first artifact for the blocks-and-parts round: the three
 * widget home-tab row shapes plus a settings-style row, light and dark.
 */
const meta = {
  title: 'Components/Primitives/Row',
  component: Row,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A generic list row: leading region, title with optional subtitle, trailing region, optional chevron affordance. Pressable with real button semantics via `onActivate`, or a real anchor via a safe `href`; with neither it is a plain display row. Covers the widget home-tab shapes (recent conversation, CTA with trailing arrow, help link) and general settings screens alike.',
      ]),
      controls: { exclude: ['use:eventListener'] },
    },
  },
  argTypes: {
    subtitle: { control: 'text', description: 'Secondary line under the title.' },
    chevron: { control: 'boolean', description: 'Trailing chevron affordance.' },
    href: { control: 'text', description: 'Navigate on press (safe schemes only).' },
    onActivate: { action: 'activate', table: { category: 'Events' } },
  },
  args: {
    chevron: false,
    onActivate: fn(),
  },
  render: (args) => (
    <div class="w-80 rounded-lg border border-border">
      <Row {...args}>Account</Row>
    </div>
  ),
} satisfies Meta<typeof Row>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Row } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: a single pressable row. */
export const Playground: Story = {
  args: { subtitle: 'Profile, security, preferences', chevron: true },
  ...src(`<Row subtitle="Profile, security, preferences" chevron onActivate={() => openAccount()}>
  Account
</Row>`),
};

/**
 * The three widget home-tab row shapes, stub data (the anatomy the
 * composition spike hand-built three ways in `fine.html`):
 * 1. recent conversation, title + unread dot + relative time trailing,
 *    preview subtitle;
 * 2. full-width CTA, trailing arrow;
 * 3. help link, leading icon + chevron.
 */
function HomeTabRows(props: { onActivate: () => void }) {
  return (
    <div class="flex w-80 flex-col gap-4">
      {/* 1 · Recent conversation: card-framed row, dot + time trailing. */}
      <div class="overflow-hidden rounded-xl border border-border">
        <Row
          onActivate={props.onActivate}
          subtitle="Order KAI-1042 shipped with DHL"
          trailing={
            <>
              <span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-unread" />
              <span>2m ago</span>
            </>
          }
        >
          <span class="font-semibold">Where is my order?</span>
        </Row>
      </div>
      {/* 2 · CTA: full-width filled row, label left, arrow right. */}
      <div class="overflow-hidden rounded-xl">
        <Row
          onActivate={props.onActivate}
          class="bg-primary text-primary-foreground hover:bg-primary/90"
          trailing={renderIcon('arrow-right', { class: 'size-4 shrink-0 text-primary-foreground' })}
        >
          <span class="text-primary-foreground">Send us a message</span>
        </Row>
      </div>
      {/* 3 · Help link: leading icon, subtitle, chevron. */}
      <div class="overflow-hidden rounded-xl border border-border">
        <Row
          href="https://ui.kitn.ai"
          leading={renderIcon('book-open', { class: 'size-4 shrink-0' })}
          subtitle="Guides and FAQs"
          chevron
        >
          Help center
        </Row>
      </div>
    </div>
  );
}

export const HomeTabShapes: Story = {
  render: (args: { onActivate: () => void }) => <HomeTabRows onActivate={args.onActivate} />,
  ...src(`{/* recent conversation */}
<Row
  onActivate={() => openRecent()}
  subtitle="Order KAI-1042 shipped with DHL"
  trailing={<><span class="size-1.5 rounded-full bg-unread" /><span>2m ago</span></>}
>
  <span class="font-semibold">Where is my order?</span>
</Row>

{/* CTA with trailing arrow */}
<Row class="bg-primary text-primary-foreground" trailing={<ArrowRight />} onActivate={() => startChat()}>
  <span class="text-primary-foreground">Send us a message</span>
</Row>

{/* help link: leading icon + chevron */}
<Row href="https://ui.kitn.ai" leading={<BookOpen />} subtitle="Guides and FAQs" chevron>
  Help center
</Row>`),
};

/** A settings screen composed of rows: the row must read well outside chat. */
function SettingsRows(props: { onActivate: () => void }) {
  return (
    <div class="w-80 divide-y divide-border overflow-hidden rounded-xl border border-border">
      <Row
        onActivate={props.onActivate}
        leading={renderIcon('sliders-horizontal', { class: 'size-4 shrink-0' })}
        subtitle="Theme, language, density"
        chevron
      >
        Preferences
      </Row>
      <Row
        onActivate={props.onActivate}
        leading={renderIcon('git-branch', { class: 'size-4 shrink-0' })}
        trailing={<span>3</span>}
        chevron
      >
        Connected repos
      </Row>
      <Row leading={renderIcon('file-text', { class: 'size-4 shrink-0' })} trailing={<span>1.4.2</span>}>
        Release notes
      </Row>
    </div>
  );
}

export const SettingsScreen: Story = {
  render: (args: { onActivate: () => void }) => <SettingsRows onActivate={args.onActivate} />,
  ...src(`<div class="divide-y divide-border rounded-xl border border-border">
  <Row leading={<Sliders />} subtitle="Theme, language, density" chevron onActivate={openPreferences}>
    Preferences
  </Row>
  <Row leading={<GitBranch />} trailing={<span>3</span>} chevron onActivate={openRepos}>
    Connected repos
  </Row>
  <Row leading={<FileText />} trailing={<span>1.4.2</span>}>Release notes</Row>
</div>`),
};

/**
 * Both themes side by side (the scroll-button LightAndDark pattern): the two
 * panels are identical apart from the `dark` class, so this is a color
 * comparison and nothing else.
 */
export const LightAndDark: Story = {
  render: (args: { onActivate: () => void }) => (
    <div class="flex flex-wrap gap-6">
      <div class="rounded-lg border border-border bg-background p-4">
        <div class="mb-2 text-xs font-medium text-muted-foreground">Light</div>
        <HomeTabRows onActivate={args.onActivate} />
      </div>
      <div class="dark rounded-lg border border-border bg-background p-4">
        <div class="mb-2 text-xs font-medium text-muted-foreground">Dark</div>
        <HomeTabRows onActivate={args.onActivate} />
      </div>
    </div>
  ),
  ...src(`<Row subtitle="Guides and FAQs" chevron href="https://ui.kitn.ai">Help center</Row>`),
};
