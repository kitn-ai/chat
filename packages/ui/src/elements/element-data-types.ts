/**
 * The data shapes a consumer assigns to a `kai-*` element's array/object
 * properties, when that shape has no Solid-layer twin they could import instead.
 *
 * WHY THIS FILE EXISTS. The generated `.d.ts` for `./elements` and the React
 * wrappers expand every prop type STRUCTURALLY (see the `IMPORTS = {}` note in
 * scripts/gen-element-api.mjs — self-contained declarations are what keeps a
 * consumer's tsc from resolving library `.ts` source). That is right for the
 * generated files, but it means a consumer who wants to name the shape — a
 * `const items: … = [...]` in their own code, a helper that builds one — has no
 * type to import and ends up writing
 * `NonNullable<KaiCommandElementProps['items']>`. Every named element-prop type
 * must therefore be reachable from the ROOT entry (`@kitn.ai/ui`), which is what
 * a React / Vue / Svelte / vanilla consumer imports. Enforced by
 * tests/elements/prop-types-exported.test.ts.
 *
 * These live in their own module (not in the facades that use them) because the
 * facades compile to per-element side-effect entry points whose shipped
 * declarations are `export {};` — a type re-exported from one of those would not
 * resolve for a consumer. Types with a Solid twin (`TriggerDef`, `KaiNavItem`,
 * `ChatThreadContextUsage`, …) stay in their own layer's module and are
 * re-exported from `src/index.ts` directly.
 *
 * Type-only: fully erased by the build, so the root barrel pays nothing.
 */

/** A single segment of `<kai-segmented>`.
 *
 *  Distinct from the Solid `SegmentedOption`, whose `icon` is a JSX node: on the
 *  element, `icon` is an icon-NAME string (web-component-friendly) — a curated
 *  name (e.g. `"code"`), a URL/data-URI, or plain text — resolved to a glyph via
 *  the kit's icon renderer (the same path `kai-button`'s `icon` uses). */
export interface KaiSegmentedOption {
  value: string;
  label: string;
  icon?: string;
}

/** A single citation in `<kai-sources>`' `sources` property. Also the shape
 *  `<kai-source>` light-DOM children are parsed into. */
export interface KaiSourceItem {
  href: string;
  title?: string;
  description?: string;
  label?: string;
  showFavicon?: boolean;
}

/** Token-usage data for `<kai-context>`' `context` property. */
export interface KaiContextUsage {
  /** Tokens consumed so far in the context window (drives the meter fill). */
  usedTokens: number;
  /** The model's total context-window size in tokens. */
  maxTokens: number;
  /** Tokens attributed to the prompt/input, shown in the breakdown. */
  inputTokens?: number;
  /** Tokens attributed to the generated output, shown in the breakdown. */
  outputTokens?: number;
  /** Tokens attributed to reasoning/thinking, shown when present. */
  reasoningTokens?: number;
  /** Tokens served from prompt cache, shown when present. */
  cacheTokens?: number;
  /** Estimated cost in dollars for this usage, shown in the footer. */
  estimatedCost?: number;
}

/** One item in `<kai-menu>`'s `items` tree. */
export interface KaiMenuItem {
  /** Emitted in `kai-select` for actionable items. */
  id?: string;
  label?: string;
  /** Named icon (e.g. "paperclip"), image URL / data-URI, or plain text. */
  icon?: string;
  /** e.g. '⌘U' — shown right-aligned, muted. */
  shortcut?: string;
  /** Presence ⇒ a checkbox item (role=menuitemcheckbox). With `radioGroup` set,
   *  marks the SELECTED radio item in that group instead. */
  checked?: boolean;
  /** Membership in a single-select group (role=menuitemradio). Items sharing a
   *  `radioGroup` are mutually exclusive — the one with `checked: true` shows the
   *  checkmark; selecting one emits `{ id, radioGroup }` so the consumer moves
   *  the checkmark (the consumer owns state, like checkbox items). */
  radioGroup?: string;
  disabled?: boolean;
  /** A divider (ignores other fields). */
  separator?: boolean;
  /** A non-interactive section label (uses `label`). */
  heading?: boolean;
  /** ⇒ a submenu. */
  items?: KaiMenuItem[];
}

/**
 * A single command/mention item for `<kai-command>`.
 *
 * Set `items` as a JS property (array ref) — not an HTML attribute.
 */
export interface KaiCommandItem {
  /** Unique identifier emitted in `kai-select`. */
  id: string;
  /** Display name shown in the list row. */
  label: string;
  /** Named icon (e.g. "search"), image URL / data-URI, or plain text. */
  icon?: string;
  /** Muted supplementary text (e.g. a file path or a short description). */
  description?: string;
  /** Optional keyboard shortcut shown as right-aligned key caps; uses the
   *  kai-kbd `keys` syntax (e.g. "Mod+K", "Alt+1"). */
  shortcut?: string;
  /** Group name that buckets this item under a section header. */
  group?: string;
}
