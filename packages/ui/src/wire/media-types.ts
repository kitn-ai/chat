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

// WHAT A BROWSER ACTUALLY CALLS A FILE -- ONE OBSERVATION, NOT A STANDING FACT.
//
// Observed 2026-08-13 (UTC), Chrome 151.0.7922.137, macOS 26.5 arm64, with the
// files handed to a real `<input type="file">` so the browser built every `File`
// itself. Re-run it rather than trusting it:
//   node scripts/probe-file-media-types.mjs
//
//   .txt  text/plain             .js    text/javascript       .png  image/png
//   .md   text/markdown          .css   text/css              .zip  application/zip
//   .csv  text/csv               .html  text/html             .pdf  application/pdf
//   .json application/json       .sh    text/x-sh
//   .xml  text/xml               .py    text/x-python-script
//   .yaml application/x-yaml     .yml   application/x-yaml
//   .ts .tsx .rs .go .sql .toml .log  ->  ""  (the browser could not name them)
//
// THESE VALUES ARE PLATFORM-SPECIFIC. Nineteen of the twenty-two match macOS's
// own `preferredMIMEType`, so the browser is answering out of the OS type
// database and Linux and Windows will answer differently. Nothing returned
// `application/octet-stream` -- Chrome's failure mode here is the EMPTY STRING.
// (`.ts` is not a TypeScript file to macOS: it resolves to an MPEG-2
// transport-stream UTI, which carries no MIME string at all, which is why it
// comes back empty rather than as `video/mp2t`.)
//
// EXACTLY TWO THINGS BELOW REST ON THIS TABLE, and both survive it being wrong
// somewhere else:
//   1. `application/x-yaml` is a row because it was measured here. A platform
//      that says something else does not make this row wrong, only incomplete.
//   2. Seven of the twenty-two extensions are the ones a developer is likeliest
//      to attach to a coding chat, and the browser names NONE of them. That is
//      why an unnamed file is decided by DECODING its bytes and never by reading
//      its filename -- see `decide()`. Another OS moves WHICH rows come back
//      empty; it cannot move the fact that some do.
// Anything else read off this table is being read too hard.

/**
 * ★ THE DECLARATION. Everything else in this file, and both `accept` surfaces,
 * are derived from this array. Adding a row teaches the encoder AND widens the
 * composer's picker; deleting one narrows both. If you find yourself writing a
 * second list of media types anywhere in this repo, delete it and read this.
 *
 * Patterns are HTML `accept` syntax: an exact type (`image/png`) or a subtype
 * wildcard (`text/*`). File EXTENSIONS (`.md`) are deliberately not supported --
 * they map to media types only by convention, and guessing is how a `.md` full
 * of base64 becomes a 400. An extension in a developer's `accept` THROWS rather
 * than matching nothing; a file the browser could not name is settled by
 * decoding it. Neither path ever consults a filename.
 *
 * On the image list: JPEG, PNG, GIF and WebP are the four formats BOTH APIs
 * document. SVG and BMP are the ones people actually try, and both are a 400 at
 * request time, so they are absent on purpose.
 *
 * On the text list: `text/*` is the core, because a media type in that tree is
 * text by definition of the tree. The `application/` rows are the judgement
 * calls -- textual formats that IANA files outside `text/` for historical
 * reasons, and that people genuinely attach. `application/json` and
 * `application/xml` are the two obvious ones.
 *
 * On YAML, since it is two rows for one format: `application/x-yaml` is what
 * Chrome hands back for a `.yaml` on macOS, MEASURED in the table above.
 * `application/yaml` is the IANA-registered type (RFC 9512, 2024) and is what a
 * correctly configured server sends, so it is here on REGISTRY grounds rather
 * than on a measurement. `text/yaml` and `text/x-yaml` are in the wild too and
 * need no row of their own: `text/*` already covers both.
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
  { pattern: 'application/x-yaml', kind: 'text' },
  { pattern: 'application/yaml', kind: 'text' },
];

/**
 * The media type an unnamed file gets once its BYTES have proven to be UTF-8
 * text, and the type whose presence in the effective policy is what permits that
 * proof to be attempted at all.
 *
 * `text/plain` is not a guess dressed up as a fact. It is the media type for
 * "text, no further structure claimed", which is exactly what a successful
 * decode establishes and the most any decode could ever establish. A `.rs` file
 * arriving as `text/plain` is true; arriving as `text/x-rust` would be the
 * filename talking.
 */
export const UNNAMED_TEXT_MEDIA_TYPE = 'text/plain';

