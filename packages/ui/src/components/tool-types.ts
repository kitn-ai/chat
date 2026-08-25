import type { ToolKind } from './tool-classify';

/** The untranslated provider payload a part was normalized from.
 *
 *  Optional in the type but REQUIRED in practice for round-trip fidelity. Anthropic
 *  returns a 400 invalid_request_error if `thinking` blocks are modified, reordered,
 *  filtered or RECONSTRUCTED, so an encoder must send `raw.payload` back verbatim
 *  rather than rebuilding a block from `text` + `signature`. */
export interface RawOrigin {
  /** Tagged origin, e.g. 'anthropic.content_block', 'openai.delta', `custom.${string}`. */
  source: string;
  payload: unknown;
}

/** A tool-call part rendered by <Tool>. Pure type — kept JSX-free so it can be
 *  imported by the framework-neutral state core and the React typecheck pass.
 *
 *  Adding a field here also requires adding it to `TOOL_KEYS` (and a comparator
 *  in `TOOL_COMPARATORS`) in `state/parts.ts`, or `tsc` fails to compile: those
 *  drive `upsertToolPart`'s dedupe check, and a field missing from them would
 *  silently make that check ignore the new field, keeping a stale array
 *  reference alive when only that field changed. */
export interface ToolPart {
  /** The tool name exactly as the provider reported it. */
  type: string;
  /** Semantic classification for rendering. Derive with classifyTool(type). */
  kind?: ToolKind;
  /** The call's lifecycle. A provider stream (real or `createMockResponder`)
   *  only ever ANNOUNCES a call: arguments stream in (`input-streaming`), then
   *  the part parks at `input-available` — and stays there. The kit parses and
   *  renders the call; EXECUTING it and answering is the host's side of the
   *  seam: after the read settles, run the tool and patch the part forward with
   *  `stream.upsertTool(id, { state: 'output-available', output })` (or
   *  `upsertToolPart`), or `output-error` + `errorText` on failure. The one
   *  exception is a call the provider ran itself (`raw` carries the result and
   *  the wire sets `output` directly) — never re-execute those. */
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  /** Last VALID parsed snapshot, fingerprint-deduped. The primary channel: this is
   *  what the kit renders. */
  input?: Record<string, unknown>;
  /** Raw accumulated argument fragments, for consumers wanting character-level
   *  streaming. Most consumers should read `input` instead. */
  rawInput?: string;
  output?: Record<string, unknown>;
  toolCallId?: string;
  errorText?: string;
  /** The untranslated provider payload this was normalized from. */
  raw?: RawOrigin;
}
