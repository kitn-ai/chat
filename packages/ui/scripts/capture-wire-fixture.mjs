#!/usr/bin/env node
// Regenerate a captured L2 wire fixture from a live provider.
//
// CI NEVER RUNS THIS. It needs a key and the network, and its output is checked
// in on purpose so the test suite stays offline. Run it by hand when a provider
// changes its event surface, then READ THE DIFF before committing.
//
//   OPENAI_API_KEY=...    node scripts/capture-wire-fixture.mjs openai/text-only
//   ANTHROPIC_API_KEY=... node scripts/capture-wire-fixture.mjs anthropic/thinking-tool
//   node scripts/capture-wire-fixture.mjs --list
//
// The key is read from env, used only in a request header, and NEVER written to
// the fixture: the provenance header records the request BODY only.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src/wire/fixtures');

const OPENAI_MODEL = process.env.CAPTURE_OPENAI_MODEL ?? 'gpt-4o-mini';
const ANTHROPIC_MODEL = process.env.CAPTURE_ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
const OPENROUTER_MODEL = process.env.CAPTURE_OPENROUTER_MODEL ?? '~deepseek/deepseek-v4-flash-latest';
// The model to use when an openai-format scenario runs through OpenRouter. Kept
// separate from OPENROUTER_MODEL because the tool scenarios want a model with
// dependable function calling, not the cheapest one on the list.
const OPENROUTER_OPENAI_MODEL = process.env.CAPTURE_OPENROUTER_OPENAI_MODEL ?? 'openai/gpt-4o-mini';

/**
 * Where the plain openai-format scenarios go. The wire format is identical
 * either way, so whichever key is present wins and the provenance header records
 * which endpoint actually answered. Set CAPTURE_OPENAI_PROVIDER to force one.
 */
const OPENAI_COMPATIBLE =
  (process.env.CAPTURE_OPENAI_PROVIDER ?? (process.env.OPENAI_API_KEY ? 'openai' : 'openrouter')) ===
  'openai'
    ? { provider: 'openai', model: OPENAI_MODEL }
    : { provider: 'openrouter', model: OPENROUTER_OPENAI_MODEL };

/**
 * Where the anthropic-format scenarios go. OpenRouter's /v1/messages speaks the
 * REAL Anthropic Messages event stream (message_start, content_block_delta,
 * signature_delta, ...), so a capture through it is a genuine capture of this
 * format; only the routing differs, which the header's provider line records.
 * A direct ANTHROPIC_API_KEY still wins when one is present.
 */
const ANTHROPIC_COMPATIBLE = process.env.ANTHROPIC_API_KEY
  ? { provider: 'anthropic', model: ANTHROPIC_MODEL }
  : {
      provider: 'openrouter-anthropic',
      model: process.env.CAPTURE_OPENROUTER_ANTHROPIC_MODEL ?? 'anthropic/claude-haiku-4.5',
    };

const WEATHER_TOOL_OPENAI = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Current weather for a city.',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' }, units: { type: 'string' } },
      required: ['city'],
    },
  },
};

const WEATHER_TOOL_ANTHROPIC = {
  name: 'get_weather',
  description: 'Current weather for a city.',
  input_schema: {
    type: 'object',
    properties: { city: { type: 'string' }, units: { type: 'string' } },
    required: ['city'],
  },
};

const ask = (content) => [{ role: 'user', content }];

