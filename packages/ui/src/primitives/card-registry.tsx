// src/primitives/card-registry.tsx
// One source of truth mapping a CardEnvelope.type to a renderer, for both layers:
//   - CardComponentMap drives the Solid <CardRenderer>.
//   - CardTagMap drives the <kai-cards> web component (child kai-* elements).
// Built-ins cover the 7 contract card types; consumers extend/override via a `types`
// prop (merged OVER the built-ins). kai-card (bare shell) is intentionally NOT a target.
//
// THE TAG HALF NOW LIVES IN ./card-tags — AND MUST STAY THERE.
// `BUILTIN_CARD_TAGS` / `mergeCardTags` / `CardTagMap` are plain data with no Solid in
// them, but while they shared this module with `BUILTIN_CARD_COMPONENTS` no Node/no-DOM
// project could import them AS SOURCE, and the `kai` MCP re-derived the map by
// convention as a result. ./card-tags.ts is that data on its own so
// `@kitn.ai/ui/schemas` can export it; the re-export below keeps every existing
// importer of this module working unchanged. Do not move them back — see the header
// of ./card-tags.ts for the measured cost of the alternative (0 -> 1364 tsc errors).
//
// THE COMPONENT TYPES NOW LIVE IN ./card-component-types — SAME REASON, SECOND TIME.
// `CardComponent` / `CardComponentMap` are named in the PUBLIC surface of
// `@kitn.ai/ui/schemas` (src/schemas/registry.ts), so a Node/no-DOM project resolving
// that entry's types reached this `.tsx` and hit TS6142. The types went to a `.ts`;
// `BUILTIN_CARD_COMPONENTS` and `mergeCardComponents` stayed, because they are JSX and
// have nowhere to go. Re-exported below, so this module's surface is unchanged.
import type { CardComponentMap } from './card-component-types';
import { Form } from '../components/form';
import { ConfirmCard } from '../components/confirm-card';
import { TasksCard } from '../components/tasks-card';
import { ChoiceCard } from '../components/choice-card';
import { LinkPreview } from '../components/link-preview';
import { Embed } from '../components/embed';
import { ArtifactCard, type ArtifactCardData } from '../components/artifact-card';

// The tag half, re-exported so this module's surface is unchanged. Authored in
// ./card-tags.ts because that file has no Solid below it and can therefore be read
// from a Node process; this one cannot.
export { BUILTIN_CARD_TAGS, mergeCardTags } from './card-tags';
export type { CardTagMap } from './card-tags';

// The component TYPES, re-exported for the same reason. Authored in
// ./card-component-types.ts because resolving a `.tsx` is what a no-`jsx` project
// cannot do; the values below stay here because they are JSX.
export type { CardComponent, CardComponentMap } from './card-component-types';

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
  // artifact owns real chrome of its own (sizing + heading), so like the four
  // above it lives in components/ and gets only a thin wrapper here.
  artifact: (p) => (
    <ArtifactCard data={p.envelope.data as ArtifactCardData} cardId={p.envelope.id}
      heading={p.envelope.title} host={p.host} />
  ),
};

/** Built-ins with the consumer's overrides merged on top (consumer wins). */
export function mergeCardComponents(types?: CardComponentMap): CardComponentMap {
  return types ? { ...BUILTIN_CARD_COMPONENTS, ...types } : { ...BUILTIN_CARD_COMPONENTS };
}
