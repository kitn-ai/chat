import { type JSX, For, Show } from 'solid-js';
import { MoreHorizontal, X } from 'lucide-solid';
import { type PaneStatusTone } from './pane';
import { cn } from '../utils/cn';

/** The work state of a tab's agent/process, mapped to the kit's tool / status
 *  hues — the SAME vocabulary as {@link './pane'.PaneStatus} and the AgentCard:
 *  working = blue, idle = muted, done = green, error = red, blocked = amber. */
export interface PaneTabStatus {
  /** Which hue the numbered badge takes. */
  tone: PaneStatusTone;
  /** Optional status word shown on the active tab, on hover, and always for a
   *  needs-attention / error tab. Without it only the badge color carries state. */
  label?: string;
  /** Animate a ping ring around the badge — for the live `working` state.
   *  Respects prefers-reduced-motion. */
  pulse?: boolean;
}

/** One tab in a {@link PaneGroup}: an agent/window shown in the strip. */
export interface PaneTab {
  /** Stable id, emitted as the selected value throughout. */
  id: string;
  /** The tab name (the agent / window title). */
  name: string;
  /** Run status — drives the numbered badge color + the status word. Defaults to
   *  an `idle` (muted) badge with no word. */
  status?: PaneTabStatus;
  /** Raise the attention treatment: an amber ring + the status word always shown.
   *  The "this one wants you" signal. */
  needsAttention?: boolean;
  /** The keyboard NUMBER shown inside the badge (the ⌥-jump hint). Defaults to the
   *  tab's 1-based position in the strip. */
  number?: number;
}

export interface PaneGroupProps {
  /** The tabs, left → right. Each is one agent/window in the group. */
  tabs: PaneTab[];
  /** The active tab id. Defaults to the first tab. Drive it from `onTabChange`. */
  active?: string;
  /** A tab was selected (click, Enter/Space, or arrow-key move). */
  onTabChange?: (id: string) => void;
  /** A tab's close (×) was clicked. The consumer drops the tab from `tabs`. */
  onTabClose?: (id: string) => void;
  /** A tab's "…" overflow was clicked. The consumer wires the actual menu; the
   *  group only surfaces the affordance. Omit to hide the "…" button. */
  onTabMenu?: (id: string) => void;
  /** Highlight the frame with a ring/border to mark this as the ACTIVE group in a
   *  multi-group layout. */
  focused?: boolean;
  /** The active pane's body — the consumer owns it and swaps it on `onTabChange`. */
  children?: JSX.Element;
  /** Extra classes for the outer frame. */
  class?: string;
}

/** tone → numbered-badge background (the kit's tool hues + muted for idle). */
const TONE_BG: Record<PaneStatusTone, string> = {
  working: 'bg-tool-blue',
  idle: 'bg-muted-foreground',
  done: 'bg-tool-green',
  error: 'bg-tool-red',
  blocked: 'bg-tool-amber',
};

/** tone → badge digit color (contrasts the solid badge fill). */
const TONE_BADGE_FG: Record<PaneStatusTone, string> = {
  working: 'text-white',
  idle: 'text-background',
  done: 'text-white',
  error: 'text-white',
  blocked: 'text-white',
};

/** tone → matching text color for the inline status word. */
const TONE_TEXT: Record<PaneStatusTone, string> = {
  working: 'text-tool-blue',
  idle: 'text-muted-foreground',
  done: 'text-tool-green',
  error: 'text-tool-red',
  blocked: 'text-tool-amber',
};

/**
 * PaneGroup — an editor group: a TAB STRIP (numbered-status-badge tabs) over a
 * single CONTENT area showing the active tab's pane body. The reusable "one column
 * = a group of agents shown as tabs" primitive from the Multi-Agent Workspace,
 * extracted from the hand-rolled group in the Split Workspace demo.
 *
 * Each tab leads with a small TONE-COLORED NUMBERED BADGE — the color encodes the
 * agent's run status, the digit is its keyboard (⌥-jump) number, unifying status +
 * hint into one element — then the name, then the status WORD (shown on the active
 * tab, on hover, and always for a needs-attention / error tab), an optional "…"
 * overflow, and a close "×". The active tab is highlighted; a needs-attention tab
 * carries an amber ring even when inactive.
 *
 * Composition: the group owns the tab UX; the CONSUMER owns the pane content. It
 * renders `children` as the active pane's body and swaps it in response to
 * `onTabChange`. Selection-only — it never routes content itself.
 *
 * Accessibility: a `role="group"` ("Open panes") strip of real `<button>` tab
 * activators (NOT `role="tab"`, so the strip can legally own the per-tab menu/close
 * buttons) with roving tabindex + Arrow/Home/End navigation; the active activator is
 * marked `aria-current="true"`, and the body is the `role="tabpanel"`. Colors are all
 * token-backed (surface / border / ring / tool-*), so it reads in light and dark.
 * The strip, each tab, and the body are exposed via `::part(tabs|tab|body)` for
 * the `kai-pane-group` facade. Give the group a bounded height for the body scroll.
 */