/** Every capture this repo keeps. The name is the fixture path. */
const SCENARIOS = {
  'openai/text-only': {
    ...OPENAI_COMPATIBLE,
    body: { stream: true, messages: ask('Say hi in five words.') },
  },
  'openai/multibyte-text': {
    // The ONLY fixture that can catch a decoder built without
    // `TextDecoder.decode(chunk, { stream: true })`. Every other capture here is
    // pure ASCII, where a chunk boundary can never land inside a codepoint, so
    // the byte-boundary sweep would pass against a broken decoder without this.
    // Emoji are 4 bytes and CJK is 3, so replaying at 1 and 3 bytes splits them.
    ...OPENAI_COMPATIBLE,
    body: {
      stream: true,
      messages: ask(
        'Reply with exactly this line and nothing else: cafe latte 日本語 naive 🌍🇯🇵 Grüße',
      ),
    },
  },
  'openai/tool-fragmented-args': {
    ...OPENAI_COMPATIBLE,
    body: {
      stream: true,
      tools: [WEATHER_TOOL_OPENAI],
      messages: ask('What is the weather in Paris in metric units? Use the tool.'),
    },
  },
  'openai/parallel-tools': {
    ...OPENAI_COMPATIBLE,
    body: {
      stream: true,
      tools: [WEATHER_TOOL_OPENAI],
      messages: ask('Compare the weather in Paris and Tokyo. Call the tool once per city.'),
    },
  },
  'openai/length-mid-arguments': {
    // Model PINNED. Truncating a tool call mid-arguments is easy; getting
    // `finish_reason: "length"` out of it is not, because OpenRouter normalizes
    // the reason and reports `tool_calls` whenever tool_calls are present for an
    // OpenAI-family model (see openai/length-normalized-to-tool-calls). Several
    // models that DO report `length` buffer the whole call and stream no partial
    // arguments at all, which loses the shape from the other side. This one
    // reports `length` AND streams the arguments incrementally.
    provider: 'openrouter',
    model: process.env.CAPTURE_TRUNCATION_MODEL ?? '~anthropic/claude-haiku-latest',
    body: {
      stream: true,
      max_tokens: 24,
      tools: [WEATHER_TOOL_OPENAI],
      tool_choice: 'required',
      messages: ask(
        'Call get_weather for San Francisco. The units argument must be a very long descriptive sentence.',
      ),
    },
  },
  'openai/length-normalized-to-tool-calls': {
    // The same truncation through an OpenAI-family model, where OpenRouter
    // rewrites the reason: `finish_reason: "tool_calls"` with
    // `native_finish_reason: "max_output_tokens"`. The adapter therefore cannot
    // blame the token limit and reports plain malformed arguments instead.
    provider: 'openrouter',
    model: process.env.CAPTURE_OPENROUTER_OPENAI_MODEL ?? 'openai/gpt-4.1-mini',
    body: {
      stream: true,
      max_tokens: 12,
      tools: [WEATHER_TOOL_OPENAI],
      tool_choice: 'required',
      messages: ask(
        'Call get_weather for San Francisco. The units argument must be a very long descriptive sentence.',
      ),
    },
  },
  'openai/finish-error-no-message': {
    // A provider failure reported ONLY as `finish_reason: "error"`, with no
    // `error` object anywhere in the stream. Gemini does this when it cannot
    // produce a well-formed function call. `stopReason` is 'error' while
    // `turn.error` stays undefined, which is a real hole a UI has to handle.
    provider: 'openrouter',
    model: process.env.CAPTURE_GEMINI_MODEL ?? 'google/gemini-2.5-flash',
    body: {
      stream: true,
      max_tokens: 12,
      tools: [WEATHER_TOOL_OPENAI],
      messages: ask('Call get_weather for San Francisco with a very long units string.'),
    },
  },
  'openai/reasoning-both-fields': {
    // The doubling trap: the same text in `reasoning` AND `reasoning_details`.
    // Needs an OpenRouter key and a reasoning model.
    provider: 'openrouter',
    model: OPENROUTER_MODEL,
    body: { stream: true, reasoning: { effort: 'medium' }, messages: ask('Think, then answer: 17 * 23.') },
  },
  'openai/usage-only-final-chunk': {
    provider: 'openrouter',
    model: OPENROUTER_MODEL,
    body: { stream: true, stream_options: { include_usage: true }, messages: ask('Reply with the word ok.') },
  },
  'anthropic/thinking-tool': {
    ...ANTHROPIC_COMPATIBLE,
    body: {
      stream: true,
      max_tokens: 2048,
      thinking: { type: 'enabled', budget_tokens: 1024 },
      tools: [WEATHER_TOOL_ANTHROPIC],
      messages: ask('Think about it, then get the weather in Paris using the tool.'),
    },
  },
  'anthropic/text-only': {
    ...ANTHROPIC_COMPATIBLE,
    body: { stream: true, max_tokens: 256, messages: ask('Say hi in five words.') },
  },
  'anthropic/max-tokens': {
    ...ANTHROPIC_COMPATIBLE,
    body: { stream: true, max_tokens: 8, messages: ask('Write a long paragraph about SSE.') },
  },
  'anthropic/multibyte-text': {
    // The Anthropic-format half of the split-codepoint guard. See
    // openai/multibyte-text for why this fixture has to exist.
    ...ANTHROPIC_COMPATIBLE,
    body: {
      stream: true,
      max_tokens: 256,
      messages: ask(
        'Reply with exactly this line and nothing else: cafe latte 日本語 naive 🌍🇯🇵 Grüße',
      ),
    },
  },
  'anthropic/empty-thinking': {
    // `display: "omitted"` is the documented, reproducible way to get a thinking
    // block with NO thinking_delta at all: the block opens, one signature_delta
    // arrives, the block closes. The reasoning part must survive with empty text
    // because the signature is what round-trips.
    ...ANTHROPIC_COMPATIBLE,
    body: {
      stream: true,
      max_tokens: 2048,
      thinking: { type: 'enabled', budget_tokens: 1024, display: 'omitted' },
      messages: ask('Think about it, then answer: what is 17 * 23?'),
    },
  },
};

