import { Badge, Button } from '@kitn.ai/ui/react';
import { toast } from '@kitn.ai/ui/elements';

type Props = {
  versionCount: number;
};

export function TopBar({ versionCount }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" aria-hidden="true" />
        <span className="topbar-name">Pagesmith</span>
        <Badge>mock</Badge>
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
