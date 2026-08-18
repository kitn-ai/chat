/**
 * The renderer and the wire have to agree about media types, and nothing pinned
 * that until this file existed.
 *
 * THE DEFECT THESE TESTS EXIST FOR. Three layers held three different opinions
 * about attachments, and it was not a subset relation in either direction:
 *
 *   - the composer stages EVERYTHING by default (`<kai-chat>` ships
 *     `accept: undefined`, which is correct — what a user may attach is the
 *     application's call, not the kit's);
 *   - the thread previewed exactly TWO categories off a hand-rolled prefix
 *     switch — `<img>` for `image/*`, `<video>` for `video/*`, one anonymous
 *     icon for everything else;
 *   - the encoder carries four image formats plus PDF and text, and refuses SVG
 *     and BMP on purpose because both are a 400 at request time.
 *
 * So an SVG or an MP4 got a convincing preview and then threw on send, while a
 * PDF — the type the wire handles best — got the same anonymous icon as a
 * `.zip`. The visual hierarchy was inverted relative to what actually works.
 *
 * The fix is not a third list: it is DELETING the second one. `getMediaCategory`
 * now asks `wire/media-types.ts`, which is the module that says, at its own
 * declaration, "if you find yourself writing a second list of media types
 * anywhere in this repo, delete it and read this."
 *
 * ★ THE DRIFT GUARD is `derives every category from the shared media policy`
 * below. Both sides of its assertion are read out of `media-types.ts`, so
 * teaching the wire a new format cannot silently leave the renderer behind —
 * and re-introducing a prefix switch here turns it red (a prefix switch calls
 * `application/json` a document; the policy calls it text).
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  getMediaCategory,
  type AttachmentData,
  type AttachmentVariant,
} from './attachments';
import { MessageBody } from './message';
import { DEFAULT_MEDIA_POLICY, encodableMediaTypes } from '../wire/media-types';
import type { MessagePart } from '../elements/chat-types';

afterEach(cleanup);

/** One concrete media type per declared capability pattern. `text/*` is the only
 *  wildcard today; the substitution is written to survive another one showing
 *  up rather than to match that single row. */
const sampleOf = (pattern: string): string =>
  pattern.endsWith('/*') ? `${pattern.slice(0, -1)}plain` : pattern;

const file = (mediaType: string | undefined, extra: Partial<AttachmentData> = {}): AttachmentData => ({
  id: 'a1',
  type: 'file',
  filename: 'staged-file',
  mediaType,
  ...extra,
});

const renderOne = (data: AttachmentData, variant: AttachmentVariant = 'grid') =>
  render(() => (
    <Attachments variant={variant}>
      <Attachment data={data}>
        <AttachmentPreview />
        <AttachmentInfo showMediaType />
      </Attachment>
    </Attachments>
  ));

/** The icon a category draws, as its path geometry. Two lucide icons differ in
 *  their `<path>` data and nothing else that survives jsdom, so this is what
 *  "visually distinguishable" can actually be asserted on. */
const iconShape = (container: HTMLElement): string | undefined =>
  container.querySelector('svg')?.innerHTML;

// A 1x1 transparent GIF — a real, decodable data: URI so an <img> that DOES get
// rendered is rendered for the right reason.
const TINY_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

describe('getMediaCategory', () => {
  // ★ THE DRIFT GUARD. Both sides are derived; neither is typed out here.
  it('derives every category from the shared media policy', () => {
    const patterns = encodableMediaTypes();
    expect(patterns.length).toBeGreaterThan(0); // a zero-length loop proves nothing

    for (const pattern of patterns) {
      const mediaType = sampleOf(pattern);
      const decision = DEFAULT_MEDIA_POLICY.decide(mediaType);
      // Sanity: the sample really is something the kit declares it can encode.
      expect(decision, mediaType).toMatchObject({ status: 'allowed' });
      if (decision.status !== 'allowed') continue;

      // The renderer's category IS the wire's kind. Not "compatible with" it.
      expect(getMediaCategory(file(mediaType)), mediaType).toBe(decision.kind);
    }
  });

  it('reports a type no shipped wire can carry as unsendable', () => {
    // Named at the declaration in media-types.ts: "SVG and BMP are the ones
    // people actually try, and both are a 400 at request time".
    for (const mediaType of ['image/svg+xml', 'image/bmp', 'video/mp4', 'audio/mpeg', 'application/zip']) {
      expect(DEFAULT_MEDIA_POLICY.decide(mediaType).status, mediaType).toBe('unsupported');
      expect(getMediaCategory(file(mediaType)), mediaType).toBe('unsendable');
    }
  });

  it('leaves a file nobody could name as unknown rather than claiming it is unsendable', () => {
    // The kit does NOT know: an unnamed file is settled by decoding its bytes,
    // which has not happened at render time. Marking it would be a prediction.
    for (const mediaType of ['', 'application/octet-stream', undefined]) {
      expect(DEFAULT_MEDIA_POLICY.decide(mediaType).status, String(mediaType)).toBe('undetermined');
      expect(getMediaCategory(file(mediaType)), String(mediaType)).toBe('unknown');
    }
  });

  it('keeps a source-document a citation rather than routing it through the policy', () => {
    expect(getMediaCategory({ id: 's1', type: 'source-document', title: 'RFC 9512' })).toBe('source');
  });
});

