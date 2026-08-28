import { type JSX, createSignal, createMemo, Show } from 'solid-js';
import { Search, ChevronDown, Settings, CircleHelp, LogOut } from 'lucide-solid';
import { CommandList, type CommandGroup } from '../ui/command';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator } from '../ui/dropdown';
import { Avatar } from '../ui/avatar';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { cn } from '../utils/cn';

/**
 * "App chrome" — the Command palette and User menu shell knobs (owner
 * discovery round), factored as a shared module so every shell-bearing
 * template (`Labs/Builder/Assistant`, `.../Workspace`, `.../Multi-mode`)
 * reuses the same real pieces instead of forking a fourth copy —
 * consistent with `builder-composer-triggers.tsx`'s own rule-of-three
 * extraction earlier this round.
 *
 * COMMAND PALETTE: composes the kit's real `CommandList` (`ui/command.tsx`)
 * — a presentational grouped listbox — inside a hand-built overlay
 * (backdrop + centered panel + Escape/backdrop-click to close), the SAME
 * shape `elements/claude-code.stories.tsx`'s own command-center overlay
 * uses around `kai-command` (read before building this — `CommandList` is
 * that facade's underlying Solid piece; the facade adds the search input's
 * filtering behavior itself, which `CommandList` does not own). A plain
 * `Input` above the list does the filtering here, client-side over a stub
 * catalog, matching claude-code's own placeholder copy style ("Search
 * commands...").
 *
 * USER MENU: `elements/user-menu.stories.tsx`'s own doc comment states it
 * plainly — "the user menu is a RECIPE, not an element... kai-menu with a
 * slotted trigger (kai-avatar + name + plan + a chevron + a kai-status
 * dot)". Reused here as the Solid-tier equivalent: `Dropdown`/
 * `DropdownTrigger`/`DropdownContent`/`DropdownItem` (the same primitives
 * `components/model-switcher.tsx` and the Workspace composer menu already
 * compose) with an `Avatar` + name/plan trigger.
 */

export interface ShellControlsState {
  commandPalette: boolean;
  userMenu: boolean;
}

const STUB_COMMANDS: CommandGroup[] = [
  {
    group: 'Actions',
    items: [
      { id: 'new-chat', label: 'New chat', icon: 'square-pen', shortcut: 'Mod+K' },
      { id: 'search', label: 'Search chats', icon: 'search' },
    ],
  },
  {
    group: 'Settings',
    items: [
      { id: 'theme', label: 'Toggle theme', icon: 'sun' },
      { id: 'settings', label: 'Open settings', icon: 'settings', shortcut: 'Mod+,' },
    ],
  },
];

/** The command palette overlay — mounted only while `open`. Filters the
 *  stub catalog client-side; selecting a row or pressing Escape closes it. */
export function CommandPaletteOverlay(props: { open: boolean; onClose: () => void }): JSX.Element {
  const [query, setQuery] = createSignal('');
  const filtered = createMemo<CommandGroup[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) return STUB_COMMANDS;
    return STUB_COMMANDS.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) })).filter(
      (g) => g.items.length > 0,
    );
  });

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[14vh]"
        onClick={props.onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') props.onClose();
        }}
        data-builder-command-palette
      >
        <div class="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
          <div class="border-b border-border p-2">
            <Input
              value={query()}
              onValueInput={setQuery}
              placeholder="Search commands..."
              leading={<Search size={14} class="text-muted-foreground" aria-hidden="true" />}
              autofocus
            />
          </div>
          <CommandList groups={filtered()} onSelect={() => props.onClose()} />
        </div>
      </div>
    </Show>
  );
}

/** The command palette's TRIGGER — a plain search-icon button, matching
 *  claude-code's own rail-header search affordance. Rendering the overlay
 *  itself is the caller's job (`CommandPaletteOverlay`), so a template can
 *  place the trigger inside its own rail/header chrome while the overlay
 *  mounts at the frame root. */
export function CommandPaletteTrigger(props: { onOpen: () => void }): JSX.Element {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label="Search commands" onClick={props.onOpen}>
      <Search size={14} aria-hidden="true" />
    </Button>
  );
}

/** The user-menu recipe itself — avatar + name/plan trigger, real Dropdown
 *  primitives, a stub items list (Settings/Help/Log out). `compact` (owner
 *  feedback round, Workspace's app-header rework) drops the name/plan text
 *  entirely, rendering avatar + chevron only — for a header utility cluster
 *  where the full name/plan reads as too much next to icon-only siblings.
 *  `name`/`plan` still feed the avatar initials and the accessible name
 *  (`aria-label`) even when compact, so the control never loses its name to
 *  assistive tech just because the text is hidden visually. */
export function UserMenu(props: { name: string; plan?: string; class?: string; compact?: boolean }): JSX.Element {
  return (
    <Dropdown>
      <DropdownTrigger
        as={(triggerProps: JSX.ButtonHTMLAttributes<HTMLButtonElement>) => (
          <button
            type="button"
            aria-label={props.compact ? `${props.name}${props.plan ? ` — ${props.plan}` : ''} account menu` : undefined}
            class={cn(
              'flex min-w-0 items-center gap-2 rounded-md text-left hover:bg-muted',
              props.compact ? 'p-1' : 'w-full px-2 py-1.5',
              props.class,
            )}
            {...triggerProps}
          >
            <Avatar fallback={props.name.slice(0, 2).toUpperCase()} size="sm" />
            {!props.compact && (
              <>
                <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{props.name}</span>
                {props.plan && <span class="shrink-0 text-xs text-muted-foreground">{props.plan}</span>}
              </>
            )}
            <ChevronDown size={13} class="shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        )}
      />
      <DropdownContent>
        <DropdownItem>
          <Settings size={14} class="mr-2 size-3.5 shrink-0" aria-hidden="true" />
          Settings
        </DropdownItem>
        <DropdownItem>
          <CircleHelp size={14} class="mr-2 size-3.5 shrink-0" aria-hidden="true" />
          Get help
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem>
          <LogOut size={14} class="mr-2 size-3.5 shrink-0" aria-hidden="true" />
          Log out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

/** The panel section every shell-bearing template reuses: two toggles,
 *  "Command palette" and "User menu." Preview-only — see each template's
 *  own module doc comment for how the toggles wire into ITS OWN chrome
 *  (the trigger/overlay/menu placement differs per template's real
 *  anatomy, so this section only owns the on/off state, not the layout). */
export function ShellSection(props: { state: ShellControlsState; onChange: (v: ShellControlsState) => void }): JSX.Element {
  return (
    <section class="flex flex-col gap-3 border-b border-border p-4" data-builder-preview-only-controls>
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">App chrome</h3>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Command palette</span>
        <Switch checked={props.state.commandPalette} label="Command palette" onChange={(v) => props.onChange({ ...props.state, commandPalette: v })} />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">User menu</span>
        <Switch checked={props.state.userMenu} label="User menu" onChange={(v) => props.onChange({ ...props.state, userMenu: v })} />
      </div>
      <p class="text-xs text-muted-foreground">
        Preview-only — construct.v1 has no shell/chrome vocabulary today (T-5). Command palette reuses the kit's real CommandList; User
        menu is the kit's own real recipe (Dropdown + Avatar), not a new component.
      </p>
    </section>
  );
}
