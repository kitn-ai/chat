// src/primitives/field-mask.ts
// The pure format engine behind masked form fields: compile a `format` + display guide,
// normalize arbitrary input to raw, format raw back, and map caret positions between the
// two. No DOM, no Solid, no state -- the stateful masker (tier 2) and the widgets sit on
// top of this. Spec: docs/superpowers/specs/2026-08-24-form-field-formats-design.md
// (§2 tier 2, §3, deltas §5.4 and §5.7).
//
// Token vocabulary (a public contract, deliberately adopted rather than reinvented):
//   `#` one digit  ·  `@` one alphanumeric  ·  `*` one alphanumeric, obscurable in display
//   every OTHER character is a literal, identified by POSITION and not by character class.
// That last clause is the load-bearing part: it is why `V-***` works, where a
// character-class strip reads the literal `V` as user input (see normalizeToRaw).

/** How `normalizeToRaw` folds accepted characters. */
export type CaseMode = 'preserve' | 'upper' | 'lower';

/** Why an edit was refused. Rejection decides LOUDLY (spec §5.3): the stateful layer
 *  surfaces this on a callback and, on the element facade, as `kai-input-rejected`. */
export type RejectReason = 'full' | 'wrong-class' | 'over-capacity';

/** A compiled `format` + aligned display guide. Fill positions are `#` `@` `*`;
 *  every other index is a literal (spec §2). */
export interface MaskPattern {
  readonly format: string;
  readonly guide: string;          // same length as `format`
  readonly fillIndexes: readonly number[];
  readonly capacity: number;       // === fillIndexes.length
}

/** Thrown by `compileMask` only. Every other function in this module is total: it clamps
 *  or discards rather than throwing, because it runs on every keystroke. */
export class MaskError extends Error {}

/** Formats longer than this are refused. A mask is a field format, not a document; the cap
 *  bounds the per-keystroke walks below and makes a pasted "format" from an untrusted model
 *  a loud failure instead of a slow one. Refused, NOT truncated -- silently shortening a
 *  format changes what the field means (CLAUDE.md: decide loudly). */
const MAX_FORMAT_LENGTH = 64;

const DIGIT = /[0-9]/u;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

/** True when `token` is a fill position rather than a literal. */
function isFillToken(token: string): boolean {
  return token === '#' || token === '@' || token === '*';
}

/** The class test for a fill token. `*` is `@` for INPUT purposes -- the two differ only in
 *  how the display layer renders what was typed (spec §2 tier 3), never in what is accepted. */
function matchesToken(token: string, ch: string): boolean {
  return token === '#' ? DIGIT.test(ch) : ALPHANUMERIC.test(ch);
}

/** Compile a format string, with an optional aligned display guide.
 *
 *  Without a guide, one is derived: literals keep their own character and every fill
 *  position becomes a space, which is the alignment the display layer needs and is exactly
 *  the `V-   ` a consumer would have written by hand for `V-***`. */
export function compileMask(format: string, guide?: string): MaskPattern {
  if (format.length > MAX_FORMAT_LENGTH) {
    throw new MaskError(
      `format is ${format.length} characters; the maximum is ${MAX_FORMAT_LENGTH}`,
    );
  }
  if (guide !== undefined && guide.length !== format.length) {
    throw new MaskError(
      `guide is ${guide.length} characters but format is ${format.length}; they must align position for position`,
    );
  }

  const fillIndexes: number[] = [];
  let derivedGuide = '';
  for (let i = 0; i < format.length; i += 1) {
    const token = format[i]!;
    if (isFillToken(token)) {
      fillIndexes.push(i);
      derivedGuide += ' ';
    } else {
      derivedGuide += token;
    }
  }

  return {
    format,
    guide: guide ?? derivedGuide,
    fillIndexes,
    capacity: fillIndexes.length,
  };
}

