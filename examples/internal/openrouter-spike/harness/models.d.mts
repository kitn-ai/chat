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

export interface MatrixModel {
  /** Column name in the matrix table, and the report file's basename. */
  key: string;
  /** The OpenRouter model id, `~` prefix and all. */
  model: string;
  /** Which dialect this column is driven and recorded in. */
  wire: MatrixWire;
  /** Its own dev-server port, so a stale server can never be reused. */
  port: number;
  /** Whether this configuration is expected to emit reasoning at all. */
  reasons: boolean;
}

export declare const MODELS: MatrixModel[];
