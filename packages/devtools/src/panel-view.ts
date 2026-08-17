// Pure HTML builders for the panel. No DOM access, no state -- so the element
// is left owning only state and events, and every piece of markup here can be
// reasoned about (and tested) as a string.
//
// METADATA ONLY, and this module is where that promise is actually kept: it
// renders counts, byte and character sizes, durations, ids, variant names and
// FIELD NAMES. It never receives a message delta, a tool argument or a URL,
// because the fold never retained one.
import {
  CONTENT_KEYS,
  findingsFor,
  streamStatus,
  type Finding,
  type FrameRow,
  type StreamStatus,
  type StreamSummary,
} from './streams';
import type { WireDiagnosticEvent } from './contract';

/** How many frame rows reach the DOM. A UI retention decision, the same kind
 *  the raw log makes: the panel owns retention once attached. */
export const MAX_FRAME_ROWS = 100;

export const esc = (v: unknown): string =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Absent renders as an em dash, ALWAYS, and is never substituted from
 *  elsewhere -- a display that filled in a requested model id would lie in
 *  exactly the requested-vs-served mismatch the field exists to catch. */
const dash = '<span class="v absent">&mdash;</span>';
const val = (v: unknown, cls = ''): string =>
  v === undefined || v === null || v === ''
    ? dash
    : `<span class="v${cls ? ` ${cls}` : ''}">${esc(v)}</span>`;

const kv = (k: string, v: string): string =>
  `<div class="kv"><div class="k">${esc(k)}</div>${v}</div>`;

const ms = (n: number | undefined): string => (n === undefined ? dash : val(`${n}ms`));

/** The last segment of a format id, so `openai.chat-completions` reads as
 *  `chat-completions` in a 34%-wide column without truncating to nothing. */
export const shortFormat = (format: string | undefined): string =>
  format ? (format.includes('.') ? format.slice(format.indexOf('.') + 1) : format) : '';

/**
 * `frames → chunks → parts`, with the ARROWS carrying the diagnosis.
 *
 * Every failure this panel exists for is a collapse across one of the two
 * transformations, so the arrow that collapsed is what turns red. Rendering
 * three numbers and colouring the numbers would say "this value is bad"; the
 * truth is "this STEP produced nothing", which is what an arrow says.
 */
export function funnel(s: StreamSummary): string {
  const partsTotal = Object.values(s.parts).reduce((a, b) => a + b, 0);
  const frames = s.frames;
  const n = (v: number | undefined) =>
    v === undefined
      ? '<span class="n zero">&mdash;</span>'
      : `<span class="n${v === 0 ? ' zero' : ''}">${v}</span>`;
  // A collapse only counts when something went IN and nothing came out.
  const a1 = (frames ?? 0) > 0 && s.chunks === 0;
  const a2 = s.chunks > 0 && partsTotal === 0;
  return (
    `<span class="funnel">${n(frames)}` +
    `<span class="arrow${a1 ? ' collapse' : ''}">&rarr;</span>${n(s.chunks)}` +
    `<span class="arrow${a2 ? ' collapse' : ''}">&rarr;</span>${n(partsTotal)}</span>`
  );
}

export const STATUSES: readonly StreamStatus[] = ['open', 'ok', 'empty', 'failed'];

export function statusCounts(streams: readonly StreamSummary[]): Record<StreamStatus, number> {
  const out: Record<StreamStatus, number> = { open: 0, ok: 0, empty: 0, failed: 0 };
  for (const s of streams) out[streamStatus(s)] += 1;
  return out;
}

/** Matches the text filter against the facts someone would actually type: the
 *  stream id, the format, the model the response stated, and the error code. */
export function matchesQuery(s: StreamSummary, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [s.streamId, s.format, s.model, s.errorCode]
    .filter((v) => v !== undefined && v !== null)
    .some((v) => String(v).toLowerCase().includes(needle));
}

export function streamRow(s: StreamSummary, index: number, selected: boolean): string {
  const status = streamStatus(s);
  const duration = s.ms !== undefined ? `${s.ms}ms` : s.open ? 'live' : '';
  return `
    <div class="row ${status}" role="option" tabindex="-1"
         data-index="${index}" aria-selected="${selected ? 'true' : 'false'}">
      <span class="dot"></span>
      <span class="id">${esc(s.streamId ?? '—')}</span>
      <span class="dur">${esc(duration)}</span>
      <span class="sub">${funnel(s)}<span class="fmt">${esc(shortFormat(s.format))}</span></span>
    </div>`;
}

/** One field name. Filled when it carries content, hollow when it only
 *  describes the response -- so an all-hollow column IS the finding. */
const chip = (name: string): string =>
  `<span class="chip${CONTENT_KEYS.has(name) ? ' content' : ''}">${esc(name)}</span>`;

const frameRow = (f: FrameRow): string => `
  <tr>
    <td class="num"><b>${f.seq}</b></td>
    <td class="num">${f.atMs === undefined ? '—' : `+${f.atMs}`}</td>
    <td class="num">${f.bytes}</td>
    <td class="num${f.chunks === 0 ? ' zero' : ''}"><b>${f.chunks}</b></td>
    <td>${
      f.fields.length === 0
        ? '<span class="chip none">no fields</span>'
        : `<div class="chips">${f.fields.map(chip).join('')}</div>`
    }</td>
  </tr>`;

