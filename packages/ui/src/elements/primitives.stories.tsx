import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onSettled, onCleanup } from 'solid-js';
import './register'; // side-effect: registers kai-avatar, kai-badge, kai-tooltip, kai-button, …
import { attachKaiActions } from '../stories/docs/story-actions';

// Small helper for stories below: wire a kai-* element's declared CustomEvents to
// the Actions panel from a `ref`, cleaned up on unmount.
const withActions = (e: Element) => onSettled(() => { // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return attachKaiActions(e as HTMLElement); }); // V2-PORT (R2): braced — a non-function return crashes dev

// A purple square as a tiny offline-safe avatar image (proves the <img> path).
const AVATAR_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%234f46e5'/%3E%3C/svg%3E";

declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-avatar': JSX.HTMLAttributes<HTMLElement> & { src?: string; alt?: string; fallback?: string; size?: string };
      'kai-badge': JSX.HTMLAttributes<HTMLElement> & { variant?: string };
      'kai-tooltip': JSX.HTMLAttributes<HTMLElement> & { content?: string; 'open-delay'?: number | string };
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-notice': JSX.HTMLAttributes<HTMLElement> & { severity?: string; icon?: string; dismissible?: boolean };
      'kai-icon': JSX.HTMLAttributes<HTMLElement> & { name?: string; size?: string };
      'kai-separator': JSX.HTMLAttributes<HTMLElement> & { orientation?: string };
      'kai-scroll-area': JSX.HTMLAttributes<HTMLElement>;
      'kai-hover-card': JSX.HTMLAttributes<HTMLElement> & { 'open-delay'?: number | string; 'close-delay'?: number | string; placement?: string };
      'kai-skeleton': JSX.HTMLAttributes<HTMLElement> & { variant?: string; width?: string; height?: string; lines?: number | string };
    }
  }
}

