// The <kai-devtools> element.
//
// METADATA ONLY. Everything rendered here is a count, a size, a duration, an id
// or a status code -- never a token of the conversation. That is not politeness,
// it is what makes the panel defensible on a live storefront: a stranger who
// activates it sees the SHAPE of a conversation, not its content.
//
// Shadow DOM with all CSS inline in this module, no external assets and no
// network requests of any kind. This is a panel, not a service.
import { foldStreams, type StreamSummary } from './streams';
import type { WireDiagnosticEvent } from './contract';

/** A UI retention decision, which the capture model explicitly allows: once
 *  attached, the panel owns retention. The kit stops buffering at that point,
 *  so this cap is the only one in play. */
const MAX_LOG_LINES = 200;

const CSS = `
:host {
  position: fixed; right: 12px; bottom: 12px; z-index: 2147483000;
  width: min(560px, calc(100vw - 24px));
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 12px; line-height: 1.45;
  color: #d6d9de;
  --bg: #16181c; --bg-2: #1d2025; --line: #2b2f36;
  --dim: #868d99; --red: #ff6b6b; --amber: #ffb454; --green: #7bd88f; --blue: #7aa2f7;
}
.wrap {
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,.45); overflow: hidden;
}
header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; background: var(--bg-2); border-bottom: 1px solid var(--line);
  cursor: pointer; user-select: none;
}
header .title { font-weight: 600; letter-spacing: .01em; }
header .meta { color: var(--dim); font-size: 11px; }
header .spacer { flex: 1; }
button.toggle {
  background: transparent; border: 1px solid var(--line); color: var(--dim);
  border-radius: 6px; padding: 2px 8px; font: inherit; font-size: 11px; cursor: pointer;
}
.body { max-height: 46vh; overflow: auto; }
:host([collapsed]) .body { display: none; }
.empty { padding: 14px 10px; color: var(--dim); }
.stream { padding: 8px 10px; border-bottom: 1px solid var(--line); }
.stream .top { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.id { color: var(--blue); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.fmt { color: var(--dim); }
.headline { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.headline.bad { color: var(--red); }
.row2 { margin-top: 3px; color: var(--dim); display: flex; gap: 10px; flex-wrap: wrap; }
.badge {
  border-radius: 5px; padding: 0 6px; border: 1px solid var(--line); color: var(--dim);
}
.badge.err { color: var(--red); border-color: var(--red); }
.badge.open { color: var(--amber); border-color: var(--amber); }
.badge.ok { color: var(--green); border-color: var(--green); }
.log {
  border-top: 1px solid var(--line); background: #101216;
  max-height: 26vh; overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
}
.log div { padding: 1px 10px; color: var(--dim); white-space: pre; }
.unknown { padding: 6px 10px; color: var(--amber); font-size: 11px; }
`;

const esc = (v: unknown): string =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Absent renders as an em dash, ALWAYS. Never substituted from anywhere else:
 *  a display that filled in a requested model id would lie in exactly the
 *  requested-vs-served mismatch the field exists to catch. */
const orDash = (v: unknown): string => (v === undefined || v === null || v === '' ? '—' : esc(v));

function partsText(parts: Record<string, number>): string {
  const keys = Object.keys(parts);
  if (keys.length === 0) return 'no parts';
  return keys.map((k) => `${k} ${parts[k]}`).join(', ');
}

/** `frames → chunks → parts`, the three numbers that separate a healthy stream
 *  from a wrong-dialect one at a glance. A dash where a count was never
 *  reported, because a confident zero there is the lie worth avoiding. */
function headline(s: StreamSummary): { text: string; bad: boolean } {
  const partsTotal = Object.values(s.parts).reduce((a, b) => a + b, 0);
  const frames = s.frames === undefined ? '—' : String(s.frames);
  const text = `${frames} frames → ${s.chunks} chunks → ${partsTotal} parts`;
  // Frames arrived and nothing came out: the signature this panel exists for.
  const bad = partsTotal === 0 && (s.frames ?? 0) > 0;
  return { text, bad };
}

