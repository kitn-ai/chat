// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import solid from '@astrojs/solid-js';
import icon from 'astro-icon';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import { topics } from './src/topics.mjs';
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
      // Topic-based sidebars, defined in src/topics.mjs because the header nav
      // renders the same array (one list, two consumers). Each topic shows only
      // its own pages; above the header's nav breakpoint the header IS the
      // switcher, so the plugin's in-sidebar switcher is hidden in CSS.
      plugins: [
        starlightSidebarTopics(topics),
      ],
    }),
  ],
});
