import { ConversationList } from '@kitn.ai/ui/solid';
import type { ConversationGroup, ConversationSummary } from '@kitn.ai/ui/solid';

interface SidebarProps {
  groups: ConversationGroup[];
  conversations: () => ConversationSummary[];
  activeId: () => string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onToggleSidebar: () => void;
}

/**
 * The conversation rail — a thin wrapper over `<ConversationList>`, which owns
 * the grouping, the search box, the active highlight and the "New chat" button.
 *
 * The `<aside>` around it carries the surface: `--color-muted` sits one step off
 * `--color-background` in both themes, and a 1px right border marks the
 * sidebar | main division at rest, since `<ResizableHandle>` only tints on
 * hover/drag. Kept on the wrapper rather than on the element so it follows the
 * shell's light/dark tokens.
 */
export function Sidebar(props: SidebarProps) {
  return (
    <aside class="h-full min-h-0 overflow-hidden border-r border-border bg-muted">
      <ConversationList
        groups={props.groups}
        conversations={props.conversations()}
        activeId={props.activeId()}
        onSelect={props.onSelect}
        onNewChat={props.onNewChat}
        onToggleSidebar={props.onToggleSidebar}
      />
    </aside>
  );
}