function usageBlock(s: StreamSummary): string {
  const u = s.usage;
  if (!u) return '';
  const entries: [string, unknown][] = [
    ['in', u.inputTokens],
    ['out', u.outputTokens],
    ['total', u.totalTokens],
    ['reasoning', u.reasoningTokens],
    ['cached', u.cachedInputTokens],
  ];
  const tags = entries
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<span class="tag">${esc(k)} <b>${esc(v)}</b></span>`)
    .join('');
  return tags ? `<div class="sec-b"><div class="tags">${tags}</div></div>` : '';
}

const finding = (f: Finding): string => `
  <div class="finding ${f.verdict}">
    <span class="mark" aria-hidden="true"></span>
    <div class="body">
      <div class="lbl">${esc(f.label)}<span class="verdict">${esc(f.verdict === 'na' ? 'n/a' : f.verdict)}</span></div>
      <div class="say">${esc(f.statement)}</div>
      ${f.detail ? `<div class="det">${esc(f.detail)}</div>` : ''}
    </div>
  </div>`;

/** A collapsed evidence section. The numbers stay one click away rather than
 *  filling the pane -- findings first, evidence on demand. */
const disclosure = (id: string, title: string, count: number, open: boolean, body: string): string => `
  <div class="sec">
    <button class="disc" type="button" data-section="${id}" aria-expanded="${open ? 'true' : 'false'}">
      <span class="caret">${open ? '&#9662;' : '&#9656;'}</span>${esc(title)} (${count})
    </button>
    ${open ? body : ''}
  </div>`;

export function inspector(
  s: StreamSummary | undefined,
  events: readonly WireDiagnosticEvent[],
  maxRaw: number,
  sections: Record<string, boolean> = {},
): string {
  if (!s) {
    return `<div class="empty"><div class="lead">Select a stream</div>
      <div>Its report card, frames and timings appear here.</div></div>`;
  }

  const status = streamStatus(s);
  const partEntries = Object.entries(s.parts);
  const scoped = events.filter((e) => e.streamId === s.streamId);
  const t0 = scoped.length > 0 ? scoped[0].t : 0;

  const found = findingsFor(s);

  return `
    <div class="sec card">
      <div class="sec-h">Report</div>
      <div class="findings">${found.map(finding).join('')}</div>
    </div>

    <div class="sec">
      <div class="sec-h">Summary</div>
      <div class="sec-b">
        <div class="grid">
          ${kv('stream', val(s.streamId))}
          ${kv('status', val(status, status === 'ok' ? 'ok' : status === 'open' ? '' : 'err'))}
          ${kv('format', val(s.format))}
          ${kv('source', val(s.source))}
          ${kv('model', val(s.model))}
          ${kv('finish reason', val(s.finishReason))}
          ${kv('stop reason', val(s.stopReason))}
          ${kv('error code', val(s.errorCode, s.errorCode === undefined ? '' : 'err'))}
          ${kv('http status', val(s.status, s.status === undefined ? '' : 'err'))}
          ${kv('first frame', ms(s.firstFrameMs))}
          ${kv('total', ms(s.ms))}
        </div>
      </div>
      ${usageBlock(s)}
    </div>

    ${disclosure(
      'frames',
      'Frames',
      s.frameRows.length,
      sections.frames === true,
      s.frameRows.length === 0
        ? '<div class="empty">No frames decoded.</div>'
        : `${
              // A DOM cap, like the raw log. A long stream produces hundreds of
              // frames and rendering all of them turns the inspector back into
              // the wall this redesign exists to replace -- and rebuilds them on
              // every event. The most recent ones are the ones being diagnosed.
              s.frameRows.length > MAX_FRAME_ROWS
                ? `<div class="capped">showing the last ${MAX_FRAME_ROWS} of ${s.frameRows.length}</div>`
                : ''
            }
            <table>
              <thead><tr>
                <th>seq</th><th>at</th><th>bytes</th><th>chunks</th><th>fields</th>
              </tr></thead>
              <tbody>${s.frameRows.slice(-MAX_FRAME_ROWS).map(frameRow).join('')}</tbody>
            </table>`,
    )}

    ${disclosure(
      'parts',
      'Parts',
      partEntries.reduce((a, [, n]) => a + n, 0),
      sections.parts === true,
      `<div class="sec-b">
        ${
          partEntries.length === 0
            ? '<div class="tags"><span class="tag">no parts produced</span></div>'
            : `<div class="tags">${partEntries
                .map(([k, n]) => `<span class="tag">${esc(k)} <b>${n}</b></span>`)
                .join('')}</div>`
        }
      </div>
      ${
        s.partRows.length === 0
          ? ''
          : `<table>
              <thead><tr><th>variant</th><th>index</th><th>chars</th><th>at</th></tr></thead>
              <tbody>${s.partRows
                .slice(-MAX_FRAME_ROWS)
                .map(
                  (p) => `<tr>
                    <td>${esc(p.variant)}</td>
                    <td class="num">${p.index ?? '—'}</td>
                    <td class="num">${p.chars ?? '—'}</td>
                    <td class="num">${p.atMs === undefined ? '—' : `+${p.atMs}`}</td>
                  </tr>`,
                )
                .join('')}</tbody>
            </table>`
      }`,
    )}

    ${disclosure(
      'raw',
      'Raw events',
      scoped.length,
      sections.raw === true,
      `<div class="raw">${scoped
        .slice(-maxRaw)
        .map((e) => `<div>${esc(`+${(e.t ?? 0) - t0}ms  ${e.type}`)}</div>`)
        .join('')}</div>`,
    )}`;
}
