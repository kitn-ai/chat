/** A message attachment descriptor. Pure type — kept JSX-free for the
 *  framework-neutral consumers (state core, React hook typecheck). */
export interface AttachmentData {
  id: string;
  type: 'file' | 'source-document';
  filename?: string;
  mediaType?: string;
  url?: string;
  title?: string;
}

/**
 * How an attachment is DRAWN, derived from what the wire can do with it.
 *
 * ★ THIS IS NOT A LIST OF MEDIA TYPES, and that is the whole point. It used to
 * be one in disguise (`image | video | audio | document`, decided by a prefix
 * switch in `attachments.tsx`), and it disagreed with `wire/media-types.ts` in
 * both directions: SVG and MP4 drew a convincing preview that then threw at
 * encode time, while PDF and text — the formats the wire handles best — drew
 * the same anonymous icon as a `.zip`. `getMediaCategory` now asks the media
 * policy and returns what it says, so there is one declaration and this is a
 * projection of it.
 *
 * `image` / `document` / `text` ARE `EncodableKind` from `wire/media-types.ts`.
 * They are spelled out rather than imported because this module is deliberately
 * JSX-free and dependency-free for the framework-neutral consumers; the runtime
 * agreement is pinned by `attachment-media-policy.test.tsx`, whose drift guard
 * derives both sides from the policy.
 *
 * `video` and `audio` are GONE on purpose. No wire this kit ships can carry
 * either, so they were categories whose only job was to make an unsendable file
 * look sendable; both now land in `unsendable`.
 */
export type AttachmentMediaCategory =
  /** A raster image in one of the four formats both APIs document. */
  | 'image'
  /** A PDF. Named for the Anthropic `document` block it becomes. */
  | 'document'
  /** Text content — `text/*`, JSON, XML, YAML. Rides as text on both wires. */
  | 'text'
  /** A RAG citation chip, not something the user staged. Never encoded. */
  | 'source'
  /**
   * No wire format this kit ships can carry this type — SVG, BMP, video, audio,
   * archives. That is a fact about the kit's encoders, knowable at render time
   * and true of every provider, which is why it is safe to show the user.
   *
   * It is NOT "this will fail to send": the renderer does not know which
   * provider a thread is bound for, and must not pretend to.
   */
  | 'unsendable'
  /**
   * Nobody named this file, so nothing is known yet. Its bytes decide it (see
   * `classifyAttachment`), and they have not been read at render time. Marking
   * it `unsendable` would be a guess wearing a fact's clothes.
   */
  | 'unknown';

export type AttachmentVariant = 'grid' | 'inline' | 'list';
