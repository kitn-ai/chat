import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { type JSX, createSignal, createMemo } from 'solid-js';
import { MessageCircle } from 'lucide-solid';
import { BuilderPanel, type BuilderConstruct } from '../components/builder-panel';
import { BuilderLayout, type BuilderViewport } from '../components/builder-layout';
import { resolveAccentWrapperStyle } from '../components/builder-preview';
import { ChatThread } from '../components/chat-thread';
import { cn } from '../utils/cn';
import type { ChatMessage } from './chat-types';

// Labs/Builder/Support widget — Round W (T-2/T-6, docs/superpowers/specs/
// 2026-08-28-template-builder-design.md): the FIRST template story,
// restructuring the old single `Labs/Apps` "Builder" story into the
// Support widget template's own screen — T-6's own words: "the existing
// single Labs/Apps Builder story is superseded by this section as
// templates land". That old story (four layout-mode preview shells behind
// one layout radio, RECOMMENDATION.md/the builder spike) is GONE, not kept
// alongside this one; its content lives on here, reshaped rather than
// duplicated. `Labs/Builder/Start` (Round P/P2) is the shared entry
// surface this whole section converges on — picking its "Support widget"
// card is the intended flow INTO this screen, though nothing wires that
// click yet (story-first, one round at a time; Start's own `onSelect`
// still just proves the callback fires, per its own doc comment).
//
// T-2 (the reframe's central ruling): the template FIXES the layout
// internally, so there is no Layout radio anywhere in this panel
// (`sections={{ layout: false, widget: 'always', provider: true }}` on
// `BuilderPanel`, `builder-panel.tsx`'s new Round-W prop — see its own doc
// comment) and the preview is ALWAYS the widget framing (floating card +
// FAB), never conditional on a `layout` field nobody can change from this
// screen. Switching template (not offered from inside this screen either)
// is the only way this construct's shape would change; that "with a
// confirm" interaction is future work (T-2's own text), not this round's.
//
// The starting construct is shaped like `kai dev`'s own `owner-widget`
// fixture (`mcp/construct/fixtures/owner-widget.construct.json`)
// — same header title, greeting/links, starters, attachments, history,
// conversations, widget position ("top-start")/defaultOpen, and a mock
// provider. Not byte-identical: the stub `BuilderConstruct` type this
// story-first panel edits doesn't carry `userId`/`empty`/
// `recentConversation`/`reasoningOpen` (real schema derivation stays out
// of scope per the spec's Process step 5), and this story keeps a brand
// accent color the fixture itself doesn't set, so the preview reads as a
// live product rather than the fixture's own neutral defaults. Recognizably
// the same real template, not an invented one.
const stubMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: "Where's my order?" }] },
  {
    id: 'm2',
    role: 'assistant',
    parts: [{ type: 'text', text: "Happy to check — what's the order number?" }],
  },
];

