// The three tools the model can call, plus their LOCAL (canned, deterministic)
// implementations. No third-party network calls: the spike is about the UI wire,
// not about real weather.
//
// Each tool is picked to land in a DIFFERENT kit component:
//   get_weather    → structured JSON        → <kai-tool> panel
//   search_docs    → a list of sources      → `source` parts on the message
//   propose_action → a confirm card         → a `card` part on the message
import type { CardEnvelope } from '@kitn.ai/ui';

// ── Tool schemas sent to the model ───────────────────────────────────────────

export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: false;
    };
  };
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description:
        'Look up the current weather for a city. Returns structured JSON (temperature, condition, humidity, wind).',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name, e.g. "Paris" or "Tokyo".' },
          units: { type: 'string', enum: ['metric', 'imperial'], description: 'Defaults to metric.' },
        },
        required: ['city'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_docs',
      description:
        'Search the @kitn.ai/ui documentation. Returns a ranked list of sources, each with a title, url and snippet. Cite them in your answer.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for.' },
          limit: { type: 'number', description: 'Max results, 1-5. Defaults to 3.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_action',
      description:
        'Ask the user to approve an action before you take it. Renders an approval card in the UI. ' +
        'Returns immediately with status "awaiting_user": do NOT assume the user approved; ' +
        'tell them the card is waiting for them.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short heading for the card.' },
          body: { type: 'string', description: 'One or two sentences describing what will happen.' },
          confirmLabel: { type: 'string', description: 'Label for the approve button, e.g. "Deploy".' },
          tone: {
            type: 'string',
            enum: ['default', 'warning', 'danger'],
            description: 'Visual severity. Defaults to "default".',
          },
        },
        required: ['title', 'body', 'confirmLabel'],
        additionalProperties: false,
      },
    },
  },
];

/**
 * The system prompt is built PER CARD MODE. It must only advertise tools that
 * are actually in the request: a prompt that mentions `propose_action` while
 * the tool list omits it makes the model burn reasoning tokens on the
 * contradiction (observed live before this was fixed).
 */
export function buildSystemPrompt(includeProposeAction: boolean): string {
  return [
    'You are a demo assistant embedded in the @kitn.ai/ui component kit.',
    'Use your tools eagerly: the whole point of this demo is to show the tool UI.',
    '- get_weather: for anything about weather.',
    '- search_docs: for anything about @kitn.ai/ui, kai-* elements, theming, or installation. Cite the sources you get back.',
    ...(includeProposeAction
      ? ['- propose_action: whenever the user asks you to DO something with a side effect (deploy, delete, send, publish).']
      : []),
    'After the tools return, write a short natural answer in markdown. Keep it under 120 words.',
  ].join('\n');
}

/** Which tools go out for a given card mode. In structured mode the approval
 *  card comes from `response_format`, so `propose_action` is dropped. */
export function toolsFor(cardMode: 'tool' | 'structured'): ToolSpec[] {
  return cardMode === 'structured'
    ? TOOL_SPECS.filter((t) => t.function.name !== 'propose_action')
    : TOOL_SPECS;
}

// ── Results ──────────────────────────────────────────────────────────────────

export interface SourceItem {
  href: string;
  title?: string;
  description?: string;
  label?: string;
}

/** What running a tool locally produced. `output` is what both the <kai-tool>
 *  panel shows AND what goes back to the model on the next turn. */
export interface ToolRun {
  output: Record<string, unknown>;
  /** Citations to add as `source` parts (search_docs only). */
  sources?: SourceItem[];
  /** A card envelope to add as a `card` part (propose_action only). */
  card?: CardEnvelope;
}

const WEATHER: Record<string, { condition: string; tempC: number; humidity: number; windKph: number }> = {
  paris: { condition: 'Light rain', tempC: 12, humidity: 84, windKph: 17 },
  london: { condition: 'Overcast', tempC: 10, humidity: 79, windKph: 22 },
  tokyo: { condition: 'Clear', tempC: 19, humidity: 55, windKph: 9 },
  'new york': { condition: 'Partly cloudy', tempC: 16, humidity: 61, windKph: 14 },
  sydney: { condition: 'Sunny', tempC: 24, humidity: 48, windKph: 20 },
  berlin: { condition: 'Fog', tempC: 7, humidity: 91, windKph: 6 },
};

