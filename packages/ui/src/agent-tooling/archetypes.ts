import type { Archetype } from './types';

/**
 * The archetypes are PRESETS over a components list, not the surface axis.
 *
 * `renderSurface({ framework, components, integration })` renders any components
 * list; each entry below is a named point in that space plus a default placement.
 * Read the table as "components + placement" and the CLI's feature multi-select
 * falls out of it: placement is the layout question, `components` is the features.
 *
 * Adding an entry here adds a PRESET. It does not add a capability, and it is not
 * how a new component reaches the renderers — that is `components` at the call
 * site. See `listCapabilityGroups` below for what this catalog does still decide.
 */
export const archetypes: Archetype[] = [
  {
    id: 'drop-in-chat',
    title: 'Drop-in chat',
    components: ['kai-chat'],
    defaultPlacement: 'full-page',
    docsSlug: 'examples/drop-in-chat',
  },
  {
    id: 'support-widget',
    title: 'Support widget',
    components: ['kai-chat'],
    defaultPlacement: 'docked-widget',
    docsSlug: 'examples/support-widget',
  },
  {
    id: 'knowledge-base',
    title: 'Knowledge base / RAG',
    components: ['kai-chat', 'kai-sources'],
    defaultPlacement: 'full-page',
    docsSlug: 'examples/knowledge-base',
  },
  {
    id: 'agentic',
    title: 'Agentic assistant',
    components: ['kai-chat', 'kai-tool', 'kai-reasoning'],
    defaultPlacement: 'side',
    docsSlug: 'examples/agentic-assistant',
  },
  {
    id: 'workspace',
    title: 'Agentic workspace',
    components: ['kai-chat', 'kai-artifact', 'kai-resizable'],
    defaultPlacement: 'side',
    docsSlug: 'examples/workspace',
  },
  {
    id: 'voice',
    title: 'Voice assistant',
    components: ['kai-chat', 'kai-voice-input'],
    defaultPlacement: 'full-page',
    docsSlug: 'examples/voice-assistant',
  },
  /**
   * THE PRESET THAT EXISTS TO MAKE A CAPABILITY REACHABLE, not to name a product
   * shape someone asked for.
   *
   * `kai-file-upload` and `kai-attachments` were registered elements that NO
   * preset composed, and `listCapabilityGroups` derives its answer from this
   * table — so the attachments capability reached neither `listSurfaceProbes`
   * nor `verify:scaffold`, and `renderSurface` had no branch that emitted either
   * tag. A caller could pass them in `components` (the axis takes any list) and
   * get two bare `<kai-file-upload></kai-file-upload>` / `<kai-attachments>`
   * siblings with nothing wired to them: on screen, inert, silent.
   *
   * The pair is ONE capability for the same reason `kai-artifact` +
   * `kai-resizable` are: a dropzone with no list is a black hole, and a list
   * with no dropzone can never fill. `hasAttachments` in scaffold.ts requires
   * both for exactly that reason.
   *
   * The components match the create-kai spec's own feature table
   * (`attachments` -> `kai-file-upload`, `kai-attachments`), so the CLI's
   * multi-select and this preset name the same surface rather than two.
   */
  {
    id: 'attachments',
    title: 'File attachments',
    components: ['kai-chat', 'kai-file-upload', 'kai-attachments'],
    defaultPlacement: 'full-page',
    docsSlug: 'examples/attachments',
  },
];

/** The component every surface composes around, so never a capability by itself. */
export const BASE_COMPONENT = 'kai-chat';

/** One capability: the components a preset adds on top of `BASE_COMPONENT`. */
export interface CapabilityGroup {
  /** derived from the components, e.g. `tool+reasoning` — not a preset name */
  id: string;
  components: string[];
}

/**
 * The distinct capabilities the presets know about, DERIVED from them.
 *
 * A capability is one preset's components minus `kai-chat`, deduped across the
 * catalog. Today that is five: `sources`, `tool+reasoning`, `artifact+resizable`,
 * `voice-input`, `file-upload+attachments` — and the seven presets collapse onto
 * them because `drop-in-chat` and `support-widget` both add nothing (they differ
 * only in `defaultPlacement`).
 *
 * Derived rather than listed for the reason the verify script's other axes are:
 * a hand-written list would have to be edited by the same hand that adds a
 * preset, so a new capability could land with nothing covering it and nothing
 * failing to say so. Registering a preset whose components are new moves the
 * cell count in `verify:scaffold` by itself.
 *
 * The grouping is real and not an artifact of the derivation: `kai-tool` and
 * `kai-reasoning` are one capability because a tool panel with no reasoning
 * disclosure is not a surface anyone asks for, `kai-artifact` /
 * `kai-resizable` are one because `isWorkspace` only fires when BOTH are present
 * — split them and the renderer emits a bare artifact with no pane to put it in
 * — and `kai-file-upload` / `kai-attachments` are one because `hasAttachments`
 * fires the same way, for the same kind of reason.
 */
export function listCapabilityGroups(): CapabilityGroup[] {
  const seen = new Map<string, CapabilityGroup>();
  for (const a of archetypes) {
    const components = a.components.filter((c) => c !== BASE_COMPONENT);
    if (components.length === 0) continue;
    const key = [...components].sort().join(',');
    if (seen.has(key)) continue;
    seen.set(key, { id: components.map((c) => c.replace(/^kai-/, '')).join('+'), components });
  }
  return [...seen.values()];
}

/** One surface the scaffolder's gate compiles across every integration × framework. */
export interface SurfaceProbe {
  id: string;
  components: string[];
}

/**
 * The surface axis for `verify:scaffold`: each capability ALONE, plus none, plus
 * ALL of them.
 *
 * WHY THESE AND NOT THE PRESETS. The presets are seven cells covering six
 * distinct components lists (`support-widget` repeats `drop-in-chat`'s, and the
 * matrix holds `placement` at one value, so that pair compiled the same types
 * twice). More importantly they cover no combination at all — every preset is
 * exactly one capability — so the surfaces the multi-select makes reachable,
 * which is most of them, had nothing compiling them.
 *
 * WHY NOT THE POWER SET. 2^5 x 11 integrations x 8 frameworks is 2816 cells to
 * exercise no new branch. The renderers compose capabilities INDEPENDENTLY: each
 * companion tag is emitted on its own terms, and the one multi-component
 * predicate (`isWorkspace`) reads components from within a single group. So
 * "every capability alone" reaches every branch, and "all capabilities together"
 * makes every PAIR of capabilities co-occur, which is what proves they compose.
 *
 * THE LIMIT, STATED: a defect needing exactly two capabilities and masked by a
 * third would survive this. That is a real gap and the honest reason it is
 * accepted is cost, not safety — no such branch exists in the renderers today,
 * and `assertSurfacesAreDistinct` fails if the axis ever degenerates so that this
 * reasoning is quietly checking less than it claims.
 */
export function listSurfaceProbes(): SurfaceProbe[] {
  const groups = listCapabilityGroups();
  return [
    { id: 'chat-only', components: [BASE_COMPONENT] },
    ...groups.map((g) => ({ id: g.id, components: [BASE_COMPONENT, ...g.components] })),
    {
      id: 'every-capability',
      components: [BASE_COMPONENT, ...groups.flatMap((g) => g.components)],
    },
  ];
}
