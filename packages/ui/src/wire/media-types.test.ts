// The media-type declaration, and the proof that it is genuinely ONE.
//
// The defect class this guards is the one #186 fixed a layer down: a composer
// that accepted what the encoder could not represent. The fix only holds if the
// picker and the encoder read the SAME list, so the tests that matter most here
// derive their expectations FROM the declaration rather than restating it. A
// test with its own copy of the media types would pass while the two layers
// drifted apart, which is precisely the failure being guarded against.
//
// The composer half of the proof lives in
// `src/elements/attachment-filter.test.tsx` -- it needs a DOM.
import { describe, expect, it } from 'vitest';
import { encodableMediaTypes, resolveMediaPolicy } from './media-types';
import { WireEncodeError, toAnthropicMessages, toOpenAIMessages } from './encode';
import type { AttachmentData } from '../components/attachment-types';
import type { ChatMessage } from '../elements/chat-types';

/** base64 of the given text, without pulling in Buffer (this layer runs in a
 *  browser too). */
const b64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const dataUri = (mediaType: string, text: string): string =>
  `data:${mediaType};base64,${b64(text)}`;

const attach = (over: Partial<AttachmentData> & { mediaType: string }): AttachmentData => ({
  id: 'f1',
  type: 'file',
  filename: 'file',
  url: dataUri(over.mediaType, 'x'),
  ...over,
});

const withFile = (attachment: AttachmentData): ChatMessage[] => [
  { id: 'u1', role: 'user', parts: [{ type: 'file', attachment }] },
];

/** One concrete media type per declared pattern, so the loops below cover the
 *  declaration without restating it. A wildcard needs a representative; an exact
 *  pattern IS its own representative. */
const sample = (pattern: string): string => pattern.replace('/*', '/plain');

describe('the declaration is single', () => {
  it('publishes the capability set the encoders themselves use', () => {
    // Not a hardcoded list on either side: if these two ever disagree, the
    // "readable capability" export has become a third copy of the facts.
    expect(resolveMediaPolicy().types).toEqual(encodableMediaTypes());
  });

  it('encodes EVERY declared media type, with the list taken from the declaration', () => {
    for (const pattern of encodableMediaTypes()) {
      const mediaType = sample(pattern);
      const out = toAnthropicMessages(withFile(attach({ mediaType })));
      expect(out, `${mediaType} (declared as "${pattern}") should encode`).toHaveLength(1);
      expect(out[0].content).toHaveLength(1);
    }
  });

  it('refuses every media type the declaration does NOT list', () => {
    // The ones people actually try, and every one is a 400 at request time.
    for (const mediaType of ['image/svg+xml', 'image/bmp', 'application/zip', 'audio/mpeg']) {
      expect(resolveMediaPolicy().decide(mediaType)).toEqual({ status: 'unsupported' });
      expect(() => toAnthropicMessages(withFile(attach({ mediaType })))).toThrow(WireEncodeError);
    }
  });

  it('reports the same accept string the picker will use', () => {
    // The value `<input type="file" accept>` gets. Asserted here as a shape
    // (comma-joined patterns) and asserted as an actual DOM attribute in the
    // composer test -- together those pin both ends to this one function.
    expect(resolveMediaPolicy().accept).toBe(encodableMediaTypes().join(','));
  });
});