const ENDPOINTS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    keyEnv: 'OPENAI_API_KEY',
    headers: (key) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
    headers: (key) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }),
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    keyEnv: 'ANTHROPIC_API_KEY',
    headers: (key) => ({
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
  },
  // Anthropic Messages events, routed through OpenRouter. Same event stream,
  // different door, for a machine that has an OpenRouter key and no Anthropic one.
  'openrouter-anthropic': {
    url: 'https://openrouter.ai/api/v1/messages',
    keyEnv: 'OPENROUTER_API_KEY',
    headers: (key) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'anthropic-version': '2023-06-01',
    }),
  },
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

const name = process.argv[2];
if (!name || name === '--list') {
  console.log('Scenarios:\n' + Object.keys(SCENARIOS).map((s) => `  ${s}`).join('\n'));
  process.exit(name ? 0 : 1);
}

const scenario = SCENARIOS[name];
if (!scenario) fail(`Unknown scenario "${name}". Run with --list.`);

const endpoint = ENDPOINTS[scenario.provider];
const key = process.env[endpoint.keyEnv];
if (!key) fail(`${endpoint.keyEnv} is not set. This script needs a real key; CI never runs it.`);

const requestBody = { model: scenario.model, ...scenario.body };
const res = await fetch(endpoint.url, {
  method: 'POST',
  headers: endpoint.headers(key),
  body: JSON.stringify(requestBody),
});

if (!res.ok || !res.body) {
  fail(`HTTP ${res.status} ${res.statusText}\n${await res.text()}`);
}

// Read the stream RAW. No parsing: the fixture is the bytes the provider sent.
const reader = res.body.getReader();
const decoder = new TextDecoder();
let sse = '';
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  sse += decoder.decode(value, { stream: true });
}
sse += decoder.decode();

const header = [
  `: fixture: ${name}`,
  `: capture: live`,
  `: provider: ${scenario.provider}`,
  `: model: ${scenario.model}`,
  `: captured: ${new Date().toISOString().slice(0, 10)}`,
  // One line, so the header stays a valid run of SSE comments.
  `: request: ${JSON.stringify(requestBody)}`,
  '',
  '',
].join('\n');

const outPath = join(OUT_DIR, `${name}.sse`);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, header + sse, 'utf8');
console.log(`Wrote ${outPath} (${sse.length} bytes of SSE). Read the diff before committing.`);
