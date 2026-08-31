/**
 * The construct format, v1 — Zod is the SINGLE SOURCE OF TRUTH.
 *
 * The published JSON Schema (apps/docs/public/schemas/construct/v1.json) and the
 * checked-in construct.v1.schema.json are DERIVED from this object by
 * scripts/gen-construct-schema.mjs (build:api, drift-guarded). Never edit those
 * by hand; never restate an enum from here anywhere else — read it off
 * `ConstructSchema.shape` or the generated artifact.
 *
 * Format rules (spec, binding): vocabulary never logic — no handlers, no
 * expressions; `.strict()` everywhere so an unknown key is a loud rejection,
 * not a silently ignored one. No secrets, no client: `provider` can name a URL
 * and a wire format, nothing else.
 */
import { z } from 'zod';
// REPO-INTERNAL ONLY: isSafeUrl is not reachable from the published package
// (see agent-tooling/catalog/invariants.ts's own note on this), so the
// emitted App.tsx cannot import it — the sink codegen writes to
// (launcherIcon -> <img src>) has no guard it can reach at runtime. Enforcing
// the SAME policy here, at authoring time, is the reachable equivalent: a
// hostile launcherIcon is rejected before a construct ever validates, so
// codegen never has an unsafe value to emit. Reuses the kit's one existing
// URL-sink policy (markdown.tsx's image renderer, artifact.tsx) rather than
// authoring a second one. Imported from url-scheme-policy.ts, NOT
// card-routing.ts: this file compiles under tsconfig.mcp.json's Node-only, no-
// DOM-lib pass (transitively, via mcp/tools/construct.ts), and card-routing.ts
// pulls in HTMLElement/window/CustomEvent that pass can't see.
import { isSafeUrl } from '../../primitives/url-scheme-policy';
import { CHAT_MESSAGE_ACTIONS } from '../../elements/chat-actions';
import { BUTTON_VARIANT_NAMES } from '../../ui/button-variant-names';
import { KNOWN_THEME_TOKENS, themeTokenValueProblem } from './theme-token-policy';

export { CONSTRUCT_SCHEMA_URL } from './schema-url';

/** A valid custom-element tag: lowercase, starts with a letter, contains a hyphen. */
const TAG_RE = /^[a-z][a-z0-9]*-[a-z0-9-]+$/;

/** One composer trigger menu entry — the kit's own TriggerItem
 *  (components/composer.tsx) narrowed to its pure display fields (B-5):
 *  `promptText`/`data`/`kind`/`icon`/`group` stay kit-side. All three are
 *  construct-authored untrusted text, JSON.stringify'd at their one emit
 *  site (the whole triggers array is stringified in one go). */
const TriggerEntrySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1).optional(),
  })
  .strict();

/** One `--kai-*` name → value map inside `theme.tokens`. Keys and values are
 *  both checked in ThemeTokensSchema's superRefine below — a zod record's key
 *  schema can't carry the allow-list message we want (naming the exact knob
 *  that isn't vocabulary, the same voice as validateConstruct's
 *  unrecognized-key handling). */
const TokenRecordSchema = z.record(z.string(), z.string());

/** Full theme-palette persistence (the builder's embedded ThemeStudio posts
 *  exactly this shape — its `ThemePayload`, src/theme-studio-app/
 *  ThemeStudio.tsx, minus the message `type`). Every part of that payload is
 *  persisted here: `light` carries the light colors PLUS the root-scope knobs
 *  the studio rides along in it (`--kai-text-*` rungs, `--kai-tracking`,
 *  `--kai-shadow-color`); `dark` carries the dark colors; `radius` is the
 *  `--kai-radius` value (e.g. "0.6rem"); `fonts` the two `--kai-font-*`
 *  knobs. Nothing in the payload is silently dropped.
 *
 *  Key names MUST be knobs the kit really declares (KNOWN_THEME_TOKENS —
 *  derived, never hand-typed; see theme-token-policy.ts) — an unknown key is
 *  rejected loudly, naming it. `dark` keys are additionally restricted to
 *  `--kai-color-*`: only the color knobs have a `.dark`-scope re-resolution
 *  in theme.css, so a non-color knob under `dark` would silently theme
 *  nothing — rejected instead (decide loudly). `fonts` keys must be
 *  `--kai-font-*` for the same reason in reverse.
 *
 *  Values pass themeTokenValueProblem (theme-token-policy.ts): light values
 *  only ever ride setProperty (opaque, injection-proof), but dark values land
 *  in generated CSS TEXT, so every value gets the same conservative charset
 *  bound at this doorway. */
