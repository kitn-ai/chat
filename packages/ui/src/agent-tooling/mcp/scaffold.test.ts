import { describe, it, expect } from 'vitest';
import {
  cardEmitPlan, scaffold, renderSurface, NO_PROXY_CLAIM, PROXY_REQUIRED_CLAIM, ATTACHMENT_WIRE_NOTE,
} from './tools/scaffold';
// The route seam a second emitter consumes, graded at the bottom of this file.
// It lives in its own leaf module rather than in `tools/scaffold` — that file
// builds a zod schema at module scope, so importing one symbol out of it drags
// the whole thing plus zod into any bundle. See the header of `route-emit.ts`.
import { chatRoutePreamble, defaultModelFor, CLIENT_MODEL_IDS } from '../route-emit';
import {
  getArchetype, getIntegration, listArchetypes, listIntegrations, listSurfaceProbes,
} from '../registry';
// The catalog record, READ rather than restated: the composition assertions below
// follow the recipe, so revising the decision revises the test with it.
import { surfaceRecipes } from '../catalog/surfaces';
import { Framework } from '../types';
import type { Integration } from '../types';
// The real encoders, used to prove WHY the fabricated sample seed had to go:
// one of them throws on it, the other quietly sends it.
import { toAnthropicMessages, toOpenAIMessages, WireEncodeError } from '../../wire/encode';
import type { ChatMessage } from '../../elements/chat-types';
// The declaration itself, so the accept guard below compares the emitted
// attribute against the source of truth rather than against a copy of it.
import { encodableMediaTypes } from '../../wire/media-types';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * scaffold composes a working chat surface from four axes:
 *   useCase (archetype) × integration × placement × framework.
 *
 * The handler returns the MCP tool shape ({ content: [{ type, text }] }); these
 * tests read out.content[0].text — matching the real CallToolResult contract and
 * the sibling reference.test.ts. The assertion regexes are the brief's verbatim.
 */
