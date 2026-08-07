import type { ToolKind } from './tool-classify';
import type { RawOrigin } from '../elements/chat-types';

/** A tool-call part rendered by <Tool>. Pure type — kept JSX-free so it can be
 *  imported by the framework-neutral state core and the React typecheck pass. */
export interface ToolPart {
  /** The tool name exactly as the provider reported it. */
  type: string;
  /** Semantic classification for rendering. Derive with classifyTool(type). */
  kind?: ToolKind;
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
