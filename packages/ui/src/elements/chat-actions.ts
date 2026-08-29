/**
 * The one const list of built-in message-action ids — a LEAF on purpose (no
 * imports; the kit-pin.ts pattern). `schema.ts` compiles under
 * tsconfig.mcp.json's Node-only no-DOM pass, and a VALUE import of
 * chat-types.ts would drag tool-types/attachment-types/card-contract into
 * that graph (spec C-2), so the const lives here and BOTH sides read it:
 * chat-types.ts derives the `ChatMessageAction` union from it (and
 * re-exports it, so existing import sites keep one address) and the
 * construct schema builds its zod enum from it (B-6). Never restate this
 * list anywhere — read it.
 */
export const CHAT_MESSAGE_ACTIONS = ['copy', 'like', 'dislike', 'regenerate', 'edit', 'speak'] as const;
