// Pure command-routing decision, extracted from bin/mcp.js for testability.
// This module has no side effects (no fs/process/import()) — bin/mcp.js does
// the actual dynamic import() based on what this returns.
export const CONSTRUCT_COMMANDS = ['dev', 'compile', 'eject', 'validate'];
export const KNOWN_COMMANDS = ['mcp', ...CONSTRUCT_COMMANDS];

/**
 * `npx @kitn.ai/ui <cmd>`: `mcp` (or nothing) starts the MCP server — the
 * historical behavior, byte-compatible and unchanged. dev/compile/eject/
 * validate load the construct CLI. Anything else is a typo, not a server
 * request — it must error loudly, never fall through to the server.
 *
 * @param {string | undefined} command
 * @returns {{ kind: 'mcp' } | { kind: 'construct' } | { kind: 'error', message: string }}
 */
export function decideEntry(command) {
  if (command === undefined || command === 'mcp') return { kind: 'mcp' };
  if (CONSTRUCT_COMMANDS.includes(command)) return { kind: 'construct' };
  return {
    kind: 'error',
    message: `unknown command "${command}" — valid commands: ${KNOWN_COMMANDS.join(', ')}`,
  };
}
