/**
 * The construct schema's published URL — a LEAF on purpose (the kit-pin.ts
 * pattern, same reason as C-2's chat-actions const): templates.ts must stamp
 * `$schema` on every starter (B-14) without a value import of schema.ts,
 * whose top-level zod side effects esbuild cannot tree-shake past
 * (create-kai's wizard.ts header records that failure). schema.ts re-exports
 * this, so every existing import site keeps its one address.
 */
export const CONSTRUCT_SCHEMA_URL = 'https://ui.kitn.ai/schemas/construct/v1.json';
