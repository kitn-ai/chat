/**
 * The template registry — ONE module, a LEAF (B-12).
 *
 * Data + type-only imports ONLY: `import type { Construct }` is erased at
 * emit, and ./schema-url is a zero-import leaf. NO zod value import, no
 * component import, EVER — that single constraint is what lets all three
 * consumers read this file: the browser-side builder components
 * (builder-start.tsx), the Node MCP tool (mcp/tools/construct.ts), and
 * create-kai's esbuild bundle over `@kitn.ai/ui/construct/templates`
 * (B-16 — bundleGraphProblem's zod ban goes red on its own if this module
 * ever grows a zod path). templates.test.ts pins the import discipline AND
 * safeParses every starter against the real ConstructSchema on every run —
 * schema validity lives in the TEST layer because it cannot live here.
 *
 * A template is a starter construct plus a control manifest, not schema
 * vocabulary (T-3). Public names are neutral (T-4). Voice is 'story-only':
 * identity only, no starter — the StoryOnlyTemplate type has no starter
 * member, which is what "the type makes starter optional exactly and only
 * for story-only entries" (B-13) means. Multi-mode is owner-parked and not
 * in the registry at all (C-4).
 *
 * Starter provenance (C-6): each starter is the schema-expressible subset
 * of its Labs/Builder story's seed state (or the owner-widget fixture
 * lineage, for widget) — titles, starters, capability toggles, trigger
 * lists, header/shell/work-surface chrome. ACCENTS DO NOT CARRY OVER
 * (owner ruling, 2026-08-30): a starter must not pre-commit somebody's
 * brand, so `theme.accent` and `theme.unreadColor` are omitted everywhere
 * and the kit's own `--color-primary` neutral applies in both modes. The
 * stories keep their accents — they are the design surface that
 * demonstrates accenting works — and `builder-app/App.tsx`'s BRAND_STYLE
 * is the kitn product identity on the builder's own canvases and is
 * explicitly out of scope. Stub message threads, pane CONTENT and other
 * non-vocabulary story state do NOT carry over. All providers are
 * `{ mode: 'mock' }` (B-14 — the wizard's own keyless-first-run promise).
 */
import type { Construct } from './schema';
import { CONSTRUCT_SCHEMA_URL } from './schema-url';

export type TemplateId = 'widget' | 'inAppAssistant' | 'assistant' | 'research' | 'workspace' | 'voice';
export type BuildableTemplateId = Exclude<TemplateId, 'voice'>;

export interface TemplateVariant {
  id: string;
  name: string;
  description: string;
  starter: Construct;
}

/** One panel section: a stable id (phase 3's BuilderPanel keys its section
 *  registry off these — the shape builder-panel.tsx's sections already
 *  stubbed) plus the schema paths the section edits. */
export interface TemplateControlSection {
  id: string;
  paths: readonly string[];
  /** Path-keyed one-liners rendered under the control, saying why the
   *  starter leaves it off ON PURPOSE (S-4). A section's PRESENCE is the
   *  discovery surface; a hint is why the default inside it is off. Data,
   *  not vocabulary (T-3) — every key must be one of this section's own
   *  `paths`, which templates.test.ts pins. */
  hints?: Readonly<Record<string, string>>;
}

export interface BuildableTemplate {
  id: BuildableTemplateId;
  name: string;
  description: string;
  availability: 'buildable';
  starter: Construct;
  variants?: readonly TemplateVariant[];
  controls: readonly TemplateControlSection[];
}

export interface StoryOnlyTemplate {
  id: Extract<TemplateId, 'voice'>;
  name: string;
  description: string;
  availability: 'story-only';
}

export type TemplateEntry = BuildableTemplate | StoryOnlyTemplate;

