// src/primitives/card-data-types.ts
// The five built-in card PAYLOAD types — `CardEnvelope.data`, one per card type —
// authored beside the schemas they mirror rather than inside the components that
// render them.
//
// THE FOURTH INSTANCE OF ONE DEFECT, AND THE LAST ONE THAT WAS LEFT
// -----------------------------------------------------------------
// `BUILTIN_CARD_TAGS` (card-tags.ts), `CardComponentMap` (card-component-types.ts)
// and the tag map before it were each pulled out of a `.tsx` for the same reason,
// and each header says so. Read card-tags.ts first; this is the same problem one
// layer further out, and the reason it is worth a fourth file rather than a fourth
// exception is that these are the types a BACKEND names, which makes them the ones
// with the least business living under a Solid component.
//
// `tsconfig.mcp.json` is Node-only — `lib: ["ESNext"]`, no `jsx` — and a type import
// still has to RESOLVE even though it erases. While `ConfirmCardData` and friends
// lived in components/confirm-card.tsx, any Node/no-DOM project that named one got
//
//   error TS6142: Module '../../components/choice-card' was resolved to
//   '.../src/components/choice-card.tsx', but '--jsx' is not set.
//
// measured on this tree, and `@kitn.ai/ui/schemas` — the server-safe entry that
// exists precisely so a route can hand a model tool definitions — could not
// re-export them at all without dragging the Solid tree into that pass. So the one
// language the kit is AUTHORED in was the only one that could not name the contract
// it publishes: Python and Go read `./schemas/*.json` and get the full shape, while
// a TypeScript backend building a card envelope got `data: unknown`.
//
// Relaxing tsconfig.mcp.json is not the alternative, and that is measured rather
// than recalled: granting it `jsx: "preserve"` + `jsxImportSource: "solid-js"` takes
// it from 0 errors to 130 on this exact case (838 without the import source, and
// card-tags.ts records 1364 for the broader one), almost all `TS2304: Cannot find
// name 'HTMLDivElement' / 'window'`, because a `jsx` setting drags the whole Solid
// component tree into a Node-only pass. The Node/no-DOM boundary is load-bearing.
//
// WHY THEY ARE `type` ALIASES AND NOT `interface`S — DO NOT "TIDY" THIS BACK
// --------------------------------------------------------------------------
// This is the other half of the same story and it is not a style preference.
// TypeScript gives an object TYPE ALIAS an implicit index signature and gives an
// INTERFACE none. Measured, both directions, on a two-line file:
//
//   interface IFace { a: string }
//   type    TAlias = { a: string }
//   const r1: Record<string, unknown> = iface;  // TS2322: Index signature for type
//                                               // 'string' is missing in type 'IFace'
//   const r2: Record<string, unknown> = alias;  // OK
//
// Every card element's `data` prop is a `Record<string, unknown>` at some point in
// the chain — the generated `element-types.d.ts` used to declare it that way
// outright, and `renderType` in scripts/_ts-helpers.mjs still emits exactly that
// string as its cycle placeholder when it inlines a self-referential type (which
// `FormField` is). So as interfaces these types were not assignable to the very
// property each one's own doc comment tells a consumer to assign it to:
// `el.data = myChoiceCardData` was TS2322 while `<kai-choice>`'s JSDoc said "Import
// `ChoiceCardData` from `@kitn.ai/ui` for the full shape".
//
// Aliases fix that at the root instead of at each of the four call sites, and they
// are what makes `FormDefinition` work at all: it is self-referential, so the
// generator can only inline it down to a `Record<string, unknown>` placeholder, and
// an interface would fail against that placeholder no matter what the elements
// declare.
//
// Nothing here merges declarations, so the one capability `interface` has that
// `type` lacks is not in use.
//
// WHAT THIS FILE MAY CONTAIN
// --------------------------
// Types only, and only types with no DOM and no Solid below them. It must stay
// importable from a Node process with no `jsx`, which is the whole point; the
// discriminating check is `tsc --noEmit -p tsconfig.mcp.json` on a tree with no
// `dist/` present, and nothing else is evidence for it. `CardEnvelope` below comes
// from ./card-contract, which is already a `.ts` for the same reason.
//
// Each component re-exports its own types from here, so every existing importer of
// `components/confirm-card` etc. is unaffected, and `@kitn.ai/ui/schemas` exports
// them too so a backend route can finally name what it is building.

