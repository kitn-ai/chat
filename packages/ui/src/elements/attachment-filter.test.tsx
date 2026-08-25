/**
 * The COMPOSER half of the attachment filter, and the composer half of the
 * proof that there is only one declaration.
 *
 * Its partner is `src/wire/media-types.test.ts`, which covers the encoder half.
 * Neither file restates the media-type list: both derive their expectations from
 * `encodableMediaTypes()` / `resolveMediaPolicy()`. That is the load-bearing
 * property -- a test with its own copy of the types would stay green while the
 * picker and the encoder drifted apart, which is the exact defect (#186, one
 * layer down) this design exists to prevent.
 *
 * Tests DefaultPromptInput directly rather than through `<kai-chat>`: the
 * defineWebComponent custom element needs Constructable Stylesheets and shadow
 * roots, which jsdom does not provide. Same pattern as
 * prompt-input-toolbar-actions.test.tsx.
 */
import { flush } from 'solid-js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { DefaultPromptInput } from './default-input';
import { encodableMediaTypes, resolveMediaPolicy } from '../wire/media-types';
import type { AttachmentData } from '../components/attachments';

afterEach(cleanup);

const noop = () => {};
const baseProps = {
  value: '',
  onValueChange: noop,
  onSubmit: noop,
  onSuggestionClick: noop,
};

const file = (name: string, type: string): File =>
  new File(['hello'], name, { type });

/** The hidden `<input type="file">` the paperclip clicks. */
const picker = (container: HTMLElement): HTMLInputElement => {
  const el = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!el) throw new Error('no file input rendered');
  return el;
};

/**
 * Wait for the component's in-flight FileReader work to finish.
 *
 * NOT a fixed `setTimeout(0)`. `fileToAttachment` reads each File through a real
 * FileReader, and jsdom does not guarantee that completes within one macrotask
 * -- a single tick passed most of the time and failed on the one case that
 * happened to schedule differently, which is a flaky test rather than a bug.
 * Queuing our OWN read of a dummy blob and awaiting it lands us behind the
 * component's reads in the same queue, which is deterministic.
 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve();
      reader.readAsDataURL(new Blob(['.']));
    });
  }
};

/** Drive a pick. jsdom will not let you assign `files`, so it is defined onto
 *  the element the way every file-input test has to. */
const pick = async (input: HTMLInputElement, files: File[]): Promise<void> => {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await settle();
};

describe('the picker attribute is DERIVED, never restated', () => {
  it('renders no accept attribute when the host set no filter', () => {
    // Back-compat: an existing consumer staged anything before and still does.
    const { container } = render(() => (
      <DefaultPromptInput {...baseProps} onAttachmentsChange={noop} />
    ));
    expect(picker(container)).not.toHaveAttribute('accept');
  });

  it('puts the RESOLVED set on the input, not the string the host wrote', () => {
    // The host asked for `image/*`; the picker offers the four image formats the
    // wire can actually carry. Expectation comes from the resolver, so this
    // cannot pass by agreeing with a stale copy of the list.
    const { container } = render(() => (
      <DefaultPromptInput {...baseProps} accept="image/*" onAttachmentsChange={noop} />
    ));
    const attr = picker(container).getAttribute('accept');
    expect(attr).toBe(resolveMediaPolicy({ accept: 'image/*' }).accept);
    expect(attr).not.toBe('image/*');
  });

  it('offers exactly the kit capability set when the host allows everything', () => {
    // ★ THE SINGLE-DECLARATION PROOF, composer side. The attribute the browser
    // gets is `encodableMediaTypes()` verbatim, so adding or removing a row in
    // the declaration moves this picker with it -- and moves the encoder too,
    // which media-types.test.ts asserts against the same function.
    const { container } = render(() => (
      <DefaultPromptInput {...baseProps} accept="*/*" onAttachmentsChange={noop} />
    ));
    expect(picker(container).getAttribute('accept')).toBe(encodableMediaTypes().join(','));
  });
});

