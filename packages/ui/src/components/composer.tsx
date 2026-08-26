import {
  type JSX,
  createSignal,
  createEffect,
  createMemo,
  createUniqueId,
  on,
  onMount,
  onCleanup,
  Show,
  For,
} from 'solid-js';
import { cn } from '../utils/cn';
import { useChatConfig, textClass } from '../primitives/chat-config';
import {
  type ComposerDoc,
  type EntityRef,
  normalizeValue,
  serializeToText,
  entitiesOf,
  docIsEmpty,
} from '../primitives/composer-model';
import {
  parseDom,
  renderDoc,
  ZWSP,
  createEntityEl,
  createTextWalker,
  entityStore,
  isEntityEl,
  kindGlyph,
} from './composer-dom';
import { activeTriggerFor } from '../primitives/composer-triggers';
import { usePosition, useDismiss, createPresence } from '../ui/overlay';
import { findHighlightMatches, applyHighlights } from './composer-highlight';
import { createHistory } from './composer-history';

export interface TriggerItem {
  id: string;
  label: string;
  icon?: string;
  /** Secondary muted text shown beside the label in the menu (Codex-style). */
  description?: string;
  /** Section header to group this item under in the menu (e.g. 'Plugins', 'Agents'). */
  group?: string;
  /** Entity kind for the inserted pill; overrides the trigger's default `kind` so
   *  one trigger can mix kinds across sections (e.g. agents + plugins under `@`). */
  kind?: string;
  promptText?: string;
  data?: Record<string, unknown>;
}
export interface TriggerDef {
  char: string;
  kind: string;
  items?: TriggerItem[];
}
export type HighlightRule =
  | string
  | { pattern: string; flags?: string; class?: string };
export interface ComposerChange {
  doc: ComposerDoc;
  text: string;
  entities: EntityRef[];
}
/** Imperative handle exposed via `controllerRef` — surfaces the composer's latent
 *  capabilities (focus/blur the editable, clear the doc, submit, insert a pill) so
 *  the `<kai-composer>` facade can forward them as instance methods. */
export interface ComposerController {
  focus(options?: FocusOptions): void;
  blur(): void;
  clear(): void;
  send(): void;
  insertEntity(entity: EntityRef): void;
}
export interface ComposerProps {
  value?: string | ComposerDoc;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  maxHeight?: number | string;
  submitOnEnter?: boolean;
  triggers?: TriggerDef[];
  highlights?: HighlightRule[];
  /** Default icon per entity kind (kind → image URL/data-URI), shown on a pill +
   *  menu item when the item has no `icon` of its own. Overrides the built-in
   *  glyphs (agent/plugin). Example: `{ agent: '/icons/bot.svg' }`. */
  kindIcons?: Record<string, string>;
  /** Render WITHOUT the rounded frame/background/padding — just the editable +
   *  placeholder + menu. For embedding inside another frame (e.g. PromptInput). */
  bare?: boolean;
  /** Override the editable element's classes (used in `bare` mode to match an
   *  existing input's exact look). The placeholder mirrors these for alignment. */
  editableClass?: string;
  /** Accessible name for the editable (role=textbox). Falls back to the
   *  placeholder, then "Message input". */
  ariaLabel?: string;
  /** Receive the editable element (e.g. to register it for click-to-focus). */
  editableRef?: (el: HTMLDivElement) => void;
  /** Receive the imperative controller once mounted. The `<kai-composer>` facade
   *  forwards these as element methods (focus/blur/clear/send/insertEntity). */
  controllerRef?: (controller: ComposerController) => void;
  onChange?: (change: ComposerChange) => void;
  onSubmit?: (change: ComposerChange) => void;
  onTrigger?: (info: { char: string; query: string; rect: DOMRect }) => void;
  onTriggerClose?: () => void;
  onEntityAdd?: (entity: EntityRef) => void;
  onEntityRemove?: (entity: EntityRef) => void;
  /** The editable gained focus. `focus`/`blur` are NOT composed, so they don't
   *  escape the shadow root — this re-exposes them. (keydown/paste/focusin/focusout
   *  are composed and already reach the host as native events; no wrapper needed.) */
  onFocus?: (e: FocusEvent) => void;
  /** The editable lost focus. */
  onBlur?: (e: FocusEvent) => void;
}

/**
 * Shadow-DOM-aware selection. `document.getSelection()` does NOT expose a
 * selection that lives inside an open ShadowRoot in Chromium — it retargets the
 * range to the host — so caret math and node insertion would silently operate
 * OUTSIDE the editable (pills land in the light DOM, the menu never closes).
 * `ShadowRoot.getSelection()` (Chrome) returns the real in-shadow selection. Fall
 * back to the document selection for the light DOM / jsdom (no shadow root).
 */
function getActiveSelection(node: Node): Selection | null {
  const root = node.getRootNode();
  if (
    typeof ShadowRoot !== 'undefined' &&
    root instanceof ShadowRoot &&
    typeof (root as unknown as { getSelection?: () => Selection | null }).getSelection === 'function'
  ) {
    return (root as unknown as { getSelection: () => Selection | null }).getSelection();
  }
  return node.ownerDocument?.getSelection() ?? null;
}

/** Compute the full ZWSP-stripped text of all text nodes in the editable. */
function getFullText(root: HTMLElement): string {
  let text = '';
  const walker = createTextWalker(root);
  let node = walker.nextNode() as Text | null;
  while (node) {
    text += (node.textContent ?? '').split(ZWSP).join('');
    node = walker.nextNode() as Text | null;
  }
  return text;
}

