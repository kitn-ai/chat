// `file` parts on the way OUT. The defect these cover: attachments rendered
// perfectly in the thread and reached the model as NOTHING, so a developer wired
// up upload, watched it work, and got a model that could not see the file.
//
// Every unencodable case here asserts a THROW rather than a skip, because a skip
// is the original bug one layer down.
import { describe, expect, it } from 'vitest';
import { WireEncodeError, toAnthropicMessages, toOpenAIMessages } from './encode';
import type { AttachmentData } from '../components/attachment-types';
import type { ChatMessage } from '../elements/chat-types';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

const withFile = (attachment: AttachmentData, text?: string): ChatMessage[] => [
  {
    id: 'u1',
    role: 'user',
    parts: [
      ...(text === undefined ? [] : [{ type: 'text' as const, text }]),
      { type: 'file', attachment },
    ],
  },
];

const image = (over: Partial<AttachmentData> = {}): AttachmentData => ({
  id: 'f1',
  type: 'file',
  filename: 'shot.png',
  mediaType: 'image/png',
  url: PNG,
  ...over,
});

const pdf = (over: Partial<AttachmentData> = {}): AttachmentData => ({
  id: 'f2',
  type: 'file',
  filename: 'report.pdf',
  mediaType: 'application/pdf',
  url: PDF,
  ...over,
});

describe('toOpenAIMessages: file parts', () => {
  it('encodes a base64 image as an image_url content part', () => {
    expect(toOpenAIMessages(withFile(image(), 'What is this?'))).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image_url', image_url: { url: PNG } },
        ],
      },
    ]);
  });

  it('encodes a remote image by URL, which this wire takes directly', () => {
    const out = toOpenAIMessages(
      withFile(image({ url: 'https://cdn.example.com/a.png' }), 'look'),
    );
    expect(out[0].content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'https://cdn.example.com/a.png' } },
    ]);
  });

  it('encodes a base64 PDF as a `file` content part carrying a data URI', () => {
    // file_data is a DATA URI on this wire, not bare base64: every current SDK
    // example prefixes `data:application/pdf;base64,`.
    expect(toOpenAIMessages(withFile(pdf(), 'summarise'))[0].content).toEqual([
      { type: 'text', text: 'summarise' },
      { type: 'file', file: { filename: 'report.pdf', file_data: PDF } },
    ]);
  });

  it('emits a user message for an attachment-ONLY turn', () => {
    // THE BUG. This turn used to encode to `[]` and the upload never existed.
    expect(toOpenAIMessages(withFile(image()))).toEqual([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: PNG } }] },
    ]);
  });

  it('leaves a text-only turn as a plain string, not a content array', () => {
    // No churn for the 99% case: only a turn that actually carries a file gets
    // the array form.
    expect(toOpenAIMessages([{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }])).toEqual([
      { role: 'user', content: 'hi' },
    ]);
  });

  it('THROWS on a blob: URL, which the model cannot fetch', () => {
    // The default of a browser file picker. Sending it produces a request that
    // references a URL only the user's tab can resolve.
    try {
      toOpenAIMessages(withFile(image({ url: 'blob:https://app.example.com/9f2c-4a' })));
      expect.unreachable('a blob: URL must not be sent to a model');
    } catch (e) {
      const err = e as WireEncodeError;
      expect(err).toBeInstanceOf(WireEncodeError);
      expect(err.messageId).toBe('u1');
      expect(err.partIndex).toBe(0);
      expect(err.message).toContain('blob:');
    }
  });

  it('THROWS on an attachment with no url at all', () => {
    expect(() => toOpenAIMessages(withFile(image({ url: undefined })))).toThrow(WireEncodeError);
  });

  it('THROWS on a REMOTE pdf, which this wire has no way to carry', () => {
    // The standout asymmetry: Anthropic takes `source: {type:'url'}` for a PDF,
    // OpenAI's `file` part has only file_id and file_data. Fetching it here would
    // put I/O in the pure-fold layer.
    try {
      toOpenAIMessages(withFile(pdf({ url: 'https://cdn.example.com/r.pdf' })));
      expect.unreachable('a remote PDF has no representation on this wire');
    } catch (e) {
      expect((e as WireEncodeError).message).toContain('file_data');
    }
  });

  it('THROWS on a media type neither provider takes', () => {
    expect(() => toOpenAIMessages(withFile(image({ mediaType: 'video/mp4', url: 'data:video/mp4;base64,AAA=' })))).toThrow(
      WireEncodeError,
    );
  });

  it('THROWS when mediaType is missing, rather than guessing', () => {
    expect(() =>
      toOpenAIMessages(withFile(image({ mediaType: undefined, url: 'https://cdn.example.com/a' }))),
    ).toThrow(WireEncodeError);
  });

  it('skips instead of throwing under onUnencodableFile: "skip"', () => {
    const out = toOpenAIMessages(withFile(image({ url: 'blob:x' }), 'hi'), {
      onUnencodableFile: 'skip',
    });
    expect(out).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('skips a source-document while still encoding a real upload beside it', () => {
    // A source-document is a CITATION chip the app renders, not something the
    // user staged to send, so it stays kit-side.
    const out = toOpenAIMessages([
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'file', attachment: { id: 's1', type: 'source-document', title: 'Policy' } },
          { type: 'file', attachment: image() },
        ],
      },
    ]);
    expect(out[0].content).toEqual([{ type: 'image_url', image_url: { url: PNG } }]);
  });
});

