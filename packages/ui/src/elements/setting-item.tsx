import { createSignal, onCleanup, onSettled } from 'solid-js';
import { SettingItem } from '../ui/settings-group';
import { defineWebComponent } from './define';

interface Props extends Record<string, unknown> {
  /** Row label (primary text). Attribute: `label`. */
  label?: string;
  /** Optional secondary description under the label. Attribute: `description`. */
  description?: string;
}

/**
 * `<kai-setting-item>` — one row inside a `<kai-settings-group>`: a left
 * label/description block and an optional right-aligned control. Slot the control
 * (a `<kai-switch>`, segmented control, select, …) into `slot="control"`; omit it
 * for a plain label row.
 *
 * Themeable `::part`s: `label` (the label/description block) and `control`.
 *
 * ```html
 * <kai-setting-item label="Reduce motion" description="Minimize animations.">
 *   <kai-switch slot="control"></kai-switch>
 * </kai-setting-item>
 * ```
 */
defineWebComponent<Props>('kai-setting-item', {
  label: '',
  description: undefined,
}, (props, { element }) => {
  // The control region only renders when `slot="control"` is actually filled, so
  // a plain label row has no stray right-side wrapper. An empty `<slot>` is always
  // a truthy node, so we track occupancy and gate on it (the kai-card approach).
  // Re-read on child/attribute mutations so a late-slotted control lights up.
  const [hasControl, setHasControl] = createSignal(false);
  onSettled(() => {
    const read = () => setHasControl(!!element.querySelector(':scope > [slot="control"]'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return () => observer.disconnect();
  });

  return (
    <SettingItem
      label={props.label ?? ''}
      description={props.description}
      control={hasControl() ? <slot name="control" /> : undefined}
    />
  );
});
