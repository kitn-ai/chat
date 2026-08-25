// src/components/artifact-card.tsx
// The `artifact` built-in card: chrome + sizing around <Artifact>, plus the
// bridge from its observation callbacks onto the frozen Card Contract.
import { createUniqueId, untrack, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { CardHost } from '../primitives/card-contract';
import { Artifact } from './artifact';

// `ArtifactCardData` is AUTHORED IN ../primitives/card-data-types.ts, along with
// `ArtifactCardFile` — the same declaration `FileTree`/`Artifact` use, which is
// why nothing here restates the file shape. See the note in confirm-card.tsx, or
// that file's header, for why the card payload types left a `.tsx` and why they
// are `type` aliases. Re-exported here unchanged.

import type { ArtifactCardData } from '../primitives/card-data-types';

export type {
  ArtifactCardData,
  ArtifactCardEnvelope,
  ArtifactCardFile,
  ArtifactCardTab,
} from '../primitives/card-data-types';

/** Height the artifact card falls back to. Tall enough that a framed page is
 *  actually legible in a thread, short enough to leave the conversation visible. */
export const DEFAULT_ARTIFACT_CARD_HEIGHT = '420px';

function resolveHeight(height: number | string | undefined): string {
  if (typeof height === 'number') return `${height}px`;
  if (typeof height === 'string' && height.trim() !== '') return height;
  return DEFAULT_ARTIFACT_CARD_HEIGHT;
}

export interface ArtifactCardProps {
  data: ArtifactCardData;
  cardId: string;
  heading?: string;
  host?: CardHost;
}

/** Chrome + sizing around `<Artifact>` for the `artifact` card type.
 *
 *  WHY A WRAPPER IS REQUIRED, not cosmetic. `<Artifact>`'s root is
 *  `flex h-full w-full flex-col` — it is built to FILL a container that already
 *  has a height (a resizable panel, a split view). A message thread gives its
 *  parts no height at all, so `h-full` resolves against an auto-height parent,
 *  the frame computes to ZERO, and the card renders as an invisible nothing.
 *  The explicit `height` here is what makes the card visible; `data.height`
 *  overrides it.
 *
 *  `part`/`data-card-type` are stable handles. `CardRenderer` renders card
 *  components bare, and in the web-component path `cardComponentsFromTags` maps a
 *  non-overridden built-in straight to its Solid component — so there is no
 *  `<kai-artifact>` tag in the DOM to point at. This wrapper is the only stable
 *  thing to select, which is what lets a test count rendered artifacts inside
 *  `<kai-thread>`'s shadow root.
 *
 *  `part="card"` matches the other chromed cards, which get it from `<Card>`;
 *  this one hand-rolls its chrome and so states it directly. The artifact-specific
 *  handle is `data-card-type`, NOT a second part token: every `::part` name has to
 *  be declared in `elements/slots.ts` (the drift guard in `slots.test.ts` enforces
 *  it), so adding an `artifact` part is a deliberate public-API decision to make
 *  there, not something to smuggle in from a component.
 *
 *  `envelope.title` renders as a HEADING above the frame rather than being folded
 *  into `displayUrl`: the address field states where the preview is pointing, and
 *  overwriting it with a title would make it lie. A heading is also what the four
 *  other chromed cards (form/confirm/tasks/choice) already do with `title`.
 *
 *  `tab`/`activeFile` are SEEDS, never re-asserted — see their notes on
 *  `ArtifactCardData`. A revised envelope must not undo what the user did.
 *
 *  The three observation callbacks emit the contract's EXISTING `state` verb —
 *  the contract is frozen, and a new kind would force a CARD_CONTRACT_VERSION
 *  bump. Each patch key mirrors a `data` field name, so a host can merge the
 *  patch straight back into `envelope.data` and re-send it; `addCard` upserts on
 *  `envelope.id`, so that round-trip revises the card instead of duplicating it. */
export function ArtifactCard(props: ArtifactCardProps): JSX.Element {
  const headingId = createUniqueId();
  // Read ONCE, non-reactively: these seed the view and must not be re-asserted
  // when a revision replaces the envelope. See ArtifactCardData.activeFile.
  const seedTab = untrack(() => props.data.tab);
  const seedActiveFile = untrack(() => props.data.activeFile);
  const patch = (p: Record<string, unknown>) =>
    props.host?.emit({ kind: 'state', cardId: props.cardId, patch: p });

  return (
    <div
      part="card"
      data-card-type="artifact"
      data-card-id={props.cardId}
      role="group"
      aria-labelledby={props.heading ? headingId : undefined}
      aria-label={props.heading ? undefined : 'Artifact'}
      style={{ height: resolveHeight(props.data.height) }}
      class="flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <Show when={props.heading}>
        <h3
          id={headingId}
          class="shrink-0 truncate border-b border-border px-3 py-2 text-sm font-medium text-foreground"
        >
          {props.heading}
        </h3>
      </Show>
      <div class="min-h-0 flex-1">
        <Artifact
          src={props.data.src}
          files={props.data.files}
          defaultTab={seedTab}
          activeFile={seedActiveFile}
          displayUrl={props.data.displayUrl}
          iframeTitle={props.heading ? `${props.heading} preview` : 'Artifact preview'}
          onNavigate={(url) => patch({ src: url })}
          onTabChange={(tab) => patch({ tab })}
          onFileSelect={(path) => patch({ activeFile: path })}
        />
      </div>
    </div>
  );
}