const ThemeTokensSchema = z
  .object({
    /** Light-mode `--kai-*` overrides (+ the studio's root-scope knobs). Set
     *  on the HOST via setProperty in the emitted facade. NOTE: with no
     *  paired `dark` entry a light value applies in BOTH modes — the same
     *  one-knob-both-modes semantics a consumer gets setting `--kai-*` on
     *  `:root` (theme.css's `.dark` block re-reads the same knob names). */
    light: TokenRecordSchema.optional(),
    /** Dark-mode `--kai-color-*` overrides. Emitted as a `.dark { }` rule in
     *  the shadow `<style>` (see codegen.ts's emitElement for the mechanism). */
    dark: TokenRecordSchema.optional(),
    /** The `--kai-radius` value, e.g. "0.6rem". */
    radius: z.string().min(1).optional(),
    /** The font knobs: `--kai-font-base` / `--kai-font-code`. */
    fonts: TokenRecordSchema.optional(),
  })
  .strict()
  .superRefine((tokens, ctx) => {
    const checkRecord = (
      record: Record<string, string> | undefined,
      field: 'light' | 'dark' | 'fonts',
      keyRule?: { prefix: string; reason: string },
    ) => {
      for (const [name, value] of Object.entries(record ?? {})) {
        if (!KNOWN_THEME_TOKENS.has(name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field, name],
            message: `"${name}" is not a --kai-* knob the kit declares — see the theming guide for the token list`,
          });
        } else if (keyRule && !name.startsWith(keyRule.prefix)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field, name],
            message: `"${name}" is not valid under "${field}" — ${keyRule.reason}`,
          });
        }
        const problem = themeTokenValueProblem(value);
        if (problem) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field, name],
            message: `value ${problem}`,
          });
        }
      }
    };
    checkRecord(tokens.light, 'light');
    checkRecord(tokens.dark, 'dark', {
      prefix: '--kai-color-',
      reason:
        'only --kai-color-* knobs have a dark-scope re-resolution in theme.css; a mode-less knob belongs in "light" (it applies in both modes)',
    });
    checkRecord(tokens.fonts, 'fonts', {
      prefix: '--kai-font-',
      reason: 'only --kai-font-* knobs belong here',
    });
    if (tokens.radius !== undefined) {
      const problem = themeTokenValueProblem(tokens.radius);
      if (problem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['radius'],
          message: `value ${problem}`,
        });
      }
    }
  });

const ProviderSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('mock') }).strict(),
  z
    .object({
      mode: z.literal('endpoint'),
      /** The CONSUMER's chat route. Kit parses, consumer fetches. */
      url: z.string().min(1),
      wire: z.enum(['openai', 'anthropic']),
    })
    .strict(),
]);

