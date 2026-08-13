// THE media-type declaration. One table, read by every layer that has an
// opinion about attachments.
//
// WHY THIS FILE EXISTS AT ALL. Two features want the same knowledge: the
// composer needs to know what a user is allowed to stage, and the encoders need
// to know what they can turn into provider content. Those are the same set. When
// each grows its own copy they drift, and the drift is not theoretical -- it is
// the exact defect #186 fixed one layer down, where a composer happily staged a
// `blob:` URL that the encoder could not represent. So the set is declared ONCE,
// here, and both layers derive from it rather than restating it.
//
// THE BOUNDARY THIS DRAWS. The kit owns "what CAN be encoded" -- a fact about
// `encode.ts`, not a policy. The developer owns "what I want to ALLOW", and can
// only ever NARROW the kit's set, never widen it: widening would just move a
// provider 400 later in the request. That asymmetry is why the filter is a
// declarative list rather than a hook, and why `encodableMediaTypes()` is public.
//
// No I/O, like the rest of `wire/`. Pattern matching and, for text, decoding
// base64 that is already inline -- computation over bytes already in hand, never
// a fetch.

/** What a media type BECOMES on the wire. Named for the Anthropic block set,
 *  which is the narrower of the two: `text` / `image` / `document` and nothing
 *  else. There is no arbitrary-file block on either API, which is why a text
 *  file has to ride as text content and a `.zip` has no representation at all. */
export type EncodableKind = 'image' | 'document' | 'text';

/**
 * ★ THE DECLARATION. Everything else in this file, and both `accept` surfaces,
 * are derived from this array. Adding a row teaches the encoder AND widens the
 * composer's picker; deleting one narrows both. If you find yourself writing a
 * second list of media types anywhere in this repo, delete it and read this.
 *
 * Patterns are HTML `accept` syntax: an exact type (`image/png`) or a subtype
 * wildcard (`text/*`). File EXTENSIONS (`.md`) are deliberately not supported --
 * they map to media types only by convention, and guessing is how a `.md` full
 * of base64 becomes a 400.
 *
 * On the image list: JPEG, PNG, GIF and WebP are the four formats BOTH APIs
 * document. SVG and BMP are the ones people actually try, and both are a 400 at
 * request time, so they are absent on purpose.
 *
 * On the text list: `text/*` is the core, because a media type in that tree is
 * text by definition of the tree. `application/json` and `application/xml` are
 * the two judgement calls -- both are textual formats that IANA files outside
 * `text/` for historical reasons, and both are things people genuinely attach.
 */
const ENCODABLE: readonly { readonly pattern: string; readonly kind: EncodableKind }[] = [
  { pattern: 'image/jpeg', kind: 'image' },
  { pattern: 'image/png', kind: 'image' },
  { pattern: 'image/gif', kind: 'image' },
  { pattern: 'image/webp', kind: 'image' },
  { pattern: 'application/pdf', kind: 'document' },
  { pattern: 'text/*', kind: 'text' },
  { pattern: 'application/json', kind: 'text' },
  { pattern: 'application/xml', kind: 'text' },
];

/** A developer's narrowing filter. A comma-separated string (so it works as an
 *  HTML attribute under the `kai-` contract) or an array (so it composes in JS).
 *  Both spell the same thing; the string form is what `<kai-chat accept="...">`
 *  takes and what the `kai` MCP scaffolder can emit as data. */
export type MediaTypeFilter = string | readonly string[];

/** One media type, decided against the effective set.
 *
 *  `unsupported` and `filtered` are split because the developer needs different
 *  things from them: `unsupported` means fix your expectations (no API takes
 *  this), `filtered` means fix your `accept` (the kit could have sent it). */
export type MediaDecision =
  | { status: 'allowed'; kind: EncodableKind }
  | { status: 'unsupported' }
  | { status: 'filtered' };

export interface MediaPolicy {
  /** The effective patterns: the kit's capability set narrowed by the
   *  developer's filter. Never wider than `encodableMediaTypes()`. */
  readonly types: readonly string[];
  /** The same set as an HTML `accept` attribute value, ready to put on an
   *  `<input type="file">`. This is what makes the picker and the encoder
   *  provably one thing rather than two lists that agree today. */
  readonly accept: string;
  /**
   * What this policy makes of one media type.
   *
   * The primitive behind "expose information, do not make decisions": it answers
   * a question and returns a fact, so a consumer can build their own picker,
   * their own validation and their own error copy on top of it without the kit
   * deciding anything on their behalf.
   */
  decide(mediaType: string | undefined): MediaDecision;
}