/**
 * Media types that say nothing about the bytes they label.
 *
 * The empty string is what `File.type` is when the OS type database had no
 * answer (seven of the twenty-two rows above). `application/octet-stream` is the
 * same non-answer written down: RFC 2046 defines it as "arbitrary binary data",
 * and it is what `FileReader.readAsDataURL` substitutes for an empty type --
 * measured in Chrome 151 AND in the jsdom the unit suite runs on, both of which
 * produce `data:application/octet-stream;base64,...` for a `File` whose `type`
 * is `''`. So the same typeless file reaches the composer as `''` and reaches
 * the encoder as `application/octet-stream`, and both spellings have to mean the
 * same thing or the two layers disagree about one file.
 */
const NAMES_NOTHING: readonly string[] = ['', 'application/octet-stream'];

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
  | { status: 'filtered' }
  /**
   * Nobody named this file, so its media type cannot decide it. LOOK AT THE
   * BYTES: decode them as UTF-8 (`classifyAttachment` does), and it is `text`
   * if they decode and unencodable if they do not. Do not look at the filename.
   *
   * ★ THIS VARIANT IS WHERE THE DEVELOPER'S FILTER IS ENFORCED, so the caller
   * cannot get it wrong by forgetting to check. It is returned ONLY when the
   * effective policy still admits `text/plain` -- the one thing a decode can
   * establish. Narrow `accept` to `image/png` and an unnamed file comes back
   * `unsupported` instead, so the decode path is unreachable and a typeless
   * `.rs` cannot slip past an images-only filter. That is the whole reason the
   * check lives here rather than at each call site: there is one place to get
   * right, and the callers physically cannot reach the bytes without being told
   * to.
   */
  | { status: 'undetermined' };

export interface MediaPolicy {
  /** The effective patterns: the kit's capability set narrowed by the
   *  developer's filter. Never wider than `encodableMediaTypes()`. */
  readonly types: readonly string[];
  /** The same set as an HTML `accept` attribute value, ready to put on an
   *  `<input type="file">`. This is what makes the picker and the encoder
   *  provably one thing rather than two lists that agree today. */
  readonly accept: string;
  /**
   * What this policy makes of one media type, including "I cannot tell from
   * this, go and read the bytes" -- see `undetermined`.
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

/** Does this media type say anything at all about the bytes it labels? Exported
 *  so `files.ts` decides "nameless" by the same rule `decide()` does, rather
 *  than growing a second opinion about which spellings mean "I don't know". */
export const namesNothing = (mediaType: string | undefined): boolean =>
  NAMES_NOTHING.includes(mediaType === undefined ? '' : normalize(mediaType));

/**
 * A file EXTENSION in `accept` is a hard error, and the loudness is the point.
 *
 * HTML's own `accept` takes extensions, the prop is called `accept`, and it is
 * documented as HTML `accept` syntax -- so `accept=".py"` is a reasonable thing
 * for a developer to write, and it is a trap. Measured on this branch before the
 * throw existed: `.py` alone resolved to zero effective types and a picker with
 * `accept=""`, a composer that silently accepted NOTHING. `".py,text/plain"` was
 * worse, because the half that worked made it read as correct while the `.py`
 * vanished without a word.
 *
 * A silent empty set is the one outcome nobody can debug, so this throws. It is
 * safe to throw: no released version of this kit ships the prop, so no existing
 * app can be relying on the old silence.
 */
const assertMediaType = (entry: string): string => {
  if (!entry.startsWith('.')) return entry;
  throw new Error(
    `\`accept\` entry "${entry}" is a file extension, and this kit takes media types only. ` +
      `HTML's own accept attribute does take extensions, which is exactly why this throws rather ` +
      `than quietly matching nothing. Use a media type instead -- "text/*" covers source files, ` +
      `"image/*" images, "application/pdf" PDFs, and \`encodableMediaTypes()\` is the full set. ` +
      `You lose nothing by dropping the extension: a file the browser cannot name is decided by ` +
      `decoding its bytes, which is stronger than matching its name.`,
  );
};

const splitFilter = (filter: MediaTypeFilter): string[] =>
  (typeof filter === 'string' ? filter.split(',') : filter)
    .map(normalize)
    .filter((v) => v !== '')
    .map(assertMediaType);

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
      const type = mediaType === undefined ? '' : normalize(mediaType);

      if (namesNothing(type)) {
        // Nothing here names the bytes, and the filename is not evidence, so
        // the answer is in the bytes themselves -- but only if the developer's
        // filter would still take what a decode can prove. See the
        // `undetermined` variant: this is the single place that gate exists.
        return effective.some((e) => matches(e.pattern, UNNAMED_TEXT_MEDIA_TYPE))
          ? { status: 'undetermined' }
          : // `unsupported` rather than `filtered`, deliberately: `filtered`
            // claims the kit COULD have encoded this file, and nobody has
            // established what it is. Unread and unnamed, it is not a text
            // file the filter excluded -- it is a file with no known type.
            { status: 'unsupported' };
      }

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