describe('AttachmentPreview media rendering', () => {
  it('previews an image the wire can carry', () => {
    const { container } = renderOne(file('image/png', { url: TINY_GIF }));
    expect(container.querySelector('img')).toBeInTheDocument();
  });

  it('does NOT render a success-implying preview for a type no wire can carry', () => {
    for (const mediaType of ['image/svg+xml', 'image/bmp', 'video/mp4']) {
      const { container, unmount } = renderOne(file(mediaType, { url: TINY_GIF }));
      expect(container.querySelector('img'), mediaType).toBeNull();
      expect(container.querySelector('video'), mediaType).toBeNull();
      unmount();
    }
  });

  it('marks the unsendable chip with the fact, naming the type', () => {
    const { container } = renderOne(file('image/svg+xml', { url: TINY_GIF }));
    const marked = container.querySelector('[data-unsendable]');
    expect(marked).toBeInTheDocument();
    expect(marked).toHaveTextContent(/image\/svg\+xml/);
    // A FACT about the formats, not a prediction about this request. The kit
    // does not know which provider this thread will be sent to.
    expect(marked!.textContent).toMatch(/not one of the attachment formats/i);
    expect(marked!.textContent).not.toMatch(/will fail|error|rejected/i);
  });

  it('does not mark anything the wire can carry, nor anything it cannot yet judge', () => {
    for (const mediaType of ['image/png', 'application/pdf', 'text/markdown', 'application/json', '']) {
      const { container, unmount } = renderOne(file(mediaType, { url: TINY_GIF }));
      expect(container.querySelector('[data-unsendable]'), mediaType).toBeNull();
      unmount();
    }
  });

  it('draws a distinct icon for PDF, for text and for the unknown fallback', () => {
    const shapeFor = (mediaType: string | undefined) => {
      const { container, unmount } = renderOne(file(mediaType));
      const shape = iconShape(container);
      unmount();
      expect(shape, String(mediaType)).toBeTruthy();
      return shape;
    };

    const pdf = shapeFor('application/pdf');
    const text = shapeFor('text/markdown');
    const unknown = shapeFor(undefined);
    const unsendable = shapeFor('image/svg+xml');

    expect(new Set([pdf, text, unknown, unsendable]).size).toBe(4);
  });

  // The other half of the drift guard: a capability the wire gains must land on
  // an icon rather than on an empty box.
  it('gives every encodable media type SOME preview, never an empty box', () => {
    for (const pattern of encodableMediaTypes()) {
      const mediaType = sampleOf(pattern);
      const { container, unmount } = renderOne(file(mediaType, { url: TINY_GIF }));
      const preview = container.querySelector('img') ?? container.querySelector('svg');
      expect(preview, mediaType).toBeTruthy();
      unmount();
    }
  });
});

describe('the thread previews attachments at a size a human can see', () => {
  const filePart = (attachment: AttachmentData): MessagePart => ({ type: 'file', attachment });

  it('renders a thread image at the 96px tile, not the 20px inline chip', () => {
    const { container } = render(() => (
      <MessageBody
        parts={[filePart(file('image/png', { url: TINY_GIF, filename: 'shot.png' }))]}
        isUser
        markdown={false}
      />
    ));

    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('width', '96');
    expect(img).not.toHaveAttribute('width', '20');
    // The tile itself, not a 20px chip slot.
    expect(container.querySelector('.size-24')).toBeInTheDocument();
  });

  it('still reaches the filename and media type for a non-image attachment', () => {
    const { container } = render(() => (
      <MessageBody
        parts={[filePart(file('application/pdf', { url: 'https://example.com/spec.pdf', filename: 'spec.pdf' }))]}
        isUser
        markdown={false}
      />
    ));
    expect(container.textContent).toContain('spec.pdf');
    expect(container.textContent).toContain('application/pdf');
  });

  it('marks an unsendable attachment in the thread too', () => {
    const { container } = render(() => (
      <MessageBody
        parts={[filePart(file('image/svg+xml', { url: TINY_GIF, filename: 'logo.svg' }))]}
        isUser
        markdown={false}
      />
    ));
    expect(container.querySelector('[data-unsendable]')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