export interface MediaPolicyOptions {
  /** Narrow the kit's capability set. Omitted means the full set. Anything here
   *  that the kit cannot encode is dropped rather than honoured, because
   *  allowing it would only relocate the failure to the provider. */
  accept?: MediaTypeFilter;
}

// NOTE ON WHAT IS DELIBERATELY ABSENT: there is no size cap, no file count, and
// no truncation path here, and their absence is a decision rather than an
// omission. How many bytes to send is a cost decision that lands on the
// consumer's invoice, and a component library that grows a limits engine starts
// making application choices on their behalf. The kit encodes what it is given.
// A developer who wants a ceiling has `File.size` and `decide()` and can enforce
// one in three lines of their own code, where it belongs.

const normalize = (value: string): string => value.trim().toLowerCase();

const splitFilter = (filter: MediaTypeFilter): string[] =>
  (typeof filter === 'string' ? filter.split(',') : filter).map(normalize).filter((v) => v !== '');

/** `image/png` -> `['image','png']`; `text/*` -> `['text','*']`. */
const parts = (pattern: string): [string, string] => {
  const slash = pattern.indexOf('/');
  return slash === -1 ? [pattern, ''] : [pattern.slice(0, slash), pattern.slice(slash + 1)];
};

const matches = (pattern: string, mediaType: string): boolean => {
  const [pType, pSub] = parts(pattern);
  const [mType, mSub] = parts(mediaType);
  if (pType !== '*' && pType !== mType) return false;
  return pSub === '*' || pSub === mSub;
};

/**
 * The narrower of two patterns, or `undefined` when they do not overlap.
 *
 * This is what "narrow, never widen" means mechanically. `accept: 'image/*'`
 * against a capability of `image/png` yields `image/png`, not `image/*`: the
 * developer asked for images, and the kit's answer is the images it can actually
 * send. Conversely `accept: 'text/markdown'` against a capability of `text/*`
 * yields `text/markdown`, because there the developer is the narrower one.
 */
const intersect = (capability: string, filter: string): string | undefined => {
  if (matches(capability, filter)) return filter;
  if (matches(filter, capability)) return capability;
  return undefined;
};

/**
 * Every media type this kit's encoders can represent, as HTML `accept` patterns.
 *
 * PUBLIC ON PURPOSE, and not merely for introspection: a consumer who wants
 * their own picker, their own validation and their own error copy can build all
 * three against this without touching `<kai-chat>` at all. That demotes the
 * `accept` prop from "the only door" to a convenience over a published fact,
 * which is the composition-first shape this project already committed to.
 */
export function encodableMediaTypes(): readonly string[] {
  return ENCODABLE.map((entry) => entry.pattern);
}

/**
 * The effective policy: the kit's capability set narrowed by the developer's
 * filter, plus the text ceiling.
 *
 * BOTH LAYERS CALL THIS. The composer calls it to build its picker `accept`
 * attribute and to filter what actually gets staged; the encoders call it to
 * decide what reaches the wire. That shared call is the whole design -- it is
 * why changing `ENCODABLE` above moves the picker and the encoder together
 * rather than moving one and leaving the other to be noticed in production.
 */
export function resolveMediaPolicy(options: MediaPolicyOptions = {}): MediaPolicy {
  const filter = options.accept === undefined ? undefined : splitFilter(options.accept);

  const effective: { pattern: string; kind: EncodableKind }[] = [];
  for (const capability of ENCODABLE) {
    if (filter === undefined) {
      effective.push({ ...capability });
      continue;
    }
    for (const wanted of filter) {
      const overlap = intersect(capability.pattern, wanted);
      // A capability can overlap several filter entries (`text/*` against
      // `text/plain,text/csv`), and each overlap is its own effective pattern.
      if (overlap !== undefined && !effective.some((e) => e.pattern === overlap)) {
        effective.push({ pattern: overlap, kind: capability.kind });
      }
    }
  }

  return {
    types: effective.map((e) => e.pattern),
    accept: effective.map((e) => e.pattern).join(','),
    decide(mediaType) {
      if (mediaType === undefined || mediaType === '') return { status: 'unsupported' };
      const type = normalize(mediaType);
      const hit = effective.find((e) => matches(e.pattern, type));
      if (hit) return { status: 'allowed', kind: hit.kind };
      // Distinguishing these two is the point: one is the kit's limit, the
      // other is the developer's own filter looking back at them.
      return ENCODABLE.some((e) => matches(e.pattern, type))
        ? { status: 'filtered' }
        : { status: 'unsupported' };
    },
  };
}

/** The policy every caller gets when nobody narrowed anything: the kit's full
 *  capability set. Built once -- it has no inputs. */
export const DEFAULT_MEDIA_POLICY: MediaPolicy = resolveMediaPolicy();
