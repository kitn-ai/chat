// Emits src/elements/element-types.d.ts — typed element interfaces + an
// HTMLElementTagNameMap augmentation — from the extracted element metadata.
// Wired as the `./elements` types entry so consumers get typed
// document.querySelector('kai-message') + prop autocomplete.

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Self-contained inline type declarations for the runtime-adjacent exports of the
// `./elements` subpath. These mirror the source types in ./chat-types,
// ../components/tool-types, ../components/attachment-types, ../primitives/card-contract
// and ../primitives/highlighter, but are INLINED here so the shipped .d.ts has NO
// relative import that would resolve a library .ts SOURCE file into a consumer's
// type graph (tsc compiles a .ts reached from a .d.ts even under skipLibCheck —
// the root cause of LIB-2).
//
// ★ These are NOT free-form prose: `src/elements/inline-element-types.test.ts` compiles
// this block against the real source types and fails on ANY structural drift in
// ChatMessage. Edit the source types, then re-run that test — do not hand-patch one
// side and assume the other followed.
export const INLINE_ELEMENT_TYPES = `// --- Inlined from src/elements/chat-types.ts + the types it references
//     (kept self-contained: no source imports) ---
export type ChatMessageAction = 'copy' | 'like' | 'dislike' | 'regenerate' | 'edit';

/** A like/dislike feedback vote on an assistant message. */
export type FeedbackVote = 'like' | 'dislike';

/** A host-defined action button. \`icon\` is a curated registry name; unknown/absent
 *  icons render label-only. */
export interface CustomAction {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
}

/** The speaker avatar for a message row. */
export interface AvatarData {
  src?: string;
  fallback?: string;
  alt?: string;
}

/** The untranslated provider payload a part was normalized from. Optional in the
 *  type but REQUIRED in practice for round-trip fidelity (Anthropic rejects
 *  reconstructed \`thinking\` blocks — send \`raw.payload\` back verbatim). */
export interface RawOrigin {
  /** Tagged origin, e.g. 'anthropic.content_block', 'openai.delta', \`custom.\${string}\`. */
  source: string;
  payload: unknown;
}

/** Semantic classification of a tool call, used to pick a rendering. */
export type ToolKind = 'command' | 'file-change' | 'search' | 'fetch' | 'mcp' | 'image' | 'generic';

/** A tool-call part rendered by <kai-tool>. */
export interface ToolPart {
  /** The tool name exactly as the provider reported it. */
  type: string;
  /** Semantic classification for rendering. Derive with \`classifyTool(type)\`. */
  kind?: ToolKind;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  /** Last VALID parsed snapshot, fingerprint-deduped. The primary channel. */
  input?: Record<string, unknown>;
  /** Raw accumulated argument fragments, for character-level streaming. */
  rawInput?: string;
  output?: Record<string, unknown>;
  toolCallId?: string;
  errorText?: string;
  raw?: RawOrigin;
}

/** A message attachment descriptor. */
export interface AttachmentData {
  id: string;
  type: 'file' | 'source-document';
  filename?: string;
  mediaType?: string;
  url?: string;
  title?: string;
}

/** A citation the model produced (the payload of a \`source\` part). */
export interface MessageSource {
  id?: string;
  url?: string;
  title?: string;
  snippet?: string;
  /** Citation marker number, when the model numbers its citations. */
  index?: number;
}

/** How a card was resolved by the user. */
export type CardResolution =
  | { kind: 'action'; action: string; payload?: unknown; at?: string }
  | { kind: 'submit'; data: unknown; at?: string }
  | { kind: 'dismissed'; at?: string }
  | { kind: 'expired'; reason?: string; at?: string };

/** A card the agent/server asks the chat to render. */
export interface CardEnvelope<TType extends string = string, TData = unknown> {
  type: TType;
  id: string;
  data: TData;
  title?: string;
  resolution?: CardResolution;
}

/** One ordered piece of message content. Closed union: extension happens at the
 *  CARD layer via the card registry, not by adding variants here. */
export type MessagePart =
  | { type: 'text'; text: string; raw?: RawOrigin }
  | {
      type: 'reasoning';
      text: string;
      label?: string;
      /** Provider block index. Keeps parallel reasoning blocks distinct. */
      index?: number;
      /** Informational only. \`raw\` is the round-trip channel, not this. */
      signature?: string;
      raw?: RawOrigin;
    }
  | { type: 'tool'; tool: ToolPart; raw?: RawOrigin }
  | { type: 'card'; envelope: CardEnvelope; raw?: RawOrigin }
  | { type: 'source'; source: MessageSource; raw?: RawOrigin }
  | { type: 'file'; attachment: AttachmentData; raw?: RawOrigin };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** The ONLY content channel. Ordered. The \`content\` string was removed in 0.20.0. */
  parts: MessagePart[];
  /** Action buttons under the message. Chrome, not content. */
  actions?: (ChatMessageAction | CustomAction)[];
  /** Optional speaker avatar shown to the left of the message column. */
  avatar?: AvatarData;
  /** Controlled feedback vote; wins over the facade's optimistic state. */
  feedback?: FeedbackVote;
}

// --- Inlined from src/primitives/highlighter.ts ---
export interface CodeHighlightingOptions {
  enabled?: boolean;
  languages?: Record<string, () => Promise<unknown>>;
  themes?: Record<string, () => Promise<unknown>>;
  aliases?: Record<string, string>;
}

// Runtime values live in the compiled \`default\` (dist/kai.es.js); we only
// DECLARE their signatures here so the .d.ts pulls no source.
export declare function configureCodeHighlighting(options: CodeHighlightingOptions): void;
export declare function isCodeHighlightingEnabled(): boolean;

/** Classify a tool call by its provider-chosen NAME. Total, deterministic and
 *  side-effect free; ALWAYS terminates in \`'generic'\`, so an unrecognized tool
 *  still renders a panel instead of a blank. This is the same classifier
 *  \`upsertToolPart\` applies, so deriving \`ToolPart.kind\` with it cannot drift
 *  from the kit's own rendering. */
export declare function classifyTool(name: string): ToolKind;

/** Resolves once the kai-* elements are registered (browser); inert on the server. */
export declare const elementsReady: Promise<unknown>;`;

