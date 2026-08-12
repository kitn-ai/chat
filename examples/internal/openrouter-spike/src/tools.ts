// The tools the model can call, plus their LOCAL (canned, deterministic)
// implementations. No third-party network calls: the spike is about the UI wire,
// not about real weather.
//
// Each tool is picked to land in a DIFFERENT kit component:
//   get_weather    → structured JSON        → <kai-tool> panel
//   search_docs    → a list of sources      → `source` parts on the message
//   propose_action → a confirm card         → a `card` part on the message
//   ask_choice     → a choice card          → `card` part
//   request_form   → a form card            → `card` part
//   plan_tasks     → a tasks card           → `card` part
//   preview_link   → a link card            → `card` part
//   embed_video    → an embed card          → `card` part
//   attach_file    → an attachment          → a `file` part
//   fail_deploy    → a tool FAILURE         → <kai-tool> in output-error
//
// A scenario picks the subset it needs with `pickTools(...)`: shipping all of
// them on every turn both costs more and gives the model more ways to wander.
import type { CardEnvelope } from '@kitn.ai/ui';
import type { AttachmentData } from '@kitn.ai/ui/state';

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
  {
    type: 'function',
    function: {
      name: 'ask_choice',
      description:
        'Ask the user to pick ONE option from a short list. Renders a choice card. ' +
        'Returns immediately with status "awaiting_user": the user has not picked yet.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The question, one sentence.' },
          options: {
            type: 'array',
            description: '2-4 options.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
        },
        required: ['prompt', 'options'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_form',
      description:
        'Ask the user to fill in a short form. Renders a form card. Returns immediately with ' +
        'status "awaiting_user": the fields are NOT filled in yet.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Form heading.' },
          fields: {
            type: 'array',
            description: '1-4 fields.',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', description: 'snake_case field key.' },
                label: { type: 'string' },
                type: { type: 'string', enum: ['string', 'number', 'boolean'] },
                required: { type: 'boolean' },
              },
              required: ['key', 'label', 'type'],
              additionalProperties: false,
            },
          },
          submitLabel: { type: 'string', description: 'Label for the submit button.' },
        },
        required: ['title', 'fields'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_tasks',
      description:
        'Show the user a checklist of steps to approve. Renders a tasks card. Returns immediately ' +
        'with status "awaiting_user".',
      parameters: {
        type: 'object',
        properties: {
          heading: { type: 'string', description: 'Checklist heading.' },
          tasks: {
            type: 'array',
            description: '2-5 steps.',
            items: {
              type: 'object',
              properties: { label: { type: 'string' }, description: { type: 'string' } },
              required: ['label'],
              additionalProperties: false,
            },
          },
        },
        required: ['heading', 'tasks'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_link',
      description: 'Show a rich preview card for a URL. Use for any link worth showing visually.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Absolute http(s) URL.' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'embed_video',
      description: 'Embed a video player card for a YouTube or Vimeo video.',
      parameters: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['youtube', 'vimeo'] },
          id: { type: 'string', description: 'The provider video id.' },
          title: { type: 'string' },
        },
        required: ['provider', 'id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'attach_file',
      description:
        'Attach a generated file to your reply so the user can see it. Returns immediately; the ' +
        'attachment is rendered inline in your message.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'e.g. "q3-summary.pdf".' },
          kind: { type: 'string', enum: ['pdf', 'image', 'csv'], description: 'Defaults to pdf.' },
        },
        required: ['filename'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_artifact',
      description:
        'Open (or REVISE) a document artifact beside the conversation. Call it again with the same ' +
        'artifactId to replace the content with a newer draft.',
      parameters: {
        type: 'object',
        properties: {
          artifactId: { type: 'string', description: 'Stable id. Reuse it to revise the same artifact.' },
          title: { type: 'string' },
          body: { type: 'string', description: 'The document text.' },
        },
        required: ['artifactId', 'title', 'body'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fail_deploy',
      description:
        'Deploy a service. This tool is UNRELIABLE and frequently fails; report the failure to the ' +
        'user verbatim rather than retrying.',
      parameters: {
        type: 'object',
        properties: { target: { type: 'string', description: 'The environment to deploy to.' } },
        required: ['target'],
        additionalProperties: false,
      },
    },
  },
];

/** Look tool specs up by name, in the order given. Throws on a typo rather than
 *  silently shipping a shorter tool list than the scenario meant. */
export function pickTools(...names: string[]): ToolSpec[] {
  return names.map((name) => {
    const hit = TOOL_SPECS.find((t) => t.function.name === name);
    if (!hit) throw new Error(`No tool spec named "${name}". Known: ${TOOL_SPECS.map((t) => t.function.name).join(', ')}`);
    return hit;
  });
}

/** One line of system-prompt guidance per tool. Only the tools actually in the
 *  request get their line: a prompt that mentions a tool the request omits makes
 *  the model burn reasoning tokens on the contradiction (observed live). */
const TOOL_GUIDANCE: Record<string, string> = {
  get_weather: '- get_weather: for anything about weather.',
  search_docs:
    '- search_docs: for anything about @kitn.ai/ui, kai-* elements, theming, or installation. Cite the sources you get back.',
  propose_action:
    '- propose_action: whenever the user asks you to DO something with a side effect (deploy, delete, send, publish).',
  ask_choice: '- ask_choice: whenever the user has to pick between options.',
  request_form: '- request_form: whenever you need several values from the user at once.',
  plan_tasks: '- plan_tasks: whenever the user asks for a plan, checklist or set of steps.',
  preview_link: '- preview_link: whenever a link is worth showing as a card.',
  embed_video: '- embed_video: whenever the user asks to watch or play a video.',
  attach_file: '- attach_file: whenever the user asks for a file, report or export.',
  open_artifact: '- open_artifact: whenever the user asks you to draft a document. Reuse the artifactId to revise it.',
  fail_deploy: '- fail_deploy: for any deploy/ship/release request.',
};

/**
 * The system prompt is built from the tool list that is ACTUALLY being sent, so
 * it can never advertise a tool the request omits.
 */
export function buildSystemPrompt(tools: ToolSpec[]): string {
  const lines = tools.map((t) => TOOL_GUIDANCE[t.function.name]).filter(Boolean);
  return [
    'You are a demo assistant embedded in the @kitn.ai/ui component kit.',
    ...(lines.length
      ? ['Use your tools eagerly: the whole point of this demo is to show the tool UI.', ...lines]
      : ['You have no tools on this turn. Answer directly.']),
    'After the tools return, write a short natural answer in markdown. Keep it under 120 words.',
  ].join('\n');
}

/** Which tools go out for a given card mode. In structured mode the approval
 *  card comes from `response_format`, so `propose_action` is dropped. */
export function toolsFor(cardMode: 'tool' | 'structured'): ToolSpec[] {
  const base = pickTools('get_weather', 'search_docs', 'propose_action');
  return cardMode === 'structured' ? base.filter((t) => t.function.name !== 'propose_action') : base;
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
  /** A card envelope to add as a `card` part (the card-producing tools). */
  card?: CardEnvelope;
  /** An attachment to add as a `file` part (attach_file only). */
  file?: AttachmentData;
  /** Set when the tool FAILED. The caller routes this through `applyToolFailure`
   *  so the panel lands in `output-error` instead of `output-available`, and the
   *  failure text is what goes back to the model. */
  failure?: string;
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

    case 'ask_choice': {
      const prompt = toStr(input.prompt, 'Pick one');
      const raw = Array.isArray(input.options) ? input.options : [];
      const options = raw.slice(0, 4).map((o, i) => {
        const rec = (o ?? {}) as Record<string, unknown>;
        return {
          id: `opt-${i + 1}`,
          label: toStr(rec.label, `Option ${i + 1}`),
          description: typeof rec.description === 'string' ? rec.description : undefined,
        };
      });
      // Two options is the minimum that makes a CHOICE, and a one-option card
      // would let a lazy model pass the scenario without really choosing.
      if (options.length < 2) {
        return {
          output: { error: 'too_few_options', message: 'ask_choice needs at least 2 options.' },
          failure: 'ask_choice needs at least 2 options.',
        };
      }
      const id = `card-${++cardSeq}`;
      return {
        output: { status: 'awaiting_user', cardId: id, rendered: 'choice card', optionCount: options.length },
        card: {
          type: 'choice',
          id,
          title: 'Choose an option',
          data: { prompt, options, submitLabel: 'Choose', dismissible: true },
        },
      };
    }

    case 'request_form': {
      const title = toStr(input.title, 'Details');
      const raw = Array.isArray(input.fields) ? input.fields : [];
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      const order: string[] = [];
      raw.slice(0, 4).forEach((f, i) => {
        const rec = (f ?? {}) as Record<string, unknown>;
        const key = toStr(rec.key, `field_${i + 1}`).replace(/[^a-z0-9_]/gi, '_');
        const type = (['string', 'number', 'boolean'] as const).includes(toStr(rec.type) as 'string')
          ? toStr(rec.type)
          : 'string';
        properties[key] = { type, title: toStr(rec.label, key) };
        order.push(key);
        if (rec.required === true) required.push(key);
      });
      if (order.length === 0) {
        return {
          output: { error: 'no_fields', message: 'request_form needs at least 1 field.' },
          failure: 'request_form needs at least 1 field.',
        };
      }
      const id = `card-${++cardSeq}`;
      return {
        output: { status: 'awaiting_user', cardId: id, rendered: 'form card', fieldCount: order.length },
        card: {
          type: 'form',
          id,
          title,
          data: {
            type: 'object',
            title,
            properties,
            ...(required.length ? { required } : {}),
            'x-kai-order': order,
            'x-kai-submitLabel': toStr(input.submitLabel, 'Submit'),
          },
        },
      };
    }

    case 'plan_tasks': {
      const heading = toStr(input.heading, 'Plan');
      const raw = Array.isArray(input.tasks) ? input.tasks : [];
      const tasks = raw.slice(0, 5).map((t, i) => {
        const rec = (t ?? {}) as Record<string, unknown>;
        return {
          id: `task-${i + 1}`,
          label: toStr(rec.label, `Step ${i + 1}`),
          description: typeof rec.description === 'string' ? rec.description : undefined,
        };
      });
      if (tasks.length < 2) {
        return {
          output: { error: 'too_few_tasks', message: 'plan_tasks needs at least 2 tasks.' },
          failure: 'plan_tasks needs at least 2 tasks.',
        };
      }
      const id = `card-${++cardSeq}`;
      return {
        output: { status: 'awaiting_user', cardId: id, rendered: 'tasks card', taskCount: tasks.length },
        card: {
          type: 'tasks',
          id,
          title: heading,
          data: {
            heading,
            tasks,
            selectAll: true,
            // The APP owns the action label, exactly as it owns "Not now" on the
            // confirm card. A model-authored confirm label ("Start", "Ship it")
            // gives a test nothing stable to click, and the model-authored part
            // of this card — the task list — is asserted on its own.
            confirmLabel: 'Confirm',
          },
        },
      };
    }

    case 'preview_link': {
      const url = toStr(input.url, 'https://ui.kitn.ai');
      // The model supplies a URL; the METADATA is canned, because fetching real
      // Open Graph tags would put a third-party network call in the loop.
      const known = DOCS.find((d) => d.url === url);
      const id = `card-${++cardSeq}`;
      let domain = 'ui.kitn.ai';
      try {
        domain = new URL(url).hostname;
      } catch {
        /* keep the fallback: LinkPreview renders "Invalid link" for a bad URL,
           which is itself a state worth being able to reach. */
      }
      return {
        output: { status: 'rendered', cardId: id, rendered: 'link card', url },
        card: {
          type: 'link',
          id,
          data: {
            url,
            title: toStr(input.title, known?.title ?? 'kitn.ai UI'),
            description: toStr(input.description, known?.snippet ?? 'Web components for AI chat UIs.'),
            domain,
            siteName: 'kitn.ai',
          },
        },
      };
    }

    case 'embed_video': {
      const provider = toStr(input.provider, 'youtube') === 'vimeo' ? 'vimeo' : 'youtube';
      const videoId = toStr(input.id, 'dQw4w9WgXcQ');
      const id = `card-${++cardSeq}`;
      return {
        output: { status: 'rendered', cardId: id, rendered: 'embed card', provider },
        card: {
          type: 'embed',
          id,
          data: { provider, id: videoId, title: toStr(input.title, 'Demo video'), aspectRatio: '16:9' },
        },
      };
    }

    case 'attach_file': {
      const filename = toStr(input.filename, 'report.pdf');
      const kind = toStr(input.kind, 'pdf');
      const mediaType =
        kind === 'image' ? 'image/png' : kind === 'csv' ? 'text/csv' : 'application/pdf';
      return {
        output: { status: 'attached', filename, mediaType, note: 'The file is attached to your reply.' },
        file: { id: `file-${++cardSeq}`, type: 'file', filename, mediaType },
      };
    }

    case 'open_artifact': {
      const artifactId = toStr(input.artifactId, 'artifact-1');
      const title = toStr(input.title, 'Draft');
      const body = toStr(input.body, '');
      // The `artifact` card's payload is a deliberately NARROW subset of the
      // Artifact viewer's props (see the kit's artifact.schema.json): `src`
      // and/or `files`, never a free-form `{title, body}`. So a text document
      // travels as a FILE and the card opens on the Code view, which is where
      // the document itself is legible.
      //
      // This is not a detail. `{title, body}` renders a card with a heading, a
      // toolbar and NOTHING in it — and S13 still went green, because "v2" was
      // visible in the <kai-tool> panel echoing these very arguments three
      // inches up the thread. The card must carry the prose it claims to show.
      const path = `${artifactId}.md`;
      // NOTE the envelope id: it is the model's OWN artifactId, deliberately
      // stable across revisions. `AssistantStream.addCard` upserts on it, so a
      // second call REPLACES the card instead of stacking a second one. S13
      // measures exactly that.
      return {
        output: { status: 'open', artifactId, title, chars: body.length },
        card: {
          type: 'artifact',
          id: artifactId,
          title,
          data: {
            files: [{ path, code: body, language: 'markdown', type: 'other' }],
            // Seeds only — a revision must not yank a user who has switched
            // view or file. Same path each time, so the selection survives.
            tab: 'code',
            activeFile: path,
            displayUrl: path,
          },
        },
      };
    }

    case 'fail_deploy': {
      const target = toStr(input.target, 'staging');
      // Deterministic FAILURE. The point is the output-error branch of the tool
      // panel, which no amount of prompting can reliably provoke from a model.
      const message = `Deploy to "${target}" failed: the release pipeline returned HTTP 502 (upstream_unavailable).`;
      return { output: { error: 'upstream_unavailable', target, message }, failure: message };
    }

    default:
      return {
        output: { error: 'unknown_tool', message: `No local implementation for "${name}".` },
        failure: `No local implementation for "${name}".`,
      };
  }
}
