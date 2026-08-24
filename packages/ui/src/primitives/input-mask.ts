// src/primitives/input-mask.ts
// Tier 2, the stateful half: one `HTMLInputElement` driven through the pure format engine
// in `field-mask.ts`. Framework-agnostic -- no Solid, no DOM beyond the one input and its
// document. Spec: docs/superpowers/specs/2026-08-24-form-field-formats-design.md
// (§2 tier 2, §3, and the §5 improvement list, which is binding here).
//
// THE FORMATTED TEXT IS `input.value` (spec §2). There is no overlay and no ghost layer,
// so the caret, selection, find-in-page and every mobile affordance are the browser's own.
// What this module adds on top is: interception, normalization, a caret that never rests
// inside a literal run, its own undo stack (a programmatic `.value` write destroys the
// native one), and a stated clipboard policy.
//
// Four rules hold this file together; each is one of the §5 improvements and each is the
// reason some obvious-looking shortcut is not taken:
//   1. `commit` is the ONLY writer of `el.value`, the selection, the undo stacks and the
//      callbacks (§5.5). The reference this was derived from repeated that sequence in five
//      places and they had already drifted apart.
//   2. `beforeinput` is the interception point WHERE IT IS CANCELABLE; where it is not, the
//      longest-common-prefix/suffix diff in `input` reconciles whatever the browser did
//      (§5.1). Both paths end in `applyEdit` -> `commit`, so there is one edit semantics.
//   3. Between `compositionstart` and `compositionend` this module does NOTHING: no cancel,
//      no `.value` write, no caret move, no clamp (§5.2). Cancelling mid-composition breaks
//      the composition outright, and Android word suggestion is far more common in these
//      fields than CJK input.
//   4. `.value` is never shadowed with `Object.defineProperty` (§5.8). The canonical value
//      is read through `getCanonicalValue()`; the element facade will publish it with
//      `setFormValue()`.
//
// ONE KNOWN IMPRECISION, recorded rather than papered over. An undo entry's selection is
// read from the element at commit time. On the `beforeinput` path that is exactly right --
// the event was canceled, so the caret has not moved yet. On the `input` diff fallback the
// browser has ALREADY moved it, so the entry stores the post-edit caret against the
// pre-edit text: undoing a browser-driven edit restores the correct text with a caret that
// is merely plausible. Recovering the true one means caching the selection from
// `selectionchange` and trusting that it fires before `input`, which is browser-timing
// dependent and unverifiable in jsdom -- a guess dressed as a fix. The caret is clamped, so
// it is never out of range. Task 6 can measure the real ordering and decide.
import {
  compileMask,
  formatForDisplay,
  formatRaw,
  formattedToRawIndex,
  normalizeToRaw,
  rawFromFormatted,
  rawToFormattedIndex,
  type CaseMode,
  type MaskPattern,
  type RejectReason,
} from './field-mask';
import { canonicalize, type FieldSemanticType } from './field-semantics';

/** What a copy or cut puts on the clipboard. A stated policy the consumer selects, NOT a
 *  consequence of `obscure` (spec §5.10): copying bullets is not a security control -- the
 *  value is in the page -- and whether a card number may be copied at all is an app-layer
 *  decision (CLAUDE.md: the kit decides HOW, the app decides WHETHER). */
export type CopyPolicy = 'formatted' | 'canonical' | 'obscured' | 'blocked';

/** Why an edit or a re-configuration refused, or partly refused, the content it was given.
 *
 *  A superset of `field-mask.ts`'s `RejectReason`, widened HERE rather than there because
 *  the extra member is not an engine verdict: the engine's three describe one edit failing
 *  against one pattern, while `format-change-clipped` describes the PATTERN moving out from
 *  under a value that was already accepted. Widening keeps every consumer that narrows on
 *  the engine's three compiling unchanged. */
export type InputMaskRejectReason = RejectReason | 'format-change-clipped';