import type { CardEnvelope } from './card-contract';

// ─────────────────────────────────────────────────────────────────────────────
// confirm (confirm.schema.json)
// ─────────────────────────────────────────────────────────────────────────────

export type ConfirmActionStyle = 'primary' | 'default' | 'destructive';
export type ConfirmTone = 'default' | 'warning' | 'danger';

export type ConfirmAction = {
  id: string;
  label: string;
  style?: ConfirmActionStyle;
  payload?: unknown;
  default?: boolean;
};

export type ConfirmCardData = {
  heading?: string;
  body?: string;
  tone?: ConfirmTone;
  actions: ConfirmAction[]; // 1..4
  dismissible?: boolean;
};

export type ConfirmCardEnvelope = CardEnvelope<'confirm', ConfirmCardData>;

// ─────────────────────────────────────────────────────────────────────────────
// choice (choice.schema.json)
// ─────────────────────────────────────────────────────────────────────────────

export type ChoiceOptionMedia = {
  image?: string;
  imageAlt?: string;
  icon?: string;
};

export type ChoiceOption = {
  id: string; // required, unique within the card
  label: string; // required
  description?: string;
  media?: ChoiceOptionMedia;
  meta?: string; // trailing freeform text (e.g. price/badge)
  recommended?: boolean; // renders a "Recommended" pill
  disabled?: boolean; // not selectable; skipped in keyboard nav
  payload?: unknown; // echoed back in the emitted action
};

export type ChoiceAllowOther = boolean | { label?: string; placeholder?: string };

export type ChoiceCardData = {
  prompt?: string; // optional question/body above the options
  options: ChoiceOption[]; // 1..N
  allowOther?: ChoiceAllowOther; // free-text escape
  submitLabel?: string; // label for the Submit button (default 'Submit')
  dismissible?: boolean; // show a close affordance that emits `dismiss`
};

export type ChoiceCardEnvelope = CardEnvelope<'choice', ChoiceCardData>;

// ─────────────────────────────────────────────────────────────────────────────
// tasks (tasks.schema.json)
// ─────────────────────────────────────────────────────────────────────────────

export type TasksTask = {
  id: string;
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
};

export type TasksCardData = {
  /**
   * `select` (default) = checkbox rows + a confirm button that emits the contract
   * `submit`. `progress` = an onboarding/checklist look: a header `done / total`
   * count, circular indicators, per-item title + muted description, and NO confirm
   * button (checking a row is itself the terminal action). Both share the same
   * selection model (toggle by id, the `max` gate, `kai-value-change`); `progress`
   * is purely a presentational variant.
   */
  mode?: 'select' | 'progress';
  heading?: string;
  tasks: TasksTask[]; // >=1
  selectAll?: boolean;
  confirmLabel?: string;
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  dismissible?: boolean; // show a close affordance that emits `dismiss`
};

export type TasksCardResult = {
  selected: string[];
};

export type TasksCardEnvelope = CardEnvelope<'tasks', TasksCardData>;

// ─────────────────────────────────────────────────────────────────────────────
// form (form.schema.json)
// ─────────────────────────────────────────────────────────────────────────────