// Imperative toast API surface — mirrors src/primitives/toast-store.ts (the `toast`
// callable + `configureToasts` + the re-exported Toast* types from
// src/elements/register.ts). INLINED here (helper unions inlined, no source imports)
// so the shipped .d.ts pulls no Solid source. Keep in sync with toast-store.ts.
const TOAST_TYPES = `// --- Inlined from src/primitives/toast-store.ts (kept self-contained: no source imports) ---
export type ToastVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface ToastConfig {
  stack?: 'expanded' | 'collapsed';
  position?: 'top-center' | 'top-right' | 'top-left' | 'bottom-center' | 'bottom-right' | 'bottom-left';
  max?: number;
  /** Default appearance for imperatively-raised toasts. Defaults to \`'pill'\`. */
  appearance?: 'pill' | 'card';
  /** Default high-contrast inverse treatment. Defaults to \`false\`. */
  inverse?: boolean;
}

/** An action button rendered inside the toast. Returning \`false\` from \`onAction\`
 *  keeps the toast open; any other return value dismisses it. */
export interface ToastAction {
  label: string;
  onAction: () => void | false;
}

export interface ToastItem {
  id: string;
  message: string;
  variant?: ToastVariant;
  /** Visual treatment: \`'pill'\` (default) or \`'card'\`. */
  appearance?: 'pill' | 'card';
  /** High-contrast inverse surface. Defaults to \`false\`. */
  inverse?: boolean;
  /** Secondary line shown below the message in the \`'card'\` appearance. */
  description?: string;
  action?: ToastAction;
  /** Auto-dismiss delay in ms. \`0\` = sticky. */
  duration?: number;
  /** Whether the close affordance is shown. Defaults to \`true\`. */
  dismissible?: boolean;
  /** Container to scope this toast within instead of the viewport. */
  target?: HTMLElement;
}

/** Options accepted by \`toast()\` — everything but the message. */
export interface ToastOptions {
  id?: string;
  variant?: ToastVariant;
  appearance?: 'pill' | 'card';
  inverse?: boolean;
  description?: string;
  action?: ToastAction;
  duration?: number;
  dismissible?: boolean;
  target?: HTMLElement;
}

/** Handle returned from \`toast()\` for imperative control. */
export interface ToastHandle {
  id: string;
  dismiss: () => void;
  update: (patch: Partial<Omit<ToastItem, 'id'>>) => void;
}

// Runtime values live in the compiled \`default\` (dist/kai.es.js); we only
// DECLARE their signatures here so the .d.ts pulls no source.
/** Raise a transient toast. \`toast('Saved')\`, \`toast.success('Copied')\`,
 *  \`toast.dismiss(id)\`. Returns a \`{ id, dismiss, update }\` handle. */
export declare const toast: {
  (message: string, opts?: ToastOptions): ToastHandle;
  /** Raise a success (green check) toast. */
  success: (message: string, opts?: ToastOptions) => ToastHandle;
  /** Raise a warning (amber) toast. */
  warning: (message: string, opts?: ToastOptions) => ToastHandle;
  /** Raise an error (destructive/red) toast. */
  error: (message: string, opts?: ToastOptions) => ToastHandle;
  /** Raise an info (blue) toast. */
  info: (message: string, opts?: ToastOptions) => ToastHandle;
  /** Dismiss a toast by id. */
  dismiss: (id: string) => void;
  /** Dismiss every active toast. */
  clear: () => void;
};
/** Configure the imperative \`toast()\` singleton — call once at app start. */
export declare function configureToasts(config: ToastConfig): void;`;

