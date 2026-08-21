/**
 * The card types this app renders, declared ONCE with `createCardRegistry` and
 * threaded to both ends of the loop (the kit's own instruction): the client sets
 * `cardTypes` / `cardSchemas` on <kai-chat>, and a real route would build its
 * tool definitions from the same registry with `cardTools(cards, { provider })`.
 *
 * `use: ['artifact']` — the model (here, the mock) is offered the built-in
 * `kai_artifact` tool, which is how an assistant reply carries a generated page.
 * The thread does NOT draw that envelope, though: a full artifact viewer per
 * message is not a "compact card", and the app already has one big viewer in the
 * preview panel. The host converts each arriving artifact into a
 * `page-version` envelope — this app's own card type — which is a one-line
 * checkpoint chip the user can click to put that version in the preview.
 */
import { createCardRegistry, type CardSchema } from '@kitn.ai/ui/schemas';

import { TAG as PAGE_VERSION_TAG } from './page-version-card';

export const PAGE_VERSION_TYPE = 'page-version';

/**
 * What a valid `page-version` card looks like. Fed to the kit's validator.
 *
 * The assertion is not laziness: `CardSchema` is lean by design (it describes
 * the subset the kit's validator implements), so a nested `description` — which
 * every authored schema carries, the kit's own seven included — is an excess
 * property against it. Asserting once here is the smallest honest fix; see
 * NOTES.md.
 */
export const pageVersionSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'PageVersionCardData',
  description: 'A generated page kept as a restorable checkpoint, shown as one compact row in the thread.',
  type: 'object',
  additionalProperties: false,
  required: ['versionId', 'label', 'title'],
  properties: {
    versionId: { type: 'string', description: 'Which version this card selects.', maxLength: 128 },
    label: { type: 'string', description: 'Short version label, e.g. "v3".', maxLength: 16 },
    title: { type: 'string', description: 'The generated page’s title.', maxLength: 200 },
    fileName: { type: 'string', description: 'File name of the generated document.', maxLength: 200 },
    summary: { type: 'string', description: 'One line about what this version changed.', maxLength: 400 },
    size: { type: 'string', description: 'Human-readable document size, e.g. "8.4 KB".', maxLength: 24 },
    selected: { type: 'boolean', description: 'True while this version is the one in the preview panel.' },
  },
} as CardSchema;

export type PageVersionCardData = {
  versionId: string;
  label: string;
  title: string;
  fileName?: string;
  summary?: string;
  size?: string;
  selected?: boolean;
};

export const cards = createCardRegistry({
  use: ['artifact'],
  custom: {
    [PAGE_VERSION_TYPE]: {
      schema: pageVersionSchema,
      tag: PAGE_VERSION_TAG,
      description: 'Show a generated page as a compact, selectable checkpoint in the conversation.',
    },
  },
});
