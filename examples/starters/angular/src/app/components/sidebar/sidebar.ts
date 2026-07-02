import { CUSTOM_ELEMENTS_SCHEMA, Component, input, output } from '@angular/core';
import type { Theme } from '../../types';
import type { Conversation } from '../../../chat-data';

/**
 * The conversation rail — a thin wrapper over `<kai-conversations>`. The `.sidebar`
 * div owns the shell's right border (kept OFF the element so it follows the shell's
 * light/dark tokens, not the element's own re-scoped ones). The rail's `collapsed`
 * is CONTROLLED by the app's collapsed state, so it stays in sync with the parent
 * `<kai-resizable-item collapsed>` and re-expands the list on restore; the internal
 * hamburger still reports the toggle intent up via `(kai-toggle-sidebar)`.
 *
 * Array/object props (`groups`, `conversations`) are set as DOM PROPERTIES via
 * Angular property binding (`[groups]`, `[conversations]`). `collapsed` is a boolean
 * PROPERTY. `activeId` is a scalar the element reads as the `active-id` attribute, so
 * it binds with `[attr.active-id]`. `emptyGroups` is a stable field, not an inline
 * `[]` literal, so the property isn't re-set (and the list re-cleared) every change
 * detection.
 */
@Component({
  selector: 'app-sidebar',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  theme = input.required<Theme>();
  conversations = input.required<Conversation[]>();
  activeId = input.required<string>();
  collapsed = input(false);

  select = output<string>();
  newChat = output<void>();
  toggle = output<void>();

  // Stable empty-groups reference (this demo uses a flat conversation list).
  readonly emptyGroups: unknown[] = [];

  onSelect(e: Event) {
    this.select.emit((e as CustomEvent<{ id: string }>).detail.id);
  }
}
