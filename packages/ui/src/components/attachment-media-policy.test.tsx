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
import { describe, it, expect, afterEach, vi } from 'vitest';
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

  /**
   * ★ THE UNSENDABLE SIDE, AS A PROPERTY RATHER THAN A LIST.
   *
   * The complement of the encodable set is infinite, so there is nothing in
   * `media-types.ts` to enumerate and no list to derive. What CAN be derived is
   * the biconditional — `unsendable` if and only if the policy says
   * `unsupported` — and a corpus wide enough that a renderer special-case has
   * nowhere to hide. An earlier version of this test hand-typed five types, so a
   * special case for a sixth (`application/x-tar`, say) sailed past it.
   *
   * The corpus is built three ways, only the last of which is typed out:
   *   1. every declared capability (must be sendable),
   *   2. a NEAR MISS derived from each declared pattern — a sibling subtype the
   *      pattern does not cover — which is what catches a type nobody thought
   *      to name, and which grows on its own when a capability is added,
   *   3. the handful of real-world types worth naming, because `media-types.ts`
   *      calls SVG and BMP out at `:76-77` as the ones people actually try.
   */
  it('is unsendable exactly when no shipped wire can carry it', () => {
    /** A sibling of `pattern` that it must NOT match — one probe per declared
     *  capability, so registering a capability registers its probe too.
     *  `application/pdf` -> `application/x-not-pdf`. A `*` subtype has to move
     *  top-level type instead, since `text/*` covers every subtype by
     *  construction and no sibling of it exists. */
    const nearMiss = (pattern: string): string => {
      const [type, sub] = pattern.split('/');
      return sub === '*' ? `x-not-${type}/plain` : `${type}/x-not-${sub}`;
    };

    const corpus = [
      ...encodableMediaTypes().map(sampleOf),
      ...encodableMediaTypes().map(nearMiss),
      'image/svg+xml',
      'image/bmp',
      'video/mp4',
      'audio/mpeg',
      'application/zip',
      'application/x-tar',
    ];

    let unsendableSeen = 0;
    for (const mediaType of corpus) {
      const noWireCanCarryIt = DEFAULT_MEDIA_POLICY.decide(mediaType).status === 'unsupported';
      if (noWireCanCarryIt) unsendableSeen += 1;
      expect(getMediaCategory(file(mediaType)) === 'unsendable', mediaType).toBe(noWireCanCarryIt);
    }
    // Both sides of the biconditional have to be exercised or it passes
    // vacuously: a corpus of only-sendable types would prove nothing.
    expect(unsendableSeen).toBeGreaterThan(0);
    expect(unsendableSeen).toBeLessThan(corpus.length);

    // The two the module names explicitly, asserted head-on so the corpus can
    // never drift away from the documented intent.
    expect(getMediaCategory(file('image/svg+xml'))).toBe('unsendable');
    expect(getMediaCategory(file('image/bmp'))).toBe('unsendable');
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

  /**
   * ★ NO INTERACTION MAY BE REQUIRED TO READ A FILENAME.
   *
   * The first cut of this change moved the thread to the 96px grid tile and put
   * the filename in the hover card plus an `sr-only` label. That serves a mouse
   * user and a screen-reader user and NOBODY ELSE: a sighted keyboard-only user
   * and a touch user both get a blank grey square. Measured in a real browser it
   * was `visibleText: ""` on every non-image tile, with zero focusable elements
   * inside any of them.
   *
   * An image tile is self-describing — the image IS the content. A PDF, a zip
   * and a text file are not, so they carry a visible truncated filename and the
   * hover card is upgraded to the full name and media type rather than being the
   * only way to get either.
   */
  const visibleText = (el: Element): string => {
    // jsdom applies no CSS, so `sr-only` text is in `textContent` like any
    // other. Strip it to measure what a sighted user can actually read.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.sr-only').forEach((n) => n.remove());
    return (clone.textContent ?? '').trim();
  };

  it('shows a non-image attachment filename without any hover, focus or tap', () => {
    const nonImages: AttachmentData[] = [
      file('application/pdf', { url: 'https://example.com/spec.pdf', filename: 'spec.pdf' }),
      file('text/markdown', { url: TINY_GIF, filename: 'notes.md' }),
      file('application/zip', { url: TINY_GIF, filename: 'archive.zip' }),
      file(undefined, { url: TINY_GIF, filename: 'main.rs' }),
    ];

    for (const attachment of nonImages) {
      const { container, unmount } = render(() => (
        <MessageBody parts={[filePart(attachment)]} isUser markdown={false} />
      ));
      const tile = container.querySelector('.group') as HTMLElement;
      expect(tile, attachment.filename).toBeTruthy();
      expect(visibleText(tile), attachment.filename).toContain(attachment.filename!);
      unmount();
    }
  });

  it('leaves an image tile to speak for itself', () => {
    // Not a caption on everything — the tile IS the image, and stamping a
    // filename across it would be noise where the content is already the label.
    const { container } = render(() => (
      <MessageBody
        parts={[filePart(file('image/png', { url: TINY_GIF, filename: 'shot.png' }))]}
        isUser
        markdown={false}
      />
    ));
    const tile = container.querySelector('.group') as HTMLElement;
    expect(container.querySelector('img')).toBeInTheDocument();
    expect(visibleText(tile)).toBe('');
  });

  /**
   * The two halves, tied together: the caption is the identity and needs no
   * interaction, the media type is a DETAIL and lives in the hover card.
   *
   * ★ THIS TEST IS NOT ABOUT THE KEYBOARD, and it used to claim it was. It was
   * named "opens the full name and media type from the KEYBOARD, not just on
   * hover" while calling `trigger.focus()` — programmatic focus, the one path
   * that already worked. jsdom has no tab-order engine and cannot press Tab, so
   * this layer can NEVER fail for the reason that name claimed, and the gap it
   * papered over was real: tabbing to this exact tile in a real browser left the
   * card shut, because Solid's delegated focus events did not fire on a real Tab
   * inside the shadow root.
   *
   * Renamed to what it actually checks. The keyboard claim moved to
   * `tests/e2e/hover-card-tabstops.spec.ts`, which presses a real Tab against
   * the built bundle — including this same attachment-tile configuration.
   */
  it('opens the media type on programmatic focus (real Tab covered in e2e)', () => {
    const { container } = render(() => (
      <MessageBody
        parts={[filePart(file('application/pdf', { url: 'https://example.com/spec.pdf', filename: 'spec.pdf' }))]}
        isUser
        markdown={false}
      />
    ));

    // Visible without touching anything.
    expect(container.textContent).toContain('spec.pdf');

    const trigger = container.querySelector('[tabindex="0"]') as HTMLElement;
    expect(trigger, 'the tile must be a tab stop').toBeTruthy();

    vi.useFakeTimers();
    try {
      trigger.focus();
      expect(document.activeElement).toBe(trigger);
      vi.advanceTimersByTime(50);
      // The card portals out of `container`, so look at the document.
      expect(document.body.textContent).toContain('application/pdf');
    } finally {
      vi.useRealTimers();
    }
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