export const ConstructSchema = z
  .object({
    $schema: z.string().optional(),
    /** The emitted tag: <acme-support>. Must satisfy customElements.define. */
    name: z
      .string()
      .regex(TAG_RE, 'must be a valid custom-element tag: lowercase, with a hyphen (e.g. "acme-support")'),
    // Widened progressively: fullscreen/aside/split landed in Task 12, custom in Task 13.
    layout: z.enum(['widget', 'fullscreen', 'aside', 'split', 'custom']),
    provider: ProviderSchema,
    /** Plain (unsigned) identity passthrough — no signing/auth infra (owner
     *  ruling, 2026-08-26: signed JWT/HMAC identity is later additive
     *  vocabulary, not this field). TOP-LEVEL, not nested under `provider`:
     *  local history scoping (`capabilities.history.persistence: 'local'`)
     *  needs userId independent of provider mode — nesting it inside the
     *  provider union would make it silently inert for `mode: 'mock'` +
     *  local history, a real and common combination. Threaded as the
     *  `x-kai-user-id` header on every emitted fetch to the CONSUMER's own
     *  backend (the endpoint provider's chat POST, history's endpoint
     *  GET/PUT), and folded into the localStorage key for `local` history so
     *  different users on the same browser profile don't share one thread.
     *  Constrained to printable-ASCII (no CR/LF, no non-ISO-8859-1 code
     *  points) beyond the usual construct-authored-text escaping: this value
     *  reaches an HTTP HEADER VALUE, not just a JS string literal, and
     *  `fetch()` throws at RUNTIME on a header value containing CR/LF or
     *  outside ISO-8859-1 — a bad userId would surface as an opaque crash in
     *  the CONSUMER's generated app, not a construct-validation error. Reject
     *  loudly here instead, where the author gets a path + message. */
    userId: z
      .string()
      .min(1)
      .regex(
        /^[\x20-\x7E]+$/,
        'must be printable ASCII with no line breaks (it becomes an HTTP header value)',
      )
      .optional(),
    theme: z
      .object({
        /** Any CSS color; becomes --kai-color-primary on the host. */
        accent: z.string().optional(),
        /** Any CSS color; becomes --kai-color-unread on the host (owner
         *  ruling, 2026-08-26 — the unread-indicator round). Same treatment
         *  as `accent` in every way that matters for safety: construct-
         *  authored/untrusted text, carried to the emitted facade via
         *  `ctx.element.style.setProperty('--kai-color-unread',
         *  JSON.stringify(...))` — never string-interpolated into CSS
         *  text — so it can never break out into a new declaration or rule
         *  (see emitElement's doc on why `accent` uses setProperty at all).
         *  Unlike `accent`, this has no paired -foreground to compute: the
         *  three surfaces that read --color-unread (the conversation-list
         *  row dot, the header toggle's badge, Dock's own closed-launcher
         *  badge) are all small filled dots with no text sitting ON them, so
         *  there is nothing to contrast-pair — the value is set and used
         *  as-is. */
        unreadColor: z.string().optional(),
        mode: z.enum(['light', 'dark', 'system']).default('system'),
        /** Full `--kai-*` palette persistence — see ThemeTokensSchema above.
         *  Precedence with `accent`/`unreadColor`: those emit first, tokens
         *  after, so a token naming the same knob (e.g. --kai-color-primary)
         *  WINS — the full palette is the finer-grained wish. */
        tokens: ThemeTokensSchema.optional(),
      })
      .strict()
      .optional(),
    /** Construct-wide header chrome, valid on every layout (not layout-scoped
     *  like `widget`, and not a capability toggle — a header is a construct-
     *  wide fact, like `theme`). Rendered inside ChatThread's own built-in
     *  header bar; a logo/icon projects through the kit's EXISTING
     *  `header-start` named slot (`slots` vocabulary above), not a second
     *  image-prop convention here. */
    header: z
      .object({
        /** Rendered in ChatThread's built-in header bar (left side). Construct-
         *  authored/untrusted text, like theme.accent/provider.url — JSON.stringify'd
         *  at its one emit site, never a raw JSX attribute string. */
        title: z.string().min(1).optional(),
        /** Renders a theme-toggle Button in ChatThread's header-end region,
         *  flipping the host's `theme` attribute (the attribute
         *  defineWebComponent already owns) via the facade's ctx.element —
         *  codegen work, no new kit surface (B-10). */
        themeToggle: z.boolean().optional(),
        /** Header action buttons (label + kit Button variant), rendered in
         *  the header-end region. Vocabulary-never-logic: the construct
         *  cannot say what an action DOES, so each click dispatches a
         *  non-bubbling `kai-header-action` CustomEvent on the host with
         *  `detail: { label }` — the consumer's listening seam (B-10).
         *  `variant` derives from the kit Button's own list
         *  (BUTTON_VARIANT_NAMES — B-6a), never restated. `label` is
         *  construct-authored untrusted text, JSON.stringify'd at emit. */
        actions: z
          .array(
            z
              .object({
                label: z.string().min(1),
                variant: z.enum(BUTTON_VARIANT_NAMES).optional(),
              })
              .strict(),
          )
          .min(1)
          .optional(),
      })
      .strict()
      .optional(),
    /** Greeting shown while the thread is empty (no messages yet) — the
     *  proven "welcome screen" pattern (Intercom-class): title + optional
     *  description + optional icon above, with `capabilities.starters`'
     *  chips and the composer still rendering below (ChatThread's `empty`
     *  REPLACE slot only stands in for the empty MESSAGE LIST — see
     *  chat-thread.tsx's own doc comment on `empty` — so the chips are
     *  never lost). Construct-wide like `header`, not a capability: it's a
     *  fact about the empty state, not a toggleable affordance.
     *  `title`/`description` are construct-authored/untrusted text, like
     *  `header.title`/`theme.accent`/`provider.url` — JSON.stringify'd at
     *  their one emit site, never a raw JSX attribute string. `icon` is a
     *  URL reaching an `<img src>` sink in emitted code, exactly like
     *  `widget.launcherIcon` — same `isSafeUrl` policy, same superRefine
     *  shape, below. */
    empty: z
      .object({
        title: z.string().min(1),
        description: z.string().min(1).optional(),
        icon: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    /** Home screen (spec 2026-08-27, H-1..H-5): Intercom-style landing view behind
     *  a Home/Messages tab bar. PRESENCE of `home` enables the tab chrome (H-4) —
     *  no `enabled` boolean, like `header`/`empty`. Every sub-key optional;
     *  `home: {}` still means "tabs on, defaults". Never requires another
     *  capability (H-3): the recent card simply renders nothing without
     *  `capabilities.conversations` (the CLI warns — see cli.ts). All strings are
     *  construct-authored/untrusted: JSON.stringify'd at every emit site; hrefs
     *  and URL-shaped icons through isSafeUrl in superRefine below. */
    home: z
      .object({
        greeting: z.object({ title: z.string().min(1).optional(), subtitle: z.string().min(1).optional() }).strict().optional(),
        recentConversation: z.literal(true).optional(),
        newConversation: z.object({ label: z.string().min(1).optional() }).strict().optional(),
        links: z
          .array(
            z
              .object({
                label: z.string().min(1),
                href: z.string().min(1).optional(),
                description: z.string().min(1).optional(),
                /** renderIcon name (e.g. 'book-open') or a safe URL — the icon NAME
                 *  list is renderIcon's own vocabulary, never restated here; unknown
                 *  names warn loudly at DEV runtime. */
                icon: z.string().min(1).optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
    // Capability vocabulary, widened one field at a time by later tasks.
    capabilities: z
      .object({
        /** Starter prompts shown on the empty thread; clicking one sends it.
         *  1-6 non-empty strings — construct-authored text, escaped like
         *  `theme.accent`/`provider.url` at every emit interpolation site. */
        starters: z.array(z.string().min(1)).min(1).max(6).optional(),
        /** Enables the paperclip attach affordance; accept is a non-empty
         *  list of media types/globs, e.g. ["image/*", "application/pdf"] —
         *  WHETHER stays with the construct author (this field), HOW stays
         *  with the kit (ChatThread's own attach/accept props, threaded
         *  through by codegen). */
        attachments: z
          .object({
            /** Accept-list of media types/globs, e.g. ["image/*", "application/pdf"]. */
            accept: z.array(z.string().min(1)).min(1),
          })
          .strict()
          .optional(),
        /** Conversation persistence. `none` (default, nothing emitted): the
         *  thread lives only in memory for the tab's lifetime. `local`:
         *  persisted to this browser's localStorage, keyed by the construct's
         *  tag — a mechanism decision (WHERE); what to retain and for how
         *  long stays an app decision (component-scope-boundary), so no
         *  retention count/quota lands here. `endpoint`: the CONSUMER's own
         *  thread route (GET returns ChatMessage[], PUT stores them) —
         *  requires `url`; `url` is rejected for any other persistence
         *  (superRefine below, both directions loud). */
        history: z
          .object({
            persistence: z.enum(['none', 'local', 'endpoint']),
            /** endpoint persistence only: the CONSUMER's thread routes (GET returns
             *  ChatMessage[], PUT stores them). Refined below. */
            url: z.string().min(1).optional(),
          })
          .strict()
          .optional(),
        /** How the model's thinking (reasoning parts) renders. `'full'`
         *  (the default when omitted — see codegen.ts's emitReasoningProp)
         *  is the collapsible "Thinking" disclosure, shimmering while it
         *  streams. `'compact'` shows only a shimmer/typing loader while
         *  reasoning streams, with no expandable detail. `'off'` hides
         *  reasoning entirely. This is HOW an existing medium fact (the
         *  model's thinking) displays — the kit's call — so it maps straight
         *  onto ChatThread's own `reasoning` prop; there is no app-layer
         *  quota or retention decision hiding in it. Left `.optional()`
         *  rather than `.default('full')`, matching every sibling field in
         *  this object: a zod `.default()` here would make `reasoning`
         *  REQUIRED on the inferred input type (z.infer is the output type),
         *  breaking every `capabilities: {...}` object literal in this file
         *  and its tests that doesn't mention it. */
        reasoning: z.enum(['full', 'compact', 'off']).optional(),
        /** Seeds the reasoning disclosure open AND keeps it tracking the
         *  stream (open while streaming, closes when it settles) — the
         *  pre-Task-19f `full` behavior. Default false/absent: the panel
         *  starts closed (just the "Thinking" shimmer chip) and only opens
         *  on click — the current default (owner ruling, 2026-08-26).
         *  Meaningless when `reasoning` is `'compact'` (no expandable
         *  content exists) or `'off'` (nothing renders); rejected on both,
         *  loudly, below. */
        reasoningOpen: z.boolean().optional(),
        /** Turns on the prior-conversations list (C-1..C-9 of the
         *  conversations design). `true` only — there is no `false` form,
         *  matching this schema's other presence-only capability flags.
         *  Requires `capabilities.history.persistence` to be `local` or
         *  `endpoint` (superRefine below, loud): a conversation list with
         *  nowhere to persist conversations is not a coherent construct.
         *  WHAT persists (this field, plus history) stays construct
         *  vocabulary; HOW it persists (the ConversationStore adapter,
         *  localStorage vs. a fetch endpoint) is codegen's call, never
         *  vocabulary here (C-3 — no transport-layer vocabulary). */
        conversations: z.literal(true).optional(),
        /** Role-scoped default action bars, threaded onto ChatThread's
         *  `userActions`/`assistantActions` props (B-3/B-7b). Ordered
         *  arrays; enum ids ONLY, read off the ONE const
         *  (CHAT_MESSAGE_ACTIONS — B-6): a CustomAction is an id the APP
         *  must handle, a construct has no app code, so emitting one is a
         *  dead affordance. Duplicates within one array rejected below
         *  (superRefine, the slots pattern). min(1): an empty list IS the
         *  absent key. */
        messageActions: z
          .object({
            user: z.array(z.enum(CHAT_MESSAGE_ACTIONS)).min(1).optional(),
            assistant: z.array(z.enum(CHAT_MESSAGE_ACTIONS)).min(1).optional(),
          })
          .strict()
          .optional(),
        /** The citations STRIP (the `part="citations"` row consecutive
         *  `source` parts already collapse into — message.tsx). `strip:
         *  false` hides it (emits ChatThread's `hideSources`); `strip:
         *  true` or the key absent emits NOTHING — the row already renders,
         *  the kit default IS the on state, the same anchored-on-the-
         *  default convention as `reasoning: 'full'` (B-4). */
        sources: z
          .object({
            strip: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /** Named generative-UI card definitions the model can emit as tool calls,
     *  rendered in the thread. Top-level (not a capability): a card is
     *  something the construct's model can DO at any point once a card is
     *  declared, not a thread-affordance toggle like starters/attachments/
     *  reasoning. Reuses the kit's own card-tool projection end to end
     *  (`cardTools`/`toOpenAITools`/`toAnthropicTools`, `@kitn.ai/ui/schemas`)
     *  — never a second one authored here. `schema` is validated structurally
     *  only; deep card validation (incl. `x-kai-format` mask hints) is the
     *  kit's own card contract at render time. */
    cards: z
      .array(
        z
          .object({
            /** Tool-facing card name, e.g. "refund_approval". */
            name: z.string().regex(/^[a-z][a-z0-9_]*$/),
            /** The kit's card schema JSON (incl. x-kai-format mask hints).
             *  Validated structurally here; deep card validation is the kit's
             *  own card contract at render time. */
            schema: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .min(1)
      .optional(),
    /** Named `<slot>` projection points the emitted web component exposes —
     *  the format's ONLY escape hatch (named slots, no code-in-JSON). Each
     *  name must be a valid HTML slot-attribute value AND a legible
     *  identifier: kebab-case, starting with a letter (the same shape as a
     *  CSS custom-ident) — `slot name="Header!"` is rejected, not sanitized,
     *  matching the format's loud-rejection discipline everywhere else.
     *  1-8 entries, no duplicates (superRefine below — a regex alone can't
     *  see across array entries). `layout: 'custom'` requires at least one
     *  declared slot (superRefine below): `custom` IS the slots grain — a
     *  `custom` layout with nothing to project into is not meaningfully
     *  different from `fullscreen`. */
    slots: z
      .array(z.string().regex(/^[a-z][a-z0-9-]*$/, 'slot names must be kebab-case, starting with a letter'))
      .min(1)
      .max(8)
      .optional(),
    /** Layout-scoped FAB chrome, `layout: 'widget'` only (superRefine below).
     *  Purely additive sibling to `layout` (widen-never-restructure) — mirrors
     *  Dock's own props verbatim, threaded through by codegen's emitLayoutOpen. */
    widget: z
      .object({
        /** Which corner. Mirrors Dock's own DockPosition enum verbatim — not a
         *  new left/right binary. Omitted keeps Dock's own default (bottom-end). */
        position: z.enum(['bottom-end', 'bottom-start', 'top-end', 'top-start']).optional(),
        /** An image URL for the closed-state launcher glyph, replacing Dock's
         *  built-in chat-bubble icon. Construct-authored/untrusted text, like
         *  theme.accent and provider.url — escaped the same way at its one emit site. */
        launcherIcon: z.string().min(1).optional(),
        /** Seed Dock's open state at mount. Uncontrolled — never steals focus (Dock's
         *  own focus contract, dock.tsx). Omitted keeps Dock's own default (closed). */
        defaultOpen: z.boolean().optional(),
      })
      .strict()
      .optional(),
    /** Layout-scoped aside geometry, `layout: 'aside'` only (superRefine
     *  below, mirroring `widget`'s scoping exactly). `position` picks the
     *  docked inline edge (default 'end', today's hardcoded behavior);
     *  `width` overrides codegen's 380px default. `width` is construct-
     *  authored untrusted text: it lands as a JSON.stringify'd VALUE inside
     *  the emitted Solid `style={{ }}` object — property assignment, the
     *  same no-CSS-text-interpolation guarantee as setProperty — never
     *  concatenated into a CSS string (B-2). */
    aside: z
      .object({
        position: z.enum(['start', 'end']).optional(),
        width: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    /** Layout-scoped work-surface pane, `layout: 'split'` only (superRefine
     *  below, mirroring `widget`/`aside`). Fills the split's main region,
     *  which otherwise reserves a column and renders nothing — the defect
     *  this key exists to remove. Emitted as `<slot name="pane">` FALLBACK
     *  content, so a consumer projecting their own pane still WINS (native
     *  slot semantics: assigned nodes replace fallback).
     *
     *  Backed by `components/work-surface.tsx`'s `WorkSurface`, promoted from
     *  `elements/builder-workspace.stories.tsx` — the approved design AND a
     *  working implementation. Every key below is one real affordance that
     *  component ships; an affordance with no mechanism is not here.
     *
     *  TOP-LEVEL, not a capability: it is layout chrome, the same class as
     *  `widget`/`aside`, and the placement is forced by the gate as well —
     *  `scripts/verify-construct.mjs` can only layout-scope TOP-LEVEL keys
     *  (`TOP_LEVEL_LAYOUT_SCOPE`); a capability valid only on `split` would
     *  make every non-split capability cell fail validation.
     *
     *  `sandbox` is deliberately NOT exposed — the same reasoning
     *  `ArtifactCardData` already records: a surface someone else authored
     *  must not be able to widen its own sandbox. */
    workSurface: z
      .object({
        /** What the pane FRAMES it as. `'preview'` fills the canvas edge to
         *  edge (a browser preview); `'artifact'` centers the content in a
         *  bordered card on the muted backdrop (a framed artifact). Also
         *  picks the iframe's accessible title. It does NOT imply any
         *  chrome: every affordance below is stated explicitly, so what the
         *  builder panel shows and what the pane renders can never disagree. */
        kind: z.enum(['artifact', 'preview']),
        /** What the pane frames. REQUIRED — an optional url reproduces
         *  exactly the empty pane this round exists to remove. Reaches an
         *  iframe `src`, so isSafeUrl in superRefine below, the same shape
         *  as `widget.launcherIcon` / `empty.icon`. */
        url: z.string().min(1),
        /** What the Code tab frames. OPTIONAL even with `chrome.codeView` on:
         *  the tab then renders `WorkSurface`'s own empty state, which says
         *  what it reads and names this key (owner ruling, 2026-08-30). The
         *  coupling runs ONE way (superRefine below) — a source with no tab to
         *  show it is unreachable, so `codeUrl` alone is still rejected. Same
         *  url policy as `url`. */
        codeUrl: z.string().min(1).optional(),
        /** Per-affordance toolbar chrome. Each key is ONE affordance
         *  `WorkSurface` really ships; absent means OFF, the same
         *  off-by-default convention as every capability in this file. */
        chrome: z
          .object({
            /** Desktop/tablet/mobile canvas widths, scoping the PREVIEW
             *  branch only (never the Code view) — Lovable's own rule,
             *  carried through the story. */
            deviceToggle: z.boolean().optional(),
            /** The read-only address bar (lock icon + address text). */
            urlBar: z.boolean().optional(),
            /** The open-in-new-tab button. */
            openInNewTab: z.boolean().optional(),
            /** The expand toggle. Collapses the chat rail via
             *  WorkspaceShell's own controlled `startCollapsed` — NOT the
             *  kai-resizable maximize protocol, which WorkspaceShell does
             *  not carry (recorded in the story's own module comment). */
            expand: z.boolean().optional(),
            /** The Preview|Code segmented toggle. Stands alone — with no
             *  `codeUrl` the Code tab renders its empty state rather than
             *  refusing to validate. */
            codeView: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /** Construct-wide shell chrome (10a): both members reuse REAL kit
     *  pieces — command.tsx's CommandList behind a codegen-emitted overlay
     *  (opened on Mod+K; entries DERIVE from what this construct enables —
     *  menu-honesty against dead entries), and the documented Dropdown+
     *  Avatar user-menu recipe. `name`/`plan` are construct-authored
     *  untrusted text, JSON.stringify'd at emit like every sibling.
     *  `commandPalette` is presence-only `z.literal(true)`, matching
     *  `conversations`' pattern. */
    shell: z
      .object({
        commandPalette: z.literal(true).optional(),
        userMenu: z
          .object({
            name: z.string().min(1),
            plan: z.string().min(1).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /** Composer chrome — NOT a capability: chrome on the medium, like
     *  `header` (B-5). `triggers` maps onto ChatThread's real, shipped
     *  `triggers` prop: `slash` → `{ char: '/', kind: 'command', items }`,
     *  `mention` → `{ char: '@', kind: 'mention', items }` at emit. */
    composer: z
      .object({
        triggers: z
          .object({
            slash: z.array(TriggerEntrySchema).min(1).optional(),
            mention: z.array(TriggerEntrySchema).min(1).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((construct, ctx) => {
    for (const rule of CROSS_FIELD_RULES) rule.check(construct, ctx);
  });

export type Construct = z.infer<typeof ConstructSchema>;

/** One cross-field rule of the construct format (B-20). The table is the
 *  visibility layer's guard: the builder's RULE_VISIBILITY registry
 *  (src/components/construct-form-paths.ts) is keyed by these ids, and a
 *  key-set-equality test fails any new rule until the builder classifies
 *  it. `paths` names the dotted construct paths the rule READS — panel
 *  metadata, not zod mechanics. Bodies are the pre-table superRefine code
 *  verbatim; behavior (messages included) is pinned by schema.test.ts and
 *  the generated artifact is pinned byte-identical by verify:generated
 *  (superRefine never serializes into z.toJSONSchema output). */
export interface CrossFieldRule {
  id: string;
  paths: readonly string[];
  check: (construct: Construct, ctx: z.RefinementCtx) => void;
}

export const CROSS_FIELD_RULES: readonly CrossFieldRule[] = [
  {
    id: 'slots-unique',
    paths: ['slots'],
    check: (construct, ctx) => {
      if (!construct.slots) return;
      const seen = new Set<string>();
      construct.slots.forEach((name, i) => {
        if (seen.has(name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['slots', i],
            message: `duplicate slot name "${name}"`,
          });
        }
        seen.add(name);
      });
    },
  },
  {
    id: 'custom-layout-needs-slots',
    paths: ['layout', 'slots'],
    check: (construct, ctx) => {
      if (construct.layout === 'custom' && (!construct.slots || construct.slots.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slots'],
          message: '"custom" layout requires at least one declared slot — custom IS the slots grain',
        });
      }
    },
  },
  {
    id: 'split-pane-slot-collision',
    paths: ['layout', 'slots'],
    check: (construct, ctx) => {
      if (construct.layout === 'split' && construct.slots) {
        const i = construct.slots.indexOf('pane');
        if (i !== -1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['slots', i],
            message:
              '"pane" collides with the "split" layout\'s own fixed <slot name="pane"> — choose a different slot name',
          });
        }
      }
    },
  },
  {
    id: 'widget-layout-scope',
    paths: ['layout', 'widget'],
    check: (construct, ctx) => {
      if (construct.widget && construct.layout !== 'widget') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['widget'],
          message: '"widget" is only valid on layout: "widget"',
        });
      }
    },
  },
  {
    id: 'aside-layout-scope',
    paths: ['layout', 'aside'],
    check: (construct, ctx) => {
      if (construct.aside && construct.layout !== 'aside') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['aside'],
          message: '"aside" is only valid on layout: "aside"',
        });
      }
    },
  },
  {
    id: 'message-actions-unique',
    paths: ['capabilities.messageActions.user', 'capabilities.messageActions.assistant'],
    check: (construct, ctx) => {
      const messageActions = construct.capabilities?.messageActions;
      if (!messageActions) return;
      // Same reason the slots rule exists: a regex/enum alone can't see
      // across array entries. Per-array only — the two roles may share ids.
      for (const role of ['user', 'assistant'] as const) {
        const list = messageActions[role];
        if (!list) continue;
        const seen = new Set<string>();
        list.forEach((id, i) => {
          if (seen.has(id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['capabilities', 'messageActions', role, i],
              message: `duplicate action id "${id}"`,
            });
          }
          seen.add(id);
        });
      }
    },
  },
  {
    id: 'launcher-icon-url',
    paths: ['widget.launcherIcon'],
    check: (construct, ctx) => {
      if (construct.widget?.launcherIcon && !isSafeUrl(construct.widget.launcherIcon)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['widget', 'launcherIcon'],
          message: 'launcherIcon must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
        });
      }
    },
  },
  {
    id: 'empty-icon-url',
    paths: ['empty.icon'],
    check: (construct, ctx) => {
      if (construct.empty?.icon && !isSafeUrl(construct.empty.icon)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['empty', 'icon'],
          message: 'icon must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
        });
      }
    },
  },
  {
    id: 'reasoning-open-scope',
    paths: ['capabilities.reasoning', 'capabilities.reasoningOpen'],
    check: (construct, ctx) => {
      const reasoning = construct.capabilities?.reasoning;
      const reasoningOpen = construct.capabilities?.reasoningOpen;
      if (reasoningOpen !== undefined && (reasoning === 'compact' || reasoning === 'off')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capabilities', 'reasoningOpen'],
          message: '"reasoningOpen" only applies when reasoning is "full" or omitted — "compact"/"off" have no disclosure to open',
        });
      }
    },
  },
  {
    id: 'conversations-need-history',
    paths: ['capabilities.conversations', 'capabilities.history'],
    check: (construct, ctx) => {
      const history = construct.capabilities?.history;
      if (construct.capabilities?.conversations && (!history || history.persistence === 'none')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capabilities', 'conversations'],
          message: '"conversations" requires capabilities.history.persistence to be "local" or "endpoint" — a conversation list needs somewhere to persist conversations',
        });
      }
    },
  },
  {
    id: 'home-link-urls',
    paths: ['home.links'],
    check: (construct, ctx) => {
      const URL_SHAPED = /^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/\//;
      for (const [i, link] of (construct.home?.links ?? []).entries()) {
        if (link.href && !isSafeUrl(link.href)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['home', 'links', i, 'href'],
            message: 'href must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
          });
        }
        if (link.icon && URL_SHAPED.test(link.icon) && !isSafeUrl(link.icon)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['home', 'links', i, 'icon'],
            message: 'icon must be a kit icon name or an http(s)/relative URL — no javascript:/data: schemes',
          });
        }
      }
    },
  },
  {
    id: 'history-endpoint-url',
    paths: ['capabilities.history.persistence', 'capabilities.history.url'],
    check: (construct, ctx) => {
      const history = construct.capabilities?.history;
      if (!history) return;
      if (history.persistence === 'endpoint' && !history.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capabilities', 'history', 'url'],
          message: '"endpoint" persistence requires a url',
        });
      }
      if (history.persistence !== 'endpoint' && history.url !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capabilities', 'history', 'url'],
          message: 'url is only valid with "endpoint" persistence',
        });
      }
    },
  },
  {
    id: 'work-surface-layout-scope',
    paths: ['layout', 'workSurface'],
    check: (construct, ctx) => {
      if (construct.workSurface && construct.layout !== 'split') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workSurface'],
          message: '"workSurface" is only valid on layout: "split"',
        });
      }
    },
  },
  {
    id: 'work-surface-url',
    paths: ['workSurface.url'],
    check: (construct, ctx) => {
      if (construct.workSurface && !isSafeUrl(construct.workSurface.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workSurface', 'url'],
          message: 'url must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
        });
      }
    },
  },
  {
    id: 'work-surface-code-url',
    paths: ['workSurface.codeUrl'],
    check: (construct, ctx) => {
      const codeUrl = construct.workSurface?.codeUrl;
      if (codeUrl && !isSafeUrl(codeUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workSurface', 'codeUrl'],
          message: 'codeUrl must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
        });
      }
    },
  },
  {
    id: 'work-surface-code-view',
    paths: ['workSurface.codeUrl', 'workSurface.chrome.codeView'],
    check: (construct, ctx) => {
      const ws = construct.workSurface;
      if (!ws) return;
      // ONE direction, not two (owner ruling, 2026-08-30). The reverse
      // coupling — `codeView` requiring a `codeUrl` — was rejected as an
      // authoring error, which made the toggle impossible to switch on in the
      // builder panel and kept the Preview|Code control off every starter.
      // `codeView` alone is now valid: WorkSurface's Code branch renders its
      // own empty state naming `workSurface.codeUrl`, in the same voice as the
      // preview placeholder page codegen already ships. An honest empty state
      // is not a dead affordance — the tab still tells you something true —
      // and it retires the "a relative codeUrl frames a 404" concern with it,
      // because the no-source path now renders a page instead of fetching one.
      //
      // A `codeUrl` with no `codeView` stays rejected: the tab is the only
      // thing that reads it, so the key would be dead weight in the file.
      if (ws.codeUrl && !ws.chrome?.codeView) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workSurface', 'codeUrl'],
          message: 'codeUrl is only valid with "chrome.codeView": true',
        });
      }
    },
  },
];

export interface ConstructProblem {
  /** Dotted path into the construct, '' for the root. */
  path: string;
  message: string;
}

export type ValidationOutcome =
  | { ok: true; construct: Construct }
  | { ok: false; problems: ConstructProblem[] };

/**
 * Validate one construct. The ONLY doorway to codegen: a failure never reaches
 * generation — the problems go back to the author/agent with paths and reasons.
 */
export function validateConstruct(input: unknown): ValidationOutcome {
  const parsed = ConstructSchema.safeParse(input);
  if (parsed.success) return { ok: true, construct: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.flatMap((issue) => {
      // zod's unrecognized-key issue names the keys in its message but paths the
      // OBJECT; surface each unknown key as its own problem so the agent sees
      // exactly which word is not vocabulary.
      if (issue.code === 'unrecognized_keys') {
        return issue.keys.map((key) => ({
          path: [...issue.path.map(String), key].join('.'),
          message: `"${key}" is not construct vocabulary`,
        }));
      }
      return [
        {
          path: issue.path.map(String).join('.'),
          message: issue.message,
        },
      ];
    }),
  };
}