// Shared section manifests, composed per template below. These are data, not
// components: the ids are the contract phase 3's panel binds to.
const IDENTITY: TemplateControlSection = { id: 'identity', paths: ['name'] };
const THEME: TemplateControlSection = { id: 'theme', paths: ['theme.accent', 'theme.mode', 'theme.unreadColor'] };
// Title only — widget keeps this one. The spec's S-3 row
// "header.themeToggle (widget only)" has NO hint site here: this manifest
// carries no `header.themeToggle` path, so there is no control to hang a
// hint on. The section's ABSENCE is itself the statement.
const HEADER: TemplateControlSection = { id: 'header', paths: ['header.title'] };
const HEADER_CHROME: TemplateControlSection = {
  id: 'header',
  paths: ['header.title', 'header.themeToggle', 'header.actions'],
  hints: {
    'header.actions':
      'Each button dispatches `kai-header-action` for your app to handle — nothing happens until you listen.',
  },
};
const EMPTY: TemplateControlSection = { id: 'empty', paths: ['empty.title', 'empty.description', 'empty.icon'] };
const HOME: TemplateControlSection = { id: 'home', paths: ['home'] };
const CAPABILITIES: TemplateControlSection = {
  id: 'capabilities',
  paths: [
    'capabilities.starters',
    'capabilities.attachments',
    'capabilities.history',
    'capabilities.conversations',
    'capabilities.reasoning',
    'capabilities.reasoningOpen',
  ],
  hints: {
    'capabilities.history':
      'Endpoint needs a thread route you host. Local keeps history in this browser — no backend, nothing metered.',
    'capabilities.reasoningOpen':
      'Off by owner ruling (2026-08-26): the thinking panel starts closed and opens on click.',
  },
};
const MESSAGE_ACTIONS: TemplateControlSection = {
  id: 'messageActions',
  paths: ['capabilities.messageActions.user', 'capabilities.messageActions.assistant'],
};
const SOURCES: TemplateControlSection = { id: 'sources', paths: ['capabilities.sources.strip'] };
const WIDGET_CHROME: TemplateControlSection = {
  id: 'widget',
  paths: ['widget.position', 'widget.launcherIcon', 'widget.defaultOpen'],
};
const ASIDE: TemplateControlSection = { id: 'aside', paths: ['aside.position', 'aside.width'] };
const WORK_SURFACE: TemplateControlSection = {
  id: 'workSurface',
  paths: [
    'workSurface.kind',
    'workSurface.url',
    'workSurface.codeUrl',
    'workSurface.chrome.deviceToggle',
    'workSurface.chrome.urlBar',
    'workSurface.chrome.openInNewTab',
    'workSurface.chrome.expand',
    'workSurface.chrome.codeView',
  ],
  hints: {
    // Both hints rewritten 2026-08-30 with the one-way coupling: the toggle no
    // longer needs a URL to be switched on, so the old "leave it blank and the
    // tab stays hidden" was describing a rule that no longer exists.
    'workSurface.codeUrl':
      'The Code tab reads source from this URL. Leave it blank and the tab says so — it never frames a missing page.',
    'workSurface.chrome.codeView':
      'Shows the Preview|Code toggle. Fine to switch on before you have a Code URL.',
  },
};
const COMPOSER_TRIGGERS: TemplateControlSection = {
  id: 'composerTriggers',
  paths: ['composer.triggers.slash', 'composer.triggers.mention'],
};
const SHELL: TemplateControlSection = { id: 'shell', paths: ['shell.commandPalette', 'shell.userMenu'] };
const CARDS: TemplateControlSection = {
  id: 'cards',
  paths: ['cards'],
  hints: { cards: 'Cards arrive as tool calls from a model — the mock provider never emits one.' },
};
const PROVIDER: TemplateControlSection = {
  id: 'provider',
  paths: ['provider'],
  hints: { provider: 'Endpoint needs your own chat route. Mock streams locally, with no key and no bill.' },
};

