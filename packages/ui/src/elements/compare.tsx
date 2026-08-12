import { defineWebComponent } from './define';
import { ChatConfig, useChatConfig, type ProseSize } from '../primitives/chat-config';
import { ResponseCompare, type CompareLayout } from '../components/response-compare';
import type {
  ResponseCompareData,
  CompareSelection,
  ResponseCompareController,
} from '../components/response-compare';

interface Props extends Record<string, unknown> {
  /** The compare definition (prompt + the two candidates). Set as a JS PROPERTY:
   *  `el.data = { prompt, candidates: [A, B], collapse? }`. Import
   *  `ResponseCompareData` from `@kitn.ai/ui` for the full shape. */
  data?: Record<string, unknown>;
  /** Stable id correlating every emitted event. Attribute: `compare-id`. */
  compareId?: string;
  /** Re-hydrate / control the user's pick. Set as a JS PROPERTY:
   *  `el.selection = { chosenId, rejectedIds }`. Renders the collapsed winner. */
  selection?: Record<string, unknown>;
  /** Layout: `'auto'` (default, columns when wide, tabs when narrow, by CONTAINER width) |
   *  `'columns'` (side-by-side) | `'tabs'` (pills to switch). Attribute: `layout`. */
  layout?: CompareLayout;
  /** Prose/text size for the rendered candidates. Attribute: `prose-size`. */
  proseSize?: ProseSize;
  /** Shiki theme for code blocks in the candidates. Attribute: `code-theme`. */
  codeTheme?: string;
  /** Whether code blocks are syntax-highlighted. Attribute: `code-highlight`. */
  codeHighlight?: boolean;
}

interface Events extends Record<string, unknown> {
  /** The user committed a pick. `detail` = `{ chosenId, rejectedIds, at }`. */
  'kai-compare-select': CompareSelection;
  /** Both candidates have settled and the pick is live. */
  'kai-ready': { compareId: string };
  /** The definition was unusable. */
  'kai-error': { compareId: string; message: string };
}

/**
 * `<kai-compare>` — a **dual-response comparison** (set via the `data` property):
 * two assistant candidates for the same prompt, rendered side-by-side (or as tabs),
 * each exactly like an assistant message (reasoning + tools + attachments +
 * markdown). The user **picks** the better one — a COMMIT, not a Submit — which
 * fires a non-bubbling **`kai-compare-select`** CustomEvent off the host
 * (`{ chosenId, rejectedIds:[other], at }`) for the consumer to send a
 * `(prompt, chosen, rejected)` preference pair. The card optimistically collapses
 * to the chosen candidate. Single-shot.
 *
 * Both candidates can stream (push a fresh `data` reference per chunk); the pick is
 * disabled with a per-column shimmer until BOTH settle, then `kai-ready` fires. The
 * columns are a WAI-ARIA radiogroup with roving tabindex (Arrow keys move A↔B,
 * Enter/Space picks). `kai-error` fires for a malformed definition. Isolated in
 * Shadow DOM; theme-aware via the shared tokens.
 */
defineWebComponent<Props, Events>(
  'kai-compare',
  {
    data: undefined,
    compareId: undefined,
    selection: undefined,
    layout: 'auto',
    proseSize: undefined,
    codeTheme: undefined,
    codeHighlight: undefined,
  },
  (props, { element, dispatch, expose }) => {
    const compareId = (): string => props.compareId ?? (element.id || 'kai-compare');
    // Inherit the shadow-root portal mount from the outer ChatConfig that
    // defineWebComponent installs, so candidate-body overlays (hover cards,
    // tooltips) stay inside the shadow root.
    const outer = useChatConfig();

    // ── Imperative API (instance methods on the host) ──────────────────────────
    // Pattern C: ResponseCompare owns the pick + roving-focus state and hands up a
    // controller; the facade captures it and exposes delegating methods. The
    // component's own callbacks still fire (select → onSelect → kai-compare-select).
    let controller: ResponseCompareController | undefined;
    expose({
      /** Programmatically commit a pick by candidate id, on the same path as the
       *  "Pick this" button: fires kai-compare-select and optimistically
       *  collapses (single-shot; inert while streaming or already resolved).
       *  `select` does NOT collide with the `selection` prop (distinct
       *  identifier). */
      select: (candidateId: string) => controller?.select(candidateId),
      /** Focus the current roving tab stop (the focused candidate's "Pick this"
       *  radio) so a consumer can move keyboard focus into the radiogroup. */
      focus: (options?: FocusOptions) => controller?.focus(options),
    });

    return (
      <ChatConfig
        proseSize={props.proseSize}
        codeTheme={props.codeTheme}
        codeHighlight={props.codeHighlight}
        portalMount={outer.portalMount()}
      >
        <ResponseCompare
          data={props.data as ResponseCompareData | undefined}
          compareId={compareId()}
          selection={props.selection as CompareSelection | undefined}
          layout={(props.layout as CompareLayout | undefined) ?? 'auto'}
          controllerRef={(c) => (controller = c)}
          onSelect={(sel) => dispatch('kai-compare-select', sel)}
          onReady={() => dispatch('kai-ready', { compareId: compareId() })}
          onError={(message) => dispatch('kai-error', { compareId: compareId(), message })}
        />
      </ChatConfig>
    );
  },
);