const DOCS: { title: string; url: string; snippet: string; tags: string[] }[] = [
  {
    title: 'Getting started',
    url: 'https://ui.kitn.ai/guides/getting-started',
    snippet:
      'Install @kitn.ai/ui, import the elements bundle to register the kai-* custom elements, and drop <kai-chat> into any framework.',
    tags: ['install', 'setup', 'start', 'npm', 'register'],
  },
  {
    title: 'Streaming',
    url: 'https://ui.kitn.ai/guides/recipes/streaming',
    snippet:
      'Read OpenAI-format SSE and assign a NEW messages array per chunk. Mutating the array in place does not re-render: the elements compare references.',
    tags: ['stream', 'sse', 'token', 'render', 'chunk'],
  },
  {
    title: 'Theming',
    url: 'https://ui.kitn.ai/guides/theming',
    snippet:
      'Every element takes a theme prop (light | dark | auto). The --color-* tokens flip under a .dark class so your own chrome matches.',
    tags: ['theme', 'dark', 'light', 'token', 'css', 'color'],
  },
  {
    title: 'Tool panels',
    url: 'https://ui.kitn.ai/components/tool',
    snippet:
      'A ToolPart moves through input-streaming → input-available → output-available (or output-error). <kai-tool> renders each state with its own chip.',
    tags: ['tool', 'panel', 'call', 'function', 'state'],
  },
  {
    title: 'Cards',
    url: 'https://ui.kitn.ai/guides/cards',
    snippet:
      'A CardEnvelope ({ type, id, data, title }) is dispatched by <kai-cards> to the matching kai-* card element. confirm, form, tasks, choice, link and embed ship built in.',
    tags: ['card', 'confirm', 'form', 'envelope', 'generative'],
  },
  {
    title: 'Web component contract',
    url: 'https://ui.kitn.ai/guides/web-components',
    snippet:
      'Array and object props are JS PROPERTIES, never HTML attributes. Events are non-bubbling kai-* CustomEvents: listen on the element itself.',
    tags: ['property', 'attribute', 'event', 'contract', 'custom element'],
  },
];

let cardSeq = 0;

function toStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Execute one tool. Deterministic; never touches the network. */
export function runTool(name: string, input: Record<string, unknown>): ToolRun {
  switch (name) {
    case 'get_weather': {
      const city = toStr(input.city, 'Paris');
      const imperial = toStr(input.units) === 'imperial';
      const hit = WEATHER[city.trim().toLowerCase()];
      if (!hit) {
        return {
          output: {
            city,
            error: 'no_station',
            message: `No weather station for "${city}". Known cities: ${Object.keys(WEATHER).join(', ')}.`,
          },
        };
      }
      return {
        output: {
          city,
          condition: hit.condition,
          temperature: imperial ? Math.round(hit.tempC * 1.8 + 32) : hit.tempC,
          units: imperial ? '°F' : '°C',
          humidityPct: hit.humidity,
          wind: imperial ? `${Math.round(hit.windKph * 0.621)} mph` : `${hit.windKph} km/h`,
          observedAt: '2026-08-07T09:00:00Z',
          source: 'canned fixture (spike)',
        },
      };
    }

    case 'search_docs': {
      const query = toStr(input.query);
      const limitRaw = typeof input.limit === 'number' ? input.limit : 3;
      const limit = Math.max(1, Math.min(5, Math.round(limitRaw)));
      const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
      const scored = DOCS.map((d) => {
        const hay = `${d.title} ${d.snippet} ${d.tags.join(' ')}`.toLowerCase();
        return { d, score: terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0) };
      })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.d);
      const results = (scored.length ? scored : DOCS.slice(0, limit)).map((d, i) => ({
        rank: i + 1,
        title: d.title,
        url: d.url,
        snippet: d.snippet,
      }));
      return {
        output: { query, resultCount: results.length, results },
        sources: results.map((r) => ({
          href: r.url,
          title: r.title,
          description: r.snippet,
          label: r.title,
        })),
      };
    }

    case 'propose_action': {
      const title = toStr(input.title, 'Confirm');
      const body = toStr(input.body, 'Approve this action?');
      const confirmLabel = toStr(input.confirmLabel, 'Confirm');
      const toneRaw = toStr(input.tone, 'default');
      const tone = (['default', 'warning', 'danger'] as const).includes(toneRaw as 'default')
        ? (toneRaw as 'default' | 'warning' | 'danger')
        : 'default';
      const id = `card-${++cardSeq}`;
      // The model gives us three flat scalars; the ENVELOPE is assembled here.
      // See ../FINDINGS.md ("The card JSON Schemas are built but not exported"):
      // the model cannot emit a CardEnvelope directly because the
      // card JSON Schemas are not reachable through the package exports map.
      const card: CardEnvelope = {
        type: 'confirm',
        id,
        title,
        data: {
          body,
          tone,
          dismissible: true,
          actions: [
            { id: 'approve', label: confirmLabel, style: tone === 'danger' ? 'destructive' : 'primary', default: true },
            { id: 'cancel', label: 'Not now', style: 'default' },
          ],
        },
      };
      return {
        output: {
          status: 'awaiting_user',
          cardId: id,
          rendered: 'confirm card',
          note: 'The approval card is on screen. The user has not answered yet.',
        },
        card,
      };
    }

    default:
      return { output: { error: 'unknown_tool', message: `No local implementation for "${name}".` } };
  }
}