describe('a filter narrows, and can never widen', () => {
  it('resolves a wildcard down to the types the wire can really carry', () => {
    // `image/*` does NOT become `image/*`: it becomes the images both APIs take.
    // An SVG would be greyed out by the picker for the same reason the encoder
    // refuses it, which is the whole point of intersecting rather than passing
    // the developer's string through.
    const policy = resolveMediaPolicy({ accept: 'image/*' });
    expect(policy.types).toEqual(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    expect(policy.decide('image/svg+xml')).toEqual({ status: 'unsupported' });
  });

  it('resolves an exact type inside a declared wildcard', () => {
    const policy = resolveMediaPolicy({ accept: 'text/markdown' });
    expect(policy.types).toEqual(['text/markdown']);
    expect(policy.decide('text/markdown')).toEqual({ status: 'allowed', kind: 'text' });
    expect(policy.decide('text/csv')).toEqual({ status: 'filtered' });
  });

  it('drops a type the kit cannot encode instead of honouring it', () => {
    // Asking for zip does not enable zip. Widening would only move the failure
    // from here to a provider 400, where it costs a round trip to discover.
    const policy = resolveMediaPolicy({ accept: 'application/zip,image/png' });
    expect(policy.types).toEqual(['image/png']);
    expect(policy.decide('application/zip')).toEqual({ status: 'unsupported' });
  });

  it('takes an array and a string as the same thing', () => {
    expect(resolveMediaPolicy({ accept: ['image/png', 'text/csv'] }).types).toEqual(
      resolveMediaPolicy({ accept: 'image/png,text/csv' }).types,
    );
  });

  it('tolerates the whitespace and casing a hand-written attribute carries', () => {
    expect(resolveMediaPolicy({ accept: ' IMAGE/PNG , text/CSV ' }).types).toEqual([
      'image/png',
      'text/csv',
    ]);
  });

  it('separates "your filter excluded it" from "no API takes it"', () => {
    // Two different fixes for the developer, so they are two different answers.
    const policy = resolveMediaPolicy({ accept: 'image/png' });
    expect(policy.decide('application/pdf')).toEqual({ status: 'filtered' });
    expect(policy.decide('application/zip')).toEqual({ status: 'unsupported' });
  });
});

describe('a filtered attachment does not reach the wire', () => {
  const pdf = attach({ mediaType: 'application/pdf', filename: 'report.pdf' });

  it('throws from the ENCODER, naming the message and the part', () => {
    expect(() => toAnthropicMessages(withFile(pdf), { accept: 'image/*' })).toThrow(
      WireEncodeError,
    );
    try {
      toAnthropicMessages(withFile(pdf), { accept: 'image/*' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WireEncodeError);
      const wire = err as WireEncodeError;
      expect(wire.messageId).toBe('u1');
      expect(wire.partIndex).toBe(0);
      // The message has to say it was the FILTER, not a kit limitation --
      // otherwise the developer goes looking for a bug in the encoder.
      expect(wire.message).toContain('your `accept` filter excludes it');
    }
  });

  it('is absent from the encoded output under the skip policy', () => {
    // Asserted on the WIRE, not on a component's state: this is the level the
    // model actually sees, and the only level where "did not reach it" is a fact.
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'look' }, { type: 'file', attachment: pdf }] },
    ];
    const out = toAnthropicMessages(messages, { accept: 'image/*', onUnencodableFile: 'skip' });
    expect(out).toEqual([{ role: 'user', content: [{ type: 'text', text: 'look' }] }]);
    expect(JSON.stringify(out)).not.toContain('application/pdf');
  });

  it('applies on the OpenAI wire too, not just Anthropic', () => {
    expect(() => toOpenAIMessages(withFile(pdf), { accept: 'image/*' })).toThrow(WireEncodeError);
  });
});

describe('text files become text content', () => {
  const README = '# Title\n\nSome **markdown**.';
  const md = attach({
    mediaType: 'text/markdown',
    filename: 'README.md',
    url: dataUri('text/markdown', README),
  });

  it('rides as a text block on the Anthropic wire, carrying the content', () => {
    // Anthropic's block set is text / image / document with no arbitrary-file
    // member, so text content is the only representation the wire can express.
    const out = toAnthropicMessages(withFile(md));
    expect(out).toHaveLength(1);
    const [block] = out[0].content;
    expect(block.type).toBe('text');
    expect(block.text).toContain(README);
    // The filename survives, so the model can refer to the file by name.
    expect(block.text).toContain('README.md');
  });

  it('rides as a text content part on the OpenAI wire', () => {
    const out = toOpenAIMessages(withFile(md));
    expect(out).toHaveLength(1);
    expect(out[0].content).toEqual([
      { type: 'text', text: expect.stringContaining(README) as unknown as string },
    ]);
  });

  it('survives a UTF-8 round trip rather than being mangled by atob', () => {
    // Going straight from atob() to a string breaks every non-ASCII byte, and
    // the damage is invisible until a model quotes the mojibake back.
    const text = 'café — naïve 日本語 \u{1F600}';
    const out = toAnthropicMessages(
      withFile(attach({ mediaType: 'text/plain', url: dataUri('text/plain', text) })),
    );
    expect(String(out[0].content[0].text)).toContain(text);
  });

  it('keeps the text in part order alongside the prompt', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', text: 'Summarise this:' },
          { type: 'file', attachment: md },
        ],
      },
    ];
    const out = toAnthropicMessages(messages);
    expect(out[0].content.map((b) => b.type)).toEqual(['text', 'text']);
    expect(String(out[0].content[0].text)).toBe('Summarise this:');
    expect(String(out[0].content[1].text)).toContain(README);
  });

  it('refuses binary wearing a text label instead of inlining garbage', () => {
    // A .zip renamed .txt decodes to invalid UTF-8. Sending it would spend
    // tokens on replacement characters and produce a confident wrong answer.
    const binary = 'data:text/plain;base64,' + btoa('\xff\xfe\x00\x01');
    expect(() => toAnthropicMessages(withFile(attach({ mediaType: 'text/plain', url: binary })))).toThrow(
      /not valid UTF-8/,
    );
  });

  it('refuses a REMOTE text file, because inlining it would need a fetch', () => {
    // The wire has no URL form for text, and this layer does no I/O. Refused
    // with the fix rather than silently dropped.
    const remote = attach({ mediaType: 'text/plain', url: 'https://example.com/notes.txt' });
    expect(() => toAnthropicMessages(withFile(remote))).toThrow(/text file at a remote URL/);
  });

  it('was previously a hard refusal -- these three now encode', () => {
    // #186 deliberately made text/plain, text/markdown and text/csv throw where
    // they had been dropped silently. This is the follow-through: they encode.
    for (const mediaType of ['text/plain', 'text/markdown', 'text/csv']) {
      const out = toAnthropicMessages(withFile(attach({ mediaType })));
      expect(out[0].content[0].type, mediaType).toBe('text');
    }
  });
});