describe('scaffold', () => {
  it('drop-in chat + openrouter (next) → element + route + stream note', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // React branch now uses the @kitn.ai/ui/react wrapper (<Chat />) — no raw kai-chat tag.
    expect(text).toMatch(/<Chat\b|<kai-chat/);
    expect(text).toMatch(/openrouter\.ai\/api\/v1\/chat\/completions/);
    // The stream note points at the adapter that actually reads it.
    expect(text).toMatch(/readOpenAIStream/);
  });

  it('pydantic-ai emits a Python (FastAPI) route', async () => {
    const out = await scaffold.handler({
      useCase: 'support-widget',
      integration: 'pydantic-ai',
      placement: 'docked-widget',
      framework: 'fastapi',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/from fastapi|uvicorn|run_stream/);
  });

  it('rejects an unknown integration with the valid list', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'nope',
      placement: 'side',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/unknown integration|valid integrations/i);
  });

  // ── the surface axis is a components list ────────────────────────────────
  //
  // These are the unit-level half of `assertPresetsAreData` /
  // `assertSurfacesAreDistinct` in scripts/verify-scaffold-compiles.mjs. That gate
  // needs `dist/` and does not run under `npm test`, so the claim "archetypes are
  // presets over one renderer" would otherwise be checked only in CI's slow job.

  const FRONTENDS_FOR_SURFACE = ['react', 'next', 'tanstack-start', 'vue', 'svelte', 'angular', 'solid', 'html'] as const;

  /** The surface no archetype can express: the workspace pair PLUS the tool pair. */
  const WORKSPACE_WITH_TOOLS = [
    'kai-chat',
    'kai-tool',
    'kai-reasoning',
    'kai-artifact',
    'kai-resizable',
  ];

  it('renders a surface no archetype can express: a workspace that also runs tools', async () => {
    // The point of the extraction, stated as a test. `workspace` carries no
    // kai-tool, so it emits no tool loop and no card round trip; `agentic` carries
    // no kai-artifact/kai-resizable, so it emits no split. Both at once is a
    // perfectly reasonable app (render the tool calls that produced the artifact)
    // and the archetype-keyed entry point had no parameter that could ask for it.
    for (const framework of FRONTENDS_FOR_SURFACE) {
      const out = await scaffold.handler({
        components: WORKSPACE_WITH_TOOLS,
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      const front = text.split('=== (2)')[0];
      expect(front, `${framework}: no resizable split`).toMatch(/Resizable|kai-resizable/);
      expect(front, `${framework}: no artifact pane`).toMatch(/Artifact|kai-artifact/);
      expect(front, `${framework}: no card round trip`).toContain('cardFromToolCall(');
    }

    // And prove the negative rather than assuming it: neither preset produces both.
    for (const preset of ['workspace', 'agentic'] as const) {
      const out = await scaffold.handler({
        useCase: preset,
        integration: 'openrouter',
        placement: 'full-page',
        framework: 'react',
      });
      const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
      const hasSplit = /<Resizable\b/.test(front);
      const hasCards = front.includes('cardFromToolCall(');
      expect(hasSplit && hasCards, `preset '${preset}' already emits both — the gap it proves has closed`).toBe(false);
    }
  });

  it('a workspace surface still renders its standalone companions', async () => {
    // The bug the components axis found. Every renderer took a workspace branch
    // that emitted the split and RETURNED, dropping kai-sources / kai-voice-input
    // on the floor. Three frameworks failed tsc on the now-unused wrapper import;
    // four (vue, svelte, angular, html) compiled clean and rendered nothing.
    const components = [...WORKSPACE_WITH_TOOLS, 'kai-sources', 'kai-voice-input'];
    for (const framework of FRONTENDS_FOR_SURFACE) {
      const out = await scaffold.handler({
        components,
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
      expect(front, `${framework}: sources dropped by the workspace branch`).toMatch(
        /<Sources\b|<kai-sources|<Source\b/,
      );
      expect(front, `${framework}: voice input dropped by the workspace branch`).toMatch(
        /<VoiceInput\b|<kai-voice-input/,
      );
    }
  });

  // ── a companion the scaffolder emits is a companion it accounts for ───────
  //
  // The rail was emitted as a bare `<kai-conversations>` under a "wire data props"
  // comment, and the main.ts beside it mentioned the tag zero times. A builder who
  // pastes that gets a working chat next to an empty grey column, with no error and
  // no clue. Wired, or declared unwired in words that name the property and the
  // event — nothing in between.

  it('does not emit a component it leaves unwired', async () => {
    const out = await scaffold.handler({
      components: ['kai-chat', 'kai-conversations'],
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;

    expect(text).toMatch(/kai-conversations/); // it is in the markup
    // ...so it must also be wired, or explicitly declared unwired
    const wired =
      /\.conversations\s*=/.test(text) &&
      /kai-conversation-select/.test(text);
    const declared = /NOT WIRED/.test(text);
    expect(
      wired || declared,
      'kai-conversations is emitted with neither wiring nor a NOT WIRED notice',
    ).toBe(true);
  });

  it('emits the composition the catalog states, not a different one', async () => {
    const out = await scaffold.handler({
      components: ['kai-chat', 'kai-conversations'],
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;

    // The recipe is the authority. Read it rather than restating its answer here,
    // so this test follows the catalog if the decision is ever revised.
    //
    // Read the STRUCTURED claim, not a substring of the whole record. A
    // `JSON.stringify(recipe).includes('sidebar')` probe answers true today off
    // the recipe's PROSE — `intent` opens "Full-screen chat with a conversations
    // sidebar" — so it would report a composition the record never made, and
    // would flip to "sibling" on a reword that changed no decision at all.
    const recipe = surfaceRecipes.find((r) => r.id === 'workspace-chat');
    expect(recipe, 'workspace-chat recipe is missing').toBeDefined();
    const placement = recipe?.composition?.find((c) => c.child === 'kai-conversations');

    if (placement) {
      // slotted: the rail goes INSIDE its parent, carrying that slot name
      expect(text).toMatch(new RegExp(`<${placement.child}[^>]*slot=["']${placement.slot}["']`));
      // …and INSIDE means inside: the attribute alone is satisfied by a sibling
      // that merely claims the slot, which renders nowhere.
      const open = text.indexOf(`<${placement.parent} `);
      const close = text.indexOf(`</${placement.parent}>`, open);
      expect(open, `${placement.parent} is not in the markup`).toBeGreaterThan(-1);
      expect(
        text.slice(open, close),
        `${placement.child} is not inside <${placement.parent}>`,
      ).toMatch(new RegExp(`<${placement.child}\\b`));
    } else {
      // sibling: then it must NOT claim the slot
      expect(text).not.toMatch(/slot=["']sidebar["']/);
    }
  });

  /**
   * Both ways a caller can ask for the rail.
   *
   * The second one is not a curiosity: `components` only ADVISES including
   * `kai-chat` (the schema says so) while every renderer emits the chat element
   * unconditionally, so a list that omits it is a shape real callers reach — and
   * the first version of this fix left it emitting the original defect verbatim,
   * bare tag and "wire data props" comment included, because the placement was
   * gated on `components.includes('kai-chat')`.
   */
  const RAIL_SURFACES = [['kai-chat', 'kai-conversations'], ['kai-conversations']] as const;

  it('every front end either wires the rail, declares it unwired, or does not draw it', async () => {
    // The html target is the one the brief's two tests drive. This is the same
    // rule over the other seven, and it is deliberately conditional on the tag
    // being DRAWN: solid renders Solid components rather than <kai-*>, so it
    // draws no rail at all — a fact worth stating rather than asserting around.
    for (const components of RAIL_SURFACES) {
      for (const framework of FRONTENDS_FOR_SURFACE) {
        const out = await scaffold.handler({
          components: [...components],
          integration: 'mock',
          placement: 'full-page',
          framework,
        });
        const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
        const drawn = /<kai-conversations|<Conversations\b/.test(front);
        if (!drawn) continue;
        const wired = /\.conversations\s*=|conversations=\{|:conversations\.prop|\[conversations\]/.test(front) &&
          /kai-conversation-select|onConversationSelect/.test(front);
        const declared = front.includes('NOT WIRED');
        const where = `${framework} × [${components.join(', ')}]`;
        expect(wired || declared, `${where}: the rail is drawn with neither wiring nor a NOT WIRED notice`).toBe(true);
        // The exact wording the old emit shipped, and the reason a builder
        // followed it into an empty rail. Its absence is the point.
        expect(front, `${where}: still emits the bare "wire data props" comment`).not.toContain(
          'wire data props',
        );
      }
    }
  });

  it('places the rail the same way whether or not the caller listed kai-chat', async () => {
    // The renderer emits <kai-chat> either way, so the composition cannot depend
    // on the caller having named it. Compared against the recipe, not against a
    // literal, for the same reason the composition test above is.
    const placement = surfaceRecipes
      .flatMap((r) => r.composition ?? [])
      .find((c) => c.child === 'kai-conversations');
    expect(placement, 'no composition record for kai-conversations').toBeDefined();
    for (const components of RAIL_SURFACES) {
      const out = await scaffold.handler({
        components: [...components],
        integration: 'mock',
        placement: 'full-page',
        framework: 'html',
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      const where = `[${components.join(', ')}]`;
      expect(text, `${where}: the rail is not slotted`).toMatch(
        new RegExp(`<${placement!.child}[^>]*slot=["']${placement!.slot}["']`),
      );
      const open = text.indexOf(`<${placement!.parent} `);
      expect(
        text.slice(open, text.indexOf(`</${placement!.parent}>`, open)),
        `${where}: the rail is not inside <${placement!.parent}>`,
      ).toMatch(new RegExp(`<${placement!.child}\\b`));
    }
  });

  it('every archetype is DATA: its preset render equals renderSurface over its own components', async () => {
    // There must be exactly one renderer. If a preset-keyed fast path is ever
    // added, these two stop matching. Byte-identical on the FRONT-END block: the
    // preset's title/id live only in the provenance header above it, so this
    // comparison is exact rather than normalized.
    for (const preset of listArchetypes()) {
      for (const framework of FRONTENDS_FOR_SURFACE) {
        const viaPreset = await scaffold.handler({
          useCase: preset.id,
          integration: 'openrouter',
          placement: 'full-page',
          framework,
        });
        const viaComponents = await scaffold.handler({
          components: preset.components,
          integration: 'openrouter',
          placement: 'full-page',
          framework,
        });
        const a = (viaPreset.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
        const b = (viaComponents.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
        // The header differs on purpose (it carries the preset's provenance), so
        // compare from the front-end marker down.
        const front = (s: string) => s.slice(s.indexOf('=== (1)'));
        expect(front(a), `${preset.id} × ${framework}: preset renders a different surface`).toBe(front(b));
      }
    }
  });

  it('components wins over useCase when both are given', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      components: ['kai-chat', 'kai-sources'],
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
    expect(front).toMatch(/<Sources\b/);
  });

  it('rejects a request naming neither components nor useCase, and points at both', async () => {
    const out = await scaffold.handler({
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/no surface given/i);
    // The rejection has to teach the real axis, not just the six preset ids —
    // otherwise a harness learns the presets and asks for the nearest one forever.
    expect(text).toMatch(/components/);
    expect(text).toMatch(/drop-in-chat/);
  });

  // ── added coverage ───────────────────────────────────────────────────────

  it('rejects an unknown useCase with the valid archetype list', async () => {
    const out = await scaffold.handler({
      useCase: 'nope',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/unknown use ?case|valid use ?cases|valid archetypes/i);
    // names a real archetype id so the harness can self-correct
    expect(text).toMatch(/drop-in-chat/);
  });

  it('docked-widget placement produces a fixed, sized container', async () => {
    const out = await scaffold.handler({
      useCase: 'support-widget',
      integration: 'openrouter',
      placement: 'docked-widget',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/<kai-chat/);
    // a docked widget is a fixed, sized box (not the full-page `height: 100dvh`)
    expect(text).toMatch(/position:\s*fixed/);
    expect(text).toMatch(/width:\s*\d/);
    expect(text).toMatch(/height:\s*\d/);
    expect(text).not.toMatch(/height:\s*100dvh/);
  });

  /**
   * full-page has to be full-page in a STOCK starter, not just in an empty page.
   *
   * `height: 100dvh` was full-page only when nothing above it interfered, and in
   * the templates consumers actually run something always did: Vite's `react-ts`
   * caps and centres `#root` (measured: chat at x=78, 1124px wide, text-align
   * computed `center`), and the official TanStack Start starter wraps every route
   * in a Header + Footer (measured: composer bottom 813px against an 800px
   * viewport — 13px below the fold). Both are fixed at once by taking the surface
   * out of flow, which is why this asserts the mechanism and not just the numbers.
   *
   * Every framework, because the whole point of the fix is that it is NOT a
   * per-framework patch.
   */
  it('full-page escapes the stock starter chrome in every framework (fixed + inset + z-index + text-align)', async () => {
    /**
     * Asserted against the emitted STYLE DECLARATION, never the whole scaffold.
     *
     * The first draft of this test matched `position:\s*fixed` (and inset, and
     * text-align, and `placement: "inline"`) anywhere in the output — and every
     * one of those passed against the UNFIXED scaffolder, because the comment
     * this fix also adds talks about all four. Four assertions out of six were
     * reading the prose that describes the fix instead of the fix. Pinning the
     * exact declaration per syntax family is what makes this discriminate.
     */
    const EXPECTED: Record<string, string> = {
      // html / vue / svelte / angular emit a CSS string.
      css: 'position: fixed; inset: 0; display: flex; flex-direction: column; text-align: start; z-index: 90;',
      // react / next / tanstack-start emit a camelCased React style object.
      jsx: "position: 'fixed', inset: '0', display: 'flex', flexDirection: 'column', textAlign: 'start', zIndex: '90'",
      // solid's style prop is csstype's HYPHENATED set, applied via setProperty.
      solid:
        "'position': 'fixed', 'inset': '0', 'display': 'flex', 'flex-direction': 'column', 'text-align': 'start', 'z-index': '90'",
    };
    const FAMILY: Record<string, keyof typeof EXPECTED> = {
      html: 'css', vue: 'css', svelte: 'css', angular: 'css',
      react: 'jsx', next: 'jsx', 'tanstack-start': 'jsx',
      solid: 'solid',
    };

    for (const framework of Object.keys(FAMILY)) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'mock',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      const decl = EXPECTED[FAMILY[framework]];

      // Out of flow (an ancestor's width cap, padding and flex centring stop
      // applying, and a sibling header/footer stops consuming height), pinned to
      // all four edges, un-centred (text-align INHERITS through the shadow
      // boundary regardless of positioning), and stacked above a sticky header
      // (TanStack's is `sticky top-0 z-50`).
      expect(text, `${framework}: full-page container style must be exactly \`${decl}\``).toContain(decl);

      // The old value is GONE from the code, not merely supplemented. Scoped to
      // the emitted style attributes/objects: the explanatory comment names
      // `height: 100dvh` on purpose, and must not satisfy this.
      const styles = [
        ...text.matchAll(/style=(?:"([^"]*)"|\{\{([^}]*)\}\})/g),
      ].map((m) => m[1] ?? m[2]);
      expect(styles.length, `${framework}: no style declaration found to check`).toBeGreaterThan(0);
      for (const s of styles) {
        expect(s, `${framework}: 100dvh is the defect, not the fix`).not.toMatch(/100dvh/);
      }

      // And it has to SAY so, because the trade (it covers your nav) is real.
      expect(text, `${framework}: must state the trade and point at 'inline'`).toContain(
        'Want the chat to sit INSIDE your own layout instead? Use placement: "inline".',
      );
    }
  });

  /**
   * Svelte 5 RUNES, not Svelte 4.
   *
   * The scaffold used to emit `$:` and `on:kai-submit` and claim in a comment that
   * it "works in Svelte 5 via legacy mode". That claim expired: `sv create` writes
   * `runes: true` project-wide into its vite.config.ts, where `$:` is a hard error
   * in BOTH svelte-check and vite build — measured on a fresh app:
   *   "`$:` is not allowed in runes mode, use `$derived` or `$effect` instead".
   *
   * Every archetype, because the sources companion carried its own `$:` block.
   */
  it('svelte emits Svelte 5 runes, never Svelte 4 syntax (sv create forces runes mode)', async () => {
    // `artifact-split`, not `workspace`: the workspace preset is the BLOCK now
    // (multi-thread store, no single `messages`/`loading` state) — its own runes
    // discipline is pinned in the workspace-BLOCK describe at the bottom.
    for (const useCase of ['drop-in-chat', 'knowledge-base', 'agentic', 'artifact-split'] as const) {
      for (const integration of ['mock', 'openrouter'] as const) {
        const out = await scaffold.handler({ useCase, integration, placement: 'full-page', framework: 'svelte' });
        const text = (out.content as { type: string; text: string }[])[0].text;
        const front = text.split('=== (2) BACKEND ROUTE ===')[0];
        const label = `${useCase}/${integration}`;

        // No legacy reactive statement anywhere, including the sources block.
        expect(front, `${label}: \`$:\` is a hard error in runes mode`).not.toMatch(/^\s*\$:/m);
        // No legacy event directive: `on:` is deprecated in runes mode and warns.
        expect(front, `${label}: on: directive is deprecated in runes mode`).not.toMatch(/\son:[a-z-]+=\{/);
        expect(front, `${label}: the submit listener must be an on* attribute`).toContain(
          'onkai-submit={onSubmit}',
        );
        // Runes for every binding that is written to.
        expect(front, `${label}: reactivity must be $effect`).toMatch(/\$effect\(\(\) => \{/);
        expect(front, `${label}: messages must be raw state (new array per chunk)`).toContain(
          'let messages = $state.raw<ChatMessage[]>(',
        );
        expect(front, `${label}: bind:this target must be $state under runes`).toContain(
          'let chatEl = $state<KaiChatElement | undefined>(undefined)',
        );
        expect(front, `${label}: loading is reassigned, so it must be $state`).toContain(
          'let loading = $state(false)',
        );
        // And the stale claim must be gone.
        expect(front, `${label}: still claims legacy mode works`).not.toMatch(/legacy mode/i);
      }
    }
  });

  /**
   * SvelteKit reads secrets through `$env/dynamic/private`, not `process.env`.
   *
   * A fresh `sv create` app installs no `@types/node`, so `process` is not a name
   * that exists. Measured on that app: `svelte-check` reports
   * "Cannot find name 'process'. Do you need to install type definitions for
   * node?" — 1 error before, 0 after.
   *
   * (That reproduction needs care: a `node_modules` symlink anywhere ABOVE the app
   * puts @types/node back in scope, because TypeScript walks up for @types, and
   * the error silently disappears.)
   */
  it('the svelte route reads env through $env/dynamic/private, not process.env', async () => {
    // Every integration whose portable handler reads an env var.
    for (const integration of ['openrouter', 'cloudflare', 'mastra'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat', integration, placement: 'full-page', framework: 'svelte',
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      const route = text.split('=== (2) BACKEND ROUTE ===')[1].split('=== (3)')[0];
      const code = route.split('\n').filter((l) => !l.startsWith('#')).join('\n');

      expect(code, `${integration}: missing the $env import`).toContain(
        "import { env } from '$env/dynamic/private';",
      );
      expect(code, `${integration}: still reads process.env — TS2580 without @types/node`).not.toMatch(
        /\bprocess\.env\./,
      );
    }
  });

  /**
   * ...and ONLY svelte. `process.env` is correct for every other host: Next, the
   * Vite middleware and Express all run on Node with @types/node installed, and
   * the Worker route's own comment prescribes nodejs_compat. Rewriting those would
   * be a regression, so the rewrite has to be scoped to the framework that needs it.
   */
  it('the $env rewrite does not leak into the other hosts', async () => {
    for (const framework of ['next', 'react', 'express', 'worker'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat', integration: 'openrouter', placement: 'full-page', framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      const route = text.split('=== (2) BACKEND ROUTE ===')[1].split('=== (3)')[0];
      expect(route, `${framework}: got SvelteKit's $env import`).not.toContain('$env/dynamic/private');
      expect(route, `${framework}: lost its process.env access`).toMatch(/\bprocess\.env\./);
    }
  });

  /**
   * SCAF-3: Vue's isCustomElement is its own emitted STEP, not a buried comment.
   *
   * It used to be an HTML comment above the `<script setup>` block — and block (1)
   * IS a `<script setup>` + `<template>` pair, so anyone copying "the component"
   * copies past it. Verified in a stock `create-vite vue-ts` app: skipping it logs
   * `[Vue warn]: Failed to resolve component: kai-chat`, and applying block (0)
   * clears it.
   *
   * (Measured honestly: the app still RENDERS without it — Vue falls back to a
   * native element — so this asserts the warning and the step, not a blank page.)
   */
  it('vue emits isCustomElement as its own setup block, ahead of the component', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page', framework: 'vue',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;

    expect(text).toContain('=== (0) REQUIRED SETUP — do this FIRST ===');
    // It has to come BEFORE the front end, or it is the same buried note again.
    expect(text.indexOf('=== (0) REQUIRED SETUP')).toBeLessThan(text.indexOf('=== (1) FRONT-END'));

    const setup = text.split('=== (0) REQUIRED SETUP — do this FIRST ===')[1].split('=== (1) FRONT-END')[0];
    // A real, complete, pasteable vite.config.ts — not a prose fragment.
    expect(setup).toContain("import vue from '@vitejs/plugin-vue';");
    expect(setup).toContain("import { defineConfig } from 'vite';");
    expect(setup).toContain("isCustomElement: (tag) => tag.startsWith('kai-'),");
    // And it must name the warning it removes, in Vue's own words.
    expect(setup).toContain('[Vue warn]: Failed to resolve component: kai-chat');

    // No other framework gets a block (0) it does not need.
    for (const framework of ['react', 'svelte', 'html', 'angular', 'solid', 'next'] as const) {
      const other = await scaffold.handler({
        useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page', framework,
      });
      const otherText = (other.content as { type: string; text: string }[])[0].text;
      expect(otherText, `${framework}: unexpected block (0)`).not.toContain('=== (0) REQUIRED SETUP');
    }
  });

  /**
   * TS2835: relative imports in the emitted Vite-middleware route need explicit
   * extensions, because the stock `tsconfig.node.json` is `"module": "nodenext"`.
   *
   * Measured in stock create-vite react-ts AND vue-ts apps:
   *   vite.config.ts(1,31): error TS2835: Relative import paths need explicit
   *   file extensions ... Did you mean './vite-chat-api.js'?
   * `.js` is the correct form even though the file is `.ts` — tsc maps it, and so
   * does Vite's config loader (proved by POST /api/chat answering 401 from the
   * provider rather than 404).
   *
   * The handler also moves OUT of `src/`: a create-vite app's tsconfig.app.json is
   * `"include": ["src"]` with no node types, so `src/server/chat.ts` was compiled
   * by the BROWSER project too and failed TS2591 on `process`.
   */
  it('the vite-middleware route uses extensioned imports and keeps the handler out of src/', async () => {
    for (const framework of ['react', 'vue', 'solid'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat', integration: 'openrouter', placement: 'full-page', framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      const route = text.split('=== (2) BACKEND ROUTE ===')[1].split('=== (3)')[0];

      // Explicit extensions, in the live import AND in the commented vite.config
      // guidance a consumer uncomments.
      expect(route, `${framework}: live handler import needs an extension`).toContain(
        "import { chatHandler } from './server/chat.js';",
      );
      expect(route, `${framework}: vite.config guidance needs an extension`).toContain(
        "// import { chatApiPlugin } from './vite-chat-api.js';",
      );
      expect(route, `${framework}: extensionless import is TS2835 under nodenext`).not.toMatch(
        /from '\.\/(vite-chat-api|server\/chat)'/,
      );

      // The handler must not live under src/, where the browser tsconfig claims it.
      expect(route, `${framework}: handler under src/ is TS2591 on process`).not.toContain(
        'src/server/chat',
      );
      expect(route, `${framework}: handler file path`).toContain('// server/chat.ts');
    }
  });

  it('falls back to a usable route when the framework has no exact template', async () => {
    // pydantic-ai only ships a fastapi template; asking for `next` (ts) should
    // still emit its python fastapi route rather than failing.
    const out = await scaffold.handler({
      useCase: 'support-widget',
      integration: 'pydantic-ai',
      placement: 'inline',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/from fastapi|uvicorn|run_stream/);
  });

  // ── Bug-fix regression tests ─────────────────────────────────────────────

  it('react scaffold uses the @kitn.ai/ui/react wrapper and correct onSubmit prop', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must import from the official React wrapper package
    expect(text).toContain('@kitn.ai/ui/react');
    // Must wire the event via the wrapper's onSubmit prop
    expect(text).toContain('onSubmit');
    // Must NOT use the invalid JSX hyphenated event attribute
    expect(text).not.toContain('onKai-submit');
  });

  it('next scaffold uses the @kitn.ai/ui/react wrapper (via dynamic) and correct onSubmit prop', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // @kitn.ai/ui/react appears inside the dynamic() call, not as a top-level import
    expect(text).toContain('@kitn.ai/ui/react');
    expect(text).toContain('onSubmit');
    expect(text).not.toContain('onKai-submit');
  });

  it('react scaffold page component is named App, not Chat (no import/export collision)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Page component must be App — not Chat — to avoid shadowing the imported Chat wrapper
    expect(text).toContain('export default function App(');
    expect(text).not.toMatch(/function Chat\(/);
  });

  it('next scaffold page component is named App, not Chat (no import/export collision)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('export default function App(');
    expect(text).not.toMatch(/function Chat\(/);
  });

  it('svelte scaffold uses correct on:kai-submit syntax and bind:this property pattern', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'docked-widget',
      framework: 'svelte',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must use the correct Svelte custom-event listener syntax
    expect(text).toContain('on:kai-submit');
    // Must use bind:this to get the element reference (the correct Svelte pattern)
    expect(text).toContain('bind:this');
    // Must NOT use the malformed bind: .messages attribute pattern
    expect(text).not.toContain('bind: .messages');
  });

  // ── Field-test fixes (Bucket A) ──────────────────────────────────────────

  // Issue 3 — `side` must be a full-height docked panel, distinct from the bubble.
  it("placement 'side' emits a full-height docked side panel (100dvh), not the bottom-right bubble", async () => {
    const side = (
      await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'side',
        framework: 'html',
      })
    ).content as { type: string; text: string }[];
    const sideText = side[0].text;

    // full-height, docked to the trailing edge
    expect(sideText).toMatch(/height:\s*100dvh/);
    expect(sideText).toMatch(/inset-inline-end:\s*0/);
    // NOT the floating bottom-right bubble
    expect(sideText).not.toMatch(/bottom:\s*1\.5rem/);
    // chat fills its container
    expect(sideText).toMatch(/<kai-chat/);
  });

  it("'side' and 'docked-widget' produce DISTINCT layouts", async () => {
    const read = async (placement: string) =>
      (
        (
          await scaffold.handler({
            useCase: 'support-widget',
            integration: 'openrouter',
            placement,
            framework: 'html',
          })
        ).content as { type: string; text: string }[]
      )[0].text;

    const side = await read('side');
    const docked = await read('docked-widget');

    // distinct output
    expect(side).not.toEqual(docked);
    // side = full-height, edge-docked
    expect(side).toMatch(/height:\s*100dvh/);
    expect(side).toMatch(/inset-inline-end:\s*0/);
    expect(side).not.toMatch(/bottom:\s*1\.5rem/);
    // docked-widget = bottom-right floating bubble (sized box, not 100dvh height)
    expect(docked).toMatch(/position:\s*fixed/);
    expect(docked).toMatch(/bottom:\s*1\.5rem/);
    expect(docked).toMatch(/inset-inline-end:\s*1\.5rem/);
    expect(docked).not.toMatch(/height:\s*100dvh/);
  });

  // Issue 6 — wire suggestions (with a default when omitted).
  it('passes through caller suggestions + emits suggestionMode (react)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
      suggestions: ["What's new?", 'Ask for help?'],
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("What's new?");
    expect(text).toContain('Ask for help?');
    expect(text).toContain('suggestions={suggestions}');
    expect(text).toContain('suggestionMode="submit"');
  });

  it('emits default suggestions when none are passed', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // the default pair so the feature always shows
    expect(text).toContain("What's new?");
    expect(text).toContain('How can you help?');
    expect(text).toMatch(/suggestionMode="submit"|suggestionMode='submit'/);
  });

  it('emits suggestions across every front-end framework', async () => {
    for (const framework of ['html', 'react', 'next', 'vue', 'svelte'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
        suggestions: ['Unique-Suggestion-Token'],
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      expect(text, `${framework}: suggestion not emitted`).toContain('Unique-Suggestion-Token');

      if (framework === 'react' || framework === 'next') {
        // React wrappers receive camelCase props
        expect(text, `${framework}: suggestionMode prop not emitted`).toContain('suggestionMode');
      } else {
        // html / svelte / vue — must use the kebab attribute the custom element observes
        expect(text, `${framework}: kebab suggestion-mode not emitted`).toContain('suggestion-mode');
        // Guard: camelCase static attribute would be inert on a CE (DOM ignores case)
        expect(text, `${framework}: dead camelCase suggestionMode= attribute present`).not.toMatch(
          /suggestionMode=/,
        );
      }
    }
  });

  // Issue 1 / Issue 4 — react/next MUST register elements before the wrappers.
  it("react output imports '@kitn.ai/ui/elements' BEFORE '@kitn.ai/ui/react'", async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const elementsIdx = text.indexOf("import '@kitn.ai/ui/elements'");
    const reactIdx = text.indexOf("from '@kitn.ai/ui/react'");
    expect(elementsIdx).toBeGreaterThanOrEqual(0);
    expect(reactIdx).toBeGreaterThanOrEqual(0);
    expect(elementsIdx).toBeLessThan(reactIdx);
  });

  // SCAF-6: next uses next/dynamic { ssr: false } — no top-level @kitn.ai/ui/elements or
  // @kitn.ai/ui/react import. NOT because importing them on the server crashes (both
  // entries are SSR-import-safe): <kai-*> are client-only custom elements, so a
  // server-rendered tag never upgrades and mismatches on hydration.
  it('next scaffold uses next/dynamic with ssr:false and has NO top-level elements/react import (SCAF-6)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must use next/dynamic
    expect(text).toContain("import dynamic from 'next/dynamic'");
    // Must set ssr: false
    expect(text).toContain('ssr: false');
    // @kitn.ai/ui/react must appear only inside dynamic() — not as a standalone top-level import
    expect(text).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+'@kitn\.ai\/ui\/react'/m);
    // No top-level @kitn.ai/ui/elements (the dynamic import of /react self-registers on client)
    expect(text).not.toMatch(/^import\s+'@kitn\.ai\/ui\/elements'/m);
  });

  // SCAF-6 (contrast): plain react (Vite) STILL uses top-level imports — unchanged.
  it('react (Vite) scaffold still has top-level import { Chat } from @kitn.ai/ui/react (unchanged by SCAF-6)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must have a top-level named import from @kitn.ai/ui/react
    expect(text).toMatch(/^import\s+\{[^}]*\}\s+from\s+'@kitn\.ai\/ui\/react'/m);
    // Must NOT use next/dynamic (no SSR concern in Vite)
    expect(text).not.toContain("import dynamic from 'next/dynamic'");
  });

  // SCAF-7: react and next mock onSubmit must emit role: 'user' as const / role: 'assistant' as const
  // so the literal doesn't widen to `string` under strict TS.
  it('react mock scaffold emits role as const for strict-TS message literals (SCAF-7)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("role: 'user' as const");
    // No assistant literal to narrow any more: createAssistantStream builds the
    // in-flight assistant message itself, so the scaffold only ever writes the
    // USER one. Asserting an 'assistant' literal here would now be asserting a
    // hand-rolled message the mock no longer needs to construct.
    expect(text).not.toContain("role: 'assistant'");
  });

  it('next mock scaffold emits role as const for strict-TS message literals (SCAF-7)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("role: 'user' as const");
    // No assistant literal to narrow any more: createAssistantStream builds the
    // in-flight assistant message itself, so the scaffold only ever writes the
    // USER one. Asserting an 'assistant' literal here would now be asserting a
    // hand-rolled message the mock no longer needs to construct.
    expect(text).not.toContain("role: 'assistant'");
  });

  // SCAF-13A: vue mock scaffold must emit role as const (strict-TS union narrowing)
  it('vue mock scaffold emits role as const for strict-TS message literals (SCAF-13A)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'vue',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("role: 'user' as const");
    // No assistant literal to narrow any more: createAssistantStream builds the
    // in-flight assistant message itself, so the scaffold only ever writes the
    // USER one. Asserting an 'assistant' literal here would now be asserting a
    // hand-rolled message the mock no longer needs to construct.
    expect(text).not.toContain("role: 'assistant'");
  });

  // SCAF-13B: svelte scaffold must type chatEl as KaiChatElement (not bare HTMLElement)
  // so property assignment passes svelte-check without consumer edits.
  it('svelte scaffold types chatEl as KaiChatElement (not bare HTMLElement) for svelte-check (SCAF-13B)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'svelte',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must import the typed element interface from the library
    expect(text).toContain("import type { KaiChatElement } from '@kitn.ai/ui/elements'");
    // Must use KaiChatElement, not bare HTMLElement, so property access is typed
    // Runes: `bind:this` writes to the binding, so it must be $state — but it still
    // has to be the kit's ELEMENT type, not a bare HTMLElement, or `chatEl.messages`
    // is TS2339 under svelte-check.
    expect(text).toContain('let chatEl = $state<KaiChatElement | undefined>(undefined)');
    expect(text).not.toContain('$state<HTMLElement | undefined>');
  });

  /**
   * SCAF-7 inverted. The html target used to be plain JS in an inline script, so
   * `as const` was a syntax error and this test asserted its absence. The logic is
   * a real `src/main.ts` now — the whole point being that the consumer's own
   * `tsc && vite build` checks it — so the strict-TS narrowing is REQUIRED, and
   * its absence is the defect: without it `role: 'user'` widens to `string` and
   * the assignment to `chat.messages` fails TS2322.
   */
  it('html mock scaffold emits `as const` on role literals — src/main.ts is TypeScript (SCAF-7)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("role: 'user' as const");
    // No assistant literal to narrow any more: createAssistantStream builds the
    // in-flight assistant message itself, so the scaffold only ever writes the
    // USER one. Asserting an 'assistant' literal here would now be asserting a
    // hand-rolled message the mock no longer needs to construct.
    expect(text).not.toContain("role: 'assistant'");
  });

  // Issue 4 — mock integration streams client-side with zero config.
  it("integration 'mock' streams client-side (no /api fetch) and renders a Chat", async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'side',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // renders a kai-chat surface (React wrapper)
    expect(text).toMatch(/<Chat\b|<kai-chat/);
    // The FRONT END makes no backend call — not even a commented-out one, which
    // is why the "go live" note points at re-scaffolding rather than pasting a
    // request in a comment. Scoped to block (1) since G-04: block (2) now ships
    // the optional route, whose Vite-middleware wrapper mentions fetch in prose.
    const front = text.split('=== (2) BACKEND ROUTE ===')[0];
    expect(front).not.toContain("fetch('/api");
    // the reply comes from the kit's shared responder, not a copy in this file
    expect(front).toContain('createMockResponder()');
    // the run note still says the app needs no backend; the route is optional
    expect(text).toMatch(/No backend or API key needed/i);
    expect(text).toContain('# OPTIONAL');
  });

  it("integration 'mock' (html) streams a canned reply without fetch", async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Scoped to the front end since G-04 — block (2) now carries the optional route.
    const front = text.split('=== (2) BACKEND ROUTE ===')[0];
    expect(front).toMatch(/<kai-chat/);
    expect(front).not.toContain("fetch('/api");
    // The cadence lives in the responder now, not in a setTimeout loop pasted
    // into the consumer's file — that inlined loop is what drifted seven ways.
    expect(front).not.toMatch(/setTimeout/);
    expect(front).toContain('const res = mockResponse(value);');
  });

  // ── G-04: the mock BACKEND route ────────────────────────────────────────
  //
  // Rung-2 finding G-04 (S2), recurring since rung 1: both clean-room builders
  // were told "replies come from a local dev endpoint that streams a mocked
  // response" and had to hand-invent the server side, because `mock` was the one
  // integration whose block (2) held prose where every other integration ships
  // code — the kit's createMockResponder existed and no scaffold emitted a route
  // serving its frames. The mock now gets the SAME treatment as a real
  // integration: a portable webRoute that streams the responder's frames, wrapped
  // by the identical per-framework adapters (Vite middleware for the SPA
  // frameworks, POST exports for next/svelte/tanstack, the Express/Worker/Angular
  // hosts). The front end is unchanged — it still streams locally with no fetch —
  // so the route has to say it is optional.
  describe('mock backend route (G-04)', () => {
    const blockTwo = (out: unknown): string => {
      const text = (out as { content: { text: string }[] }).content[0].text;
      const block = text.split('=== (2) BACKEND ROUTE ===')[1]?.split(/^=== \(3\)/m)[0];
      expect(block, 'no backend block emitted at all').toBeDefined();
      return block as string;
    };
    /** Code lines only: the scaffolder's `#` prose and `//` comments are commentary. */
    const codeOf = (block: string): string =>
      block
        .split('\n')
        .filter((l) => !l.startsWith('#') && !l.trim().startsWith('//'))
        .join('\n');

    it('react: block (2) is the Vite dev-middleware route streaming responder frames', async () => {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page', framework: 'react',
      });
      const block = blockTwo(out);
      expect(block).toContain('# Runtime: Vite dev-server middleware (Node)');
      expect(block).toContain('configureServer(server)');
      // The frames come from the kit's shared responder, never a copy pasted
      // into the consumer's file — the same rule the front end is held to.
      expect(block).toContain('createMockResponder()');
      expect(block).toContain(`from '@kitn.ai/ui/state'`);
      // No upstream: the mock IS the backend. A fetch appearing here means the
      // mock quietly acquired a network dependency.
      expect(codeOf(block)).not.toMatch(/\bfetch\s*\(/);
      // No hand-rolled SSE framing either: the responder yields complete frames.
      expect(codeOf(block)).not.toMatch(/data: \$\{/);
    });

    it('next: the same portable handler behind a POST export', async () => {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page', framework: 'next',
      });
      const block = blockTwo(out);
      expect(block).toContain('# Runtime: Next.js route handler (Node/Edge)');
      expect(block).toContain('export async function POST');
      expect(block).toContain('createMockResponder()');
    });

    it('svelte: a real +server.ts RequestHandler, not a bare Request handler', async () => {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page', framework: 'svelte',
      });
      const block = blockTwo(out);
      expect(block).toContain('# Runtime: SvelteKit +server.ts endpoint');
      expect(block).toContain('export const POST: RequestHandler');
    });

    it('every framework with a route adapter gets an exact mock route', async () => {
      const expected = [
        ['react', 'Vite dev-server middleware (Node)'],
        ['vue', 'Vite dev-server middleware (Node)'],
        ['solid', 'Vite dev-server middleware (Node)'],
        ['next', 'Next.js route handler (Node/Edge)'],
        ['svelte', 'SvelteKit +server.ts endpoint'],
        ['tanstack-start', 'TanStack Start server route'],
        ['angular', 'Angular SSR server (Express, src/server.ts)'],
        ['express', 'Express handler (Node)'],
        ['worker', 'Cloudflare Worker'],
      ] as const;
      for (const [framework, runtime] of expected) {
        const out = await scaffold.handler({
          useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page', framework,
        });
        const block = blockTwo(out);
        expect(block, `${framework}: expected an exact route`).toContain(`# Runtime: ${runtime}`);
        expect(block, `${framework}: the route must stream the kit's responder`).toContain(
          'createMockResponder()',
        );
      }
    });

    it('the block says the route is OPTIONAL — the front end still streams locally', async () => {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page', framework: 'react',
      });
      const block = blockTwo(out);
      // The claim that keeps the zero-config story honest: nothing about the
      // emitted app REQUIRES this route to run.
      expect(block).toMatch(/OPTIONAL/);
      expect(block).toMatch(/streams its reply locally/);
    });

    it('html: the handler is still emitted (hosted elsewhere), without the self-referential mock tip', async () => {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page', framework: 'html',
      });
      const block = blockTwo(out);
      // A static page cannot host it, so the express-hosted fallback + warning.
      expect(block).toContain('will NOT run');
      expect(block).toContain('createMockResponder()');
      // "use integration: mock" is advice FOR mock — pointless here.
      expect(block).not.toContain('or use integration: "mock"');
      // The escape hatch it offers instead is the truth: the front end already runs.
      expect(block).toMatch(/or ignore it/i);
    });
  });

  // ── Round-1 field-test fix regressions ──────────────────────────────────

  // SCAF-1: All frameworks must emit theme.tokens.css, never bare theme.css (LIB-1 / ENOENT)
  it('emits theme.tokens.css (not bare theme.css) across all front-end frameworks', async () => {
    for (const framework of ['html', 'react', 'next', 'vue', 'svelte'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      // Must reference the compiled tokens file
      expect(text, `${framework}: missing theme.tokens.css`).toContain('@kitn.ai/ui/theme.tokens.css');
      // Must NOT import bare theme.css (it @imports tw-animate-css which is a devDep → ENOENT)
      expect(text, `${framework}: emitted bare theme.css`).not.toMatch(
        /import ['"]@kitn\.ai\/ui\/theme\.css['"]/,
      );
    }
  });

  // SCAF-2: Next.js App Router requires 'use client'; plain react (Vite) must NOT have it.
  it("next scaffold starts with 'use client'", async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // 'use client' must be the FIRST line of the emitted front-end code (immediately after the section header)
    const frontendStart = text.indexOf('=== (1) FRONT-END');
    const afterHeader = text.slice(frontendStart).replace(/^=== \(1\) FRONT-END[^\n]*\n\n/, '');
    expect(afterHeader.trimStart().startsWith("'use client'")).toBe(true);
  });

  it("react (Vite) scaffold does NOT include 'use client'", async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toContain("'use client'");
  });

  // SCAF-3: Vue scaffold must mention isCustomElement so Vue consumers aren't stuck.
  it('vue scaffold mentions isCustomElement for kai-* custom elements', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'vue',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('isCustomElement');
    expect(text).toContain("tag.startsWith('kai-')");
  });

  // Issue 4 — honest backend note when react has no matching server route.
  it('react + a no-react-template integration warns that a Vite SPA has no /api route', async () => {
    // pydantic-ai only ships a fastapi template; asking for react (Vite) must warn.
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'pydantic-ai',
      placement: 'inline',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // mentions the Vite SPA / no /api limitation and the escape hatches
    expect(text).toMatch(/Vite SPA|no \/api/i);
    expect(text).toMatch(/mock|express|next/i);
  });

  // ── SCAF-8: real-backend front-end must include `model` in POST body ──────

  it('SCAF-8: openrouter (next) front-end includes model const and sends it in the fetch body', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must emit a model const the dev can change
    expect(text).toMatch(/const model = ['"]openai\/gpt-4o-mini['"]/);
    // Must include model in the POST body (not just { messages: ... })
    expect(text).toMatch(/body: JSON\.stringify\(\{[^}]*model[^}]*messages/s);
  });

  it('SCAF-8: openrouter (react) front-end includes model const and sends it in the fetch body', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/const model = ['"]openai\/gpt-4o-mini['"]/);
    expect(text).toMatch(/body: JSON\.stringify\(\{[^}]*model[^}]*messages/s);
  });

  it('SCAF-8: mock integration does NOT emit a model const (client-side only, no fetch)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // mock never fetches /api — no model const should appear. The no-fetch half
    // is scoped to the front end since G-04 (block (2) now carries the optional
    // route, whose Vite-middleware wrapper mentions fetch in prose); the
    // no-model-const half stays whole-output, because the route must not grow
    // one either — the mock forwards nothing.
    expect(text).not.toMatch(/const model = /);
    expect(text.split('=== (2) BACKEND ROUTE ===')[0]).not.toContain("fetch('/api");
  });

  // ── SCAF-9: agentic archetype must not emit bare propless companion elements ─

  it('SCAF-9: agentic (react) does NOT emit bare <Reasoning> or <Tool> siblings without props', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'openrouter',
      placement: 'side',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must NOT have a bare propless <Reasoning /> or <Tool /> sibling
    expect(text).not.toMatch(/<Reasoning\s*\/>/);
    expect(text).not.toMatch(/<Tool\s*\/>/);
    // Must NOT have a bare kai-reasoning or kai-tool element without props
    expect(text).not.toMatch(/<kai-reasoning\s*>/);
    expect(text).not.toMatch(/<kai-tool\s*>/);
  });

  it('SCAF-9: agentic (react) explains where tool + reasoning parts come from', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'openrouter',
      placement: 'side',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must say tool/reasoning are PARTS on a message, not sibling elements
    expect(text).toMatch(/tools|reasoning/i);
    // Must still render kai-chat (the root component)
    expect(text).toMatch(/<Chat\b/);
  });

  it('SCAF-9: agentic (html) does NOT emit bare <kai-tool> or <kai-reasoning> siblings', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'openrouter',
      placement: 'side',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toMatch(/<kai-tool><\/kai-tool>/);
    expect(text).not.toMatch(/<kai-reasoning><\/kai-reasoning>/);
    // Must seed the sample message in the script
    expect(text).toMatch(/SCAF-9|tools.*reasoning|reasoning.*tools/is);
    expect(text).toMatch(/<kai-chat/);
  });

  // ── SCAF-10: Vue/Svelte typed messages + .prop binding; HTML DOMContentLoaded ──

  it('SCAF-10: vue output uses .prop modifier for :messages and :suggestions', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'vue',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must bind array/object props via Vue .prop modifier so they're set as DOM properties
    expect(text).toContain(':messages.prop=');
    expect(text).toContain(':suggestions.prop=');
    // Must emit a ChatMessage type for strict-TS consumers
    expect(text).toContain('type ChatMessage');
    // Must use lang="ts" on the script block
    expect(text).toContain('<script setup lang="ts">');
    // Must type the ref and onSubmit
    expect(text).toMatch(/ref<ChatMessage\[\]>/);
    expect(text).toContain('onSubmit(e: CustomEvent<{ value: string }>)');
  });

  it('SCAF-10: svelte output declares typed messages: ChatMessage[]', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'svelte',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must use lang="ts" on the script block
    expect(text).toContain('<script lang="ts">');
    // Must emit a ChatMessage type
    expect(text).toContain('type ChatMessage');
    // Must declare messages with explicit type
    expect(text).toContain('let messages = $state.raw<ChatMessage[]>([])');
    // Must type the onSubmit handler
    expect(text).toContain('onSubmit(e: CustomEvent<{ value: string }>)');
  });

  /**
   * SCAF-10 restated for a module.
   *
   * The DOMContentLoaded / readyState dance existed because an inline
   * `<script type="module">` could be pasted into `<head>` and run before the
   * body was parsed. An EXTERNAL `<script type="module" src=…>` is deferred by
   * spec, so the DOM is always parsed by the time it runs and that guard is dead
   * code with a comment that is no longer true. What still has to hold is the
   * thing the guard was protecting: the element lookup happens inside a function,
   * after the custom-element upgrade, and the listener is wired.
   */
  for (const integration of ['mock', 'openrouter'] as const) {
    it(`SCAF-10: html (${integration}) defers element access into init(), loaded as a deferred module`, async () => {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration,
        placement: 'full-page',
        framework: 'html',
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      expect(text).toContain('async function init()');
      // The upgrade wait is the real protection — a property set on a
      // not-yet-upgraded element is dropped.
      expect(text).toContain("await customElements.whenDefined('kai-chat')");
      expect(text).toContain("addEventListener('kai-submit'");
      // The dead guard must be gone, not kept "just in case": its comment claimed
      // module scripts can run before the DOM is ready, which is false for a
      // deferred external module.
      expect(text).not.toMatch(/document\.readyState/);
      expect(text).not.toMatch(/addEventListener\('DOMContentLoaded'/);
    });
  }

  // ── SCAF-11: the emitted ChatMessage type ────────────────────────────────────
  //
  // There is no longer a local one. `mock` used to hand-declare a narrow subset
  // because it imported nothing; these tests kept that subset honest (a strict
  // `state` union, an optional reasoning `label`, never a bare `state: string`).
  //
  // Now that the mock streams through readOpenAIStream it imports the kit's own
  // ChatMessage like every real backend, which makes the subset unnecessary AND
  // removes the drift it carried: it had no `raw`/`rawInput` on a tool and no
  // `source`/`file` part variants, so a message the kit itself produced did not
  // satisfy it. The check that replaces all three is that NO target re-declares
  // it — asserted for mock here and for real backends in the sibling test below.

  it('SCAF-11: mock imports the kit ChatMessage instead of re-declaring a subset', async () => {
    for (const useCase of ['agentic', 'knowledge-base', 'drop-in-chat'] as const) {
      const out = await scaffold.handler({
        useCase,
        integration: 'mock',
        placement: 'side',
        framework: 'react',
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      expect(text, `${useCase}: missing the kit ChatMessage import`).toMatch(
        /import \{[^}]*\btype ChatMessage\b[^}]*\} from '@kitn\.ai\/ui\/state';/,
      );
      expect(text, `${useCase}: re-declares a local ChatMessage`).not.toMatch(
        /type ChatMessage = \{/,
      );
      expect(text, `${useCase}: re-declares ChatMessage off the element`).not.toContain(
        "type ChatMessage = KaiChatElement['messages'][number]",
      );
    }
  });

  it('SCAF-11: the agentic sample fixture uses a valid tool state', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'mock',
      placement: 'side',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // The seed is emitted as a JSON literal in a comment, so the state value is
    // double-quoted. This used to pass on the single-quoted spelling in the local
    // TYPE declaration rather than on the sample data it names — the type is gone
    // and the assertion now reads the fixture it is actually about.
    expect(text).toContain('"state":"output-available"');
  });

  it('SCAF-11: a real backend imports the kit ChatMessage instead of re-declaring a subset', async () => {
    for (const framework of ['react', 'next', 'vue', 'svelte', 'tanstack-start'] as const) {
      const out = await scaffold.handler({
        useCase: 'agentic',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      // React-family scaffolds also import `type SetMessages` — the tool loop's
      // thread setter is annotated with it — so this pins the two names that must
      // always be there rather than the whole line.
      expect(text, `${framework}: missing the kit ChatMessage import`).toMatch(
        /^\s*import \{ createAssistantStream, type ChatMessage(?:, type SetMessages)? \} from '@kitn\.ai\/ui\/state';$/m,
      );
      // The local subset type is gone: it has no rawInput/raw/signature/index on a
      // tool and no source/file part variants, so it would reject a message the
      // kit itself produced on the way into toOpenAIMessages.
      expect(text, `${framework}: still re-declares a local ChatMessage`).not.toContain(
        'type ChatMessage = { id: string;',
      );
      expect(text, `${framework}: loose state: string`).not.toMatch(/state:\s*string/);
    }
  });

  it('SCAF-9: knowledge-base (react) emits <Sources> with real sample sources data', async () => {
    const out = await scaffold.handler({
      useCase: 'knowledge-base',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // kai-sources is standalone — must be emitted with sample data
    expect(text).toMatch(/<Sources\s+sources=/);
    // Must include realistic href data
    expect(text).toMatch(/sampleSources/);
    // Must NOT emit bare <Sources /> with no props
    expect(text).not.toMatch(/<Sources\s*\/>/);
  });

  // Regression guard for a pre-existing tsc --strict failure (TS2339): the svelte
  // sources ref used to be typed as bare HTMLElement, which has no `sources`
  // property, so the `.sources = sampleSources` assignment below it failed to
  // compile. Typed through the kit's own KaiSourcesElement interface instead
  // (the same fix chatEl already got under SCAF-13B), so the assignment
  // typechecks honestly. Confirmed against a real tsc --strict compile of the
  // emitted output, not just this string assertion.
  it('SCAF-9: knowledge-base (svelte) types sourcesEl as KaiSourcesElement, not bare HTMLElement (tsc --strict TS2339 guard)', async () => {
    const out = await scaffold.handler({
      useCase: 'knowledge-base',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'svelte',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("import type { KaiChatElement, KaiSourcesElement } from '@kitn.ai/ui/elements'");
    expect(text).toContain('let sourcesEl = $state<KaiSourcesElement | undefined>(undefined)');
    expect(text).not.toContain('$state<HTMLElement | undefined>');
  });

  // The KaiSourcesElement import must be conditional: an archetype with no
  // kai-sources companion must not carry an unused import, or it fails
  // noUnusedLocals instead (a different tsc error, same broken build).
  it('SCAF-9: an archetype without kai-sources does not import KaiSourcesElement (svelte, noUnusedLocals guard)', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'svelte',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("import type { KaiChatElement } from '@kitn.ai/ui/elements'");
    expect(text).not.toContain('KaiSourcesElement');
  });

  // ── SCAF-14: workspace archetype must emit a runnable resizable split layout ──

  it('SCAF-14: workspace (react) emits Resizable with ResizableItem children and Artifact with src', async () => {
    const out = await scaffold.handler({
      useCase: 'artifact-split',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must emit a Resizable container
    expect(text).toMatch(/<Resizable\b/);
    // Must emit ResizableItem children (panels)
    expect(text).toMatch(/<ResizableItem\b/);
    // Must emit Artifact with a src prop (not bare <Artifact />)
    expect(text).toMatch(/<Artifact\s[^/]*src=/);
    // Must NOT emit a bare propless <Artifact />
    expect(text).not.toMatch(/<Artifact\s*\/>/);
    // Must still wire Chat inside the split
    expect(text).toMatch(/<Chat\b/);
    // Must import Resizable, ResizableItem, Artifact from @kitn.ai/ui/react
    expect(text).toContain('Resizable');
    expect(text).toContain('ResizableItem');
    expect(text).toContain('Artifact');
  });

  it('SCAF-14: workspace (next) emits Resizable with ResizableItem children and Artifact with src', async () => {
    const out = await scaffold.handler({
      useCase: 'artifact-split',
      integration: 'mock',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must emit the structural layout
    expect(text).toMatch(/<Resizable\b/);
    expect(text).toMatch(/<ResizableItem\b/);
    expect(text).toMatch(/<Artifact\s[^/]*src=/);
    expect(text).not.toMatch(/<Artifact\s*\/>/);
    // Must use next/dynamic with ssr: false
    expect(text).toContain("import dynamic from 'next/dynamic'");
    expect(text).toContain('ssr: false');
    // Resizable, ResizableItem, Artifact must be lazy-loaded
    expect(text).toContain("m.Resizable");
    expect(text).toContain("m.ResizableItem");
    expect(text).toContain("m.Artifact");
  });

  // Regression guard for a pre-existing tsc --strict failure (TS2741): `files`
  // is a required prop on the React Artifact wrapper (array/object props are
  // never optional attributes on a kai-* element, even though the underlying
  // Solid component defaults it to []), so a bare `<Artifact src="..." />`
  // failed to compile with "Property 'files' is missing". Confirmed against a
  // real tsc --strict compile of the emitted output, not just this string
  // assertion. Covers all three JSX emit sites (react, next, tanstack-start).
  it.each(['react', 'next', 'tanstack-start'] as const)(
    'SCAF-14: workspace (%s) emits Artifact with a files prop (tsc --strict TS2741 guard)',
    async (framework) => {
      const out = await scaffold.handler({
        useCase: 'artifact-split',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      // A real, non-empty array literal, not a bare `files={[]}` that would
      // dodge the type error without giving the scaffold user anything useful.
      expect(text).toMatch(/<Artifact\s[^>]*files=\{\[\{[^}]*path:/);
      // Still carries src, tied to the same demo url the file entry mirrors.
      expect(text).toMatch(/<Artifact\s[^>]*src="https:\/\/example\.com"/);
    },
  );

  // ── tanstack-start scaffold ───────────────────────────────────────────────

  it('tanstack-start scaffold emits createFileRoute with ssr:false and the Chat wrapper', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'tanstack-start',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must use createFileRoute from @tanstack/react-router (verified working import)
    expect(text).toContain("import { createFileRoute } from '@tanstack/react-router'");
    // ssr: false is the key — keeps the web component off the server render
    expect(text).toContain('ssr: false');
    // Must use @kitn.ai/ui/react (the React wrapper, since TanStack Start is React)
    expect(text).toContain('@kitn.ai/ui/react');
    // Must import theme tokens
    expect(text).toContain('@kitn.ai/ui/theme.tokens.css');
    // Must wire suggestions
    expect(text).toContain('suggestionMode="submit"');
    // Must render the Chat wrapper
    expect(text).toMatch(/<Chat\b/);
  });

  it('tanstack-start scaffold uses ChatPage (not App) to avoid import/export collision', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'tanstack-start',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Page component must be ChatPage (not App or Chat — collision risk with import)
    expect(text).toContain('function ChatPage()');
    // Must NOT export default function App (that's the next/react pattern)
    expect(text).not.toContain('export default function App');
    // Route export is via createFileRoute
    expect(text).toContain('export const Route = createFileRoute');
  });

  it('tanstack-start scaffold emits default suggestions', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'tanstack-start',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("What's new?");
    expect(text).toContain('suggestions={suggestions}');
  });

  it('tanstack-start + real backend (openrouter) emits model const and suggestions', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'tanstack-start',
      suggestions: ["What's new?", 'How can you help?'],
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // SCAF-8: model const for integrations that forward model
    expect(text).toMatch(/const model = ['"]openai\/gpt-4o-mini['"]/);
    // Suggestions wired
    expect(text).toContain("What's new?");
    expect(text).toContain('How can you help?');
  });

  it('tanstack-start mock emits role as const for strict-TS (SCAF-7)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'tanstack-start',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("role: 'user' as const");
    // No assistant literal to narrow any more: createAssistantStream builds the
    // in-flight assistant message itself, so the scaffold only ever writes the
    // USER one. Asserting an 'assistant' literal here would now be asserting a
    // hand-rolled message the mock no longer needs to construct.
    expect(text).not.toContain("role: 'assistant'");
  });

  it('tanstack-start emits theme.tokens.css (not bare theme.css)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'tanstack-start',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('@kitn.ai/ui/theme.tokens.css');
    expect(text).not.toMatch(/import ['"]@kitn\.ai\/ui\/theme\.css['"]/);
  });

  it('SCAF-14B: workspace (vue) emits kai-resizable with kai-resizable-item children and kai-artifact with src', async () => {
    const out = await scaffold.handler({
      useCase: 'artifact-split',
      integration: 'mock',
      placement: 'full-page',
      framework: 'vue',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must emit a kai-resizable container
    expect(text).toMatch(/<kai-resizable\b/);
    // Must emit kai-resizable-item children (panels)
    expect(text).toMatch(/<kai-resizable-item\b/);
    // Must emit kai-artifact with a src attribute (not bare)
    expect(text).toMatch(/<kai-artifact\s[^>]*src=/);
    // Must NOT emit bare <kai-artifact />
    expect(text).not.toMatch(/<kai-artifact\s*\/>/);
    // Must still wire kai-chat inside the split (with Vue .prop and @kai-submit)
    expect(text).toMatch(/<kai-chat/);
    expect(text).toContain(':messages.prop=');
    expect(text).toContain('@kai-submit=');
  });

  it('SCAF-14B: workspace (svelte) emits kai-resizable with kai-resizable-item children and kai-artifact with src', async () => {
    const out = await scaffold.handler({
      useCase: 'artifact-split',
      integration: 'mock',
      placement: 'full-page',
      framework: 'svelte',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must emit a kai-resizable container
    expect(text).toMatch(/<kai-resizable\b/);
    // Must emit kai-resizable-item children (panels)
    expect(text).toMatch(/<kai-resizable-item\b/);
    // Must emit kai-artifact with a src attribute (not bare)
    expect(text).toMatch(/<kai-artifact\s[^>]*src=/);
    // Must NOT emit bare <kai-artifact></kai-artifact>
    expect(text).not.toMatch(/<kai-artifact><\/kai-artifact>/);
    // Must still wire kai-chat inside the split (with bind:this and on:kai-submit)
    expect(text).toMatch(/<kai-chat/);
    expect(text).toContain('bind:this={chatEl}');
    expect(text).toContain('on:kai-submit');
  });

  // ── INT-1: cloudflare worker route re-frames native SSE to OpenAI format ────

  it('INT-1: cloudflare worker template re-frames native SSE to OpenAI-format SSE (choices/delta/content)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'cloudflare',
      placement: 'full-page',
      framework: 'worker',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must contain the OpenAI-format re-mapping fields
    expect(text).toContain('choices');
    expect(text).toContain('delta');
    expect(text).toContain('content');
    // Must emit a terminal [DONE] sentinel
    expect(text).toContain('[DONE]');
    // Must NOT be a bare passthrough (new Response(stream, ...))
    expect(text).not.toMatch(/new Response\(stream,/);
  });

  it('INT-1: cloudflare next template still passes upstream.body straight through (OpenAI endpoint)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'cloudflare',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // next route uses the OpenAI-compatible endpoint — still a direct passthrough
    expect(text).toContain('upstream.body');
  });

  // ── INT-2: Next scaffold must NOT recommend transpilePackages ────────────────

  it('INT-2: next scaffold does NOT emit a transpilePackages recommendation', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toContain('transpilePackages');
  });

  it('INT-2: cloudflare+next scaffold does NOT emit transpilePackages', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'cloudflare',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toContain('transpilePackages');
  });

  it('SCAF-14: workspace (html) emits kai-resizable with kai-resizable-item children and kai-artifact with src', async () => {
    const out = await scaffold.handler({
      useCase: 'artifact-split',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must emit a kai-resizable container
    expect(text).toMatch(/<kai-resizable\b/);
    // Must emit kai-resizable-item children
    expect(text).toMatch(/<kai-resizable-item\b/);
    // Must emit kai-artifact with a src attribute (not bare)
    expect(text).toMatch(/<kai-artifact\s[^>]*src=/);
    // Must NOT emit bare <kai-artifact></kai-artifact>
    expect(text).not.toMatch(/<kai-artifact><\/kai-artifact>/);
    // Must still have kai-chat inside the split
    expect(text).toMatch(/<kai-chat/);
  });

  // ── SCAF-15: raw-DOM frameworks must gate property-setting on element upgrade ──
  // The elements bundle registers kai-* via an async dynamic import (SSR-safety),
  // so the element may not be upgraded when the consumer sets array/object props.
  // Values set on a not-yet-upgraded element are dropped on upgrade — so the
  // raw-DOM frameworks (html/vue/svelte) must await customElements.whenDefined.
  // The React family is unaffected (its wrappers guard with whenDefined internally).

  it('SCAF-15: html output awaits customElements.whenDefined before setting props', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("customElements.whenDefined('kai-chat')");
    // init() must be async so it can await the upgrade
    expect(text).toContain('async function init()');
    // the whenDefined await must come before the suggestions property assignment
    expect(text.indexOf("whenDefined('kai-chat')")).toBeLessThan(text.indexOf('chat.suggestions ='));
  });

  it('SCAF-15: svelte output gates the reactive prop block on the element upgrade', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'svelte',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("customElements.whenDefined('kai-chat')");
    expect(text).toContain("import { onMount } from 'svelte'");
    // the reactive property block must be gated on `defined` so it re-applies post-upgrade
    // `$effect`, not `$:` — `sv create` forces runes mode project-wide, where `$:`
    // is a hard error in svelte-check AND vite build.
    expect(text).toMatch(/\$effect\(\(\) => \{/);
    expect(text).toMatch(/if\s*\(chatEl\s*&&\s*defined\)/);
    expect(text, 'legacy reactive statement is a runes-mode error').not.toMatch(/^\s*\$:/m);
  });

  it('SCAF-15: vue output re-applies props in onMounted after the element upgrade', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'vue',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("customElements.whenDefined('kai-chat')");
    expect(text).toContain('onMounted');
    // onMounted must be imported from vue
    expect(text).toMatch(/import \{ ref, onMounted \} from 'vue'/);
  });

  it('SCAF-15: whenDefined gate is present across every raw-DOM framework', async () => {
    for (const framework of ['html', 'vue', 'svelte']) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'mock',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      expect(text, `${framework}: missing whenDefined upgrade gate`).toContain(
        "customElements.whenDefined('kai-chat')",
      );
    }
  });

  // ── SCAF-16: loading-options note appended to scaffold output ────────────

  it('SCAF-16: scaffold output includes a LOADING OPTIONS section', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('=== LOADING OPTIONS ===');
  });

  it('SCAF-16: loading-options note mentions per-element import and autoloader', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // per-element import path
    expect(text).toMatch(/@kitn\.ai\/ui\/elements\/chat/);
    // autoloader — positioned as a CDN/<script> tool (dist/elements/autoloader.js), NOT a bundler import
    expect(text).toMatch(/autoloader\.js/);
    expect(text).toMatch(/CDN|not importable through a bundler/i);
  });

  // SCAF-16: the note must describe what the scaffold ACTUALLY emits. `next` emits no
  // `import '@kitn.ai/ui/elements'` (the dynamic-imported wrappers self-register), so
  // claiming "the scaffold uses import '@kitn.ai/ui/elements'" there is simply false.
  it('SCAF-16: loading-options note matches the elements import the output really emits', async () => {
    for (const framework of ['html', 'react', 'next', 'vue', 'svelte', 'tanstack-start'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      const frontend = text.split('=== LOADING OPTIONS ===')[0];
      const note = text.split('=== LOADING OPTIONS ===')[1] ?? '';
      const emitsRegisterAll = /import '@kitn\.ai\/ui\/elements';/.test(frontend);
      if (emitsRegisterAll) {
        expect(note, `${framework}: emits register-all but the note denies it`).toContain(
          "The scaffold uses `import '@kitn.ai/ui/elements'` (register-all)",
        );
      } else {
        expect(note, `${framework}: emits no register-all but the note claims it`).toContain(
          "The scaffold emits NO `import '@kitn.ai/ui/elements'`",
        );
      }
    }
  });

  // The next island exists for hydration, not for a prerender crash — a server
  // component that statically imports the package prerenders clean.
  it('SCAF-6: next scaffold explains ssr:false as client-only elements, not a crash', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const frontend = text.split('=== LOADING OPTIONS ===')[0];
    expect(frontend).toMatch(/client-only custom elements/);
    expect(frontend).toMatch(/hydration/);
    expect(frontend).not.toMatch(/doesn't crash|is not defined/);
  });

  it('SCAF-16: loading-options note appears across every framework', async () => {
    for (const framework of ['html', 'react', 'next', 'vue', 'svelte', 'tanstack-start'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      expect(text, `${framework}: missing LOADING OPTIONS`).toContain('=== LOADING OPTIONS ===');
      expect(text, `${framework}: missing autoloader mention`).toMatch(/autoloader/);
    }
  });

  it('SCAF-16: loading-options note does NOT change the default elements import line in the front-end block', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // The default import must still be present in the front-end block
    expect(text).toContain("import '@kitn.ai/ui/elements'");
    // The per-element import must ONLY appear in the loading-options note, not in the front-end block
    const frontendBlock = text.split('=== LOADING OPTIONS ===')[0];
    expect(frontendBlock).not.toContain("@kitn.ai/ui/elements/chat");
  });

  // ── SCAF-17: interaction-pattern snippets (toast / dismissRecovery / kai-compare) ──

  it('SCAF-17: scaffold output includes an INTERACTION PATTERNS section', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('=== INTERACTION PATTERNS ===');
  });

  it('SCAF-17: emits the toast() confirmation + Undo pattern', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // imperative toast, exported from the elements bundle
    expect(text).toMatch(/import \{ toast \} from '@kitn\.ai\/ui\/elements'/);
    expect(text).toContain("toast('Copied to clipboard')");
    expect(text).toContain('toast.success');
    // an Undo action wired through onAction
    expect(text).toMatch(/action:\s*\{\s*label:\s*'Undo'/);
    expect(text).toContain('onAction');
    // frames it as imperative (no element to place)
    expect(text).toMatch(/IMPERATIVE|no <kai-toast>/i);
    // surfaces collapsed (Sonner-style) stacking via configureToasts
    expect(text).toContain('configureToasts({ stack: \'collapsed\' })');
  });

  it('SCAF-17: emits the dismissRecovery() card-policy wiring with a toast adapter', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("import { dismissRecovery } from '@kitn.ai/ui'");
    // builds the onDismiss/onReopen policy half
    expect(text).toContain('const { onDismiss, onReopen } = dismissRecovery({');
    // a toast adapter mapping show() onto toast()
    expect(text).toMatch(/toastAdapter|show:\s*\(\{/);
    // get/set over the host store with a NEW array reference
    expect(text).toMatch(/get:\s*\(\)\s*=>\s*cards/);
    expect(text).toMatch(/set:\s*\(next\)/);
    // explains dismissed is deferred, not deleted
    expect(text).toMatch(/does NOT delete|reopenable stub|deferred/i);
  });

  it('SCAF-17: emits the kai-compare preference-capture wiring', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // compare types imported from the root entry
    expect(text).toMatch(/import type \{ ResponseCompareData, CompareSelection \} from '@kitn\.ai\/ui'/);
    // data set as a JS property with exactly two candidates
    expect(text).toMatch(/el\.data\s*=/);
    expect(text).toMatch(/candidates:\s*\[/);
    // listens for the terminal select event
    expect(text).toContain("addEventListener('kai-compare-select'");
    // wires recordPreference({ prompt, chosen, rejected })
    expect(text).toMatch(/recordPreference\(\{\s*prompt,\s*chosen:\s*chosenId,\s*rejected:\s*rejectedIds\s*\}\)/);
  });

  it('SCAF-17: interaction patterns appear across every front-end framework', async () => {
    for (const framework of ['html', 'react', 'next', 'vue', 'svelte', 'tanstack-start'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      expect(text, `${framework}: missing INTERACTION PATTERNS`).toContain('=== INTERACTION PATTERNS ===');
      expect(text, `${framework}: missing toast pattern`).toContain("import { toast } from '@kitn.ai/ui/elements'");
      expect(text, `${framework}: missing dismissRecovery pattern`).toContain('dismissRecovery');
      expect(text, `${framework}: missing kai-compare pattern`).toContain('kai-compare-select');
    }
  });

  it('SCAF-17: interaction patterns are appended AFTER the loading-options block, not inside the front-end', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const loadingIdx = text.indexOf('=== LOADING OPTIONS ===');
    const patternsIdx = text.indexOf('=== INTERACTION PATTERNS ===');
    expect(loadingIdx).toBeGreaterThanOrEqual(0);
    expect(patternsIdx).toBeGreaterThan(loadingIdx);
    // The dismissRecovery / kai-compare wiring must NOT leak into the front-end block
    const frontendBlock = text.split('=== LOADING OPTIONS ===')[0];
    expect(frontendBlock).not.toContain('dismissRecovery');
    expect(frontendBlock).not.toContain('kai-compare-select');
  });

  // ── SCAF-18: state/streaming helpers pattern ─────────────────────────────

  it('SCAF-18: emits createAssistantStream in the state pattern', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('createAssistantStream');
  });

  it('SCAF-18: emits useKaiChat (React batteries-included hook)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('useKaiChat');
  });

  it('SCAF-18: emits createKaiChat (Solid batteries-included hook)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('createKaiChat');
  });

  it('SCAF-18: state pattern appears across every front-end framework', async () => {
    for (const framework of ['html', 'react', 'next', 'vue', 'svelte', 'tanstack-start'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      expect(text, `${framework}: missing createAssistantStream`).toContain('createAssistantStream');
      expect(text, `${framework}: missing useKaiChat`).toContain('useKaiChat');
      expect(text, `${framework}: missing createKaiChat`).toContain('createKaiChat');
    }
  });

  /**
   * SCAF-19, reversed: the html target's logic is a module the consumer's build
   * can SEE.
   *
   * It used to be an inline `<script type="module">` in index.html, and being
   * invisible to tsc was written up as the benefit. It was the defect. A stock
   * `npm create vite -- --template vanilla-ts` app builds with `tsc && vite build`
   * and scopes its tsconfig to `"include": ["src"]`, so none of the scaffold's
   * code was checked by anything: measured in a real app, injecting a call to a
   * function that exists nowhere still left `npm run build` exiting 0. With the
   * logic in `src/main.ts` the same injection fails with TS2304 and exit 2.
   *
   * This also retires the vite-env.d.ts workaround that used to be emitted here.
   * TS18003 ("No inputs were found") could only happen because deleting the
   * template's `src/main.ts` left `src/` with no `.ts` files at all — and this
   * scaffold now IS `src/main.ts`. Verified: the clean build succeeds with no
   * vite-env.d.ts present.
   */
  it('SCAF-19: html emits its logic as src/main.ts, loaded from index.html', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const front = text.split('=== (2) BACKEND ROUTE ===')[0];
    const [markup, mod] = front.split('// ── src/main.ts ──');
    expect(mod, 'no src/main.ts section emitted').toBeDefined();

    // index.html LOADS the module and does not carry the logic itself.
    expect(markup).toContain('<script type="module" src="/src/main.ts"></script>');
    expect(markup, 'the logic is inline again, where the tsconfig cannot reach it').not.toMatch(
      /<script type="module">/,
    );
    expect(markup, 'the element lookup belongs in the module, not the markup').not.toContain(
      'getElementById',
    );

    // The module is the TypeScript half: typed element handle, typed message type.
    expect(mod).toContain("import type { KaiChatElement } from '@kitn.ai/ui/elements'");
    expect(mod).toContain("document.getElementById('chat') as KaiChatElement");
    // ChatMessage comes from the package, not from a local alias off the element.
    // The alias existed because the mock imported nothing; it streams through
    // readOpenAIStream now, so it takes the kit's own type like every other target.
    expect(mod).toMatch(/import \{[^}]*\btype ChatMessage\b[^}]*\} from '@kitn\.ai\/ui\/state';/);

    // The TS18003 workaround is obsolete — src/main.ts is itself the tsc input.
    expect(text, 'vite-env.d.ts is no longer needed').not.toMatch(/vite-env\.d\.ts/);
    expect(text, 'TS18003 cannot happen once the scaffold IS a src/*.ts file').not.toMatch(
      /TS18003|No inputs were found/,
    );
  });

  it('the backend-only frameworks get the same module split, without the vanilla-ts note', async () => {
    // fastapi/express/worker fall back to the same framework-agnostic renderHtml
    // as `html` for their browser side. A module their build can see is right for
    // them too; only the "delete the template's src/main.ts" line is Vite-specific.
    for (const framework of ['fastapi', 'express', 'worker'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'mock',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      expect(text, `${framework}: should still split out src/main.ts`).toContain('// ── src/main.ts ──');
      expect(text, `${framework}: emitted the Vite-template-specific note`).not.toMatch(
        /template's src\/main\.ts/,
      );
      expect(text, `${framework}: unexpectedly emitted the vite-env.d.ts note`).not.toMatch(/vite-env\.d\.ts/);
    }
  });

  // ── message-parts migration: the scaffolder must emit `parts`, never `content` ──

  it('emits parts-shaped messages, never a content string', async () => {
    for (const framework of ['react', 'vue', 'svelte', 'html', 'next', 'tanstack-start'] as const) {
      const out = await scaffold.handler({
        framework, useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page',
      });
      const emitted = JSON.stringify(out);
      // The INTERACTION PATTERNS reference block (appended to every scaffold)
      // legitimately shows kai-compare's `CompareCandidate.content`, an
      // independent type from `ChatMessage`, unaffected by the parts migration
      // (see response-compare-types.ts). Scope the content-string ban to the
      // scaffolder's OWN emitted code (blocks 1-4), not that reference snippet.
      const ownCode = emitted.split('=== INTERACTION PATTERNS ===')[0];
      expect(ownCode).not.toMatch(/content:\s*\\?'\\?'/);
      expect(emitted).toContain('parts:');
    }
  });

  // Round-1 fix review found a real bug (integrations/ollama.ts's `html` route
  // template still built a `role, content` ChatMessage literal) that this suite
  // never caught, because every test above only ever passes `integration: 'mock'`,
  // the one integration with no route template to sweep. Every integration's
  // templates are static strings baked into its catalog file, so a bad one is a
  // silent, permanent bug: fix the systemic gap by exercising every registered
  // integration here, not just the one the earlier tests happened to use.
  it('every registered integration emits parts-shaped ChatMessage literals (no role+content, no stale stream API)', async () => {
    for (const integration of listIntegrations()) {
      // 'html' is the framework-agnostic front end every integration's route
      // falls back to (per chooseRoute), so one call exercises both the
      // client-side seed/submit code AND that integration's own backend
      // route template (the exact class of bug ollama.ts had).
      const out = await scaffold.handler({
        framework: 'html', useCase: 'drop-in-chat', integration: integration.id, placement: 'full-page',
      });
      const emitted = JSON.stringify(out);
      const label = integration.id;

      // The old removed shape: a role literal directly followed by `content:`.
      //
      // Scoped to the FRONT END. `role`/`content` is the kit's removed
      // ChatMessage shape only in block (1); in block (2) it is the PROVIDER's
      // wire format, and every provider on earth spells a message that way — the
      // AI SDK's own ModelMessage does. Scanning the whole response made this
      // assertion fire on correct backend code, which is a test that punishes the
      // right answer.
      expect(frontEnd(out), `${label}: emits role:'user', content: (removed ChatMessage shape)`).not.toMatch(
        /role:\s*'user'(?:\s+as\s+const)?,\s*content:/,
      );
      expect(frontEnd(out), `${label}: emits role:'assistant', content: (removed ChatMessage shape)`).not.toMatch(
        /role:\s*'assistant'(?:\s+as\s+const)?,\s*content:/,
      );
      expect(emitted, `${label}: missing parts:`).toContain('parts:');

      // Stale @kitn.ai/ui/state API removed earlier in this migration.
      expect(emitted, `${label}: stale addTool`).not.toContain('addTool');
      expect(emitted, `${label}: stale updateTool`).not.toContain('updateTool');
      expect(emitted, `${label}: stale appendContent`).not.toContain('appendContent');
    }
  });

  // Same integration sweep, on a strict-TS framework: catches a bad route
  // template that only shows up once TypeScript output (not plain JS) is involved.
  it('every registered integration emits parts-shaped ChatMessage literals on a TS framework (react)', async () => {
    for (const integration of listIntegrations()) {
      const out = await scaffold.handler({
        framework: 'react', useCase: 'drop-in-chat', integration: integration.id, placement: 'full-page',
      });
      const emitted = JSON.stringify(out);
      const label = integration.id;
      // Front-end only, for the reason given on the sweep above: in block (2)
      // `role`/`content` is the provider's wire format, not the kit's old shape.
      expect(frontEnd(out), `${label}: emits role:'user', content:`).not.toMatch(
        /role:\s*'user'(?:\s+as\s+const)?,\s*content:/,
      );
      expect(frontEnd(out), `${label}: emits role:'assistant', content:`).not.toMatch(
        /role:\s*'assistant'(?:\s+as\s+const)?,\s*content:/,
      );
      expect(emitted, `${label}: missing parts:`).toContain('parts:');
    }
  });

  // The streamed fold must APPEND onto the trailing text part, not replace
  // `parts` wholesale. The wholesale form is the old flat-string fold wearing
  // parts clothing: harmless into a fresh `parts: []`, but it deletes the
  // reasoning + tool parts SAMPLE_AGENTIC_MESSAGE seeds, so the first consumer
  // to stream into a seeded message loses them silently.
  //
  // THIS USED TO CHECK THE MOCK'S OWN INLINE COPY of that fold, because the mock
  // added no imports and carried its own. It no longer has one: the mock streams
  // through createAssistantStream like every real backend, so the guarantee comes
  // from appendTextPart — the function the inline copy was copied FROM, and the
  // one place it can now be got wrong. What is worth pinning at THIS layer is
  // that no scaffold reintroduces a hand-rolled fold beside it.
  it('no mock scaffold hand-rolls a fold: they all drive createAssistantStream', async () => {
    for (const framework of ['react', 'vue', 'svelte', 'html', 'next', 'tanstack-start'] as const) {
      const out = await scaffold.handler({
        framework, useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page',
      });
      const ownCode = JSON.stringify(out).split('=== INTERACTION PATTERNS ===')[0];
      const label = `${framework}/mock`;

      // The wholesale replacement, in any of its per-framework spellings.
      expect(ownCode, `${label}: streams by replacing parts wholesale`).not.toMatch(
        /\.\.\.m, parts: \[\{ type: .text., text: (answer|accumulated)/,
      );
      // No inline fold of ANY kind — that is the drift this consolidation removed.
      expect(ownCode, `${label}: reintroduced an inline appendText helper`).not.toContain(
        'const appendText =',
      );
      expect(ownCode, `${label}: reintroduced a per-token map over messages`).not.toMatch(
        /\.\.\.m, parts: appendText\(/,
      );
      // The fold comes from the kit, driven by the same stream the real path uses.
      expect(ownCode, `${label}: does not drive createAssistantStream`).toContain(
        'const stream = createAssistantStream(',
      );
      expect(ownCode, `${label}: does not read through the kit's SSE reader`).toContain(
        'await readOpenAIStream(res, stream);',
      );
    }
  });

  // Regression test for the exact TS2322 defect the reviewer reproduced with
  // `tsc --strict`: an un-annotated `const history = [...]` widens the part's
  // `type` field to `string`, so `setMessages([...history, …])` no longer
  // satisfies `ChatMessage[]`. This is a string-level proxy for "would compile
  // under strict", not a real compiler run (a temp-file + tsc/ts-morph harness
  // was judged too heavy for this suite; flagged to the coordinator as a
  // possible follow-up), but it pins the exact annotation every prior fix
  // relied on, on every strict-TS framework this bug hit.
  it('every strict-TS framework annotates the mock-path `history` const as ChatMessage[]', async () => {
    for (const framework of ['react', 'next', 'vue', 'svelte', 'tanstack-start'] as const) {
      const out = await scaffold.handler({
        framework, useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page',
      });
      const emitted = JSON.stringify(out);
      expect(emitted, `${framework}: mock-path history is missing : ChatMessage[]`).toMatch(
        /const history: ChatMessage\[\] = \[/,
      );
    }
  });

  it('svelte real-backend `history` const is annotated ChatMessage[] (matches its react/vue/tanstack siblings)', async () => {
    const out = await scaffold.handler({
      framework: 'svelte', useCase: 'drop-in-chat', integration: 'openrouter', placement: 'full-page',
    });
    const emitted = JSON.stringify(out);
    expect(emitted).toMatch(/const history: ChatMessage\[\] = \[/);
  });
});

// ── the wire adapter replaces the hand-rolled reader ─────────────────────────
//
// scaffold.ts used to inline ~25 lines of SSE reader per framework so the output
// stayed copy-paste readable. That policy is reversed for real backends: the
// inline reader split on '\n' and treated each `data:` line as a whole frame
// (wrong for a multi-line frame), and it could only ever produce text, which is
// why a scaffold with kai-tool in its archetype rendered a panel no code path
// could fill. `mock` keeps the inline form: a zero-backend preview adds zero
// imports.

const REAL_FRAMEWORKS = ['react', 'vue', 'svelte', 'html', 'next', 'tanstack-start'] as const;

/**
 * The expression a TOOL-LOOP scaffold re-encodes every round.
 *
 * A single-round scaffold posts a `history` const built once. A loop has to read
 * the thread BACK between rounds, including the assistant message the stream
 * appended, so each framework names whatever it can read synchronously: the live
 * element property, the live ref/local, or — for React, whose state cannot be
 * read back inside the async turn writing it — a turn-owned `thread`.
 */
const THREAD_EXPR: Record<(typeof REAL_FRAMEWORKS)[number], string> = {
  react: 'thread',
  next: 'thread',
  'tanstack-start': 'thread',
  vue: 'messages.value',
  svelte: 'messages',
  html: 'chat.messages',
};

/** Block 1 ONLY: the scaffolder's own front-end CODE. Excludes the backend route
 *  template (a route may legitimately hand-roll a re-framing reader; the
 *  cloudflare worker template does), the reference snippets, and the header,
 *  whose `stream:` line is the integration's streamMapping PROSE. That prose
 *  names readOpenAIStream for every integration including mock, so asserting
 *  over the whole response would confuse a sentence about the adapter with an
 *  import of it. */
function frontEnd(out: unknown): string {
  const text = ((out as { content: { type: string; text: string }[] }).content)[0].text;
  const body = text.split('=== (2) BACKEND ROUTE ===')[0];
  const start = body.indexOf('=== (1) FRONT-END');
  return start < 0 ? body : body.slice(start);
}

/**
 * The EXACT import STATEMENTS each framework must emit.
 *
 * Every entry is wrapped in newlines so it can only be satisfied by a whole
 * emitted line at that framework's own indentation. A bare
 * `toContain('@kitn.ai/ui/wire')` is not a test of this: the specifier also
 * appears in the header's streamMapping prose and in the reference snippets, so
 * that assertion stays green with every import line deleted. These do not.
 *
 * html used to be the odd one — plain JS inside `<script type="module">` at a
 * four-space indent, with no type import, because `type ChatMessage` is a syntax
 * error in plain JS. Its logic is a real `src/main.ts` now, so it sits at column
 * zero like the rest AND carries the type import: this drop-in-chat cell is the
 * single-round shape, whose `const history: ChatMessage[]` references it. The
 * TOOL-LOOP shape does not (its thread is `chat.messages`, already typed by
 * KaiChatElement), and importing the type there is a TS6133 that fails a stock
 * `npm run build` — covered by its own case below.
 */
const WIRE_IMPORT_LINES: Record<(typeof REAL_FRAMEWORKS)[number], string[]> = {
  react: [
    "\nimport { createAssistantStream, type ChatMessage } from '@kitn.ai/ui/state';\n",
    "\nimport { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';\n",
  ],
  next: [
    "\nimport { createAssistantStream, type ChatMessage } from '@kitn.ai/ui/state';\n",
    "\nimport { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';\n",
  ],
  'tanstack-start': [
    "\nimport { createAssistantStream, type ChatMessage } from '@kitn.ai/ui/state';\n",
    "\nimport { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';\n",
  ],
  vue: [
    "\nimport { createAssistantStream, type ChatMessage } from '@kitn.ai/ui/state';\n",
    "\nimport { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';\n",
  ],
  svelte: [
    "\n  import { createAssistantStream, type ChatMessage } from '@kitn.ai/ui/state';\n",
    "\n  import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';\n",
  ],
  html: [
    "\nimport { createAssistantStream, type ChatMessage } from '@kitn.ai/ui/state';\n",
    "\nimport { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';\n",
  ],
};

describe('scaffolds import the wire adapter for real backends', () => {
  // Pins the import STATEMENT, not a mention of the specifier. Proved by
  // deleting the emitted line from wireImportLines and watching all six fail.
  it.each(REAL_FRAMEWORKS)('%s emits the state + wire import lines themselves', async (framework) => {
    const code = frontEnd(
      await scaffold.handler({
        framework,
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
      }),
    );
    for (const line of WIRE_IMPORT_LINES[framework]) {
      expect(code, `${framework}: missing emitted import line ${JSON.stringify(line)}`).toContain(line);
    }
  });

  /**
   * `type ChatMessage` must only be imported where the emitted code annotates
   * something with it. A stock vanilla-ts / create-vite tsconfig sets
   * `noUnusedLocals`, so an unreferenced type import is TS6133 and a failed
   * `npm run build` on the consumer's first try — the same class of defect that
   * once shipped `applyToolOutput` beside a commented-out tool loop.
   *
   * html is the only framework where this bites: vue and svelte always declare
   * `ref<ChatMessage[]>` / `let messages: ChatMessage[]`, but html keeps the
   * thread on the element, so the name is used only by the single-round shape's
   * `const history: ChatMessage[]`. Caught by verify:scaffold on all 8 agentic
   * html cells.
   */
  it('html tool-loop scaffolds do NOT import the unused ChatMessage type (TS6133)', async () => {
    const code = frontEnd(
      await scaffold.handler({
        framework: 'html',
        useCase: 'agentic', // the archetype that renders kai-tool → tool loop
        integration: 'openrouter',
        placement: 'full-page',
      }),
    );
    // The loop's thread IS chat.messages, typed by KaiChatElement — nothing
    // annotates with the kit's ChatMessage, so importing it is dead weight.
    expect(code).toContain("import { createAssistantStream } from '@kitn.ai/ui/state';");
    expect(code, 'unused type import — TS6133 under a stock noUnusedLocals build').not.toContain(
      "createAssistantStream, type ChatMessage",
    );
    // And the loop's own names ARE imported, because it does call them.
    expect(code).toContain('applyToolOutput');
  });

  it.each(REAL_FRAMEWORKS)('%s mock emits NONE of those import lines', async (framework) => {
    const code = frontEnd(
      await scaffold.handler({
        framework,
        useCase: 'drop-in-chat',
        integration: 'mock',
        placement: 'full-page',
      }),
    );
    for (const line of WIRE_IMPORT_LINES[framework]) {
      expect(code, `${framework}: mock emitted ${JSON.stringify(line)}`).not.toContain(line);
    }
  });

  it.each(REAL_FRAMEWORKS)('%s uses readOpenAIStream instead of a hand-rolled reader', async (framework) => {
    const out = await scaffold.handler({
      framework,
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
    });
    // Scoped to block 1: the header's streamMapping prose names the adapter for
    // every integration, and the reference snippets mention createAssistantStream,
    // so asserting over the whole response would pass with no emitted call sites.
    const code = frontEnd(out);
    expect(code).toContain('await readOpenAIStream(res, stream);');
    expect(code).toContain('const stream = createAssistantStream(');
    expect(code).toContain('toOpenAIMessages(history)');
    // The hand-rolled reader is GONE.
    expect(code).not.toContain('getReader()');
    expect(code).not.toContain("startsWith('data:')");
    expect(code).not.toContain('[DONE]');
  });

  it.each(REAL_FRAMEWORKS)('%s no longer flattens history to a content string', async (framework) => {
    const out = await scaffold.handler({
      framework,
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
    });
    const emitted = JSON.stringify(out);
    // PARTS_TO_CONTENT threw away every tool call and result on the way back,
    // which made a multi-round loop impossible.
    expect(emitted).not.toContain("p.type === 'text' ? p.text");
  });

  /**
   * INVERTED, deliberately. This used to assert that mock scaffolds were
   * "import-free and inline" — no `@kitn.ai/ui/wire`, no `readOpenAIStream`, and
   * their own `const appendText =`. That was the design, and it is the design
   * that produced seven divergent copies of one fold and a zero-config default
   * which exercised none of the parsing every real integration depends on.
   *
   * The mock now imports the kit's shared responder and reads through the kit's
   * own SSE reader, so what is worth asserting is the opposite of what was here.
   */
  it.each(REAL_FRAMEWORKS)('%s mock scaffolds import the shared responder, not a copy', async (framework) => {
    const out = await scaffold.handler({
      framework,
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
    });
    const code = frontEnd(out);
    // ONE implementation: the responder comes from the package.
    expect(code).toMatch(/import \{[^}]*\bcreateMockResponder\b[^}]*\} from '@kitn\.ai\/ui\/state';/);
    expect(code).toContain('const mockResponse = createMockResponder();');
    // …and it is read by the SAME reader a provider's response goes through.
    expect(code).toContain("from '@kitn.ai/ui/wire'");
    expect(code).toContain('await readOpenAIStream(res, stream);');
    // No second copy of the fold, and no re-hand-rolled reader.
    expect(code).not.toContain('const appendText =');
    expect(code).not.toContain('getReader()');
    expect(code).not.toContain("startsWith('data:')");
    // `toOpenAIMessages` must not be IMPORTED: there is no request body to encode,
    // and a stock tsconfig's noUnusedLocals turns an unused name into a build
    // error in the consumer's app rather than a harmless extra import. Scoped to
    // the import line on purpose — the go-live note names the function in a
    // comment, which is guidance, not an unused binding.
    // Leading whitespace allowed: svelte emits its imports indented inside <script>.
    const wireImport = code.match(/^\s*import \{([^}]*)\} from '@kitn\.ai\/ui\/wire';$/m);
    expect(wireImport, 'no @kitn.ai/ui/wire import found').not.toBeNull();
    expect(wireImport![1]).not.toContain('toOpenAIMessages');
    expect(code).toContain('parts:');
  });

  it('emits the multi-round tool loop LIVE, with a runner it actually defines', async () => {
    const code = frontEnd(
      await scaffold.handler({
        framework: 'react',
        useCase: 'agentic',
        integration: 'openrouter',
        placement: 'full-page',
      }),
    );
    // The turn is read into the same stream every round.
    expect(code).toContain('const turn = await readOpenAIStream(res, stream);');
    expect(code.match(/readOpenAIStream\(res, stream\)/g)).toHaveLength(1);
    // The in-band error channel is not silently dropped either.
    expect(code).toContain('if (turn.error)');
    // The loop is LIVE, at column > 0, not inside a comment. The version this
    // replaces emitted it commented out, named an undefined `runYourTool`, and
    // described round two in prose over a thread the consumer had no way to
    // obtain — so the archetype's headline capability could not be completed by
    // uncommenting or by any amount of local editing.
    expect(code).toMatch(/^\s*for \(let round = 0; round < MAX_TOOL_ROUNDS; round\+\+\) \{$/m);
    expect(code).toMatch(/^\s*const pending = turn\.toolCalls\.filter\(/m);
    expect(code).toMatch(/^\s*applyToolOutput\(stream, call\.id, await runTool\(/m);
    expect(code).toMatch(/^\s*applyToolFailure\(stream, call\.id, /m);
    // Every function the loop calls is DEFINED in the same emitted file.
    expect(code).toMatch(/^\s*async function runTool\(/m);
    expect(code).not.toContain('runYourTool');
    // Round two is code, not prose: the fetch is INSIDE the loop body.
    const loopAt = code.indexOf('for (let round = 0;');
    const fetchAt = code.indexOf("await fetch('/api/chat'");
    expect(loopAt, 'the loop opens before the request it repeats').toBeGreaterThan(-1);
    expect(fetchAt, 'the request is not inside the loop').toBeGreaterThan(loopAt);
    // And the whole loop runs BEFORE done(): done() settles the message, so a
    // tool result reported after it is dropped and the panel spins forever.
    expect(code.indexOf('stream.done();')).toBeGreaterThan(fetchAt);
  });

  // The mirror of the guard this replaces. applyToolOutput/applyToolFailure used
  // to be BANNED from the live import because only a commented block called
  // them, and every starter here (plus create-vite's own TS template) sets
  // noUnusedLocals, so importing an unreferenced name fails `npm run build` with
  // TS6133. The loop is live now, so the rule is unchanged and the expectation
  // flips: an import may name exactly what live code references.
  it.each(REAL_FRAMEWORKS)(
    '%s tool archetype imports applyToolOutput/applyToolFailure because the live loop calls them',
    async (framework) => {
      const code = frontEnd(
        await scaffold.handler({
          framework,
          useCase: 'agentic',
          integration: 'openrouter',
          placement: 'full-page',
        }),
      );
      expect(code, `${framework}: live wire import changed shape`).toMatch(
        /^\s*import \{ readOpenAIStream, toOpenAIMessages, applyToolOutput, applyToolFailure \} from '@kitn\.ai\/ui\/wire';$/m,
      );
      // Both names are referenced by live code, which is what makes the import legal.
      expect(code, `${framework}: applyToolOutput imported but never called`).toMatch(
        /^\s*applyToolOutput\(stream, /m,
      );
      expect(code, `${framework}: applyToolFailure imported but never called`).toMatch(
        /^\s*applyToolFailure\(stream, /m,
      );
    },
  );

  // A NON-tool archetype must not pay for any of it: no loop, no runner, and an
  // import naming only the two functions its single-round body calls.
  it.each(REAL_FRAMEWORKS)(
    '%s non-tool archetype keeps the loop imports out (noUnusedLocals)',
    async (framework) => {
      const code = frontEnd(
        await scaffold.handler({
          framework,
          useCase: 'drop-in-chat',
          integration: 'openrouter',
          placement: 'full-page',
        }),
      );
      expect(code, `${framework}: live wire import changed shape`).toMatch(
        /^\s*import \{ readOpenAIStream, toOpenAIMessages \} from '@kitn\.ai\/ui\/wire';$/m,
      );
      expect(code, `${framework}: applyToolOutput on a non-tool archetype`).not.toContain(
        'applyToolOutput',
      );
      expect(code, `${framework}: runTool on a non-tool archetype`).not.toContain('runTool');
    },
  );

  // ── the fabricated sample seed ────────────────────────────────────────────
  //
  // The agentic archetype used to seed `sampleMessages` with an assistant turn
  // that announced tool call `tc_001` and answered it. Three consequences, all
  // real, none visible in a screenshot:
  //   1. turn one POSTs it, so the very first request claims the model made a
  //      call it never made;
  //   2. `toAnthropicMessages` THROWS on it (a reasoning part with no verbatim
  //      `raw` cannot be echoed back as a thinking block) — asserted below
  //      against the encoder itself, not against a string;
  //   3. a non-empty thread has no empty state, so the `suggestions` argument
  //      this very tool takes never rendered.

  it.each(REAL_FRAMEWORKS)(
    '%s agentic scaffold seeds NO fabricated assistant turn',
    async (framework) => {
      const code = frontEnd(
        await scaffold.handler({
          framework,
          useCase: 'agentic',
          integration: 'openrouter',
          placement: 'full-page',
          suggestions: ['Find the current pricing'],
        }),
      );
      expect(code, `${framework}: fabricated tool call id still seeded`).not.toContain('tc_001');
      expect(code, `${framework}: fabricated assistant message still seeded`).not.toContain(
        'sample-assistant',
      );
      // Not even commented: on a real backend the fixture is unsafe at any level
      // of commenting-out, because uncommenting it is what sends it.
      expect(code, `${framework}: fixture offered on a real backend`).not.toContain(
        'sampleMessages',
      );
      // The thread starts EMPTY, in this framework's own spelling.
      const emptyInit: Record<(typeof REAL_FRAMEWORKS)[number], RegExp> = {
        react: /const \[messages, setMessages\] = useState<ChatMessage\[\]>\(\[\]\);/,
        next: /const \[messages, setMessages\] = useState<ChatMessage\[\]>\(\[\]\);/,
        'tanstack-start': /const \[messages, setMessages\] = useState<ChatMessage\[\]>\(\[\]\);/,
        vue: /const messages = ref<ChatMessage\[\]>\(\[\]\);/,
        svelte: /let messages = \$state\.raw<ChatMessage\[\]>\(\[\]\);/,
        // html never assigns chat.messages at startup at all; the first submit
        // reads it through `?? []` because an un-upgraded element has none.
        html: /chat\.messages = \[\.\.\.chat\.messages \?\? \[\], /,
      };
      expect(code, `${framework}: thread does not start empty`).toMatch(emptyInit[framework]);
      // And the suggestions the caller passed are still wired, which is the
      // thing an empty state is needed for.
      expect(code, `${framework}: caller suggestions dropped`).toContain('Find the current pricing');
    },
  );

  it('the seed that was removed is exactly what toAnthropicMessages refuses', () => {
    // The historical seed, verbatim. This is the WHY behind the test above: not
    // a style preference, an encoder that throws before the request is built.
    const historicalSeed: ChatMessage[] = [
      {
        id: 'sample-assistant',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'I should call the search tool to get up-to-date data.' },
          {
            type: 'tool',
            tool: {
              type: 'search',
              state: 'output-available',
              input: { query: 'current pricing' },
              output: { results: ['Result A', 'Result B'] },
              toolCallId: 'tc_001',
            },
          },
          { type: 'text', text: 'Searched the web for current pricing.' },
        ],
      },
    ];
    expect(() => toAnthropicMessages(historicalSeed)).toThrow(WireEncodeError);
    // And on the OpenAI wire it does not throw — it lies, which is worse: turn
    // one carries an assistant tool_call plus its result as conversation history.
    const wire = toOpenAIMessages(historicalSeed);
    expect(wire.some((m) => m.role === 'tool' && m.tool_call_id === 'tc_001')).toBe(true);
  });

  it('only the mock preview offers the fixture, and only commented out', async () => {
    const code = frontEnd(
      await scaffold.handler({
        framework: 'react',
        useCase: 'agentic',
        integration: 'mock',
        placement: 'full-page',
      }),
    );
    // Offered...
    expect(code).toContain('tc_001');
    // ...but every line mentioning it is a comment, and the live initializer is empty.
    for (const line of code.split('\n')) {
      if (line.includes('tc_001') || line.includes('sampleMessages')) {
        expect(line.trim().startsWith('//'), `live fixture line: ${line}`).toBe(true);
      }
    }
    expect(code).toContain('const [messages, setMessages] = useState<ChatMessage[]>([]);');
    // The commented block must uncomment COMPLETELY: a fixture const with no
    // consumer is TS6133 the moment someone takes the offer.
    expect(code).toContain(
      '// const [messages, setMessages] = useState<ChatMessage[]>(sampleMessages);',
    );
  });

  it('a non-tool archetype gets no tool-loop block and no applyToolOutput import', async () => {
    const out = await scaffold.handler({
      framework: 'react',
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
    });
    const emitted = JSON.stringify(out);
    expect(emitted).not.toContain('turn.toolCalls');
    expect(emitted).not.toContain('applyToolOutput');
  });

  // Same systemic gap the parts sweep closed: every integration's front end is a
  // static string, so one stale template is a silent permanent bug. Scoped to the
  // front-end block because a BACKEND route may legitimately hand-roll a reader
  // to re-frame a native stream (cloudflare's worker template does exactly that).
  it('every real integration, on every framework, emits an adapter-based front end', async () => {
    for (const integration of listIntegrations()) {
      if (integration.id === 'mock') continue;
      for (const framework of REAL_FRAMEWORKS) {
        const code = frontEnd(
          await scaffold.handler({
            framework, useCase: 'agentic', integration: integration.id, placement: 'full-page',
          }),
        );
        const label = `${integration.id}/${framework}`;
        expect(code, `${label}: missing readOpenAIStream`).toContain('await readOpenAIStream(res, stream);');
        // agentic is a tool archetype, so the request re-encodes the LIVE thread.
        expect(code, `${label}: missing toOpenAIMessages`).toContain(
          `toOpenAIMessages(${THREAD_EXPR[framework]})`,
        );
        expect(code, `${label}: hand-rolled reader survived`).not.toContain('getReader()');
        expect(code, `${label}: hand-rolled frame split survived`).not.toContain("startsWith('data:')");
        expect(code, `${label}: hand-rolled delta walk survived`).not.toContain('choices?.[0]?.delta');
        expect(code, `${label}: flattens parts to a content string`).not.toContain("p.type === 'text' ? p.text");
        // Stale @kitn.ai/ui/state API removed earlier in this migration.
        expect(code, `${label}: stale addTool`).not.toContain('addTool');
        expect(code, `${label}: stale updateTool`).not.toContain('updateTool');
        expect(code, `${label}: stale appendContent`).not.toContain('appendContent');
      }
    }
  });
});

// ── the request body, and what happens when the request fails ────────────────

describe('real-backend scaffolds send what the panel needs and survive a failure', () => {
  // A kai-tool archetype with no `tools` array in the request is a panel no code
  // path can populate: the model never emits a tool call, so the element renders
  // nothing, forever, with nothing to debug.
  it.each(REAL_FRAMEWORKS)('%s tool archetype declares tool schemas and sends them', async (framework) => {
    const code = frontEnd(
      await scaffold.handler({
        framework,
        useCase: 'agentic',
        integration: 'openrouter',
        placement: 'full-page',
      }),
    );
    expect(code, `${framework}: no tools declaration`).toMatch(/^\s*const tools = \[$/m);
    expect(code, `${framework}: tools missing from the POST body`).toContain(
      `toOpenAIMessages(${THREAD_EXPR[framework]}), tools }`,
    );
  });

  // The other half of the contract: a tools array the ROUTE drops is no better
  // than no tools array at all. Asserted for every integration that declares it
  // forwards the field, so the two halves can never drift apart.
  it.each(listIntegrations().filter((i) => i.forwardsFromClient.includes('tools')).map((i) => i.id))(
    '%s route destructures tools and forwards it upstream',
    async (integration) => {
      const out = await scaffold.handler({
        framework: 'next',
        useCase: 'agentic',
        integration,
        placement: 'full-page',
      });
      const route = (out.content as { type: string; text: string }[])[0].text.split(
        '=== (2) BACKEND ROUTE ===',
      )[1];
      // Read through the shared `readChatRequest` preamble, not an inline
      // `request.json()`: `json()` hands back `unknown`, so destructuring it
      // directly is TS2339 on every field under a server tsconfig. F-10: the
      // read is guarded — the try/catch maps a bare GET / malformed body to a
      // Response instead of an unhandled rejection.
      expect(route, `${integration}: route never reads tools`).toMatch(
        /let chatBody: ChatRequestBody;\s*\n\s*try\s*\{\s*\n\s*chatBody = await readChatRequest\(request\);\s*\n\s*\} catch \(error\) \{\s*\n\s*return toChatErrorResponse\(error\);/,
      );
      expect(route, `${integration}: tools not destructured off the guarded body`).toMatch(
        /const \{[^}]*\btools\b[^}]*\} = chatBody;/,
      );
      // Two shapes, one claim: the destructured value reaches the upstream call
      // rather than being dropped on the floor.
      //
      // POSTED AS JSON — what a route that speaks HTTP itself does.
      // `[\s\S]*?` rather than `[^}]*`: a route that CONVERTS the body before
      // sending it (anthropic maps OpenAI tool schemas onto `input_schema`) has
      // nested braces between `JSON.stringify({` and `tools`, which a
      // no-close-brace class cannot cross. It stayed non-greedy so the match
      // still has to find `tools` inside the upstream body and not somewhere
      // later in the file.
      const posted = /JSON\.stringify\(\{[\s\S]*?\btools\b[\s\S]*?\}\)/.test(route);
      // HANDED TO AN SDK — a route built on a client library has no
      // JSON.stringify anywhere, because the library owns the transport.
      // vercel-ai-sdk converts the OpenAI schemas into the AI SDK's own ToolSet
      // and passes that to streamText().
      //
      // The converter has to be CALLED on the destructured value and its result
      // KEPT: `function toToolSet(tools: …)` deliberately does not match, since
      // a declaration nothing calls is exactly the dead-const defect this check
      // exists to catch. What happens to the result is verify:scaffold's job —
      // `noUnusedLocals` fails a binding the route never spends.
      const converted = /=\s*\w+\(\s*tools\s*\)/.test(route);
      expect(
        posted || converted,
        `${integration}: route never sends tools — it is destructured off the request body and then ` +
          'neither posted upstream nor converted into the SDK type it is passed to',
      ).toBe(true);
    },
  );

  /**
   * No emitted route destructures a raw `.json()`.
   *
   * `Request.json()` returns `Promise<unknown>` under undici's typings and
   * `Promise<any>` under the DOM lib, so `const { messages } = await
   * request.json()` compiles in Next and is a hard TS2339 in a stock Vite app,
   * whose `tsc -b` walks vite.config.ts -> vite-chat-api.ts -> server/chat.ts
   * with no DOM. Every route narrows the body once through the injected
   * `ChatRequestBody` instead.
   *
   * verify:scaffold proves this properly by COMPILING the routes; this is the
   * cheap version that runs in `npm test`, where there is no tsc.
   */
  it.each(listIntegrations().filter((i) => i.language === 'ts' && i.id !== 'mock').map((i) => i.id))(
    '%s route never destructures an untyped .json()',
    async (integration) => {
      for (const framework of ['next', 'react', 'svelte', 'worker', 'express'] as const) {
        const out = await scaffold.handler({
          framework,
          useCase: 'agentic',
          integration,
          placement: 'full-page',
        });
        const route = (out.content as { type: string; text: string }[])[0].text.split(
          '=== (2) BACKEND ROUTE ===',
        )[1];
        expect(route, `${integration}/${framework}: destructures an unknown body`).not.toMatch(
          /const \{[^}]*\} = await (?:req|request)\.json\(\);/,
        );
      }
    },
  );

  it('a non-tool archetype declares no tools and sends none', async () => {
    const code = frontEnd(
      await scaffold.handler({
        framework: 'react',
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
      }),
    );
    expect(code).not.toContain('const tools = [');
    expect(code).toContain('toOpenAIMessages(history) }');
  });

  // A field the route does not read must never be declared in the front end. The
  // detection this replaced was `routeSrc.includes('model')`, true of any template
  // that so much as writes `model: 'llama3.2'`, so ollama, langgraph,
  // vercel-ai-sdk and cloudflare all shipped an editable model const their route
  // threw away, cloudflare's not even a valid Workers AI id.
  it.each(listIntegrations().filter((i) => i.id !== 'mock').map((i) => i.id))(
    '%s declares only the request fields its route actually forwards',
    async (integration) => {
      const forwards = getIntegration(integration)!.forwardsFromClient;
      const code = frontEnd(
        await scaffold.handler({
          framework: 'react',
          useCase: 'agentic',
          integration,
          placement: 'full-page',
        }),
      );
      const hasModel = /^\s*const model = /m.test(code);
      const hasTools = code.includes('const tools = [');
      expect(hasModel, `${integration}: model const vs forwardsFromClient`).toBe(
        forwards.includes('model'),
      );
      expect(hasTools, `${integration}: tools const vs forwardsFromClient`).toBe(
        forwards.includes('tools'),
      );
      // And what is declared is what is sent, in both directions.
      expect(code.includes('{ model, messages:'), `${integration}: model in body`).toBe(
        forwards.includes('model'),
      );
      expect(
        code.includes(`toOpenAIMessages(${THREAD_EXPR.react}), tools }`),
        `${integration}: tools in body`,
      ).toBe(forwards.includes('tools'));
    },
  );

  // Without a catch, a bad key is a permanently blank assistant bubble plus an
  // unhandled promise rejection, and any tool panel mid-flight spins forever.
  it.each(REAL_FRAMEWORKS)('%s catches the failure and aborts the stream', async (framework) => {
    const code = frontEnd(
      await scaffold.handler({
        framework,
        useCase: 'agentic',
        integration: 'openrouter',
        placement: 'full-page',
      }),
    );
    expect(code, `${framework}: no catch`).toMatch(/^\s*\} catch \(err\) \{$/m);
    expect(code, `${framework}: never aborts`).toContain(
      "stream.abort(err instanceof Error && err.message ? err.message : 'Request failed');",
    );
    // abort() lives INSIDE the catch, ahead of the finally: done() on its own
    // settles the message but leaves an in-flight tool panel on input-available.
    const catchAt = code.indexOf('} catch (err) {');
    const finallyAt = code.indexOf('} finally {', catchAt);
    const abortAt = code.indexOf('stream.abort(');
    expect(abortAt, `${framework}: abort outside the catch`).toBeGreaterThan(catchAt);
    expect(abortAt, `${framework}: abort after the finally`).toBeLessThan(finallyAt);

    /* The comment above this call is the ENTIRE documentation of the stream
     * lifecycle most consumers ever read — `createAssistantStream`, `done`,
     * `abort` and `onStreamSettled` appear in no shipped doc. It used to open
     * "Without this a bad key is a permanently blank assistant bubble" and then
     * describe only the tool-panel half, so a reader building a TEXT-ONLY chat
     * took the promise and not the qualifier. abort() kept only the qualifier:
     * it stamped in-flight tool parts and dropped the reason on a turn that had
     * none, which is exactly the blank bubble the sentence promised to prevent.
     * `AssistantStream.abort` (src/state/stream.ts) now appends the reason as a
     * text part when nothing else can carry it; these two pins keep the emitted
     * comment describing that, instead of drifting back to a promise the kit
     * does not keep. */
    expect(code, `${framework}: comment never says where the reason goes on a text-only turn`)
      .toContain('text-only turn, which has no panel to carry it');
    expect(code, `${framework}: comment hides that the reason is rendered to the user`)
      .toContain('The reason is SHOWN TO THE USER');

    /* THE LAST QUIET PATH, pinned by EVALUATING the emitted expression rather
     * than by reading it. `err instanceof Error ? err.message : 'Request failed'`
     * is true for `new Error('')` and yields '', so the fallback never fires and
     * abort() gets nothing to show -- the exact blank bubble the comment above it
     * promises to prevent, reached through the one shape nobody tests by hand.
     * An empty-message Error is ordinary: `throw new Error()`, a rethrown
     * `AbortError`, a wrapper that forgot its message.
     *
     * Asserting the literal (above) only proves the text; running it proves the
     * behavior, and it is the EMITTED string that runs, so this cannot pass on a
     * restatement that drifted from what is emitted. */
    const expr = code.match(/stream\.abort\((.+)\);/)?.[1];
    expect(expr, `${framework}: no stream.abort(...) argument to evaluate`).toBeTruthy();
    const reasonFor = new Function('err', `return (${expr});`) as (err: unknown) => string;
    expect(reasonFor(new Error('boom')), `${framework}: loses a real message`).toBe('boom');
    expect(reasonFor(new Error('')), `${framework}: empty-message Error aborts with nothing`)
      .toBe('Request failed');
    expect(reasonFor('a bare string throw'), `${framework}: non-Error throw`).toBe('Request failed');
  });

  /**
   * INVERTED. "mock scaffolds stay catch-free: there is no request to fail" was
   * true of the inline fold and is false now: the mock drives the same
   * createAssistantStream through the same reader, so it gets — and needs — the
   * same settling. `stream.done()` in the finally is what releases the message
   * and the loading flag, and abort() is what settles it if the reply throws
   * mid-parse. A mock that skipped this would leave a permanently spinning
   * composer on any error inside the responder.
   */
  it('mock scaffolds settle exactly like a real backend', async () => {
    const code = frontEnd(
      await scaffold.handler({
        framework: 'react',
        useCase: 'agentic',
        integration: 'mock',
        placement: 'full-page',
      }),
    );
    expect(code).toMatch(/^\s*\} catch \(err\) \{$/m);
    expect(code).toContain(
      "stream.abort(err instanceof Error && err.message ? err.message : 'Request failed');",
    );
    expect(code).toContain('stream.done();');
    const catchAt = code.indexOf('} catch (err) {');
    const finallyAt = code.indexOf('} finally {', catchAt);
    const abortAt = code.indexOf('stream.abort(');
    expect(abortAt, 'abort outside the catch').toBeGreaterThan(catchAt);
    expect(abortAt, 'abort after the finally').toBeLessThan(finallyAt);
  });
});

// ── the backend block is a BACKEND route ─────────────────────────────────────

describe('framework: html gets a server route, never a second front end', () => {
  // routeTemplates keyed by 'html' can only hold a browser snippet, and block (1)
  // already emits the browser side. ollama shipped one, so `framework: 'html'`
  // printed a SECOND <kai-chat id="chat"> with its own kai-submit listener under
  // the BACKEND ROUTE heading: a duplicate element id and two fetches per submit.
  it.each(listIntegrations().map((i) => i.id))('%s emits exactly one kai-chat element', async (integration) => {
    const out = await scaffold.handler({
      framework: 'html',
      useCase: 'drop-in-chat',
      integration,
      placement: 'full-page',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text.match(/<kai-chat id="chat"/g) ?? [], `${integration}: duplicate kai-chat`).toHaveLength(1);
    expect(
      text.match(/addEventListener\('kai-submit'/g) ?? [],
      `${integration}: competing kai-submit listeners`,
    ).toHaveLength(1);
  });

  it('no integration ships an html routeTemplate', () => {
    for (const integration of listIntegrations()) {
      expect(Object.keys(integration.routeTemplates), `${integration.id}`).not.toContain('html');
    }
  });
});

/**
 * DEFECT (1): every non-next framework used to be handed the Next.js route.
 *
 * It compiled — `export async function POST(req: Request)` is valid TypeScript
 * anywhere — and then failed at runtime, differently per framework: SvelteKit
 * calls POST(event) and threw `req.json is not a function` on the first submit;
 * TanStack Start never routes a bare POST export; a Vite SPA has no server to
 * paste it into at all. Compiling was never the property that mattered, which is
 * why these assert the framework's own DECLARATION, not the handler body.
 */
describe('the backend route matches the framework that asked for it', () => {
  const routeOf = async (framework: string, integration = 'openrouter') => {
    const out = await scaffold.handler({ framework, useCase: 'drop-in-chat', integration, placement: 'full-page' });
    return (out.content as { type: string; text: string }[])[0].text.split('=== (2) BACKEND ROUTE ===')[1];
  };

  it.each([
    ['next', 'app/api/chat/route.ts', /export async function POST\(req: Request\)/],
    ['svelte', 'src/routes/api/chat/+server.ts', /export const POST: RequestHandler = \(\{ request \}\) => chatHandler\(request\)/],
    ['tanstack-start', 'src/routes/api/chat.ts', /createFileRoute\('\/api\/chat'\)\(\{\n\s*server: \{ handlers: \{ POST/],
    // Outside src/: a create-vite tsconfig.app.json is `"include": ["src"]` with no
    // node types, so a handler under src/ is TS2591 on `process` in a stock build.
    ['vue', '// server/chat.ts', /server\.middlewares\.use\('\/api\/chat'/],
    ['react', '// server/chat.ts', /server\.middlewares\.use\('\/api\/chat'/],
    ['worker', 'src/index.ts', /export default \{\n\s*fetch\(request: Request\)/],
    ['express', 'server.ts', /app\.post\('\/api\/chat'/],
  ])('%s declares its own route in %s', async (framework, file, declaration) => {
    const route = await routeOf(framework);
    expect(route, `${framework}: no file path`).toContain(file);
    expect(route, `${framework}: not declared the way ${framework} routes`).toMatch(declaration);
    // The portable handler is shared; the DECLARATION is what differs.
    expect(route).toContain('async function chatHandler(request: Request)');
  });

  it('svelte does not get a bare Next-shaped POST(req)', async () => {
    // CODE only: the emitted svelte route explains the difference in a comment,
    // and that comment quotes the very line it is warning about.
    const code = (await routeOf('svelte'))
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('#'))
      .join('\n');
    // This exact declaration is what threw `req.json is not a function`.
    expect(code).not.toMatch(/export async function POST\(req: Request\)/);
  });

  it('tanstack-start imports @tanstack/react-start so `server` typechecks', async () => {
    // The augmentation that adds `server` to the route options ships with
    // @tanstack/react-start. Nothing else in a scaffolded src/ imports it, so
    // without this line the emitted block fails with TS2353 then TS7031.
    expect(await routeOf('tanstack-start')).toContain("import '@tanstack/react-start'");
  });

  it('warns for EVERY framework that cannot host the route, not just react', async () => {
    // pi ships an Express-only bridge (a Node child_process), so every other
    // framework has to be told. The warning used to be gated on react.
    for (const framework of ['html', 'react', 'vue', 'svelte', 'tanstack-start', 'next']) {
      const route = await routeOf(framework, 'pi');
      expect(route, `${framework}: no warning`).toContain('WARNING');
      expect(route, `${framework}: warning does not name the target`).toMatch(/will NOT run/);
    }
  });

  it('html says there is no server, and still shows the handler to deploy', async () => {
    const route = await routeOf('html');
    expect(route).toMatch(/static page has no server/);
    expect(route).toContain('async function chatHandler(request: Request)');
  });
});

/**
 * DEFECT (2): the emitted route dropped the upstream status, so a 401 — the
 * no-key first run — reached the browser as a 200 whose body was a JSON error
 * labelled text/event-stream. Nothing rendered and nothing logged.
 */
describe('the backend route forwards the upstream status', () => {
  it.each(['next', 'svelte', 'tanstack-start', 'vue', 'react', 'worker', 'express', 'html'])(
    '%s forwards it',
    async (framework) => {
      const out = await scaffold.handler({
        framework,
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
      });
      const route = (out.content as { type: string; text: string }[])[0].text.split('=== (2) BACKEND ROUTE ===')[1];
      expect(route, `${framework}: never checks upstream.ok`).toMatch(/if \(!upstream\.ok\)/);
      expect(route, `${framework}: drops the upstream status`).toMatch(/status: upstream\.status/);
      // and does not relabel the error body as a stream
      expect(route).toMatch(/'Content-Type': upstream\.headers\.get\('content-type'\)/);
    },
  );

  it('the bridging routes carry the status across the bridge', async () => {
    for (const [framework, expected] of [
      ['vue', /res\.statusCode = response\.status/],
      ['react', /res\.statusCode = response\.status/],
      ['express', /res\.status\(response\.status\)/],
    ] as const) {
      const out = await scaffold.handler({
        framework,
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
      });
      const route = (out.content as { type: string; text: string }[])[0].text.split('=== (2) BACKEND ROUTE ===')[1];
      expect(route, `${framework}: the bridge drops the status`).toMatch(expected);
    }
  });
});

/**
 * angular + solid: the two frameworks the scaffolder could not target at all.
 *
 * They are grouped together because the interesting thing about them is that
 * they are NOT the same kind of target:
 *   · angular consumes the `kai-*` custom elements, like vue/svelte/html.
 *   · solid consumes the SolidJS components DIRECTLY from the root entry —
 *     the kit is authored in Solid, so the facade would ship the runtime twice.
 *
 * The last describe in this file is the consistency guard: whatever the two
 * targets do differently in SYNTAX, they must offer the same CAPABILITIES as
 * every other framework.
 */
describe('scaffold — angular', () => {
  const emit = async (useCase = 'agentic', integration = 'openrouter') => {
    const out = await scaffold.handler({ useCase, integration, placement: 'full-page', framework: 'angular' });
    return (out.content as { type: string; text: string }[])[0].text;
  };
  const front = (text: string) => text.split('=== (2) BACKEND ROUTE ===')[0];
  const route = (text: string) => text.split('=== (2) BACKEND ROUTE ===')[1].split('=== (3) RUN NOTE ===')[0];

  it('declares CUSTOM_ELEMENTS_SCHEMA — without it every <kai-*> fails the template compiler', async () => {
    const f = front(await emit());
    expect(f).toContain('schemas: [CUSTOM_ELEMENTS_SCHEMA]');
    expect(f).toMatch(/import \{[^}]*CUSTOM_ELEMENTS_SCHEMA[^}]*\} from '@angular\/core';/);
  });

  it('binds arrays as DOM PROPERTIES, never as attributes', async () => {
    const f = front(await emit());
    expect(f).toContain('[messages]="messages()"');
    expect(f).toContain('[suggestions]="suggestions"');
    // `messages="…"` would be an attribute: the array stringifies to "[object Object]".
    expect(f).not.toMatch(/(?:^|\s)messages="/m);
    expect(f).not.toMatch(/(?:^|\s)suggestions="/m);
  });

  it('listens for kai-submit and narrows the event inside the handler', async () => {
    const f = front(await emit());
    expect(f).toContain('(kai-submit)="onSubmit($event)"');
    // Under strictTemplates Angular types `$event` on an unknown custom-element
    // event as Event, so a CustomEvent-typed parameter would not compile.
    expect(f).toContain('async onSubmit(event: Event) {');
    expect(f).toContain('const e = event as CustomEvent<{ value: string }>;');
  });

  it('puts the theme in angular.json, not in a TS css import (the builder takes neither)', async () => {
    const f = front(await emit());
    expect(f).toContain('node_modules/@kitn.ai/ui/dist/theme.tokens.css');
    expect(f).not.toMatch(/import ['"]@kitn\.ai\/ui\/theme(\.tokens)?\.css['"]/);
  });

  it('re-applies the properties after the element upgrades (the SCAF-15 race)', async () => {
    const f = front(await emit());
    expect(f).toContain("await customElements.whenDefined('kai-chat')");
    expect(f).toContain('afterNextRender(');
    expect(f).toContain('viewChild.required<ElementRef<KaiChatElement>>(');
  });

  it('reads the thread off the signal — no React-style turn-scoped copy', async () => {
    const f = front(await emit());
    expect(f).toContain('this.messages.set([...this.messages()');
    expect(f).toContain('toOpenAIMessages(this.messages())');
    expect(f).not.toContain('let thread: ChatMessage[]');
  });

  it('emits src/server.ts with /api/chat registered BEFORE the Angular catch-all', async () => {
    const r = route(await emit());
    expect(r).toContain('// src/server.ts');
    expect(r).toContain('ng add @angular/ssr');
    expect(r).toContain("app.post('/api/chat', express.json()");
    expect(r).toContain('export const reqHandler = createNodeRequestHandler(app);');
    // Order is the whole point: the renderer would answer /api/chat with HTML.
    expect(r.indexOf("app.post('/api/chat'")).toBeLessThan(r.indexOf('angularApp\n'));
    // and the status has to survive the (req, res) bridge
    expect(r).toContain('res.status(response.status);');
  });

  it('does not silently claim a non-SSR Angular app can host the route', async () => {
    const r = route(await emit());
    expect(r).toMatch(/non-SSR Angular app cannot host \/api\/chat/);
  });
});

describe('scaffold — solid', () => {
  const emit = async (useCase = 'agentic', integration = 'openrouter') => {
    const out = await scaffold.handler({ useCase, integration, placement: 'full-page', framework: 'solid' });
    return (out.content as { type: string; text: string }[])[0].text;
  };
  const front = (text: string) => text.split('=== (2) BACKEND ROUTE ===')[0];
  const route = (text: string) => text.split('=== (2) BACKEND ROUTE ===')[1].split('=== (3) RUN NOTE ===')[0];

  // Was "from the root entry", and asserted `} from '@kitn.ai/ui';` by name — so
  // the generator's wrong specifier had a test HOLDING IT IN PLACE. That is the
  // second half of why this survived: tsc could not see it (./solid re-exports the
  // root, so both compile), and the one check that looked at the specifier was
  // pinning the wrong one. The entry assertion now lives in
  // "the emitted surface imports its framework's kit entry" at the end of this
  // file, over every archetype × integration rather than this single sample.
  it('renders the SolidJS components from the Solid entry — no kai-* anywhere', async () => {
    const f = front(await emit());
    expect(f).toMatch(/\} from '@kitn\.ai\/ui\/solid';/);
    expect(f).toContain('<ChatContainer');
    expect(f).toContain('<PromptInput');
    // The architectural claim, asserted: no element tags, no element registration.
    // Comment lines are stripped first — the emitted prose TALKS about <kai-chat>
    // to explain why it is absent, and counting that as markup would make this
    // assertion fail for the very sentence that documents it.
    const code = f.replace(/^[ \t]*\/\/.*$/gm, '');
    expect(code).not.toMatch(/<kai-[a-z-]+/);
    expect(code).not.toContain("import '@kitn.ai/ui/elements'");
  });

  it('and the LOADING OPTIONS note says so rather than claiming a register-all import', async () => {
    const text = await emit();
    const note = text.split('=== LOADING OPTIONS ===')[1] ?? '';
    expect(note).toContain("The scaffold emits NO `import '@kitn.ai/ui/elements'`");
  });

  /**
   * WORDING ONLY, and worth saying why it is kept anyway.
   *
   * The real guard is `solidPartCoverageCheck` in
   * scripts/verify-scaffold-compiles.mjs: it derives the variant list from the
   * `MessagePart` union and asserts a branch per variant across all 54 solid
   * cells, so it goes red the day someone ADDS a variant. A literal list here
   * cannot do that — it would pass a new variant silently, which is exactly how
   * `card` and `source` went missing while the emitted comment claimed the
   * thread rendered "exactly what <kai-chat> renders".
   *
   * What this keeps is the shape the derived check depends on (the
   * `partAs(part(), '…')` spelling) plus the render CALLS, which the coverage
   * check does not look at: a `<Match>` that branches correctly and then renders
   * the wrong component would pass it.
   */
  it('renders EVERY part kind, not just text — the coarse element did that for free', async () => {
    const f = front(await emit());
    expect(f).toContain('function renderPart(');
    expect(f).toContain('  part: () => MessagePart,');
    for (const kind of ['text', 'reasoning', 'tool', 'card', 'source', 'file']) {
      expect(f, `no partAs branch for ${kind}`).toContain(`partAs(part(), '${kind}')`);
    }
    expect(f).toContain('<Tool toolPart={p().tool} />');
    // The card branch takes the app's registry when there IS one. `agentic` bears
    // cards, so the render call carries `types`/`schemas` — the Solid half of
    // <kai-chat>'s cardTypes/cardSchemas. Without them a developer's own card type
    // draws the fallback and is never validated, which is the whole seam.
    expect(f).toContain('<CardRenderer');
    expect(f).toContain('envelope={p().envelope}');
    expect(f).toContain('types={cards.components}');
    expect(f).toContain('schemas={cards.validationSchemas}');
    // An archetype with no registry to hand it still renders every card, plainly.
    const plain = front(await emit('drop-in-chat'));
    expect(plain).toContain('<CardRenderer envelope={p().envelope} />');
    expect(plain).not.toContain('types={cards.components}');
    expect(f).toContain('<Attachment data={fp.attachment}>');
  });

  /**
   * The two part kinds that render as a RUN, and the one placement fact that is
   * load-bearing rather than cosmetic.
   *
   * `components/message.tsx` collapses consecutive `source` parts into ONE
   * citation row and puts it OUTSIDE the message bubble on purpose: a citation
   * nested in `MessageContent` is indistinguishable from a link the model typed
   * into its own prose. The emitted scaffold has to do the same, or a Solid
   * consumer gets N stacked one-chip rows, or citations that read as prose links.
   */
  it('collapses source/file runs into one row, with citations outside the bubble', async () => {
    const f = front(await emit());
    // The run helper, and both callers.
    expect(f).toContain("runAt(parts(), index, 'source')");
    expect(f).toContain("runAt(parts(), index, 'file')");
    // ONE citation row, carrying the same ::part name <kai-chat> exposes...
    expect(f).toContain('<SourceList part="citations"');
    // ...and it is a SIBLING of the bubble, never nested inside MessageContent.
    // Containment, not a regex: `/<MessageContent[\s\S]*<SourceList/` matches the
    // text branch and the source branch as two UNRELATED points in the file, so it
    // is green no matter where the row sits — a check that proves nothing.
    const nestedInBubble = f
      .split('</MessageContent>')
      .slice(0, -1)
      .some((seg) => {
        const open = seg.lastIndexOf('<MessageContent');
        return open >= 0 && seg.slice(open).includes('<SourceList');
      });
    expect(nestedInBubble, 'a citation row is nested INSIDE the message bubble').toBe(false);
    // The run branches need the part's neighbours, so renderPart takes them.
    expect(f).toContain('  index: number,');
    expect(f).toContain('  parts: () => MessagePart[],');
  });

  /**
   * THE KEYING GUARD, and the honest statement of what it is worth.
   *
   * `verify:scaffold` cannot see this: a reference-keyed `<For>` type-checks
   * perfectly, and the failure is a runtime remount. What it costs a developer
   * who copies this file is real though — the outer `<For each={messages()}>`
   * plus the inner `<For each={m.parts}>` that used to be emitted here tore the
   * whole message row down on EVERY streaming delta, so expanding a tool or
   * reasoning panel mid-stream silently did nothing. The kit had the identical
   * defect in `ChatThread`/`Thread` (fixed in cb41f5c); this is the same fix,
   * applied to the code we tell people to copy.
   *
   * So this is a SHAPE assertion, not a behaviour one, and it is written to fail
   * loudly on the exact regression rather than to prove the emitted app works.
   * The behavioural proof is a browser: build a Solid app from this block
   * verbatim, replay a stream, expand a panel mid-stream and check it is still
   * open — see `examples/internal/openrouter-spike`'s `S18-expand-mid-stream`,
   * which is the same check against the kit's own components.
   */
  it('keys the message list by ID and the parts list by POSITION — the mid-stream remount bug', async () => {
    const f = front(await emit());
    // OUTER: keyed by id. Not the message objects — createAssistantStream gives
    // the streaming message a new identity per delta.
    expect(f).toContain('const messageKeys = createMemo(() => messages().map((m) => m.id));');
    expect(f).toContain('<For each={messageKeys()}>');
    expect(f).not.toContain('<For each={messages()}>');
    // and the row reads its message back through <For>'s index accessor
    expect(f).toContain('<Show when={messages()[i()]}>');
    // INNER: <Index>, keyed by position — the folds only append or patch in
    // place, and <Index> hands each row a SIGNAL so it survives the delta.
    expect(f).toContain('<Index each={m().parts}>');
    expect(f).toContain('{(part, pi) => renderPart(part, pi, () => m().parts, m().role)}');
    expect(f).not.toContain('<For each={m.parts}>');
    // Not `<Index>` for the OUTER list: position keying leaves an open panel
    // with the slot, so prepending older turns moves it onto the wrong message.
    expect(f).not.toContain('<Index each={messages()');
  });

  it('uses HYPHENATED style keys — Solid applies style via setProperty, not camelCase', async () => {
    const f = front(await emit());
    expect(f).toMatch(/'flex-direction': 'column'/);
    expect(f).not.toMatch(/flexDirection:/);
  });

  it('carries the Tailwind setup the components actually need', async () => {
    const f = front(await emit());
    expect(f).toContain('@import "tailwindcss"');
    // solid.css, not theme.css: theme.css is tokens only, and a Solid app compiling
    // its own Tailwind would otherwise ship without the form-control rules,
    // tw-animate-css and the typography plugin. Pinned by
    // tests/styles/solid-css-contract.test.ts on the stylesheet side.
    expect(f).toContain('@import "@kitn.ai/ui/solid.css"');
    expect(f).not.toContain('@import "@kitn.ai/ui/theme.css"');
    expect(f).toContain('tw-animate-css @tailwindcss/typography');
    expect(f).toContain('@source "../node_modules/@kitn.ai/ui"');
  });

  it('takes the submitted text from the controlled input signal, not a kai-submit event', async () => {
    const f = front(await emit());
    expect(f).toContain('const value = input().trim();');
    expect(f).toContain("setInput('');");
    expect(f).not.toContain('e.detail.value');
  });

  it('reads the thread off the signal — no React-style turn-scoped copy', async () => {
    const f = front(await emit());
    expect(f).toContain('setMessages([...messages()');
    expect(f).toContain('toOpenAIMessages(messages())');
    expect(f).not.toContain('let thread: ChatMessage[]');
  });

  it('hosts the route the way any Vite SPA does, and says it is dev-only', async () => {
    const r = route(await emit());
    expect(r).toContain('// server/chat.ts');
    expect(r).toContain('configureServer(server)');
    expect(r).toContain("server.middlewares.use('/api/chat'");
    expect(r).toMatch(/DEV ONLY/);
    expect(r).toContain('plugins: [solid(), tailwindcss(), chatApiPlugin()]');
    expect(r).toContain('res.statusCode = response.status;');
  });
});

/**
 * The product constraint, as a test: a developer moving between frameworks finds
 * the same components and the same concepts, with only the syntax differing.
 * angular and solid are in every list here — that is the point.
 */
describe('scaffold — capability parity across every front-end framework', () => {
  const FRONTENDS = ['html', 'react', 'next', 'vue', 'svelte', 'angular', 'solid', 'tanstack-start'] as const;

  it('every framework gets the LIVE two-round tool loop for the agentic archetype', async () => {
    for (const framework of FRONTENDS) {
      const out = await scaffold.handler({
        useCase: 'agentic',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2) BACKEND ROUTE ===')[0];
      for (const marker of [
        'MAX_TOOL_ROUNDS',
        'applyToolOutput(',
        'applyToolFailure(',
        'createAssistantStream(',
        'readOpenAIStream(',
        'toOpenAIMessages(',
        'function runTool(',
      ]) {
        expect(front, `${framework}: missing ${marker}`).toContain(marker);
      }
    }
  });

  it('every framework declares the tool schemas that make a first tool call possible', async () => {
    for (const framework of FRONTENDS) {
      const out = await scaffold.handler({
        useCase: 'agentic',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2) BACKEND ROUTE ===')[0];
      expect(front, `${framework}: no tools array`).toContain("name: 'search'");
      // The thread expression varies per framework (`thread`, `messages()`,
      // `this.messages()`, `chat.messages`), so match across its own parens.
      expect(front, `${framework}: tools not sent`).toMatch(/messages: toOpenAIMessages\([\s\S]*?\), tools/);
    }
  });

  it('every framework aborts the stream on a failed request instead of hanging the bubble', async () => {
    for (const framework of FRONTENDS) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2) BACKEND ROUTE ===')[0];
      expect(front, `${framework}: no abort`).toContain('stream.abort(');
      expect(front, `${framework}: no done`).toContain('stream.done()');
    }
  });

  it('every framework offers the starter suggestions and the LOADING OPTIONS + INTERACTION PATTERNS sections', async () => {
    for (const framework of FRONTENDS) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
      expect(text, `${framework}: no suggestions`).toContain("What's new?");
      expect(text, `${framework}: missing LOADING OPTIONS`).toContain('=== LOADING OPTIONS ===');
      expect(text, `${framework}: missing INTERACTION PATTERNS`).toContain('=== INTERACTION PATTERNS ===');
    }
  });

  it('angular and solid both get a REAL route, not a cannot-host warning', async () => {
    for (const framework of ['angular', 'solid'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const route = (out.content as { type: string; text: string }[])[0].text
        .split('=== (2) BACKEND ROUTE ===')[1]
        .split('=== (3) RUN NOTE ===')[0];
      expect(route, `${framework}: emitted a cannot-host warning`).not.toContain('will NOT run');
      expect(route, `${framework}: no chatHandler`).toContain('async function chatHandler(request: Request)');
    }
  });

  it('a python integration still warns honestly on both new frameworks', async () => {
    for (const framework of ['angular', 'solid'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'pydantic-ai',
        placement: 'full-page',
        framework,
      });
      const route = (out.content as { type: string; text: string }[])[0].text
        .split('=== (2) BACKEND ROUTE ===')[1]
        .split('=== (3) RUN NOTE ===')[0];
      expect(route, `${framework}: no warning for a Python service`).toContain('will NOT run');
    }
  });
});

/**
 * The generative-UI card round trip.
 *
 * These assert WORDING, which is all a string-literal emitter can be asserted on
 * from here: `verify:scaffold` compiles the same output under eight real consumer
 * tsconfigs, and `emitted-card-path.live.test.ts` actually RUNS it against a
 * canned model stream and reads the card out of the shadow DOM. Three layers,
 * because each one is blind to the other two — a scaffold can read correctly,
 * compile cleanly, and still render nothing.
 *
 * The one thing asserted here that neither other layer can see is the RESTATEMENT
 * ban: the emitted code must CALL the kit's functions and must never write a card
 * schema out again. A restated schema compiles and runs perfectly, and is the
 * exact drift this whole contract exists to prevent.
 */
describe('scaffold — the card round trip is emitted, never restated', () => {
  const FRONTENDS = ['html', 'react', 'next', 'vue', 'svelte', 'angular', 'solid', 'tanstack-start'] as const;

  const front = async (framework: string, useCase = 'agentic', integration = 'openrouter') => {
    const out = await scaffold.handler({ useCase, integration, placement: 'full-page', framework });
    return (out.content as { type: string; text: string }[])[0].text.split('=== (2) BACKEND ROUTE ===')[0];
  };

  it('every framework emits registry -> cardTools -> cardFromToolCall, calling the kit', async () => {
    for (const framework of FRONTENDS) {
      const code = await front(framework);
      expect(code, `${framework}: no registry`).toContain('createCardRegistry({');
      expect(code, `${framework}: no generated tool defs`).toContain("cardTools(cards, { provider: 'openai' })");
      expect(code, `${framework}: the loop never maps a card tool call`).toContain(
        'cardFromToolCall(call.name, call.input ?? {}, { id: call.id })',
      );
      expect(code, `${framework}: the card is never added to the stream`).toContain('stream.addCard(card);');
      expect(code, `${framework}: no import`).toContain("from '@kitn.ai/ui/schemas'");
    }
  });

  it('nothing about a card SHAPE is restated — the schema stays the schema', async () => {
    // The five-copies problem this contract exists to kill. A scaffold that spelled
    // out confirm's fields would compile, run, render, and then drift the first time
    // the card contract moved, with nothing anywhere to say so.
    for (const framework of FRONTENDS) {
      const code = await front(framework);
      // Confirm's own property names, as they appear in confirm.schema.json. `search`
      // legitimately writes `type: 'object'` / `required: [...]` for the ONE tool the
      // scaffold hand-declares, so those generic keywords are not the tell; the card's
      // field names are.
      for (const field of ['dismissible', 'x-kai-control', 'ConfirmCardData']) {
        expect(code, `${framework}: restates confirm's \`${field}\``).not.toContain(field);
      }
      // And the tool NAME comes off toolNameForCardType, never a literal.
      expect(code, `${framework}: hard-codes a kai_ tool name`).not.toMatch(/name: 'kai_/);
    }
  });

  it('the two card props are JS PROPERTIES, never attributes', async () => {
    for (const framework of FRONTENDS) {
      const code = await front(framework);
      // Solid renders the components directly, so its half of the contract is
      // <CardRenderer types/schemas> rather than <kai-chat>'s cardTypes/cardSchemas.
      const wiring =
        framework === 'solid'
          ? ['types={cards.components}', 'schemas={cards.validationSchemas}']
          : ['cards.tags', 'cards.validationSchemas'];
      for (const needle of wiring) expect(code, `${framework}: ${needle} unwired`).toContain(needle);
      for (const prop of ['cardTypes', 'cardSchemas']) {
        expect(code, `${framework}: ${prop} as an attribute`).not.toMatch(new RegExp(`(?:^|\\s)${prop}="`, 'm'));
      }
    }
  });

  it('mock emits no card round trip: there is no model to ask for one', async () => {
    for (const framework of FRONTENDS) {
      const code = await front(framework, 'agentic', 'mock');
      expect(code, `${framework}: mock declares a registry`).not.toContain('createCardRegistry(');
      expect(code, `${framework}: mock maps card tool calls`).not.toContain('cardFromToolCall(');
    }
  });

  /**
   * The catalog-derived half, and the one that survives a new integration.
   *
   * `cardTools()` takes `provider` as a REQUIRED argument because the three tool
   * envelopes are different documents. An integration whose route forwards a tools
   * array but whose stream format is unmapped would emit a `tools` array with no
   * card in it: the model is never told a card exists, never emits one, and nothing
   * anywhere says why. Derived from `listIntegrations()`, so the day the `anthropic`
   * integration lands this goes red until its envelope is stated.
   */
  it('every integration that forwards a tools array has a card-tool provider', async () => {
    const forwarding = listIntegrations().filter((i) => i.forwardsFromClient.includes('tools'));
    // Anti-vacuity: if the catalog stopped declaring `tools` anywhere, the loop below
    // would pass by running zero times.
    expect(forwarding.length, 'no integration forwards a tools array — this check is vacuous').toBeGreaterThan(0);
    for (const integration of forwarding) {
      // Keyed on the components list, not the `agentic` preset id: `cardEmitPlan`
      // plans for a SURFACE, and the surfaces that bear cards include ones no
      // preset names (a workspace that also renders its tool calls).
      const plan = cardEmitPlan(getArchetype('agentic')!.components, integration.id);
      expect(plan, `${integration.id}: not in the registry`).not.toBeNull();
      expect(plan!.tools, `${integration.id}: expected a tools array`).toBe(true);
      expect(
        plan!.provider,
        `${integration.id} forwards a tools array but declares no clientToolFormat, so the scaffold would ` +
          'offer the model no card tool at all. State the envelope its route expects — and read the route ' +
          'first: one that CONVERTS the array server-side wants the shape it converts FROM, not its own ' +
          "provider's (streamFormat is the RESPONSE stream and does not answer this).",
      ).not.toBeNull();
      const code = await front('react', 'agentic', integration.id);
      expect(code, `${integration.id}: wrong provider emitted`).toContain(
        `cardTools(cards, { provider: '${plan!.provider}' })`,
      );
    }
  });

  it('an integration whose route builds its own tools still wires the client half', async () => {
    // langgraph owns its tool list server-side (forwardsFromClient is empty), so there
    // is no client tools array to put card tools in — but an envelope arriving from
    // that agent still has to draw, so the registry and the loop's mapping stay.
    const code = await front('react', 'agentic', 'langgraph');
    expect(code).toContain('createCardRegistry({');
    expect(code).toContain('cardFromToolCall(');
    // Asserted on the IMPORT LINE, not on the whole file: the emitted prose names
    // `cardTools(cards, …)` while explaining what the registry is for, and matching
    // that would be a comment standing in for the code — in the direction that
    // makes the test pass for the wrong reason.
    const imported = code.match(/^import \{(.+)\} from '@kitn\.ai\/ui\/schemas';$/m)?.[1] ?? '';
    expect(imported, 'nothing to import from @kitn.ai/ui/schemas').toContain('createCardRegistry');
    expect(imported, 'imported cardTools with nothing to call it on (TS6133 in a stock app)').not.toContain(
      'cardTools',
    );
    expect(code, 'called cardTools with no tools array to put it in').not.toMatch(/\.\.\.cardTools\(/);
  });
});

/**
 * SCAF-8, the half tsc cannot reach: the emitted model id has to be an id the
 * host that scaffold's own route POSTs to will actually answer.
 *
 * WHY A COMPILE PROVES NOTHING HERE. `const model = 'openai/gpt-4o-mini'` and
 * `const model = 'gpt-4o-mini'` are the same type. The whole matrix in
 * verify-scaffold-compiles.mjs went green on the first of those while
 * api.openai.com answered it with a 404 — a scaffold generated for the provider
 * it names could not run against that provider, and every gate in the repo said
 * fine. Compilation is not behaviour.
 *
 * SO THIS READS THE EMITTED DOCUMENT, BOTH HALVES, and checks them against each
 * other rather than against a restated table:
 *   · the id comes out of the FRONT END's `const model = '…'`
 *   · the host comes out of the BACKEND ROUTE's own `fetch('…')`
 * Neither is a value this file supplies, so the check cannot pass by agreeing
 * with itself — the only thing stated here is what each host's id SPACE looks
 * like, which is the fact that was wrong.
 *
 * An unrecognised host is a hard failure, not a skip, for the same reason the
 * scaffold gate hard-fails an unrecognised runtime label: a new integration that
 * quietly matched nothing would restore exactly the blind spot this closes.
 */
describe("scaffold — the emitted model id belongs to its route's host", () => {
  /**
   * Model-id SHAPE per API host. Shape, not a value list: pinning the exact
   * strings would just restate CLIENT_MODEL_IDS and would go stale on the next
   * model release, while the id space of a host is the stable fact — OpenRouter
   * namespaces by vendor, first-party APIs do not, and Anthropic's ids are all
   * `claude-*`. Getting the SPACE wrong is what 404s.
   */
  const HOST_ID_SPACES: {
    host: string;
    expected: string;
    accepts: (id: string) => boolean;
  }[] = [
    {
      host: 'openrouter.ai',
      expected: "a vendor-prefixed 'vendor/model' slug, e.g. 'openai/gpt-4o-mini'",
      accepts: (id) => /^[^/\s]+\/[^/\s]+$/.test(id),
    },
    {
      host: 'api.openai.com',
      // The exact defect: the prefixed form is an OpenRouter slug and this host
      // 404s it.
      expected: "a bare id with NO vendor prefix, e.g. 'gpt-4o-mini' (never 'openai/gpt-4o-mini')",
      accepts: (id) => !id.includes('/') && !id.startsWith('claude-'),
    },
    {
      host: 'api.anthropic.com',
      expected: "an Anthropic id, e.g. 'claude-opus-5' / 'claude-sonnet-5' / 'claude-haiku-4-5'",
      accepts: (id) => /^claude-[a-z0-9.-]+$/.test(id),
    },
    {
      host: 'localhost:11434',
      expected: "a local Ollama tag, e.g. 'llama3.2'",
      accepts: (id) => !id.includes('/'),
    },
  ];

  const emit = async (integrationId: string) => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: integrationId,
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const [frontEnd, backend = ''] = text.split('=== (2) BACKEND ROUTE ===');
    return { frontEnd, backend };
  };

  it('every integration that forwards a model emits one valid for the host it POSTs to', async () => {
    const forwarding = listIntegrations().filter((i) => i.forwardsFromClient.includes('model'));
    // Anti-vacuity: if the catalog stopped forwarding `model` anywhere, the loop
    // below would pass by running zero times.
    expect(forwarding.length, 'no integration forwards a model — this check is vacuous').toBeGreaterThan(0);

    for (const integration of forwarding) {
      const { frontEnd, backend } = await emit(integration.id);

      const id = frontEnd.match(/const model = '([^']+)'/)?.[1];
      expect(
        id,
        `${integration.id}: declares forwardsFromClient: ['model'] but the scaffold emits no \`const model\` — ` +
          'the field would be sent as undefined',
      ).toBeDefined();

      // The host the emitted route really calls, read off its own fetch().
      const hosts = [...backend.matchAll(/fetch\(\s*['"`]([^'"`]+)['"`]/g)]
        .map((m) => {
          try {
            return new URL(m[1]).host;
          } catch {
            return '';
          }
        })
        .filter(Boolean);
      expect(hosts.length, `${integration.id}: emitted route calls no absolute URL — cannot tell which host`)
        .toBeGreaterThan(0);

      const space = HOST_ID_SPACES.find((s) => hosts.includes(s.host));
      expect(
        space,
        `${integration.id}: emitted route POSTs to ${hosts.join(', ')}, which has no entry in HOST_ID_SPACES. ` +
          'Add one stating what that host\'s model ids look like — a host nobody has described is a host whose ' +
          'ids nothing is checking.',
      ).toBeDefined();

      expect(
        space!.accepts(id!),
        `${integration.id}: emits model id '${id}' but its route POSTs to ${space!.host}, which wants ` +
          `${space!.expected}. This compiles and then 404s at runtime.`,
      ).toBe(true);
    }
  });

  it('the id space rules reject the ids of the OTHER hosts', () => {
    // Proves the rules DISCRIMINATE. Each `accepts` is checked against a
    // representative id from every other host; a rule that waved everything
    // through would pass the test above no matter what the scaffolder emitted,
    // which is the failure mode this whole file exists to catch.
    const samples: Record<string, string> = {
      'openrouter.ai': 'openai/gpt-4o-mini',
      'api.openai.com': 'gpt-4o-mini',
      'api.anthropic.com': 'claude-opus-5',
    };
    for (const [host, id] of Object.entries(samples)) {
      const own = HOST_ID_SPACES.find((s) => s.host === host)!;
      expect(own.accepts(id), `${host} rejects its OWN id '${id}'`).toBe(true);
    }
    // The specific cross-host confusions that shipped, or could:
    const openai = HOST_ID_SPACES.find((s) => s.host === 'api.openai.com')!;
    expect(openai.accepts('openai/gpt-4o-mini'), 'api.openai.com accepted an OpenRouter slug').toBe(false);
    expect(openai.accepts('claude-opus-5'), 'api.openai.com accepted an Anthropic id').toBe(false);
    const anthropic = HOST_ID_SPACES.find((s) => s.host === 'api.anthropic.com')!;
    expect(anthropic.accepts('gpt-4o-mini'), 'api.anthropic.com accepted an OpenAI id').toBe(false);
    expect(anthropic.accepts('openai/gpt-4o-mini'), 'api.anthropic.com accepted an OpenRouter slug').toBe(false);
    const openrouter = HOST_ID_SPACES.find((s) => s.host === 'openrouter.ai')!;
    expect(openrouter.accepts('gpt-4o-mini'), 'openrouter.ai accepted an unprefixed id').toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The catalog's `deps` and `keyExposure` ARE the scaffold's install command and
// its proxy decision.
//
// Both fields were declared by all eleven integrations and read by nothing. A
// field with no consumer is a field nobody has proven correct: every value could
// have been wrong with the whole suite green, and two of them WERE wrong in the
// prose that stood in for them (langgraph's run note named three packages where
// `deps.npm` has four, and pydantic-ai's named three where `deps.pip` has four).
//
// These checks are written so a WRONG VALUE fails them, not just a missing wire.
// That distinction is the point, and it is what makes the second and third checks
// below the load-bearing ones: their expectations come from GROUND TRUTH — the
// imports the emitted route really makes, and the credential the integration
// really holds — rather than from the same declaration the emitter read. A check
// whose expectation comes from the field it is checking moves with the corruption
// and stays green.
// ─────────────────────────────────────────────────────────────────────────────
describe('the emitted scaffold is built from `deps` and `keyExposure`', () => {
  /** Every front-end target. Enumerated, so a new one is covered on arrival. */
  const FRONTENDS = ['html', 'react', 'next', 'vue', 'svelte', 'angular', 'solid', 'tanstack-start'] as const;

  const emit = async (integrationId: string, framework: string): Promise<string> => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: integrationId,
      placement: 'full-page',
      framework,
    });
    return (out.content as { type: string; text: string }[])[0].text;
  };

  const frontEndBlock = (text: string) => text.split('=== (2) BACKEND ROUTE ===')[0];
  const routeBlock = (text: string) =>
    text.split('=== (2) BACKEND ROUTE ===')[1]?.split('=== (3) RUN NOTE ===')[0] ?? '';
  const runNoteBlock = (text: string) =>
    text.split('=== (3) RUN NOTE ===')[1]?.split('=== LOADING OPTIONS ===')[0] ?? '';

  /** The install commands the scaffold emits, read back out of its own text. */
  const emittedInstall = (text: string) => {
    const note = runNoteBlock(text);
    const npm = note.match(/^\s*npm install (.+)$/m);
    const pip = note.match(/^\s*pip install (.+)$/m);
    return {
      npm: npm ? npm[1].trim().split(/\s+/) : [],
      pip: pip ? pip[1].trim().split(/\s+/) : [],
    };
  };

  /**
   * Ground truth, restated here on purpose rather than imported from the schema.
   * These two patterns are what the checks below MEASURE the emitted text
   * against; importing the emitter's own definitions would let one edit move the
   * claim and the check that reads it together.
   */
  const SECRET_ENV_VAR = /(?:KEY|TOKEN|SECRET|PASSWORD)$/;
  const AUTH_HEADER = /Authorization\s*:|['"]x-api-key['"]\s*:/i;

  const routeSourcesOf = (integration: Integration): string[] => [
    ...Object.values(integration.routeTemplates),
    ...(integration.webRoute ? [integration.webRoute] : []),
  ];
  const secretsOf = (integration: Integration) => integration.envVars.filter((n) => SECRET_ENV_VAR.test(n));

  /** `@langchain/core/tools` is the package `@langchain/core`. */
  const packageOf = (specifier: string): string => {
    const segments = specifier.split('/');
    return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  };

  // Anti-vacuity. Every check below loops over the catalog; an empty one would
  // pass them all by running zero times.
  it('the catalog it enumerates is not empty', () => {
    expect(listIntegrations().length).toBeGreaterThan(0);
  });

  /**
   * The wiring half: the emitted install command IS `deps`, for every integration
   * and every front-end target.
   *
   * This one moves with a corrupted `deps` and would stay green under it — which
   * is exactly why it is not the only check here. What it catches is the EMITTER
   * drifting from the catalog: a hand-written package list creeping back in, a
   * framework branch that forgets the line, `@kitn.ai/ui` going missing.
   */
  it("emits an install command that is exactly the integration's declared deps", async () => {
    for (const integration of listIntegrations()) {
      for (const framework of FRONTENDS) {
        const { npm, pip } = emittedInstall(await emit(integration.id, framework));
        expect(
          npm,
          `${integration.id} × ${framework}: emitted \`npm install\` line does not match ` +
            `['@kitn.ai/ui', ...deps.npm]`,
        ).toEqual(['@kitn.ai/ui', ...integration.deps.npm]);
        expect(
          pip,
          `${integration.id} × ${framework}: emitted \`pip install\` line does not match deps.pip`,
        ).toEqual(integration.deps.pip);
      }
    }
  });

  /**
   * THE VALUE CHECK for `deps`, and the one a wrong value fails.
   *
   * The expectation comes from the ROUTE THE SCAFFOLD JUST EMITTED — its own
   * import statements — not from `deps`, so removing a package from `deps` breaks
   * the two apart and this goes red naming the integration. `registry.test.ts`
   * makes the same comparison against the catalog's raw sources; this one closes
   * the loop at the other end, over the text a consumer is actually handed.
   *
   * `next` and `fastapi` are the two targets whose route adapter contributes no
   * import of its own (Express adds `express`, Angular adds `@angular/ssr`, the
   * Vite middleware adds `vite`). Those belong to the app template the developer
   * created rather than to the integration, and `deps` does not claim them.
   */
  it('names every package the route it emits actually imports', async () => {
    const PY_STDLIB = new Set(['json', 'os', 'typing', 'asyncio', 'sys', 're', 'time', 'dataclasses']);

    for (const integration of listIntegrations()) {
      const framework = integration.language === 'python' ? 'fastapi' : 'next';
      const text = await emit(integration.id, framework);
      const route = routeBlock(text);
      const { npm, pip } = emittedInstall(text);

      if (integration.language === 'python') {
        for (const match of route.matchAll(/(?:^|\n)\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/g)) {
          const module = (match[1] ?? match[2]).split('.')[0];
          if (PY_STDLIB.has(module)) continue;
          expect(
            pip,
            `${integration.id}: the route the scaffold emits imports '${module}', but the ` +
              `\`pip install\` line it emits alongside does not cover it — that service does not start`,
          ).toContain(module.replace(/_/g, '-'));
        }
        continue;
      }

      for (const match of route.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
        const specifier = match[1];
        if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
        const pkg = packageOf(specifier);
        expect(
          npm,
          `${integration.id}: the route the scaffold emits imports '${specifier}', but the ` +
            `\`npm install\` line it emits alongside does not cover ${pkg} — that app does not build`,
        ).toContain(pkg);
      }
    }
  });

  /**
   * THE VALUE CHECK for `keyExposure`, and the one a wrong value fails.
   *
   * The trigger is the sentence the scaffold really prints; the verdict comes from
   * what the integration really holds — a secret env var, or an authorization
   * header in its route. Declaring `frontend-safe` on an integration with a key
   * therefore makes the scaffolder print "no server hop is required" over a
   * credential, and this goes red naming it.
   *
   * One direction only, deliberately: an unnecessary proxy costs a server hop, and
   * the other error costs the key.
   */
  it('never says the proxy is optional for an integration that holds a credential', async () => {
    for (const integration of listIntegrations()) {
      for (const framework of FRONTENDS) {
        const text = await emit(integration.id, framework);
        if (!text.includes(NO_PROXY_CLAIM)) continue;

        const secrets = secretsOf(integration);
        expect(
          secrets,
          `${integration.id} × ${framework}: the scaffold tells the developer "${NO_PROXY_CLAIM}", ` +
            `but this integration declares the secret env var(s) ${secrets.join(', ')}. That sentence ` +
            `invites an API key into a browser bundle.`,
        ).toEqual([]);

        for (const code of routeSourcesOf(integration)) {
          expect(
            code,
            `${integration.id} × ${framework}: the scaffold tells the developer "${NO_PROXY_CLAIM}", ` +
              `but its route sends an authorization header, so it holds a credential a page must not.`,
          ).not.toMatch(AUTH_HEADER);
        }
      }
    }
  });

  /** The wiring half for `keyExposure`: one verdict per scaffold, and it is the declared one. */
  it('emits exactly one key-handling verdict, matching the declared keyExposure', async () => {
    for (const integration of listIntegrations()) {
      for (const framework of FRONTENDS) {
        const text = await emit(integration.id, framework);
        const claims = [
          text.includes(NO_PROXY_CLAIM) ? 'frontend-safe' : null,
          text.includes(PROXY_REQUIRED_CLAIM) ? 'needs-proxy' : null,
        ].filter(Boolean);
        expect(
          claims,
          `${integration.id} × ${framework}: expected exactly one key-handling verdict in the emitted scaffold`,
        ).toHaveLength(1);
        expect(
          claims[0],
          `${integration.id} × ${framework}: emitted verdict does not match its declared keyExposure`,
        ).toBe(integration.keyExposure);
      }
    }
  });

  /**
   * The marker-free check: whatever the scaffold SAYS, no secret env var may
   * appear anywhere a browser can read it.
   *
   * `VITE_*`, `NEXT_PUBLIC_*` and `PUBLIC_*` are inlined into the client bundle by
   * their bundlers, and block (1) IS client code, so naming a key there is the
   * same leak whether or not any prose admits it. This depends on no declaration
   * and no phrase — it catches an emitter that grows a frontend key path with
   * `keyExposure` left correctly at `needs-proxy`.
   */
  it('puts no secret env var anywhere a browser bundle can reach', async () => {
    const covered: string[] = [];
    for (const integration of listIntegrations()) {
      const secrets = secretsOf(integration);
      if (secrets.length === 0) continue;
      covered.push(integration.id);

      for (const framework of FRONTENDS) {
        const text = await emit(integration.id, framework);
        for (const secret of secrets) {
          for (const prefix of ['VITE_', 'NEXT_PUBLIC_', 'PUBLIC_']) {
            expect(
              text,
              `${integration.id} × ${framework}: emits ${prefix}${secret} — that prefix means the ` +
                `bundler writes the key into the JavaScript it serves`,
            ).not.toContain(`${prefix}${secret}`);
          }
          expect(
            text,
            `${integration.id} × ${framework}: emits import.meta.env.${secret}, which resolves in the browser`,
          ).not.toContain(`import.meta.env.${secret}`);
          expect(
            frontEndBlock(text),
            `${integration.id} × ${framework}: the FRONT-END block names ${secret}. Block (1) is ` +
              `client code — the key belongs to the route in block (2) and nowhere else`,
          ).not.toContain(secret);
        }
      }
    }
    expect(covered.length, 'no integration declares a secret env var — this check is vacuous').toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Every emitted surface imports the kit ENTRY its framework is meant to use.
//
// WHY THIS CANNOT BE LEFT TO tsc. `src/solid.ts` is `export * from './index'`,
// so `@kitn.ai/ui/solid` is a strict SUPERSET of the root `@kitn.ai/ui`: every
// name a Solid surface imports resolves from both, and `verify:scaffold`'s solid
// tsc project compiles clean either way. The generator emitted the ROOT entry for
// every Solid scaffold — wrong for every surface × integration, and in direct
// contradiction of the published guide, which tells readers "Import Solid
// components from `@kitn.ai/ui/solid`, not from the root `@kitn.ai/ui`" — and no
// compiler on this repo's critical path could see it. A structural assertion over
// the emitted SPECIFIER is the only thing that can.
//
// The cost of the root entry is not correctness, which is why it hid: it is that
// the root deliberately carries only the shared layer, so a Solid app told to
// import from it gets the smaller surface and has to discover the real entry when
// something it wants is missing. `./solid` is the one import that covers
// everything (see the WHY THIS EXISTS block in src/solid.ts).
// ─────────────────────────────────────────────────────────────────────────────
describe('the emitted surface imports its framework\'s kit entry', () => {
  /**
   * The entry each framework must import the kit's COMPONENTS from.
   *
   * This is the one thing here that cannot come from the registry — no catalog
   * describes it — so instead of trusting the list to stay complete, the check
   * below derives the KEYS it must have from the `Framework` enum. A framework
   * added to the enum without an entry here fails loudly rather than skipping
   * coverage silently, which is the failure mode a hand-written list has.
   *
   * `fastapi`/`express`/`worker` are backend targets: `renderSurface` gives them
   * the framework-agnostic web-components surface, so they take the same entry
   * `html` does.
   */
  const COMPONENT_ENTRY: Record<string, string> = {
    html: '@kitn.ai/ui/elements',
    vue: '@kitn.ai/ui/elements',
    svelte: '@kitn.ai/ui/elements',
    angular: '@kitn.ai/ui/elements',
    fastapi: '@kitn.ai/ui/elements',
    express: '@kitn.ai/ui/elements',
    worker: '@kitn.ai/ui/elements',
    react: '@kitn.ai/ui/react',
    next: '@kitn.ai/ui/react',
    'tanstack-start': '@kitn.ai/ui/react',
    // The one this block was written for. `./solid` re-exports the root, so tsc
    // accepts either and only this assertion can tell them apart.
    solid: '@kitn.ai/ui/solid',
  };

  /**
   * The kit specifiers a piece of emitted code IMPORTS.
   *
   * Anchored on `from`/`import` rather than on quotes, because the Solid surface's
   * setup comment carries two strings that are not imports and must not be read as
   * one: `@source "../node_modules/@kitn.ai/ui"` (a Tailwind scan path, which is
   * the package DIRECTORY and correctly has no subpath) and `@import
   * "@kitn.ai/ui/theme.css"` (CSS). The negative lookbehind is what keeps `@import`
   * out — matching it would report the bare-root bug in a place where there is none.
   *
   * The optional paren is not cosmetic: `next` never writes a static import of the
   * wrappers at all, it writes `dynamic(() => import('@kitn.ai/ui/react')...)`, so
   * a pattern requiring whitespace after `import` reports every Next surface as
   * importing nothing. That was this checker's own first red, not the emitter's.
   */
  const kitImportsOf = (code: string): string[] =>
    [...code.matchAll(/(?<![@\w])(?:from|import)\s*\(?\s*['"](@kitn\.ai\/ui[^'"]*)['"]/g)].map((m) => m[1]);

  /** Every framework the scaffolder accepts, from the enum rather than a list. */
  const FRAMEWORKS = Framework.options;

  /**
   * Every surface the catalogs can express, from the registry rather than a list.
   *
   * `listSurfaceProbes()`, NOT `listArchetypes()`, and that is the same axis
   * correction `verify:scaffold` already made — see the `WHY THESE AND NOT THE
   * PRESETS` comment on that function. The preset list is the wrong axis here for
   * the two reasons stated there, and both bite a check that reads emitted
   * imports:
   *
   *   1. It is seven cells over six distinct `components` lists —
   *      `support-widget` repeats `drop-in-chat`'s and differs only in
   *      `defaultPlacement`, which changes an inline CSS string and no import. So
   *      one cell in seven re-checked the previous cell's specifiers.
   *   2. Every preset is exactly ONE capability, so no preset can express the
   *      MAXIMAL surface — chat + sources + tool + reasoning + artifact +
   *      resizable + voice-input + file-upload + attachments. That is the only
   *      cell where the workspace layout, the tool loop, the card registry and
   *      the attachment staging are emitted into one file, and it is where an
   *      import emitted by one capability's branch can collide with another's.
   *      The specifier check had never seen it.
   *
   * The probes are a strict superset: every preset's `components` list is one of
   * them (chat-only · sources · tool+reasoning · artifact+resizable · voice-input
   * · file-upload+attachments), plus `every-capability`, which no preset can
   * reach. So this trades a duplicate cell for the composition and loses nothing.
   */
  const surfaces = () =>
    listSurfaceProbes().flatMap((probe) =>
      listIntegrations().map((integration) => ({ probe, integration })),
    );

  it('declares an expected entry for every framework in the enum', () => {
    for (const framework of FRAMEWORKS) {
      expect(
        COMPONENT_ENTRY[framework],
        `${framework}: the Framework enum accepts it but COMPONENT_ENTRY does not say which kit entry ` +
          `its surface must import from, so it would be scaffolded with nothing checking the specifier`,
      ).toBeDefined();
    }
    // Anti-vacuity: the loops below are over these two axes.
    expect(FRAMEWORKS.length).toBeGreaterThan(0);
    expect(surfaces().length).toBeGreaterThan(0);
  });

  it('imports the kit components from the entry its framework is meant to use', () => {
    for (const framework of FRAMEWORKS) {
      const expected = COMPONENT_ENTRY[framework];
      for (const { probe, integration } of surfaces()) {
        const code = renderSurface({ framework, components: probe.components, integration });
        expect(
          kitImportsOf(code),
          `${framework} × ${probe.id} × ${integration.id}: the emitted surface never imports ` +
            `${expected}, which is where this framework's components come from`,
        ).toContain(expected);
      }
    }
  });

  /**
   * The general form of the Solid bug: an emitted import must NAME the entry it
   * wants. The bare root is never the right answer for a generated app — the three
   * web-component frameworks want `./elements`, the three React ones want
   * `./react`, and Solid wants `./solid` — so a bare `@kitn.ai/ui` anywhere in an
   * emitted surface means some branch fell back to the default entry.
   *
   * Held over EVERY framework, not just Solid, because the reason it was invisible
   * is not specific to Solid: any subpath that re-exports the root compiles
   * identically from either specifier.
   */
  it('never imports the bare root entry, from any framework', () => {
    for (const framework of FRAMEWORKS) {
      for (const { probe, integration } of surfaces()) {
        const code = renderSurface({ framework, components: probe.components, integration });
        expect(
          kitImportsOf(code),
          `${framework} × ${probe.id} × ${integration.id}: the emitted surface imports the bare ` +
            `root '@kitn.ai/ui'. Every framework has an entry of its own (${COMPONENT_ENTRY[framework]}); ` +
            `the root is the shared layer every consumer resolves, and tsc accepts it here because the ` +
            `real entry re-exports it — so nothing but this assertion can tell the two apart.`,
        ).not.toContain('@kitn.ai/ui');
      }
    }
  });
});

/**
 * The attachment note is emitted into a USER'S repo, where nothing in this
 * project will ever look at it again.
 *
 * That is the whole risk. A comment in our own tree gets corrected when someone
 * reads it; a comment in a scaffolded app gets copied, committed, and believed
 * for years. So the one thing it must never do is restate the media-type
 * capability set -- that would be a second copy of `ENCODABLE`, in a string
 * literal, in code nothing can check, which is the exact drift the single
 * declaration exists to prevent.
 *
 * The precedent is not hypothetical: #186 corrected this note and left the doc
 * comment ABOVE it asserting the reverse, and both survived review, because a
 * claim in prose has nothing to disagree with.
 */
describe('the emitted attachment note points at the capability, never restates it', () => {
  const note = ATTACHMENT_WIRE_NOTE.join('\n');

  it('names no media type at all', () => {
    // Any `type/subtype` in the note is a copy of the declaration with no way to
    // be updated. The set lives in one place and is readable at runtime.
    const found = note.match(/\b(?:image|application|text|audio|video|multipart)\/[a-z0-9*.+-]+/gi);
    expect(found, `the note hardcodes ${String(found)}`).toBeNull();
  });

  it('points the reader at the function that IS the set', () => {
    expect(note).toContain('encodableMediaTypes()');
  });

  it('is actually emitted, so this guard is checking live output', async () => {
    // Without this the two assertions above could pass forever against a
    // constant nothing renders any more.
    const out = await scaffold.handler({
      components: ['kai-chat', 'kai-file-upload', 'kai-attachments'],
      integration: 'openai',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('encodableMediaTypes()');
    expect(text).toContain(ATTACHMENT_WIRE_NOTE[0]);
  });
});

/**
 * The other half of the same rule, and the half that was broken.
 *
 * The block above stops the emitted PROSE naming a media type. Seven emitters
 * were meanwhile writing `accept="image/*,application/pdf"` into the markup, so
 * the note said "this list moves, read `encodableMediaTypes()`" three lines above
 * an attribute that had already stopped moving: #190 made `text/*`,
 * `application/json`, `application/xml` and YAML encodable and the attribute
 * still steered users to images and PDFs. A comment can point at the function; an
 * attribute has to contain the answer, which is the only reason this half is a
 * different check rather than the same regex.
 *
 * TWO ASSERTIONS, DELIBERATELY, because they fail at different times:
 *   · the OUTPUT check catches an attribute that disagrees with the declaration
 *     today;
 *   · the SOURCE check catches a literal that AGREES with the declaration today,
 *     which the output check cannot see until `ENCODABLE` next changes — i.e. at
 *     exactly the moment the copy starts doing harm, one release too late.
 *
 * The framework axis is `Framework.options`, not a list written here. A
 * hand-written list is how a target gets added and covered by nothing, which is
 * the failure `loadCatalogAxes` in verify-scaffold-compiles.mjs was built to stop
 * repeating.
 */
describe('the emitted accept attribute is DERIVED, never restated', () => {
  const EXPECTED = encodableMediaTypes().join(',');

  // Every `accept="..."` in one scaffold's output, however the framework spells
  // the surrounding attribute.
  const acceptsIn = (text: string): string[] =>
    [...text.matchAll(/accept="([^"]*)"/g)].map((m) => m[1]);

  const emit = async (framework: string): Promise<string> => {
    const out = await scaffold.handler({
      components: ['kai-chat', 'kai-file-upload', 'kai-attachments'],
      integration: 'openai',
      placement: 'full-page',
      framework,
    });
    return (out.content as { type: string; text: string }[])[0].text;
  };

  it.each(Framework.options)('%s emits the kit capability set verbatim', async (framework) => {
    const found = acceptsIn(await emit(framework));
    // Anti-vacuity. A target that stopped emitting a picker at all would
    // otherwise pass this by having nothing to disagree with -- and the
    // attachment surface is requested explicitly above, so zero is a real
    // regression rather than a shape this scaffold is allowed to have.
    expect(found.length, `${framework} emitted no accept= at all`).toBeGreaterThan(0);
    for (const value of found) expect(value).toBe(EXPECTED);
  });

  it('has no media-type literal in any emitter, even a currently-correct one', async () => {
    // `fileURLToPath(import.meta.url)` on the STRING, then `join` -- the shape
    // manifest.test.ts and slots.test.ts already use. Building a `new URL()`
    // first hands node's `fileURLToPath` jsdom's URL implementation instead of
    // its own, which throws "The URL must be of scheme file" under this project's
    // jsdom environment.
    const here = dirname(fileURLToPath(import.meta.url));
    const file = join(here, 'tools', 'scaffold.ts');
    const source = await readFile(file, 'utf8');
    // Only `accept="..."` sites: `application/json` is a legitimate literal
    // elsewhere in this file (every emitted route sets that Content-Type), and a
    // blanket scan would fail on it forever.
    const literals = [...source.matchAll(/accept="([^"]*)"/g)]
      .map((m) => m[1])
      .filter((v) => /\b[a-z]+\/[a-z0-9*.+-]+/i.test(v));
    expect(
      literals,
      `an emitter hardcodes a media-type list in accept=: ${JSON.stringify(literals)}. ` +
        'Interpolate ATTACHMENT_ACCEPT instead -- it reads encodableMediaTypes() from ' +
        'wire/media-types.ts, which is the one declaration the composer and the encoders ' +
        'already share. A literal that is correct today is the defect: it stops moving when ' +
        'the capability set does, in code that ships to a user repo where nothing checks it.',
    ).toEqual([]);
  });
});

/**
 * The route preamble, as a SECOND consumer sees it.
 *
 * `Integration.webRoute` reads like a self-contained handler and is not one.
 * Every fragment in the catalog calls `readChatRequest`, and three of them also
 * call the content helpers, so a bare fragment does not compile: measured over
 * the catalog with `tsc --strict`, the eight `webRoute`s are TS2304 on five
 * distinct names (`readChatRequest`, `ChatRequestBody`, `wireParts`, `wireText`,
 * `WirePart`). Until now the declarations that supply them were module-private,
 * so `create-kai` — which writes these handlers to real files that have to
 * compile — carried a hand-copy of one of them and a build guard to notice when
 * it drifted.
 *
 * These tests grade the exported accessor as the thing that deletes that copy:
 * that it answers per-fragment rather than uniformly, that its symbol list is
 * read back out of the declaration text instead of listed beside it, that it
 * covers every fragment in the catalog, and that it is the SAME preamble the MCP
 * itself injects rather than a parallel one that can drift.
 */
describe('chatRoutePreamble — the seam a file-writing consumer needs', () => {
  /** A handler that only narrows the body. Five of eight catalog routes. */
  const passthrough = `async function chatHandler(request: Request): Promise<Response> {
  const { messages } = await readChatRequest(request);
  return new Response(JSON.stringify({ messages }));
}`;

  /** A handler that re-maps content into another SDK's shape. Three of eight. */
  const remapping = `async function chatHandler(request: Request): Promise<Response> {
  const { messages } = await readChatRequest(request);
  const parts: WirePart[] = wireParts(messages[0].content);
  return new Response(wireText(messages[0].content) + parts.length);
}`;

  it('supplies the body narrowing every route needs', () => {
    const { imports, symbols } = chatRoutePreamble(passthrough);
    expect(imports).toEqual([`import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';`]);
    expect(symbols).toContain('readChatRequest');
    expect(symbols).toContain('ChatRequestBody');
  });

  /**
   * The half a two-constant export would have got wrong. `CONTENT_PARTS_DECL` is
   * injected only where the route calls it, because an unused declaration is a
   * hard error under the gate's --noUnusedLocals; a consumer handed one flat
   * preamble would emit five routes that compile and three that do not.
   */
  it('adds the content helpers only for a route that calls them', () => {
    expect(chatRoutePreamble(passthrough).symbols).not.toContain('wireParts');
    const remap = chatRoutePreamble(remapping).symbols;
    expect(remap).toContain('wireParts');
    expect(remap).toContain('wireText');
    expect(remap).toContain('WirePart');
    // Still narrows the body too: the content helpers are additive, not a swap.
    expect(remap).toContain('readChatRequest');
  });

  /**
   * `symbols` is READ BACK out of `decl`, not listed beside it. That is the
   * difference between a consumer's drift guard grading the real declaration
   * text and grading a second copy of the same claim, which is the exact defect
   * this whole export exists to delete.
   */
  it.each([['passthrough', passthrough], ['remapping', remapping]])(
    'derives every symbol from the %s declaration text, in both directions',
    (_label, fragment) => {
      const { decl, symbols } = chatRoutePreamble(fragment);
      for (const name of symbols) {
        expect(
          decl.some((line) => new RegExp(`^(?:export )?(?:async )?(?:function|type|interface|const|class) ${name}\\b`).test(line)),
          `${name} is reported as declared but no line of decl declares it`,
        ).toBe(true);
      }
      // …and nothing top-level in decl is missing from symbols. BOTH fragments,
      // because the two differ by a whole declaration block: a hand-written list
      // can match the remapping case and still over-report for the passthrough
      // one, which is the direction that emits a route with unused declarations
      // and fails --noUnusedLocals in a user's project.
      const declared = decl
        .map((line) => /^(?:export\s+)?(?:async\s+)?(?:function|type|interface|const|class)\s+([A-Za-z_$][\w$]*)/.exec(line)?.[1])
        .filter((n): n is string => n !== undefined);
      expect([...symbols].sort()).toEqual(declared.sort());
    },
  );

  /**
   * The names the preamble exists to supply, WRITTEN OUT rather than read back.
   *
   * This list started as `chatRoutePreamble('').symbols ∪
   * chatRoutePreamble('wireParts()').symbols` and that version proved nothing:
   * deleting the content-helper injection outright shrank the expectation along
   * with the code, so the per-integration guard below went blind on exactly the
   * three routes it exists for and stayed green. Watched, then fixed. An
   * expectation derived from the field it is checking moves with the corruption
   * — see the note above `the emitted scaffold is built from deps` below.
   *
   * So this is a tripwire, and it is meant to be edited BY HAND when the
   * preamble gains or loses a declaration, because that edit is the moment
   * someone has to think about whether every emitter still compiles.
   */
  const PREAMBLE_UNIVERSE = [
    'ChatRequestBody', 'ChatRequestError', 'readChatRequest', 'toChatErrorResponse',
    'WireFileSource', 'WirePart', 'DATA_URI', 'wireParts', 'wireText',
  ] as const;

  it('declares exactly the symbols an emitted route is allowed to reference', () => {
    const everything = new Set([
      ...chatRoutePreamble('').symbols,
      ...chatRoutePreamble('wireParts(); wireText();').symbols,
    ]);
    expect(
      [...everything].sort(),
      'the route preamble gained or lost a declaration. Update PREAMBLE_UNIVERSE above, and check ' +
        'that create-kai (which writes these handlers to real files) still compiles every route.',
    ).toEqual([...PREAMBLE_UNIVERSE].sort());
  });

  /**
   * THE GUARD. Every fragment in the catalog, against its own preamble.
   *
   * A route that references a preamble name its own fragment does not get fails
   * here instead of shipping a handler that does not compile in a user's
   * project. Bounded honestly: this catches a FRAGMENT reaching for something,
   * and (via the tripwire above) the preamble dropping a block. It is not a free
   * -variable analysis — the tsc proof that decl+fragment actually compiles is
   * `verify:scaffold`, which builds all 99 routes.
   */
  it.each(listIntegrations().filter((i) => i.webRoute).map((i) => i.id))(
    '%s webRoute has no symbol its own preamble fails to declare',
    (id) => {
      const fragment = getIntegration(id)!.webRoute!;
      const supplied = new Set(chatRoutePreamble(fragment).symbols);
      for (const name of PREAMBLE_UNIVERSE) {
        // Only names the fragment REFERENCES and does not declare for itself.
        if (!new RegExp(`\\b${name}\\b`).test(fragment)) continue;
        if (new RegExp(`(?:function|type|interface|const|class)\\s+${name}\\b`).test(fragment)) continue;
        expect(
          supplied.has(name),
          `${id}: webRoute references '${name}' but chatRoutePreamble does not declare it for this fragment, ` +
            `so a consumer writing this handler to a file gets TS2304. Widen the injection in chatRoutePreamble.`,
        ).toBe(true);
      }
    },
  );

  /**
   * The exported accessor and the MCP's own emitted block are ONE code path.
   *
   * Two callers of the same declarations is how the duplication came back last
   * time, so this reads the real emitted route and asserts the exported
   * preamble's lines are literally in it, in order.
   */
  it('reconstructs the MCP route file byte for byte from the export alone', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'next',
    });
    const route = (out.content as { type: string; text: string }[])[0].text.split(
      '=== (2) BACKEND ROUTE ===',
    )[1];
    const fragment = getIntegration('openrouter')!.webRoute!;
    const { imports, decl } = chatRoutePreamble(fragment);
    // openrouter/next is the cell where the whole file IS import + preamble +
    // fragment: the Next adapter contributes no `before` lines and this fragment
    // opens on its handler, so nothing else can be hiding in between. An
    // EXACT reconstruction rather than three `toContain`s, because a `toContain`
    // on the decl passes even when the emitter appends a line of its own — which
    // is precisely the drift a second copy of the preamble would introduce.
    expect(route).toContain([...imports, ``, ...decl, ``, ...fragment.split('\n')].join('\n'));
  });

  /**
   * …and no route anywhere carries two copies of the narrowing. A duplicated
   * declaration is a redeclaration error, not a cosmetic one.
   */
  it.each(listIntegrations().filter((i) => i.webRoute).map((i) => i.id))(
    '%s emits the preamble exactly once',
    async (id) => {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat', integration: id, placement: 'full-page', framework: 'next',
      });
      const route = (out.content as { type: string; text: string }[])[0].text
        .split('=== (2) BACKEND ROUTE ===')[1].split('=== (3) RUN NOTE ===')[0];
      const { decl } = chatRoutePreamble(getIntegration(id)!.webRoute!);
      expect(route.split(decl.join('\n')).length - 1, `${id}: preamble not emitted exactly once`).toBe(1);
    },
  );

  /**
   * The failure no build and no typecheck can see.
   *
   * `openrouter`'s handler puts the client's `model` straight into its upstream
   * payload, so a front end that posts `{ messages }` alone sends no model and
   * the first message comes back 400. Both halves of the answer — WHETHER to
   * send one and WHICH — now come from here, so a second emitter cannot get the
   * first right and the second wrong.
   */
  it.each(listIntegrations().filter((i) => i.forwardsFromClient.includes('model')).map((i) => i.id))(
    '%s forwards the client model and has an id to send',
    (id) => {
      const model = defaultModelFor(getIntegration(id)!);
      expect(model, `${id} forwards 'model' with no CLIENT_MODEL_IDS row`).toBeTruthy();
      expect(CLIENT_MODEL_IDS[id]).toBe(model);
    },
  );

  it('sends no model for a route that pins its own', () => {
    // langgraph builds the model into the agent and never reads the field; an
    // editable const here would be the dead-const defect `forwardsFromClient`
    // exists to prevent.
    expect(defaultModelFor(getIntegration('langgraph')!)).toBeUndefined();
  });
});

/**
 * The first official BLOCK (recast spec 2026-08-20 § 3b; plan Task E).
 *
 * F-16 first: the `workspace` preset used to emit an UNWIRED artifact split
 * while omitting the rail — the one thing its name promised. It now composes
 * the layout shell + the wired rail + kai-chat + the @kitn.ai/ui/state thread
 * helpers, and the artifact split lives on under its own honest preset id so
 * the capability keeps its cells in verify:scaffold.
 *
 * Wording tests only: emitted code lives in string literals, so compilation is
 * verify:scaffold's job (all three tsc projects) and these pin the words.
 */
describe('scaffold — the workspace BLOCK (F-16 + recast § 3b)', () => {
  const BLOCK_FRONTENDS = ['react', 'next', 'tanstack-start', 'vue', 'svelte', 'angular', 'solid', 'html'] as const;

  it('F-16: the workspace preset is the block, and the artifact split keeps its own preset', () => {
    // Registry-level: the components ARE the axis, so this is the change that
    // moves verify:scaffold's cell counts on its own.
    expect(getArchetype('workspace')!.components).toEqual([
      'kai-chat',
      'kai-workspace',
      'kai-conversations',
    ]);
    // The old pair must stay a reachable capability (its renderers' split branch
    // would otherwise lose every gate cell without anything failing to say so).
    expect(getArchetype('artifact-split')?.components).toEqual([
      'kai-chat',
      'kai-artifact',
      'kai-resizable',
    ]);
    // And the derivation saw both: one probe carries the shell+rail pair, one
    // carries the artifact pair.
    const probes = listSurfaceProbes();
    expect(probes.some((p) => p.components.includes('kai-workspace') && p.components.includes('kai-conversations'))).toBe(true);
    expect(probes.some((p) => p.components.includes('kai-artifact') && p.components.includes('kai-resizable'))).toBe(true);
  });

  it('every framework: shell + wired rail + helpers, and no artifact split', async () => {
    for (const framework of BLOCK_FRONTENDS) {
      const out = await scaffold.handler({
        useCase: 'workspace',
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
      // The shell (element targets) or the Solid shell component.
      expect(front, `${framework}: no layout shell`).toMatch(/<kai-workspace|<Workspace\b|<WorkspaceShell\b/);
      // The rail, present AND wired: rows assigned, selection handled.
      expect(front, `${framework}: no rail`).toMatch(/<kai-conversations|<Conversations\b|<ConversationList\b/);
      expect(front, `${framework}: rail not wired to selection`).toMatch(
        /kai-conversation-select|onConversationSelect|onSelect/,
      );
      // F-16's other half: the split does NOT ride along uninvited.
      expect(front, `${framework}: artifact split leaked into the block`).not.toMatch(/<kai-artifact|<Artifact[\s/>]|<kai-resizable|<Resizable\b|ResizablePanelGroup/);
      // Lane D's ratified helpers, imported from the state entry.
      for (const helper of ['bindThreadMessages', 'createThreadSessions', 'createSaveScheduler', 'parseStoredThread']) {
        expect(front, `${framework}: missing ${helper}`).toContain(helper);
      }
      // The boundary, said out loud: persistence policy is the consumer's.
      expect(front, `${framework}: persistence boundary unstated`).toContain('PERSISTENCE IS YOURS');
      // Delete-under-stream has a named answer rather than a resurrecting thread.
      expect(front, `${framework}: sessions.abort unmentioned`).toContain('sessions.abort');
      // The item-mode note: batteries rows now, bring-your-own rows named.
      expect(front, `${framework}: item mode unmentioned`).toMatch(
        /kai-conversation-item|SlottedConversationItem/,
      );
    }
  });

  it('svelte block keeps the runes discipline (raw state + derived views, no Svelte 4)', async () => {
    const out = await scaffold.handler({
      useCase: 'workspace',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'svelte',
    });
    const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
    expect(front).not.toMatch(/^\s*\$:/m);
    expect(front).not.toMatch(/\son:[a-z-]+=\{/);
    expect(front).toContain('let threads = $state.raw<Thread[]>(');
    expect(front).toContain('const messages = $derived(');
    expect(front).toContain('let railEl = $state<KaiConversationsElement | undefined>(undefined)');
  });

  it('mock: the block previews keyless and still teaches the helpers', async () => {
    const out = await scaffold.handler({
      useCase: 'workspace',
      integration: 'mock',
      placement: 'full-page',
      framework: 'react',
    });
    const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
    expect(front).toContain('mockResponse');
    expect(front).toContain('createThreadSessions');
    expect(front).toContain('createSaveScheduler');
  });

  it('the block composes with the split and the companions (the every-capability shape)', async () => {
    // The all-capabilities probe puts the shell, the split, tools, sources,
    // voice and attachments in ONE surface; the shell wraps, the split becomes
    // the main region, and nothing is dropped.
    const components = [
      'kai-chat', 'kai-workspace', 'kai-conversations',
      'kai-artifact', 'kai-resizable', 'kai-tool', 'kai-reasoning',
      'kai-sources', 'kai-voice-input',
    ];
    for (const framework of ['react', 'html'] as const) {
      const out = await scaffold.handler({
        components,
        integration: 'openrouter',
        placement: 'full-page',
        framework,
      });
      const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
      expect(front, `${framework}: shell missing`).toMatch(/<kai-workspace|<Workspace\b/);
      expect(front, `${framework}: rail missing`).toMatch(/<kai-conversations|<Conversations\b/);
      expect(front, `${framework}: split dropped`).toMatch(/<kai-resizable|<Resizable\b/);
      expect(front, `${framework}: artifact dropped`).toMatch(/<kai-artifact|<Artifact\s/);
      expect(front, `${framework}: sources dropped`).toMatch(/<kai-sources|<Sources\b/);
      // Not the bare-sibling emit this same shape produced before the block:
      // the rail is wired and the block's boundary comment rides along.
      expect(front, `${framework}: block layer missing (bare-sibling emit)`).toContain(
        'PERSISTENCE IS YOURS',
      );
    }
  });
});

/**
 * F-20's scaffold-side sibling: every fixed placement used to stamp
 * `z-index: 1000` on its wrapper, which sits ABOVE the kit's toast layer
 * (`kai-toast-region` paints at `var(--kai-toast-z, 100)` as a body-level
 * sibling of the app root) — so every scaffolded app inherited the exact
 * buried-Undo defect the corpus workspace app paid an IVP round for.
 */
describe('scaffold — fixed placements stay BELOW the toast layer (F-20 class)', () => {
  it.each([
    ['full-page', 'react'],
    ['full-page', 'html'],
    ['side', 'react'],
    ['docked-widget', 'html'],
  ] as const)('%s (%s): wrapper z-index below 100, contract named', async (placement, framework) => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement,
      framework,
    });
    const front = (out.content as { type: string; text: string }[])[0].text.split('=== (2)')[0];
    expect(front, 'the wrapper still promotes itself above the toast layer').not.toMatch(/z-index:\s*1000|zIndex:\s*'1000'/);
    expect(front, 'the toast-layer contract is unstated').toContain('--kai-toast-z');
  });
});
