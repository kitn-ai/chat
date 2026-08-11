// Reverse coverage, both directions.
//
//   forward  — things the kit SHIPS that the docs never mention.
//   backward — things the docs describe that the kit no longer has.
//
// Both are computed from the shipped surface, so an element added this morning
// shows up as undocumented this afternoon without anyone editing a list.

/** Every kai-* tag and kit export name a page references, in code or prose. */
function mentionsOf(doc) {
  const tags = new Set();
  const names = new Set();

  const scan = (text) => {
    for (const m of text.matchAll(/kai-[a-z0-9-]+/g)) tags.add(m[0]);
    for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9]*)\b/g)) names.add(m[1]);
    for (const m of text.matchAll(/\b([a-z][A-Za-z0-9]*)\b/g)) names.add(m[1]);
  };
  scan(doc.src);
  return { tags, names };
}

export function coverage(docs, surface) {
  const tagPages = new Map(); // tag -> pages mentioning it
  const dedicated = new Map(); // tag -> pages that DOCUMENT it (an MDX tag= prop)
  const nameMentions = new Map(); // export name -> pages

  for (const doc of docs) {
    const { tags, names } = mentionsOf(doc);
    for (const t of tags) {
      if (!surface.tags.has(t)) continue;
      if (!tagPages.has(t)) tagPages.set(t, []);
      tagPages.get(t).push(doc.rel);
    }
    for (const c of doc.mdxComponents) {
      const t = c.attrs.tag?.kind === 'string' ? c.attrs.tag.value : null;
      if (!t || !surface.tags.has(t)) continue;
      if (!dedicated.has(t)) dedicated.set(t, new Set());
      dedicated.get(t).add(doc.rel);
    }
    for (const n of names) {
      if (!surface.byName.has(n)) continue;
      if (!nameMentions.has(n)) nameMentions.set(n, []);
      nameMentions.get(n).push(doc.rel);
    }
  }

  const undocumentedElements = [...surface.tags]
    .filter((t) => !tagPages.has(t))
    .sort();

  // Shipped but never rendered by a Playground/PropTable/Example — i.e. named in
  // passing at most. Weaker than "undocumented" but still a real gap.
  const elementsWithoutPage = [...surface.tags]
    .filter((t) => !dedicated.has(t))
    .sort()
    .map((t) => ({ tag: t, mentionedIn: tagPages.get(t) ?? [] }));

  const undocumentedComponents = [...surface.components]
    .filter((n) => !nameMentions.has(n))
    .sort();

  // Backward: docs naming a kai-* tag the kit does not have at all.
  //
  // Only tokens used AS AN ELEMENT (`<kai-x`) or backticked in prose count. A
  // bare scan of the source text also matched the docs' own CSS classes
  // (`kai-lede`, `kai-tag-sub`) and every `--kai-color-*` custom property, which
  // is 38 findings of pure noise. Tokens the kit's own source mentions are
  // excluded too — those are the element-meta gaps, reported separately.
  const staleTags = new Map();
  for (const doc of docs) {
    const used = new Set();
    for (const m of doc.src.matchAll(/<(kai-[a-z0-9-]+)[\s/>]/g)) used.add(m[1]);
    for (const m of doc.src.matchAll(/`<?(kai-[a-z0-9-]+)>?`/g)) used.add(m[1]);
    for (const t of used) {
      if (surface.tags.has(t) || surface.eventNames.has(t) || surface.knownTokens.has(t)) continue;
      if (!staleTags.has(t)) staleTags.set(t, new Set());
      staleTags.get(t).add(doc.rel);
    }
  }

  // Backward: docs importing an @kitn.ai/ui subpath the exports map has no entry
  // for. tsc reports this too, but only inside compilable blocks.
  const staleEntries = new Map();
  for (const doc of docs) {
    for (const m of doc.src.matchAll(/['"](@kitn\.ai\/ui(?:\/[^'"]*)?)['"]/g)) {
      const spec = m[1];
      if (surface.resolvesEntry(spec)) continue;
      if (!staleEntries.has(spec)) staleEntries.set(spec, new Set());
      staleEntries.get(spec).add(doc.rel);
    }
  }

  return {
    undocumentedElements,
    elementsWithoutPage: elementsWithoutPage.filter((e) => !undocumentedElements.includes(e.tag)),
    undocumentedComponents,
    staleTags: [...staleTags.entries()].map(([tag, pages]) => ({ tag, pages: [...pages] })).sort((a, b) => a.tag.localeCompare(b.tag)),
    staleEntries: [...staleEntries.entries()].map(([spec, pages]) => ({ spec, pages: [...pages] })).sort((a, b) => a.spec.localeCompare(b.spec)),
    documentedElementCount: tagPages.size,
    mentionedComponentCount: nameMentions.size,
  };
}
