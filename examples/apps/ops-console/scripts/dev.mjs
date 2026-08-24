/**
 * `npm run dev` — both origins at once.
 *
 * The console on :5182 and the run-board provider on :5183. They are two Vite
 * servers because they must be two ORIGINS; `<kai-remote>` refuses to frame a
 * card that is same-origin with its host, and rightly so.
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const targets = [
  { name: 'console', args: ['--config', 'vite.config.ts'], color: '[36m' },
  { name: 'board  ', args: ['--config', 'vite.board.config.ts'], color: '[35m' },
];

const vite = process.platform === 'win32' ? 'vite.cmd' : 'vite';
const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

for (const target of targets) {
  const child = spawn(vite, target.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  children.push(child);

  const prefix = `${target.color}[${target.name}][0m `;
  const relay = (stream, sink) => {
    stream.setEncoding('utf8');
    let carry = '';
    stream.on('data', (chunk) => {
      carry += chunk;
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) sink.write(`${prefix}${line}\n`);
    });
  };
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);

  child.on('exit', (code) => {
    if (!shuttingDown) {
      process.stderr.write(`${prefix}exited with code ${code ?? 0}\n`);
      shutdown(code ?? 0);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
