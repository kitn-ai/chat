/**
 * The kit Button's variant names — a LEAF on purpose (no imports), so the
 * construct schema (Node-only mcp tsc pass, which cannot import a .tsx) can
 * build its `header.actions[].variant` zod enum from it (B-6a). button.tsx
 * types its cva variant record `Record<ButtonVariantName, string>` off this
 * const (tsc is the live drift guard) and button-variant-names.test.tsx
 * asserts runtime key equality against the real record — the create-kai
 * precedent: where a bundle boundary blocks a live import, correspondence
 * lives in the TEST layer, driven off the real object on every run.
 */
export const BUTTON_VARIANT_NAMES = ['default', 'ghost', 'subtle', 'outline', 'destructive'] as const;
export type ButtonVariantName = (typeof BUTTON_VARIANT_NAMES)[number];