/**
 * Compute the global text offset for the current caret position.
 * Walks SHOW_TEXT nodes, strips ZWSP, sums lengths before the caret node.
 */
function getCaretTextOffset(root: HTMLElement): number {
  const sel = getActiveSelection(root);
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return 0;

  const { startContainer, startOffset } = range;
  let offset = 0;
  const walker = createTextWalker(root);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (node === startContainer) {
      // Strip ZWSP chars that come before startOffset
      const raw = (node.textContent ?? '').slice(0, startOffset);
      offset += raw.split(ZWSP).join('').length;
      return offset;
    }
    offset += (node.textContent ?? '').split(ZWSP).join('').length;
    node = walker.nextNode() as Text | null;
  }
  return offset;
}

/**
 * Get the client rect of the caret. Uses a collapsed range if possible.
 * If the rect is zero-sized, inserts a temporary measuring span briefly.
 */
function getCaretRect(root: HTMLElement): DOMRect | null {
  const ownerDoc = root.ownerDocument;
  const sel = getActiveSelection(root);
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);

  const rects = range.getClientRects();
  if (rects.length > 0 && (rects[0].width > 0 || rects[0].height > 0)) {
    return rects[0];
  }

  // Fallback: insert a measuring span, read its rect, remove it.
  const marker = ownerDoc.createElement('span');
  marker.textContent = '​';
  marker.style.position = 'absolute';
  marker.style.visibility = 'hidden';
  range.insertNode(marker);
  const rect = marker.getBoundingClientRect();
  marker.remove();
  return rect.width > 0 || rect.height > 0 ? rect : null;
}

/**
 * Place the caret at a stripped-text offset (inverse of getCaretTextOffset).
 * Walks pill-skipping text nodes; pills are 0-width in this coordinate space, so
 * an offset lands in the surrounding text. Best-effort: falls back to end-of-content.
 */