// ── Support widget — owner-widget fixture lineage (B-14), de-branded ────────
const widgetStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'support-widget',
  layout: 'widget',
  provider: { mode: 'mock' },
  header: { title: 'Support' },
  theme: { mode: 'system' },
  empty: {
    title: "Hi, we're here to help",
    description: 'Ask us about orders, refunds, and more.',
  },
  home: {
    greeting: { title: 'How can we help? 👋', subtitle: 'Orders, refunds, anything.' },
    recentConversation: true,
    links: [
      { label: 'Help center', href: 'https://ui.kitn.ai', description: 'Guides and FAQs', icon: 'book-open' },
    ],
  },
  // States the kit default loudly (the anchored-on-the-default convention,
  // same as research's sources.strip) so the template's chrome fact is
  // visible/editable in its own JSON.
  widget: { position: 'bottom-end' },
  capabilities: {
    starters: ["Where's my order?", 'Request a refund'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
    // Stated, not implied — the anchored-on-the-default convention (B-4), so
    // the fact is visible and editable in the template's own JSON.
    reasoning: 'full',
    // The owner's A3 default matrix (builder-message-actions.tsx).
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
};

// ── In-app assistant — builder-in-app-assistant.stories.tsx lineage ─────────
const inAppAssistantStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'in-app-assistant',
  layout: 'aside',
  provider: { mode: 'mock' },
  header: { title: 'Assistant', themeToggle: true },
  // Dark-by-default (owner ruling, dark round): every buildable starter
  // EXCEPT widget ships mode: 'dark' — widget is embedded in a host site and
  // follows IT, not its own preference (T-3: this is registry data, not a
  // schema default; 'system' stays the schema's own default for anyone
  // hand-authoring a construct).
  theme: { mode: 'dark' },
  // codegen's own defaults, stated so the geometry is visible/editable.
  aside: { position: 'end', width: '380px' },
  empty: {
    title: 'What can I help with?',
    description: 'Ask about this page, or anything else.',
  },
  composer: {
    triggers: {
      slash: [
        { id: 'summarize', label: 'summarize', description: 'Summarize the thread so far' },
        { id: 'explain', label: 'explain', description: 'Explain the current page' },
      ],
      mention: [
        { id: 'docs', label: 'docs', description: 'Search the documentation' },
        { id: 'support', label: 'support', description: 'Hand off to a person' },
      ],
    },
  },
  capabilities: {
    starters: ['Deploy payments to production', 'Check the canary status'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
    reasoning: 'full',
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
};

// ── Assistant — builder-assistant.stories.tsx lineage ───────────────────────
const assistantStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'daily-assistant',
  layout: 'fullscreen',
  provider: { mode: 'mock' },
  header: { title: 'Assistant', themeToggle: true },
  // Dark-by-default (owner ruling, dark round) — see inAppAssistantStarter's
  // note above.
  theme: { mode: 'dark' },
  shell: { commandPalette: true, userMenu: { name: 'Ada', plan: 'Pro' } },
  empty: {
    title: 'What can I help with?',
    description: 'Ask anything, or start from a suggestion below.',
  },
  capabilities: {
    starters: ['Draft the Q3 board update', 'Summarize a document', 'Compare two options'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
    reasoning: 'full',
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
};

// ── Research — builder-research.stories.tsx lineage ─────────────────────────
const researchStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'research-assistant',
  layout: 'fullscreen',
  provider: { mode: 'mock' },
  header: { title: 'Research', themeToggle: true },
  // Dark-by-default (owner ruling, dark round) — see inAppAssistantStarter's
  // note above.
  theme: { mode: 'dark' },
  empty: {
    title: 'What do you want to know?',
    description: 'Answers come back with their sources attached.',
  },
  capabilities: {
    starters: ['How does the wire adapter work?', 'What are message parts?'],
    attachments: { accept: ['application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
    reasoning: 'full',
    // The template's defining fact, stated even though it matches the emit
    // default (B-4): the row already renders; strip: true is the visible
    // switch this template exists around.
    sources: { strip: true },
    // "assistant-style actions" (B-13) — the owner's A3 default matrix
    // (builder-message-actions.tsx: user Edit on; assistant
    // Copy/Like/Dislike on).
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
};

// ── Workspace — builder-workspace.stories.tsx lineage ───────────────────────
// The base starter is the artifact-preview shape; the two variants (ruling
// 11, identities from builder-workspace-variants.tsx) differ where the schema
// can see (C-6). Triggers are ON here and on the in-app assistant — the two
// agentic shapes, per the 2026-08-30 default-on ruling; the matrix IS this
// data (B-14), there is no separate matrix field to drift.
const workspaceTriggers: NonNullable<Construct['composer']> = {
  triggers: {
    slash: [
      { id: 'summarize', label: 'summarize', description: 'Summarize the thread so far' },
      { id: 'translate', label: 'translate', description: 'Translate the last message' },
    ],
    mention: [
      { id: 'researcher', label: 'researcher', description: 'Hands off to the research agent' },
      { id: 'coder', label: 'coder', description: 'Hands off to the coding agent' },
    ],
  },
};

const workspaceBase: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'build-workspace',
  layout: 'split',
  provider: { mode: 'mock' },
  header: {
    title: 'Workspace',
    themeToggle: true,
    // The story's Share/Deploy rows, mapped onto the kit Button's real
    // variant names (B-6a's enum): 'secondary' → outline, 'primary' → default.
    actions: [
      { label: 'Share', variant: 'outline' },
      { label: 'Deploy', variant: 'default' },
    ],
  },
  // Dark-by-default (owner ruling, dark round) — see inAppAssistantStarter's
  // note above. Both variants below spread ...workspaceBase without
  // overriding theme, so this covers artifactPreview and appPreview too.
  theme: { mode: 'dark' },
  empty: {
    title: 'What should we build?',
    description: 'Describe it, and it takes shape in the work surface beside this chat.',
  },
  // The template's whole point, and the reason this round exists: a split
  // layout with no workSurface previews as a chat beside an empty column.
  // Every chrome key is STATED, never left to a default — what the builder
  // panel shows and what the pane renders can then never disagree.
  workSurface: {
    kind: 'artifact',
    url: '/work-surface.html',
    chrome: { deviceToggle: false, urlBar: false, openInNewTab: false, expand: true, codeView: false },
  },
  shell: { commandPalette: true, userMenu: { name: 'Ada', plan: 'Pro' } },
  composer: workspaceTriggers,
  capabilities: {
    starters: ['Build a pricing table', 'Add a dark mode toggle'],
    attachments: { accept: ['image/*'] },
    history: { persistence: 'local' },
    conversations: true,
    reasoning: 'full',
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
};

const workspaceArtifactPreview: Construct = {
  ...workspaceBase,
  name: 'artifact-workspace',
  // A clean framed surface: one expand control, no browser chrome. The
  // difference from appPreview below is what the two variant CARDS promise,
  // and until 2026-08-30 the two starters delivered none of it.
  // `codeView` stays OFF here on the owner's ruling: an artifact pane frames a
  // finished thing, not a source tree, so a Code tab beside it would be
  // chrome the variant does not claim. appPreview below is the one that does.
  workSurface: {
    kind: 'artifact',
    url: '/work-surface.html',
    chrome: { deviceToggle: false, urlBar: false, openInNewTab: false, expand: true, codeView: false },
  },
};

const workspaceAppPreview: Construct = {
  ...workspaceBase,
  name: 'app-workspace',
  // Full browser chrome: device toggle, address bar, open-in-new-tab, expand,
  // and the Preview|Code toggle. `codeView: true` with no `codeUrl` is valid
  // vocabulary (owner ruling, 2026-08-30) and it is what this variant needs:
  // the app-preview surface it is modeled on shows both tabs, so shipping the
  // toggle off meant nobody ever saw it. With no source pointed at it the tab
  // renders WorkSurface's own empty state naming `workSurface.codeUrl` — an
  // honest "nothing here yet", never a 404. No `codeUrl` is set because there
  // is no honest offline file to point at; the placeholder codegen emits is
  // the PREVIEW's page, not source.
  workSurface: {
    kind: 'preview',
    url: '/work-surface.html',
    chrome: { deviceToggle: true, urlBar: true, openInNewTab: true, expand: true, codeView: true },
  },
  capabilities: {
    ...workspaceBase.capabilities,
    starters: ['Build a landing page for a coffee shop', 'Make the hero work on mobile'],
  },
};

export const TEMPLATES: readonly TemplateEntry[] = [
  {
    id: 'widget',
    name: 'Support widget',
    description: 'A floating chat that lives in the corner of your site.',
    availability: 'buildable',
    starter: widgetStarter,
    controls: [IDENTITY, THEME, HEADER, EMPTY, HOME, CAPABILITIES, MESSAGE_ACTIONS, WIDGET_CHROME, PROVIDER],
  },
  {
    id: 'inAppAssistant',
    name: 'In-app assistant',
    description: 'An assistant docked inside your existing app.',
    availability: 'buildable',
    starter: inAppAssistantStarter,
    // Design-parity fix wave (2026-08-29 audit): the story's In-app
    // assistant panel shows Composer triggers, Message actions and a
    // read-only Cards list, none of which were wired here even though the
    // vocabulary and the panel machinery both already exist (proven working
    // on Workspace/Assistant/Research). Voice/Reveal-mode/Rail-placement
    // stay absent — those are the story's own labeled preview-only,
    // T-5-deferred fields with no construct vocabulary at all.
    controls: [IDENTITY, THEME, HEADER_CHROME, EMPTY, ASIDE, COMPOSER_TRIGGERS, CAPABILITIES, MESSAGE_ACTIONS, CARDS, PROVIDER],
  },
  {
    id: 'assistant',
    name: 'Assistant',
    description: 'A full-page assistant with a history of past conversations.',
    availability: 'buildable',
    starter: assistantStarter,
    // Design-parity fix wave: the story's Assistant panel shows an App
    // chrome / Shell section (Command palette toggle, User menu) that
    // wasn't wired here — same already-working vocabulary as Workspace's
    // SHELL section.
    controls: [IDENTITY, THEME, HEADER_CHROME, SHELL, EMPTY, CAPABILITIES, MESSAGE_ACTIONS, PROVIDER],
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Search-first answers with cited sources.',
    availability: 'buildable',
    starter: researchStarter,
    controls: [IDENTITY, THEME, HEADER_CHROME, EMPTY, CAPABILITIES, SOURCES, MESSAGE_ACTIONS, PROVIDER],
  },
  {
    id: 'workspace',
    name: 'Workspace',
    description:
      'Chat drives a live work surface: previews, code, and artifacts build beside the conversation.',
    availability: 'buildable',
    starter: workspaceBase,
    variants: [
      {
        id: 'artifactPreview',
        name: 'Artifact preview beside chat',
        description: 'A code or rendered-output pane grows beside the conversation as you build.',
        starter: workspaceArtifactPreview,
      },
      {
        id: 'appPreview',
        name: 'App preview with device toggles',
        description:
          'A full browser-chrome preview of the running app, with desktop, tablet, and mobile views.',
        starter: workspaceAppPreview,
      },
    ],
    controls: [
      IDENTITY,
      THEME,
      HEADER_CHROME,
      WORK_SURFACE,
      SHELL,
      COMPOSER_TRIGGERS,
      CAPABILITIES,
      MESSAGE_ACTIONS,
      EMPTY,
      PROVIDER,
    ],
  },
  {
    id: 'voice',
    name: 'Voice',
    description: 'A voice-first assistant you talk to, push-to-talk and all.',
    availability: 'story-only',
  },
];

export function buildableTemplates(): readonly BuildableTemplate[] {
  return TEMPLATES.filter((t): t is BuildableTemplate => t.availability === 'buildable');
}

export function templateById(id: TemplateId): TemplateEntry | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * Derive a buildable template's family from a LOADED construct's own shape
 * (T-3 forbids a template key in the file, so there is nothing else to read
 * this from). Layout is the discriminant for four of the five buildable
 * families; `fullscreen` splits further on `capabilities.sources` being
 * present, the research template's one defining fact (see researchStarter's
 * comment). `custom` and any unrecognized shape return undefined — the
 * caller falls back to a neutral label rather than guessing.
 */
export function inferTemplateId(c: Construct): BuildableTemplateId | undefined {
  switch (c.layout) {
    case 'widget':
      return 'widget';
    case 'aside':
      return 'inAppAssistant';
    case 'split':
      return 'workspace';
    case 'fullscreen':
      return c.capabilities?.sources ? 'research' : 'assistant';
    default:
      return undefined;
  }
}
