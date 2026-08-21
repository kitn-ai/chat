/** A checkpoint: one generated page, kept forever, restorable. */
export type PageVersion = {
  /** Same id as the tool call that produced it, so a revision upserts. */
  id: string;
  /** 'v1', 'v2', … — what the rail and the cards show. */
  label: string;
  /** File name the preview's address field shows. */
  fileName: string;
  /** The prompt that produced this version. */
  prompt: string;
  /** The complete, self-contained document. */
  html: string;
  createdAt: number;
  /**
   * Every prompt that this version was built from, oldest first — the lineage
   * the next turn continues. A restored version carries its ORIGINAL lineage,
   * which is what makes "restore v2, then keep editing" branch off v2.
   */
  basePrompts: string[];
  /** Set when this version was made by restoring an earlier one. */
  restoredFrom?: string;
};

/**
 * The preview frames a `data:` URL rather than a blob: one string, no object
 * URL to revoke, and it survives a version being selected again later. The
 * artifact's iframe keeps the kit's default sandbox (`allow-scripts
 * allow-forms`, no `allow-same-origin`), so the page runs in an opaque origin.
 */
export function pageUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

/** `<title>` is MARKUP, so its text is entity-encoded; decode before display. */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function titleOf(html: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  if (!m) return 'Untitled page';
  const decoded = m[1].replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);
  return decoded.split('—')[0].trim() || 'Untitled page';
}