/** True when `ch` may occupy raw position `rawIndex`.
 *
 *  `ch` must be exactly one UTF-16 code unit. Astral code points (a lone surrogate half
 *  cannot satisfy `\p{L}`) are outside this engine's model: one fill position holds one
 *  code unit, which is what keeps `format`, `guide`, the formatted text and the caret
 *  offsets a DOM input reports all in the same units. The target field family -- phone,
 *  SSN, ticket numbers, names, postal codes -- is BMP. */
export function acceptsAt(p: MaskPattern, rawIndex: number, ch: string): boolean {
  if (rawIndex < 0 || rawIndex >= p.capacity) return false;
  if (ch.length !== 1) return false;
  return matchesToken(p.format[p.fillIndexes[rawIndex]!]!, ch);
}

function fold(ch: string, caseMode: CaseMode): string {
  if (caseMode === 'upper') return ch.toUpperCase();
  if (caseMode === 'lower') return ch.toLowerCase();
  return ch;
}

/** Raw (fill-position-only) characters extracted from arbitrary input, with
 *  positional literal consumption and case folding. Spec §5.7, §2 "lenient".
 *
 *  LITERALS ARE MATCHED WHERE THEY SIT -- this is the fix for a real defect, and both halves
 *  of it are watched failing in the test file. A strip-then-fill normalizer (drop every
 *  non-alphanumeric, then fill positions in order) turns a pasted `V-123` under `V-***` into
 *  raw `V12`, rendered `V-V12`: the literal `V` is alphanumeric, survives the strip, is eaten
 *  by the first fill position, and the `3` falls off the end -- silently. Consuming only a
 *  leading literal RUN fixes that one case and leaves the same shape alive one level deeper:
 *  under `*-V-*`, `A-V-B` puts the interior literal `V` into the second fill position and
 *  drops the `B`. So the walk below advances over the FORMAT, not over a stripped string,
 *  and every literal -- leading, interior or trailing -- gets its chance to claim the input
 *  character sitting in front of it.
 *
 *  The two branches, and why lenience is safe here:
 *  - At a LITERAL, an input character equal to it (case-insensitively) is consumed as that
 *    literal. A character that is not equal means the input simply omitted the literal, so
 *    the format advances and the input does not -- which is what lets `chg4821`, `v123` and
 *    a bare `AB` all normalize correctly.
 *  - At a FILL, an input character of the right class is taken (folded per `caseMode`) and
 *    both advance. One of the wrong class is discarded and the position WAITS for the next
 *    one -- that is what absorbs separators, spaces and the browser's autofill formatting
 *    (`chg 4821`, `CHG-4821`, `chg4821` all give the same raw).
 *
 *  Every iteration either consumes an input character or advances the format, so it
 *  terminates. Input past the last fill position is clipped -- the caller compares lengths
 *  to report `over-capacity` (§5.3). */
export function normalizeToRaw(p: MaskPattern, input: string, caseMode: CaseMode = 'preserve'): string {
  let raw = '';
  let read = 0;
  let index = 0;

  while (index < p.format.length && read < input.length) {
    const token = p.format[index]!;
    if (!isFillToken(token)) {
      if (input[read]!.toLowerCase() === token.toLowerCase()) read += 1;
      index += 1;
      continue;
    }
    const folded = fold(input[read]!, caseMode);
    if (matchesToken(token, folded)) {
      raw += folded;
      index += 1;
    }
    read += 1;
  }
  return raw;
}

/** Raw formatted for DATA purposes -- the canonical value a `custom` mask submits (spec §4:
 *  "formatted, trailing placeholders trimmed"). Literals are re-inserted at their positions
 *  and the string is cut at the first UNFILLED position, because that placeholder and
 *  everything after it is not yet content.
 *
 *  A trailing literal run is NOT a placeholder, so a raw at capacity carries it: `##-END`
 *  with raw `12` is `12-END`, the same way the literals of `CHG-4821` are part of the ticket
 *  id rather than presentation. Cutting at `raw.length` instead would silently drop a fixed
 *  suffix from the submitted datum.
 *
 *  Empty raw is `''`, never the bare skeleton (`V-`) -- spec §4, "an empty field submits
 *  `''`, never the bare mask template". `formatForDisplay` is the other call site. */
