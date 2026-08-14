// Types for `models.mjs`. The catalog itself stays JavaScript because
// `run-matrix.mjs` is plain node with no build step, and the spike's tsconfig
// does not enable `allowJs`.
//
// The declaration is deliberately NOT how the guard learns that an entry is
// malformed: `auditReasoningCoverage` takes `readonly unknown[]` and validates
// every field at runtime. A type that a `.mjs` file is free to ignore is not a
// guard, and an undeclared column has to fail loudly rather than be assumed
// well-typed.

/** The SSE dialect a column is recorded in. Closed on purpose: a third dialect
 *  must be a hard failure everywhere it is switched on, not a silent zero. */
export type MatrixWire = 'openai' | 'anthropic';

/** Which server hop a column is driven through. `openrouter` posts OpenRouter's
 *  HTTP endpoint directly; `gateway` drives the SHIPPED vercel-ai-sdk route,
 *  which calls Vercel's AI Gateway through the AI SDK. Closed for the same
 *  reason as the wire: a third backend must fail loudly everywhere it is
 *  switched on rather than silently fall back to the default. */
export type MatrixBackend = 'openrouter' | 'gateway';

export interface MatrixModel {
  /** Column name in the matrix table, and the report file's basename. */
  key: string;
  /** The OpenRouter model id, `~` prefix and all. On a `gateway` column this is
   *  the id the ROUTE pins, and `SPIKE_EXPECT_MODEL` holds the two together. */
  model: string;
  /** Which dialect this column is driven and recorded in. */
  wire: MatrixWire;
  /** Which server hop this column is driven through. Part of the fixture
   *  directory name, because two backends can run the same model on the same
   *  wire — which is exactly what the comparison pair does. */
  backend: MatrixBackend;
  /** Its own dev-server port, so a stale server can never be reused. */
  port: number;
  /** Whether this configuration is expected to emit reasoning at all. */
  reasons: boolean;
}

export declare const MODELS: MatrixModel[];