describe('toAnthropicMessages: file parts', () => {
  it('encodes a base64 image as an image block with a base64 source', () => {
    expect(toAnthropicMessages(withFile(image(), 'What is this?'))).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
          },
        ],
      },
    ]);
  });

  it('encodes a remote image as a url source', () => {
    expect(
      toAnthropicMessages(withFile(image({ url: 'https://cdn.example.com/a.png' })))[0].content,
    ).toEqual([{ type: 'image', source: { type: 'url', url: 'https://cdn.example.com/a.png' } }]);
  });

  it('encodes a base64 PDF as a document block', () => {
    expect(toAnthropicMessages(withFile(pdf()))[0].content).toEqual([
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQK' },
      },
    ]);
  });

  it('encodes a REMOTE PDF, which this wire can carry and OpenAI cannot', () => {
    expect(
      toAnthropicMessages(withFile(pdf({ url: 'https://cdn.example.com/r.pdf' })))[0].content,
    ).toEqual([
      { type: 'document', source: { type: 'url', url: 'https://cdn.example.com/r.pdf' } },
    ]);
  });

  it('THROWS on a blob: URL', () => {
    try {
      toAnthropicMessages(withFile(image({ url: 'blob:https://app.example.com/9f2c-4a' })));
      expect.unreachable('a blob: URL must not be sent to a model');
    } catch (e) {
      const err = e as WireEncodeError;
      expect(err).toBeInstanceOf(WireEncodeError);
      expect(err.messageId).toBe('u1');
      expect(err.message).toContain('blob:');
    }
  });

  it('THROWS on an image format outside the four the API documents', () => {
    // JPEG, PNG, GIF, WebP. An SVG here is a 400 at request time.
    expect(() =>
      toAnthropicMessages(withFile(image({ mediaType: 'image/svg+xml', url: 'data:image/svg+xml;base64,PHN2Zz4=' }))),
    ).toThrow(WireEncodeError);
  });

  it('keeps authored part order, so a file after text stays after it', () => {
    const out = toAnthropicMessages(withFile(image(), 'before'));
    expect((out[0].content as { type: string }[]).map((b) => b.type)).toEqual(['text', 'image']);
  });

  it('skips instead of throwing under onUnencodableFile: "skip"', () => {
    expect(
      toAnthropicMessages(withFile(image({ url: 'blob:x' }), 'hi'), { onUnencodableFile: 'skip' }),
    ).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
  });
});

describe('an attachment staged by a consumer OWN composer', () => {
  // The kit's own paperclip stages a `data:` URI, so this shape does not come
  // from `<kai-chat>`. It comes from a developer who built their own input and
  // forwarded `event.detail.attachments` straight through: an id, a type and a
  // filename is the obvious minimum, and it carries neither bytes nor an
  // address.
  //
  // This had INCIDENTAL coverage in the emitted maximal-surface test until that
  // fixture had to become realistic, and incidental coverage vanishing with
  // nothing going red is the failure mode this file exists to prevent. So it is
  // asserted here on purpose instead.
  const bare: AttachmentData = { id: 'from-composer', type: 'file', filename: 'notes.txt' };

  const turn: ChatMessage[] = [
    {
      id: 'u7',
      role: 'user',
      parts: [
        { type: 'text', text: 'have a look' },
        { type: 'file', attachment: bare },
      ],
    },
  ];

  it('THROWS on the OpenAI wire, naming the part rather than the message', () => {
    try {
      toOpenAIMessages(turn);
      expect.unreachable('an attachment with no bytes and no address must not encode to silence');
    } catch (e) {
      const err = e as WireEncodeError;
      expect(err).toBeInstanceOf(WireEncodeError);
      expect(err.messageId).toBe('u7');
      // The FILE part at index 1, not the text that happens to precede it.
      expect(err.partIndex).toBe(1);
      expect(err.message).toContain('no `url`');
      // An error that only says "no" costs a debugging session; this one says
      // which call produces the form the encoder wants.
      expect(err.message).toContain('readAsDataURL');
    }
  });

  it('THROWS on the Anthropic wire too, so neither is the lenient one', () => {
    try {
      toAnthropicMessages(turn);
      expect.unreachable('the Anthropic encoder must refuse it as well');
    } catch (e) {
      const err = e as WireEncodeError;
      expect(err).toBeInstanceOf(WireEncodeError);
      expect(err.messageId).toBe('u7');
      expect(err.partIndex).toBe(1);
      expect(err.message).toContain('no `url`');
    }
  });

  it('is the DROP that is being prevented: the text alone would look like a working request', () => {
    // The regression in one assertion. Under the opt-out the turn still sends,
    // carrying only the text -- which is precisely what shipped before, and
    // precisely why the default is a throw and this behaviour has to be asked
    // for by name.
    expect(toOpenAIMessages(turn, { onUnencodableFile: 'skip' })).toEqual([
      { role: 'user', content: 'have a look' },
    ]);
  });
});