function statusBadge(s: StreamSummary): string {
  if (s.status !== undefined) {
    return `<span class="badge err">HTTP ${esc(s.status)}${s.errorCode !== undefined ? ` · ${esc(s.errorCode)}` : ''}</span>`;
  }
  if (s.errorCode !== undefined) return `<span class="badge err">${esc(s.errorCode)}</span>`;
  // Opened, nothing terminal ever arrived. Not complete, and not an error we
  // were told about -- so it says exactly that.
  if (s.open) return '<span class="badge open">open</span>';
  if (s.finishReason) return `<span class="badge ok">${esc(s.finishReason)}</span>`;
  return '';
}

function renderStream(s: StreamSummary): string {
  const h = headline(s);
  const timings = [
    s.firstFrameMs !== undefined ? `first frame ${s.firstFrameMs}ms` : undefined,
    s.ms !== undefined ? `total ${s.ms}ms` : undefined,
  ].filter(Boolean);
  return `
    <div class="stream">
      <div class="top">
        <span class="id">${orDash(s.streamId)}</span>
        <span class="fmt">${orDash(s.format)}${s.source ? ` · ${esc(s.source)}` : ''}</span>
        <span class="headline${h.bad ? ' bad' : ''}">${esc(h.text)}</span>
        ${statusBadge(s)}
      </div>
      <div class="row2">
        <span>${esc(partsText(s.parts))}</span>
        <span>model ${orDash(s.model)}</span>
        ${timings.map((t) => `<span>${esc(t)}</span>`).join('')}
      </div>
    </div>`;
}

export class KaiDevtoolsElement extends HTMLElement {
  #events: WireDiagnosticEvent[] = [];
  #root: ShadowRoot;
  #t0: number | undefined;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = `<style>${CSS}</style><div class="wrap"></div>`;
    this.#root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('header')) return;
      this.toggleAttribute('collapsed');
      // Re-render immediately. The label is derived from the attribute, so
      // toggling alone left it one render behind -- and a collapsed panel's
      // ONLY control read "hide" until unrelated traffic happened to repair it.
      // A panel showing no events is exactly when nothing repairs it.
      this.render();
    });
  }

  connectedCallback(): void {
    this.render();
  }

  /** Feed one event. The panel keeps its own list because it owns retention
   *  once attached -- the kit has stopped buffering by then. */
  push(e: WireDiagnosticEvent): void {
    if (this.#t0 === undefined && typeof e?.t === 'number') this.#t0 = e.t;
    this.#events.push(e);
    this.render();
  }

  pushAll(events: readonly WireDiagnosticEvent[]): void {
    for (const e of events) {
      if (this.#t0 === undefined && typeof e?.t === 'number') this.#t0 = e.t;
      this.#events.push(e);
    }
    this.render();
  }

  render(): void {
    const wrap = this.#root.querySelector('.wrap');
    if (!wrap) return;
    const { streams, unknownTypes } = foldStreams(this.#events);
    const version = this.getAttribute('hook-version') ?? '?';
    const legacy = this.hasAttribute('legacy') ? ' · legacy hook' : '';

    const unknownNames = Object.keys(unknownTypes);
    const unknownLine =
      unknownNames.length > 0
        ? `<div class="unknown">${esc(
            unknownNames.map((n) => `${n} ×${unknownTypes[n]}`).join(', '),
          )} — event type(s) this panel does not render. Your kit reports more than this version knows.</div>`
        : '';

    const log = this.#events
      .slice(-MAX_LOG_LINES)
      .map((e) => {
        const dt = this.#t0 !== undefined && typeof e.t === 'number' ? e.t - this.#t0 : 0;
        return `<div>${esc(`+${dt}ms  ${e.type}  ${e.streamId ?? '—'}`)}</div>`;
      })
      .join('');

    wrap.innerHTML = `
      <header>
        <span class="title">kai devtools</span>
        <span class="meta">hook v${esc(version)}${legacy} · ${this.#events.length} events</span>
        <span class="spacer"></span>
        <button class="toggle" type="button">${this.hasAttribute('collapsed') ? 'show' : 'hide'}</button>
      </header>
      <div class="body">
        ${streams.length === 0 ? '<div class="empty">No streams recorded yet.</div>' : streams.map(renderStream).join('')}
        ${unknownLine}
        <div class="log">${log}</div>
      </div>`;
  }
}

export function defineKaiDevtools(): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get('kai-devtools')) {
    customElements.define('kai-devtools', KaiDevtoolsElement);
  }
}
