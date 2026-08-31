# Emitted-app parity audit (2026-08-30)

The 2026-08-29 audit compared builder PANELS only. This one compares each
template's DESIGN STORY against the REAL EMITTED APP — the gap that let the
Workspace header ship wrong. Screenshots (15 pairs) beside this file.

Baseline: `feat/modes-and-screens` @ `82f19f41`, captured in an isolated
clone (the working checkout was mid-rebuild from a concurrent fix).
Emitted side screenshotted directly at the project's own port, not through
the builder's scaled iframe; every composition claim confirmed against the
emitted `src/App.tsx`.

## The shape of it

The story composes a component; codegen re-derives the same intent from
loose buttons on a different element. Workspace: the story renders a
full-width `AppHeader` strip ABOVE the split; codegen hands the same
cluster to `ChatThread`'s `headerEndContent` — a prop on the component
INSIDE the split's 360px start pane, which the buttons overflow. Not
styling. Composition.

## Gaps by bucket

**(a) PROMOTE — 7 rows, 3 distinct fixes** (all land when codegen composes
the promoted `AppHeader`): I1 theme control emits a text button reading
"Theme" instead of the icon-only Sun/Moon with its switch-to-X accessible
name (same defect in 4 templates) · A4/K4 user menu emits a bare `Avatar`,
design is Avatar + chevron (+ name/plan) · A5/R4/K3 same theme button ·
K1 header placement.

**(b) WIRE — 8 rows, 6 distinct fixes** (mechanism and vocabulary both
exist, codegen just doesn't connect them): W4 panel renders Theme accent
and unread color with no visible labels · I3 emitted host page blank where
widget's prints a stand-in · A3 `shell.commandPalette` emits a Mod+K
overlay with NO visible trigger · R2 `sources.strip` is unobservable
(matches the kit default so codegen emits nothing, and mock starters
script no tool calls, so no `source` part ever exists) · R3 research
starter ships copy/like/dislike where the design's toolbar is
Copy/Rewrite/Share and `regenerate` is already expressible · K2 palette
trigger · K6 Preview|Code absent from both variants (needs `codeUrl`,
unset in both starters) · K8 "Switch template" → Workspace SKIPS the
variant picker and name step the Start path offers, silently landing on
the base starter.

**(c) NO VOCABULARY — 5 rows**: A1 persistent conversations rail (T-5 #5,
deliberately deferred, kit-gated) · R1 answer tabs/media/related (T-5 #7,
deferred) · K5 composer `+` menu and quick-fill chips (T-5 #8, deferred) ·
K7 pane frames the shipped placeholder rather than rendered output
(2026-08-30 amendment; the honest today-story) · **A2 model switcher —
NEVER CONSIDERED, needs an owner ruling.** Every Assistant-family story
puts one in the header, `ChatThread.models` is real and shipped, and T-5
ruled on it in neither direction. It brushes the invoice test (which model
a user picks costs different money), so it is owner territory.

**(d) STORY STALE — 4 rows**, where the emitted app is AHEAD of its design:
W1 widget story omits the Home tab/greeting/links/tab bar the construct
declares and the app renders · W2 no header close X · W3 no message-action
bars though the starter declares them · I2 in-app rail header right side
never models the theme toggle its starter switches on.

**Working, recorded:** the two Workspace variants genuinely differ
(artifactPreview = Expand only; appPreview = device toggles + address bar
+ open-in-new-tab).

## Correction to the 2026-08-30 rulings amendment

That amendment records `deviceToggle` as DROPPED for want of a mechanism,
and flags the "App preview with device toggles" card as naming an
inexpressible affordance. Both are now STALE: the schema carries
`chrome.deviceToggle` and `chrome.codeView`, and the card's label is
honest. The owner's open question about renaming it is closed by the
mechanism existing.

## Recommended structural guard: give `verify:construct` a RENDER leg

Today that gate ejects every cell through the real CLI, installs,
compiles, builds with Vite, bundles one cell per layout — then greps for
the tag name and stops. **It never mounts anything.** That single
blindness is why a wrong header, an invisible palette, an inert sources
switch and a 404 Code tab all pass it green.

Mount the built element in Playwright and assert a contract DERIVED from
the fixture construct — never a screenshot, never a hand-typed list:
`header.actions[]` → one control per label, in order, in the app-header
region · `header.themeToggle` → an icon-only control with the switch-to-X
accessible name · `shell.commandPalette` → a VISIBLE trigger plus the
Mod+K path · `shell.userMenu` → name/plan in the accessible name ·
`workSurface.url` → an iframe with that src, and `chrome.*` → exactly the
declared affordances and none of the undeclared · `capabilities.starters`
→ one chip each · placement via the marker promoted components stamp
(`[data-kai-app-header]`), asserted as a SIBLING of the split rather than
a descendant of the chat rail — the assertion that fails on today's
Workspace.

Two properties make it a guard rather than another green light. **Derived:**
assertions read the fixture, so a new capability with no assertion is a
hard failure, exactly as an unrecognised capability key already is.
**Two-sided:** every positive assertion has a negative twin (a construct
without `header.actions` must render none), so it cannot pass vacuously.

Cost: ~1 day one-time (the harness exists; the work is a mount page, a
Playwright launch, a ~10-key assertion table); recurring, it reuses cells
the gate already builds — estimated +60–90s on a job already running for
minutes, no new CI service. `--self-test` gains two cases: strip the
header marker → the mount leg must go red; add an undeclared affordance →
the negative twin must go red.

**Would have caught:** the whole PROMOTE column, the invisible palette,
the missing Code tab, and R2's inert switch. **Would NOT have caught:** the
four stale stories (no gate can tell you the design is behind the
product), the deliberately deferred vocabulary (absence by design is what
the rulings record — a guard failing on those would be wrong), K8's
navigation flow, and the original drift before `AppHeader` existed to
collide with.

**Insurance, not the guard:** a ~30-line lint failing any
`builder-*.stories.tsx` that declares a local symbol colliding with an
exported promoted component. Prevents regression; could not have caught
the original.

**Rejected:** a story-vs-emitted screenshot diff. The two surfaces are
legitimately different (story = device viewport inside builder chrome with
stub messages; emitted = full-bleed and empty), so the diff is noise, and
noisy gates get baselined into uselessness.
