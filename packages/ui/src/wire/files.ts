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

/** The image formats BOTH APIs document: JPEG, PNG, GIF, WebP. Anything else --
 *  SVG and BMP being the ones people actually try -- is a 400 at request time,
 *  so it is refused here where the error can name the file. */
const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

const PDF_MEDIA_TYPE = 'application/pdf';

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

export interface ClassifiedFile {
  /** `document` is PDF-only today. Named for the Anthropic block it becomes. */
  kind: 'image' | 'document';
  mediaType: string;
  source: FileSource;
  filename?: string;
}

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
 * One attachment to the provider-neutral facts both encoders need.
 *
 * A `data:` URI's OWN media type wins over `attachment.mediaType` when they
 * disagree: the URI describes the bytes actually present, while the field is a
 * label the host set, and it is the bytes the provider will decode.
 */
export function classifyAttachment(attachment: AttachmentData): FileClassification {
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

  if ((IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return {
      status: 'encodable',
      file: { kind: 'image', mediaType, source, filename: attachment.filename },
    };
  }

  if (mediaType === PDF_MEDIA_TYPE) {
    return {
      status: 'encodable',
      file: { kind: 'document', mediaType, source, filename: attachment.filename },
    };
  }

  return {
    status: 'unencodable',
    reason: `its media type "${mediaType}" is not one either API accepts as message content. Supported: ${quotedList(IMAGE_MEDIA_TYPES)} and "${PDF_MEDIA_TYPE}". Extract the content yourself and send it as text, or hand it to the model through a tool.`,
  };
}
