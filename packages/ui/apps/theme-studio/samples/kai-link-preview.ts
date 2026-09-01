// Sample data for <kai-link-preview>.
//
// `data` is the one non-scalar prop — it carries the OG/link metadata
// (url, title, description, image, favicon, siteName, domain) and must
// be set as a JS property: `el.data = { … }`.
//
// `sample`  = default data shown by the Playground + bare <Example> calls
// `named`   = per-story sets referenced by <Example data="…">

export default {
  sample: {
    data: {
      url: 'https://example.com/blog/generative-ui',
      title: 'Generative UI, explained',
      description:
        'How agents render typed, themed cards in the chat — across native components and provider iframes.',
      image: 'https://placehold.co/1200x630/6366f1/ffffff/png?text=Generative+UI',
      imageAlt: 'Diagram of the card contract',
      favicon: 'https://example.com/favicon.ico',
      siteName: 'Example Blog',
      domain: 'example.com',
    },
  },
  named: {
    // No image — graceful text + domain fallback layout.
    noImage: {
      data: {
        url: 'https://docs.example.com/guide',
        title: 'API Guide',
        description: 'Reference for the public endpoints, auth, and rate limits.',
        siteName: 'Example Docs',
        domain: 'docs.example.com',
      },
    },
    // Bare URL only — shows the skeleton then the resolved preview when a
    // configureLinkPreview fetcher is registered (resolution happens at runtime).
    bareUrl: {
      data: {
        url: 'https://example.com/bare',
      },
    },
    // Invalid URL — renders a non-clickable error chip and emits one `error`
    // event via the kai-card envelope.
    invalidLink: {
      data: {
        url: 'not-a-valid-url',
      },
    },
  },
};