export interface InputMaskOptions {
  format: string;
  guide?: string;
  semantic?: FieldSemanticType;
  caseMode?: CaseMode;
  copyPolicy?: CopyPolicy;
  /** Tier 3. Wired -- it selects the default copy policy -- but does NOT yet transform the
   *  display; that lands with the obscured rendering in tier 3 (task 10). */
  obscure?: boolean;
  initialValue?: string;
  onInput?: (detail: { canonical: string; formatted: string }) => void;
  onReject?: (detail: { reason: InputMaskRejectReason; data: string }) => void;
}

export interface InputMask {
  /** Accepts the canonical form or the formatted form; both normalize to the same value. */
  setValue(value: string): void;
  getRawValue(): string;
  getCanonicalValue(): string;
  getFormattedValue(): string;
  setObscure(on: boolean): void;
  /** Re-compiles and preserves the value, re-fitted to the new pattern. */
  update(next: Partial<InputMaskOptions>): void;
  detach(): void;
}

/** Undo history is capped (spec §5.6). A long-lived field otherwise grows an unbounded
 *  array; dropping from the bottom keeps the recent history, which is the useful end. */
const UNDO_LIMIT = 200;

/** The obscured glyph, U+2022. Tier 3's display uses the same one. */
const BULLET = '•';

/** One undo entry: the state to restore, INCLUDING the selection the user had when the
 *  edit that superseded it began (spec §5.6). Restoring text without the caret is what
 *  makes a custom undo stack feel broken.
 *
 *  `pattern` is a fourth field beyond the three the spec names, and it is what lets the
 *  history SURVIVE an `update()`. A formatted string can only be decoded by the pattern
 *  that produced it -- `V-123` under `V-***` is raw `123`, and under `#####` it is raw `123`
 *  read from different positions -- so an entry restored under a pattern that did not write
 *  it is garbage. Carrying the pattern lets `restore` decode with the right one and then
 *  re-fit; without it the only safe thing to do on a format change is throw the whole stack
 *  away, which is itself a silent drop of the user's history. */
interface UndoEntry {
  readonly formatted: string;
  readonly pattern: MaskPattern;
  readonly selStart: number;
  readonly selEnd: number;
}

/** How a commit affects the undo history.
 *  - `run`   an insertion that may coalesce into the run already open.
 *  - `break` an edit that ends the run and always gets its own entry.
 *  - `none`  a restore or a re-render: no history, and the redo stack survives. */
type UndoMode = 'break' | 'run' | 'none';

/** `inputType`s that insert. `insertText` is the one that coalesces into a typing run;
 *  the rest are bulk edits and each gets its own undo entry. */
const INSERT_TYPES = new Set([
  'insertText',
  'insertFromPaste',
  'insertFromPasteAsQuotation',
  'insertFromDrop',
  'insertReplacementText',
  'insertFromYank',
  'insertTranspose',
]);

/** `inputType`s that delete. `deleteByCut` is DELIBERATELY absent: the `cut` listener
 *  cancels the cut and performs the deletion itself, so this event never arrives for a
 *  cut -- and if it did, the range would already be gone and a second delete would eat a
 *  character the user never selected. */
const DELETE_TYPES = new Set([
  'deleteContent',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
  'deleteHardLineBackward',
  'deleteHardLineForward',
  'deleteByDrag',
]);

/** Caret-moving keys break an open typing run (spec §5.6). Pointer-driven moves break it
 *  through the `mousedown` listener. */