/** A field definition (the JSON Schema subset kai-form renders). */
export type FormField = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  format?: 'email' | 'uri' | 'url' | 'date' | 'date-time' | 'time';
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  items?: FormField | { enum: unknown[] };
  properties?: Record<string, FormField>;
  required?: string[];
  readOnly?: boolean;
  'x-kai-widget'?:
    | 'textarea'
    | 'slider'
    | 'rating'
    | 'radio'
    | 'select'
    | 'checkbox'
    | 'password'
    | 'switch';
  'x-kai-placeholder'?: string;
  'x-kai-step'?: number;
  /**
   * Display format for a string field. `tel` / `ssn` / `credit-card`
   * apply that type's standard mask and submit digits only; `custom` masks with
   * `x-kai-mask` and submits the formatted value.
   *
   * NOT the JSON Schema `format` keyword, and deliberately not an extension of it:
   * `format` has a registered vocabulary with assertion semantics, `widgetFor()`
   * already switches on it to pick a widget, and `toJsonSchema()` turns it into a
   * validation pattern. This is a UI hint, so it lives in the `x-kai-*` namespace
   * with the other UI hints — and it selects FORMATTING, never a widget.
   *
   * Typed as the semantic-type union for a consumer authoring a form definition by
   * hand. A value arriving from a MODEL is untrusted and may be anything at all;
   * `resolveFieldMask()` degrades an unrecognised one to an unmasked text field with
   * a console warning rather than trusting this declaration.
   *
   * SPELLED OUT HERE RATHER THAN IMPORTED, and that is not laziness. `FieldSemanticType`
   * is declared in `./field-semantics`, which carries the semantics TABLE and its
   * `console.warn` — and this file's whole reason for existing is that a Node/no-DOM
   * backend can name a card payload with `lib: ["ESNext"]` and `types: []`, where
   * `console` does not exist (measured: TS2584, by
   * `tests/schemas/card-data-types-node-safe.test.ts`, which is what caught the import).
   * A type import still has to RESOLVE, so importing the union would drag the engine into
   * the server-safe entry's graph.
   *
   * AN APP CANNOT PIN THIS ON THE MODEL TODAY.
   * `cardTools({ require })` narrows a projected tool schema by dot-path, but there is
   * no path that reaches a form FIELD: a form card's payload is itself a JSON Schema, so
   * `form.schema.json` describes `properties` as a map of field definitions rather than
   * as a node per field, and `require: { form: [{ path: 'properties.ticketId' }] }` is a
   * TypeError naming a path that does not resolve. "Force the model to mask the ticket
   * field" is therefore not expressible; the enum above is what makes it LIKELY, and an
   * app that needs a guarantee validates the arriving envelope itself.
   *
   * It is therefore a REGISTERED COPY of `FIELD_SEMANTIC_TYPES`: the two are pinned
   * mutually assignable at compile time in
   * `tests/components/form-field-formats.test.tsx`, so adding a fifth token to the enum
   * without adding it here fails `nx typecheck ui` rather than shipping a form card that
   * cannot name it.
   */
  'x-kai-format'?: 'tel' | 'ssn' | 'credit-card' | 'custom';
  /** The mask pattern, read only when `x-kai-format` is `custom`: `#` a digit, `@` an
   *  alphanumeric, `*` an obscurable alphanumeric, everything else a literal
   *  (`CHG-####`). Capped at the mask engine's own limit; a longer one is refused. */
  'x-kai-mask'?: string;
  /** Placeholder text for the mask's unfilled positions, aligned character for
   *  character with the pattern (`mm/dd/yyyy`). Derived from the pattern when absent;
   *  a misaligned one is dropped, loudly, and the mask survives. */
  'x-kai-mask-guide'?: string;
};

/** The form definition = CardEnvelope.data for type:'form'. */
export type FormDefinition = {
  type: 'object';
  title?: string;
  description?: string;
  required?: string[];
  properties: Record<string, FormField>;
  'x-kai-order'?: string[];
  'x-kai-inlineMax'?: number;
  'x-kai-submitLabel'?: string;
  'x-kai-dismissible'?: boolean;
  'x-kai-actions'?: { id: string; label: string; variant?: 'default' | 'ghost' | 'outline' }[];
};

export type FormCardEnvelope = CardEnvelope<'form', FormDefinition>;

