// THE VERDICT LINE: one sentence, at the top, the largest text on screen.
//
// This is the whole cold open. Not a dashboard, not a summary of everything the
// tool could say -- the single thing a developer needs in order to decide
// whether to look further. Too much information is the same as not having
// enough, and a screen of green badges attesting that each of nine things is
// fine is exactly the noise this replaces.
//
// Healthy reads as a receipt: how many calls, how many models, how long, what it
// cost, and "nothing anomalous". Anything wrong REPLACES that entirely with the
// finding, because a finding buried beside a receipt is a finding nobody reads.
import { findingsFor, streamStatus, type Finding, type StreamSummary } from './streams';
import { rollup } from './observability';

export interface VerdictLine {
  text: string;
  /** True when a finding is being reported rather than a healthy summary. The
   *  view uses this for the ONE piece of colour on the cold open. */
  anomalous: boolean;
}

/**
 * The categories, worst first.
 *
 * Order is severity, not alphabet: a call that produced nothing outranks a call
 * that merely arrived in a lump. The phrase completes "N of M calls ___".
 */
const CATEGORIES: { id: string; phrase: string }[] = [
  { id: 'request', phrase: 'failed before streaming' },
  { id: 'content', phrase: 'produced no content' },
  { id: 'dialect', phrase: 'produced no content' },
  { id: 'dropped', phrase: 'sent parts the encoder dropped' },
  { id: 'attachments', phrase: 'sent an attachment the model never saw' },
  { id: 'errorCode', phrase: 'reported an error' },
  { id: 'contentType', phrase: 'returned a non-stream content type' },
  { id: 'reasoning', phrase: 'were billed for thinking that never arrived' },
  { id: 'buffering', phrase: 'arrived buffered rather than streamed' },
  { id: 'gap', phrase: 'stalled mid-stream' },
];

const RANK = new Map(CATEGORIES.map((c, i) => [c.id, i]));

const group = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function duration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${group(ms)}ms`;
}

/**
 * The SHORT observation that follows the category. Deliberately not the
 * inspector's full sentence: the verdict line has to fit on one line and stay
 * readable at the largest type size on screen, and the long-form reasoning
 * belongs where someone has already decided to look.
 *
 * Every one of these is a measurement, never a suspicion. The hedged
 * interpretation lives in the inspector.
 */
function observation(id: string, s: StreamSummary): string {
  const partsTotal = Object.values(s.parts).reduce((a, b) => a + b, 0);
  const frames = s.frames ?? s.frameRows.length;

  switch (id) {
    case 'request':
      return `HTTP ${s.status}${s.errorCode !== undefined ? `, ${s.errorCode}` : ''}.`;
    case 'content':
    case 'dialect':
      return s.chunks === 0
        ? `${group(frames)} frames arrived, none parsed.`
        : `${group(s.chunks)} chunks parsed, no content among them.`;
    case 'dropped': {
      const d = s.dropped[0];
      return d ? `${group(d.count)} ${d.variant} parts were not encoded.` : 'Parts were not encoded.';
    }
    case 'attachments': {
      const a = s.request?.attachments.find((x) => x.disposition === 'skipped');
      return a ? `${a.mediaType ?? 'An attachment'} was not encoded.` : 'An attachment was not encoded.';
    }
    case 'errorCode':
      return `${s.errorCode}.`;
    case 'contentType':
      return `${s.contentType} where text/event-stream was expected.`;
    case 'reasoning':
      return `${group(s.usage?.reasoningTokens ?? 0)} reasoning tokens billed, no reasoning part arrived.`;
    case 'buffering': {
      const times = s.frameRows.map((f) => f.atMs).filter((t): t is number => t !== undefined);
      const span = times.length > 1 ? times[times.length - 1] - times[0] : 0;
      const tail = times.filter((t) => t >= times[0] + span * 0.8).length;
      return `${group(tail)} of ${group(times.length)} frames arrived in the final ${group(Math.round(span * 0.2))}ms.`;
    }
    default:
      return `${group(partsTotal)} parts produced.`;
  }
}

/** The finding that decides a call's headline: worst verdict, then worst
 *  category. `na` never counts -- it is the absence of a problem. */
function leadFinding(s: StreamSummary): Finding | undefined {
  const actionable = findingsFor(s).filter((f) => f.verdict === 'fail' || f.verdict === 'warn');
  if (actionable.length === 0) return undefined;
  return actionable.sort((a, b) => {
    if (a.verdict !== b.verdict) return a.verdict === 'fail' ? -1 : 1;
    return (RANK.get(a.id) ?? 99) - (RANK.get(b.id) ?? 99);
  })[0];
}

/** Does this call have anything worth a red marker? */
export function hasFinding(s: StreamSummary): boolean {
  return leadFinding(s) !== undefined;
}

export function verdictFor(streams: readonly StreamSummary[]): VerdictLine {
  if (streams.length === 0) {
    return { text: 'Recording. Trigger a request.', anomalous: false };
  }

  // Group the troubled calls by what is wrong with them, and lead with the
  // worst group. Several calls failing the same way is one finding, not N.
  const leads = new Map<string, StreamSummary[]>();
  for (const s of streams) {
    const lead = leadFinding(s);
    if (!lead) continue;
    const list = leads.get(lead.id);
    if (list) list.push(s);
    else leads.set(lead.id, [s]);
  }

  if (leads.size > 0) {
    const [id, affected] = [...leads.entries()].sort(
      (a, b) => (RANK.get(a[0]) ?? 99) - (RANK.get(b[0]) ?? 99),
    )[0];
    const phrase = CATEGORIES.find((c) => c.id === id)?.phrase ?? 'reported a finding';
    const calls = streams.length === 1 ? 'call' : 'calls';
    return {
      anomalous: true,
      text: `${group(affected.length)} of ${group(streams.length)} ${calls} ${phrase}. ${observation(id, affected[0])}`,
    };
  }

  // Healthy. A receipt, and every segment is omitted when nobody reported it --
  // "0 models" or "$0.0000" would each be a confident zero about something that
  // was simply never stated.
  const r = rollup(streams);
  const open = streams.filter((s) => streamStatus(s) === 'open').length;
  const segments = [`${group(streams.length)} model call${streams.length === 1 ? '' : 's'}`];
  if (r.models.length > 0) {
    segments.push(`${group(r.models.length)} model${r.models.length === 1 ? '' : 's'}`);
  }
  if (r.wallMs !== undefined) segments.push(duration(r.wallMs));
  if (r.costUsd !== undefined) segments.push(`$${r.costUsd.toFixed(4)}`);
  segments.push(open > 0 ? `${group(open)} in flight` : 'nothing anomalous');

  return { anomalous: false, text: segments.join(' · ') };
}
