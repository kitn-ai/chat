// Attachment -> wire classification, shared by both encoders.
//
// Split out of encode.ts because the two wires disagree about attachments in a
// way that is worth stating once: WHAT a file is (an image, a PDF, or something
// neither API takes as message content) is provider-neutral and decided here;
// HOW it rides on the wire is provider-specific and decided in encode.ts. The
// one gap that falls out of that split is OpenAI's, and it is real: a remote PDF
// has no representation in chat-completions at all.
//
// No I/O, exactly like the rest of this layer. Nothing here fetches a URL,
// reads a File, or base64s anything: an attachment either already carries bytes
// (a `data:` URI) or already carries an address the provider can resolve
// itself. That constraint is what makes a `blob:` URL unencodable rather than
// merely inconvenient -- resolving one requires the browser tab that minted it.
import type { AttachmentData } from '../components/attachment-types';
import {
  DEFAULT_MEDIA_POLICY,
  UNNAMED_TEXT_MEDIA_TYPE,
  namesNothing,
  type MediaPolicy,
} from './media-types';

/** `data:<media type>;base64,<data>`. Base64 is required -- both APIs need it,
 *  and a `data:` URI without it cannot become a content block without guessing.
 *  The media type is NOT required, because a browser omits it for a file it
 *  could not name: the File API says to emit a `data:` URL with no media type,
 *  and Chrome and jsdom both write `application/octet-stream` there instead.
 *  Either way there is no type to read, which `decide()` answers with
 *  `undetermined` and this file settles by decoding. */
const BASE64_DATA_URI = /^data:([^;,]*);base64,([\s\S]*)$/;

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** Where the bytes live. `base64` carries them inline; `remote` is an address
 *  the PROVIDER dereferences, never us. */
export type FileSource =
  | { type: 'base64'; mediaType: string; data: string; dataUri: string }
  | { type: 'remote'; url: string };

/** Bytes already in hand, shaped for the provider. A union rather than an
 *  optional `text` field so neither encoder can reach for text that is not
 *  there, and so adding a kind is a compile error at both wires rather than a
 *  silently unhandled branch. */
export type ClassifiedFile =
  /** Named for the Anthropic blocks they become. `document` is PDF-only. */
  | { kind: 'image'; mediaType: string; source: FileSource; filename?: string }
  | { kind: 'document'; mediaType: string; source: FileSource; filename?: string }
  /** The bytes, decoded. A text file rides as TEXT CONTENT on both wires --
   *  neither API has an arbitrary-file block, so this is the only representation
   *  the wire can express, not a preference. `source` is narrowed to `base64`
   *  because the text has to be in hand to inline it, and fetching a remote one
   *  would put I/O in the encoder. */
  | {
      kind: 'text';
      mediaType: string;
      source: Extract<FileSource, { type: 'base64' }>;
      filename?: string;
      text: string;
    };

export type FileClassification =
  /** Ready for either wire to shape. A wire may still refuse it -- see
   *  OpenAI and remote PDFs -- but the attachment itself is sound. */
  | { status: 'encodable'; file: ClassifiedFile }
  /** Not an upload at all. A `source-document` is the citation chip an app
   *  renders next to a RAG answer, not something the user staged to send, and
   *  its content is already in the prompt that produced the answer. Encoding it
   *  would send the same text twice. */
  | { status: 'kit-side' }
  /** Cannot reach a model. `reason` completes the sentence "Cannot encode file
   *  part N of message X: ...", so it explains AND says what to do. */
  | { status: 'unencodable'; reason: string };

const quotedList = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(', ');

/**
 * Base64 to the bytes it stands for.
 *
 * NOT a violation of this file's no-I/O rule. The bytes are already inline in
 * the `data:` URI the host staged; this decodes what is in hand and reaches for
 * nothing. `atob` yields a binary string (one char per byte), which is then read
 * as UTF-8 -- going straight from `atob` to text would mangle every non-ASCII
 * character in the file.
 */
function decodeBase64Text(data: string): { ok: true; text: string; bytes: number } | { ok: false } {
  try {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // `fatal` so mislabelled binary (a .zip renamed .txt) is refused with a
    // reason instead of silently becoming a screenful of replacement characters.
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes: binary.length };
  } catch {
    return { ok: false };
  }
}

/**
 * XML attribute escaping, for the two attributes the envelope carries.
 *
 * A filename is whatever the user called their file, and it lands between double
 * quotes: `notes" x="` would otherwise rewrite the header into attributes of its
 * own choosing. Newlines are escaped for the same reason and not for tidiness --
 * a raw one splits the header across lines, which is how a filename gets to look
 * like the start of the content.
 *
 * The media type goes through the same function, which is not symmetry for its
 * own sake: it comes from a `data:` URI, where it is anything up to the first
 * `;`, and `text/pl"ain` matches the `text/*` capability and arrives here whole.
 */
const escapeAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;');

