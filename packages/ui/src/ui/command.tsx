import { For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { renderIcon } from './icon';
import { Kbd } from './kbd';

export interface CommandRow {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  /** Optional keyboard shortcut shown as right-aligned key caps; uses the
   *  kai-kbd `keys` syntax (e.g. "Mod+K", "Alt+1"). */
  shortcut?: string;
}

export interface CommandGroup {
  group?: string;
  items: CommandRow[];
}

export interface CommandListProps {
  groups: CommandGroup[];
  activeId?: string;
  onSelect: (id: string) => void;
  emptyLabel?: string;
  /** Accessible label for the listbox container. Defaults to 'Command palette'. */
  ariaLabel?: string;
  /** id applied to the listbox container, for aria-controls wiring. */
  id?: string;
}

/**
 * `CommandList` — a presentational grouped listbox for command/mention palettes.
 *
 * Renders a `role="listbox"` container. Groups with a `group` name get a muted
 * section header. Each row is a `role="option"` button with icon, label, and
 * optional description. Clicking a row calls `onSelect(id)`. When there are no
 * groups/items it renders `emptyLabel` (default "No results").
 */
export function CommandList(props: CommandListProps): JSX.Element {
  const hasItems = () => props.groups.some((g) => g.items.length > 0);

  return (
    <div
      role={hasItems() ? 'listbox' : undefined}
      aria-label={hasItems() ? (props.ariaLabel ?? 'Command palette') : undefined}
      id={props.id}
    >
      <Show
        when={hasItems()}
        fallback={
          <div class="px-3 py-4 text-center text-sm text-muted-foreground select-none">
            {props.emptyLabel ?? 'No results'}
          </div>
        }
      >
        <For each={props.groups}>
          {(group) => (
            <Show when={group.items.length > 0}>
              <>
                <Show when={group.group}>
                  <div class="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground select-none">
                    {group.group}
                  </div>
                </Show>
                <For each={group.items}>
                  {(row) => (
                    <button
                      role="option"
                      aria-selected={row.id === props.activeId ? 'true' : 'false'}
                      class={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                        row.id === props.activeId
                          ? 'bg-muted text-foreground'
                          : 'text-foreground hover:bg-muted',
                      )}
                      // Prevent blur on the search input so keyboard nav keeps working.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => props.onSelect(row.id)}
                    >
                      <Show when={row.icon}>{(icon) => renderIcon(icon(), { imgClass: 'size-4 shrink-0 rounded object-cover', spanClass: 'flex size-4 shrink-0 items-center justify-center text-sm', ariaHidden: true })}</Show>
                      <span class="font-medium whitespace-nowrap shrink-0">{row.label}</span>
                      <Show when={row.description}>
                        <span class="min-w-0 truncate text-muted-foreground">{row.description}</span>
                      </Show>
                      <Show when={row.shortcut}>
                        {(sc) => (
                          <span part="shortcut" class="ml-auto shrink-0 pl-3">
                            <Kbd keys={sc()} platform="auto" size="sm" />
                          </span>
                        )}
                      </Show>
                    </button>
                  )}
                </For>
              </>
            </Show>
          )}
        </For>
      </Show>
    </div>
  );
}
