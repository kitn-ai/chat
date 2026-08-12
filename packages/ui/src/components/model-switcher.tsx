import { splitProps, For, Show, createSignal } from 'solid-js';
import { cn } from '../utils/cn';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownRadioItem, type DropdownController } from '../ui/dropdown';
import { Button } from '../ui/button';
import type { ModelOption } from '../types';

export interface ModelSwitcherProps {
  models: ModelOption[];
  currentModelId: string;
  onModelChange: (modelId: string) => void;
  class?: string;
  /** Initial open state of the dropdown (uncontrolled seed). */
  defaultOpen?: boolean;
  /** Disable the trigger — click/keyboard no longer open the dropdown. */
  disabled?: boolean;
  /** Receive the dropdown's open controller (forwarded from the inner Dropdown). */
  controllerRef?: (api: DropdownController) => void;
}

const Chevron = (props: { class?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class={props.class}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/**
 * One selectable model.
 *
 * A single-select list of models IS a radio group, so this routes through
 * `DropdownRadioItem` (`role="menuitemradio"` + `aria-checked`) rather than
 * hand-rolling those attributes onto a plain `DropdownItem`. Being the current
 * model used to render as `font-medium` and nothing else — invisible to a screen
 * reader. `kai-menu` already renders its radio items this way.
 *
 * `DropdownRadioItem` deliberately does NOT close the menu on activation (it is
 * built for groups the consumer keeps mutating), so `onSelect` closes it here to
 * preserve the pick-and-close behaviour `DropdownItem` used to provide.
 */
function ModelRow(props: {
  model: ModelOption;
  currentModelId: string;
  onModelChange: (id: string) => void;
  onClose: () => void;
}) {
  const subtitle = () => props.model.description ?? props.model.provider;
  const checked = () => props.model.id === props.currentModelId;
  return (
    <DropdownRadioItem
      checked={checked()}
      onSelect={() => { props.onModelChange(props.model.id); props.onClose(); }}
    >
      <div class="flex flex-col">
        <span class={cn('text-body', checked() && 'font-medium text-foreground')}>{props.model.name}</span>
        <Show when={subtitle()}><span class="text-caption text-muted-foreground">{subtitle()}</span></Show>
      </div>
    </DropdownRadioItem>
  );
}

export function ModelSwitcher(props: ModelSwitcherProps) {
  const [local] = splitProps(props, ['models', 'currentModelId', 'onModelChange', 'class', 'defaultOpen', 'disabled', 'controllerRef']);
  const currentModel = () => local.models.find((m) => m.id === local.currentModelId);

  // The rows are DropdownRadioItems, which stay open by design, so the switcher
  // needs its own handle on the dropdown to close after a pick. Tapping
  // `controllerRef` keeps that inside this component — the dropdown's own context
  // is module-private — and the consumer's `controllerRef` is still called, so
  // this is invisible from the outside.
  let controller: DropdownController | undefined;
  const closeMenu = () => controller?.setOpen(false);

  // Ungrouped models list first; grouped models collect under their group name,
  // preserving first-seen group order.
  const ungrouped = () => local.models.filter((m) => !m.group);
  const groups = () => {
    const order: string[] = [];
    const byGroup = new Map<string, ModelOption[]>();
    for (const m of local.models) {
      if (!m.group) continue;
      if (!byGroup.has(m.group)) { byGroup.set(m.group, []); order.push(m.group); }
      byGroup.get(m.group)!.push(m);
    }
    return order.map((name) => ({ name, models: byGroup.get(name)! }));
  };

  return (
    <Show when={local.models.length > 1}>
      <Dropdown
        defaultOpen={local.defaultOpen}
        disabled={local.disabled}
        controllerRef={(api) => { controller = api; local.controllerRef?.(api); }}
      >
        <DropdownTrigger as={(triggerProps: any) => (
          <Button variant="ghost" size="sm" class={cn('gap-1 text-meta text-muted-foreground', local.class)} {...triggerProps}>
            {currentModel()?.name ?? local.currentModelId}
            <Chevron />
          </Button>
        )} />
        <DropdownContent>
          <For each={ungrouped()}>
            {(model) => <ModelRow model={model} currentModelId={local.currentModelId} onModelChange={local.onModelChange} onClose={closeMenu} />}
          </For>
          <For each={groups()}>
            {(group) => {
              const [open, setOpen] = createSignal(false);
              return (
                <div>
                  <button
                    type="button"
                    aria-expanded={open()}
                    onClick={() => setOpen(!open())}
                    class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-body outline-none transition-colors hover:bg-muted focus:bg-muted"
                  >
                    {group.name}
                    <Chevron class={cn('transition-transform', open() && 'rotate-180')} />
                  </button>
                  <Show when={open()}>
                    <div class="pl-2">
                      <For each={group.models}>
                        {(model) => <ModelRow model={model} currentModelId={local.currentModelId} onModelChange={local.onModelChange} onClose={closeMenu} />}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </DropdownContent>
      </Dropdown>
    </Show>
  );
}
