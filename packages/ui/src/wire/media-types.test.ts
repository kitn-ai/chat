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

describe('a file EXTENSION in `accept` is refused loudly', () => {
  // Measured on this branch before the throw existed: `.py` alone produced zero
  // effective types and `accept=""` on the picker -- a composer that accepted
  // nothing, silently. `".py,text/plain"` was worse: the half that worked made
  // it read as correct while the `.py` disappeared without a word.
  it('throws rather than resolving to an empty set', () => {
    expect(() => resolveMediaPolicy({ accept: '.py' })).toThrow(/is a file extension/);
  });

  it('throws on the PARTIAL case too, where half of it appears to work', () => {
    expect(() => resolveMediaPolicy({ accept: '.py,text/plain' })).toThrow(/is a file extension/);
    // Not a silently-narrower policy: nothing is resolved at all.
    expect(() => resolveMediaPolicy({ accept: 'text/plain,.py' })).toThrow(/is a file extension/);
  });

  it('names the offending entry and the form to use instead', () => {
    // A message that says "invalid accept" sends the developer to the docs. This
    // one has to say which entry, and what to write.
    try {
      resolveMediaPolicy({ accept: 'image/png, .PY ' });
      expect.unreachable('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('".py"');
      expect(message).toContain('media type');
      expect(message).toContain('text/*');
    }
  });

  it('throws from the array form and the string form alike', () => {
    expect(() => resolveMediaPolicy({ accept: ['.md'] })).toThrow(/is a file extension/);
  });

  it('leaves a filter of real media types alone', () => {
    // The guard on the guard: a check that threw on everything would satisfy
    // every test above and break the feature.
    expect(() => resolveMediaPolicy({ accept: 'image/png,text/*' })).not.toThrow();
    expect(resolveMediaPolicy({ accept: 'image/png,text/*' }).types).toEqual([
      'image/png',
      'text/*',
    ]);
  });
});

describe('YAML, both spellings', () => {
  // `application/x-yaml` is what Chrome on macOS hands back for a `.yaml`
  // (measured -- see the table in media-types.ts). `application/yaml` is the
  // IANA registration (RFC 9512) and is what a correctly configured server
  // sends. Neither is reachable through `text/*`, which is why both are rows.
  it('encodes a .yaml under the type the browser actually reports', () => {
    for (const mediaType of ['application/x-yaml', 'application/yaml']) {
      expect(resolveMediaPolicy().decide(mediaType), mediaType).toEqual({
        status: 'allowed',
        kind: 'text',
      });
    }
    const out = toAnthropicMessages(
      withFile(
        attach({
          mediaType: 'application/x-yaml',
          filename: 'compose.yaml',
          url: dataUri('application/x-yaml', 'services:\n  web:\n    image: nginx\n'),
        }),
      ),
    );
    expect(out[0].content[0].type).toBe('text');
    expect(String(out[0].content[0].text)).toContain('image: nginx');
  });

  it('needs no row for the text/ spellings, which text/* already covers', () => {
    for (const mediaType of ['text/yaml', 'text/x-yaml']) {
      expect(resolveMediaPolicy().decide(mediaType), mediaType).toEqual({
        status: 'allowed',
        kind: 'text',
      });
    }
  });
});

describe('a file nobody could name is decided by DECODING it', () => {
  // WHY THIS EXISTS. Chrome on macOS returns an empty `File.type` for .ts, .tsx,
  // .rs, .go, .sql, .toml and .log -- the files a developer is likeliest to
  // attach to a coding chat. `FileReader.readAsDataURL` then writes
  // `application/octet-stream` into the data URI, measured in Chrome 151 and in
  // this jsdom. So both spellings have to mean the same thing, and neither may
  // be answered by looking at the filename.
  const source = (text: string, mediaType = 'application/octet-stream'): AttachmentData =>
    attach({ mediaType, filename: 'main.rs', url: dataUri(mediaType, text) });

  it('answers "read the bytes" rather than yes or no', () => {
    for (const type of ['', 'application/octet-stream', undefined]) {
      expect(resolveMediaPolicy().decide(type), String(type)).toEqual({ status: 'undetermined' });
    }
  });

  it('encodes a typeless source file as text, on both wires', () => {
    const RUST = 'fn main() {\n    println!("hi");\n}\n';
    const anthropic = toAnthropicMessages(withFile(source(RUST)));
    expect(anthropic[0].content[0].type).toBe('text');
    expect(String(anthropic[0].content[0].text)).toContain(RUST);
    expect(toOpenAIMessages(withFile(source(RUST)))[0].content).toEqual([
      { type: 'text', text: expect.stringContaining(RUST) as unknown as string },
    ]);
  });

  it('claims text/plain and nothing more specific, because that is all it proved', () => {
    // NOT `text/x-rust`. A decode establishes "this is text"; anything narrower
    // would be the filename talking, which is the guess this design refuses.
    const out = toAnthropicMessages(withFile(source('fn main() {}')));
    expect(String(out[0].content[0].text)).toContain('type="text/plain"');
    // The NAME still rides along, so the model can see it is Rust. That is a
    // fact about the file; the media type would have been a guess about it.
    expect(String(out[0].content[0].text)).toContain('name="main.rs"');
  });

  it('handles the spec spelling of a typeless data URI as well as the measured one', () => {
    // The File API says to emit a data URL with NO media type for a Blob whose
    // type is empty. Chrome and jsdom both write `application/octet-stream`
    // instead, so `data:;base64,` is the unmeasured form -- handled because a
    // browser that follows the spec is not a bug report anyone should have to
    // file.
    const out = toAnthropicMessages(
      withFile(attach({ mediaType: '', filename: 'q.sql', url: `data:;base64,${b64('select 1;')}` })),
    );
    expect(String(out[0].content[0].text)).toContain('select 1;');
  });

  it('refuses a typeless file whose bytes are NOT text, instead of mojibake', () => {
    // The case a filename-based fallback gets wrong and this one cannot: an
    // unnamed binary. Refused, rather than spending tokens on replacement
    // characters and getting a confident wrong answer back.
    const binary = 'data:application/octet-stream;base64,' + btoa('\xff\xfe\x00\x01');
    expect(() =>
      toAnthropicMessages(withFile(attach({ mediaType: '', filename: 'blob', url: binary }))),
    ).toThrow(/not valid UTF-8/);
  });

  it('★ CANNOT BE USED TO GET AROUND `accept`', () => {
    // THE constraint. A developer who wrote `accept="image/png"` gets images. A
    // typeless .rs file is perfectly decodable as text and is still REFUSED,
    // because this policy carries no text capability for it to land in. Without
    // this, `accept` degrades from a filter into a suggestion.
    const rs = source('fn main() {}');
    expect(resolveMediaPolicy({ accept: 'image/png' }).decide('')).toEqual({
      status: 'unsupported',
    });
    expect(() => toAnthropicMessages(withFile(rs), { accept: 'image/png' })).toThrow(
      WireEncodeError,
    );
    // ...and it is still refused when the developer narrowed to a SPECIFIC text
    // type. A decode proves "text", never "markdown", so a file that proved only
    // the first does not satisfy a filter that asked for the second.
    expect(() => toAnthropicMessages(withFile(rs), { accept: 'text/markdown' })).toThrow(
      WireEncodeError,
    );
    // The same file lands the moment the policy admits plain text.
    expect(toAnthropicMessages(withFile(rs), { accept: 'text/*' })).toHaveLength(1);
  });

  it('does not fetch a remote file to find out what it is', () => {
    // The decode needs bytes in hand. A remote URL has none, and this layer does
    // no I/O, so the answer is a refusal with the fix in it.
    expect(() =>
      toAnthropicMessages(
        withFile(
          attach({ mediaType: 'application/octet-stream', url: 'https://example.com/thing' }),
        ),
      ),
    ).toThrow(/says nothing about the bytes/);
  });

  it('reads the host\'s label when the data URI carries none', () => {
    // A host that read a File with readAsDataURL gets `application/octet-stream`
    // in the URI whatever the file was. If they ALSO wrote down what it is, that
    // is the only real label in play and it is not thrown away for a non-answer.
    const out = toAnthropicMessages(
      withFile(
        attach({
          mediaType: 'text/markdown',
          filename: 'README.md',
          url: `data:application/octet-stream;base64,${b64('# Title')}`,
        }),
      ),
    );
    expect(String(out[0].content[0].text)).toContain('type="text/markdown"');
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
