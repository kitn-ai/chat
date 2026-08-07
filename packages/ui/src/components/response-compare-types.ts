// Types + pure helpers for the dual-response comparison card (`ResponseCompare` /
// `<kai-compare>`). A compare presents exactly TWO assistant candidates for the
// same prompt side-by-side; the user picks the better one (a COMMIT, not a
// Submit), which the consumer turns into a `(prompt, chosen, rejected)`
// preference pair. Kept framework-agnostic and DOM-free so it unit-tests in
// isolation.
import type { ToolPart } from './tool';
import type { AttachmentData } from './attachments';
import type { MessagePart } from '../elements/chat-types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One assistant response in a comparison. Rendered identically to an assistant
 *  message (reasoning + tools + attachments + markdown content) via `MessageBody`. */
export interface CompareCandidate {
  /** Stable id, unique within the pair; echoed back in the selection. */
  id: string;
  /** The response text/markdown. */
  content: string;
  /** Optional collapsible reasoning block. */
  reasoning?: { text: string; label?: string };
  /** Tool-call parts rendered above the content. */
  tools?: ToolPart[];
  /** Inline attachment previews rendered above the content. */
  attachments?: AttachmentData[];
  /** Optional short column label (e.g. "A" / "B" / "Concise"). */
  label?: string;
  /** Optional model name shown as a sub-label. */
  model?: string;
  /** When true this candidate is still streaming — its pick control is disabled
   *  and a per-column shimmer shows until it (and its sibling) settle. */
  streaming?: boolean;
}

/** The two-candidate tuple. Enforced at the type level; validated at runtime by
 *  `normalizeCandidates`. */
export type ComparePair = [CompareCandidate, CompareCandidate];

/** How the card collapses once the user picks. `'winner'` (default) shows just the
 *  chosen candidate's body; `'none'` keeps both columns but marks the choice. */
export type CompareCollapse = 'winner' | 'none';

/** The compare definition (set as the `data` JS property on `<kai-compare>`). */
export interface ResponseCompareData {
  /** Optional prompt/question shown above the two columns. */
  prompt?: string;
  /** Exactly two candidates: [A, B]. */
  candidates: ComparePair;
  /** Collapse behaviour after a pick. Default `'winner'`. */
  collapse?: CompareCollapse;
}

/** Emitted (and re-hydratable) when the user picks. The consumer pairs
 *  `(prompt, chosenId, rejectedIds)` for preference capture / RLHF. */
export interface CompareSelection {
  /** The id of the chosen candidate. */
  chosenId: string;
  /** The id(s) of the rejected candidate(s) — for a pair, the other one. */
  rejectedIds: string[];
  /** Epoch ms when the pick was made. */
  at?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested in isolation).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate + normalize the candidate list. A compare requires EXACTLY two
 * candidates with unique, non-empty string ids. Returns the usable pair, or an
 * error message when the definition is unusable (rendered as an inline error /
 * emitted as a `kai-error`). Modeled on `normalizeOptions`.
 */
export function normalizeCandidates(candidates: unknown): {
  candidates: ComparePair | null;
  error?: string;
} {
  if (!Array.isArray(candidates)) {
    return { candidates: null, error: "This comparison couldn't be displayed." };
  }
  if (candidates.length !== 2) {
    return {
      candidates: null,
      error: `A comparison needs exactly two candidates (got ${candidates.length}).`,
    };
  }
  const out: CompareCandidate[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c || typeof c !== 'object') {
      return { candidates: null, error: "This comparison couldn't be displayed." };
    }
    const cand = c as Partial<CompareCandidate>;
    if (typeof cand.id !== 'string' || cand.id.length === 0) {
      return { candidates: null, error: 'Each candidate needs a non-empty id.' };
    }
    if (seen.has(cand.id)) {
      return { candidates: null, error: `Duplicate candidate id "${cand.id}".` };
    }
    seen.add(cand.id);
    out.push({
      id: cand.id,
      content: typeof cand.content === 'string' ? cand.content : '',
      reasoning: cand.reasoning,
      tools: Array.isArray(cand.tools) ? cand.tools : undefined,
      attachments: Array.isArray(cand.attachments) ? cand.attachments : undefined,
      label: typeof cand.label === 'string' ? cand.label : undefined,
      model: typeof cand.model === 'string' ? cand.model : undefined,
      streaming: cand.streaming === true,
    });
  }
  return { candidates: [out[0], out[1]] };
}

/** Build the selection payload for choosing `chosenId` out of the pair (the other
 *  candidate is the rejected one). Stamps `at` with the current time. */
export function buildSelection(pair: ComparePair, chosenId: string): CompareSelection {
  const rejectedIds = pair.filter((c) => c.id !== chosenId).map((c) => c.id);
  return { chosenId, rejectedIds, at: Date.now() };
}

/** Whether any candidate in the pair is still streaming (pick stays disabled). */
export function isAnyStreaming(pair: ComparePair | null): boolean {
  if (!pair) return false;
  return pair.some((c) => c.streaming === true);
}

/** Map a `CompareCandidate`'s flat legacy fields (content/reasoning/tools/
 *  attachments) into the ordered `MessagePart[]` `MessageBody` now renders.
 *  `CompareCandidate` stays its own independent shape (it is `<kai-compare>`'s
 *  public `data` JSON, not a `ChatMessage`) — this is purely a render-time
 *  adapter, applied at each `MessageBody` call site. Order: reasoning (the
 *  thinking trace) → tool calls (the actions taken) → attachments (anything
 *  produced) → the final text answer, mirroring how an assistant turn reads. */
export function candidateToParts(candidate: CompareCandidate): MessagePart[] {
  const parts: MessagePart[] = [];
  if (candidate.reasoning) {
    parts.push({ type: 'reasoning', text: candidate.reasoning.text, label: candidate.reasoning.label });
  }
  for (const tool of candidate.tools ?? []) {
    parts.push({ type: 'tool', tool });
  }
  for (const attachment of candidate.attachments ?? []) {
    parts.push({ type: 'file', attachment });
  }
  if (candidate.content) {
    parts.push({ type: 'text', text: candidate.content });
  }
  return parts;
}