const clean = (type, optional) => {
  let t = type
    .replace(/\bUint8Array<ArrayBufferLike>/g, 'Uint8Array')
    .replace(/\bfalse \| true\b/g, 'boolean')
    .replace(/\btrue \| false\b/g, 'boolean');
  if (optional) t = t.replace(/undefined \| /g, '').replace(/ \| undefined/g, '');
  return t.trim();
};

export function writeTypes(root, elements, _toAttr, IMPORTS, { domMembers = new Set() } = {}) {
  // which exported kit types are actually referenced → import only those
  const used = new Set();
  const scan = (s) => { for (const n of Object.keys(IMPORTS)) if (new RegExp(`\\b${n}\\b`).test(s)) used.add(n); };
  for (const el of elements) {
    for (const p of el.props) scan(p.type);
    for (const e of el.events) if (e.detail) scan(e.detail);
  }
  const bySource = {};
  for (const n of used) (bySource[IMPORTS[n]] ??= []).push(n);
  const importLines = Object.entries(bySource)
    .map(([src, names]) => `import type { ${names.sort().join(', ')} } from '${src}';`)
    .join('\n');

  // The declared (non-DOM) member list for one element. Shared by the
  // HTMLElement interfaces below and the Vue GlobalComponents props interfaces,
  // so the two can never disagree about WHICH props a kai-* element accepts.
  //
  // `domSafe` is the one axis on which the two copies differ, and only for a prop
  // whose NAME re-declares a member HTMLElement already has (today: kai-confirm's
  // `autofocus`, kai-message's `role`, kai-resizable-item's `hidden` — the set is
  // computed from the checker in gen-element-api.mjs, never hand-listed). An
  // interface that `extends HTMLElement` may only narrow such a member, and
  // `foo?: T` widens it to `T | undefined`:
  //   - `autofocus?: boolean`   vs HTMLElement's `autofocus: boolean`   → TS2430
  //   - `hidden?: boolean`      vs HTMLElement's `hidden: boolean`      → TS2430
  //   - `role?: 'user'|…`       vs Element's    `role: string | null`   → TS2430,
  //     and because `role` is declared by *Element*, lib.dom's own
  //     `HTMLElementTagNameMap[K] extends Element` constraint then fails too
  //     (2 × TS2344 raised inside lib.dom.d.ts).
  // Those 5 errors are invisible under `skipLibCheck: true` and land on any
  // consumer who turns it off. So in the ELEMENT interfaces a colliding prop is
  // emitted required, with `undefined` stripped — which is also what the runtime
  // does: `defineWebComponent` registers every prop with a default, so the
  // property always exists on an upgraded element. The Vue props interfaces below
  // don't extend HTMLElement and keep the prop optional (a Vue template legitimately
  // omits it). Guarded by tests/elements/element-types-lib-check.test.ts, which
  // compiles this file with `skipLibCheck: false`.
  //
  // `defaulted` generalises that same runtime fact to a second case. PASSING a
  // prop and READING one back are different contracts, and only the element
  // interfaces are the read side:
  //   - KaiChatElementProps (Vue, and the React wrapper in gen-element-react.mjs)
  //     is what a consumer CONSTRUCTS with. `messages` there is optional, because
  //     the element supplies `[]` — that is the whole point of the widening.
  //   - KaiChatElement is what `document.querySelector` hands back. The element
  //     registered a non-`undefined` default, and the React wrapper skips
  //     undefined props (frameworks/react/runtime.tsx: `p[name] !== undefined`),
  //     so nothing in the supported surface ever puts `undefined` there. Typing
  //     the READ as possibly-undefined taxes every consumer who reads a property
  //     back — `chat.messages = fn(chat.messages)`, `[...chat.toasts, next]`,
  //     `KaiChatElement['messages'][number]` — which is precisely the vanilla-TS
  //     pattern the MCP scaffolder emits (54 of its cells stopped compiling when
  //     these went optional on both sides).
  // Scoped to NON-scalar props so it only covers the array/object properties that
  // get read back and spread; scalars are attributes and read as strings anyway.
  // A prop whose registered default IS `undefined` (e.g. kai-thread's `messages`)
  // is untouched and stays optional on both sides, which is correct: there the
  // read really can yield undefined.
  // Guarded by tests/elements/element-prop-read-write-split.test.ts.
  //
  // `theme` used to be hand-written here as the first two lines. It now arrives in
  // el.props like every other prop, read off define.tsx's injected defaults by
  // gen-element-api.mjs, so there is one declaration instead of three copies.
  const propBody = (el, domSafe = false) => [
    ...el.props.flatMap((p) => {
      const collides = domSafe && domMembers.has(p.name);
      const defaulted = domSafe && p.default !== undefined && !p.scalar;
      const forceRequired = collides || defaulted;
      // One JSDoc block per member — a second one would shadow the first.
      const note = collides
        ? `Re-declares the DOM member \`HTMLElement.${p.name}\`, so it is NOT optional here: an interface extending HTMLElement may only narrow it, and the element always carries a value for it.`
        : '';
      const doc = [p.description, note].filter(Boolean).join(' ');
      return [
        ...(doc ? [`  /** ${doc} */`] : []),
        `  ${p.name}${p.optional && !forceRequired ? '?' : ''}: ${clean(p.type, p.optional)};`,
      ];
    }),
  ].join('\n');

  const interfaces = elements
    .map((el) => `export interface ${el.className} extends HTMLElement {\n${propBody(el, true)}\n}`)
    .join('\n\n');

  const tagMap = elements.map((el) => `    '${el.tag}': ${el.className};`).join('\n');

  const banner = `// AUTO-GENERATED by scripts/gen-element-api.mjs — do not edit by hand.
// Typed custom-element interfaces + HTMLElementTagNameMap augmentation, so
// \`document.querySelector('kai-message')\` is typed and gets prop autocomplete.
// Also augments React's JSX.IntrinsicElements (see below) so a raw <kai-chat>
// written directly in TSX type-checks.`;

  const tagMapBlock = `declare global {
  interface HTMLElementTagNameMap {
${tagMap}
  }
}`;

  // A raw `<kai-chat>` (or any other kai-*) written directly in TSX, bypassing the
  // @kitn.ai/ui/react wrappers, is documented usage (see the React framework guide's
  // "Raw web component usage" section) but without this, tsc rejects the tag with
  // "Property 'kai-chat' does not exist on type 'JSX.IntrinsicElements'". This
  // augmentation is deliberately GENERIC, not per-element: array/object props
  // (messages, suggestions, ...) are set as JS properties via a ref, never as JSX
  // attributes (the kai- contract — see CLAUDE.md), so typing them here would invite
  // `<kai-chat messages={messages} />`, which React serializes to a stringified
  // attribute instead of setting the property (unless the element defines that
  // property at construction time) — silently wrong. Only scalar props (theme,
  // placeholder, loading, ...) reflect safely as attributes, and the index signature
  // below already accepts those, so nothing per-element is generated — only the tag
  // list, mechanically derived from the same `elements` registry as the
  // HTMLElementTagNameMap block above.
  //
  // No reference to React's own types (HTMLAttributes, DetailedHTMLProps, ...): this
  // file loads for every framework via `import '@kitn.ai/ui/elements'`, so referencing
  // an identifier that only exists when 'react' is installed would break non-React
  // consumers. Verified empirically: `declare module 'react' { ... }` merges cleanly
  // when 'react' IS present, and is inert (no error) when it is not.
  const jsxTagMap = elements.map((el) => `      '${el.tag}': KaiElementJsxProps;`).join('\n');

  const jsxIntrinsicBlock = `interface KaiElementJsxProps {
  id?: string;
  class?: string;
  className?: string;
  style?: Record<string, string | number> | string;
  slot?: string;
  part?: string;
  children?: unknown;
  ref?: unknown;
  [attr: string]: unknown;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
${jsxTagMap}
    }
  }
}`;

  // Vue resolves a template tag against `GlobalComponents` FIRST and only then
  // falls through to @vue/runtime-dom's JSX IntrinsicElements — which carries a
  // `[name: string]: any` index signature. So an unregistered `<kai-chat>` types
  // as `any` and vue-tsc silently checks NOTHING: a consumer-regression round
  // proved a `boolean`-prop-bound-to-`string` positive control compiling with zero
  // errors, and the removed 0.19 `ChatMessage.content` shape passing straight
  // through to the runtime messages guard, which drops it. React consumers got a
  // real error for the same mistake (the JSX block above); Vue consumers got
  // nothing. This block closes that gap.
  //
  // Shape notes, all established empirically against vue-tsc (see
  // src/elements/vue-global-components.test.ts for the drift guard):
  //  - Volar looks the tag up under BOTH the raw kebab name and its PascalCase
  //    form, depending on `vueCompilerOptions.strictTemplates`, so both keys are
  //    emitted.
  //  - Event handlers land on a camelized, prefix-KEEPING key: `@kai-submit` →
  //    `onKaiSubmit` (unlike the React wrappers, which strip the `kai-` prefix).
  //  - Props are wrapped in `Partial<>`: the kai- contract lets a consumer set any
  //    prop imperatively through a ref, so flagging an "absent required prop" in a
  //    template would be a false positive.
  //  - `KaiElementVueProps`'s index signature keeps arbitrary attributes and
  //    handlers legal (id, data-*, aria-*, v-*), which matters under
  //    strictTemplates. An explicitly declared prop still wins over the index
  //    signature, so the type check above is unaffected — that is exactly what the
  //    positive control pins down.
  //
  // Declared locally, with no reference to any identifier that only exists inside
  // the real 'vue' module — same constraint as the React block, since this file
  // loads for every framework via `import '@kitn.ai/ui/elements'`.
  const pascal = (s) => s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const vueEventKey = (ev) => `on${pascal(ev)}`;

  const vuePropsInterfaces = elements
    .map((el) => `export interface ${el.className}Props {\n${propBody(el)}\n}`)
    .join('\n\n');

  const vueEventInterfaces = elements
    .map((el) => {
      const body = el.events.flatMap((e) => [
        ...(e.description ? [`  /** ${e.description} */`] : []),
        `  ${vueEventKey(e.name)}?: (event: CustomEvent${e.detail ? `<${clean(e.detail, false)}>` : ''}) => void;`,
      ]);
      return `export interface ${el.className}Events {\n${body.join('\n')}\n}`;
    })
    .join('\n\n');

  const vueTagMap = elements
    .flatMap((el) => {
      const t = `KaiVueElement<${el.className}Props, ${el.className}Events>`;
      return [`    '${el.tag}': ${t};`, `    ${pascal(el.tag)}: ${t};`];
    })
    .join('\n');

  const vueBlock = `/** Attributes every kai-* element tolerates in a Vue template on top of its own
 *  props: \`id\`, \`data-*\`, \`aria-*\`, directives. The index signature keeps those
 *  legal under \`strictTemplates\` WITHOUT weakening the declared props — an
 *  explicit member always wins over an index signature. */
export interface KaiElementVueProps {
  [attr: string]: unknown;
}

/** A kai-* custom element as Vue's template type-checker sees it. Props are
 *  \`Partial\` because the kai- contract allows setting any of them imperatively
 *  through a ref instead of in the template. */
export type KaiVueElement<Props, Events> = new () => {
  $props: Partial<Props> & Events & KaiElementVueProps;
};

declare module 'vue' {
  interface GlobalComponents {
${vueTagMap}
  }
}`;

  // SOURCE copy (src/elements/element-types.d.ts): used internally + by the
  // elements/provider builds. Keeps type-only relative re-exports (fine — the
  // library's own tsconfig resolves them; they are erased at emit). The value
  // re-export is replaced with a declaration so even this copy pulls no Solid
  // source at the value level.
  const srcOut = `${banner}
${importLines}

// Local bindings for the two names the DECLARATIONS below reference
// (\`configureCodeHighlighting(options: CodeHighlightingOptions)\`, \`classifyTool(): ToolKind\`).
// \`export type { X } from '…'\` re-exports X without binding it in this file's scope,
// so without these imports both signatures are TS2304 — invisible under
// \`skipLibCheck: true\`, which is exactly why this file is now compiled with it off
// (tests/elements/element-types-lib-check.test.ts).
import type { CodeHighlightingOptions } from '../primitives/highlighter';
import type { ToolKind } from '../components/tool-classify';

// Re-exports for \`import { … } from '@kitn.ai/ui/elements'\`. Mirrors the names the
// shipped dist/elements.d.ts inlines, so both copies expose the same surface.
export type {
  AvatarData,
  ChatMessage,
  ChatMessageAction,
  CustomAction,
  FeedbackVote,
  MessagePart,
  MessageSource,
  RawOrigin,
} from './chat-types';
export type { ToolPart } from '../components/tool-types';
export type { ToolKind } from '../components/tool-classify';
export type { AttachmentData } from '../components/attachment-types';
export type { CardEnvelope, CardResolution } from '../primitives/card-contract';
export type { CodeHighlightingOptions } from '../primitives/highlighter';
export declare function configureCodeHighlighting(options: CodeHighlightingOptions): void;
export declare function isCodeHighlightingEnabled(): boolean;

/** Classify a tool call by its provider-chosen NAME. Total, deterministic and
 *  side-effect free; ALWAYS terminates in \`'generic'\`. Named by ToolPart.kind's
 *  doc comment, so it must stay reachable from this entry. */
export declare function classifyTool(name: string): ToolKind;

/** Resolves once the kai-* elements are registered (browser); inert on the server. */
export declare const elementsReady: Promise<unknown>;

${TOAST_TYPES}

${interfaces}

${tagMapBlock}

${jsxIntrinsicBlock}

${vuePropsInterfaces}

${vueEventInterfaces}

${vueBlock}
`;
  writeFileSync(resolve(root, 'src/elements/element-types.d.ts'), srcOut);
  console.log(`✓ src/elements/element-types.d.ts — ${elements.length} elements`);

  // SHIPPED copy (dist/elements.d.ts): the published \`./elements\` "types" entry.
  // FULLY SELF-CONTAINED — no relative imports, so a consumer's tsc never
  // resolves a library .ts SOURCE file through it (the LIB-2 fix). The element
  // interfaces are already inlined; only the chat-types/highlighter re-exports
  // needed inlining (INLINE_ELEMENT_TYPES above).
  const distOut = `${banner}
// SELF-CONTAINED — no relative imports (so no library source is ever resolved
// from a consumer's tsc). See scripts/gen-element-types.mjs.

${INLINE_ELEMENT_TYPES}

${TOAST_TYPES}

${interfaces}

${tagMapBlock}

${jsxIntrinsicBlock}

${vuePropsInterfaces}

${vueEventInterfaces}

${vueBlock}
`;
  const distDir = resolve(root, 'dist');
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
  writeFileSync(resolve(distDir, 'elements.d.ts'), distOut);
  console.log(`✓ dist/elements.d.ts — ${elements.length} elements (self-contained)`);
}
