// tests/components/hostile-model-output.test.tsx
//
// End-to-end over the SHIPPED path, with nothing stubbed between the provider
// bytes and the DOM:
//
//   hostile SSE  ->  src/wire (readOpenAIStream / readAnthropicStream)
//                ->  src/state (createAssistantStream)
//                ->  src/components (MessageBody)
//                ->  DOM
//
// tests/components/markdown-xss.test.tsx pins the sink in isolation; this file
// pins that the sink is actually the one every real message flows through --
// assistant text, reasoning, and citation URLs alike.
import { render } from '@solidjs/testing-library';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createSignal } from 'solid-js';
import { readOpenAIStream, readAnthropicStream } from '../../src/wire/index';
import { createAssistantStream } from '../../src/state/stream';
import { MessageBody } from '../../src/components/message';
import type { ChatMessage } from '../../src/elements/chat-types';

beforeAll(() => {
  // The reasoning disclosure measures its content with a ResizeObserver, which
  // jsdom does not implement. Same no-op shim the other suites use; nothing
  // here asserts height.
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  document.body.innerHTML = '';
});

/** A hostile "model server": a well-formed provider SSE byte stream. */
function hostileSSE(frames: unknown[]): Response {
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(new TextEncoder().encode(body), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function runStream(
  frames: unknown[],
  reader: typeof readOpenAIStream = readOpenAIStream,
) {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const stream = createAssistantStream(setMessages);
  await reader(hostileSSE(frames), stream);
  stream.done();
  const { container } = render(() => (
    <MessageBody parts={messages()[0]?.parts ?? []} isUser={false} markdown={true} />
  ));
  return { el: container, parts: messages()[0]?.parts ?? [] };
}

const oaiText = (content: string) => ({ choices: [{ delta: { content } }] });

/** Every href the render produced. */
const hrefs = (el: HTMLElement) =>
  [...el.querySelectorAll('a')]
    .map((a) => a.getAttribute('href'))
    .filter((v): v is string => v !== null);

describe('hostile assistant TEXT over the wire', () => {
  test('an <img onerror> in assistant text never becomes a live img', async () => {
    const { el } = await runStream([
      oaiText('Here you go: <img src=x onerror="window.__PWNED__=1">'),
    ]);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror="window.__PWNED__=1">');
  });

  // THE reason sanitizing per chunk is not an option. `state/parts.ts`
  // concatenates deltas before anything renders, so no individual frame here
  // contains a complete tag -- a per-chunk filter sees `<im`, `g src=x oner`,
  // `ror=...` and passes all three. Only a guard at RENDER sees the payload.
  test('a payload SPLIT across three SSE frames is still neutralised', async () => {
    const { el, parts } = await runStream([
      oaiText('safe <im'),
      oaiText('g src=x oner'),
      oaiText('ror="window.__PWNED__=2">'),
    ]);
    // The parts really did reassemble into the whole tag ...
    expect(parts.map((p) => ('text' in p ? p.text : '')).join('')).toContain(
      '<img src=x onerror=',
    );
    // ... and it still did not become an element.
    expect(el.querySelector('img')).toBeNull();
  });

  test('markdown around the payload still renders normally', async () => {
    const { el } = await runStream([
      oaiText('**bold** [docs](https://ui.kitn.ai) <img src=x onerror="window.__PWNED__=1">'),
    ]);
    expect(el.querySelector('strong')?.textContent).toBe('bold');
    expect(hrefs(el)).toContain('https://ui.kitn.ai');
    expect(el.querySelector('img')).toBeNull();
  });
});

describe('hostile REASONING over the wire', () => {
  // reasoning renders through the same <Markdown>, so it is the same sink
  // reached by a different part type.
  test('an <img onerror> in a reasoning part never becomes a live img', async () => {
    const { el } = await runStream([
      { choices: [{ delta: { reasoning: 'thinking... <img src=x onerror="window.__PWNED__=8">' } }] },
    ]);
    expect(el.querySelector('img')).toBeNull();
  });
});

describe('hostile CITATION urls over the wire', () => {
  // Execution here is currently gated only by target="_blank" plus current
  // Chrome behaviour -- an accident of the browser, not a guard in the kit.
  // Dropping target="_blank" for styling would silently make it live, so the
  // scheme is filtered explicitly.
  test('OpenAI url_citation with a javascript: url never reaches an href', async () => {
    const { el } = await runStream([
      {
        choices: [
          {
            delta: {
              content: 'see [1]',
              annotations: [
                {
                  url_citation: {
                    url: 'javascript:window.__PWNED__=3',
                    title: 'Trusted Source',
                    content: 'snippet',
                  },
                },
              ],
            },
          },
        ],
      },
    ]);
    for (const h of hrefs(el)) expect(h.toLowerCase()).not.toMatch(/^javascript:/);
  });

  test('OpenAI url_citation with a data:text/html url never reaches an href', async () => {
    const { el } = await runStream([
      {
        choices: [
          {
            delta: {
              content: 'x',
              annotations: [
                {
                  url_citation: {
                    url: 'data:text/html,<script>window.__PWNED__=4</script>',
                    title: 'Trusted Source',
                  },
                },
              ],
            },
          },
        ],
      },
    ]);
    for (const h of hrefs(el)) expect(h.toLowerCase()).not.toMatch(/^data:/);
  });

  test('Anthropic citations_delta with a javascript: url never reaches an href', async () => {
    const { el } = await runStream(
      [
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'claim' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'citations_delta',
            citation: { url: 'javascript:window.__PWNED__=5', title: 'Reuters', cited_text: 'quote' },
          },
        },
        { type: 'content_block_stop', index: 0 },
      ],
      readAnthropicStream,
    );
    for (const h of hrefs(el)) expect(h.toLowerCase()).not.toMatch(/^javascript:/);
  });

  // The url is filtered at RENDER, not in the wire, so `parts` still reports
  // faithfully what the model actually sent. A consumer logging or auditing
  // citations must not be lied to about it -- the kit refuses to LINK the url,
  // it does not pretend the url was never there.
  test('the wire still reports the hostile url verbatim in parts', async () => {
    const { parts } = await runStream([
      {
        choices: [
          {
            delta: {
              content: 'x',
              annotations: [{ url_citation: { url: 'javascript:window.__PWNED__=3', title: 'T' } }],
            },
          },
        ],
      },
    ]);
    const sources = parts.filter((p) => p.type === 'source');
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ source: { url: 'javascript:window.__PWNED__=3' } });
  });

  test('an https citation still renders as a real link', async () => {
    const { el } = await runStream([
      {
        choices: [
          {
            delta: {
              content: 'see [1]',
              annotations: [
                { url_citation: { url: 'https://reuters.com/article', title: 'Reuters' } },
              ],
            },
          },
        ],
      },
    ]);
    expect(hrefs(el)).toContain('https://reuters.com/article');
  });
});
