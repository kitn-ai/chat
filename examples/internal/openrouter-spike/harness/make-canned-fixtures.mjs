// Generates the HAND-WRITTEN half of the fixture set: `fixtures/canned/`.
//
// These cover the behaviours no prompt can provoke on demand — two tool calls in
// one turn, arguments truncated by the token limit, a provider that dies after
// the headers, a stream long enough to cancel, a document revised twice. The
// other half of `fixtures/` is `live/`, which the proxy writes by itself every
// time a live scenario runs.
//
// Written by a generator rather than by hand because the interesting property of
// these streams is where the FRAME BOUNDARIES fall (arguments split mid-key,
// two calls interleaved), and that is much easier to get right — and to keep
// right — in code than in 500 lines of pasted SSE.
//
//   node harness/make-canned-fixtures.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * These streams are written ONCE, as a sequence of logical events, and emitted in
 * BOTH SSE dialects.
 *
 * The reason is a real hole this closed: the canned streams used to exist only in
 * OpenAI shape, so the moment the spike drove an Anthropic model through
 * OpenRouter's Anthropic Skin, all six replay-only scenarios failed — not because
 * the UI broke, but because `readAnthropicStream` was being handed
 * chat-completions frames and correctly made nothing of them. Six red cells that
 * said nothing about the kit. A dialect-per-emitter generator turns them back
 * into measurements, and points them at the least-proven reader in the kit.
 *
 * Every scenario below therefore describes WHAT happens (a tool call opens, its
 * arguments arrive in awkward fragments, the provider dies) and lets the dialect
 * decide how that looks on the wire.
 */

/** OpenAI chat-completions. Blocks are implicit: there is no start/stop event,
 *  so the block methods emit nothing and only the deltas carry content. */