function setCaretToOffset(root: HTMLElement, offset: number): void {
  const sel = getActiveSelection(root);
  if (!sel) return;
  const range = root.ownerDocument.createRange();
  const walker = createTextWalker(root);
  let remaining = offset;
  let node = walker.nextNode() as Text | null;
  let placed = false;
  while (node) {
    const raw = node.textContent ?? '';
    const strippedLen = raw.split(ZWSP).join('').length;
    if (remaining <= strippedLen) {
      // Convert the stripped offset to a raw offset within this node.
      let rawOffset = 0;
      let seen = 0;
      while (rawOffset < raw.length && seen < remaining) {
        if (raw[rawOffset] !== ZWSP) seen++;
        rawOffset++;
      }
      // Skip past any ZWSP filler so the caret sits after the pill marker.
      while (rawOffset < raw.length && raw[rawOffset] === ZWSP) rawOffset++;
      range.setStart(node, rawOffset);
      placed = true;
      break;
    }
    remaining -= strippedLen;
    node = walker.nextNode() as Text | null;
  }
  if (!placed) {
    range.selectNodeContents(root);
    range.collapse(false);
  } else {
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function Composer(props: ComposerProps): JSX.Element {
  const config = useChatConfig();
  let editable!: HTMLDivElement;
  // A SIGNAL (not a plain `let`): usePosition's floating ref must be reactive so
  // Floating UI recomputes once the menu mounts. A non-reactive ref left the menu
  // parked at the page origin (0,0) instead of anchored at the caret.
  const [menuRef, setMenuRef] = createSignal<HTMLDivElement>();
  const highlightName = `kai-composer-highlight-${createUniqueId()}`;
  const [empty, setEmpty] = createSignal(docIsEmpty(normalizeValue(props.value)));

  // --- Atomic pill selection (Claude Code-style: arrow onto a pill selects the
  //     whole unit; arrow again steps the caret past it; Backspace/Delete removes
  //     it). The selected pill carries `data-selected` for the highlight. This is
  //     a caret/visual affordance only — it never mutates the doc. ---
  const [selectedPill, setSelectedPill] = createSignal<HTMLElement | null>(null);
  const selectPill = (el: HTMLElement) => {
    const cur = selectedPill();
    if (cur && cur !== el) cur.removeAttribute('data-selected');
    el.setAttribute('data-selected', '');
    setSelectedPill(el);
  };
  const clearPillSelection = () => {
    const cur = selectedPill();
    if (!cur) return;
    cur.removeAttribute('data-selected');
    setSelectedPill(null);
  };

  // --- Undo/redo history (we own it; native contenteditable undo corrupts pills) ---
  const history = createHistory({ doc: normalizeValue(props.value), caret: 0 });
  let lastEditAt = 0;
  const COALESCE_MS = 500;

  // --- Trigger menu state ---
  type ActiveTriggerState = {
    def: TriggerDef;
    query: string;
    start: number;
    caretRect: DOMRect;
  };
  const [activeTrigger, setActiveTrigger] = createSignal<ActiveTriggerState | null>(null);
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const filteredItems = createMemo((): TriggerItem[] => {
    const t = activeTrigger();
    if (!t?.def.items) return [];
    // Exclude entities already present in the doc (by effective kind + id) — don't
    // offer a skill/agent/plugin the user has already added.
    const present = new Set(entitiesOf(parseDom(editable)).map((e) => `${e.kind}:${e.id}`));
    const q = t.query.toLowerCase();
    return t.def.items.filter((item) => {
      const kind = item.kind ?? t.def.kind;
      if (present.has(`${kind}:${item.id}`)) return false;
      if (q === '') return true;
      // Match label or description (Codex filters across both).
      return item.label.toLowerCase().includes(q) || (item.description?.toLowerCase().includes(q) ?? false);
    });
  });

  // Group the filtered items into sections by `group`, preserving first-appearance
  // order. Each item keeps its FLAT index so selection/keyboard-nav stays simple.
  const groupedItems = createMemo(() => {
    const groups: { group: string | undefined; items: { item: TriggerItem; index: number }[] }[] = [];
    filteredItems().forEach((item, index) => {
      let g = groups.find((x) => x.group === item.group);
      if (!g) { g = { group: item.group, items: [] }; groups.push(g); }
      g.items.push({ item, index });
    });
    return groups;
  });

  // The built-in menu is open only when there are items left to show (after
  // query filtering AND excluding already-added entities). `kai-trigger` still
  // fires regardless, so consumers driving a custom menu aren't affected.
  const menuOpen = createMemo(() => filteredItems().length > 0);

  // Icon resolution for a menu item: its own icon → the per-kind default.
  // (When neither, the menu renders the built-in kind glyph as a fallback.)
  const itemKind = (item: TriggerItem) => item.kind ?? activeTrigger()?.def.kind ?? '';
  const itemIconSrc = (item: TriggerItem) => item.icon ?? props.kindIcons?.[itemKind(item)];

  // Keep selectedIndex in bounds when filteredItems changes
  createEffect(() => {
    const max = filteredItems().length;
    if (selectedIndex() >= max) setSelectedIndex(Math.max(0, max - 1));
  });

  // --- Floating menu positioning ---
  // Virtual reference element built from the live caret rect
  const virtualRef = createMemo((): HTMLElement | undefined => {
    const t = activeTrigger();
    if (!t) return undefined;
    const rect = t.caretRect;
    return {
      getBoundingClientRect: () => rect,
    } as unknown as HTMLElement;
  });

  const { pos, hidden } = usePosition(virtualRef, menuRef, { placement: 'bottom-start', gutter: 4 });
  const { present, state, setRef } = createPresence(menuOpen);

  useDismiss({
    enabled: menuOpen,
    onDismiss: () => closeTrigger(),
    refs: () => [editable, menuRef()],
  });

  function closeTrigger() {
    if (activeTrigger()) {
      setActiveTrigger(null);
      props.onTriggerClose?.();
    }
  }

  // --- Core logic ---

  const snapshot = (): ComposerChange => {
    const doc = parseDom(editable);
    return { doc, text: serializeToText(doc), entities: entitiesOf(doc) };
  };

  /** Recompute and register CSS Custom Highlight ranges for keyword rules. No
   *  rules → apply an empty set, which clears any prior registration. */
  function recomputeHighlights() {
    const rules = props.highlights;
    const matches = rules?.length ? findHighlightMatches(getFullText(editable), rules) : [];
    applyHighlights(editable, matches, ZWSP, highlightName);
  }

  onMount(() => {
    renderDoc(editable, normalizeValue(props.value), editable.ownerDocument, props.kindIcons);
    setEmpty(docIsEmpty(parseDom(editable)));
    recomputeHighlights();
    history.reset({ doc: parseDom(editable), caret: 0 });
  });

  // Re-render when the controlled `value` prop changes, but ONLY when the
  // editable is NOT focused (don't stomp the caret while the user is typing).
  createEffect(on(() => props.value, (v) => {
    // Re-render only when the incoming value actually differs from what the DOM
    // already shows. This skips the echo of our own onChange (so the caret isn't
    // stomped while typing) while still honoring genuine external changes —
    // including a clear-after-submit that fires while the editable is focused.
    const incoming = serializeToText(normalizeValue(v));
    if (incoming === serializeToText(parseDom(editable))) return;
    clearPillSelection(); // selected pill node is about to be replaced
    renderDoc(editable, normalizeValue(v), editable.ownerDocument, props.kindIcons);
    setEmpty(docIsEmpty(parseDom(editable)));
    recomputeHighlights();
    history.reset({ doc: parseDom(editable), caret: 0 }); // external value = new baseline
  }, { defer: true }));

  // Re-decorate when `highlights` changes on its own — e.g. a consumer (or the
  // docs <Example>) assigns `value` then `highlights` as separate properties
  // after mount. Without this, highlights set after the value-effect ran would
  // never apply. `defer` skips the mount run (onMount already decorates).
  createEffect(on(() => props.highlights, () => recomputeHighlights(), { defer: true }));

  function updateTriggerState() {
    const defs = props.triggers;
    if (!defs?.length) {
      if (activeTrigger()) closeTrigger();
      return;
    }
    const text = getFullText(editable);
    const caret = getCaretTextOffset(editable);
    const hit = activeTriggerFor(text, caret, defs);
    if (hit) {
      const rect = getCaretRect(editable);
      if (rect) {
        const prev = activeTrigger();
        setActiveTrigger({ def: hit.def, query: hit.query, start: hit.start, caretRect: rect });
        // Fire onTrigger if char/query changed or first activation
        if (!prev || prev.def.char !== hit.def.char || prev.query !== hit.query) {
          props.onTrigger?.({ char: hit.def.char, query: hit.query, rect });
        }
      }
    } else {
      if (activeTrigger()) closeTrigger();
    }
  }

  // Update derived state + notify the consumer (no history side effects).
  const syncState = (change: ComposerChange) => {
    setEmpty(docIsEmpty(change.doc));
    props.onChange?.(change);
    updateTriggerState();
    recomputeHighlights();
  };

  // Native input (typing / deleting): sync + record a (time-coalesced) history step.
  const handleInput = () => {
    clearPillSelection(); // any text edit drops a stale pill highlight
    const change = snapshot();
    syncState(change);
    const now = Date.now();
    history.record({ doc: change.doc, caret: getCaretTextOffset(editable) }, now - lastEditAt < COALESCE_MS);
    lastEditAt = now;
  };

  // Structural edit (pill insert/delete): sync + record a DISTINCT history step.
  const commitChange = () => {
    const change = snapshot();
    syncState(change);
    history.record({ doc: change.doc, caret: getCaretTextOffset(editable) }, false);
    lastEditAt = 0; // next typing starts its own entry
  };

  // Restore a snapshot (undo/redo). Re-renders the doc (pills included) + caret,
  // syncs derived state, but does NOT push a new history entry.
  const applySnapshot = (snap: { doc: ComposerDoc; caret: number }) => {
    clearPillSelection(); // the selected pill node is about to be replaced
    renderDoc(editable, snap.doc, editable.ownerDocument, props.kindIcons);
    setCaretToOffset(editable, snap.caret);
    syncState(snapshot());
    lastEditAt = 0;
  };
  const doUndo = () => { const s = history.undo(); if (s) applySnapshot(s); };
  const doRedo = () => { const s = history.redo(); if (s) applySnapshot(s); };

  // Also update trigger state on selectionchange (while focused). These handlers
  // double as the consumer-facing focus/blur surface (focus/blur are NOT composed,
  // so they don't escape the shadow root natively — we re-expose them as callbacks
  // the element turns into kai-focus/kai-blur).
  let focused = false;
  const handleFocus = (e: FocusEvent) => { focused = true; props.onFocus?.(e); };
  const handleBlur = (e: FocusEvent) => { focused = false; clearPillSelection(); props.onBlur?.(e); };

  onMount(() => {
    // Captured at SETUP and closed over, never re-resolved as a global inside
    // `onCleanup`: cleanup can run after the host removed the DOM globals (a
    // `kai-*` release is deferred one microtask past detachment, so an
    // environment teardown gets in between), and a bare `document` there throws
    // -- from a promise nobody holds, so it lands as an unhandled rejection that
    // fails the run while every test passes. That is how this was found.
    // See tests/components/teardown-without-dom-globals.test.tsx.
    // `ownerDocument` rather than a captured `document`, matching the rest of
    // this file and staying correct for a composer inside an iframe.
    const doc = editable.ownerDocument;
    const onSelectionChange = () => {
      if (focused) updateTriggerState();
    };
    doc.addEventListener('selectionchange', onSelectionChange);
    onCleanup(() => doc.removeEventListener('selectionchange', onSelectionChange));
  });

  // --- Imperative controller (Pattern C): hand the facade a handle over the
  //     composer's latent capabilities. `editable`/`snapshot`/`insertEntity` are
  //     already wired internally — this just surfaces them without changing any
  //     existing behavior. ---
  onMount(() => {
    props.controllerRef?.({
      focus: (options) => editable.focus(options),
      blur: () => editable.blur(),
      // Empty the composer to a blank doc + reset the history baseline. Mirrors
      // the external-value clear path so derived state syncs and onChange fires
      // (which the facade turns into kai-value-change).
      clear: () => {
        clearPillSelection();
        renderDoc(editable, [], editable.ownerDocument, props.kindIcons);
        syncState(snapshot());
        history.reset({ doc: parseDom(editable), caret: 0 });
        lastEditAt = 0;
      },
      // Submit the current content programmatically — same path as Enter.
      send: () => props.onSubmit?.(snapshot()),
      // Insert an atomic pill at the caret (no trigger token to delete).
      insertEntity: (entity) => insertEntity(entity),
    });
  });

  /**
   * Select an item from the trigger menu.
   */
  function selectItem(item: TriggerItem) {
    const t = activeTrigger();
    if (!t) return;
    const entity: EntityRef = {
      kind: item.kind ?? t.def.kind,
      id: item.id,
      label: item.label,
      icon: item.icon,
      promptText: item.promptText,
      data: item.data,
    };
    // Delete the trigger token = the char + query ("/re" → 3) before the caret.
    insertEntity(entity, { deleteBefore: 1 + t.query.length });
    closeTrigger();
  }

  /**
   * Insert an entity pill at the caret.
   * If `opts.deleteBefore` is given, that many non-ZWSP characters immediately
   * before the caret are removed first (the trigger token). The deletion walks
   * BACKWARD from the caret within its text run, so it can never cross an earlier
   * pill — a global-offset delete used to eat the previous pill, capping the field
   * at two pills. After insertion the caret sits just after the new ZWSP marker.
   */
  const insertEntity = (entity: EntityRef, opts?: { deleteBefore?: number }) => {
    const ownerDoc = editable.ownerDocument;
    const sel = getActiveSelection(editable);
    if (!sel || sel.rangeCount === 0) return;

    // Delete the trigger token: walk BACK from the caret over `deleteBefore`
    // non-ZWSP chars to find the token start, then delete start→caret. Walking
    // back stays within the caret's text run (stops at a pill), so it never eats
    // an earlier pill. Deleting via a range collapses the live selection cleanly.
    const caret = sel.getRangeAt(0);
    if (opts?.deleteBefore && caret.collapsed) {
      let remaining = opts.deleteBefore;
      let node: Node | null = caret.startContainer;
      let offset = caret.startOffset;
      while (remaining > 0 && node && node.nodeType === 3) {
        const text = node.textContent ?? '';
        while (offset > 0 && remaining > 0) {
          offset--;
          if (text[offset] !== ZWSP) remaining--;
        }
        if (remaining > 0) {
          const prev: ChildNode | null = node.previousSibling;
          if (prev && prev.nodeType === 3) { node = prev; offset = (prev.textContent ?? '').length; }
          else break; // a pill (or nothing) precedes — stop, never delete across it
        }
      }
      const del = ownerDoc.createRange();
      del.setStart(node as Node, offset);
      del.setEnd(caret.startContainer, caret.startOffset);
      del.deleteContents();
    }

    // Insert at the live caret (re-collapsed at the deletion point by the browser).
    const range = sel.getRangeAt(0);
    if (!range.collapsed) range.deleteContents();
    const pill = createEntityEl(ownerDoc, entity, props.kindIcons);
    const zwspNode = ownerDoc.createTextNode(ZWSP);
    range.insertNode(zwspNode);
    range.insertNode(pill); // inserted before the zwsp → DOM order [pill][zwsp]

    const after = ownerDoc.createRange();
    after.setStartAfter(zwspNode);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);

    props.onEntityAdd?.(entity);
    commitChange();
  };

  // A string consisting only of ZWSP markers (an empty string counts — `[].every`
  // is true). Used to recognize the zero-width filler that trails a pill.
  const onlyZwsp = (s: string | null): boolean =>
    (s ?? '').split('').every((ch) => ch === ZWSP);

  // Zero-width filler between a pill and adjacent content: an empty OR ZWSP-only
  // text node. Inserting a pill (and then typing) leaves these behind — e.g.
  // `[pill][t""][t"<ZWSP> world"]` — so adjacency checks MUST skip them to find
  // the pill. (This was the forward/backward asymmetry: a pill's `nextSibling` is
  // the pill itself, but its following text node's `previousSibling` is filler.)
  const isFiller = (n: Node | null): boolean =>
    !!n && n.nodeType === Node.TEXT_NODE && onlyZwsp(n.textContent);

  /** The entity pill immediately BEFORE a collapsed caret (skipping zero-width
   *  filler), or null. Shared by Backspace and ArrowLeft selection. */
  const pillBeforeCaret = (range: Range): HTMLElement | null => {
    const { startContainer, startOffset } = range;
    if (startContainer === editable) {
      let i = startOffset - 1;
      while (isFiller(editable.childNodes[i])) i--;
      const node = editable.childNodes[i];
      return isEntityEl(node) ? (node as HTMLElement) : null;
    }
    if (startContainer.nodeType === Node.TEXT_NODE) {
      // Only treat the caret as "right after a pill" when nothing but filler
      // precedes it within this text run.
      if (!onlyZwsp((startContainer.textContent ?? '').slice(0, startOffset))) return null;
      let prev = startContainer.previousSibling;
      while (isFiller(prev)) prev = prev!.previousSibling;
      return isEntityEl(prev) ? (prev as HTMLElement) : null;
    }
    return null;
  };

  /** The entity pill immediately AFTER a collapsed caret (skipping zero-width
   *  filler), or null. Shared by Delete and ArrowRight selection. */
  const pillAfterCaret = (range: Range): HTMLElement | null => {
    const { startContainer, startOffset } = range;
    if (startContainer === editable) {
      let i = startOffset;
      while (isFiller(editable.childNodes[i])) i++;
      const node = editable.childNodes[i];
      return isEntityEl(node) ? (node as HTMLElement) : null;
    }
    if (startContainer.nodeType === Node.TEXT_NODE) {
      if (!onlyZwsp((startContainer.textContent ?? '').slice(startOffset))) return null;
      let next = startContainer.nextSibling;
      while (isFiller(next)) next = next!.nextSibling;
      return isEntityEl(next) ? (next as HTMLElement) : null;
    }
    return null;
  };

  /** Remove a pill (and its trailing ZWSP marker), fire onEntityRemove, commit. */
  const removePillEl = (pill: HTMLElement) => {
    const entity = entityStore.get(pill);
    const after = pill.nextSibling;
    if (after?.nodeType === Node.TEXT_NODE && onlyZwsp(after.textContent)) after.remove();
    pill.remove();
    if (entity) props.onEntityRemove?.(entity);
    commitChange();
  };

  /** Collapse the caret just before a pill. */
  const caretBeforePill = (pill: HTMLElement) => {
    const sel = getActiveSelection(editable);
    if (!sel) return;
    const r = editable.ownerDocument.createRange();
    r.setStartBefore(pill);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };
  /** Collapse the caret just after a pill (past its trailing zero-width filler,
   *  so the next character lands outside the pill). */
  const caretAfterPill = (pill: HTMLElement) => {
    const sel = getActiveSelection(editable);
    if (!sel) return;
    let node: Node = pill;
    while (isFiller(node.nextSibling)) node = node.nextSibling!;
    const r = editable.ownerDocument.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // --- Undo / redo (we own the history; native contenteditable undo corrupts
    //     pills, so suppress it and drive our doc-snapshot stack instead) ---
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) { // Windows redo
      e.preventDefault();
      doRedo();
      return;
    }

    // --- Trigger menu keyboard navigation (takes priority) ---
    if (menuOpen() && filteredItems().length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredItems().length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredItems().length) % filteredItems().length);
        return;
      }
      // Enter OR Tab selects the highlighted item (Tab is a common picker accept).
      if (e.key === 'Enter' || e.key === 'Tab') {
        const items = filteredItems();
        if (items.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          selectItem(items[selectedIndex()]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTrigger();
        return;
      }
    } else if (activeTrigger() && e.key === 'Escape') {
      // No items shown but trigger is active (e.g. only onTrigger fired) — close on Escape
      e.preventDefault();
      closeTrigger();
      return;
    }

    // --- A selected pill behaves as one unit (Claude Code-style) ---
    const selPill = selectedPill();
    if (selPill && selPill.isConnected) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); caretBeforePill(selPill); clearPillSelection(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); caretAfterPill(selPill); clearPillSelection(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        const anchor = selPill.previousSibling; // text node the caret should return to
        clearPillSelection();
        removePillEl(selPill);
        const sel = getActiveSelection(editable);
        if (sel) {
          const r = editable.ownerDocument.createRange();
          if (anchor && anchor.isConnected) r.setStartAfter(anchor);
          else r.setStart(editable, 0);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); clearPillSelection(); return; }
      // A bare modifier keypress shouldn't drop the selection.
      if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') return;
      // Any other key (typing, Enter, …): drop the highlight and let the key act
      // from just after the pill — then fall through to the normal handlers.
      caretAfterPill(selPill);
      clearPillSelection();
    }

    // --- ArrowLeft/Right INTO an adjacent pill selects it as one unit ---
    if (
      !selectedPill() &&
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey
    ) {
      const sel = getActiveSelection(editable);
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          const pill = e.key === 'ArrowLeft' ? pillBeforeCaret(range) : pillAfterCaret(range);
          if (pill) { e.preventDefault(); selectPill(pill); return; }
        }
      }
    }

    // --- Backspace / Delete: atomically remove pill immediately before/after caret ---
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const sel = getActiveSelection(editable);
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      if (!range.collapsed) return; // let the browser handle a selection deletion

      const pill = e.key === 'Backspace' ? pillBeforeCaret(range) : pillAfterCaret(range);
      if (pill) {
        e.preventDefault();
        removePillEl(pill);
        return;
      }
    }

    // --- Enter: submit (only when menu is NOT open or no item is highlighted) ---
    if (e.key === 'Enter' && !e.shiftKey && props.submitOnEnter !== false) {
      e.preventDefault();
      if (props.disabled || props.loading) return;
      props.onSubmit?.(snapshot());
    }
  };

  // Close trigger when space is typed (handled via input event — space moves caret
  // past whitespace boundary, so updateTriggerState will return null anyway).
  // This is covered by updateTriggerState() in handleInput.

  const maxH = () => props.maxHeight ?? 240;
  // This element is `contenteditable` with `role="textbox"` — a real tab stop,
  // and the primary one in the kit — so it must never be left with NO focus
  // affordance. WHICH element draws it depends on who owns the frame:
  //
  //  - Standalone (the `else` branch below renders the rounded shell): the FRAME
  //    owns the ring via `focus-within:ring-*`, exactly like `PromptInput`, so
  //    the editable neutralizes its own. The editable is a square, full-bleed
  //    box inside a `rounded-xl` shell, so an outline on IT painted a sharp
  //    rectangle hugging the text region inside the rounded border — the bug.
  //  - Bare: the host owns radius/bg/padding and may draw nothing at all
  //    (`PromptInput` passes its own `editableClass` and rings its frame), so
  //    the editable keeps `kai-focus-inset` — a ring inside the border box,
  //    since an outset one would be clipped by a rounded host shell.
  //
  // A consumer passing `editableClass` still replaces this wholesale — including
  // the `text-start` pin below, so a replacement string owes its own (`PromptInput`,
  // the one in-repo caller, carries it).
  const editableCls = () =>
    props.editableClass ??
    cn(
      // `text-start` is a PIN, not a style choice: `text-align` inherits, so any
      // centered ancestor (`Empty`'s root did exactly this) reached in and centered
      // the placeholder AND the typed text. An input control's text alignment is a
      // fact about the control, so it states it rather than inheriting it. LOGICAL
      // (`start`), not `text-left` — in RTL the correct edge is the right one, and
      // pinning the physical value would be a worse bug than the one it fixes.
      'text-foreground min-h-[44px] w-full text-start overflow-y-auto whitespace-pre-wrap break-words',
      // Size from the SAME token every other text surface reads (`ChatConfig`'s
      // proseSize, default `sm` = the 14px the rest of the kit sets explicitly) —
      // `Markdown`, `MessageContent` and `PromptInputTextarea` all go through
      // `textClass`. Without it the editable set no size at all and just inherited
      // whatever the shadow root's base was (16px in a stock page), so the composer
      // read a step larger than every component beside it. Going through the token
      // also means `proseSize` moves the composer like it moves `PromptInput`,
      // rather than leaving one input deaf to it.
      textClass(config.proseSize()),
      props.bare
        ? 'kai-focus-inset'
        : 'outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
    );

  const inner = (
    <>
      {/* Static style for CSS Custom Highlight API decoration.
          No-op in browsers that don't support ::highlight(); the selector
          is simply unrecognized and dropped. */}
      <style>{`
        /* MARKED text, not selected text. Reads --color-highlight (overridable via
           --kai-color-highlight), a warm <mark> yellow. It used to be a 22% tint of
           --color-primary with a #6366f1 indigo fallback — but the kit's
           --color-primary is a NEUTRAL (near-black in light, near-white in dark),
           so the indigo the fallback implied never appeared and the highlight
           rendered plain grey in both themes.

           NO \`prefers-color-scheme\` here, deliberately — the same trap that put
           the pill hues below at 2.33:1. The OS scheme and the kit's RESOLVED
           theme are different questions, and \`theme="light"\` on a dark-OS machine
           is an ordinary configuration; a scheme-keyed value would paint the dark
           amber on the light field. The pills answer this by scoping to \`.dark\`,
           which is NOT available here: \`::highlight()\` names a document-registered
           highlight, so there is no wrapper to hang a descendant selector on.

           It does not need one. \`--color-highlight\` reaches this pseudo through
           highlight inheritance from the ORIGINATING element — the text inside the
           \`.dark\` wrapper — so the token already answers the resolved theme,
           verified by rendering the dark amber under \`theme="dark"\` with only the
           LIGHT literal below as a fallback. The literal is therefore reachable
           only when no kit stylesheet is loaded at all, and it is deliberately the
           light one: an unstyled page is a white page, and guessing from the OS is
           exactly the failure above. */
        ::highlight(${highlightName}) { background-color: var(--color-highlight, hsl(45 96% 78%)); }
      `}</style>
      {/* Atomic entity pill styling. Self-contained (currentColor-based) so it
          renders correctly without depending on a Tailwind rebuild for the
          custom .kai-composer-pill class. */}
      <style>{`
        .kai-composer-pill {
          display: inline-flex; align-items: center; gap: 0.2rem;
          /* middle (not baseline): a flex pill's baseline differs with/without an
             icon, which misaligns adjacent pills — middle aligns them consistently. */
          vertical-align: middle; height: 1.5em;
          /* Asymmetric margin: a roomier trailing gap (so typed text isn't flush
             after a pill) + a smaller leading gap. */
          margin: 0 0.3rem 0 0.1rem;
          border-radius: 0.375rem;
          font-weight: 500; white-space: nowrap; user-select: none; cursor: default;
          box-sizing: border-box; line-height: 1;
        }
        /* Skills + agents: LIGHT — decorated inline text led by a sigil, NOT a
           chip. A distinct colour per kind (overridable); the sigil is dimmer
           than the label. (A GUI affords this richer-but-light look; a CLI can't.) */
        .kai-composer-pill[data-kind="skill"],
        .kai-composer-pill[data-kind="agent"] {
          padding: 0 0.1rem; background: transparent;
          /* Read like a command, not a title — lowercase the DISPLAY only; the
             entity label + emitted payload keep the consumer's original casing. */
          text-transform: lowercase;
        }
        .kai-composer-pill[data-kind="skill"] { color: var(--kai-pill-skill, #2563eb); }
        .kai-composer-pill[data-kind="agent"] { color: var(--kai-pill-agent, #7c3aed); }
        /* Brighter hues on dark so they don't muddy against a dark field. The
           consumer's --kai-pill-* override still wins (it's the var value); only
           the FALLBACK shifts per scheme.

           Keyed on the kit's RESOLVED theme (the \`.dark\` wrapper an element
           facade puts inside its shadow root, and the \`.dark\` class the docs /
           Storybook put on <html>) — NOT \`prefers-color-scheme\`. Those are
           different questions: \`theme="light"\` on a machine whose OS is dark is
           an ordinary, common configuration, and the media query answered the OS
           while the surface under the pill answered the attribute. That painted
           the DARK hue (#6ea8fe) on the LIGHT field: 2.33:1, under both the
           4.5:1 text floor (SC 1.4.3) and even 3:1. Matched pairs looked fine,
           which is why it survived — never scheme-match a colour whose backdrop
           is chosen by the theme attribute. */
        .dark .kai-composer-pill[data-kind="skill"] { color: var(--kai-pill-skill, #6ea8fe); }
        .dark .kai-composer-pill[data-kind="agent"] { color: var(--kai-pill-agent, #c4a7fc); }
        /* Dimmer than the label, but the sigil is what makes a pill read as
           \`/skill\` vs \`@agent\`, so it is a meaningful glyph and owes 3:1
           (SC 1.4.11). At 0.6 the light-mode composite was 2.52:1. */
        .kai-composer-pill-sigil { opacity: 0.8; font-weight: 600; }
        /* Plugins (and any other/unknown kind): the richer CHIP — background +
           icon — so a composite bundle reads differently at a glance. */
        .kai-composer-pill:not([data-kind="skill"]):not([data-kind="agent"]) {
          padding: 0 0.4rem;
          background-color: color-mix(in srgb, currentColor 10%, transparent);
        }
        /* Selected (caret arrowed onto the pill): a highlight box, like Claude
           Code web. Tinted by the pill's own colour via currentColor. */
        .kai-composer-pill[data-selected] {
          background-color: color-mix(in srgb, currentColor 18%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 30%, transparent);
        }
        /* Fixed height + an icon never taller than the box → iconed and iconless
           pills are exactly the same height (no baseline shift in the line). */
        .kai-composer-pill-icon { width: 1em; height: 1em; flex-shrink: 0; }
        img.kai-composer-pill-icon { border-radius: 9999px; object-fit: cover; }
        .kai-composer-pill-glyph { display: inline-flex; align-items: center; justify-content: center; opacity: 0.8; }
        .kai-composer-pill-glyph svg { width: 1em; height: 1em; display: block; }
        /* The editable is the containing block for the placeholder pseudo-element. */
        [data-kai-composer-editable] { position: relative; }
        /* While a pill is arrow-selected the pill IS the selection, so hide the text
           caret so a blinking cursor doesn't sit beside the highlight box. Returns
           the moment the pill selection clears (arrow off, type, click, backspace). */
        [data-kai-composer-editable][data-pill-selected] { caret-color: transparent; }
        /* Placeholder via pseudo-element — exempt from axe color-contrast like a
           native <textarea> placeholder. position:absolute (with auto offsets =
           its static text-origin spot) takes it OUT of flow, so the caret sits at
           the START of the field instead of after the placeholder text. */
        [data-kai-composer-editable].kai-composer-empty::before {
          content: attr(data-placeholder);
          position: absolute;
          color: var(--color-muted-foreground, #9ca3af);
          pointer-events: none;
        }
      `}</style>
      {/* Placeholder is a `::before` pseudo-element (see the style block) — it sits
          at the text origin automatically (respecting the editable's padding/font),
          and, like a native <textarea> placeholder, is exempt from axe color-contrast
          (a real text node would fail it at the muted color). */}
      <div class="relative">
        <div
          ref={(el) => { editable = el; props.editableRef?.(el); }}
          data-kai-composer-editable
          data-pill-selected={selectedPill() ? '' : undefined}
          data-placeholder={props.placeholder ?? ''}
          contentEditable={props.disabled ? false : ('plaintext-only' as unknown as boolean)}
          role="textbox"
          aria-multiline="true"
          aria-label={props.ariaLabel || props.placeholder || 'Message input'}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onMouseDown={clearPillSelection}
          onFocus={handleFocus}
          onBlur={handleBlur}
          // The empty/placeholder class is folded into `class` (NOT a separate
          // `classList`) — a reactive `class` string would otherwise clobber a
          // classList toggle (Solid sets className wholesale on re-eval).
          class={cn(editableCls(), empty() && props.placeholder ? 'kai-composer-empty' : '')}
          style={{
            'max-height':
              typeof maxH() === 'number' ? `${maxH()}px` : String(maxH()),
          }}
        />
      </div>

      {/* Trigger menu */}
      <Show when={present()}>
        <div
          ref={(el) => { setMenuRef(el); setRef(el); }}
          role="listbox"
          aria-label="Suggestions"
          data-state={state()}
          class={cn(
            'absolute z-50 min-w-[240px] max-w-[420px] max-h-[320px] overflow-y-auto rounded-lg bg-card shadow-lg py-1',
            'border border-border',
          )}
          style={{
            position: 'fixed',
            left: `${pos().x}px`,
            top: `${pos().y}px`,
            visibility: hidden() ? 'hidden' : 'visible',
          }}
        >
          <For each={groupedItems()}>
            {(section) => (
              <>
                <Show when={section.group}>
                  <div class="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground select-none">{section.group}</div>
                </Show>
                <For each={section.items}>
                  {(entry) => (
                    <button
                      role="option"
                      aria-selected={selectedIndex() === entry.index}
                      data-index={entry.index}
                      class={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                        selectedIndex() === entry.index
                          ? 'bg-muted text-foreground'
                          : 'text-foreground hover:bg-muted',
                      )}
                      onMouseEnter={() => setSelectedIndex(entry.index)}
                      // Keep focus (and the caret) in the editable so insertion works.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => { e.preventDefault(); selectItem(entry.item); }}
                    >
                      <Show
                        when={itemIconSrc(entry.item)}
                        fallback={
                          <Show when={kindGlyph(itemKind(entry.item))}>
                            {(glyph) => (
                              <span class="kai-composer-pill-glyph w-4 h-4 shrink-0" aria-hidden="true" innerHTML={glyph()} />
                            )}
                          </Show>
                        }
                      >
                        {(src) => <img src={src()} alt="" class="w-4 h-4 rounded object-cover shrink-0" />}
                      </Show>
                      <span class="font-medium whitespace-nowrap shrink-0">{entry.item.label}</span>
                      <Show when={entry.item.description}>
                        <span class="text-muted-foreground truncate min-w-0">{entry.item.description}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </div>
      </Show>
    </>
  );

  // Bare mode: no frame (the host owns radius/bg/padding). Standalone: full frame.
  return props.bare ? (
    inner
  ) : (
    <div
      class={cn(
        // Same frame-owns-the-ring pattern as `PromptInput`: the editable inside
        // neutralizes its own outline (see `editableCls`), so this rounded shell
        // draws the focus affordance and the ring follows `rounded-xl` instead of
        // painting a square box around the inner text region.
        'kai-composer relative rounded-xl bg-surface p-2',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0',
        props.disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      {inner}
    </div>
  );
}
