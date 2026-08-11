/** Semantic classification of a tool call, used to pick a rendering. Derived from
 *  the provider-chosen tool NAME, which is arbitrary, so this stays conservative and
 *  prefers 'generic' over a confident wrong answer. */
export type ToolKind =
  | 'command'
  | 'file-change'
  | 'search'
  | 'fetch'
  | 'mcp'
  | 'image'
  | 'generic';

/** Total, deterministic, side-effect free. ALWAYS terminates in 'generic' so an
 *  unrecognized tool still renders a panel instead of a blank. Order matters:
 *  'search' is tested before 'fetch' so `web_search` classifies as a search. */
export function classifyTool(name: string): ToolKind {
  const n = name.toLowerCase();
  if (!n) return 'generic';
  if (n.includes('bash') || n.includes('command') || n.includes('shell') || n.includes('terminal') || n.includes('exec')) return 'command';
  if (n.includes('edit') || n.includes('write') || n.includes('patch') || n.includes('replace') || n.includes('delete')) return 'file-change';
  if (n.includes('search') || n.includes('grep') || n.includes('glob') || n.includes('find')) return 'search';
  if (n.includes('fetch') || n.includes('http') || n.includes('browse') || n.includes('crawl')) return 'fetch';
  if (n.includes('mcp')) return 'mcp';
  if (n.includes('image') || n.includes('screenshot') || n.includes('vision')) return 'image';
  return 'generic';
}
