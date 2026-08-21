/**
 * The mocked reply, as OpenAI chat-completions SSE frames.
 *
 * Two halves, and only the first one is the kit's:
 *
 *  - TEXT — `createMockResponder()` from `@kitn.ai/ui/state`, the kit's own mock
 *    facility. It cycles canned replies and streams them token by token; we hand
 *    it the one sentence this turn should say.
 *  - THE PAGE — createMockResponder streams CONTENT DELTAS ONLY; there is no
 *    option on it for a tool call, so it cannot carry a generated page on its
 *    own. The page rides the documented card path instead: a `kai_artifact` tool
 *    call, which the client turns back into a card envelope with
 *    `cardFromToolCall`. Those frames are built here, marked with the SAME
 *    exported constants the kit stamps on its own frames (banner, `_kai_mock`,
 *    model `kai-mock`, zero usage) so nothing in this stream can be mistaken for
 *    a real turn.
 *
 * Frames end with `finish_reason: "tool_calls"`, so the terminal frames the
 * responder emits for its own text-only turn are dropped and re-issued here.
 */
import { createMockResponder, MOCK_MARKER, MOCK_MARKER_KEY, MOCK_MODEL_ID } from '@kitn.ai/ui/state';

import { foldSpec } from './page-spec.js';
import { renderPage } from './render-page.js';

/** One frame, in the shape the kit's own mock emits (marker fields included). */
function frame(id: string, payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify({
    [MOCK_MARKER_KEY]: MOCK_MARKER,
    id,
    object: 'chat.completion.chunk',
    model: MOCK_MODEL_ID,
    ...payload,
  })}\n\n`;
}

/** The responder closes its own text-only turn; this turn ends on a tool call. */
function isTerminalFrame(f: string): boolean {
  if (f.startsWith('data: [DONE]')) return true;
  if (!f.startsWith('data: ')) return false;
  try {
    const parsed = JSON.parse(f.slice(6)) as { choices?: { finish_reason?: string | null }[] };
    return parsed.choices?.some((c) => c.finish_reason != null) ?? false;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

function sentence(notes: string[], isFirst: boolean, version: number, brand: string, subject: string): string {
  if (isFirst) {
    return `Here's a landing page for ${subject} — I've called it ${brand}. It's one self-contained HTML file: sticky header, hero, three feature cards and a closing call-to-action. That's version ${version}, on the right. Ask for changes and each one becomes a new version you can flip back to.`;
  }
  if (notes.length === 0) {
    return `I've regenerated the page as version ${version}, but I couldn't find a concrete change in that. This mock understands things like "make the header dark", "add pricing", "use a serif font", "make it purple", "add an FAQ" or "rename it to Field Notes".`;
  }
  // "added pricing and added testimonials" reads like a robot; drop a verb that
  // just repeats the previous note's.
  const parts = notes.map((note, i) => {
    if (i === 0) return note;
    const [verb, ...rest] = note.split(' ');
    return verb === notes[i - 1].split(' ')[0] ? rest.join(' ') : note;
  });
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Done — I ${list}. That's version ${version}; every earlier version is still there as a checkpoint.`;
}

/** Split the (large) tool arguments so the page streams in visibly. */
function chunk(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

export type MockTurnOptions = {
  /** Every user turn so far, oldest first. The spec is folded out of them. */
  prompts: string[];
  /** How many versions the client already holds; the new one is this + 1. */
  versionCount: number;
  /** 0 in tests; the default is fast enough to feel alive. */
  delayMs?: number;
};

/** One turn's worth of frames. Structurally a `StreamSource` for the reader. */
export async function* mockTurn(opts: MockTurnOptions): AsyncGenerator<string> {
  const { prompts, versionCount, delayMs = 14 } = opts;
  const { spec, notes, isFirst } = foldSpec(prompts);
  const version = versionCount + 1;
  const html = renderPage(spec, version);
  const id = `kai-mock-page-${version}`;

  // --- text half: the kit's own responder, minus its terminal frames ---
  const respond = createMockResponder({
    replies: [sentence(notes, isFirst, version, spec.brand, spec.subject)],
    delayMs,
    chunkSize: 2,
    announce: false,
  });
  for await (const f of respond(prompts[prompts.length - 1] ?? '')) {
    if (isTerminalFrame(f)) continue;
    yield f;
  }

  // --- the page: a kai_artifact tool call, streamed like a real one ---
  const args = JSON.stringify({
    files: [{ path: 'index.html', code: html, language: 'html', type: 'html' }],
    tab: 'preview',
    height: 420,
    displayUrl: `${spec.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-v${version}.html`,
  });

  yield frame(id, {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [{ index: 0, id, type: 'function', function: { name: 'kai_artifact', arguments: '' } }],
        },
        finish_reason: null,
      },
    ],
  });

  for (const piece of chunk(args, 900)) {
    await sleep(delayMs);
    yield frame(id, {
      choices: [
        {
          index: 0,
          delta: { tool_calls: [{ index: 0, function: { arguments: piece } }] },
          finish_reason: null,
        },
      ],
    });
  }

  yield frame(id, {
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
  yield 'data: [DONE]\n\n';
}
