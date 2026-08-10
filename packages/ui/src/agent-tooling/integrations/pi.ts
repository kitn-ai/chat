import type { Integration } from '../types';

const pi: Integration = {
  id: 'pi',
  title: 'Pi',
  category: 'harness',
  language: 'ts',
  streamFormat: 'native',
  envVars: [],
  routeTemplates: {
    express: `import { spawn } from 'node:child_process';

// POST /api/chat: bridge a Pi RPC session to the browser as SSE
const pi = spawn('pi', ['--mode', 'rpc', '--no-session']);

// Send the user's turn. Pi commands are { type, message }.
pi.stdin.write(JSON.stringify({ type: 'prompt', message: prompt }) + '\\n');

let buffer = '';
pi.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\\n');
  buffer = lines.pop(); // hold the partial line for the next chunk
  for (const line of lines) {
    if (!line) continue;
    const event = JSON.parse(line);
    const part = event.assistantMessageEvent;
    if (event.type === 'message_update' && part?.type === 'text_delta') {
      res.write(\`data: \${JSON.stringify({ choices: [{ delta: { content: part.delta } }] })}\\n\\n\`);
    }
  }
});
pi.on('close', () => { res.write('data: [DONE]\\n\\n'); res.end(); });`,
  },
  streamMapping: "Pi runs as a local stdio process in RPC mode (pi --mode rpc --no-session). It emits newline-delimited JSON events on stdout. Map message_update events where assistantMessageEvent.type === 'text_delta' to data: {choices:[{delta:{content:part.delta}}]} SSE frames; send data: [DONE] on close. Split stdout on \\n (not readline, which breaks on Unicode separators U+2028/U+2029). Pi also emits thinking_delta and toolcall_* events; re-frame them onto delta.reasoning and delta.tool_calls in the same frames. readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning.",
  runNote: "Pi must be installed locally and available on PATH as 'pi'. No API key is required by the bridge itself; Pi uses its own credentials. Pi runs with full user permissions, so sandbox it before exposing to a public endpoint. See the RPC reference: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md",
  docsSlug: 'integrations/harnesses',
};

export default pi;
