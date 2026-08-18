// THE WRITE PATH, instrumented. What the app actually sent, and what the
// encoder did not.
//
// The read path was already visible; this half was not, and it is where the
// expensive confusion lives. "Your attachment rendered in the thread and was
// never sent to the model" is a sentence nobody could get out of the kit before
// this, and it is the whole point of the event pair below.
//
// The encoder is also the ONE place that sees both sides -- the ChatMessage[]
// going in and the provider messages coming out -- so it is the only place that
// can answer "is the context that goes to the model the context I think it is".
import { afterEach, describe, expect, it } from 'vitest';
import { toAnthropicMessages, toOpenAIMessages } from './encode';
import { subscribeWireDiagnostics, type WireDiagnosticEvent } from './diagnostics';
import type { AttachmentData } from '../components/attachment-types';
import type { ChatMessage } from '../elements/chat-types';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

const image = (over: Partial<AttachmentData> = {}): AttachmentData => ({
  id: 'f1',
  type: 'file',
  filename: 'shot.png',
  mediaType: 'image/png',
  url: PNG,
  ...over,
});

let off: (() => void) | undefined;
let events: WireDiagnosticEvent[] = [];
const listen = () => {
  // Drops the previous subscription first. Without this a test that listens
  // twice leaves the first subscriber alive, pushing into the same array, and
  // every event is counted twice -- which reads exactly like a double-emitting
  // encoder and is not.
  off?.();
  events = [];
  off = subscribeWireDiagnostics((e) => events.push(e));
};
afterEach(() => {
  off?.();
  off = undefined;
});

const request = () => events.find((e) => e.type === 'encode.request') as any;
const dropped = () => events.filter((e) => e.type === 'encode.dropped') as any[];