export function PaneGroup(props: PaneGroupProps) {
  const tabs = () => props.tabs ?? [];
  const activeId = () => props.active ?? tabs()[0]?.id;

  // Roving tabindex needs exactly one tab in the tab order: the active tab gets it,
  // else the first, so the strip is always reachable by Tab.
  const rovingId = () => {
    const a = activeId();
    if (a !== undefined && tabs().some((t) => t.id === a)) return a;
    return tabs()[0]?.id;
  };

  const tabEls: Record<string, HTMLElement> = {};
  const select = (id: string) => props.onTabChange?.(id);

  // Arrow/Home/End move + select (activate on focus move); Enter/Space select.
  // Only handled from the tab itself, never from its nested ×/… buttons.
  const onKeyDown = (e: KeyboardEvent, tab: PaneTab) => {
    if (e.currentTarget !== e.target) return;
    const list = tabs();
    if (list.length === 0) return;
    const i = list.findIndex((t) => t.id === tab.id);
    let next: PaneTab | undefined;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = list[(i + 1) % list.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = list[(i - 1 + list.length) % list.length];
        break;
      case 'Home':
        next = list[0];
        break;
      case 'End':
        next = list[list.length - 1];
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        select(tab.id);
        return;
      default:
        return;
    }
    if (next) {
      e.preventDefault();
      select(next.id);
      tabEls[next.id]?.focus();
    }
  };

  const TabItem = (p: { tab: PaneTab; index: number }) => {
    const tab = () => p.tab;
    const tone = (): PaneStatusTone => tab().status?.tone ?? 'idle';
    const isActive = () => tab().id === activeId();
    const num = () => tab().number ?? p.index + 1;
    // The status word shows on the active tab, on hover, and always when the tab
    // needs attention or has errored.
    const alwaysWord = () => isActive() || !!tab().needsAttention || tone() === 'error';
    // Outer wrapper is a plain div (no ARIA role) so the activator button and
    // the menu/close buttons are siblings -- no nested-interactive violation.
    return (
      <div
        class={cn(
          'group/tab relative flex shrink-0 items-center rounded-md text-xs',
          isActive()
            ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
            : 'text-muted-foreground hover:bg-hover hover:text-foreground',
          tab().needsAttention && !isActive() && 'ring-1 ring-tool-amber/50',
        )}
        data-active={isActive() ? '' : undefined}
        data-needs-attention={tab().needsAttention ? '' : undefined}
      >
        {/* Button-group activator (NOT role="tab") so the strip can legally own the
            sibling menu/close buttons. aria-current marks the active pane. */}
        <button
          ref={(el) => { tabEls[tab().id] = el; }}
          type="button"
          part="tab"
          tabindex={tab().id === rovingId() ? 0 : -1}
          aria-current={isActive() ? 'true' : undefined}
          onClick={() => select(tab().id)}
          onKeyDown={(e) => onKeyDown(e, tab())}
          class="flex cursor-pointer items-center gap-1.5 py-1 pl-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {/* Numbered status badge: color = status, digit = the ⌥-jump number. */}
          <span class="relative flex size-[18px] shrink-0" aria-hidden="true">
            <Show when={tab().status?.pulse}>
              <span class={cn('absolute inset-0 animate-ping rounded opacity-60 motion-reduce:hidden', TONE_BG[tone()])} />
            </Show>
            <span
              class={cn(
                'relative flex size-[18px] items-center justify-center rounded text-caption font-bold leading-none tabular-nums',
                TONE_BG[tone()],
                TONE_BADGE_FG[tone()],
              )}
            >
              {num()}
            </span>
          </span>

          <span class="max-w-[8rem] truncate font-medium">{tab().name}</span>

          <Show when={tab().status?.label}>
            <span
              class={cn(
                'truncate text-micro font-medium',
                TONE_TEXT[tone()],
                alwaysWord() ? 'inline' : 'hidden group-hover/tab:inline',
              )}
            >
              {tab().status!.label}
            </span>
          </Show>
        </button>

        {/* menu/close are siblings to the activator, not descendants -- no nested-interactive. */}
        <span class="ml-0.5 flex shrink-0 items-center pr-1">
          <Show when={props.onTabMenu}>
            <button
              type="button"
              part="menu"
              aria-label={`${tab().name} tab actions`}
              aria-haspopup="menu"
              onClick={(e) => { e.stopPropagation(); props.onTabMenu?.(tab().id); }}
              class={cn(
                'flex size-5 items-center justify-center rounded text-muted-foreground transition-colors',
                'hover:bg-surface-sunken hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                isActive() ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
              )}
            >
              <MoreHorizontal class="size-3.5" aria-hidden="true" />
            </button>
          </Show>
          <Show when={props.onTabClose}>
            <button
              type="button"
              part="close"
              aria-label={`Close ${tab().name}`}
              onClick={(e) => { e.stopPropagation(); props.onTabClose?.(tab().id); }}
              class={cn(
                'flex size-5 items-center justify-center rounded text-muted-foreground transition-colors',
                'hover:bg-surface-sunken hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                isActive() ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
              )}
            >
              <X class="size-3.5" aria-hidden="true" />
            </button>
          </Show>
        </span>
      </div>
    );
  };

  return (
    <div
      data-pane-group
      class={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-surface',
        props.focused ? 'border-ring ring-2 ring-inset ring-ring/35' : 'border-border',
        props.class,
      )}
    >
      <div
        part="tabs"
        role="group"
        aria-label="Open panes"
        class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-1.5 py-1"
      >
        <For each={tabs()}>{(tab, i) => <TabItem tab={tab} index={i()} />}</For>
      </div>

      <div part="body" role="tabpanel" class="min-h-0 flex-1 overflow-y-auto">
        {props.children}
      </div>
    </div>
  );
}
