# Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Intercom-style home screen for the widget — greeting, recent-conversation card, new-conversation action, link cards — behind a persistent Home/Messages bottom tab bar that exists only when a construct declares `home`.

**Architecture:** New pure-props `HomePanel` + purpose-built `WidgetTabBar` components (story-first); `ChatThread`'s view machine grows from `chat ⇄ list` to `home | chat | list` with a root-vs-drilled tab-visibility rule; the `kai-chat` facade forwards `home` + a `kai-home-link` event; the construct schema gains a top-level `home` object threaded through codegen into emitted apps. The duplicated recency comparator is extracted once and reused (absorbs issue #335).

**Tech Stack:** SolidJS, Zod (construct schema), vitest (unit + emitted projects), Storybook (storybook-solidjs-vite).

**Spec:** `docs/superpowers/specs/2026-08-27-home-screen-design.md` (rulings H-1..H-6). The owner waived the mid-round story-approval gate for this round — build end-to-end; story + demo reviewed together at the end.

## Global Constraints

- **Vocabulary-never-logic:** `home` carries data only — no conditions, no expressions; cards render in declaration order.
- **Every construct-authored string is untrusted:** `JSON.stringify` at every emit interpolation site; `isSafeUrl` on every navigable value (`links[].href`, URL-shaped `links[].icon`).
- **Derive, don't type:** the recency comparator exists ONCE after this plan; icon names come from `renderIcon`'s own vocabulary, never a restated list.
- **Reactivity contract:** any new list rendered via `<For>` (links) follows the new-array + new-item-object rule; add to `reactivity-contract.test.tsx` if a consumer-visible list is added to the facade.
- **Decide loudly:** `recentConversation: true` without `capabilities.conversations` is valid vocabulary that renders nothing — `kai validate` prints a non-fatal warning naming the dependency.
- **No `home` in a construct ⇒ byte-for-byte today's widget** (no tab chrome, header list button unchanged).
- **Gates:** per-task `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- <file>` is a smoke check only; the merge verdict is the FULL `--project=unit` AND `--project=emitted` + `nx typecheck ui` + `verify:construct` + `verify:generated` + `verify:scaffold` (Task 6). Scoped runs are not a verdict.
- **Foreground subagent gates only** (background gates die at turn boundaries).

## Decisions-to-tasks map (spec H-1..H-6)

| # | Decision | Landed in |
|---|----------|-----------|
| H-1 | Four optional content pieces | Task 1 (components), Task 5 (vocabulary) |
| H-2 | Bottom tabs; tab bar on root views, hidden in drilled chat; back-target tracked | Tasks 1, 3 |
| H-3 | Messages → single chat when conversations off; recent card conversations-derived; validate warning | Tasks 3, 5 |
| H-4 | Top-level `home` object, presence = chrome switch | Task 5 |
| H-5 | Open lands on Home; close resets to Home; hydration still runs | Task 3 |
| H-6 | Purpose-built tab bar, not `kai-tabs` | Task 1 |

## Verified against the real tree (2026-08-27)

- `chat-thread.tsx:361` — `const [view, setView] = createSignal<'chat' | 'list'>('chat')`; `conversationsReady()` requires `conversations === true && store != null && onConversationLoad != null`.
- `chat-thread.tsx:620` — `closeConversationsList: () => setView('chat')` on the `ChatThreadController`.
- `chat-thread.tsx:557-575` — auto-restore `onMount` guarded by `if (view() !== 'chat') return;`, with the inline newest-summary sort (one of the two comparator copies).
- `conversation-panel.tsx:37-45` — the other comparator copy, inside a `createMemo`.
- `ConversationSummary` lives in `packages/ui/src/types.ts:30-63` (NOT conversation-store.ts).
- `elements/chat.tsx:253-255` — forwarding pattern: `conversations={flag('conversations')} store={props.store as ConversationStore | undefined} onConversationLoad={(messages, id) => dispatch('kai-conversation-load', { id, messages })}`; event map at L169.
- `schema.ts` — `header` L112, `empty` L135, `theme.unreadColor` L101, `isSafeUrl` superRefine pattern L317-330, `capabilities.conversations: z.literal(true).optional()` L214.
- `codegen.ts` — `emitHeaderProp` L802, `emitEmptyContentProp` L838, `emitConversationsProps` L1113, widget-close-on-list-reset gate L891 (`c.layout === 'widget' && !!c.capabilities?.conversations`).
- `ui/icon.tsx` — `renderIcon(icon, opts)` L134 resolves kebab-case names from `NAMED_ICONS` (incl. `home`, `message-circle`, `book-open`), URL-shaped strings to `<img>`, unknown names to a DEV-warned text span. `ICON_NAMES` exported L122.
- `ui/dock.tsx:287-296` — badge CSS uses `var(--color-unread)`; token defined `theme.css:99/271` as `--color-unread: var(--kai-color-unread, hsl(0 84% 60%))`; `bg-unread` utility already used at `conversation-panel.tsx:94`.
- Facade tests live in `packages/ui/tests/elements/chat-conversations.test.tsx` (jsdom shims: `Element.prototype.scrollTo`, `ResizeObserver`; `flush()` helper).
- `verify:generated` byte-diffs (among others) `construct.v1.schema.json` and `apps/docs/public/schemas/construct/v1.json` — regenerate via `npm run build:api` inside `packages/ui` after schema changes.
- **Unverified/assumed:** exact `cli.ts` validate output shape (Task 5 tells the implementer to read it before adding the warning); Storybook story-name collisions.

## Ambiguities resolved

