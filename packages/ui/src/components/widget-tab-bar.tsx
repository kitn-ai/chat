import { Show } from 'solid-js';
import { cn } from '../utils/cn';
import { renderIcon } from '../ui/icon';

export interface WidgetTabBarProps {
  active: 'home' | 'messages';
  onChange: (tab: 'home' | 'messages') => void;
  /** Whether the Messages tab has unread activity. Reaches BOTH the visible
   *  dot and the tab's accessible name (`aria-label`) — a dot alone is
   *  invisible to assistive tech, the #336 lesson this test pins. */
  unread?: boolean;
  homeLabel?: string;
  messagesLabel?: string;
}

/**
 * The widget's Home/Messages tab bar (Intercom-pattern chrome, H-2/H-6). Real
 * `tablist`/`tab` semantics — this is a persistent view switch within the
 * widget, not page navigation, so it is not `<Nav>`'s `role="page"` dialect.
 */
export function WidgetTabBar(props: WidgetTabBarProps) {
  const home = () => props.homeLabel ?? 'Home';
  const messages = () => props.messagesLabel ?? 'Messages';
  const messagesLabel = () => (props.unread ? `${messages()} (unread)` : messages());

  return (
    <nav
      role="tablist"
      aria-label="Widget navigation"
      class="flex h-14 shrink-0 items-stretch border-t border-border bg-background"
    >
      <button
        type="button"
        role="tab"
        data-kai-tab-home
        aria-selected={props.active === 'home'}
        aria-label={home()}
        onClick={() => props.onChange('home')}
        class={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors',
          props.active === 'home' ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {renderIcon('home', { class: 'size-5' })}
        <span>{home()}</span>
      </button>
      <button
        type="button"
        role="tab"
        data-kai-tab-messages
        aria-selected={props.active === 'messages'}
        aria-label={messagesLabel()}
        onClick={() => props.onChange('messages')}
        class={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors',
          props.active === 'messages' ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span class="relative">
          {renderIcon('message-square', { class: 'size-5' })}
          <Show when={props.unread}>
            <span
              data-kai-tab-unread
              aria-hidden="true"
              class="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-unread"
            />
          </Show>
        </span>
        <span>{messages()}</span>
      </button>
    </nav>
  );
}