function openaiDialect() {
  const frame = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
  const chunk = (delta, finish = null) =>
    frame({
      id: 'gen-canned',
      object: 'chat.completion.chunk',
      model: 'canned/fixture',
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
  return {
    id: 'openai',
    prelude: () => ': OPENROUTER PROCESSING\n\n',
    startText: () => '',
    text: (_i, s) => chunk({ content: s }),
    startThinking: () => '',
    thinking: (_i, s) => chunk({ reasoning: s }),
    // id + name arrive first, arguments start empty. NOTE the index used: on
    // this wire it is the position in the `tool_calls` ARRAY, so reasoning does
    // not occupy a slot and the first call is always 0.
    startTool: (_block, index, id, name) =>
      chunk({ tool_calls: [{ index, id, type: 'function', function: { name, arguments: '' } }] }),
    toolArgs: (_block, index, fragment) =>
      chunk({ tool_calls: [{ index, function: { arguments: fragment } }] }),
    stopBlock: () => '',
    finish: (reason) => chunk({}, reason),
    // OpenRouter's own in-band shape. It arrives as ModelTurn.error, not as an
    // HTTP status, because the response already started.
    error: (code, message) =>
      frame({ error: { code, message }, choices: [{ index: 0, delta: {}, finish_reason: 'error' }] }),
    end: () => 'data: [DONE]\n\n',
  };
}

/** Anthropic Messages. Blocks are EXPLICIT and the delta names the delta kind but
 *  not the block kind, which is exactly the statefulness the kit's reader has to
 *  carry — so these fixtures are the only offline coverage of that path against a
 *  realistically framed stream. */
function anthropicDialect() {
  const ev = (type, payload) => `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
  // Anthropic's vocabulary for the same three outcomes.
  const STOP = { stop: 'end_turn', tool_calls: 'tool_use', length: 'max_tokens', error: 'end_turn' };
  return {
    id: 'anthropic',
    prelude: () =>
      ev('message_start', {
        message: {
          id: 'msg_canned',
          type: 'message',
          role: 'assistant',
          model: 'canned/fixture',
          content: [],
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      }),
    startText: (index) => ev('content_block_start', { index, content_block: { type: 'text', text: '' } }),
    text: (index, s) => ev('content_block_delta', { index, delta: { type: 'text_delta', text: s } }),
    startThinking: (index) =>
      ev('content_block_start', { index, content_block: { type: 'thinking', thinking: '', signature: '' } }),
    thinking: (index, s) =>
      ev('content_block_delta', { index, delta: { type: 'thinking_delta', thinking: s } }),
    // Indexed by CONTENT BLOCK, not by tool ordinal: a thinking block ahead of
    // the call takes index 0 and pushes the call to 1. That difference from the
    // OpenAI wire is exactly the kind of thing a single-dialect fixture set
    // never gets to check.
    startTool: (index, _ordinal, id, name) =>
      ev('content_block_start', { index, content_block: { type: 'tool_use', id, name, input: {} } }),
    toolArgs: (index, _ordinal, fragment) =>
      ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: fragment } }),
    // A thinking block gets its signature before it closes. Without it the block
    // has no `raw` payload to echo, and `toAnthropicMessages` refuses to encode
    // the next round rather than sending a request Anthropic would 400 — which
    // is the behaviour S18's round 2 now actually exercises.
    stopBlock: (index, kind) =>
      (kind === 'thinking'
        ? ev('content_block_delta', {
            index,
            delta: { type: 'signature_delta', signature: 'canned-signature' },
          })
        : '') + ev('content_block_stop', { index }),
    finish: (reason) =>
      ev('message_delta', {
        delta: { stop_reason: STOP[reason] ?? 'end_turn' },
        usage: { output_tokens: 0 },
      }),
    error: (code, message) => ev('error', { error: { type: code, message } }),
    end: () => ev('message_stop', {}),
  };
}

/** Split a JSON string into `n` fragments at deliberately awkward offsets, so a
 *  reader that assumes a fragment is valid JSON, or that a key never spans two
 *  frames, breaks here. */
function shred(json, n) {
  const size = Math.max(1, Math.ceil(json.length / n));
  const out = [];
  for (let i = 0; i < json.length; i += size) out.push(json.slice(i, i + size));
  return out;
}

/** Interleave two fragment lists round-robin: call 0, call 1, call 0, … which is
 *  what a provider streaming parallel calls actually sends. */
function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(['a', a[i]]);
    if (i < b.length) out.push(['b', b[i]]);
  }
  return out;
}

/** Every canned stream, as a function of the dialect. */
function buildAll(d) {
  const files = {};
  const put = (dir, round, sse) => {
    files[join(dir, `round-${round}.sse`)] = sse;
  };
  /** A whole text block: open, deltas, close. */
  const prose = (index, ...parts) =>
    d.startText(index) + parts.map((s) => d.text(index, s)).join('') + d.stopBlock(index, 'text');

  // ── S05: two tool calls in one turn ────────────────────────────────────────
  {
    const paris = shred(JSON.stringify({ city: 'Paris' }), 4);
    const tokyo = shred(JSON.stringify({ city: 'Tokyo' }), 4);
    let sse = d.prelude();
    if (d.id === 'openai') {
      // Chat completions announces both calls up front and then interleaves
      // their argument fragments round-robin, which is what breaks a reader that
      // assumes a fragment is valid JSON or that a key never spans two frames.
      sse += d.startTool(0, 0, 'call_paris', 'get_weather');
      sse += d.startTool(1, 1, 'call_tokyo', 'get_weather');
      for (const [which, fragment] of interleave(paris, tokyo)) {
        sse += d.toolArgs(which === 'a' ? 0 : 1, which === 'a' ? 0 : 1, fragment);
      }
    } else {
      // Anthropic streams content blocks STRICTLY IN SEQUENCE — block 0 opens,
      // fills and closes before block 1 starts. Emitting the interleaved form
      // here would test a stream the provider cannot produce, so the parallel
      // case is expressed the way it actually arrives: two complete tool_use
      // blocks in one assistant turn.
      sse += d.startTool(0, 0, 'call_paris', 'get_weather');
      for (const f of paris) sse += d.toolArgs(0, 0, f);
      sse += d.stopBlock(0, 'tool_use');
      sse += d.startTool(1, 1, 'call_tokyo', 'get_weather');
      for (const f of tokyo) sse += d.toolArgs(1, 1, f);
      sse += d.stopBlock(1, 'tool_use');
    }
    sse += d.finish('tool_calls') + d.end();
    put('S05-parallel-tools', 1, sse);

    put(
      'S05-parallel-tools',
      2,
      prose(
        0,
        'Paris is at 12°C with light rain, Tokyo is clear at 19°C. ',
        'Take a jacket for Paris.',
      ) +
        d.finish('stop') +
        d.end(),
    );
  }

  // ── S06b: arguments cut off by the token limit ─────────────────────────────
  {
    let sse = d.startTool(0, 0, 'call_trunc', 'get_weather');
    // Deliberately unterminated: this is what a length-capped call leaves
    // behind, and the adapter is expected to say so rather than to guess.
    sse += d.toolArgs(0, 0, '{"cit');
    sse += d.toolArgs(0, 0, 'y": "Par');
    sse += d.finish('length') + d.end();
    put('S06b-malformed-args', 1, sse);
  }

  // ── S13: the same artifact, revised ────────────────────────────────────────
  {
    const draft = (body) => JSON.stringify({ artifactId: 'rel-note', title: 'Release note', body });
    const call = (id, body) => {
      let sse = d.startTool(0, 0, id, 'open_artifact');
      for (const f of shred(draft(body), 5)) sse += d.toolArgs(0, 0, f);
      return sse + d.stopBlock(0, 'tool_use') + d.finish('tool_calls') + d.end();
    };
    put('S13-artifact', 1, call('call_art_1', 'v1 draft — parts land in stream order.'));
    put(
      'S13-artifact',
      2,
      call('call_art_2', 'v2 revised — parts land in stream order, and cards render inline.'),
    );
    put('S13-artifact', 3, prose(0, 'The release note is ready above.') + d.finish('stop') + d.end());
  }

  // ── S16: the provider dies after the headers ───────────────────────────────
  {
    let sse = d.startText(0);
    sse += d.text(0, 'Streaming is ');
    sse += d.text(0, 'the part everyone gets wrong: a new array reference per chunk is ');
    sse += d.text(0, 'what makes the thread re-render. ');
    // No content_block_stop and no finish: the stream is cut off mid-block,
    // which is the whole point.
    sse += d.error('rate_limit_exceeded', 'Provider rate limit exceeded mid-generation.');
    sse += d.end();
    put('S16-mid-stream-error', 1, sse);
  }

  // ── S17: a stream long enough to interrupt ─────────────────────────────────
  {
    // The tool call comes FIRST so the panel is on screen before the text the
    // user will interrupt. It never gets a result: the point is what happens to
    // a tool part that is still pending when the user hits Stop.
    let sse = d.startTool(0, 0, 'call_slow', 'get_weather');
    for (const f of shred(JSON.stringify({ city: 'Paris' }), 3)) sse += d.toolArgs(0, 0, f);
    sse += d.stopBlock(0, 'tool_use');
    sse += prose(
      1,
      'Streaming a chat UI is mostly a question of identity. ',
      'Every delta produces a new array, and the renderer has to decide which rows are the same rows. ',
      'Key by reference and every chunk looks like a brand-new list. ',
      'Key by position and a row survives its own content changing. ',
      'That distinction is invisible until a user interacts with a half-written message. ',
      'Then it is the only thing that matters. ',
      'A disclosure they opened has to still be open one token later. ',
      'A tool panel they are reading must not scroll away and come back empty. ',
      'None of this shows up in a snapshot test. ',
      'All of it shows up the first time somebody clicks. ',
    );
    sse += d.finish('tool_calls') + d.end();
    put('S17-cancel', 1, sse);
    // Safety net: if a run is too slow to land the click before the stream ends,
    // the loop asks for round 2 and gets an honest answer instead of a 404 that
    // would be reported as a scenario failure.
    put('S17-cancel', 2, prose(0, 'Paris is at 12°C with light rain.') + d.finish('stop') + d.end());
  }

  // ── S18: long reasoning, then a tool call, both openable mid-stream ────────
  {
    const thoughts = [
      'The user wants to know what to wear in Paris. ',
      'That needs the current conditions, not a general answer about the climate. ',
      'get_weather takes a single city, so one call is enough here. ',
      'Paris in the fixture is light rain at 12 degrees. ',
      'Twelve degrees and rain means a layer plus something waterproof. ',
      'I should answer briefly and not lecture them about the weather. ',
      'Let me make the call first and write the answer from the result. ',
      'It is worth naming the temperature explicitly so the advice is checkable. ',
    ];
    let sse = d.startThinking(0);
    // Split each thought again so the reasoning body keeps growing frame by
    // frame — the assertion measures that it GREW while open, not merely that
    // it exists.
    for (const t of thoughts) for (const f of shred(t, 4)) sse += d.thinking(0, f);
    sse += d.stopBlock(0, 'thinking');
    sse += d.startTool(1, 0, 'call_wear', 'get_weather');
    for (const f of shred(JSON.stringify({ city: 'Paris' }), 8)) sse += d.toolArgs(1, 0, f);
    sse += d.stopBlock(1, 'tool_use');
    sse += d.finish('tool_calls') + d.end();
    put('S18-expand-mid-stream', 1, sse);

    put(
      'S18-expand-mid-stream',
      2,
      prose(
        0,
        'It is 12°C with light rain in Paris — ',
        'take a light jacket and something waterproof.',
      ) +
        d.finish('stop') +
        d.end(),
    );
  }

  // ── the negative controls ──────────────────────────────────────────────────
  // Streams that deliberately produce the WRONG thing, so every assertion can be
  // watched failing before it is trusted. See Scenario.controlDir.
  {
    // Prose and nothing else: no reasoning, no tool call, no card, no
    // attachment, no citation, no error. Everything except S01 must go red
    // against this.
    for (const round of [1, 2, 3]) {
      put('CONTROL-empty', round, prose(0, 'ok.') + d.finish('stop') + d.end());
    }

    // The inverse control, for the scenarios whose claim is that something is
    // ABSENT (S01: no tool panel on a tool-free turn) or that something FAILED
    // (S16: an error must be surfaced). A clean, successful tool round is the
    // stream those two must go red against.
    let noisy = d.startTool(0, 0, 'call_ctrl', 'get_weather');
    for (const f of shred(JSON.stringify({ city: 'Paris' }), 3)) noisy += d.toolArgs(0, 0, f);
    noisy += d.stopBlock(0, 'tool_use') + d.finish('tool_calls') + d.end();
    put('CONTROL-noisy', 1, noisy);
    put(
      'CONTROL-noisy',
      2,
      prose(
        0,
        'Paris is at 12°C with light rain, so take a jacket and something waterproof with you today.',
      ) +
        d.finish('stop') +
        d.end(),
    );
  }

  return files;
}

let written = 0;
for (const [dir, dialect] of [
  ['canned', openaiDialect()],
  ['canned-anthropic', anthropicDialect()],
]) {
  for (const [relative, sse] of Object.entries(buildAll(dialect))) {
    const file = join(ROOT, 'fixtures', dir, relative);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, sse, 'utf8');
    written++;
  }
}
console.log(`wrote ${written} canned fixtures under fixtures/canned{,-anthropic}/`);
