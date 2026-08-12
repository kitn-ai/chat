// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import solid from '@astrojs/solid-js';
import icon from 'astro-icon';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

// Astro Starlight docs site for AI/UI. Served at the custom domain ui.kitn.ai
// (see public/CNAME), so the site lives at the root — `base: '/'`. Assets are
// still referenced with import.meta.env.BASE_URL so they resolve in dev and the
// static build (each usage strips a trailing slash, so '/' yields '/asset').
export default defineConfig({
  site: 'https://ui.kitn.ai',
  base: '/',
  vite: { plugins: [tailwindcss(), Icons({ compiler: 'solid' })] },
  // Render the heading anchor as a CHILD of the heading (behavior: 'append'),
  // so the heading can be a flex row [text · #] — clean gap + hover reveal,
  // and the "#" inherits the heading's font size. (Starlight's default emits it
  // as a sibling, which is why it floated; we hide that one in CSS.)
  markdown: {
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, {
        behavior: 'append',
        // Empty content — the visible "#" is added via CSS ::after so it's NOT
        // part of the heading text (otherwise the TOC reads "Preview#").
        properties: { className: ['kai-anchor'], 'aria-label': 'Link to this section' },
        content: [],
      }],
    ],
  },
  integrations: [
    icon(),
    solid(),
    starlight({
      title: 'AI/UI',
      favicon: '/favicon.svg',
      head: [
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' } },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16.png' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' } },
      ],
      // Single entry: Tailwind (layered for Starlight) + the kitn design system.
      customCss: ['./src/styles/app.css'],
      // Code blocks: vibrant Tokyo Night tokens on a near-black bg (matches the
      // kitn dark surface); GitHub Light for light mode.
      expressiveCode: {
        themes: ['tokyo-night', 'github-light'],
        styleOverrides: {
          borderRadius: '0.6rem',
          borderColor: 'var(--kai-line)',
          frames: { frameBoxShadowCssValue: 'none' },
        },
      },
      components: {
        Header: './src/components/overrides/Header.astro',
        SocialIcons: './src/components/overrides/SocialIcons.astro',
        ThemeSelect: './src/components/overrides/ThemeToggle.astro',
        PageTitle: './src/components/overrides/PageTitle.astro',
      },
      // Topic-based sidebars: the header nav (Docs · Components · Examples)
      // switches between these, each showing only its own pages (no redundant
      // topic title in the sidebar — the plugin's own switcher is hidden in CSS).
      plugins: [
        starlightSidebarTopics([
          {
            label: 'Docs',
            link: '/guides/introduction/',
            id: 'docs',
            items: [
              { label: 'Introduction', slug: 'guides/introduction' },
              { label: 'Installation', slug: 'guides/installation' },
              { label: 'Getting Started', slug: 'guides/getting-started' },
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
                  { label: 'Custom chat header', slug: 'patterns/custom-chat-header' },
                  { label: 'Menus & command pickers', slug: 'guides/menus-and-pickers' },
                ],
              },
              { label: 'Theming', slug: 'guides/theming' },
              { label: 'State helpers & hooks', slug: 'guides/state-and-hooks' },
              { label: 'Generative UI', slug: 'guides/generative-ui' },
              { label: 'Schemas as tool definitions', slug: 'guides/schemas-as-tools' },
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
            items: [
              { label: 'Theme editor', slug: 'theme/editor' },
            ],
          },
        ]),
      ],
    }),
  ],
});
