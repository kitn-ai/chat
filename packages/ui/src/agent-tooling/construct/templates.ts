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
 * lineage, for widget) — titles, starters, accents, capability toggles,
 * trigger lists, header/shell chrome. Stub message threads, pane anatomy
 * and other non-vocabulary story state do NOT carry over. All providers
 * are `{ mode: 'mock' }` (B-14 — the wizard's own keyless-first-run
 * promise), regardless of what the story used.
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
const HEADER: TemplateControlSection = { id: 'header', paths: ['header.title'] };
const HEADER_CHROME: TemplateControlSection = {
  id: 'header',
  paths: ['header.title', 'header.themeToggle', 'header.actions'],
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
const COMPOSER_TRIGGERS: TemplateControlSection = {
  id: 'composerTriggers',
  paths: ['composer.triggers.slash', 'composer.triggers.mention'],
};
const SHELL: TemplateControlSection = { id: 'shell', paths: ['shell.commandPalette', 'shell.userMenu'] };
const PROVIDER: TemplateControlSection = { id: 'provider', paths: ['provider'] };

// ── Support widget — owner-widget fixture lineage (B-14), de-branded ────────
const widgetStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'support-widget',
  layout: 'widget',
  provider: { mode: 'mock' },
  header: { title: 'Support' },
  theme: { unreadColor: '#38BDF8', mode: 'system' },
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
  },
};

// ── In-app assistant — builder-in-app-assistant.stories.tsx lineage ─────────
const inAppAssistantStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'in-app-assistant',
  layout: 'aside',
  provider: { mode: 'mock' },
  header: { title: 'Assistant' },
  theme: { accent: '#0ea5e9', mode: 'system' },
  // codegen's own defaults, stated so the geometry is visible/editable.
  aside: { position: 'end', width: '380px' },
  capabilities: {
    starters: ['Deploy payments to production', 'Check the canary status'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
  },
};

// ── Assistant — builder-assistant.stories.tsx lineage ───────────────────────
const assistantStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'daily-assistant',
  layout: 'fullscreen',
  provider: { mode: 'mock' },
  header: { title: 'Assistant' },
  theme: { accent: '#7c3aed', mode: 'system' },
  empty: {
    title: 'What can I help with?',
    description: 'Ask anything, or start from a suggestion below.',
  },
  capabilities: {
    starters: ['Draft the Q3 board update', 'Summarize a document', 'Compare two options'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
  },
};

// ── Research — builder-research.stories.tsx lineage ─────────────────────────
const researchStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'research-assistant',
  layout: 'fullscreen',
  provider: { mode: 'mock' },
  header: { title: 'Research' },
  theme: { accent: '#0f766e', mode: 'system' },
  capabilities: {
    starters: ['How does the wire adapter work?', 'What are message parts?'],
    attachments: { accept: ['application/pdf'] },
    history: { persistence: 'local' },
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
// 11, identities from builder-workspace-variants.tsx) differ only where the
// schema can see (C-6): name and starter prompts. Triggers are ON here and
// ONLY here — the ruling-8 default-on matrix IS this data (B-14); there is
// no separate matrix field to drift.
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
  theme: { accent: '#ea580c', mode: 'system' },
  shell: { commandPalette: true, userMenu: { name: 'Ada', plan: 'Pro' } },
  composer: workspaceTriggers,
  capabilities: {
    starters: ['Build a pricing table', 'Add a dark mode toggle'],
    attachments: { accept: ['image/*'] },
    history: { persistence: 'local' },
  },
};

const workspaceArtifactPreview: Construct = {
  ...workspaceBase,
  name: 'artifact-workspace',
};

const workspaceAppPreview: Construct = {
  ...workspaceBase,
  name: 'app-workspace',
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
    controls: [IDENTITY, THEME, HEADER, HOME, CAPABILITIES, WIDGET_CHROME, PROVIDER],
  },
  {
    id: 'inAppAssistant',
    name: 'In-app assistant',
    description: 'An assistant docked inside your existing app.',
    availability: 'buildable',
    starter: inAppAssistantStarter,
    controls: [IDENTITY, THEME, HEADER, ASIDE, CAPABILITIES, PROVIDER],
  },
  {
    id: 'assistant',
    name: 'Assistant',
    description: 'A full-page assistant with a history of past conversations.',
    availability: 'buildable',
    starter: assistantStarter,
    controls: [IDENTITY, THEME, HEADER, EMPTY, CAPABILITIES, MESSAGE_ACTIONS, PROVIDER],
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Search-first answers with cited sources.',
    availability: 'buildable',
    starter: researchStarter,
    controls: [IDENTITY, THEME, HEADER, CAPABILITIES, SOURCES, MESSAGE_ACTIONS, PROVIDER],
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
      SHELL,
      COMPOSER_TRIGGERS,
      CAPABILITIES,
      MESSAGE_ACTIONS,
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
