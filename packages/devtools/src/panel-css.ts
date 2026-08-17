// The panel's entire stylesheet, inline in the module.
//
// No external assets and no network of any kind: this loads by script tag onto
// pages we do not control, sometimes production ones, and a devtool that fetches
// is a devtool nobody is allowed to paste.
//
// PALETTE. Dark, and deliberately unlit -- it overlays a host app, so it reads
// as an instrument sitting on top of the page rather than a second product
// competing with it. The three status hues are the kit's own semantics; the
// indigo is for SELECTION ONLY and is deliberately outside the status range, so
// "this row is selected" can never be misread as "this row is a state".
export const PANEL_CSS = `
:host {
  --bg: #0f1115;
  --bg-2: #161920;
  --bg-3: #1c2027;
  --line: #262b34;
  --line-2: #313846;
  --fg: #d7dbe2;
  --dim: #7d8695;
  --faint: #565e6c;
  --ok: rgb(123, 216, 143);
  --err: rgb(255, 107, 107);
  --open: rgb(255, 180, 84);
  --sel: #6c8cff;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  position: fixed;
  inset: auto 0 0 auto;
  z-index: 2147483000;
  font-family: var(--sans);
  font-size: 12px;
  line-height: 1.45;
  color: var(--fg);
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
:focus-visible { outline: 2px solid var(--sel); outline-offset: 1px; }

/* ── Launcher ─────────────────────────────────────────────────────────── */
.launcher {
  position: fixed; right: 12px; bottom: 12px;
  display: inline-flex; align-items: center; gap: 7px;
  padding: 7px 11px;
  background: var(--bg-2); border: 1px solid var(--line-2); border-radius: 999px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .45);
  font-family: var(--mono); font-size: 11px; letter-spacing: .02em;
}
.launcher:hover { border-color: var(--sel); }
.launcher .brand { color: var(--fg); font-weight: 600; }
.launcher .count { color: var(--dim); }
.launcher .alert {
  width: 6px; height: 6px; border-radius: 50%; background: var(--err);
  box-shadow: 0 0 0 3px rgba(255, 107, 107, .18);
}

/* ── Drawer ───────────────────────────────────────────────────────────── */
.drawer {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column;
  background: var(--bg);
  border-top: 1px solid var(--line-2);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, .5);
}
.grip {
  height: 6px; margin-top: -3px; cursor: ns-resize; flex: none;
  background: transparent;
}
.grip:hover, .grip.dragging { background: var(--sel); opacity: .5; }

.bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 12px; background: var(--bg-2);
  border-bottom: 1px solid var(--line); flex: none;
}
.bar .title { font-weight: 600; letter-spacing: .01em; }
.bar .meta { font-family: var(--mono); font-size: 11px; color: var(--faint); }
.bar .spacer { flex: 1 1 auto; }

.pills { display: flex; gap: 4px; align-items: center; }
.pill {
  display: inline-flex; align-items: center; gap: 5px;
  height: 24px; padding: 0 9px; border-radius: 999px;
  border: 1px solid var(--line-2); background: transparent;
  font-family: var(--mono); font-size: 11px; color: var(--dim);
}
.pill:hover { border-color: var(--faint); color: var(--fg); }
.pill[aria-pressed="true"] { background: var(--bg-3); color: var(--fg); border-color: var(--faint); }
.pill .n { color: var(--faint); }
.pill[aria-pressed="true"] .n { color: var(--fg); }
.pill .dot { width: 6px; height: 6px; border-radius: 50%; }
.pill.ok .dot { background: var(--ok); }
.pill.empty .dot { background: var(--err); }
.pill.failed .dot { background: var(--err); }
.pill.open .dot { background: var(--open); }

.search {
  width: 190px; max-width: 42vw;
  padding: 4px 8px; border-radius: 6px;
  background: var(--bg); border: 1px solid var(--line-2); color: var(--fg);
  font-family: var(--mono); font-size: 11px;
}
.search::placeholder { color: var(--faint); }
.search:focus { border-color: var(--sel); outline: none; }

.act {
  padding: 3px 8px; border-radius: 6px; border: 1px solid var(--line-2);
  color: var(--dim); font-size: 11px;
}
.act:hover { color: var(--fg); border-color: var(--faint); }

/* ── Split ────────────────────────────────────────────────────────────── */
.split { display: flex; flex: 1 1 auto; min-height: 0; }
.list {
  width: 34%; min-width: 240px; flex: none;
  overflow-y: auto; border-right: 1px solid var(--line);
}
.list:focus { outline: none; box-shadow: inset 2px 0 0 var(--sel); }
.inspector { flex: 1 1 auto; overflow-y: auto; min-width: 0; }

/* ── Stream rows ──────────────────────────────────────────────────────── */
/* Flex, not grid: the second line spans the full width and the duration pins
   right, which is two rules here and three fragile auto-placements in grid. */
.row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px;
  padding: 7px 10px 7px 8px;
  border-bottom: 1px solid var(--line);
  border-left: 2px solid transparent;
  cursor: pointer;
}
.row:hover { background: var(--bg-2); }
.row[aria-selected="true"] { background: var(--bg-3); border-left-color: var(--sel); }
.row .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.row.ok .dot { background: var(--ok); }
.row.empty .dot, .row.failed .dot { background: var(--err); }
.row.open .dot { background: var(--open); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .row.open .dot { animation: none; } }
.row .id { font-family: var(--mono); color: var(--fg); }
.row .dur { font-family: var(--mono); color: var(--faint); font-size: 11px; margin-left: auto; }
/* Full-width second line, indented past the status dot so the two lines read
   as one block rather than a table. */
.row .sub {
  flex: 1 0 100%; display: flex; gap: 8px; align-items: baseline;
  padding-left: 15px; min-width: 0;
}
.row .fmt {
  color: var(--dim); font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ── The funnel: frames → chunks → parts ──────────────────────────────── */
/* The arrow IS the diagnosis. Each one is a transformation, and a stream fails
   by collapsing across one of them, so the arrow goes red rather than the
   numbers beside it. */
.funnel { font-family: var(--mono); font-size: 11px; white-space: nowrap; }
.funnel .n { color: var(--fg); }
.funnel .n.zero { color: var(--faint); }
.funnel .arrow { color: var(--faint); padding: 0 2px; }
.funnel .arrow.collapse { color: var(--err); font-weight: 700; }

/* ── Inspector ────────────────────────────────────────────────────────── */
.sec { border-bottom: 1px solid var(--line); }
.sec-h {
  padding: 7px 12px; background: var(--bg-2);
  font-size: 10px; letter-spacing: .09em; text-transform: uppercase; color: var(--dim);
  position: sticky; top: 0; z-index: 1;
}
.sec-b { padding: 10px 12px; }

.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px 16px;
}
.kv { min-width: 0; }
.kv .k { color: var(--faint); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
.kv .v {
  font-family: var(--mono); color: var(--fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.kv .v.absent { color: var(--faint); }
.kv .v.err { color: var(--err); }
.kv .v.ok { color: var(--ok); }

table { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 11px; }
th {
  text-align: left; font-weight: 500; color: var(--faint);
  padding: 5px 10px; border-bottom: 1px solid var(--line);
  font-size: 10px; letter-spacing: .06em; text-transform: uppercase;
  position: sticky; top: 27px; background: var(--bg);
}
td { padding: 4px 10px; border-bottom: 1px solid var(--bg-3); vertical-align: top; }
tr:hover td { background: var(--bg-2); }
td.num { text-align: right; color: var(--dim); white-space: nowrap; }
td.num b { color: var(--fg); font-weight: 500; }
td.zero { color: var(--faint); }

/* Field chips. FILLED = a content key, HOLLOW = metadata. A frames table that
   is entirely hollow is the wrong-dialect signature, readable as texture before
   a single word has been read. */
.chips { display: flex; flex-wrap: wrap; gap: 3px; }
.chip {
  padding: 0 5px; border-radius: 4px; font-size: 10px; line-height: 16px;
  border: 1px solid var(--line-2); color: var(--faint);
}
.chip.content { background: rgba(108, 140, 255, .16); border-color: rgba(108, 140, 255, .45); color: #b9c8ff; }
.chip.none { border-style: dashed; color: var(--err); border-color: rgba(255, 107, 107, .5); }

.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag {
  font-family: var(--mono); font-size: 11px; padding: 1px 7px;
  border: 1px solid var(--line-2); border-radius: 999px; color: var(--dim);
}
.tag b { color: var(--fg); font-weight: 500; }

.capped {
  padding: 5px 12px; color: var(--faint); font-size: 10px;
  font-family: var(--mono); border-bottom: 1px solid var(--line);
}
.raw { font-family: var(--mono); font-size: 11px; }
.raw div { padding: 1px 12px; color: var(--dim); white-space: pre; }
.raw div:nth-child(odd) { background: rgba(255, 255, 255, .015); }

.empty {
  padding: 28px 16px; text-align: center; color: var(--faint);
}
.empty .lead { color: var(--dim); margin-bottom: 3px; }
.unknown { padding: 7px 12px; color: var(--open); font-size: 11px; border-top: 1px solid var(--line); }

/* ── Narrow ───────────────────────────────────────────────────────────── */
/* Side by side stops being legible well before phone width: the inspector's
   tables need room the 34% list is stealing. Stack instead, list on top, both
   panes keeping their own scroll. */
@media (max-width: 720px) {
  .split { flex-direction: column; }
  .list {
    /* A min-height as well as a max: at 42vh on a phone the percentage alone
       left room for a single row, which is a list you cannot navigate. */
    width: auto; min-width: 0; max-height: 45%; min-height: 104px;
    border-right: none; border-bottom: 1px solid var(--line-2);
  }
  /* The header was eating half the drawer once it wrapped to four rows. Drop
     the least useful line (the hook/event meta, which the inspector repeats in
     substance), collapse the spacer so items flow instead of being pushed to
     opposite ends, and let the search have the last row to itself. */
  .bar { gap: 6px; padding: 7px 9px; }
  .bar .meta { display: none; }
  .bar .spacer { display: none; }
  .pills { order: 5; }
  .search { width: 100%; max-width: none; order: 9; }
  .act { order: 2; }
  .grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
}
`;
