import { Conversations } from '@kitn.ai/ui/react';
import type { Theme } from '../App';
import type { RailEntry } from '../chat-data';

interface SidebarProps {
  theme: Theme;
  entries: RailEntry[];
  activeId: string;
  collapsed: boolean;
  onRun: (entry: RailEntry) => void;
  onNewChat: () => void;
  onToggle: () => void;
}

/**
 * The rail: `<kai-conversations>` repurposed as a scenario picker, listing the
 * SAME conformance catalog the Playwright runner drives. Selecting an entry
 * starts a fresh thread and runs that scenario, so every case the suite covers
 * is one click away in the browser too.
 */
export function Sidebar({ theme, entries, activeId, collapsed, onRun, onNewChat, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar">
      <Conversations
        theme={theme}
        groups={[]}
        conversations={entries}
        activeId={activeId}
        collapsed={collapsed}
        onConversationSelect={(e) => {
          const hit = entries.find((s) => s.id === e.detail.id);
          if (hit) onRun(hit);
        }}
        onNewChat={onNewChat}
        onToggleSidebar={onToggle}
      />
    </aside>
  );
}
