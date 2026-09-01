/**
 * `AppHeader` — the workspace's app-level top bar, PROMOTED from
 * `src/elements/builder-workspace.stories.tsx`'s local `AppHeader`/
 * `ThemeToggleButton` (2026-08-30). That story is the APPROVED DESIGN — the
 * owner's own feedback rounds are recorded in its module comment — and the
 * emitted app had drifted off it (a text "Theme" button, no search at all, a
 * bare avatar with no menu, and the whole cluster stuffed into ChatThread's
 * own header row inside the chat rail). The story now renders THIS component
 * instead of its own copy, exactly as `components/work-surface.tsx` did for the
 * pane chrome, so design and product cannot drift apart again.
 *
 * WHERE IT SITS: a top-level strip ABOVE the split entirely (a sibling of
 * `WorkspaceShell`, not inside it), so it persists through the work surface's
 * Expand toggle — mirroring Lovable's own top bar, which lives outside/above
 * its split body. It does NOT replace `ChatThread`'s built-in header row; the
 * story ships both (the app strip across the frame, the rail's own title row
 * inside it) and the emitted app now does too.
 *
 * THE ARRANGEMENT IS NOT CONFIGURABLE — owner ruling, and the reason this is
 * one component rather than a slot bag. Left to right:
 *
 *     [ title ]                    [ search · theme ] | [ actions ] | [ user ]
 *
 *  - the TITLE on the LEFT;
 *  - a utility cluster (search, theme toggle) on the right;
 *  - a divider;
 *  - the header actions row (Share/Deploy in the starters, but a real
 *    construct-authored ordered list — `header.actions`);
 *  - a divider;
 *  - the user cluster, COMPACT: initials avatar + chevron only, no name/plan
 *    text (the owner's own instruction), with the name/plan still feeding the
 *    initials and the accessible name so the control never loses its name to
 *    assistive tech just because the text is hidden.
 *
 * Dividers render only between two groups that both actually have visible
 * content, so switching a group off never leaves an orphan divider.
 *
 * SUPERSEDED HISTORY, recorded so nobody re-litigates it. The FIRST round
 * resolved a contradictory brief ("product title on the right" vs "mirror
 * Lovable's placement exactly", and Lovable's real header puts brand LEFT /
 * actions RIGHT) as a MIRROR of Lovable — actions left, title right — which
 * satisfied both halves of the instruction at once. The owner then ruled
 * explicitly, superseding that judgment call: title on the LEFT, and the right
 * side is the full explicit arrangement above rather than a single actions
 * cluster. Do not "fix" this back toward the mirror; it was already fixed.
 *
 * MENU-HONESTY (this repo's standing rule, and the reason every piece is
 * gated on a MECHANISM and not only on a flag): an affordance with nothing
 * behind it must not render. `showSearch` without `onSearch`, `actions`
 * without `onActionSelect`, `user` without `onUserMenuSelect`,
 * `showThemeToggle` without `onToggleDark` — each renders NOTHING rather than
 * a control that swallows its own click. This is the same shape
 * `WorkSurface`'s `showOpenInNewTab && src` gate takes, for the same reason.
 * Both real call sites always supply the mechanism: the story wires search to
 * its command-palette overlay and reports actions/menu selections in its own
 * preview strip; codegen wires search to the `shell.commandPalette` overlay it
 * emits, the theme toggle to the host's `theme` attribute, and
 * actions/user-menu items to the documented `kai-header-action` /
 * `kai-user-menu` CustomEvents on the host.
 *
 * THEME TOGGLE: icon-only, showing the icon for the mode you would switch TO
 * (Sun while dark — "tap for light" — Moon while light), never "dark mode" /
 * "light mode" text and never the plain text button the emitted app used to
 * render. `dark` is CONTROLLED, never owned here: the story flips a class on
 * its preview frame, codegen flips the host element's `theme` attribute, and
 * this component only reports the click.
 *
 * STYLING follows the same rule as every kit component (Tailwind utilities
 * compiled into the shadow sheet), not the emitted project's inline-style
 * convention — that convention governs the JSX CODEGEN WRITES, which is why
 * composing this component there is what keeps the emitted app on the design.
 *
 * ONE DELIBERATE CHANGE FROM THE STORY, decided loudly: the strip PAINTS ITS
 * OWN `bg-background`. The story's copy had none and did not need one — it sits
 * inside a preview frame that already paints that exact token. A promoted
 * component has no such guarantee, and the emitted app proved it in the first
 * live capture: above the split, outside `WorkspaceShell` (which paints
 * `bg-background` itself), the strip was transparent, so dark-theme foreground
 * text landed on the page's white. Same token, so the story's look is
 * unchanged; the component just no longer depends on its host for a floor.
 */
import { type JSX, Show, For } from 'solid-js';
import { Search, Sun, Moon, ChevronDown, Settings, CircleHelp, LogOut } from 'lucide-solid';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { Tooltip } from '../ui/tooltip';
import { Avatar } from '../ui/avatar';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator } from '../ui/dropdown';
import type { ButtonVariantName } from '../ui/button-variant-names';

/** One header action button. `variant` is the kit Button's OWN variant name —
 *  the construct schema's `header.actions[].variant` enum is built from the
 *  same `BUTTON_VARIANT_NAMES` list, so there is no second vocabulary here to
 *  keep in step. */
export interface AppHeaderAction {
  label: string;
  variant?: ButtonVariantName;
}

