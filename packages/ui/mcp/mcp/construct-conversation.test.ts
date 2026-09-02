import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { constructTool } from './tools/construct';
import { validateConstruct } from '../construct/schema';
import { generateProject } from '../construct/codegen';

const text = (r: { content: { type: string; text?: string }[] }) =>
  r.content.map((c) => c.text ?? '').join('\n');

// The spec's e2e: a scripted agent session builds the owner's four-sentence
// widget, every turn validated, and the RESULT RUNS — the "runs" half is
// verify:construct, which compiles this exact fixture (owner-widget) as a
// named cell; this test pins that the conversation PRODUCES that fixture.
describe('four-sentence conversational construction', () => {
  const finalConstruct = {
    $schema: 'https://ui.kitn.ai/schemas/construct/v1.json',
    name: 'acme-support',
    layout: 'widget',
    provider: { mode: 'mock' },
    userId: 'user_123',
    header: { title: 'Acme Support' },
    // Owner ruling, 2026-08-26 (unread-indicator round): the construct's own
    // customization of the unread-dot color, so `kai dev` demonstrates the
    // CONSTRUCT VOCABULARY seam (theme.unreadColor -> --kai-color-unread),
    // not just the kit's built-in default red — a sky blue the owner would
    // actually pick, standing out from the default on sight.
    theme: { unreadColor: '#38BDF8' },
    empty: {
      title: "Hi, we're Acme Support",
      description: 'Ask us about orders, refunds, and more.',
    },
    // Task 5: the Home/Messages landing screen — a greeting, the
    // most-recent-conversation card (subsumed by `capabilities.conversations`,
    // already on by this turn), and two quick links. Lands in the same
    // closing turn as `empty`/`header`/`widget`/`reasoningOpen`/
    // `conversations` below (FIX-1 precedent): the owner's welcome-greeting
    // ask and the home-screen ask are both natural extensions of an
    // already-settled widget, not earlier-turn concerns.
    home: {
      greeting: { title: 'Hi from Acme 👋', subtitle: 'Orders, refunds, anything.' },
      recentConversation: true,
      links: [
        { label: 'Help center', href: 'https://ui.kitn.ai', description: 'Guides and FAQs', icon: 'book-open' },
        { label: 'Talk to sales', description: 'We reply fast', icon: 'message-circle' },
      ],
    },
    // NOTE (deviation from the original fixture, 2026-08-26 owner finding):
    // `launcherIcon` used to pin `https://example.com/logo.png` — a
    // placeholder that never resolves, so the live `kai dev` FAB rendered a
    // permanently broken image the whole time this fixture existed. The KIT
    // fix (`DockLauncherImage`, ui/dock.tsx) makes a failing icon degrade to
    // the default glyph instead of staying broken — codegen.test.ts's
    // `launcherIcon renders an <img> launcher override` /
    // `DockLauncherImage fallback` tests cover that in isolation with a
    // synthesized construct. This fixture itself just drops `launcherIcon`
    // (an honest default FAB) rather than pinning ANOTHER URL this repo
    // can't actually guarantee resolves in every environment `kai dev` runs
    // in — the real fix is the graceful degradation, not a "better" URL.
    widget: {
      position: 'top-start',
      defaultOpen: true,
    },
    capabilities: {
      attachments: { accept: ['image/*', 'application/pdf'] },
      history: { persistence: 'local' },
      starters: ["Where's my order?", 'Request a refund'],
      reasoningOpen: true,
      conversations: true,
    },
  };

  it('every turn of the scripted session is accepted; a hostile turn is not', async () => {
    // Turn 1: intent only — starter comes back, widget implied.
    const t1 = await constructTool.handler({ intent: 'a support widget for our site' });
    expect(text(t1)).toContain('"layout": "widget"');

    // Turns 2-6: the agent grows the SAME file, full construct each turn —
    // capabilities first, then the owner asks for widget chrome, identity
    // and reasoning disclosure on top. `conversations` (Task 5) lands
    // alongside `reasoningOpen` in the closing turn, same FIX-1 precedent as
    // `empty` below: it requires history persistence (already present by
    // turn 3) but the owner only asks for the conversation LIST once the
    // rest of the widget is settled, so earlier turns explicitly hold it
    // back the same way they hold back reasoningOpen.
    const turns = [
      { ...finalConstruct, userId: undefined, header: undefined, theme: undefined, empty: undefined, home: undefined, widget: undefined, capabilities: { attachments: finalConstruct.capabilities.attachments, reasoningOpen: undefined, conversations: undefined } },
      { ...finalConstruct, userId: undefined, header: undefined, theme: undefined, empty: undefined, home: undefined, widget: undefined, capabilities: { attachments: finalConstruct.capabilities.attachments, history: finalConstruct.capabilities.history, reasoningOpen: undefined, conversations: undefined } },
      { ...finalConstruct, userId: undefined, header: undefined, theme: undefined, empty: undefined, home: undefined, widget: undefined, capabilities: { ...finalConstruct.capabilities, reasoningOpen: undefined, conversations: undefined } },
      { ...finalConstruct, header: undefined, theme: undefined, empty: undefined, home: undefined, widget: undefined, capabilities: { ...finalConstruct.capabilities, reasoningOpen: undefined, conversations: undefined } },
      // Turn 6: the owner asks for a welcome greeting AND the home screen on
      // top of everything else — the natural extension point (FIX-1
      // precedent), landing alongside header/widget/reasoningOpen/
      // conversations in the same closing turn. `theme.unreadColor`
      // (unread-indicator round, owner ruling 2026-08-26) and `home` (Task 5)
      // land here too, same precedent: the owner's customization/home-screen
      // requests are natural extensions of an already-settled widget, not
      // earlier-turn concerns.
      finalConstruct,
    ].map((c) => JSON.parse(JSON.stringify(c)));
    for (const construct of turns) {
      expect(text(await constructTool.handler({ construct }))).toContain('VALID');
    }

    // A turn-40-style bad edit bounces: the spine has no wiring to break, and
    // logic is not vocabulary.
    const bad = await constructTool.handler({
      construct: { ...finalConstruct, onMessage: "fetch('https://evil.example')" },
    });
    expect(text(bad)).toContain('REJECTED');
    expect(text(bad)).toContain('onMessage');
  });

  it('the conversation result IS the checked-in gate fixture', () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(__dirname, '../construct/fixtures/owner-widget.construct.json'),
        'utf8',
      ),
    );
    expect(fixture).toEqual(finalConstruct);
  });

  it('and it generates the full wiring', () => {
    const out = validateConstruct(finalConstruct);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const app = generateProject(out.construct).find((f) => f.path === 'src/App.tsx')!.code;
    // NOTE (deviation from brief): the brief's literal marker list was
    // ['readAsDataURL', 'localStorage', 'PromptSuggestion', '<Dock']. Codegen
    // (Tasks 12/13, closed) deliberately does NOT hand-roll readAsDataURL —
    // ChatThread/DefaultPromptInput already own the whole attach round-trip,
    // and codegen.test.ts:355 pins `app).not.toContain('readAsDataURL')` as
    // the intended behavior. Likewise starters wire through ChatThread's own
    // `suggestions` prop, never a `PromptSuggestion` component/string. Markers
    // below assert the real wiring signals instead: `attach={true}` for the
    // attachments round-trip and `suggestions={` for starters.
    for (const marker of [
      'attach={true}',
      'suggestions={',
      '<Dock',
      // Task 5: capabilities.conversations is on in the fixture, which
      // SUBSUMES the hand-rolled THREAD_KEY/localStorage.getItem/setItem
      // effect this test used to assert here (emitHistorySetup's own doc
      // has the persistence-ownership decision) — ChatThread's own
      // `conversations`/`store` props are the ONE persistence mechanism in
      // this emitted App now, so the marker list asserts THOSE instead of
      // the old THREAD_KEY string.
      'conversations={true}',
      'localStorageStore(',
      // Task 6 live-browser regression: without this wire, ChatThread's own
      // select/new/mount-restore never change the rendered thread (see
      // emitConversationsProps's doc in codegen.ts).
      'onConversationLoad={(messages) => chat.setMessages(() => messages)}',
      'reasoningOpen={true}',
      'position="top-start"',
      'defaultOpen={true}',
      JSON.stringify(finalConstruct.header.title),
      // empty wires through ChatThread's own `emptyContent` prop as a plain
      // JSX Empty/EmptyHeader/EmptyTitle/EmptyDescription composition, not a
      // boolean `empty` prop or a slot/Portal (emitEmptyContentProp in
      // codegen.ts) — assert the real emission site.
      'emptyContent={<Empty><EmptyHeader>',
      '<EmptyTitle>',
      JSON.stringify(finalConstruct.empty.title),
      JSON.stringify(finalConstruct.empty.description),
      // Task 5: home threads through as one JSON.stringify'd prop.
      ` home={${JSON.stringify(finalConstruct.home)}}`,
    ]) {
      expect(app).toContain(marker);
    }
    // No launcherIcon on this fixture (see the widget block's own note) ->
    // no DockLauncherImage import/usage at all, not even an unused one.
    expect(app).not.toContain('DockLauncherImage');
  });
});
