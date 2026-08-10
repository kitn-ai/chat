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
    provider: 'openai',
    model: OPENAI_MODEL,
    body: { stream: true, messages: ask('Say hi in five words.') },
  },
  'openai/tool-fragmented-args': {
    provider: 'openai',
    model: OPENAI_MODEL,
    body: {
      stream: true,
      tools: [WEATHER_TOOL_OPENAI],
      messages: ask('What is the weather in Paris in metric units? Use the tool.'),
    },
  },
  'openai/parallel-tools': {
    provider: 'openai',
    model: OPENAI_MODEL,
    body: {
      stream: true,
      tools: [WEATHER_TOOL_OPENAI],
      messages: ask('Compare the weather in Paris and Tokyo. Call the tool once per city.'),
    },
  },
  'openai/length-mid-arguments': {
    provider: 'openai',
    model: OPENAI_MODEL,
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
    model: process.env.CAPTURE_OPENROUTER_MODEL ?? '~deepseek/deepseek-v4-flash-latest',
    body: { stream: true, reasoning: { effort: 'medium' }, messages: ask('Think, then answer: 17 * 23.') },
  },
  'openai/usage-only-final-chunk': {
    provider: 'openrouter',
    model: process.env.CAPTURE_OPENROUTER_MODEL ?? '~deepseek/deepseek-v4-flash-latest',
    body: { stream: true, stream_options: { include_usage: true }, messages: ask('Reply with the word ok.') },
  },
  'anthropic/thinking-tool': {
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,
    body: {
      stream: true,
      max_tokens: 2048,
      thinking: { type: 'enabled', budget_tokens: 1024 },
      tools: [WEATHER_TOOL_ANTHROPIC],
      messages: ask('Think about it, then get the weather in Paris using the tool.'),
    },
  },
  'anthropic/text-only': {
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,
    body: { stream: true, max_tokens: 256, messages: ask('Say hi in five words.') },
  },
  'anthropic/max-tokens': {
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,
    body: { stream: true, max_tokens: 8, messages: ask('Write a long paragraph about SSE.') },
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
