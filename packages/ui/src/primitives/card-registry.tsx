// src/primitives/card-registry.tsx
// One source of truth mapping a CardEnvelope.type to a renderer, for both layers:
//   - CardComponentMap drives the Solid <CardRenderer>.
//   - CardTagMap drives the <kai-cards> web component (child kai-* elements).
// Built-ins cover the 7 contract card types; consumers extend/override via a `types`
// prop (merged OVER the built-ins). kai-card (bare shell) is intentionally NOT a target.
import { createUniqueId, Show, type Component, type JSX } from 'solid-js';
import type { CardEnvelope, CardHost } from './card-contract';
import { Form } from '../components/form';
import { ConfirmCard } from '../components/confirm-card';
import { TasksCard } from '../components/tasks-card';
import { ChoiceCard } from '../components/choice-card';
import { LinkPreview } from '../components/link-preview';
import { Embed } from '../components/embed';
import { Artifact, type ArtifactFile, type ArtifactTab } from '../components/artifact';

/** Solid renderer for one envelope. `host` is the resolved CardHost so each wrapper
 *  can bridge its card's emit convention (form/confirm/tasks take `host`;
 *  link/embed take `onEmit`). */
export type CardComponent = Component<{ envelope: CardEnvelope; host?: CardHost }>;
export type CardComponentMap = Record<string, CardComponent>;

/** Web-component layer: envelope type → kai-* tag name. */
export type CardTagMap = Record<string, string>;

export const BUILTIN_CARD_TAGS: CardTagMap = {
  form: 'kai-form',
  confirm: 'kai-confirm',
  'tasks': 'kai-tasks',
  choice: 'kai-choice',
  link: 'kai-link-preview',
  embed: 'kai-embed',
  artifact: 'kai-artifact',
};

export const BUILTIN_CARD_COMPONENTS: CardComponentMap = {
  form: (p) => (
    <Form data={p.envelope.data as never} cardId={p.envelope.id} heading={p.envelope.title}
      resolution={p.envelope.resolution} host={p.host} />
  ),
  confirm: (p) => (
    <ConfirmCard data={p.envelope.data as never} cardId={p.envelope.id} heading={p.envelope.title}
      resolution={p.envelope.resolution} host={p.host} />
  ),
  'tasks': (p) => (
    <TasksCard data={p.envelope.data as never} cardId={p.envelope.id} heading={p.envelope.title}
      resolution={p.envelope.resolution} host={p.host} />
  ),
  choice: (p) => (
    <ChoiceCard data={p.envelope.data as never} cardId={p.envelope.id} heading={p.envelope.title}
      resolution={p.envelope.resolution} host={p.host} />
  ),
  // link/embed have no `heading` and emit via an onEmit callback (no context).
  link: (p) => (
    <LinkPreview data={p.envelope.data as never} cardId={p.envelope.id} onEmit={(e) => p.host?.emit(e)} />
  ),
  embed: (p) => (
    <Embed data={p.envelope.data as never} cardId={p.envelope.id} onEmit={(e) => p.host?.emit(e)} />
  ),
  // artifact has no card component of its own — the wrapper below owns the sizing
  // and chrome that a bare <Artifact> cannot supply for itself. See ArtifactCard.
  artifact: (p) => (
    <ArtifactCard data={p.envelope.data as ArtifactCardData} cardId={p.envelope.id}
      heading={p.envelope.title} host={p.host} />
  ),
};

/** The `artifact` card payload: a deliberately NARROW subset of `ArtifactProps`.
 *
 *  A card envelope is written by a model, so the surface it can reach has to be
 *  the part that describes WHAT to show, not how the viewer behaves. Toolbar
 *  composition (`showNav`/`showTabs`/…), view-state (`maximized`), the iframe
 *  `sandbox` and the imperative `controllerRef` are all host concerns and stay
 *  off the wire — a model must not be able to widen its own sandbox or hide the
 *  chrome the user needs to inspect what it built. */
export interface ArtifactCardData {
  /** URL the preview iframe frames. */
  src?: string;
  /** Files for the Code tab's tree (+ each file's preview `url`). */
  files?: ArtifactFile[];
  /** Which view opens first: `preview` (default) or `code`. */
  tab?: ArtifactTab;
  /** Path of the file selected in the tree. */
  activeFile?: string;
  /** Friendly address shown INSTEAD of the real url. Use when `src` is not
   *  consumer-facing (e.g. a `data:` blob) so a clean address is shown. */
  displayUrl?: string;
  /** Frame height. A bare number is px; a string is any CSS length. Defaults to
   *  `DEFAULT_ARTIFACT_CARD_HEIGHT` — see the note on ArtifactCard. */
  height?: number | string;
}

/** Height the artifact card falls back to. Tall enough that a framed page is
 *  actually legible in a thread, short enough to leave the conversation visible. */
export const DEFAULT_ARTIFACT_CARD_HEIGHT = '420px';

function resolveHeight(height: number | string | undefined): string {
  if (typeof height === 'number') return `${height}px`;
  if (typeof height === 'string' && height.trim() !== '') return height;
  return DEFAULT_ARTIFACT_CARD_HEIGHT;
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
 *  `envelope.title` renders as a HEADING above the frame rather than being folded
 *  into `displayUrl`: the address field states where the preview is pointing, and
 *  overwriting it with a title would make it lie. A heading is also what the four
 *  other chromed cards (form/confirm/tasks/choice) already do with `title`.
 *
 *  The three observation callbacks emit the contract's EXISTING `state` verb —
 *  the contract is frozen, and a new kind would force a CARD_CONTRACT_VERSION
 *  bump. Each patch key mirrors a `data` field name, so a host can merge the
 *  patch straight back into `envelope.data` and re-send it; `addCard` upserts on
 *  `envelope.id`, so that round-trip revises the card instead of duplicating it. */
function ArtifactCard(props: {
  data: ArtifactCardData;
  cardId: string;
  heading?: string;
  host?: CardHost;
}): JSX.Element {
  const headingId = createUniqueId();
  const patch = (p: Record<string, unknown>) =>
    props.host?.emit({ kind: 'state', cardId: props.cardId, patch: p });

  return (
    <div
      part="card artifact"
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
          tab={props.data.tab}
          activeFile={props.data.activeFile}
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

/** Built-ins with the consumer's overrides merged on top (consumer wins). */
export function mergeCardComponents(types?: CardComponentMap): CardComponentMap {
  return types ? { ...BUILTIN_CARD_COMPONENTS, ...types } : { ...BUILTIN_CARD_COMPONENTS };
}

export function mergeCardTags(types?: CardTagMap): CardTagMap {
  return types ? { ...BUILTIN_CARD_TAGS, ...types } : { ...BUILTIN_CARD_TAGS };
}
