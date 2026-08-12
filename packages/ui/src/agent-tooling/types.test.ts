import { describe, it, expect } from 'vitest';
import { IntegrationSchema, ArchetypeSchema } from './types';

describe('IntegrationSchema', () => {
  it('validates a minimal integration entry', () => {
    const ok = IntegrationSchema.safeParse({
      id: 'openrouter',
      title: 'OpenRouter',
      category: 'gateway',
      language: 'ts',
      streamFormat: 'openai-sse',
      envVars: ['OPENROUTER_API_KEY'],
      routeTemplates: { next: 'export async function POST() {}' },
      streamMapping: 'OpenAI SSE — pipe upstream.body straight through.',
      runNote: 'Set OPENROUTER_API_KEY.',
      docsSlug: 'integrations/connect-any-model',
      keyExposure: 'needs-proxy',
      outOfBand: 'none',
    });
    expect(ok.success).toBe(true);
  });

  it('defaults envVars to empty array when omitted', () => {
    const result = IntegrationSchema.safeParse({
      id: 'groq',
      title: 'Groq',
      category: 'provider',
      language: 'ts',
      streamFormat: 'ai-sdk',
      routeTemplates: {},
      streamMapping: 'AI SDK stream.',
      runNote: 'Set GROQ_API_KEY.',
      docsSlug: 'integrations/groq',
      keyExposure: 'needs-proxy',
      outOfBand: 'none',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.envVars).toEqual([]);
    }
  });

  it('defaults deps to empty npm and pip lists', () => {
    const result = IntegrationSchema.safeParse({
      id: 'groq',
      title: 'Groq',
      category: 'provider',
      language: 'ts',
      streamFormat: 'ai-sdk',
      routeTemplates: {},
      streamMapping: 'AI SDK stream.',
      runNote: 'Set GROQ_API_KEY.',
      docsSlug: 'integrations/groq',
      keyExposure: 'needs-proxy',
      outOfBand: 'none',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Empty is a truthful default here, unlike keyExposure below: a route that
      // imports nothing needs nothing installed, and getting it wrong costs a
      // failed `npm run build`, not a secret.
      expect(result.data.deps).toEqual({ npm: [], pip: [] });
    }
  });

  /**
   * The security guard, stated as a test rather than trusted as a schema line.
   *
   * An integration that says nothing about where its key may live is REJECTED,
   * because the alternative is a default, and a default here means the CLI
   * silently picks one. This repo's dominant bug class is absence read as a safe
   * value; `keyExposure` is the field where that costs an API key in a public
   * bundle.
   */
  it('rejects an integration that declares no keyExposure', () => {
    // This fixture also omits `outOfBand`, so BOTH refusals fire. The assertion
    // pins the message rather than the count for that reason.
    const result = IntegrationSchema.safeParse({
      id: 'groq',
      title: 'Groq',
      category: 'provider',
      language: 'ts',
      streamFormat: 'ai-sdk',
      envVars: ['GROQ_API_KEY'],
      routeTemplates: {},
      streamMapping: 'AI SDK stream.',
      runNote: 'Set GROQ_API_KEY.',
      docsSlug: 'integrations/groq',
    });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues.map((i) => i.message).join('\n')).toMatch(
      /declares no keyExposure/,
    );
  });

  /** The wrong-direction claim: a secret env var cannot coexist with 'frontend-safe'. */
  it('rejects a frontend-safe claim from an integration holding a secret', () => {
    const result = IntegrationSchema.safeParse({
      id: 'groq',
      title: 'Groq',
      category: 'provider',
      language: 'ts',
      streamFormat: 'ai-sdk',
      envVars: ['GROQ_API_KEY'],
      routeTemplates: {},
      streamMapping: 'AI SDK stream.',
      runNote: 'Set GROQ_API_KEY.',
      docsSlug: 'integrations/groq',
      keyExposure: 'frontend-safe',
      outOfBand: 'none',
    });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues.map((i) => i.message).join('\n')).toMatch(
      /puts a key in client code/,
    );
  });

  /**
   * The same lie told without an `envVars` entry, caught on the route text
   * instead. This is the half that would survive an author simply not listing
   * the key they hardcoded.
   */
  it('rejects a frontend-safe claim from a route that sends an auth header', () => {
    const result = IntegrationSchema.safeParse({
      id: 'groq',
      title: 'Groq',
      category: 'provider',
      language: 'ts',
      streamFormat: 'ai-sdk',
      envVars: [],
      routeTemplates: { next: "fetch(url, { headers: { Authorization: 'Bearer sk-live-hardcoded' } })" },
      streamMapping: 'AI SDK stream.',
      runNote: 'note',
      docsSlug: 'integrations/groq',
      keyExposure: 'frontend-safe',
      outOfBand: 'none',
    });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues.map((i) => i.message).join('\n')).toMatch(
      /sends an authorization header/,
    );
  });

  /** The conservative direction stays legal: over-declaring a proxy is never an error. */
  it('accepts needs-proxy from an integration with no secret at all', () => {
    const result = IntegrationSchema.safeParse({
      id: 'local-bridge',
      title: 'Local bridge',
      category: 'harness',
      language: 'ts',
      streamFormat: 'native',
      envVars: [],
      routeTemplates: { express: 'spawn("thing")' },
      streamMapping: 'bridge',
      runNote: 'note',
      docsSlug: 'integrations/harnesses',
      keyExposure: 'needs-proxy',
      // 'local-binary', not 'none': this fixture's route spawns a program, and the
      // schema refuses a 'none' claim from a route that does. Left spawning on
      // purpose — it is what makes this a plausible harness rather than a stub.
      outOfBand: 'local-binary',
    });
    expect(result.success).toBe(true);
  });

  // Both entries below carry a valid `keyExposure` deliberately. Without it they
  // would still be rejected — for the MISSING FLAG, not for the bad enum they
  // name — so deleting the Category or Language enum entirely would leave them
  // green. Pinning the issue path is what makes each of these test its own rule.

  /**
   * The second field on this schema with no default and a refusal behind it, and
   * the reason is the same one written on `keyExposure`: absence read as a benign
   * value is this repo's dominant bug class. Here the cost is a scaffold that
   * prints "npm run dev" to someone who has to start Ollama first, and then reads
   * as a broken kit rather than a missing prerequisite.
   */
  it('rejects an integration that declares no outOfBand', () => {
    const result = IntegrationSchema.safeParse({
      id: 'groq',
      title: 'Groq',
      category: 'provider',
      language: 'ts',
      streamFormat: 'ai-sdk',
      envVars: ['GROQ_API_KEY'],
      routeTemplates: {},
      streamMapping: 'AI SDK stream.',
      runNote: 'Set GROQ_API_KEY.',
      docsSlug: 'integrations/groq',
      keyExposure: 'needs-proxy',
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join('.'))).toContain('outOfBand');
    expect(result.success ? '' : result.error.issues.map((i) => i.message).join('\n')).toMatch(
      /declares no outOfBand/,
    );
  });

  // The three wrong-direction claims. Each is a 'none' that the route itself
  // contradicts, and each fires on DIFFERENT evidence, so one net going dead
  // cannot hide behind the other two.

  it("rejects outOfBand 'none' from a python route", () => {
    const result = IntegrationSchema.safeParse({
      id: 'some-py',
      title: 'Some Python agent',
      category: 'framework',
      language: 'python',
      streamFormat: 'openai-sse',
      envVars: ['OPENAI_API_KEY'],
      routeTemplates: { fastapi: 'app = FastAPI()' },
      streamMapping: 'SSE — readOpenAIStream parses it.',
      runNote: 'uvicorn main:app',
      docsSlug: 'integrations/groq',
      keyExposure: 'needs-proxy',
      outOfBand: 'none',
    });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues.map((i) => i.message).join('\n')).toMatch(
      /Use 'language-runtime'/,
    );
  });

  it("rejects outOfBand 'none' from a route that spawns a process", () => {
    const result = IntegrationSchema.safeParse({
      id: 'bridge',
      title: 'Bridge',
      category: 'harness',
      language: 'ts',
      streamFormat: 'native',
      envVars: [],
      routeTemplates: { express: "import { spawn } from 'node:child_process';\nspawn('thing');" },
      streamMapping: 'bridge — readOpenAIStream parses it.',
      runNote: 'note',
      docsSlug: 'integrations/harnesses',
      keyExposure: 'needs-proxy',
      outOfBand: 'none',
    });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues.map((i) => i.message).join('\n')).toMatch(
      /Use 'local-binary'/,
    );
  });

  it("rejects outOfBand 'none' from a route that fetches a loopback address", () => {
    const result = IntegrationSchema.safeParse({
      id: 'local-model',
      title: 'Local model',
      category: 'provider',
      language: 'ts',
      streamFormat: 'openai-sse',
      envVars: [],
      routeTemplates: {},
      webRoute: "await fetch('http://127.0.0.1:8080/v1/chat/completions', { method: 'POST' })",
      streamMapping: 'SSE — readOpenAIStream parses it.',
      runNote: 'start the server',
      docsSlug: 'integrations/groq',
      keyExposure: 'frontend-safe',
      outOfBand: 'none',
    });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues.map((i) => i.message).join('\n')).toMatch(
      /Use 'local-server'/,
    );
  });

  /**
   * The net must fire on a DEPENDENCY, not on prose. Both strings below name a
   * loopback address and neither is one: `mastra` throws an error mentioning
   * `http://localhost:4111` and `pi` logs its own listening port. A bare
   * /localhost/ would flag both — mastra for the right answer by the wrong
   * evidence, pi for a line that says nothing about what it needs — and a check
   * that is right by accident is what this whole field replaces.
   */
  it("does not read a loopback address in PROSE as a local-server dependency", () => {
    const base = {
      id: 'x',
      title: 'X',
      category: 'harness' as const,
      language: 'ts' as const,
      streamFormat: 'openai-sse' as const,
      envVars: [],
      streamMapping: 'SSE — readOpenAIStream parses it.',
      runNote: 'note',
      docsSlug: 'integrations/harnesses',
      keyExposure: 'needs-proxy' as const,
      outOfBand: 'none' as const,
    };
    for (const code of [
      "throw new Error('BASE_URL is not set, e.g. http://localhost:4111');",
      "app.listen(3001, () => console.log('api: http://localhost:3001/api/chat'));",
    ]) {
      const result = IntegrationSchema.safeParse({ ...base, routeTemplates: { express: code } });
      expect(result.success, `prose mentioning a loopback address was read as a dependency: ${code}`).toBe(
        true,
      );
    }
  });

  /** Over-declaring stays legal, exactly as it does for keyExposure. */
  it('accepts a local-server claim from a route with no loopback fetch at all', () => {
    const result = IntegrationSchema.safeParse({
      id: 'remote-agent',
      title: 'Remote agent',
      category: 'harness',
      language: 'ts',
      streamFormat: 'openai-sse',
      envVars: ['AGENT_URL'],
      routeTemplates: { next: "await fetch(process.env.AGENT_URL + '/chat')" },
      streamMapping: 'SSE — readOpenAIStream parses it.',
      runNote: 'point AGENT_URL at your server',
      docsSlug: 'integrations/harnesses',
      keyExposure: 'needs-proxy',
      outOfBand: 'local-server',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown outOfBand value', () => {
    const result = IntegrationSchema.safeParse({
      id: 'x',
      title: 'X',
      category: 'provider',
      language: 'ts',
      streamFormat: 'native',
      routeTemplates: {},
      streamMapping: 'mapping',
      runNote: 'note',
      docsSlug: 'slug',
      keyExposure: 'needs-proxy',
      outOfBand: 'docker',
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join('.'))).toContain('outOfBand');
  });

  it('rejects an unknown category', () => {
    const result = IntegrationSchema.safeParse({
      id: 'x',
      title: 'X',
      category: 'unknown-category',
      language: 'ts',
      streamFormat: 'native',
      routeTemplates: {},
      streamMapping: 'mapping',
      runNote: 'note',
      docsSlug: 'slug',
      keyExposure: 'needs-proxy',
      outOfBand: 'none',
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join('.'))).toContain('category');
  });

  it('rejects an unknown language', () => {
    const result = IntegrationSchema.safeParse({
      id: 'x',
      title: 'X',
      category: 'provider',
      language: 'ruby',
      streamFormat: 'native',
      routeTemplates: {},
      streamMapping: 'mapping',
      runNote: 'note',
      docsSlug: 'slug',
      keyExposure: 'needs-proxy',
      outOfBand: 'none',
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join('.'))).toContain('language');
  });
});

describe('ArchetypeSchema', () => {
  it('validates a minimal archetype entry', () => {
    const result = ArchetypeSchema.safeParse({
      id: 'customer-support',
      title: 'Customer Support Bot',
      components: ['kai-chat', 'kai-sources'],
      defaultPlacement: 'docked-widget',
      docsSlug: 'archetypes/customer-support',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown placement', () => {
    const result = ArchetypeSchema.safeParse({
      id: 'x',
      title: 'X',
      components: ['kai-chat'],
      defaultPlacement: 'floating',
      docsSlug: 'slug',
    });
    expect(result.success).toBe(false);
  });
});