export function formatRaw(p: MaskPattern, raw: string): string {
  if (raw.length === 0) return '';
  let out = '';
  let pending = ''; // a literal run whose content, if any, is still to come
  let cursor = 0;
  for (let i = 0; i < p.format.length; i += 1) {
    if (!isFillToken(p.format[i]!)) {
      pending += p.format[i]!;
    } else if (cursor < raw.length) {
      out += pending + raw[cursor]!;
      pending = '';
      cursor += 1;
    } else {
      return out; // an unfilled placeholder: trim it, and the literal run in front of it
    }
  }
  // The format ran out with every position filled, so a literal run still pending is the
  // format's trailing suffix and belongs to a COMPLETE value (`##-END` + `12` -> `12-END`).
  return out + pending;
}

/** Raw formatted for DISPLAY purposes: every unfilled position shows its guide character,
 *  so the text is always `format.length` long and stays aligned. Empty raw shows the guide
 *  in full (`mm/dd/yyyy`, `V-   `). */
export function formatForDisplay(p: MaskPattern, raw: string): string {
  let out = '';
  let cursor = 0;
  for (let i = 0; i < p.format.length; i += 1) {
    if (isFillToken(p.format[i]!) && cursor < raw.length) {
      out += raw[cursor]!;
      cursor += 1;
    } else {
      out += p.guide[i] ?? '';
    }
  }
  return out;
}

/** Raw read back out of formatted text BY POSITION, which is what makes an alphanumeric
 *  literal safe: the `V` of `V-123` sits at a literal index and is never read as content.
 *  Stops at the first unfilled position, so a display string's guide characters -- which do
 *  not satisfy their position's class -- are not mistaken for input. */
export function rawFromFormatted(p: MaskPattern, formatted: string): string {
  let raw = '';
  for (const index of p.fillIndexes) {
    const ch = formatted[index];
    if (ch === undefined || !matchesToken(p.format[index]!, ch)) break;
    raw += ch;
  }
  return raw;
}

/** Caret position in `formatted` -> caret position in raw: the number of FILLED fill
 *  positions strictly before `pos` (spec §3, "position mapping"). */
export function formattedToRawIndex(p: MaskPattern, formatted: string, pos: number): number {
  const clamped = Math.max(0, Math.min(pos, formatted.length));
  let rawPos = 0;
  for (const index of p.fillIndexes) {
    if (index >= clamped) break;
    const ch = formatted[index];
    if (ch === undefined || !matchesToken(p.format[index]!, ch)) break;
    rawPos += 1;
  }
  return rawPos;
}

/** Caret position in raw -> caret position in `formatted`.
 *
 *  Raw 0 maps to the FIRST fill index, so the caret never lands inside a leading literal
 *  prefix. Otherwise it lands just after the last consumed fill position and is then pulled
 *  forward over any literal run that follows, so it rests where the next character will go
 *  rather than in front of a separator -- finally clamped to the text that actually exists.
 *
 *  The pull-forward is why this is a left inverse of `formattedToRawIndex` on every caret
 *  position EXCEPT the one immediately before a literal run: that position and the one after
 *  it map to the same raw index by definition, and only one of the two can come back. The
 *  post-literal one is canonical (spec §2, "the caret never rests inside a literal run"). */
export function rawToFormattedIndex(p: MaskPattern, formatted: string, rawPos: number): number {
  if (p.capacity === 0) return Math.min(p.format.length, formatted.length);
  const clamped = Math.max(0, Math.min(rawPos, p.capacity));
  if (clamped === 0) return Math.min(p.fillIndexes[0]!, formatted.length);

  let index = p.fillIndexes[clamped - 1]! + 1;
  while (index < p.format.length && !isFillToken(p.format[index]!)) index += 1;
  return Math.min(index, formatted.length);
}
