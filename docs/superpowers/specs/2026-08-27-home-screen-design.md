# Home screen for the chat widget — design (2026-08-27)

Owner-approved design for the widget home screen (Intercom pattern, bottom tabs).
Brainstormed 2026-08-27; nav model, schema coupling and v1 content are owner
rulings, display details delegated to the implementer. Successor to the
conversations round (spec `2026-08-26-conversations-design.md`, merged as
`6bfad4c8`). Story-first per the owner's process policy: the HomePanel look is
iterated in Storybook with stub data BEFORE any integration work.

## Scope

A `home` surface for the widget: greeting, resume-recent-conversation card,
new-conversation action, link/action cards — every piece optional — plus a
persistent two-tab bar (Home / Messages) that appears only when a construct
declares `home`. Without `home`, the widget is byte-for-byte today's behavior.

Out of scope: help-center search, article content, more than two tabs, any
transport vocabulary, home outside the widget layout (see H-2).

## Rulings

- **H-1 · V1 content (owner)**: greeting header · recent-conversation card ·
  new-conversation action · link/action cards. All optional in the schema.
  Display/layout specifics are the implementer's, iterated story-first.
- **H-2 · Nav model (owner)**: Intercom-style persistent bottom tabs, Home +
  Messages. The conversations list MOVES from the header chat-bubble button to
  the Messages tab when `home` is present (the header button remains the list
  entry when `home` is absent). The tab bar renders on Home and on the Messages
  list, and is HIDDEN inside an open chat; back exits the chat to wherever it
  was entered from (list or Home).
- **H-3 · Schema coupling (owner)**: `home` never requires another capability.
  With `capabilities.conversations`, the Messages tab shows the list; without
  it, Messages opens straight into the single chat. The recent-conversation
  card is conversations-derived, so it renders only when `conversations` is on
  AND history exists — declaring `recentConversation: true` without
  conversations is valid vocabulary that renders nothing (decide loudly: `kai
  validate` emits a warning naming the dependency, not an error).
- **H-4 · Vocabulary (design)**: top-level `home` object, following the
  `header`/`empty` precedent — a construct-wide surface, not a capability
  toggle. Presence of `home` is the tab-chrome switch; no `enabled` boolean.
- **H-5 · Entry view (design)**: with `home` declared, the widget opens on
  Home. Close from any view resets to Home (the close-reset rule generalizes
  from "reset to chat"). Auto-restore/unread hydration still runs on open so
  the Messages-tab dot and the recent card are honest before either is visited.
- **H-6 · Purpose-built chrome (design, same ruling class as the conversation
  list)**: the tab bar is a small purpose-built widget component, NOT a reuse
  of `kai-tabs` (a content tabset with different semantics/chrome).

## Vocabulary

```jsonc
"home": {
  "greeting": { "title": "Hi there 👋", "subtitle": "How can we help?" },
  "recentConversation": true,
  "newConversation": { "label": "Send us a message" },
  "links": [
    { "label": "Docs", "href": "https://…", "description": "Read the guides", "icon": "book" },
    { "label": "Talk to sales", "description": "Emits an event", "icon": "chat" }
  ]
}
```

- Every key optional; an empty `home: {}` still enables the tab chrome with
  sensible defaults (default greeting title, new-conversation card on).
  Defaults are decided at the schema layer and documented there.
- All strings are construct-authored/untrusted like `header.title` —
  JSON.stringify'd at every emit interpolation site.
- `links[].href` passes `isSafeUrl` (`superRefine`, same policy/site pattern as
  `widget.launcherIcon`); rendered as a real anchor, `target="_blank"` +
  hardened `rel`. A link WITHOUT `href` emits `kai-home-link` with the entry as
  `detail` instead — the app's hook for custom actions. Exactly one of the two
  behaviors per entry; an entry with `href` does not also emit.
- `icon` is a name from the kit's existing icon vocabulary (same enum source as
  other icon-bearing vocabulary — derive, don't restate).
- Vocabulary-never-logic holds: no conditions, no expressions, no ordering
  DSL. Cards render in declaration order.

## Components

- **`HomePanel`** (`packages/ui/src/components/home-panel.tsx`): the home
  surface — greeting, recent card, new-conversation card, link cards. Pure
  props + callbacks; no store access (ChatThread passes the derived recent
  summary in). The story-first target.
- **Widget `TabBar`**: two tabs + unread dot on Messages (existing
  `--color-unread` / `theme.unreadColor`). Purpose-built per H-6. Accessible:
  real `tab`/`tablist` semantics, and the unread state reaches the tab's
  accessible name (do not repeat #336 here).
- **`ChatThread`**: view machine grows from `chat ⇄ list` to
  `home | chat | list` plus the visible-tab rule from H-2. Back-target is
  tracked (chat entered from Home vs from the list). The recent-conversation
  summary derives via the shared recency comparator — this round EXTRACTS it
  (absorbing follow-up #335) rather than adding a third copy.
- **Facade (`kai-chat`)**: forwards the `home` config and the new
  `kai-home-link` event. Types-without-forwarding trap applies — verify via
  `verify:generated` artifact diffs and a forwarding test.
- **Construct engine**: `schema.ts` gains `home` (Zod → published JSON Schema
  regenerated, drift guard covers it); `codegen.ts` threads it through;
  `fixtures/owner-widget.construct.json` demos it. `verify:construct`'s
  schema-derived axes pick up the new cells automatically — read its printed
  cell counts, don't restate them.

## Behavior details

- Recent card: title, last-message preview, relative time, unread dot; tap →
  that conversation's chat. Hidden when empty history or no conversations
  capability (H-3).
- New-conversation card: same path as the list's floating pill; with
  conversations off it simply opens the single chat.
- Tab switches are internal state — no facade event, no attribute reflection.
- Theme: greeting inherits the existing header tokens; no new token unless the
  story iteration demonstrates the need (default: none).

## Story-first order

1. **Story**: `home-panel.stories.tsx` with stub data — full home (all four
   pieces), minimal (`home: {}` defaults), no-links, no-recent, unread-dot
   variants, tab chrome visible. Owner ruling 2026-08-27: the usual
   story-approval gate is WAIVED for this round — build end-to-end without
   further interaction; the story and the demo are reviewed together at the
   end. The story still comes first so design iteration happens with stub data.
2. **Integration**: ChatThread machine + TabBar wiring + facade forwarding +
   schema/codegen/fixture.
3. **Checkpoint**: `kai dev` demo against the owner fixture, as in the
   conversations round.

## Testing

- Unit: HomePanel variants; view-machine transitions incl. close-reset (H-5)
  and back-target (H-2); shared recency comparator used by all three sites
  (panel, chat-thread restore, recent card); hostile-construct `links[].href`
  (`javascript:` rejected, source text stays visible); reactivity-contract
  additions for the `links` list; TabBar a11y (accessible-name changes with
  unread).
- Facade: forwarding test for `home` + `kai-home-link`.
- Emitted layer: covered by `verify:construct` (the jsdom-can't-see-emitted
  lesson from `onConversationLoad` — assert at the emitted layer, not only by
  passing callbacks explicitly).
- Merge gate: full `--project=unit` AND `--project=emitted`, typecheck,
  verify:construct/generated/scaffold — scoped runs are not a verdict.

## Traps priced in (from the conversations ledger)

Foreground subagent gates only · full-suite honesty · types-without-forwarding
facade trap · emitted-layer callback coverage · Claude-in-Chrome observation
tabs are frame-starved (don't file scroll bugs from them).
