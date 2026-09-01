import { TAB_BAR_CLASS, tabBarTabClass, tabBarItemAccessibleName, TabBarItemContent } from './tab-bar';

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
 *
 * A thin two-tab preset over the public tab-bar part (P-2/P-9): the bar and
 * tab chrome are `TAB_BAR_CLASS`/`tabBarTabClass`, each tab's interior is
 * `TabBarItemContent`, and the accessible-name rule is
 * `tabBarItemAccessibleName` — the exact pieces the data-driven `TabBar`
 * renders, so the facade and every composed block paint the same tabs.
 */
export function WidgetTabBar(props: WidgetTabBarProps) {
  const home = () => props.homeLabel ?? 'Home';
  const messages = () => props.messagesLabel ?? 'Messages';

  return (
    <nav role="tablist" aria-label="Widget navigation" class={TAB_BAR_CLASS}>
      <button
        type="button"
        role="tab"
        data-kai-tab-home
        aria-selected={props.active === 'home'}
        aria-label={tabBarItemAccessibleName(home())}
        onClick={() => props.onChange('home')}
        class={tabBarTabClass(props.active === 'home')}
      >
        <TabBarItemContent icon="home" label={home()} />
      </button>
      <button
        type="button"
        role="tab"
        data-kai-tab-messages
        aria-selected={props.active === 'messages'}
        aria-label={tabBarItemAccessibleName(messages(), { dot: props.unread })}
        onClick={() => props.onChange('messages')}
        class={tabBarTabClass(props.active === 'messages')}
      >
        <TabBarItemContent icon="message-square" dot={props.unread} label={messages()} />
      </button>
    </nav>
  );
}