/** The only sequence in the body that could end the block early, and so the only
 *  thing in the body that gets touched. Whitespace-tolerant and case-insensitive
 *  because the reader here is a model, and `</file >` reads as the end to one
 *  just as readily as `</file>` does. */
const CLOSING_DELIMITER = /<(\/file\s*)>/gi;

/**
 * The text content a text attachment contributes to the prompt.
 *
 * ★ THE SWAP POINT for how a text file appears in a message, and the shape is
 * SETTLED: `<file name="..." type="...">…</file>`. Two alternatives were weighed
 * and rejected. A bare `filename:\n` prefix marks where the file BEGINS and not
 * where it ends, so the next part of the turn reads as more file. An Anthropic
 * `document` block would buy citations, but it is Anthropic-specific -- the
 * OpenAI wire has no equivalent, so the two wires would disagree about one
 * attachment -- and it needs a Files API upload round trip, which is I/O, in a
 * layer that by design has none. Changing the envelope is still a change to this
 * function and nothing else; it just is not an open question.
 *
 * ★ WHY THE BODY IS BARELY TOUCHED. Both attributes are escaped in full, as
 * attributes always are. The body is not, and that is deliberate: these are
 * source files, a reader will diff what they attached against what arrived, and
 * XML-escaping every `<` in a TSX file would mangle the exact thing this feature
 * exists to send and pay tokens to do it. So the body transform is the smallest
 * one that makes the delimiter unforgeable -- the end tag, and nothing else.
 *
 * Left alone, that end tag is a way out of the block. A file containing `</file>`
 * closes it early, and everything after that point reads to the model as the turn
 * AROUND the file rather than as file content: user-supplied bytes in instruction
 * position, reachable by anyone who can get a file in front of the composer.
 * Escaped, it stays where it belongs. `&lt;/file&gt;` ends nothing, and it is
 * visible in the output and reversible by eye, which a deletion or a silent
 * substitution would not be -- a reader who spots it can say exactly what the
 * original byte was. The OPENING tag is left untouched on purpose: it cannot end
 * the block, and escaping it would corrupt every HTML file anyone ever attaches.
 */
export function textFileContent(file: Extract<ClassifiedFile, { kind: 'text' }>): string {
  const name = escapeAttribute(file.filename ?? 'attachment');
  const type = escapeAttribute(file.mediaType);
  const text = file.text.replace(CLOSING_DELIMITER, '&lt;$1&gt;');
  return `<file name="${name}" type="${type}">\n${text}\n</file>`;
}

/**
 * One attachment to the provider-neutral facts both encoders need.
 *
 * A `data:` URI's OWN media type wins over `attachment.mediaType` when they
 * disagree: the URI describes the bytes actually present, while the field is a
 * label the host set, and it is the bytes the provider will decode. The one
 * exception is a URI whose media type names nothing, where there is no answer to
 * prefer -- see below.
 *
 * When NOTHING names the file, it is settled by DECODING it rather than by
 * reading its filename. That path can only ever produce text, and only when the
 * policy still allows text, so it cannot be used to get around `accept`.
 *
 * `policy` narrows what counts as encodable. It defaults to the kit's full
 * capability set, so an omitted policy behaves exactly as before for images and
 * PDFs. It is the SAME object the composer resolves for its picker -- see
 * `media-types.ts` for why that sharing is the point rather than a convenience.
 */