const DEFAULT_CONSTRUCT: BuilderConstruct = {
  name: 'acme-support',
  layout: 'widget',
  provider: { mode: 'mock' },
  header: { title: 'Acme Support' },
  theme: { accent: '#e91e63', unreadColor: '#38bdf8', mode: 'system' },
  home: {
    greeting: { title: 'Hi from Acme 👋', subtitle: 'Orders, refunds, anything.' },
    links: [
      { label: 'Help center', href: 'https://ui.kitn.ai', description: 'Guides and FAQs', icon: 'book-open' },
      { label: 'Talk to sales', description: 'We reply fast', icon: 'message-circle' },
    ],
  },
  widget: { position: 'top-start', defaultOpen: true },
  capabilities: {
    starters: ["Where's my order?", 'Request a refund'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
  },
};

/**
 * The chat panel itself: a phone-ish card with the construct's accent
 * threaded onto BOTH `--kai-color-primary` (the same public token a real
 * emitted construct's host sets, codegen.ts) AND `--color-primary` (the
 * internal token the kit's own components/Tailwind utilities actually
 * read) — see `resolveAccentWrapperStyle` (`builder-preview.ts`) for why
 * the internal token has to be set here by hand: a light-DOM stub preview
 * has no shadow `:host` boundary to re-resolve the public->internal
 * mapping the way a real construct's shadow root does. Root-caused live
 * (Round A, owner report) after this exact wrapper's accent silently did
 * nothing in both this story and its Support-widget-template sibling.
 */
function ChatPanel(props: { construct: BuilderConstruct; class?: string }): JSX.Element {
  const accentStyle = createMemo(() => resolveAccentWrapperStyle(props.construct.theme));
  return (
    <div class={cn('flex flex-col overflow-hidden border border-border bg-background', props.class)} style={accentStyle()}>
      <ChatThread
        class="h-full"
        messages={stubMessages}
        chatTitle={props.construct.header?.title}
        suggestions={props.construct.capabilities?.starters}
        onSubmit={() => {}}
      />
    </div>
  );
}

/**
 * The Support widget template's preview: ALWAYS the floating-card framing
 * plus a disabled stub FAB in the corner — decorative only, nothing
 * toggles it — standing in for the closed-launcher affordance a real
 * `layout: 'widget'` construct would show. This is the OLD story's
 * `WidgetPreview` branch, unchanged in substance; what's gone is the
 * `LayoutPreview` switch that used to sit above it (T-2: no other framing
 * exists to switch to for this template, so there's nothing left to
 * dispatch on).
 *
 * Round A4: reads the toolbar's `viewport` to mirror `ui/dock.tsx`'s own
 * real mobile takeover (its <=480px `@media` block: the panel goes
 * `position: fixed; inset: 0` — full-bleed, square corners, no border —
 * and the launcher/FAB hides while the panel is "open"). This frame is a
 * 390px-wide preview box, not the real viewport, so "full-bleed" here reads
 * as "the card fills the frame" rather than an actual `position: fixed`
 * takeover — same shape, scaled to the box it's drawn in. `tablet` (768px,
 * well above Dock's 480px breakpoint) gets no special treatment, matching
 * codegen's own real breakpoint exactly.
 */
function SupportWidgetPreview(props: { construct: BuilderConstruct; viewport: BuilderViewport }): JSX.Element {
  // The accent style lives HERE, on the outer frame — not inside `ChatPanel`
  // (round A found live: the FAB button below is `ChatPanel`'s SIBLING, one
  // level up, so a wrapper accenting only `ChatPanel`'s own subtree never
  // reaches it; `bg-primary` on the FAB kept resolving the kit's neutral
  // default while the thread inside `ChatPanel` correctly retinted). One
  // accented scope covering both descendants, applied once at their common
  // ancestor, rather than threading the same style prop into two places.
  const accentStyle = createMemo(() => resolveAccentWrapperStyle(props.construct.theme));
  const isMobile = createMemo(() => props.viewport === 'mobile');
  return (
    <div
      class={cn('relative h-[640px]', isMobile() ? 'w-full' : 'w-[400px]')}
      data-builder-widget-frame
      style={accentStyle()}
    >
      <ChatPanel
        construct={props.construct}
        class={cn('h-full w-full shadow-2xl', isMobile() ? 'rounded-none' : 'rounded-[28px]')}
      />
      <button
        type="button"
        disabled
        aria-hidden={isMobile() ? undefined : 'true'}
        tabindex={-1}
        class={cn(
          'absolute -bottom-4 -right-4 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl',
          // Real Dock hides its launcher while the panel is open at this
          // width (`[data-kai-dock]:has([part="panel"][data-expanded])
          // [part="launcher"] { display: none; }`) — mirrored here since
          // this stub FAB stands in for that same launcher.
          isMobile() && 'hidden',
        )}
      >
        <MessageCircle size={22} aria-hidden="true" />
      </button>
    </div>
  );
}

function SupportWidgetBuilderDemo(): JSX.Element {
  const [construct, setConstruct] = createSignal<BuilderConstruct>(DEFAULT_CONSTRUCT);
  const [viewport, setViewport] = createSignal<BuilderViewport>('desktop');
  return (
    <div class="h-screen w-screen">
      <BuilderLayout
        name={construct().name}
        panel={
          <BuilderPanel
            value={construct()}
            onChange={setConstruct}
            sections={{ layout: false, widget: 'always', provider: true }}
          />
        }
        preview={<SupportWidgetPreview construct={construct()} viewport={viewport()} />}
        viewport={viewport()}
        onViewportChange={setViewport}
      />
    </div>
  );
}

const meta = { title: 'Labs/Builder/Support widget', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// BuilderPanel/BuilderLayout are internal to the builder app (src/components/builder-panel.tsx,
// builder-layout.tsx) -- neither ships in a public @kitn.ai/ui entry point, so the snippet below
// names the real composition and wiring rather than a package import.
const src = (code: string) => ({
  parameters: { docs: { source: { code, language: 'tsx' } } },
});

/**
 * The Support widget template's builder: panel on the left scoped to
 * exactly this template's controls (Identity, Provider, Widget chrome —
 * always on, Theme, Home, Capabilities — no Layout radio, T-2), a live
 * widget-framed preview on the right. Edit the accent, header title,
 * starters, or the widget's position/launcher/open-by-default and watch
 * the preview react.
 *
 * What the old, now-superseded `Labs/Apps` Builder story's other layout
 * shells (fullscreen/aside/split) demonstrated moves to EACH of those
 * templates' own `Labs/Builder/<Template>` stories as they land (Rounds A,
 * R, S) — this story only ever shows the widget framing, because that's
 * what this template is.
 */
export const SupportWidget: Story = {
  render: () => <SupportWidgetBuilderDemo />,
  ...src(`<BuilderLayout
  name={construct.name}
  panel={
    <BuilderPanel
      value={construct}
      onChange={setConstruct}
      sections={{ layout: false, widget: 'always', provider: true }}
    />
  }
  preview={<SupportWidgetPreview construct={construct} viewport={viewport} />}
  viewport={viewport}
  onViewportChange={setViewport}
/>`),
};
