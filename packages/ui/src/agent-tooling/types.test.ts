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
    });
    expect(result.success).toBe(true);
  });

  // Both entries below carry a valid `keyExposure` deliberately. Without it they
  // would still be rejected — for the MISSING FLAG, not for the bad enum they
  // name — so deleting the Category or Language enum entirely would leave them
  // green. Pinning the issue path is what makes each of these test its own rule.

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