describe('the filter holds even when the picker attribute does not', () => {
  it('stages a file the filter allows', async () => {
    const onAttachmentsChange = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput {...baseProps} accept="image/*" onAttachmentsChange={onAttachmentsChange} />
    ));
    await pick(picker(container), [file('shot.png', 'image/png')]);
    expect(onAttachmentsChange).toHaveBeenCalledTimes(1);
    const staged = onAttachmentsChange.mock.calls[0][0] as AttachmentData[];
    expect(staged.map((a) => a.filename)).toEqual(['shot.png']);
  });

  it('drops a file the filter excludes, even though the OS let it through', async () => {
    // `accept` is only a hint: every file dialog has an "All Files" escape, and
    // it does not apply to drag-and-drop at all. So this JS filter is the one
    // that actually decides, which is why it is tested separately from the
    // attribute above.
    const onAttachmentsChange = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput {...baseProps} accept="image/*" onAttachmentsChange={onAttachmentsChange} />
    ));
    await pick(picker(container), [file('report.pdf', 'application/pdf')]);
    expect(onAttachmentsChange).not.toHaveBeenCalled();
  });

  it('stages the allowed files out of a mixed pick and drops the rest', async () => {
    const onAttachmentsChange = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput {...baseProps} accept="image/*" onAttachmentsChange={onAttachmentsChange} />
    ));
    await pick(picker(container), [
      file('shot.png', 'image/png'),
      file('archive.zip', 'application/zip'),
      file('photo.jpg', 'image/jpeg'),
    ]);
    const staged = onAttachmentsChange.mock.calls[0][0] as AttachmentData[];
    expect(staged.map((a) => a.filename)).toEqual(['shot.png', 'photo.jpg']);
  });

  it('reports what it dropped, as facts rather than as copy', async () => {
    // The kit renders no error of its own: it says what happened and lets the
    // application decide what the user reads.
    const onAttachmentsRejected = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput
        {...baseProps}
        accept="image/*"
        onAttachmentsChange={noop}
        onAttachmentsRejected={onAttachmentsRejected}
      />
    ));
    await pick(picker(container), [
      file('report.pdf', 'application/pdf'),
      file('archive.zip', 'application/zip'),
    ]);
    expect(onAttachmentsRejected).toHaveBeenCalledTimes(1);
    expect(onAttachmentsRejected.mock.calls[0][0]).toEqual([
      // The kit COULD have sent this one; the host's filter is what stopped it.
      { filename: 'report.pdf', mediaType: 'application/pdf', reason: 'filtered' },
      // Nothing could have sent this one.
      { filename: 'archive.zip', mediaType: 'application/zip', reason: 'unsupported' },
    ]);
  });

  it('stays silent when nothing was dropped', async () => {
    const onAttachmentsRejected = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput
        {...baseProps}
        accept="image/*"
        onAttachmentsChange={noop}
        onAttachmentsRejected={onAttachmentsRejected}
      />
    ));
    await pick(picker(container), [file('shot.png', 'image/png')]);
    expect(onAttachmentsRejected).not.toHaveBeenCalled();
  });

  it('filters nothing when the host set no accept', async () => {
    // The opt-in boundary. Without `accept` this is exactly today's composer,
    // which is what keeps this a non-breaking addition.
    const onAttachmentsChange = vi.fn();
    const onAttachmentsRejected = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput
        {...baseProps}
        onAttachmentsChange={onAttachmentsChange}
        onAttachmentsRejected={onAttachmentsRejected}
      />
    ));
    await pick(picker(container), [file('archive.zip', 'application/zip')]);
    const staged = onAttachmentsChange.mock.calls[0][0] as AttachmentData[];
    expect(staged.map((a) => a.filename)).toEqual(['archive.zip']);
    expect(onAttachmentsRejected).not.toHaveBeenCalled();
  });
});

