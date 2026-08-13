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
import { DEFAULT_MEDIA_POLICY, type MediaPolicy } from './media-types';

/** `data:<media type>;base64,<data>`. Deliberately requires an explicit media
 *  type and base64 encoding: those are the two things both APIs need, and a
 *  `data:` URI missing either cannot be turned into a content block without
 *  guessing. */
const BASE64_DATA_URI = /^data:([^;,]+);base64,([\s\S]*)$/;

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
 * The text content a text attachment contributes to the prompt.
 *
 * ★ THE SWAP POINT for how a text file appears in a message. It is one function
 * on purpose: the filename-tagged envelope below is the smallest defensible
 * default, not a settled decision, and replacing it is a change to this function
 * and nothing else. The tag form is chosen over a bare `filename:\n` prefix
 * because it marks where the file ENDS as well as where it begins, which is what
 * stops a model reading the next part of the turn as more file.
 */
export function textFileContent(file: Extract<ClassifiedFile, { kind: 'text' }>): string {
  const name = file.filename ?? 'attachment';
  return `<file name="${name}" type="${file.mediaType}">\n${file.text}\n</file>`;
}

/**
 * One attachment to the provider-neutral facts both encoders need.
 *
 * A `data:` URI's OWN media type wins over `attachment.mediaType` when they
 * disagree: the URI describes the bytes actually present, while the field is a
 * label the host set, and it is the bytes the provider will decode.
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
    mediaType = asData[1].toLowerCase();
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
