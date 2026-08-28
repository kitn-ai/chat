import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decideEntry, CONSTRUCT_COMMANDS, KNOWN_COMMANDS } from './route.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dirname, 'mcp.js');
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

describe('package.json bin map (pure)', () => {
  it('maps both kai-mcp and kai to bin/mcp.js — `kai` is the documented install-time name', () => {
    expect(pkg.bin['kai-mcp']).toBe('./bin/mcp.js');
    expect(pkg.bin['kai']).toBe('./bin/mcp.js');
  });
});

describe('decideEntry (pure routing decision)', () => {
  it('no args -> mcp (byte-compatible historical behavior)', () => {
    expect(decideEntry(undefined)).toEqual({ kind: 'mcp' });
  });

  it('"mcp" -> mcp (byte-compatible historical behavior)', () => {
    expect(decideEntry('mcp')).toEqual({ kind: 'mcp' });
  });

  it.each(CONSTRUCT_COMMANDS)('%s -> construct', (cmd) => {
    expect(decideEntry(cmd)).toEqual({ kind: 'construct' });
  });

  it('unknown/typo\'d command -> error naming the valid commands', () => {
    const decision = decideEntry('frobnicate');
    expect(decision.kind).toBe('error');
    for (const known of KNOWN_COMMANDS) {
      expect(decision.message).toContain(known);
    }
  });
});

describe('bin/mcp.js dispatcher (spawned, real process)', () => {
  it('unknown subcommand exits 2 with stderr naming valid commands, never falling through to the server', () => {
    let status = 0;
    let stderr = '';
    try {
      execFileSync('node', [binPath, 'frobnicate'], { timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      status = err.status;
      stderr = err.stderr;
    }
    expect(status).toBe(2);
    expect(stderr).toMatch(/valid commands/i);
  });

  it('a typo\'d valid-ish command (validat) also exits 2, not a hang', () => {
    let status = 0;
    let stderr = '';
    try {
      execFileSync('node', [binPath, 'validat'], { timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      status = err.status;
      stderr = err.stderr;
    }
    expect(status).toBe(2);
    expect(stderr).toMatch(/valid commands/i);
  });
});