const NAV_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export function createInputMask(el: HTMLInputElement, options: InputMaskOptions): InputMask {
  let opts: InputMaskOptions = { ...options };
  let pattern: MaskPattern = compileMask(opts.format, opts.guide);
  let hasGuide = opts.guide !== undefined;
  let caseMode: CaseMode = opts.caseMode ?? 'preserve';
  let semantic: FieldSemanticType = opts.semantic ?? 'custom';
  let obscure = opts.obscure ?? false;

  /** The formatted text, authoritative and equal to `el.value` outside a composition. */
  let formatted = '';
  /** The pattern that produced `formatted`. Diverges from `pattern` for exactly the span of
   *  an `update()`, which is why an undo entry pushed during one must be stamped with THIS
   *  and not with the pattern that has already been swapped in. */
  let formattedPattern: MaskPattern = pattern;
  /** The fill-position characters, authoritative. Kept beside `formatted` rather than
   *  re-read from it on every access: a consumer guide whose characters happen to satisfy
   *  their own position's class (`@@@` guided `abc`) would otherwise read back as content. */
  let raw = '';

  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];
  let runOpen = false;

  let composing = false;
  /** Set while THIS module writes the selection, so the `selectionchange` clamp does not
   *  react to its own work. Not a timer and not a race: it is set and cleared around one
   *  synchronous call. */
  let settingSelection = false;
  let detached = false;
  /** A consumer write (`setValue` / `update`) that arrived mid-composition, held until
   *  `compositionend`. Only the latest survives: an earlier one has already been superseded
   *  by its own author, and replaying both would flash an intermediate value. */
  let pendingWrite: (() => void) | null = null;

  /** With a guide the field is always `format.length` long and unfilled positions show the
   *  guide; without one it shows only up to the last typed character (spec §2). */
  const display = (value: string): string =>
    hasGuide ? formatForDisplay(pattern, value) : formatRaw(pattern, value);

  /** A caret offset in `formatted` -> a raw index, clamped to what is actually typed. */
  const toRaw = (pos: number): number =>
    Math.min(formattedToRawIndex(pattern, formatted, pos), raw.length);

  function selectionRaw(): [number, number] {
    const start = el.selectionStart ?? formatted.length;
    const end = el.selectionEnd ?? formatted.length;
    return [toRaw(start), toRaw(Math.max(start, end))];
  }

  function setSelection(start: number, end: number): void {
    settingSelection = true;
    try {
      el.setSelectionRange(start, end);
    } catch {
      // `setSelectionRange` throws on input types that do not support selection
      // (`number`, `email`, ...). The value write already landed; a caret is presentation,
      // not data, so there is nothing here to report.
    } finally {
      settingSelection = false;
    }
  }

  function reject(reason: InputMaskRejectReason, data: string): void {
    // Loud, always (spec §5.3). The silent `preventDefault` this replaces is the exact
    // shape CLAUDE.md calls the default-wrong choice: a decision made while withholding
    // the information that it happened.
    opts.onReject?.({ reason, data });
  }

  // ---------------------------------------------------------------------------------
  // The single commit path (§5.5). Nothing else in this file assigns `el.value`, touches
  // the selection, touches the undo stacks or calls a consumer callback.
  // ---------------------------------------------------------------------------------

  /** `raw` travels in the options bag rather than being re-derived from `nextFormatted`
   *  for the reason given at the `raw` declaration: `rawFromFormatted` over a display
   *  string trusts the guide. Every caller already has the raw it just computed. */
  function commit(
    nextFormatted: string,
    caret: number,
    write: { undo: UndoMode; raw: string; notify?: boolean; selectionEnd?: number },
  ): void {
    if (write.undo !== 'none') {
      if (write.undo === 'break' || !runOpen) {
        undoStack.push({
          formatted,
          pattern: formattedPattern,
          selStart: el.selectionStart ?? formatted.length,
          selEnd: el.selectionEnd ?? formatted.length,
        });
        if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      }
      runOpen = write.undo === 'run';
      redoStack.length = 0;
    }

    formatted = nextFormatted;
    formattedPattern = pattern;
    raw = write.raw;
    el.value = nextFormatted; // native setter; no descriptor shadowing (§5.8)

    const start = Math.max(0, Math.min(caret, nextFormatted.length));
    const end = Math.max(start, Math.min(write.selectionEnd ?? caret, nextFormatted.length));
    setSelection(start, end);

    if (write.notify !== false) opts.onInput?.({ canonical: getCanonicalValue(), formatted });
  }

  /** The raw-space adapter every edit goes through: it is what guarantees the formatted
   *  text and the caret are always derived from the same raw. */
  function commitRaw(nextRaw: string, rawCaret: number, write: { undo: UndoMode; notify?: boolean }): void {
    const next = display(nextRaw);
    commit(next, rawToFormattedIndex(pattern, next, rawCaret), { ...write, raw: nextRaw });
  }

  // ---------------------------------------------------------------------------------
  // Edit application
  // ---------------------------------------------------------------------------------

  /** A copy of the pattern with extra permissive fill positions, used ONLY to answer "was
   *  anything actually lost to capacity?".
   *
   *  Without it, `absorbed.length < inserted.length` cannot tell an overflow from an
   *  absorbed separator: `chg 4821` is eight characters landing in seven fill positions
   *  with nothing lost, and reporting `over-capacity` for it would be a false alarm on the
   *  single most common paste in the target field family. Re-normalizing against a wider
   *  pattern answers it exactly. Returns `null` when the format is already at the engine's
   *  length cap, in which case the check is skipped rather than guessed. */
  function widerPattern(extra: number): MaskPattern | null {
    try {
      return compileMask(pattern.format + '@'.repeat(extra));
    } catch {
      return null;
    }
  }

  /** Replace raw `[rawStart, rawEnd)` with whatever of `inserted` the mask accepts.
   *
   *  The whole edit is expressed as ONE normalization over `prefix + inserted + tail`,
   *  which is what keeps typing, pasting, autofill and the diff fallback on identical
   *  semantics. `formatRaw` re-inserts the literals in front of the insertion point so
   *  `normalizeToRaw` -- which walks the FORMAT, and is the literal-aware normalizer that
   *  fixes spec §5.7 -- sees a string aligned to the pattern from index 0. That is why
   *  pasting `V-123` under `V-***` yields `V-123` and not `V-V12`.
   *
   *  Returns whether it committed. */
  function applyEdit(rawStart: number, rawEnd: number, inserted: string, kind: 'insert' | 'bulk'): boolean {
    const room = pattern.capacity - (raw.length - (rawEnd - rawStart));
    if (inserted.length > 0 && room <= 0) {
      reject('full', inserted);
      return false;
    }

    const prefix = raw.slice(0, rawStart);
    const prefixText = formatRaw(pattern, prefix);
    const withInsert = normalizeToRaw(pattern, prefixText + inserted, caseMode);
    const absorbed = withInsert.slice(prefix.length);
    const tail = raw.slice(rawEnd);
    const nextRaw = normalizeToRaw(pattern, formatRaw(pattern, withInsert) + tail, caseMode);

    if (inserted.length > 0 && absorbed.length === 0) {
      reject('wrong-class', inserted);
      return false;
    }
    if (nextRaw === raw) return false; // a delete with nothing to delete: no edit, no noise

    commitRaw(nextRaw, prefix.length + absorbed.length, {
      undo: kind === 'insert' ? 'run' : 'break',
      notify: true,
    });

    // Reported AFTER the commit, and deliberately alongside it rather than instead of it.
    // `full` and `wrong-class` refuse the whole edit and leave the text unchanged, which is
    // the §5.3 contract. `over-capacity` is the clip that `field-mask.ts` documents the
    // CALLER as responsible for reporting ("input past the last fill position is clipped --
    // the caller compares lengths"): refusing an entire paste for being one character long
    // is worse than accepting what fits and saying so. `data` is the input that was
    // refused or partly refused, not a computed remainder.
    const lostTail = nextRaw.length < withInsert.length + tail.length;
    const lostInsert =
      withInsert.length === pattern.capacity &&
      absorbed.length < inserted.length &&
      overflowed(prefixText, inserted, withInsert.length);
    if (lostTail || lostInsert) reject('over-capacity', inserted);
    return true;
  }

  function overflowed(prefixText: string, inserted: string, absorbedTotal: number): boolean {
    const wider = widerPattern(inserted.length);
    if (wider === null) return false;
    return normalizeToRaw(wider, prefixText + inserted, caseMode).length > absorbedTotal;
  }

  /** The §5.1 fallback: the browser already mutated the field, so work out what it did.
   *  Longest common prefix/suffix, caret-independent, and robust against alphanumeric
   *  literals -- the one idea carried over from the reference unchanged. */
  function reconcile(): void {
    const current = el.value;
    const max = Math.min(current.length, formatted.length);
    let pre = 0;
    while (pre < max && current[pre] === formatted[pre]) pre += 1;
    let suf = 0;
    while (
      suf < max - pre &&
      current[current.length - 1 - suf] === formatted[formatted.length - 1 - suf]
    ) {
      suf += 1;
    }

    const insertedText = current.slice(pre, current.length - suf);
    const start = toRaw(pre);
    const end = Math.max(start, toRaw(formatted.length - suf));
    applyEdit(start, end, insertedText, 'bulk');

    if (el.value !== formatted) {
      // The edit was refused (or was a no-op). The browser's text is still on screen, so
      // put the authoritative text back -- a refusal must leave the field unchanged, and
      // "unchanged" here means undoing the browser, not leaving its version in place.
      commit(formatted, rawToFormattedIndex(pattern, formatted, raw.length), {
        undo: 'none',
        raw,
        notify: false,
      });
    }
  }

  // ---------------------------------------------------------------------------------
  // Undo / redo (§5.6)
  // ---------------------------------------------------------------------------------

  function snapshot(): UndoEntry {
    return {
      formatted,
      pattern: formattedPattern,
      selStart: el.selectionStart ?? formatted.length,
      selEnd: el.selectionEnd ?? formatted.length,
    };
  }

  function restore(entry: UndoEntry): void {
    runOpen = false;
    if (entry.pattern === pattern) {
      commit(entry.formatted, entry.selStart, {
        undo: 'none',
        selectionEnd: entry.selEnd,
        raw: rawFromFormatted(pattern, entry.formatted),
        notify: true,
      });
      return;
    }
    // Recorded under an older pattern (an `update()` happened since). Decode with the
    // pattern that wrote it, then re-fit through the current one. The FORMATTED text is
    // what gets re-normalized, never the bare raw: `normalizeToRaw` is not idempotent on
    // raw when a fill character happens to equal a leading literal -- `V-***` holding
    // `V12` would re-normalize to `12` and lose a character on every undo. With the
    // literals present (`V-V12`) the positional walk consumes the leading `V` as the
    // literal it is.
    //
    // Note what this canNOT do: if the new pattern is narrower, the re-fit clips again, so
    // undo does not resurrect what `update()` already reported as clipped. Undo reverses an
    // EDIT; a format change is not one. That is why the loud report below is the half that
    // actually protects the value.
    const decoded = rawFromFormatted(entry.pattern, entry.formatted);
    const refit = normalizeToRaw(pattern, formatRaw(entry.pattern, decoded), caseMode);
    commitRaw(refit, refit.length, { undo: 'none', notify: true });
  }

  function undo(): void {
    const entry = undoStack.pop();
    if (entry === undefined) return;
    redoStack.push(snapshot());
    restore(entry);
  }

  function redo(): void {
    const entry = redoStack.pop();
    if (entry === undefined) return;
    undoStack.push(snapshot());
    restore(entry);
  }

  // ---------------------------------------------------------------------------------
  // Clipboard (§5.10)
  // ---------------------------------------------------------------------------------

  /** Bullets at the FILLED `*` positions only. `#` and `@` positions, literals and guide
   *  characters stay revealed -- which is what makes `**** **** **** ####` mean "show the
   *  last four" with no `showLast` prop (spec §2 tier 3). */
  function obscured(text: string): string {
    const chars = text.split('');
    for (let i = 0; i < pattern.fillIndexes.length && i < raw.length; i += 1) {
      const index = pattern.fillIndexes[i]!;
      if (pattern.format[index] === '*' && index < chars.length) chars[index] = BULLET;
    }
    return chars.join('');
  }

  function clipboardText(): string {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    switch (copyPolicy()) {
      case 'blocked':
        return '';
      case 'formatted':
        return formatted.slice(start, end);
      case 'obscured':
        return obscured(formatted).slice(start, end);
      case 'canonical':
      default: {
        const [rawStart, rawEnd] = selectionRaw();
        // A whole-field selection copies the canonical value -- the thing a consumer means
        // by "copy this phone number". A partial selection has no canonical form of its
        // own (its literals depend on where it sat), so it copies the characters it covers.
        if (rawStart === 0 && rawEnd === raw.length) {
          return canonicalize(pattern, formatRaw(pattern, raw), semantic);
        }
        return raw.slice(rawStart, rawEnd);
      }
    }
  }

  /** Explicit option wins; otherwise `obscure` picks the default (spec §5.10). */
  function copyPolicy(): CopyPolicy {
    return opts.copyPolicy ?? (obscure ? 'obscured' : 'canonical');
  }

  // ---------------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------------

  function onBeforeInput(event: Event): void {
    if (detached || composing) return;
    const e = event as InputEvent;
    // Not cancelable -- composition on Android, several IMEs. Do nothing here and let the
    // diff in `input` absorb whatever the browser does (§5.1).
    if (!e.cancelable) return;
    const inputType = e.inputType;

    if (INSERT_TYPES.has(inputType)) {
      e.preventDefault();
      const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
      const [start, end] = selectionRaw();
      applyEdit(start, end, data, inputType === 'insertText' ? 'insert' : 'bulk');
      return;
    }

    if (DELETE_TYPES.has(inputType)) {
      e.preventDefault();
      let [start, end] = selectionRaw();
      if (start === end) {
        // A DOM selection that maps to an EMPTY raw range is a selection over literals
        // only. It is not a collapsed caret, and running the directional branch on it
        // destroys a character the user did not select: selecting exactly the `-` of
        // `555-123-4567` and pressing Backspace would eat the `5` in front of it.
        // A literal is not content, so there is nothing to delete and nothing to report --
        // no decision is being withheld, the field visibly does not change.
        if ((el.selectionStart ?? 0) !== (el.selectionEnd ?? 0)) return;
        const backward = inputType.endsWith('Backward');
        // A masked field has no words and no lines, so the word/line deletes take the whole
        // side of the caret. Stated, not silent: the alternative is pretending `4821` is a
        // word, which is a guess about a format the consumer chose.
        const wide = /^delete(Word|SoftLine|HardLine)/.test(inputType);
        if (wide) {
          if (backward) start = 0;
          else end = raw.length;
        } else if (backward) {
          if (start === 0) return;
          start -= 1;
        } else {
          if (end >= raw.length) return;
          end += 1;
        }
      }
      applyEdit(start, end, '', 'bulk');
      return;
    }

    if (inputType === 'historyUndo') {
      e.preventDefault();
      undo();
      return;
    }
    if (inputType === 'historyRedo') {
      e.preventDefault();
      redo();
    }
    // Anything else is the browser's: it happens, and `input` reconciles it.
  }

  function onInputEvent(): void {
    if (detached || composing) return;
    if (el.value === formatted) return; // our own commit, or a genuine no-op
    reconcile();
  }

  function onCompositionStart(): void {
    if (detached) return;
    composing = true;
  }

  function onCompositionEnd(): void {
    if (detached) return;
    composing = false;
    // A consumer write that arrived mid-composition wins over the composed text: it is the
    // later statement of intent, and it is the value the consumer's own model now holds.
    const pending = pendingWrite;
    pendingWrite = null;
    if (pending !== null) {
      pending();
      return;
    }
    // Otherwise exactly one reconciliation, here (§5.2). Every `input` that arrived during
    // the composition was ignored on purpose.
    if (el.value !== formatted) reconcile();
  }

  /** Run a consumer write now, or hold it until the composition ends (§5.2 applied to the
   *  masker's own writes: a framework re-render calling `setValue` mid-composition is the
   *  classic controlled-input IME bug, and rewriting `.value` there kills the composition). */
  function writeOrDefer(apply: () => void): void {
    if (composing) {
      pendingWrite = apply;
      return;
    }
    apply();
  }

  function onKeyDown(event: Event): void {
    if (detached || composing) return;
    const e = event as KeyboardEvent;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (NAV_KEYS.has(e.key)) runOpen = false;
  }

  function onMouseDown(): void {
    runOpen = false;
  }

  function onBlur(): void {
    runOpen = false;
  }

  /** One handler, idempotent, no timers (§5.9). The reference's `mousedown`+rAF /
   *  `mouseup`+`setTimeout` pair raced itself and missed keyboard-driven selection. */
  function onSelectionChange(): void {
    if (detached || composing || settingSelection) return;
    if (el.ownerDocument.activeElement !== el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === null || end === null) return;

    const first = rawToFormattedIndex(pattern, formatted, 0);
    const last = rawToFormattedIndex(pattern, formatted, raw.length);

    let nextStart = start;
    let nextEnd = end;
    if (start === end) {
      nextStart = nextEnd = Math.max(first, Math.min(start, last));
    } else {
      // A range may begin anywhere -- Ctrl-A starts at 0 and must keep meaning "all of it"
      // -- but it may not extend past the last typed character.
      nextEnd = Math.min(end, last);
      nextStart = Math.min(start, nextEnd);
    }
    if (nextStart === start && nextEnd === end) return; // already valid: do nothing at all
    setSelection(nextStart, nextEnd);
  }

  function onCopy(event: Event): void {
    if (detached) return;
    const e = event as ClipboardEvent;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', clipboardText());
  }

  function onCut(event: Event): void {
    if (detached) return;
    const e = event as ClipboardEvent;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', clipboardText());
    const [start, end] = selectionRaw();
    if (start === end) return;
    runOpen = false;
    applyEdit(start, end, '', 'bulk');
  }

  function getCanonicalValue(): string {
    // `formatRaw`, not the display string: a guide character must never be read as content.
    return canonicalize(pattern, formatRaw(pattern, raw), semantic);
  }

  const elementListeners: Array<[string, EventListener]> = [
    ['beforeinput', onBeforeInput],
    ['input', onInputEvent],
    ['compositionstart', onCompositionStart],
    // `compositionupdate` is deliberately NOT bound, though §5.2 names it: `composing` is
    // already true for the whole window, so a handler would have nothing to do. Binding one
    // to "keep the set complete" would be an empty listener implying a hook that is not there.
    ['compositionend', onCompositionEnd],
    ['keydown', onKeyDown],
    ['mousedown', onMouseDown],
    ['blur', onBlur],
    ['copy', onCopy],
    ['cut', onCut],
  ];
  const doc = el.ownerDocument;

  for (const [kind, handler] of elementListeners) el.addEventListener(kind, handler);
  // `selectionchange` fires on the DOCUMENT for `<input>` in every browser this kit
  // targets; the element-targeted version is newer and not yet universal.
  doc.addEventListener('selectionchange', onSelectionChange);

  {
    const seed = normalizeToRaw(pattern, opts.initialValue ?? el.value, caseMode);
    // No undo entry and no callback: attaching is not an edit the consumer made.
    commitRaw(seed, seed.length, { undo: 'none', notify: false });
  }

  return {
    setValue(value: string): void {
      writeOrDefer(() => {
        const next = normalizeToRaw(pattern, value, caseMode);
        // A bulk replacement, so it breaks the run and gets its own undo entry -- but it
        // does NOT notify: a controlled widget that wrote this value would echo itself
        // forever. (`update()` below is the opposite case, and for a stated reason.)
        commitRaw(next, next.length, { undo: 'break', notify: false });
      });
    },

    getRawValue: () => raw,
    getCanonicalValue,
    getFormattedValue: () => formatted,

    setObscure(on: boolean): void {
      obscure = on;
      // Tier 3 (task 10) makes this change the rendered text. Today it selects the default
      // copy policy and nothing else, which is stated on the option rather than implied.
    },

    update(next: Partial<InputMaskOptions>): void {
      // Configuration lands immediately -- a new `onInput` must not be shadowed by the old
      // one for the length of a composition. Only the VALUE WRITE is deferrable.
      const previousText = formatRaw(pattern, raw);
      const previousRaw = raw;
      const previousFormatted = formatted;

      // COMPILE FIRST, ASSIGN AFTER. `compileMask` throws on a format over the length cap
      // or a guide that does not align, and the throw must leave this masker exactly as it
      // was. Merging into `opts` first would park the rejected config in state where the
      // NEXT update -- one that says nothing about `format` -- picks it up and applies a
      // change that was already refused. The element facade hits precisely this shape when
      // `format` and `guide` are separate reactive attributes that do not land in the same
      // tick.
      const merged: InputMaskOptions = { ...opts, ...next };
      const nextPattern = compileMask(merged.format, merged.guide);

      opts = merged;
      pattern = nextPattern;
      hasGuide = merged.guide !== undefined;
      caseMode = merged.caseMode ?? 'preserve';
      semantic = merged.semantic ?? 'custom';
      obscure = merged.obscure ?? false;
      runOpen = false;
      // The undo history is NOT cleared: entries carry the pattern that wrote them and
      // `restore` re-fits across a change. Redo is, because it holds futures that the new
      // pattern may not be able to reach.
      redoStack.length = 0;

      writeOrDefer(() => {
        const nextRaw = normalizeToRaw(pattern, previousText, caseMode);
        const nextFormatted = display(nextRaw);
        const changed = nextFormatted !== previousFormatted;
        // A format change that cannot hold what the field already held DESTROYS user
        // content, and the consumer's own model still has the old value -- so silence here
        // is worse than an ordinary silent drop: nothing would ever converge. The element
        // facade re-calls `update()` on any `format` prop change, so this fires on a
        // routine reactive render. Report the loss, and notify so a controlled consumer
        // catches up. `data` carries the pre-change text, which after this call is the only
        // copy of the discarded characters anywhere.
        if (nextRaw.length < previousRaw.length) reject('format-change-clipped', previousText);
        // `undo: 'none'`, always. An entry pushed here would be DEAD BY CONSTRUCTION: it
        // would hold `previousFormatted` under the old pattern, and `restore` re-fits a
        // stale entry with exactly the computation two lines up
        // (`normalizeToRaw(pattern, previousText)`), so restoring it lands on the text
        // already on screen -- the first Ctrl+Z after a format change would do nothing
        // visible. The history the user cares about is the entries UNDERNEATH, which
        // survive because each carries the pattern that wrote it.
        commitRaw(nextRaw, nextRaw.length, { undo: 'none', notify: changed });
      });
    },

    detach(): void {
      if (detached) return;
      detached = true;
      pendingWrite = null; // a deferred write must not fire into a field we no longer own
      for (const [kind, handler] of elementListeners) el.removeEventListener(kind, handler);
      doc.removeEventListener('selectionchange', onSelectionChange);
    },
  };
}
