import { Conversations } from '@kitn.ai/ui/react';
import type { Theme } from '../App';
import type { Scenario } from '../chat-data';

interface SidebarProps {
  theme: Theme;
  scenarios: Scenario[];
  activeId: string;
  collapsed: boolean;
  onRun: (scenario: Scenario) => void;
  onNewChat: () => void;
  onToggle: () => void;
}

/**
 * The rail — `<kai-conversations>` repurposed as a scenario picker. Selecting an
 * entry starts a fresh thread and fires its prompt at the real model, so each
 * kit component (tool panel / sources / cards) is one click away.
 */
export function Sidebar({ theme, scenarios, activeId, collapsed, onRun, onNewChat, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar">
      <Conversations
        theme={theme}
        groups={[]}
        conversations={scenarios}
        activeId={activeId}
        collapsed={collapsed}
        onConversationSelect={(e) => {
          const hit = scenarios.find((s) => s.id === e.detail.id);
          if (hit) onRun(hit);
        }}
        onNewChat={onNewChat}
        onToggleSidebar={onToggle}
      />
    </aside>
  );
}
