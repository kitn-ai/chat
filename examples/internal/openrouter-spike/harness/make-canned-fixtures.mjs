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
const CANNED = join(ROOT, 'fixtures', 'canned');

const frame = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
const chunk = (delta, finish = null) =>
  frame({
    id: 'gen-canned',
    object: 'chat.completion.chunk',
    model: 'canned/fixture',
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

const text = (s) => chunk({ content: s });
const reasoning = (s) => chunk({ reasoning: s });
const stop = (reason) => chunk({}, reason);
const DONE = 'data: [DONE]\n\n';

/** Announce a tool call: id + name arrive first, arguments start empty. */
const toolOpen = (index, id, name) =>
  chunk({ tool_calls: [{ index, id, type: 'function', function: { name, arguments: '' } }] });

/** One fragment of a call's `arguments` string. */
const toolArgs = (index, fragment) =>
  chunk({ tool_calls: [{ index, function: { arguments: fragment } }] });

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

const files = {};
const put = (dir, round, sse) => {
  files[join(dir, `round-${round}.sse`)] = sse;
};

// ── S05: two tool calls in one turn, arguments interleaved ───────────────────
{
  const parisFrags = shred(JSON.stringify({ city: 'Paris' }), 4);
  const tokyoFrags = shred(JSON.stringify({ city: 'Tokyo' }), 4);
  let sse = ': OPENROUTER PROCESSING\n\n';
  sse += toolOpen(0, 'call_paris', 'get_weather');
  sse += toolOpen(1, 'call_tokyo', 'get_weather');
  for (const [which, fragment] of interleave(parisFrags, tokyoFrags)) {
    sse += toolArgs(which === 'a' ? 0 : 1, fragment);
  }
  sse += stop('tool_calls');
  sse += DONE;
  put('S05-parallel-tools', 1, sse);

  put(
    'S05-parallel-tools',
    2,
    text('Paris is at 12°C with light rain, Tokyo is clear at 19°C. ') +
      text('Take a jacket for Paris.') +
      stop('stop') +
      DONE,
  );
}

// ── S06b: arguments cut off by the token limit ───────────────────────────────
{
  let sse = toolOpen(0, 'call_trunc', 'get_weather');
  // Deliberately unterminated: this is what `finish_reason: "length"` mid-call
  // leaves behind, and the adapter is expected to say so rather than to guess.
  sse += toolArgs(0, '{"cit');
  sse += toolArgs(0, 'y": "Par');
  sse += stop('length');
  sse += DONE;
  put('S06b-malformed-args', 1, sse);
}

// ── S13: the same artifact, revised ──────────────────────────────────────────
{
  const draft = (body) =>
    JSON.stringify({ artifactId: 'rel-note', title: 'Release note', body });
  let one = toolOpen(0, 'call_art_1', 'open_artifact');
  for (const f of shred(draft('v1 draft — parts land in stream order.'), 5)) one += toolArgs(0, f);
  one += stop('tool_calls') + DONE;
  put('S13-artifact', 1, one);

  let two = toolOpen(0, 'call_art_2', 'open_artifact');
  for (const f of shred(draft('v2 revised — parts land in stream order, and cards render inline.'), 5)) {
    two += toolArgs(0, f);
  }
  two += stop('tool_calls') + DONE;
  put('S13-artifact', 2, two);

  put('S13-artifact', 3, text('The release note is ready above.') + stop('stop') + DONE);
}

// ── S16: the provider dies after the headers ─────────────────────────────────
{
  let sse = text('Streaming is ');
  sse += text('the part everyone gets wrong: a new array reference per chunk is ');
  sse += text('what makes the thread re-render. ');
  // OpenRouter's own in-band shape. It arrives as ModelTurn.error, not as an
  // HTTP status, because the response already started.
  sse += frame({
    error: { code: 'rate_limit_exceeded', message: 'Provider rate limit exceeded mid-generation.' },
    choices: [{ index: 0, delta: {}, finish_reason: 'error' }],
  });
  sse += DONE;
  put('S16-mid-stream-error', 1, sse);
}

// ── S17: a stream long enough to interrupt ───────────────────────────────────
{
  // The tool call comes FIRST so the panel is on screen before the text the user
  // will interrupt. It never gets a result: the point is what happens to a tool
  // part that is still pending when the user hits Stop.
  let sse = toolOpen(0, 'call_slow', 'get_weather');
  for (const f of shred(JSON.stringify({ city: 'Paris' }), 3)) sse += toolArgs(0, f);
  const sentences = [
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
  ];
  for (const s of sentences) sse += text(s);
  sse += stop('tool_calls');
  sse += DONE;
  put('S17-cancel', 1, sse);
  // Safety net: if a run is too slow to land the click before the stream ends,
  // the loop asks for round 2 and gets an honest answer instead of a 404 that
  // would be reported as a scenario failure.
  put('S17-cancel', 2, text('Paris is at 12°C with light rain.') + stop('stop') + DONE);
}

// ── S18: long reasoning, then a tool call, both openable mid-stream ──────────
{
  let sse = '';
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
  // Split each thought again so the reasoning body keeps growing frame by frame
  // — the assertion measures that it GREW while open, not merely that it exists.
  for (const t of thoughts) for (const f of shred(t, 4)) sse += reasoning(f);
  sse += toolOpen(0, 'call_wear', 'get_weather');
  for (const f of shred(JSON.stringify({ city: 'Paris' }), 8)) sse += toolArgs(0, f);
  sse += stop('tool_calls');
  sse += DONE;
  put('S18-expand-mid-stream', 1, sse);

  put(
    'S18-expand-mid-stream',
    2,
    text('It is 12°C with light rain in Paris — ') +
      text('take a light jacket and something waterproof.') +
      stop('stop') +
      DONE,
  );
}

// ── the negative controls ────────────────────────────────────────────────────
// Streams that deliberately produce the WRONG thing, so every assertion can be
// watched failing before it is trusted. See Scenario.controlDir.
{
  // Prose and nothing else: no reasoning, no tool call, no card, no attachment,
  // no citation, no error. Everything except S01 must go red against this.
  put('CONTROL-empty', 1, text('ok.') + stop('stop') + DONE);
  put('CONTROL-empty', 2, text('ok.') + stop('stop') + DONE);
  put('CONTROL-empty', 3, text('ok.') + stop('stop') + DONE);

  // The inverse control, for the scenarios whose claim is that something is
  // ABSENT (S01: no tool panel on a tool-free turn) or that something FAILED
  // (S16: an error must be surfaced). A clean, successful tool round is the
  // stream those two must go red against.
  let noisy = toolOpen(0, 'call_ctrl', 'get_weather');
  for (const f of shred(JSON.stringify({ city: 'Paris' }), 3)) noisy += toolArgs(0, f);
  noisy += stop('tool_calls') + DONE;
  put('CONTROL-noisy', 1, noisy);
  put(
    'CONTROL-noisy',
    2,
    text('Paris is at 12°C with light rain, so take a jacket and something waterproof with you today.') +
      stop('stop') +
      DONE,
  );
}

let written = 0;
for (const [relative, sse] of Object.entries(files)) {
  const file = join(CANNED, relative);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, sse, 'utf8');
  written++;
}
console.log(`wrote ${written} canned fixtures under fixtures/canned/`);
