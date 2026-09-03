// The site's top-level navigation, in one place.
//
// TWO consumers read this array and they must not drift apart:
//   1. astro.config.mjs hands it to starlight-sidebar-topics, which renders the
//      per-topic sidebars plus the in-sidebar topic switcher. That switcher is
//      the navigation below the header's nav breakpoint (see app.css).
//   2. src/components/overrides/Header.astro renders it as the header nav.
// A link added here shows up in both. Drift is why this file exists: a Storybook
// entry was added to the plugin config, and the header, which carried its own
// hardcoded copy of the list, went on showing the old five.
//
// `headerIcon` is ours, not the plugin's: an astro-icon name for the utility
// links the header sets off after a divider (Theme, Storybook). The plugin's zod
// schema is a non-strict object, so it drops the key without complaint, and its
// own `icon` (a Starlight built-in icon name) still drives the sidebar switcher.
// Entries with no `headerIcon` are plain text links in the header.
export const topics = [
  {
    label: 'Docs',
    link: '/guides/introduction/',
    id: 'docs',
    items: [
      { label: 'Introduction', slug: 'guides/introduction' },
      { label: 'Installation', slug: 'guides/installation' },
      { label: 'Getting Started', slug: 'guides/getting-started' },
      { label: 'Drop-in widget', slug: 'guides/drop-in-widget' },
      // Tier 1 — use what we ship
      { label: 'Use the chat app', slug: 'guides/use-the-chat-app' },
      { label: 'Use a workspace', slug: 'guides/use-a-workspace' },
      // Tier 2 — compose & customize
      {
        label: 'Compose & customize',
        items: [
          { label: 'How composition works', slug: 'guides/how-composition-works' },
          { label: 'Build a composer', slug: 'guides/build-a-composer' },
          { label: 'Compose a message thread', slug: 'guides/compose-message-thread' },
          { label: 'Compose your own shell', slug: 'patterns/compose-your-own' },
          { label: 'App shell', slug: 'guides/app-shell' },
          { label: 'Custom chat header', slug: 'patterns/custom-chat-header' },
          { label: 'Menus & command pickers', slug: 'guides/menus-and-pickers' },
        ],
      },
      { label: 'Theming', slug: 'guides/theming' },
      { label: 'State helpers & hooks', slug: 'guides/state-and-hooks' },
      { label: 'Generative UI', slug: 'guides/generative-ui' },
      { label: 'Schemas as tool definitions', slug: 'guides/schemas-as-tools' },
      { label: 'Field formats & masks', slug: 'guides/field-formats' },
      { label: 'Loading', slug: 'guides/loading' },
      { label: 'Accessibility', slug: 'guides/accessibility' },
      { label: 'For AI Agents', slug: 'guides/for-ai-agents' },
      {
        label: 'Frameworks',
        items: [
          { label: 'Overview', slug: 'guides/frameworks/overview' },
          { label: 'HTML', slug: 'guides/frameworks/html' },
          { label: 'React', slug: 'guides/frameworks/react' },
          { label: 'Vue', slug: 'guides/frameworks/vue' },
          { label: 'Svelte', slug: 'guides/frameworks/svelte' },
          { label: 'Angular', slug: 'guides/frameworks/angular' },
          { label: 'Solid', slug: 'guides/frameworks/solid' },
          { label: 'Next.js & TanStack Start', slug: 'guides/frameworks/meta-frameworks' },
        ],
      },
      {
        label: 'Recipes',
        items: [
          { label: 'Streaming', slug: 'guides/recipes/streaming' },
          { label: 'Wire adapter', slug: 'guides/recipes/wire-adapter' },
          { label: 'Text to Speech', slug: 'guides/recipes/text-to-speech' },
          { label: 'Speech to Text', slug: 'guides/recipes/speech-to-text' },
        ],
      },
    ],
  },
  {
    label: 'Components',
    link: '/components/chat/',
    id: 'components',
    // Grouped by role so the ~44 components read as a small set of
    // categories instead of one long alphabetical list.
    items: [
      {
        label: 'Chat & conversations',
        items: [
          { slug: 'components/chat' },
          { slug: 'components/workspace' },
          { slug: 'components/conversations' },
          { slug: 'components/empty' },
        ],
      },
      {
        label: 'Messages & content',
        items: [
          { slug: 'components/message' },
          { slug: 'components/compare' },
          { slug: 'components/markdown' },
          { slug: 'components/code-block' },
          { slug: 'components/reasoning' },
          { slug: 'components/chain-of-thought' },
          { slug: 'components/tool' },
          { slug: 'components/response-stream' },
          { slug: 'components/source' },
          { slug: 'components/sources' },
          { slug: 'components/image' },
          { slug: 'components/link-preview' },
          { slug: 'components/embed' },
        ],
      },
      {
        label: 'Generative UI',
        items: [
          { slug: 'components/card' },
          { slug: 'components/cards' },
          { slug: 'components/form' },
          { slug: 'components/confirm' },
          { slug: 'components/choice' },
          { slug: 'components/tasks' },
        ],
      },
      {
        label: 'Input',
        items: [
          { slug: 'components/prompt-input' },
          { slug: 'components/composer' },
          { slug: 'components/attachments' },
          { slug: 'components/file-upload' },
          { slug: 'components/voice-input' },
          { slug: 'components/suggestions' },
          { slug: 'components/command' },
        ],
      },
      {
        label: 'Controls & chrome',
        items: [
          { slug: 'components/menu' },
          { slug: 'components/model-switcher' },
          { slug: 'components/scope-picker' },
          { slug: 'components/context' },
          { slug: 'components/feedback-bar' },
          { slug: 'components/toast' },
          { slug: 'components/scroll-button' },
          { slug: 'components/switch' },
          { slug: 'components/checkpoint' },
          { slug: 'components/skills' },
          { slug: 'components/thinking-bar' },
          { slug: 'components/audio-visualizer' },
        ],
      },
      {
        label: 'Layout, indicators & embedding',
        items: [
          { slug: 'components/artifact' },
          { slug: 'components/resizable' },
          { slug: 'components/resizable-item' },
          { slug: 'components/file-tree' },
          { slug: 'components/popover' },
          { slug: 'components/loader' },
          { slug: 'components/text-shimmer' },
          { slug: 'components/remote' },
        ],
      },
      {
        label: 'Foundations',
        items: [
          { slug: 'components/button' },
          { slug: 'components/icon' },
          { slug: 'components/avatar' },
          { slug: 'components/badge' },
          { slug: 'components/notice' },
          { slug: 'components/tooltip' },
          { slug: 'components/hover-card' },
          { slug: 'components/separator' },
          { slug: 'components/scroll-area' },
          { slug: 'components/skeleton' },
        ],
      },
    ],
  },
  {
    label: 'Patterns',
    link: '/patterns/popover-menu/',
    id: 'patterns',
    items: [
      { label: 'Button and popover menu', slug: 'patterns/popover-menu' },
      { label: 'Resizable split', slug: 'patterns/resizable-split' },
      { label: 'Empty & first-run state', slug: 'patterns/empty-state' },
      { label: 'Tool calls & reasoning', slug: 'patterns/tool-reasoning' },
      { label: 'Generative UI cards', slug: 'patterns/generative-ui-cards' },
      { label: 'Open an artifact from a message', slug: 'patterns/artifact-from-message' },
      { label: 'Attachments flow', slug: 'patterns/attachments-flow' },
    ],
  },
  {
    label: 'Examples',
    link: '/examples/drop-in-chat/',
    id: 'examples',
    items: [
      { label: 'Drop-in chat', slug: 'examples/drop-in-chat' },
      { label: 'Support widget', slug: 'examples/support-widget' },
      { label: 'Docked assistant', slug: 'examples/docked-assistant' },
      { label: 'Workspace app', slug: 'examples/workspace' },
      { label: 'Artifacts canvas', slug: 'examples/artifacts-canvas' },
      { label: 'RAG assistant', slug: 'examples/rag-assistant' },
      { label: 'Knowledge base', slug: 'examples/knowledge-base' },
      { label: 'Agentic assistant', slug: 'examples/agentic-assistant' },
      { label: 'Reasoning assistant', slug: 'examples/reasoning-assistant' },
      { label: 'Skills & slash commands', slug: 'examples/skills-assistant' },
      { label: 'Models & context', slug: 'examples/model-context' },
      { label: 'Voice assistant', slug: 'examples/voice-assistant' },
      { label: 'Custom theme', slug: 'examples/custom-theme' },
      { label: 'Remote cards', slug: 'examples/remote-cards' },
    ],
  },
  {
    label: 'Blocks',
    link: '/blocks/',
    id: 'blocks',
    items: [{ label: 'Blocks', slug: 'blocks' }],
  },
  {
    label: 'Integrations',
    link: '/integrations/overview/',
    id: 'integrations',
    items: [
      { label: 'Overview', slug: 'integrations/overview' },
      { label: 'Connect any backend', slug: 'integrations/connect-any-backend' },
      { label: 'Connect any model', slug: 'integrations/connect-any-model' },
      { label: 'Vercel AI SDK', slug: 'integrations/vercel-ai-sdk' },
      { label: 'LangGraph', slug: 'integrations/langgraph' },
      { label: 'Cloudflare AI', slug: 'integrations/cloudflare-ai' },
      { label: 'Run it locally with Ollama', slug: 'integrations/ollama' },
      { label: 'Pydantic AI', slug: 'integrations/pydantic-ai' },
      { label: 'Harnesses', slug: 'integrations/harnesses' },
    ],
  },
  {
    label: 'Theme',
    link: '/theme/editor/',
    id: 'theme',
    icon: 'setting',
    headerIcon: 'lucide:palette',
    items: [
      { label: 'Theme editor', slug: 'theme/editor' },
    ],
  },
  // Plain external link, not a topic with its own sidebar — the
  // deployed Storybook lives outside the Astro build.
  {
    label: 'Storybook',
    link: 'https://ui.kitn.ai/storybook',
    icon: 'storybook',
    headerIcon: 'simple-icons:storybook',
    attrs: { target: '_blank', rel: 'noopener' },
  },
];