const meta = { title: 'Labs/Foundations', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// Hand-written HTML for the "Show code" panel, so consumers see real kai-* markup
// (scalar props as attributes) instead of generated Solid JSX.
const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

/** Identity avatars, initials fallback, plus an image. */
export const Avatars: Story = {
  render: () => (
    <div class="flex items-center gap-3">
      <kai-avatar fallback="JD" size="sm" />
      <kai-avatar fallback="AI" />
      <kai-avatar src={AVATAR_SRC} fallback="JD" size="lg" />
    </div>
  ),
  parameters: src(`<kai-avatar fallback="JD" size="sm"></kai-avatar>
<kai-avatar fallback="AI"></kai-avatar>
<kai-avatar src="/avatar.jpg" fallback="JD" size="lg"></kai-avatar>`),
};

/** Pills: label, count, and citation marker. */
export const Badges: Story = {
  render: () => (
    <div class="flex items-center gap-3">
      <kai-badge>Beta</kai-badge>
      <kai-badge variant="count">3</kai-badge>
      <kai-badge variant="citation">1</kai-badge>
    </div>
  ),
  parameters: src(`<kai-badge>Beta</kai-badge>
<kai-badge variant="count">3</kai-badge>
<kai-badge variant="citation">1</kai-badge>`),
};

/** Tooltip wrapping a kit button. Hover or focus the controls. */
export const Tooltips: Story = {
  render: () => (
    <div class="flex items-center gap-4 p-16">
      <kai-tooltip content="Voice input" ref={withActions}>
        <kai-button variant="subtle" size="icon" icon="mic" label="Voice input" ref={withActions} />
      </kai-tooltip>
      <kai-tooltip content="Add files or photos" ref={withActions}>
        <kai-button variant="ghost" size="sm" icon="plus" ref={withActions}>Add</kai-button>
      </kai-tooltip>
    </div>
  ),
  parameters: src(`<kai-tooltip content="Voice input">
  <kai-button variant="subtle" size="icon" icon="mic" label="Voice input"></kai-button>
</kai-tooltip>

<kai-tooltip content="Add files or photos">
  <kai-button variant="ghost" size="sm" icon="plus">Add</kai-button>
</kai-tooltip>`),
};

/** Inline notices, one per severity, some dismissible, with an optional action. */
export const Notices: Story = {
  render: () => (
    <div class="flex max-w-md flex-col gap-2">
      <kai-notice severity="info" dismissible ref={withActions}>
        A new model is available.
        <a slot="action" href="#" class="font-medium text-foreground underline underline-offset-2">See it</a>
      </kai-notice>
      <kai-notice severity="warning" ref={withActions}>Claude Fable 5 is currently unavailable.</kai-notice>
      <kai-notice severity="error" dismissible ref={withActions}>Your last message failed to send.</kai-notice>
      <kai-notice severity="success" ref={withActions}>Settings saved.</kai-notice>
      {/* slot="icon" escape hatch: a custom inline SVG overrides the severity glyph. */}
      <kai-notice severity="info" ref={withActions}>
        New notifications are on.
        <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-tool-blue"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>
      </kai-notice>
    </div>
  ),
  parameters: src(`<kai-notice severity="info" dismissible>
  A new model is available.
  <a slot="action" href="#">See it</a>
</kai-notice>
<kai-notice severity="warning">Claude Fable 5 is currently unavailable.</kai-notice>
<kai-notice severity="error" dismissible>Your last message failed to send.</kai-notice>
<kai-notice severity="success">Settings saved.</kai-notice>

<!-- slot="icon": a custom inline SVG overrides the severity glyph -->
<kai-notice severity="info">
  New notifications are on.
  <svg slot="icon" viewBox="0 0 24 24"><!-- ... --></svg>
</kai-notice>`),
};

/** Dividers: horizontal between stacked content, vertical inside a control row. */
export const Separators: Story = {
  render: () => (
    <div class="flex max-w-md flex-col gap-3 text-foreground">
      <span>Section one</span>
      <kai-separator />
      <span>Section two</span>
      <div class="flex items-center gap-3">
        <span>Model</span>
        <kai-separator orientation="vertical" />
        <span>Effort</span>
        <kai-separator orientation="vertical" />
        <span>Voice</span>
      </div>
    </div>
  ),
  parameters: src(`<span>Section one</span>
<kai-separator></kai-separator>
<span>Section two</span>

<div style="display:flex;align-items:center;gap:0.75rem">
  <span>Model</span>
  <kai-separator orientation="vertical"></kai-separator>
  <span>Effort</span>
</div>`),
};

/** Scroll area: themed thin scrollbar; content scrolls inside a bounded box. */
export const ScrollAreaStory: Story = {
  name: 'Scroll Area',
  render: () => (
    <kai-scroll-area style={{ height: '12rem' }} class="block w-72 rounded-lg border border-border p-3 text-foreground">
      <div class="flex flex-col gap-2">
        {Array.from({ length: 20 }, (_, i) => (
          <div class="rounded-md border border-border px-3 py-2 text-sm">Row {i + 1}</div>
        ))}
      </div>
    </kai-scroll-area>
  ),
  parameters: src(`<kai-scroll-area style="display:block;height:12rem;width:18rem">
  <!-- content taller than the box scrolls inside it -->
  <div>Row 1</div>
  <div>Row 2</div>
  <!-- ... -->
</kai-scroll-area>`),
};

/** Hover card: RICH content on hover/focus of a trigger (vs the text-only tooltip). */
export const HoverCards: Story = {
  render: () => (
    <div class="flex items-center gap-2 p-16 text-foreground">
      <span>Mentioned by</span>
      <kai-hover-card open-delay="120" ref={withActions}>
        <a href="#" class="font-medium text-foreground underline underline-offset-2">@acme</a>
        <div slot="card" class="flex w-56 flex-col gap-2">
          <div class="flex items-center gap-2">
            <kai-avatar fallback="AC" size="sm" />
            <strong>Acme Corp</strong>
          </div>
          <p class="text-sm text-muted-foreground">Workspace · 24 members · 8 projects</p>
        </div>
      </kai-hover-card>
    </div>
  ),
  parameters: src(`<kai-hover-card open-delay="120">
  <a href="#">@acme</a>
  <div slot="card">
    <kai-avatar fallback="AC" size="sm"></kai-avatar>
    <strong>Acme Corp</strong>
    <p>Workspace · 24 members · 8 projects</p>
  </div>
</kai-hover-card>`),
};

/** Loading placeholders: variants, responsive width, and a composed card skeleton. */
export const Skeletons: Story = {
  render: () => (
    <div class="flex flex-col gap-6 text-foreground">
      {/* Variants: circle, rect, multi-line text. */}
      <div class="flex items-start gap-6">
        <kai-skeleton variant="circle" width="2.5rem" />
        <kai-skeleton variant="rect" width="8rem" height="5rem" />
        <div class="w-48"><kai-skeleton variant="text" lines="3" /></div>
      </div>
      {/* Responsive: the SAME text skeleton fills containers of different widths. */}
      <div class="flex flex-col gap-3">
        <div class="w-full rounded-md border border-border p-3"><kai-skeleton variant="text" lines="2" /></div>
        <div class="w-1/2 rounded-md border border-border p-3"><kai-skeleton variant="text" lines="2" /></div>
      </div>
      {/* Composed: avatar + lines (how a consumer mirrors a real layout). */}
      <div class="flex w-72 items-center gap-3 rounded-lg border border-border p-3">
        <kai-skeleton variant="circle" width="2.5rem" />
        <div class="flex-1"><kai-skeleton variant="text" lines="2" /></div>
      </div>
    </div>
  ),
  parameters: src(`<!-- variants: circle, rect, multi-line text -->
<kai-skeleton variant="circle" width="2.5rem"></kai-skeleton>
<kai-skeleton variant="rect" width="8rem" height="5rem"></kai-skeleton>
<kai-skeleton variant="text" lines="3"></kai-skeleton>

<!-- composed: avatar + lines, mirroring a real layout -->
<div style="display:flex;align-items:center;gap:0.75rem">
  <kai-skeleton variant="circle" width="2.5rem"></kai-skeleton>
  <kai-skeleton variant="text" lines="2"></kai-skeleton>
</div>`),
};

/** Curated icons standalone (kai-icon), plus the slot escape hatch on kai-button. */
export const Icons: Story = {
  render: () => (
    <div class="flex flex-col gap-5 text-foreground">
      <div class="flex items-center gap-3">
        <kai-icon name="globe" />
        <kai-icon name="mic" />
        <kai-icon name="code" />
        <kai-icon name="paperclip" />
        <kai-icon name="sparkles" size="lg" />
      </div>
      {/* Escape hatch: any inline SVG via slot="icon"; inherits currentColor. */}
      <kai-button variant="outline" size="sm" ref={withActions}>
        <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        Ship it
      </kai-button>
    </div>
  ),
  parameters: src(`<kai-icon name="globe"></kai-icon>
<kai-icon name="mic"></kai-icon>
<kai-icon name="code"></kai-icon>
<kai-icon name="sparkles" size="lg"></kai-icon>

<!-- slot="icon" escape hatch: any inline SVG inherits currentColor -->
<kai-button variant="outline" size="sm">
  <svg slot="icon" viewBox="0 0 24 24"><!-- ... --></svg>
  Ship it
</kai-button>`),
};