// The composer half of "a file nobody could name is decided by DECODING it".
//
// The encoder half is in `src/wire/media-types.test.ts`. This side matters
// separately because the composer decides BEFORE the wire ever sees the file: if
// it drops a staged `.rs` the user never gets to send it, and if it stages one
// the developer's `accept` excluded, `accept` was never a filter at all.
//
// The measurement behind it (Chrome 151, macOS 26.5, real <input type="file">):
// .ts .tsx .rs .go .sql .toml and .log all arrive with `File.type === ''`, and
// `readAsDataURL` then writes `application/octet-stream` into the data URI. jsdom
// does the same substitution, which is why these tests can be written here at
// all -- see `node scripts/probe-file-media-types.mjs`.
describe('a file the browser could not name', () => {
  /** What Chrome hands you for a .rs: real content, no media type. */
  const typeless = (name: string, body: BlobPart): File => new File([body], name, { type: '' });

  it('is staged when its bytes decode as text', async () => {
    const onAttachmentsChange = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput {...baseProps} accept="text/*" onAttachmentsChange={onAttachmentsChange} />
    ));
    await pick(picker(container), [typeless('main.rs', 'fn main() {}\n')]);
    const staged = onAttachmentsChange.mock.calls[0][0] as AttachmentData[];
    expect(staged.map((a) => a.filename)).toEqual(['main.rs']);
  });

  it('is refused when its bytes are binary, rather than staged as mojibake', async () => {
    const onAttachmentsChange = vi.fn();
    const onAttachmentsRejected = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput
        {...baseProps}
        accept="text/*"
        onAttachmentsChange={onAttachmentsChange}
        onAttachmentsRejected={onAttachmentsRejected}
      />
    ));
    await pick(picker(container), [typeless('blob.bin', new Uint8Array([0xff, 0xfe, 0x00, 0x01]))]);
    expect(onAttachmentsChange).not.toHaveBeenCalled();
    expect(onAttachmentsRejected.mock.calls[0][0]).toEqual([
      { filename: 'blob.bin', mediaType: '', reason: 'unsupported' },
    ]);
  });

  it('★ is REFUSED under an images-only filter, decodable or not', async () => {
    // THE CONSTRAINT. The developer wrote `accept="image/png"`; a perfectly
    // readable .rs file is still not an image. If the decode fallback ignored
    // the effective policy here, `accept` would stop being a filter and become
    // a suggestion -- and the file would sail past the picker into a request the
    // developer thought could only contain PNGs.
    const onAttachmentsChange = vi.fn();
    const onAttachmentsRejected = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput
        {...baseProps}
        accept="image/png"
        onAttachmentsChange={onAttachmentsChange}
        onAttachmentsRejected={onAttachmentsRejected}
      />
    ));
    await pick(picker(container), [typeless('main.rs', 'fn main() {}\n')]);
    expect(onAttachmentsChange).not.toHaveBeenCalled();
    expect(onAttachmentsRejected).toHaveBeenCalledTimes(1);
  });

  it('is staged unfiltered when the host set no accept, exactly as before', async () => {
    // Back-compat: no `accept` is no filtering, and that has to keep holding for
    // the unnamed file too -- this path does not read anything.
    const onAttachmentsChange = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput {...baseProps} onAttachmentsChange={onAttachmentsChange} />
    ));
    await pick(picker(container), [typeless('blob.bin', new Uint8Array([0xff, 0x00]))]);
    const staged = onAttachmentsChange.mock.calls[0][0] as AttachmentData[];
    expect(staged.map((a) => a.filename)).toEqual(['blob.bin']);
  });

  it('keeps the PICK order when a decoded file sits between two named ones', async () => {
    // The decode happens after an await, so an implementation that appended as
    // each answer came back would order the list by whichever file finished
    // reading first. That is a real reordering, and it is invisible in a test
    // that stages one file.
    const onAttachmentsChange = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput
        {...baseProps}
        accept="image/png,text/*"
        onAttachmentsChange={onAttachmentsChange}
      />
    ));
    await pick(picker(container), [
      file('shot.png', 'image/png'),
      typeless('main.rs', 'fn main() {}\n'),
      file('archive.zip', 'application/zip'),
      file('notes.md', 'text/markdown'),
    ]);
    const staged = onAttachmentsChange.mock.calls[0][0] as AttachmentData[];
    expect(staged.map((a) => a.filename)).toEqual(['shot.png', 'main.rs', 'notes.md']);
  });
});

describe('an extension in `accept` fails loudly, in the composer too', () => {
  it('throws rather than rendering a picker that accepts nothing', () => {
    // `<kai-chat accept=".py">` resolved to `accept=""` and a composer that
    // silently staged nothing. A developer cannot debug silence.
    expect(() =>
      render(() => <DefaultPromptInput {...baseProps} accept=".py" onAttachmentsChange={noop} />),
    ).toThrow(/is a file extension/);
  });
});
