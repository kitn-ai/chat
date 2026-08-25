import { omit, Show, For } from 'solid-js';
import { cn } from '../utils/cn';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, type DropdownController } from '../ui/dropdown';
import { Button } from '../ui/button';
import type { SearchFilters } from '../types';

export interface ChatScopePickerProps {
  currentLabel: string;
  onScopeChange: (filters: SearchFilters | undefined) => void;
  availableAuthors?: string[];
  availableTags?: string[];
  class?: string;
  /** Initial open state of the dropdown (uncontrolled seed). */
  defaultOpen?: boolean;
  /** Disable the trigger — click/keyboard no longer open the dropdown. */
  disabled?: boolean;
  /** Receive the dropdown's open controller (forwarded from the inner Dropdown). */
  controllerRef?: (api: DropdownController) => void;
}

export function ChatScopePicker(props: ChatScopePickerProps) {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;
  return (
    <Dropdown
      defaultOpen={local.defaultOpen}
      disabled={local.disabled}
      controllerRef={local.controllerRef}
    >
      <DropdownTrigger as={(triggerProps: any) => (
        <Button variant="ghost" size="sm" class={cn('gap-1 text-xs', local.class)} {...triggerProps}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          {local.currentLabel}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </Button>
      )} />
      <DropdownContent class="min-w-[180px]">
        <DropdownItem onSelect={() => local.onScopeChange(undefined)}>All Content</DropdownItem>
        <Show when={local.availableAuthors?.length}>
          <div class="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Authors</div>
          <For each={local.availableAuthors}>
            {(author) => (
              <DropdownItem onSelect={() => local.onScopeChange({ authors: [author] })}>{author}</DropdownItem>
            )}
          </For>
        </Show>
        <Show when={local.availableTags?.length}>
          <div class="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Tags</div>
          <For each={local.availableTags}>
            {(tag) => (
              <DropdownItem onSelect={() => local.onScopeChange({ tags: [tag] })}>{tag}</DropdownItem>
            )}
          </For>
        </Show>
      </DropdownContent>
    </Dropdown>
  );
}
