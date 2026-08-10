import { describe, it, expect } from 'vitest';
import { scaffold } from './tools/scaffold';
import { getIntegration, listIntegrations } from '../registry';
// The real encoders, used to prove WHY the fabricated sample seed had to go:
// one of them throws on it, the other quietly sends it.
import { toAnthropicMessages, toOpenAIMessages, WireEncodeError } from '../../wire/encode';
import type { ChatMessage } from '../../elements/chat-types';

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
    expect(text).toContain("role: 'assistant' as const");
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
    expect(text).toContain("role: 'assistant' as const");
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
    expect(text).toContain("role: 'assistant' as const");
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
    expect(text).toContain('let chatEl: KaiChatElement | undefined');
    expect(text).not.toContain('let chatEl: HTMLElement | undefined');
  });

  // SCAF-7: html mock output must NOT emit `as const` (TS syntax invalid in plain JS)
  it('html mock scaffold does NOT emit as const on role literals (plain JS, SCAF-7)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toContain('as const');
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
    // no backend call
    expect(text).not.toContain("fetch('/api");
    // a canned reply is streamed client-side
    expect(text).toMatch(/local preview|no backend or API key needed/i);
    // backend block says no backend/key needed
    expect(text).toMatch(/No backend or API key needed/i);
  });

  it("integration 'mock' (html) streams a canned reply without fetch", async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/<kai-chat/);
    expect(text).not.toContain("fetch('/api");
    // token-by-token loop present
    expect(text).toMatch(/setTimeout/);
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
    // mock never fetches /api — no model const should appear
    expect(text).not.toMatch(/const model = /);
    expect(text).not.toContain("fetch('/api");
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
    expect(text).toContain('let messages: ChatMessage[]');
    // Must type the onSubmit handler
    expect(text).toContain('onSubmit(e: CustomEvent<{ value: string }>)');
  });

  it('SCAF-10: html output wraps element access in DOMContentLoaded/readyState guard', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must use a readyState guard so element access is safe from <head>
    expect(text).toMatch(/document\.readyState|DOMContentLoaded/);
    // The element lookup must be inside a function, not at module top-level
    expect(text).toContain('function init()');
    // Must still wire the event listener
    expect(text).toContain("addEventListener('kai-submit'");
  });

  it('SCAF-10: html real-backend output also has DOMContentLoaded guard', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/document\.readyState|DOMContentLoaded/);
    expect(text).toContain('function init()');
  });

  // ── SCAF-11: emitted ChatMessage type must use the library's strict state union ──
  //
  // The LOCAL type is emitted by the `mock` scaffold only. A real backend now
  // imports the kit's own ChatMessage (it hands messages to toOpenAIMessages, and
  // the local subset would reject a message the kit produced). These three keep
  // the local declaration honest; the sibling test below covers the real path.

  it('SCAF-11: agentic (react, mock) ChatMessage type uses strict state union, not bare string', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'mock',
      placement: 'side',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must include the 4-value state union — not bare `state: string`
    expect(text).toContain("'input-streaming' | 'input-available' | 'output-available' | 'output-error'");
    // Must NOT use the loose `state: string` form
    expect(text).not.toMatch(/state:\s*string/);
    // reasoning must carry the optional label field
    expect(text).toContain('label?: string');
  });

  it('SCAF-11: agentic sample message state value is a valid union member (output-available)', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'mock',
      placement: 'side',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // The seeded sample data must use a union-member state value
    expect(text).toContain("'output-available'");
  });

  it('SCAF-11: knowledge-base (react, mock) ChatMessage type also uses strict state union', async () => {
    const out = await scaffold.handler({
      useCase: 'knowledge-base',
      integration: 'mock',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("'input-streaming' | 'input-available' | 'output-available' | 'output-error'");
    expect(text).not.toMatch(/state:\s*string/);
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
    expect(text).toContain('let sourcesEl: KaiSourcesElement | undefined');
    expect(text).not.toContain('let sourcesEl: HTMLElement | undefined');
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
      useCase: 'workspace',
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
      useCase: 'workspace',
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
        useCase: 'workspace',
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
    expect(text).toContain("role: 'assistant' as const");
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
      useCase: 'workspace',
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
      useCase: 'workspace',
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
      useCase: 'workspace',
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
    expect(text).toMatch(/\$:\s*if\s*\(chatEl\s*&&\s*defined\)/);
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

  // ── SCAF-19: html target must be buildable by `npm create vite -- --template
  // vanilla-ts` with zero hand edits. Its `build` script is `tsc && vite build`;
  // once the template's src/main.ts is dropped (this scaffold replaces it with an
  // inline <script>), src/ has no .ts files and tsc fails with TS18003 ("No
  // inputs were found") before vite even runs. Verified against a real fresh
  // vanilla-ts app: without the vite-env.d.ts note below, `npm run build` fails;
  // with it, it succeeds unmodified. ──────────────────────────────────────────

  it('SCAF-19: html output tells the dev to add src/vite-env.d.ts so tsc has an input', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/src\/vite-env\.d\.ts/);
    expect(text).toMatch(/\/\/\/ <reference types="vite\/client" \/>/);
    expect(text).toMatch(/TS18003|No inputs were found/);
  });

  it('SCAF-19: the vite-env.d.ts note does NOT appear for backend-only frameworks that also render the html surface', async () => {
    // fastapi/express/worker fall back to the same framework-agnostic renderHtml
    // as `html`, but they aren't paired with `tsc && vite build`, so the Vite-only
    // setup note would be noise there.
    for (const framework of ['fastapi', 'express', 'worker'] as const) {
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: 'mock',
        placement: 'full-page',
        framework,
      });
      const text = (out.content as { type: string; text: string }[])[0].text;
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
      expect(emitted, `${label}: emits role:'user', content: (removed ChatMessage shape)`).not.toMatch(
        /role:\s*'user'(?:\s+as\s+const)?,\s*content:/,
      );
      expect(emitted, `${label}: emits role:'assistant', content: (removed ChatMessage shape)`).not.toMatch(
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
      expect(emitted, `${label}: emits role:'user', content:`).not.toMatch(
        /role:\s*'user'(?:\s+as\s+const)?,\s*content:/,
      );
      expect(emitted, `${label}: emits role:'assistant', content:`).not.toMatch(
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
  // The `mock` path still inlines the fold (it must add no imports). A real
  // backend gets the same guarantee from createAssistantStream, which folds
  // through appendTextPart, the function this inline copy was copied FROM.
  it('every mock streaming path folds onto the trailing text part, never replacing parts wholesale', async () => {
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
      // The fold itself, plus the helper it calls.
      expect(ownCode, `${label}: missing the appendText fold`).toMatch(
        /\.\.\.m, parts: appendText\(m\.parts, (tok|delta)\)/,
      );
      expect(ownCode, `${label}: missing the appendText helper definition`).toContain(
        'const appendText =',
      );
      // The helper must open a NEW text part when the last part is not text,
      // which is what keeps a post-tool answer out of the pre-tool text.
      expect(ownCode, `${label}: fold does not open a new trailing text part`).toContain(
        "[...parts, { type: 'text', text: delta }]",
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
 * html is the odd one: it wires plain JS inside `<script type="module">` at a
 * four-space indent and must NOT carry the type import, because
 * `type ChatMessage` in a plain-JS module is a syntax error.
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
    "\n    import { createAssistantStream } from '@kitn.ai/ui/state';\n",
    "\n    import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';\n",
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

  it.each(REAL_FRAMEWORKS)('%s mock scaffolds stay import-free and inline', async (framework) => {
    const out = await scaffold.handler({
      framework,
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
    });
    // Scoped to the emitted CODE. mock's streamMapping now names the adapter as
    // what takes over on the swap to a real backend, and that sentence is not an
    // import.
    const code = frontEnd(out);
    expect(code).not.toContain('@kitn.ai/ui/wire');
    expect(code).not.toContain('readOpenAIStream');
    // The inlined appendTextPart is still what folds the canned reply.
    expect(code).toContain('const appendText =');
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
        svelte: /let messages: ChatMessage\[\] = \[\];/,
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
      // `request` in the portable handler, `req` in a framework-specific one.
      expect(route, `${integration}: route never reads tools`).toMatch(
        /const \{[^}]*\btools\b[^}]*\} = await (req|request)\.json\(\);/,
      );
      expect(route, `${integration}: route never sends tools`).toMatch(
        /JSON\.stringify\(\{[^}]*\btools\b[^}]*\}\)/,
      );
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
      "stream.abort(err instanceof Error ? err.message : 'Request failed');",
    );
    // abort() lives INSIDE the catch, ahead of the finally: done() on its own
    // settles the message but leaves an in-flight tool panel on input-available.
    const catchAt = code.indexOf('} catch (err) {');
    const finallyAt = code.indexOf('} finally {', catchAt);
    const abortAt = code.indexOf('stream.abort(');
    expect(abortAt, `${framework}: abort outside the catch`).toBeGreaterThan(catchAt);
    expect(abortAt, `${framework}: abort after the finally`).toBeLessThan(finallyAt);
  });

  it('mock scaffolds stay catch-free: there is no request to fail', async () => {
    const code = frontEnd(
      await scaffold.handler({
        framework: 'react',
        useCase: 'agentic',
        integration: 'mock',
        placement: 'full-page',
      }),
    );
    expect(code).not.toContain('stream.abort(');
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
    ['vue', 'src/server/chat.ts', /server\.middlewares\.use\('\/api\/chat'/],
    ['react', 'src/server/chat.ts', /server\.middlewares\.use\('\/api\/chat'/],
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
