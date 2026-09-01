// Sample data for <kai-context> non-scalar props. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding an element never touches a shared file.
//
// `sample`  = default non-scalar prop data (the playground + bare examples use it)
// `named`   = alternate sets a focused <Example data="…"> can opt into
//
// kai-context has ONE non-scalar prop: `context` (ContextData object).
// The default sample provides a realistic mid-conversation usage snapshot
// (~24% — comfortably in the "ok" range) with full breakdown fields including
// reasoning and cache tokens. Named sets cover the warn and danger severity levels
// plus a minimal usage object (no breakdown tokens).

// Default — ~24% used; all breakdown fields present.
const DEFAULT_CONTEXT = {
  usedTokens: 48200,
  maxTokens: 200000,
  inputTokens: 31000,
  outputTokens: 17200,
  reasoningTokens: 4200,
  cacheTokens: 8000,
  estimatedCost: 0.42,
};

// Warn level — 75% used (150 000 / 200 000); exceeds the default
// warnThreshold of 0.7 (70%), so computeSeverity returns 'warn'.
const WARN_CONTEXT = {
  usedTokens: 150000,
  maxTokens: 200000,
  inputTokens: 98000,
  outputTokens: 52000,
  estimatedCost: 1.24,
};

// Danger level — 92% used; meter turns red.
const DANGER_CONTEXT = {
  usedTokens: 184000,
  maxTokens: 200000,
  inputTokens: 120000,
  outputTokens: 64000,
  estimatedCost: 1.87,
};

// Custom thresholds — 55% used; triggers warn at warnThreshold=0.5.
// warnThreshold and dangerThreshold are also included here so the
// Example component (which sets sample data as JS properties) applies
// them to the live element — number props fall outside the string/boolean
// config paths in Example.tsx.
const CUSTOM_THRESHOLDS_CONTEXT = {
  usedTokens: 110000,
  maxTokens: 200000,
  inputTokens: 70000,
  outputTokens: 40000,
  estimatedCost: 0.65,
};

export default {
  sample: {
    context: DEFAULT_CONTEXT,
  },
  named: {
    warn: {
      context: WARN_CONTEXT,
    },
    danger: {
      context: DANGER_CONTEXT,
    },
    customThresholds: {
      context: CUSTOM_THRESHOLDS_CONTEXT,
      warnThreshold: 0.5,
      dangerThreshold: 0.75,
    },
  },
};