/** The user menu's fixed recipe rows. A closed union rather than an authored
 *  list: a construct has no app code to run a custom row, so offering one
 *  would be the dead affordance this component's doc comment rejects. */
export type AppHeaderUserMenuItem = 'settings' | 'help' | 'log-out';

const USER_MENU_ITEMS: readonly {
  id: AppHeaderUserMenuItem;
  label: string;
  Icon: typeof Settings;
  separatorBefore?: boolean;
}[] = [
  { id: 'settings', label: 'Settings', Icon: Settings },
  { id: 'help', label: 'Get help', Icon: CircleHelp },
  { id: 'log-out', label: 'Log out', Icon: LogOut, separatorBefore: true },
];

export interface AppHeaderProps {
  /** Rendered on the LEFT. Absent or empty renders no title (and no gap). */
  title?: string;

  /** Asks for the search affordance. It renders only when `onSearch` is also
   *  given — see the menu-honesty note in this module's doc comment. */
  showSearch?: boolean;
  /** What search DOES. In both real call sites: open the command palette. */
  onSearch?: () => void;

  /** Asks for the theme toggle. Renders only with `onToggleDark`. */
  showThemeToggle?: boolean;
  /** Current resolved mode — CONTROLLED, never owned here. Drives which icon
   *  shows (the mode you would switch TO) and the accessible name. */
  dark?: boolean;
  onToggleDark?: () => void;

  /** The ordered action row. Renders only with `onActionSelect`. */
  actions?: readonly AppHeaderAction[];
  onActionSelect?: (action: AppHeaderAction) => void;

  /** The signed-in user. `name` feeds the initials and the accessible name;
   *  `plan` only the accessible name (the compact cluster shows no text).
   *  Renders only with `onUserMenuSelect`. */
  user?: { name: string; plan?: string };
  onUserMenuSelect?: (item: AppHeaderUserMenuItem) => void;

  class?: string;
}

export function AppHeader(props: AppHeaderProps): JSX.Element {
  const searchVisible = (): boolean => !!props.showSearch && !!props.onSearch;
  const themeVisible = (): boolean => !!props.showThemeToggle && !!props.onToggleDark;
  const utilityVisible = (): boolean => searchVisible() || themeVisible();
  const actionsVisible = (): boolean => !!props.actions?.length && !!props.onActionSelect;
  const userVisible = (): boolean => !!props.user && !!props.onUserMenuSelect;

  const themeLabel = (): string => (props.dark ? 'Switch to light mode' : 'Switch to dark mode');
  const userLabel = (): string => {
    const user = props.user;
    if (!user) return 'Account menu';
    return `${user.name}${user.plan ? ` — ${user.plan}` : ''} account menu`;
  };

  return (
    <header
      class={cn(
        'flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4',
        props.class,
      )}
      data-kai-app-header
    >
      <div class="flex min-w-0 items-center gap-2">
        <Show when={props.title}>
          <span class="truncate text-sm font-semibold text-foreground" data-kai-app-header-title>
            {props.title}
          </span>
        </Show>
      </div>

      <div class="flex items-center gap-2">
        <Show when={utilityVisible()}>
          <div class="flex items-center gap-1" data-kai-app-header-utility>
            <Show when={searchVisible()}>
              <Tooltip content="Search commands">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Search commands"
                  onClick={() => props.onSearch?.()}
                >
                  <Search size={14} aria-hidden="true" />
                </Button>
              </Tooltip>
            </Show>
            <Show when={themeVisible()}>
              <Tooltip content={themeLabel()}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={themeLabel()}
                  onClick={() => props.onToggleDark?.()}
                >
                  {props.dark ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
                </Button>
              </Tooltip>
            </Show>
          </div>
        </Show>

        <Show when={utilityVisible() && (actionsVisible() || userVisible())}>
          <Separator orientation="vertical" class="h-5" />
        </Show>

        <Show when={actionsVisible()}>
          <div class="flex items-center gap-2" data-kai-app-header-actions>
            <For each={props.actions}>
              {(action) => (
                <Button type="button" variant={action.variant} size="sm" onClick={() => props.onActionSelect?.(action)}>
                  {action.label}
                </Button>
              )}
            </For>
          </div>
        </Show>

        <Show when={actionsVisible() && userVisible()}>
          <Separator orientation="vertical" class="h-5" />
        </Show>

        <Show when={userVisible()}>
          <Dropdown>
            <DropdownTrigger
              as={(triggerProps: JSX.ButtonHTMLAttributes<HTMLButtonElement>) => (
                <button
                  type="button"
                  aria-label={userLabel()}
                  class="flex min-w-0 items-center gap-2 rounded-md p-1 text-left hover:bg-muted"
                  data-kai-app-header-user
                  {...triggerProps}
                >
                  <Avatar fallback={props.user!.name.slice(0, 2).toUpperCase()} size="sm" />
                  <ChevronDown size={13} class="shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              )}
            />
            <DropdownContent>
              <For each={USER_MENU_ITEMS}>
                {(item) => (
                  <>
                    <Show when={item.separatorBefore}>
                      <DropdownSeparator />
                    </Show>
                    <DropdownItem onSelect={() => props.onUserMenuSelect?.(item.id)}>
                      <item.Icon size={14} class="mr-2 size-3.5 shrink-0" aria-hidden="true" />
                      {item.label}
                    </DropdownItem>
                  </>
                )}
              </For>
            </DropdownContent>
          </Dropdown>
        </Show>
      </div>
    </header>
  );
}