describe('encode.request', () => {
  it('reports the thread-to-wire delta, so truncation and merging are NUMBERS', () => {
    listen();
    const thread: ChatMessage[] = Array.from({ length: 24 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      parts: [{ type: 'text', text: `turn ${i}` }],
    }));
    const out = toOpenAIMessages(thread);

    expect(out).toHaveLength(24);
    const req = request();
    expect(req.format).toBe('openai');
    expect(req.threadMessages).toBe(24);
    expect(req.wireMessages).toBe(24);
    expect(req.byRole).toEqual({ user: 12, assistant: 12 });
    expect(req.bytes).toBeGreaterThan(0);
  });

  it('systemMessages is a stated ZERO, because that is the finding', () => {
    listen();
    toOpenAIMessages([{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    const req = request();
    // The kit's content model has no system role at all, so a system prompt is
    // always added somewhere the kit cannot see. A reader has to be able to tell
    // that from "not reported", which is why it is 0 and not absent.
    expect(req.systemMessages).toBe(0);
    expect('systemMessages' in req).toBe(true);
  });

  it('partsIn vs partsEncoded: what was in the thread, and what survived', () => {
    listen();
    toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'here' },
          { type: 'card', envelope: { type: 'weather', data: {} } as any },
          { type: 'source', source: { url: 'https://example.com', title: 'x' } as any },
        ],
      },
    ]);
    const req = request();
    expect(req.partsIn).toEqual({ text: 1, card: 1, source: 1 });
    expect(req.partsEncoded).toEqual({ text: 1 });
  });

  it('an attachment is reported by media type and SIZE, never by name or content', () => {
    listen();
    toOpenAIMessages([
      { id: 'u1', role: 'user', parts: [{ type: 'file', attachment: image() }] },
    ]);
    const req = request();
    expect(req.attachments).toEqual([
      { mediaType: 'image/png', bytes: 8, encoded: true, disposition: 'encoded' },
    ]);
    expect(JSON.stringify(events)).not.toContain('shot.png');
  });

  it('a text attachment reports disposition as-text: it rides as text CONTENT', () => {
    listen();
    const txt: AttachmentData = {
      id: 'f9',
      type: 'file',
      filename: 'notes.txt',
      mediaType: 'text/plain',
      url: `data:text/plain;base64,${btoa('hello there')}`,
    };
    toOpenAIMessages([{ id: 'u1', role: 'user', parts: [{ type: 'file', attachment: txt }] }]);
    expect(request().attachments[0]).toMatchObject({
      mediaType: 'text/plain',
      bytes: 11,
      encoded: true,
      disposition: 'as-text',
    });
  });

  it('a remote attachment omits bytes rather than reporting a confident zero', () => {
    listen();
    toOpenAIMessages([
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'file', attachment: image({ url: 'https://cdn.example.com/a.png' }) }],
      },
    ]);
    const a = request().attachments[0];
    expect(a.mediaType).toBe('image/png');
    expect('bytes' in a).toBe(false); // the bytes never entered this process
  });

  it('emits NOTHING when nobody is subscribed, and encodes identically', () => {
    const thread: ChatMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'file', attachment: image() }] },
    ];
    const quiet = toOpenAIMessages(thread);
    listen();
    const loud = toOpenAIMessages(thread);
    expect(loud).toEqual(quiet);
    expect(events.length).toBeGreaterThan(0);
  });

  it('toAnthropicMessages reports its own format', () => {
    listen();
    toAnthropicMessages([{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    expect(request().format).toBe('anthropic');
  });
});

describe('encode.dropped', () => {
  it("THE HEADLINE: a skipped attachment says so, with the encoder's own reason", () => {
    listen();
    const out = toOpenAIMessages(
      [
        {
          id: 'u1',
          role: 'user',
          parts: [
            { type: 'text', text: 'have a look' },
            { type: 'file', attachment: image({ url: 'blob:http://localhost/abc' }) },
          ],
        },
      ],
      { onUnencodableFile: 'skip' },
    );
    // Unchanged behaviour: the turn still goes out, minus the attachment.
    expect(out).toEqual([{ role: 'user', content: 'have a look' }]);

    const drop = dropped().find((d) => d.variant === 'file');
    expect(drop).toBeDefined();
    expect(drop.count).toBe(1);
    expect(drop.messageIndex).toBe(0);
    expect(drop.partIndex).toBe(1);
    expect(drop.reason).toContain('blob:');
    expect(request().attachments[0]).toMatchObject({ encoded: false, disposition: 'skipped' });
  });

  it('a kit-side attachment is reported as skipped, and is NOT a drop', () => {
    listen();
    toOpenAIMessages([
      {
        id: 'u1',
        role: 'user',
        parts: [
          {
            type: 'file',
            attachment: { id: 's1', type: 'source-document', filename: 'rag.md' } as AttachmentData,
          },
        ],
      },
    ]);
    // Its content is already in the prompt that produced the answer, so nothing
    // was lost -- it shows up in the ledger, not as a loss.
    expect(dropped()).toHaveLength(0);
    expect(request().attachments[0]).toMatchObject({ encoded: false, disposition: 'skipped' });
  });

  it('THE REASONING ROUND TRIP: a part with no round-trippable raw is reported', () => {
    listen();
    toOpenAIMessages(
      [
        {
          id: 'a1',
          role: 'assistant',
          // What a DeepSeek-direct read produces: real reasoning text, and no
          // `reasoning_details` carrier to echo it back with.
          parts: [
            { type: 'reasoning', text: 'let me think about it' },
            { type: 'text', text: 'done' },
          ],
        },
      ],
      { reasoning: 'include' },
    );
    const drop = dropped().find((d) => d.variant === 'reasoning');
    expect(drop).toBeDefined();
    expect(drop.reason).toMatch(/reasoning_details/);
    expect(drop.messageIndex).toBe(0);
    expect(drop.partIndex).toBe(0);
    const req = request();
    expect(req.partsIn.reasoning).toBe(1);
    expect(req.partsEncoded.reasoning).toBeUndefined();
  });

  it('reasoning omitted by the DEFAULT is reported too -- it is a choice, not a hole', () => {
    listen();
    toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'thinking' },
          { type: 'text', text: 'answer' },
        ],
      },
    ]);
    const drop = dropped().find((d) => d.variant === 'reasoning');
    expect(drop.reason).toMatch(/reasoning: 'include'/);
  });

  it('cards and sources on an assistant turn are reported on BOTH wires', () => {
    const thread: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'hi' },
          { type: 'card', envelope: { type: 'weather', data: {} } as any },
          { type: 'source', source: { url: 'https://example.com' } as any },
        ],
      },
    ];
    listen();
    toOpenAIMessages(thread);
    expect(dropped().map((d) => d.variant).sort()).toEqual(['card', 'source']);

    listen();
    toAnthropicMessages(thread);
    expect(dropped().map((d) => d.variant).sort()).toEqual(['card', 'source']);
  });

  it('a user turn reports assistant-side and kit-side parts it cannot carry', () => {
    listen();
    toOpenAIMessages([
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', text: 'hi' },
          { type: 'source', source: { url: 'https://example.com' } as any },
        ],
      },
    ]);
    const drop = dropped();
    expect(drop).toHaveLength(1);
    expect(drop[0]).toMatchObject({ variant: 'source', messageIndex: 0, partIndex: 1 });
  });

  it('an unsettled tool call is reported: it has no result, so it cannot be echoed', () => {
    listen();
    toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'tool', tool: { id: 't', type: 'search', state: 'input-streaming' } as any }],
      },
    ]);
    const drop = dropped().find((d) => d.variant === 'tool');
    expect(drop).toBeDefined();
    expect(drop.reason).toMatch(/result/);
  });

  it('carries no message text anywhere -- counts and variant names only', () => {
    listen();
    const SECRET = 'the user said something private';
    toOpenAIMessages([
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', text: SECRET },
          { type: 'source', source: { url: `https://example.com/${SECRET}` } as any },
        ],
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });
});