// ─────────────────────────────────────────────────────────────────────────────
// artifact (artifact.schema.json)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One file behind an artifact card: the Code tab's tree row, plus where the
 * preview loads it.
 *
 * The SAME declaration the `FileTree` primitive uses — `components/file-tree.tsx`
 * re-exports this as `FileTreeFile` and `components/artifact.tsx` aliases that to
 * `ArtifactFile`, so there is one shape here and not a copy of one. It is authored
 * in this file rather than in file-tree.tsx for this module's whole reason: it is
 * reachable from `ArtifactCardData`, so leaving it in a `.tsx` would put TS6142
 * back on any Node/no-DOM project that names an artifact card payload, and the
 * extraction would have moved four of five types and quietly failed on the fifth.
 * It mirrors `artifact.schema.json`'s `files[].items`, which carries the same
 * fields with `additionalProperties: false`.
 */
export type ArtifactCardFile = {
  /** Tree label/key. Folders are built from `/`-delimited segments. */
  path: string;
  /** Where the preview loads it (CDN/S3/dev-server/API). */
  url?: string;
  /** Source for the Code tab. */
  code?: string;
  /** Language id for syntax highlighting (e.g. `html`, `css`, `tsx`). */
  language?: string;
  /** Kind — drives the icon + whether Code applies. */
  type?: 'html' | 'pdf' | 'image' | 'other';
  /** Lines added vs the base. Rendered as a trailing `+N` stat (success hue,
   *  tabular-nums). Only shown when present; omit for a plain file row. */
  additions?: number;
  /** Lines removed vs the base. Rendered as a trailing `-N` stat (error hue). */
  deletions?: number;
  /** Change status vs the base. Drives a small trailing status letter in the
   *  conventional VCS hue (added=green, modified=amber, deleted=red,
   *  renamed=blue, untracked=muted). Only shown when present. */
  status?: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
};

/** Which view an artifact card opens on. */
export type ArtifactCardTab = 'preview' | 'code';

/** The `artifact` card payload: a deliberately NARROW subset of `ArtifactProps`.
 *
 *  A card envelope is written by a model, so the surface it can reach has to be
 *  the part that describes WHAT to show, not how the viewer behaves. Toolbar
 *  composition (`showNav`/`showTabs`/…), view-state (`maximized`), the iframe
 *  `sandbox` and the imperative `controllerRef` are all host concerns and stay
 *  off the wire — a model must not be able to widen its own sandbox or hide the
 *  chrome the user needs to inspect what it built. */
export type ArtifactCardData = {
  /** URL the preview iframe frames. */
  src?: string;
  /** Files for the Code tab's tree (+ each file's preview `url`). */
  files?: ArtifactCardFile[];
  /** Which view the card OPENS on: `preview` (default) or `code`.
   *
   *  Seed only, and deliberately so. This card exists to be revised — `addCard`
   *  upserts on `envelope.id` — and a revision hands the same live component a
   *  new envelope. Were this wired to `Artifact`'s CONTROLLED `tab` prop, every
   *  revision would re-assert it and yank a user who had switched views back to
   *  the model's choice. A model cannot move the user between tabs after the
   *  first render; the user's choice wins. */
  tab?: ArtifactCardTab;
  /** Path of the file selected in the tree when the card first renders.
   *
   *  Seed only, for the same reason as `tab`, but achieved differently:
   *  `Artifact` has a `defaultTab` prop to seed the tab and no `defaultActiveFile`
   *  counterpart, so this is read ONCE via `untrack` at setup and handed over as
   *  a static value. That leaves `Artifact`'s unconditional
   *  `createEffect(() => setActiveFile(local.activeFile))` with nothing reactive
   *  to track, so it runs once instead of resetting the user's selection on
   *  every revision. Keep it static — passing `props.data.activeFile` straight
   *  through would silently restore that bug. */
  activeFile?: string;
  /** Friendly address shown INSTEAD of the real url. Use when `src` is not
   *  consumer-facing (e.g. a `data:` blob) so a clean address is shown. */
  displayUrl?: string;
  /** Frame height. A bare number is px; a string is any CSS length. Defaults to
   *  `DEFAULT_ARTIFACT_CARD_HEIGHT` — see the note on ArtifactCard. */
  height?: number | string;
};

export type ArtifactCardEnvelope = CardEnvelope<'artifact', ArtifactCardData>;
