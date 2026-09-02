import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * The shape every AI/UI MCP tool module exports. The server reads `inputSchema`
 * (a zod object) to advertise the tool over the protocol — converting it to JSON
 * Schema — and calls `handler` when the tool is invoked.
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}
