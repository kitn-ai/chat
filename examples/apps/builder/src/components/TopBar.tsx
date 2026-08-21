import { Badge, Button } from '@kitn.ai/ui/react';
import { toast } from '@kitn.ai/ui/elements';

/**
 * Which half of the route's mock/real seam answered the last turn — or `null`
 * before any turn has been answered, when the honest answer is that we do not
 * know yet. The app never branches on it; it only says so.
 */
export type ChatMode = 'mock' | 'live' | null;

type Props = {
  versionCount: number;
  mode: ChatMode;
};

export function TopBar({ versionCount, mode }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" aria-hidden="true" />
        <span className="topbar-name">Pagesmith</span>
        {/* Hard-coded "mock" was a lie the moment a key was present. The badge
            is now the mode of the LAST response and nothing before that: the
            route sets `X-Kai-Mock` only when it mocked, so the header's absence
            is what proves a provider answered. */}
        {mode && <Badge>{mode}</Badge>}
      </div>
      <div className="topbar-end">
        {versionCount > 0 && (
          <span className="topbar-count">
            {versionCount} version{versionCount === 1 ? '' : 's'}
          </span>
        )}
        {/* Deliberately non-functional: there is nowhere to publish to. */}
        <Button
          size="sm"
          icon="globe"
          onClick={() => toast('Publishing is not wired up in this demo.')}
        >
          Publish
        </Button>
      </div>
    </header>
  );
}