1. **Tab bar in the conversations-off Messages chat:** VISIBLE. Rule: the tab bar shows on ROOT views (home; the list; the single chat reached via the Messages tab when conversations is off) and hides on DRILLED chats (entered from a list row or the recent card). Otherwise a conversations-off user could never leave Messages.
2. **Back button target:** drilled chats get a header back arrow returning to the surface they were entered from (`'home' | 'list'`), tracked in a signal. Root views have no back arrow.
3. **Auto-restore with home:** on mount with `home` present, `refreshConversations()` runs (summaries feed the recent card + unread dot) but does NOT auto-select a conversation — the landing view is Home. Without `home`, behavior is unchanged.
4. **`home` + `headerFull`:** out of scope; `home` renders through the built-in chrome. No schema coupling needed (constructs don't emit `headerFull`).
5. **Icon vocabulary:** `links[].icon` accepts a `renderIcon` name or a safe URL. The schema validates only the URL-shaped case with `isSafeUrl`; unknown names stay a loud DEV runtime warning (`renderIcon` already does this) — the schema never restates the icon list.
6. **`emitCustomApp` (`layout: 'custom'`):** does not wire `home`, matching its existing pinned behavior for `header`/`empty`/`conversations`.
7. **New-conversation default label:** `"Send us a message"` (HomePanel) — distinct from the list pill's `"New conversation"`.

---

### Task 1: `HomePanel` + `WidgetTabBar` components + Storybook story (story-first)

**Files:**
- Create: `packages/ui/src/components/home-panel.tsx`
- Create: `packages/ui/src/components/widget-tab-bar.tsx`
- Create: `packages/ui/src/components/home-panel.stories.tsx`
- Test: `packages/ui/src/components/home-panel.test.tsx`
- Modify: `packages/ui/src/types.ts` (add `HomeConfig`, `HomeLinkEntry`)
- Modify: `packages/ui/src/index.ts` (export the new components + types, mirroring `ConversationPanel`'s export lines)

**Interfaces:**
- Consumes: `ConversationSummary` (`src/types.ts:30`), `relativeTimeShort` + `isConversationUnread` (`./conversation-item`), `renderIcon` (`../ui/icon`), `isSafeUrl` (`../primitives/url-scheme-policy`), `Button` (`../ui/button`).
- Produces (later tasks rely on these EXACT shapes):

```ts
// src/types.ts
export interface HomeLinkEntry {
  label: string;
  href?: string;
  description?: string;
  icon?: string; // renderIcon name or safe URL
}
export interface HomeConfig {
  greeting?: { title?: string; subtitle?: string };
  recentConversation?: boolean;
  newConversation?: { label?: string };
  links?: HomeLinkEntry[];
}

// home-panel.tsx
export interface HomePanelProps {
  greeting?: { title?: string; subtitle?: string };
  recent?: ConversationSummary;            // host derives; undefined = card hidden
  showNewConversation?: boolean;           // default true
  newChatLabel?: string;                   // default 'Send us a message'
  links?: HomeLinkEntry[];
  onSelectRecent?: (id: string) => void;
  onNewChat: () => void;
  onLink?: (entry: HomeLinkEntry) => void; // href-less entries only
  class?: string;
}
export function HomePanel(props: HomePanelProps): JSX.Element;

// widget-tab-bar.tsx
export interface WidgetTabBarProps {
  active: 'home' | 'messages';
  onChange: (tab: 'home' | 'messages') => void;
  unread?: boolean;
  homeLabel?: string;     // default 'Home'
  messagesLabel?: string; // default 'Messages'
}
export function WidgetTabBar(props: WidgetTabBarProps): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/src/components/home-panel.test.tsx
import { render, fireEvent } from '@solidjs/testing-library';
import { describe, it, expect, vi } from 'vitest';
import { HomePanel } from './home-panel';
import { WidgetTabBar } from './widget-tab-bar';
import type { ConversationSummary } from '../types';

const tick = () => new Promise((r) => setTimeout(r, 0));
const summary: ConversationSummary = {
  id: 'c1', title: 'Order #42', messageCount: 3,
  updatedAt: new Date().toISOString(), trailing: 'On its way!',
  lastMessageAt: new Date().toISOString(),
};

describe('HomePanel (H-1)', () => {
  it('defaults: greeting title + new-conversation card render with no config', () => {
    const { getByText } = render(() => <HomePanel onNewChat={() => {}} />);
    expect(getByText('Hi there 👋')).toBeTruthy();
    expect(getByText('Send us a message')).toBeTruthy();
  });

  it('recent card renders summary fields and taps through with the id', async () => {
    const onSelectRecent = vi.fn();
    const { getByText, container } = render(() => (
      <HomePanel recent={summary} onSelectRecent={onSelectRecent} onNewChat={() => {}} />
    ));
    expect(getByText('Order #42')).toBeTruthy();
    expect(getByText('On its way!')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-kai-home-recent]')!);
    await tick();
    expect(onSelectRecent).toHaveBeenCalledWith('c1');
  });

  it('no recent prop → no recent card', () => {
    const { container } = render(() => <HomePanel onNewChat={() => {}} />);
    expect(container.querySelector('[data-kai-home-recent]')).toBeNull();
  });

  it('href link renders a hardened anchor; javascript: href renders NO anchor but the label stays visible', () => {
    const { container, getByText } = render(() => (
      <HomePanel onNewChat={() => {}} links={[
        { label: 'Docs', href: 'https://ui.kitn.ai' },
        { label: 'Evil', href: 'javascript:alert(1)' },
      ]} />
    ));
    const a = container.querySelector('a[href="https://ui.kitn.ai"]')!;
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(getByText('Evil')).toBeTruthy(); // escaped rendering, not deletion
  });

  it('href-less link is a button that emits the entry via onLink', async () => {
    const onLink = vi.fn();
    const entry = { label: 'Talk to sales', icon: 'message-circle' };
    const { getByText } = render(() => (
      <HomePanel onNewChat={() => {}} links={[entry]} onLink={onLink} />
    ));
    fireEvent.click(getByText('Talk to sales'));
    await tick();
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ label: 'Talk to sales' }));
  });

  it('showNewConversation={false} hides the new-conversation card', () => {
    const { container } = render(() => (
      <HomePanel onNewChat={() => {}} showNewConversation={false} />
    ));
    expect(container.querySelector('[data-kai-home-new]')).toBeNull();
  });
});

describe('WidgetTabBar (H-2, H-6)', () => {
  it('real tablist semantics; active tab is aria-selected', () => {
    const { container } = render(() => (
      <WidgetTabBar active="home" onChange={() => {}} />
    ));
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('unread reaches the Messages tab ACCESSIBLE NAME, not only a hidden dot (#336 lesson)', () => {
    const { container } = render(() => (
      <WidgetTabBar active="home" onChange={() => {}} unread />
    ));
    const messages = container.querySelector('[data-kai-tab-messages]')!;
    expect(messages.getAttribute('aria-label')).toMatch(/unread/i);
    expect(container.querySelector('[data-kai-tab-unread]')).toBeTruthy();
  });

  it('tab click emits the tab id', async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <WidgetTabBar active="home" onChange={onChange} />
    ));
    fireEvent.click(container.querySelector('[data-kai-tab-messages]')!);
    await tick();
    expect(onChange).toHaveBeenCalledWith('messages');
  });
});
```

- [ ] **Step 2: Run to verify red**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- src/components/home-panel.test.tsx`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `WidgetTabBar`**

Purpose-built (H-6). Shape (match the repo's Tailwind-class idiom — read `conversation-panel.tsx` first for row/pill styling):

```tsx
// packages/ui/src/components/widget-tab-bar.tsx
import { Show } from 'solid-js';
import { renderIcon } from '../ui/icon';

export interface WidgetTabBarProps { /* as in Interfaces above */ }

export function WidgetTabBar(props: WidgetTabBarProps) {
  const home = () => props.homeLabel ?? 'Home';
  const messages = () => props.messagesLabel ?? 'Messages';
  return (
    <nav role="tablist" aria-label="Widget navigation" part="tab-bar"
      class="flex h-14 shrink-0 items-stretch border-t border-border">
      <button type="button" role="tab" data-kai-tab-home
        aria-selected={props.active === 'home'} aria-label={home()}
        class="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs"
        classList={{ 'text-primary': props.active === 'home', 'text-muted-foreground': props.active !== 'home' }}
        onClick={() => props.onChange('home')}>
        {renderIcon('home', { size: 20 })}
        <span>{home()}</span>
      </button>
      <button type="button" role="tab" data-kai-tab-messages
        aria-selected={props.active === 'messages'}
        aria-label={props.unread ? `${messages()} (unread)` : messages()}
        class="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs"
        classList={{ 'text-primary': props.active === 'messages', 'text-muted-foreground': props.active !== 'messages' }}
        onClick={() => props.onChange('messages')}>
        <span class="relative">
          {renderIcon('message-square', { size: 20 })}
          <Show when={props.unread}>
            <span data-kai-tab-unread aria-hidden="true"
              class="absolute -right-1 -top-1 size-1.5 rounded-full bg-unread" />
          </Show>
        </span>
        <span>{messages()}</span>
      </button>
    </nav>
  );
}
```

(Check `renderIcon`'s actual signature at `ui/icon.tsx:134` before use and adapt the call — do not guess the options shape.)

- [ ] **Step 4: Implement `HomePanel`**

Layout intent (implementer refines visually in the story): scrollable column, greeting block on a primary-tinted header area, then cards (recent → new-conversation → links) as bordered rounded rows.

```tsx
// packages/ui/src/components/home-panel.tsx
import { For, Show } from 'solid-js';
import type { ConversationSummary } from '../types';
import type { HomeLinkEntry } from '../types';
import { relativeTimeShort, isConversationUnread } from './conversation-item';
import { renderIcon } from '../ui/icon';
import { isSafeUrl } from '../primitives/url-scheme-policy';

export interface HomePanelProps { /* as in Interfaces above */ }

export function HomePanel(props: HomePanelProps) {
  const title = () => props.greeting?.title ?? 'Hi there 👋';
  return (
    <div part="home" class={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 ${props.class ?? ''}`}>
      <div class="flex flex-col gap-1">
        <h2 class="text-xl font-semibold">{title()}</h2>
        <Show when={props.greeting?.subtitle}>
          <p class="text-sm text-muted-foreground">{props.greeting!.subtitle}</p>
        </Show>
      </div>
      <Show when={props.recent}>
        {(recent) => (
          <button type="button" data-kai-home-recent
            class="flex flex-col gap-1 rounded-xl border border-border p-4 text-left hover:bg-accent"
            onClick={() => props.onSelectRecent?.(recent().id)}>
            <span class="flex items-center gap-2 text-sm font-medium">
              {recent().title}
              <Show when={isConversationUnread(recent())}>
                <span aria-hidden="true" class="size-1.5 rounded-full bg-unread" />
              </Show>
            </span>
            <Show when={recent().trailing}>
              <span class="line-clamp-1 text-sm text-muted-foreground">{recent().trailing}</span>
            </Show>
            <span class="text-xs text-muted-foreground">{relativeTimeShort(recent().updatedAt)}</span>
          </button>
        )}
      </Show>
      <Show when={props.showNewConversation !== false}>
        <button type="button" data-kai-home-new
          class="flex items-center justify-between rounded-xl border border-border p-4 text-sm font-medium hover:bg-accent"
          onClick={() => props.onNewChat()}>
          {props.newChatLabel ?? 'Send us a message'}
          {renderIcon('arrow-right', { size: 16 })}
        </button>
      </Show>
      <Show when={props.links?.length}>
        <div class="flex flex-col overflow-hidden rounded-xl border border-border">
          <For each={props.links}>
            {(entry) => {
              const inner = (
                <>
                  <span class="flex items-center gap-2">
                    <Show when={entry.icon}>{renderIcon(entry.icon!, { size: 16 })}</Show>
                    <span class="flex flex-col text-left">
                      <span class="text-sm font-medium">{entry.label}</span>
                      <Show when={entry.description}>
                        <span class="text-xs text-muted-foreground">{entry.description}</span>
                      </Show>
                    </span>
                  </span>
                  {renderIcon('chevron-right', { size: 16 })}
                </>
              );
              const safeHref = () => (entry.href && isSafeUrl(entry.href) ? entry.href : undefined);
              return (
                <Show when={safeHref()} fallback={
                  <button type="button" data-kai-home-link
                    class="flex items-center justify-between border-b border-border p-3 last:border-b-0 hover:bg-accent"
                    onClick={() => props.onLink?.(entry)}>
                    {inner}
                  </button>
                }>
                  <a data-kai-home-link href={safeHref()} target="_blank" rel="noreferrer noopener"
                    class="flex items-center justify-between border-b border-border p-3 last:border-b-0 hover:bg-accent">
                    {inner}
                  </a>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
```

Note the unsafe-href rule: the entry still renders (as the button/emit form is WRONG here — an unsafe-href entry must not silently become an event emitter; render it as a plain non-interactive row with the label visible). Adjust the fallback: when `entry.href` exists but fails `isSafeUrl`, render the inner content in a `<div data-kai-home-link>` with no handler. The test in Step 1 asserts label-visible + no anchor; add the no-button assertion while implementing.

- [ ] **Step 5: Run tests to green, then typecheck**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- src/components/home-panel.test.tsx` → PASS.
Add `HomeConfig`/`HomeLinkEntry` to `src/types.ts` and export `HomePanel`, `WidgetTabBar`, `HomePanelProps`, `WidgetTabBarProps`, `HomeConfig`, `HomeLinkEntry` from `src/index.ts` (mirror the `ConversationPanel` lines). Run `npm run typecheck` inside `packages/ui`.

- [ ] **Step 6: Write the story (the design-iteration surface)**

```tsx
// packages/ui/src/components/home-panel.stories.tsx
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { HomePanel } from './home-panel';
import { WidgetTabBar } from './widget-tab-bar';
import type { ConversationSummary } from '../types';

const recent: ConversationSummary = {
  id: 'c1', title: 'Order #42', messageCount: 3,
  updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  lastMessageAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  trailing: "It's on the way — tracking says Thursday.",
};

const frame = (children: any) => (
  <div class="flex h-[600px] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-background">
    {children}
  </div>
);

const meta = {
  title: 'Components/Elements/HomePanel',
  component: HomePanel,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HomePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Full home: greeting, recent, new-conversation, links, tab chrome with unread. */
export const FullHome: Story = {
  render: () => {
    const [tab, setTab] = createSignal<'home' | 'messages'>('home');
    return frame(
      <>
        <HomePanel
          greeting={{ title: 'Hi there 👋', subtitle: 'How can we help today?' }}
          recent={recent}
          links={[
            { label: 'Docs', href: 'https://ui.kitn.ai', description: 'Read the guides', icon: 'book-open' },
            { label: 'Talk to sales', description: 'Emits kai-home-link', icon: 'message-circle' },
          ]}
          onNewChat={() => {}}
          onSelectRecent={() => {}}
          onLink={() => {}}
        />
        <WidgetTabBar active={tab()} onChange={setTab} unread />
      </>,
    );
  },
};

/** `home: {}` — defaults only. */
export const MinimalDefaults: Story = {
  render: () => frame(
    <>
      <HomePanel onNewChat={() => {}} />
      <WidgetTabBar active="home" onChange={() => {}} />
    </>,
  ),
};

/** No recent conversation (first visit). */
export const NoRecent: Story = {
  render: () => frame(
    <>
      <HomePanel
        greeting={{ title: 'Welcome to Acme' }}
        links={[{ label: 'Docs', href: 'https://ui.kitn.ai', icon: 'book-open' }]}
        onNewChat={() => {}}
      />
      <WidgetTabBar active="home" onChange={() => {}} />
    </>,
  ),
};
```

Iterate on the LOOK here with stub data until it reads like a product home screen, not a settings list (greeting prominent, cards calm, tab bar quiet). Verify in Storybook (`pnpm dev`, port 6006) in light and dark.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/home-panel.tsx packages/ui/src/components/widget-tab-bar.tsx packages/ui/src/components/home-panel.stories.tsx packages/ui/src/components/home-panel.test.tsx packages/ui/src/types.ts packages/ui/src/index.ts
git commit -m "feat(home): HomePanel + WidgetTabBar components with story (story-first)"
```

---

### Task 2: Extract the shared recency comparator (absorbs #335)

**Files:**
- Modify: `packages/ui/src/primitives/conversation-store.ts` (add + export `byRecency`)
- Modify: `packages/ui/src/components/conversation-panel.tsx:37-45` (use it)
- Modify: `packages/ui/src/components/chat-thread.tsx:557-575` (use it)
- Modify: `packages/ui/src/index.ts` (export)
- Test: `packages/ui/src/primitives/conversation-store.test.ts` (append)

**Interfaces:**
- Produces: `export function byRecency(a: Pick<ConversationSummary, 'updatedAt'>, b: Pick<ConversationSummary, 'updatedAt'>): number` — newest-first, invalid/missing `updatedAt` sorts last. Task 3's recent-card derivation consumes it.

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/ui/src/primitives/conversation-store.test.ts
import { byRecency } from './conversation-store';

describe('byRecency (shared comparator, issue #335)', () => {
  it('sorts newest first and pushes invalid/missing updatedAt to the end', () => {
    const rows = [
      { id: 'a', updatedAt: '2026-08-01T00:00:00Z' },
      { id: 'b', updatedAt: 'not-a-date' },
      { id: 'c', updatedAt: '2026-08-27T00:00:00Z' },
      { id: 'd', updatedAt: undefined as unknown as string },
    ];
    expect([...rows].sort(byRecency).map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});
```

Note: `'b'` before `'d'` requires a stable tie-break for two -Infinity values — `Array.prototype.sort` is stable, so declaration order holds; assert exactly that.

- [ ] **Step 2: Run red**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- src/primitives/conversation-store.test.ts`
Expected: FAIL — `byRecency` not exported.

- [ ] **Step 3: Implement + swap both call sites**

```ts
// conversation-store.ts
/** Newest-first ordering over `updatedAt`; rows with a missing or unparsable
 *  timestamp sort last (stable, so ties keep declaration order). The ONE
 *  recency rule — the list panel, ChatThread's restore pick, and the home
 *  screen's recent card all sort with this (issue #335). */
export function byRecency(
  a: Pick<ConversationSummary, 'updatedAt'>,
  b: Pick<ConversationSummary, 'updatedAt'>,
): number {
  const at = Date.parse(a.updatedAt ?? '');
  const bt = Date.parse(b.updatedAt ?? '');
  return (Number.isNaN(bt) ? -Infinity : bt) - (Number.isNaN(at) ? -Infinity : at);
}
```

In `conversation-panel.tsx` replace the memo's inline comparator with `[...props.conversations].sort(byRecency)`. In `chat-thread.tsx` replace the auto-restore sort with `const newest = [...summaries].sort(byRecency)[0];`. Export from `src/index.ts`.

- [ ] **Step 4: Run green + the existing suites that pin the behavior**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- src/primitives/conversation-store.test.ts src/components/chat-thread.test.tsx` → PASS.

- [ ] **Step 5: Commit; comment on issue #335**

```bash
git add -A packages/ui/src
git commit -m "refactor(conversations): one shared byRecency comparator (closes #335)"
```

---

### Task 3: `ChatThread` view machine — `home | chat | list`, tabs, back-target

**Files:**
- Modify: `packages/ui/src/components/chat-thread.tsx`
- Test: `packages/ui/src/components/chat-thread.test.tsx` (append a `describe`)

**Interfaces:**
- Consumes: `HomePanel`, `WidgetTabBar` (Task 1), `HomeConfig`/`HomeLinkEntry` (`../types`), `byRecency` (Task 2).
- Produces (Task 4 forwards these):
  - `ChatThreadProps.home?: HomeConfig`
  - `ChatThreadProps.onHomeLink?: (entry: HomeLinkEntry) => void`
  - `ChatThreadController.closeConversationsList()` now resets to `'home'` when `home` is set, `'chat'` otherwise (same method name; update its doc comment).

**Behavior contract (write the tests from this):**
1. `home` set → initial view `'home'`; HomePanel + tab bar render; composer/thread absent.
2. `home` unset → today's widget exactly: initial `'chat'`, no tab bar, header list button present when conversations ready.
3. `home` set → header list button (`data-kai-conversations-toggle`) NOT rendered (list moved to the Messages tab, H-2).
4. Messages tab, conversations ready → `'list'` view WITH tab bar. Messages tab, conversations off → `'chat'` view WITH tab bar (root chat, ambiguity 1) and no back arrow.
5. List row tap or recent-card tap → `'chat'` with tab bar HIDDEN and a header back arrow (`data-kai-home-back`); back returns to the entering surface (`'list'` / `'home'`).
6. New-conversation (home card) → drilled `'chat'`, back target `'home'`.
7. Close-reset: `closeConversationsList()` → `'home'` when home set (H-5).
8. On mount with home + conversations ready: summaries refresh (recent card + unread dot honest) but NO auto-select into chat (ambiguity 3); without home, auto-restore unchanged.
9. Recent card only when `home.recentConversation === true` AND conversations ready AND at least one summary; shows the `byRecency`-newest summary.
10. Unread dot on the Messages tab tracks `anyUnread()`; `onUnreadChange` unchanged.

- [ ] **Step 1: Write the failing tests** — one `it` per contract line above, in a new `describe('home screen (H-2, H-3, H-5) — spec 2026-08-27', ...)`. Reuse the file's existing harness idiom (see the `'conversations — list view is a full content-area takeover'` block at chat-thread.test.tsx:486 — `localStorageStore('t')` seeding, `fireEvent.click`, `tick()`). Representative:

```tsx
it('home landing: HomePanel + tab bar render, composer hidden, header toggle gone', async () => {
  const store = localStorageStore('t-home');
  await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
  const { container } = render(() => (
    <ChatThread messages={[]} home={{}} conversations={true} store={store}
      onSubmit={() => {}} onConversationLoad={() => {}} />
  ));
  await tick();
  expect(container.querySelector('[part="home"]')).toBeTruthy();
  expect(container.querySelector('[role="tablist"]')).toBeTruthy();
  expect(container.querySelector('textarea, [contenteditable]')).toBeNull();
  expect(container.querySelector('[data-kai-conversations-toggle]')).toBeNull();
});

it('drilled chat from a list row hides the tab bar; back returns to the list', async () => {
  const store = localStorageStore('t-drill');
  await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
  const { container } = render(() => (
    <ChatThread messages={[]} home={{}} conversations={true} store={store}
      onSubmit={() => {}} onConversationLoad={() => {}} />
  ));
  await tick();
  fireEvent.click(container.querySelector('[data-kai-tab-messages]')!);
  await tick();
  fireEvent.click(container.querySelector('[data-conversation-id]')!);
  await tick();
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  fireEvent.click(container.querySelector('[data-kai-home-back]')!);
  await tick();
  expect(container.querySelector('[data-kai-new-conversation]')).toBeTruthy(); // the list again
});
```

- [ ] **Step 2: Run red** — `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- src/components/chat-thread.test.tsx`.

- [ ] **Step 3: Implement.** Sketch of the state changes (adapt to the file's real structure; read the whole conversations region L361-575 first):

```tsx
type WidgetView = 'home' | 'chat' | 'list';
const homeEnabled = () => props.home != null;
const [view, setView] = createSignal<WidgetView>(props.home != null ? 'home' : 'chat');
// Drilled vs root: a chat entered from home/list is drilled; the Messages-tab
// single chat (conversations off) is a root chat.
const [chatEntry, setChatEntry] = createSignal<'home' | 'list' | null>(null);
const tabBarVisible = () => homeEnabled() && (view() !== 'chat' || chatEntry() === null);
const activeTab = (): 'home' | 'messages' => (view() === 'home' ? 'home' : 'messages');
const openMessagesTab = () => {
  setChatEntry(null);
  if (conversationsReady()) { setView('list'); void refreshConversations(); }
  else setView('chat');
};
const recentSummary = createMemo(() => {
  if (!homeEnabled() || props.home?.recentConversation !== true || !conversationsReady()) return undefined;
  const s = conversationSummaries();
  return s.length ? [...s].sort(byRecency)[0] : undefined;
});
```

Wiring points:
- Header: when `homeEnabled()`, suppress the existing conversations toggle (`<Show when={props.conversations && props.store && !homeEnabled()}>`); add a back button `data-kai-home-back` shown when `view() === 'chat' && chatEntry() !== null`, `aria-label="Back"`, `ArrowLeft` glyph (already imported), `onClick={() => setView(chatEntry()!)}`.
- Content area: extend the existing `<Show when={view() === 'list' …}>` structure to a `<Switch>` over `view()`; the `'home'` branch renders `<HomePanel greeting={props.home?.greeting} recent={recentSummary()} newChatLabel={props.home?.newConversation?.label} links={props.home?.links} onSelectRecent={(id) => { setChatEntry('home'); void selectConversation(id); setView('chat'); }} onNewChat={() => { setChatEntry('home'); startNewConversation(); }} onLink={(entry) => props.onHomeLink?.(entry)} />`. ChatThread never passes `showNewConversation` — the new-conversation card is always on in v1 (the schema has no off-switch); the prop exists for the story/composition layer only.
- `selectConversation` currently flips to `'chat'` itself — verify at L404-425 and route the drilled-entry bookkeeping through the call sites as above; the LIST's `onSelect` sets `setChatEntry('list')` when `homeEnabled()`, `null` otherwise (no back arrow in the non-home widget).
- Tab bar: render after the content area, `<Show when={tabBarVisible()}><WidgetTabBar active={activeTab()} onChange={(t) => (t === 'home' ? setView('home') : openMessagesTab())} unread={anyUnread()} /></Show>`.
- Composer/footer wrapper: the existing `<Show when={view() !== 'list'}>` becomes `<Show when={view() === 'chat'}>`.
- `closeConversationsList: () => setView(homeEnabled() ? 'home' : 'chat')` (+ doc comment update at L268-279).
- Auto-restore `onMount` (L557): keep `if (view() !== 'chat') return;` — with home the view is `'home'` so auto-select is already skipped; ADD an unconditional-on-home `refreshConversations()` call so summaries hydrate (contract 8). Verify the unread hydration effects (`seenNow`/`markRead`/`anyUnread`, L495-536) are view-independent — they read summaries, so hydrating summaries is sufficient.
- `showHeader()` (L600): add `|| homeEnabled()` only if the back arrow requires the header on drilled chats even for constructs with no `header.title` — it does; include it gated to the drilled state: `|| (homeEnabled() && view() === 'chat' && chatEntry() !== null)`. On the `'home'`/`'list'` root views with no title the header may stay hidden (HomePanel carries its own greeting).

- [ ] **Step 4: Run the FULL chat-thread + facade-adjacent files green**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- src/components/chat-thread.test.tsx src/components/home-panel.test.tsx src/components/reactivity-contract.test.tsx` → PASS, including every pre-existing conversations test (regressions here mean the no-home path changed — contract 2 forbids that).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/chat-thread.tsx packages/ui/src/components/chat-thread.test.tsx
git commit -m "feat(home): ChatThread home|chat|list view machine with tab bar and back-target"
```

---

### Task 4: `kai-chat` facade — forward `home`, dispatch `kai-home-link`

**Files:**
- Modify: `packages/ui/src/elements/chat.tsx`
- Test: `packages/ui/tests/elements/chat-home.test.tsx` (create; copy the shim/flush harness from `tests/elements/chat-conversations.test.tsx`)

**Interfaces:**
- Consumes: `ChatThreadProps.home` / `onHomeLink` (Task 3), `HomeConfig`/`HomeLinkEntry` from `../types`.
- Produces: `<kai-chat>` property `home?: HomeConfig` (object prop — PROPERTY ONLY, never an attribute) and non-bubbling event `'kai-home-link': { entry: HomeLinkEntry }`.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/tests/elements/chat-home.test.tsx  (top-of-file: import '../../src/elements/chat'; + the scrollTo/ResizeObserver shims + flush() from chat-conversations.test.tsx)
test('home is a property-only prop; setting it renders the home view + tab bar in the shadow root', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { home?: unknown; messages?: unknown[] };
  el.home = { greeting: { title: 'Hey' } };
  el.messages = [];
  document.body.appendChild(el);
  await flush();
  expect(el.shadowRoot!.querySelector('[part="home"]')).toBeTruthy();
  expect(el.shadowRoot!.querySelector('[role="tablist"]')).toBeTruthy();
  expect(el.getAttribute('home')).toBeNull();
});

test('an href-less home link tap dispatches kai-home-link with the entry, non-bubbling', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { home?: unknown; messages?: unknown[] };
  el.home = { links: [{ label: 'Talk to sales' }] };
  el.messages = [];
  document.body.appendChild(el);
  await flush();
  const seen: unknown[] = [];
  el.addEventListener('kai-home-link', (e) => seen.push((e as CustomEvent).detail));
  (el.shadowRoot!.querySelector('button[data-kai-home-link]') as HTMLElement).click();
  await flush();
  expect(seen).toEqual([{ entry: expect.objectContaining({ label: 'Talk to sales' }) }]);
});

test('no home property → no tab bar (the no-home widget is unchanged)', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { messages?: unknown[] };
  el.messages = [];
  document.body.appendChild(el);
  await flush();
  expect(el.shadowRoot!.querySelector('[role="tablist"]')).toBeNull();
});
```

- [ ] **Step 2: Run red** — `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- tests/elements/chat-home.test.tsx`.

- [ ] **Step 3: Implement the forwarding** (the types-without-forwarding trap: ALL FOUR sites, in one edit):

1. `Omit<ChatThreadProps, …>` list (~L20-38): add `'home' | 'onHomeLink'` and re-declare `home?: HomeConfig` with element-facing docs (object prop — JS property only).
2. Event map (~L169): `'kai-home-link': { entry: HomeLinkEntry };`
3. Defaults object (~L179): `home: undefined,`
4. JSX (~L253): `home={props.home as HomeConfig | undefined} onHomeLink={(entry) => dispatch('kai-home-link', { entry })}`

- [ ] **Step 4: Run green, then regenerate + diff the generated surfaces**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- tests/elements/chat-home.test.tsx` → PASS.
Then inside `packages/ui`: `npm run build:api` (never `gen-llms.mjs` standalone) and `git diff --stat` — `element-meta.json`, `element-types.d.ts`, `frameworks/react/index.tsx`, `llms-full.txt`, `docs/web-components.md`, `catalog/derived.json` should ALL move (a missing diff = the forwarding trap). Sanity-check no `llms-full.txt` slot row collapsed to `—`.

- [ ] **Step 5: Commit**

```bash
git add -A packages/ui docs/web-components.md
git commit -m "feat(home): kai-chat forwards home config and dispatches kai-home-link"
```

---

### Task 5: Construct vocabulary — schema, codegen, fixture, validate warning

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/schema.ts`
- Modify: `packages/ui/src/agent-tooling/construct/codegen.ts`
- Modify: `packages/ui/src/agent-tooling/construct/cli.ts` (validate warning — READ its output handling first; assumed, not verified)
- Modify: `packages/ui/src/agent-tooling/construct/fixtures/owner-widget.construct.json`
- Test: `packages/ui/src/agent-tooling/construct/schema.test.ts`, `codegen.test.ts` (append; follow each file's existing describe style)

**Interfaces:**
- Consumes: `HomeConfig` shape (Task 1) — the schema mirrors it 1:1.
- Produces: top-level `home` in `ConstructSchema`; `emitHomeProp(c)` / `emitHomeImport(c)` in codegen; regenerated `construct.v1.schema.json` + `apps/docs/public/schemas/construct/v1.json`.

- [ ] **Step 1: Write the failing schema tests**

```ts
it('home: {} is valid and every sub-key is optional (H-1, H-4)', () => {
  expect(ConstructSchema.safeParse({ ...base, home: {} }).success).toBe(true);
  expect(ConstructSchema.safeParse({ ...base, home: {
    greeting: { title: 'Hi', subtitle: 'There' },
    recentConversation: true,
    newConversation: { label: 'Message us' },
    links: [{ label: 'Docs', href: 'https://ui.kitn.ai', description: 'Guides', icon: 'book-open' }],
  } }).success).toBe(true);
});

it('home.links[].href rejects javascript: (untrusted construct author)', () => {
  const r = ConstructSchema.safeParse({ ...base, home: { links: [{ label: 'x', href: 'javascript:alert(1)' }] } });
  expect(r.success).toBe(false);
  expect(JSON.stringify(!r.success && r.error.issues)).toContain('links');
});

it('home.links[].icon: URL-shaped values go through isSafeUrl; names pass untouched', () => {
  expect(ConstructSchema.safeParse({ ...base, home: { links: [{ label: 'x', icon: 'book-open' }] } }).success).toBe(true);
  expect(ConstructSchema.safeParse({ ...base, home: { links: [{ label: 'x', icon: 'javascript:alert(1)' }] } }).success).toBe(false);
});

it('home does NOT require conversations (H-3) — home without any capability parses', () => {
  expect(ConstructSchema.safeParse({ ...base, home: { recentConversation: true } }).success).toBe(true);
});

it('unknown home keys are rejected (strict)', () => {
  expect(ConstructSchema.safeParse({ ...base, home: { search: true } }).success).toBe(false);
});
```

(`base` = the file's existing minimal-valid-construct helper — reuse it, don't invent one.)

- [ ] **Step 2: Run red** — `pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- src/agent-tooling/construct/schema.test.ts`.

- [ ] **Step 3: Implement the schema.** Insert after `empty` (~L142), same idiom:

```ts
/** Home screen (spec 2026-08-27, H-1..H-5): Intercom-style landing view behind
 *  a Home/Messages tab bar. PRESENCE of `home` enables the tab chrome (H-4) —
 *  no `enabled` boolean, like `header`/`empty`. Every sub-key optional;
 *  `home: {}` still means "tabs on, defaults". Never requires another
 *  capability (H-3): the recent card simply renders nothing without
 *  `capabilities.conversations` (the CLI warns — see cli.ts). All strings are
 *  construct-authored/untrusted: JSON.stringify'd at every emit site; hrefs
 *  and URL-shaped icons through isSafeUrl in superRefine below. */
home: z
  .object({
    greeting: z.object({ title: z.string().min(1).optional(), subtitle: z.string().min(1).optional() }).strict().optional(),
    recentConversation: z.literal(true).optional(),
    newConversation: z.object({ label: z.string().min(1).optional() }).strict().optional(),
    links: z.array(
      z.object({
        label: z.string().min(1),
        href: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        /** renderIcon name (e.g. 'book-open') or a safe URL — the icon NAME
         *  list is renderIcon's own vocabulary, never restated here; unknown
         *  names warn loudly at DEV runtime. */
        icon: z.string().min(1).optional(),
      }).strict(),
    ).optional(),
  })
  .strict()
  .optional(),
```

In the existing `superRefine` (after the `empty.icon` block, ~L330), following its exact issue shape:

```ts
const URL_SHAPED = /^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/\//;
for (const [i, link] of (construct.home?.links ?? []).entries()) {
  if (link.href && !isSafeUrl(link.href)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['home', 'links', i, 'href'],
      message: 'href must be an http(s)/mailto or relative URL — no javascript:/data: schemes' });
  }
  if (link.icon && URL_SHAPED.test(link.icon) && !isSafeUrl(link.icon)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['home', 'links', i, 'icon'],
      message: 'icon must be a kit icon name or an http(s)/relative URL — no javascript:/data: schemes' });
  }
}
```

- [ ] **Step 4: Write the failing codegen tests** (in `codegen.test.ts`, mirroring the `emitConversationsProps`-era tests):

```ts
it('home threads through to ChatThread as one JSON.stringify’d prop + onHomeLink wiring is NOT emitted (vocabulary-never-logic)', () => {
  const src = generate({ ...baseWidget, home: { greeting: { title: 'Hi "there"' }, links: [{ label: 'Docs', href: 'https://ui.kitn.ai' }] } });
  expect(src).toContain(` home={${JSON.stringify({ greeting: { title: 'Hi "there"' }, links: [{ label: 'Docs', href: 'https://ui.kitn.ai' }] })}}`);
  expect(src).not.toContain('onHomeLink');
});

it('no home in the construct → no home prop emitted', () => {
  expect(generate(baseWidget)).not.toContain(' home=');
});

it('layout custom does not wire home (pinned, matches header/empty/conversations)', () => {
  const src = generate({ ...baseCustom, home: {} });
  expect(src).not.toContain(' home=');
});

it('widget close-reset gate includes home (close returns the view to Home)', () => {
  const src = generate({ ...baseWidget, home: {} }); // no conversations capability
  expect(src).toContain('closeConversationsList');
});
```

(`generate`/`baseWidget`/`baseCustom` = the file's real helpers — read `codegen.test.ts` first and use its names; if the close-reset assertion's current form differs (L891 gate), mirror how the existing conversations-gate test asserts it.)

- [ ] **Step 5: Implement codegen.** Next to `emitConversationsProps` (~L1113):

```ts
function emitHomeProp(c: Construct): string {
  if (!c.home) return '';
  return ` home={${JSON.stringify(c.home)}}`;
}
```

Wire it into the same ChatThread-prop assembly that consumes `emitHeaderProp`/`emitConversationsProps` (read that assembly site); extend the widget-close-on-list-reset gate at ~L891 to `c.layout === 'widget' && (!!c.capabilities?.conversations || !!c.home)`. `emitCustomApp` stays untouched (ambiguity 6). No import emission needed — `home` is plain data.

- [ ] **Step 6: The validate warning (H-3, decide loudly).** Read `cli.ts`'s validate command output path first. After a successful parse, add:

```ts
if (construct.home?.recentConversation && !construct.capabilities?.conversations) {
  console.warn('warning: home.recentConversation is set but capabilities.conversations is not — the recent-conversation card will render nothing without it.');
}
```

Append a test to the CLI/validate test file if one exists (search `cli.test`); if validate is tested only via the emitted project, assert the warning function at the module level instead — do not leave it untested.

- [ ] **Step 7: Fixture + regeneration.** Add to `fixtures/owner-widget.construct.json` (after `"empty"`):

```json
"home": {
  "greeting": { "title": "Hi from Acme 👋", "subtitle": "Orders, refunds, anything." },
  "recentConversation": true,
  "links": [
    { "label": "Help center", "href": "https://ui.kitn.ai", "description": "Guides and FAQs", "icon": "book-open" },
    { "label": "Talk to sales", "description": "We reply fast", "icon": "message-circle" }
  ]
},
```

Then inside `packages/ui`: `npm run build:api` (regenerates `construct.v1.schema.json` + the docs-site schema copy), and run:

<!-- gate-list: partial -- task-scoped smoke checks for Task 5 only; the full gate set runs in Task 6 -->
```
pnpm --filter @kitn.ai/ui exec vitest run --project=unit -- src/agent-tooling/construct
pnpm --filter @kitn.ai/ui run verify:construct
pnpm --filter @kitn.ai/ui run verify:generated
```

`verify:construct` derives its axes from the schema — read the cell counts it prints; they should have MOVED (a new capability cell). If they didn't, the axis derivation didn't pick `home` up — investigate before proceeding, do not hand-add cells.

- [ ] **Step 8: Commit**

```bash
git add -A packages/ui apps/docs/public/schemas
git commit -m "feat(construct): home vocabulary — schema, codegen threading, fixture, validate warning"
```

---

### Task 6: Demo checkpoint + full gates

**Files:** none created — verification only. Evidence goes in the task report.

- [ ] **Step 1: Full gates, foreground, in this order**

<!-- gate-list: partial -- the gates this feature can move; the merge verdict is the required CI `test` job (44 gates), not this list -->
```bash
nx build ui   # fresh build for the emitted/scaffold gates (use --skip-nx-cache if artifacts look stale)
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
npm run typecheck        # inside packages/ui (the honest one)
pnpm --filter @kitn.ai/ui run verify:construct
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run verify:scaffold
pnpm --filter @kitn.ai/ui run lint:silent-drops
```

ALL must pass. Paste the summary lines (test counts, verify:construct cell counts) into the report — no green claims without output.

- [ ] **Step 2: Live demo against the fixture**

`kai dev` on the owner fixture with a freshly packed tarball (the pattern from the conversations round: `npm pack` the built package, `--ui file:<tarball>`). Verify by driving the real browser (Playwright or Claude-in-Chrome; remember observation tabs are frame-starved — don't file scroll bugs from them): open the widget → lands on Home with greeting + links + recent card; Messages tab → list with unread dots; row tap → drilled chat, tab bar gone, back arrow returns; home's new-conversation card → fresh chat; close + reopen → Home again. Screenshot each state.

- [ ] **Step 3: Storybook pass** — `pnpm dev`, confirm the three HomePanel stories render in light + dark.

- [ ] **Step 4: Final commit + report** — screenshots + gate outputs to the supervisor; the owner reviews story + demo together (waived mid-round gate).

## Follow-ups to file at merge (do NOT fold in)

- Facade docs page for `home` on the docs site (the docs round owns it).
- `WidgetTabBar` keyboard arrow-key tab navigation (roving tabindex) if AT feedback asks for it — v1 ships two focusable tabs.
- Issue #335 closes with Task 2; #334/#336/#337 remain open (untouched by this plan — #336's lesson is applied to the NEW tab bar only).
