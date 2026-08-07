import { Conversations } from '@kitn.ai/ui/react';
import type { Theme } from '../App';
import type { Conversation } from '../chat-data';

interface SidebarProps {
  theme: Theme;
  conversations: Conversation[];
  activeId: string;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onToggle: () => void;
}

/**
 * The conversation rail — a thin wrapper over `<kai-conversations>`. The `.sidebar`
 * div owns the shell's right border (kept OFF the element so it follows the shell's
 * light/dark tokens, not the element's own re-scoped ones). The rail's `collapsed`
 * is CONTROLLED by the app's collapsed state, so it stays in sync with the parent
 * `<ResizableItem collapsed>` and re-expands the list on restore; `onToggleSidebar`
 * still reports the toggle intent up via `onToggle`.
 */
export function Sidebar({ theme, conversations, activeId, collapsed, onSelect, onNewChat, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar">
      <Conversations
        theme={theme}
        groups={[]} /* flat list: the element buckets `conversations` by recency itself */
        conversations={conversations}
        activeId={activeId}
        collapsed={collapsed}
        onConversationSelect={(e) => onSelect(e.detail.id)}
        onNewChat={onNewChat}
        onToggleSidebar={onToggle}
      />
    </aside>
  );
}