export function classifyAttachment(
  attachment: AttachmentData,
  policy: MediaPolicy = DEFAULT_MEDIA_POLICY,
): FileClassification {
  if (attachment.type === 'source-document') return { status: 'kit-side' };

  const url = attachment.url;
  if (url === undefined || url === '') {
    return {
      status: 'unencodable',
      reason:
        'it has no `url`, so there are no bytes and no address to send. Set `url` to a `data:` URI (read the File with FileReader.readAsDataURL before you stage it) or to an https URL the provider can fetch.',
    };
  }

  let source: FileSource;
  let mediaType: string;

  const asData = BASE64_DATA_URI.exec(url);
  if (asData) {
    const inUri = asData[1].toLowerCase();
    // The URI's own media type wins -- but only when it NAMES something. A
    // browser writes `application/octet-stream` (or nothing) for a file it could
    // not identify, and a non-answer describes the bytes no better than the
    // host's `mediaType` field does. In that one case the field is the only
    // label anybody actually wrote down, so it is read rather than overridden.
    mediaType = namesNothing(inUri) ? (attachment.mediaType?.toLowerCase() ?? inUri) : inUri;
    source = { type: 'base64', mediaType, data: asData[2], dataUri: url };
  } else if (/^https?:\/\//i.test(url)) {
    const declared = attachment.mediaType?.toLowerCase();
    if (declared === undefined || declared === '') {
      return {
        status: 'unencodable',
        reason: `its \`url\` is remote ("${url}") but it has no \`mediaType\`, so there is no way to tell an image from a document without fetching it -- and this layer does no I/O. Set \`mediaType\` when you stage the attachment.`,
      };
    }
    mediaType = declared;
    source = { type: 'remote', url };
  } else if (url.startsWith('data:')) {
    return {
      status: 'unencodable',
      reason:
        'its `url` is a `data:` URI that is not base64-encoded with an explicit media type. Both APIs need `data:<media type>;base64,<data>`.',
    };
  } else {
    const scheme = SCHEME.exec(url)?.[1].toLowerCase();
    // blob: is the one people hit, because it is what URL.createObjectURL and
    // every drag-and-drop example hand you. It resolves only inside the tab that
    // created it, so it looks perfect in the thread and is meaningless to a model.
    const detail =
      scheme === 'blob'
        ? 'a `blob:` URL resolves only inside the browser tab that created it, so a model can never fetch it. Read the File with FileReader.readAsDataURL and stage the `data:` URI instead, or upload it and stage the resulting https URL'
        : `a "${scheme ?? url}" URL is not something a provider can fetch. Use a \`data:\` URI or an https URL`;
    return { status: 'unencodable', reason: `its \`url\` is "${url}": ${detail}.` };
  }

  const decision = policy.decide(mediaType);

  if (decision.status === 'undetermined') {
    // ★ NOBODY NAMED THIS FILE, SO READ IT. Seven of the file types a developer
    // is likeliest to attach to a coding chat arrive from Chrome with no media
    // type at all (the table in media-types.ts), and the tempting fix -- map
    // `.rs` to text -- is a filename talking, which is the one thing this design
    // refuses. The bytes are already in hand, so ask them instead: a clean UTF-8
    // decode IS the evidence that this is text, and it is evidence about the
    // actual file rather than about its name.
    //
    // The developer's filter is already enforced: `undetermined` comes back only
    // when the effective policy still admits plain text, so reaching this line at
    // all means a text file is something this policy would take. An
    // images-only `accept` gets `unsupported` and never arrives here.
    if (source.type !== 'base64') {
      return {
        status: 'unencodable',
        reason: `it is at a remote URL ("${source.url}") and its media type "${mediaType}" says nothing about the bytes -- that is the label for "arbitrary binary", so it separates an image from a document not at all. Settling it by reading the bytes would need a fetch, and this layer does no I/O. Set \`mediaType\` to what the file actually is when you stage it.`,
      };
    }
    const decoded = decodeBase64Text(source.data);
    if (!decoded.ok) {
      return {
        status: 'unencodable',
        reason: `nothing names it -- ${mediaType === '' ? 'it carries no media type' : `its media type is "${mediaType}"`}, so the only way to tell what it is was to read it -- and its bytes are not valid UTF-8, so it is binary of some unidentified kind. Neither API has an arbitrary-file block to carry that. Set \`mediaType\` if you know what it is, or hand the file to the model through a tool.`,
      };
    }
    // `text/plain` and not the media type it arrived with: a decode establishes
    // "this is text" and nothing more specific, and that is exactly what
    // `text/plain` means. See UNNAMED_TEXT_MEDIA_TYPE.
    return {
      status: 'encodable',
      file: {
        kind: 'text',
        mediaType: UNNAMED_TEXT_MEDIA_TYPE,
        source,
        filename: attachment.filename,
        text: decoded.text,
      },
    };
  }

  if (decision.status === 'filtered') {
    return {
      status: 'unencodable',
      reason: `its media type "${mediaType}" is one this kit can encode, but your \`accept\` filter excludes it. The types you allowed are: ${quotedList(policy.types)}. Widen \`accept\` to include it, or stop staging it.`,
    };
  }

  if (decision.status === 'unsupported') {
    return {
      status: 'unencodable',
      reason: `its media type "${mediaType}" is not one either API accepts as message content. Supported: ${quotedList(policy.types)}. Extract the content yourself and send it as text, or hand it to the model through a tool.`,
    };
  }

  if (decision.kind === 'text') {
    // A remote text file would have to be FETCHED to be inlined, and this layer
    // does no I/O. Refused with the fix rather than silently dropped.
    if (source.type !== 'base64') {
      return {
        status: 'unencodable',
        reason: `it is a text file at a remote URL ("${source.url}"), and text has to ride as text CONTENT -- neither API has an arbitrary-file block to point at a URL with. Reading it here would put I/O in the encoder. Fetch it yourself and stage the \`data:\` URI, or paste the contents as a text part.`,
      };
    }
    const decoded = decodeBase64Text(source.data);
    if (!decoded.ok) {
      return {
        status: 'unencodable',
        reason: `its media type "${mediaType}" says text, but its bytes are not valid UTF-8 -- so it is binary wearing a text label, and inlining it would send the model garbage. Send it under its real media type, or extract the text yourself.`,
      };
    }
    return {
      status: 'encodable',
      file: {
        kind: 'text',
        mediaType,
        source,
        filename: attachment.filename,
        text: decoded.text,
      },
    };
  }

  return {
    status: 'encodable',
    file: { kind: decision.kind, mediaType, source, filename: attachment.filename },
  };
}
