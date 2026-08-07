import { describe, it, expect } from 'vitest';
import { scaffold } from './tools/scaffold';

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
    expect(text).toMatch(/Streaming recipe/);
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
  // @kitn.ai/ui/react import (they'd run on the server and crash with "window is not defined").
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

  it('SCAF-9: agentic (react) seeds a sample assistant message with tool + reasoning embedded', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'openrouter',
      placement: 'side',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must embed tool+reasoning in the sample message — not as siblings
    expect(text).toMatch(/tools|reasoning/i);
    // The sample message must be seeded (not an empty array)
    expect(text).toMatch(/sampleMessages|SCAF-9/);
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

  it('SCAF-11: agentic (react) ChatMessage type uses strict state union, not bare string', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'openrouter',
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
      integration: 'openrouter',
      placement: 'side',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // The seeded sample data must use a union-member state value
    expect(text).toContain("'output-available'");
  });

  it('SCAF-11: knowledge-base (react) ChatMessage type also uses strict state union', async () => {
    const out = await scaffold.handler({
      useCase: 'knowledge-base',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'react',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("'input-streaming' | 'input-available' | 'output-available' | 'output-error'");
    expect(text).not.toMatch(/state:\s*string/);
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

  // ── message-parts migration: the scaffolder must emit `parts`, never `content` ──

  it('emits parts-shaped messages, never a content string', async () => {
    for (const framework of ['react', 'vue', 'svelte', 'html', 'next', 'tanstack-start'] as const) {
      const out = await scaffold.handler({
        framework, useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page',
      });
      const emitted = JSON.stringify(out);
      // The INTERACTION PATTERNS reference block (appended to every scaffold)
      // legitimately shows kai-compare's `CompareCandidate.content` — an
      // independent type from `ChatMessage`, unaffected by the parts migration
      // (see response-compare-types.ts). Scope the content-string ban to the
      // scaffolder's OWN emitted code (blocks 1-4), not that reference snippet.
      const ownCode = emitted.split('=== INTERACTION PATTERNS ===')[0];
      expect(ownCode).not.toMatch(/content:\s*\\?'\\?'/);
      expect(emitted).toContain('parts:');
    }
  });
});
