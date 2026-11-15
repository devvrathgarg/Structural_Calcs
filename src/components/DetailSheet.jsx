import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* =====================================================================
   Typical-detail sheets in the CivilSpace drafting style — the rules of
   framing_plans/draw/kit.py (and draw/schedstyle.py for bar dots):
     • A1 841 × 594, frame 20 left / 10 elsewhere, 185 mm notes + title strip on the right
     • Arial, 2.5 mm text (DXF height = cap height), view titles 3.5 mm underlined + "SCALE 1:n"
     • layer colours / lineweights as kit.LAYERS; CS-HIDDEN and CS-CENTRE dash patterns
     • oblique-tick dimensions (dimtsz 1.2, dimexo 1.0, dimexe 1.5, dimgap 0.8, text above, 0 dp)
     • leaders ≤ 25 mm ending in a 0.5 mm dot; bars in section as fixed-size dots
   Everything here is in PAPER mm. Output: one A1 page per sheet; the browser's
   "Save as PDF" gives the file at true A1 size.
   ponytail: label positions are fixed per drawing (no collision search like kit.View.label);
   add one if details start to crowd.
   ===================================================================== */

export const W = 841, H = 594;
export const FRAME = { x0: 20, y0: 10, x1: W - 10, y1: H - 10 };
export const STRIP = FRAME.x1 - 185;            // strip's left edge (656 on A1)
export const TXT = 2.5, CAP = 0.716;            // text height = cap height; font-size = h / CAP
const FONT = "Arial, Helvetica, sans-serif";
// kit.LAYERS: colour (ACI 7 black, 1 red, 4 cyan, 6 magenta, 8 grey) and lineweight in mm
export const L = {
  CONC: { s: "#000", w: 0.5 }, HID: { s: "#000", w: 0.25, d: "3 1.5" }, EDGE: { s: "#000", w: 0.25 },
  HATCH: { s: "#808080", w: 0.09 }, GRID: { s: "#808080", w: 0.18, d: "12 2.5 1 2.5" },
  BAR: { s: "#FF0000", w: 0.35 }, LINK: { s: "#00FF00", w: 0.25 }, DIM: { s: "#00FFFF", w: 0.18 },
  TEXT: { s: "#000", w: 0.25 }, LEADER: { s: "#000", w: 0.18 }, BORDER: { s: "#000", w: 0.7 },
  TITLE: { s: "#000", w: 0.35 }, CHECK: { s: "#FF00FF", w: 0.5 }, SLAB: { s: "#000", w: 0.35 },
};
const st = (k, extra = {}) => ({ stroke: L[k].s, strokeWidth: L[k].w, strokeDasharray: L[k].d, fill: "none", ...extra });

let _ctx;
export function textWidth(s, h = TXT) {
  _ctx = _ctx || document.createElement("canvas").getContext("2d");
  _ctx.font = `${h / CAP}px ${FONT}`;
  return _ctx.measureText(String(s)).width;
}

/* ---- primitives (paper mm) ---- */
export const Ln = ({ a, b, k = "CONC" }) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...st(k)} />;
export const Poly = ({ p, k = "CONC", closed, fill }) => React.createElement(closed ? "polygon" : "polyline", { points: p.map((q) => q.join(",")).join(" "), ...st(k, fill ? { fill } : {}) });
export const Rect = ({ x, y, w, h, k = "CONC", fill }) => <rect x={x} y={y} width={w} height={h} {...st(k, fill ? { fill } : {})} />;
/** text: (x, y) = baseline anchor; a = start | middle | end */
export const Tx = ({ x, y, h = TXT, a = "start", k = "TEXT", rot, children }) => (
  <text x={x} y={y} fontSize={h / CAP} textAnchor={a} fill={L[k].s} fontFamily={FONT} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>{children}</text>
);
/** fixed-size bar dot (schedstyle: bars as fixed-size dots) */
export const Dot = ({ c, r = 0.6 }) => <circle cx={c[0]} cy={c[1]} r={r} fill={L.BAR.s} />;
/** leader label: text at `at`, leader to `to` ending in a 0.5 mm dot (kit) */
export function Leader({ to, at, text, a = "start" }) {
  const tw = textWidth(text), x0 = a === "start" ? at[0] : a === "end" ? at[0] - tw : at[0] - tw / 2;
  const end = [Math.min(Math.max(to[0], x0), x0 + tw) === to[0] ? to[0] : (to[0] < x0 ? x0 - 0.8 : x0 + tw + 0.8), at[1] - TXT / 2];
  return <g><Ln a={to} b={end} k="LEADER" /><circle cx={to[0]} cy={to[1]} r={0.5} fill="#000" /><Tx x={at[0]} y={at[1]} a={a}>{text}</Tx></g>;
}
/** linear dimension with oblique ticks. p1, p2 = measured points; off = signed offset of the dim line (paper mm,
 *  + = down for horizontal, + = right for vertical); text = figure. */
export function Dim({ p1, p2, off, text, vertical }) {
  const exo = 1.0, exe = 1.5, gap = 0.8, t = 0.85;
  if (!vertical) {
    const y = p1[1] + off, s = Math.sign(off) || 1, xa = Math.min(p1[0], p2[0]), xb = Math.max(p1[0], p2[0]);
    const tw = textWidth(text), fits = xb - xa >= tw + 3;
    return <g {...st("DIM")}>
      <line x1={p1[0]} y1={p1[1] + s * exo} x2={p1[0]} y2={y + s * exe} /><line x1={p2[0]} y1={p2[1] + s * exo} x2={p2[0]} y2={y + s * exe} />
      <line x1={xa} y1={y} x2={fits ? xb : xb + tw + 2} y2={y} />
      {[xa, xb].map((x, i) => <line key={i} x1={x - t} y1={y + t} x2={x + t} y2={y - t} strokeWidth={0.35} />)}
      <Tx x={fits ? (xa + xb) / 2 : xb + 1 + tw / 2} y={y - gap} a="middle">{text}</Tx>
    </g>;
  }
  const x = p1[0] + off, s = Math.sign(off) || 1, ya = Math.min(p1[1], p2[1]), yb = Math.max(p1[1], p2[1]);
  const tw = textWidth(text), fits = yb - ya >= tw + 3;
  return <g {...st("DIM")}>
    <line x1={p1[0] + s * exo} y1={p1[1]} x2={x + s * exe} y2={p1[1]} /><line x1={p2[0] + s * exo} y1={p2[1]} x2={x + s * exe} y2={p2[1]} />
    <line x1={x} y1={fits ? ya : ya - tw - 2} x2={x} y2={yb} />
    {[ya, yb].map((y, i) => <line key={i} x1={x - t} y1={y + t} x2={x + t} y2={y - t} strokeWidth={0.35} />)}
    <Tx x={x - gap} y={fits ? (ya + yb) / 2 : ya - 1 - tw / 2} a="middle" rot={-90}>{text}</Tx>
  </g>;
}
/** view title (kit View._place): 3.5 mm, underlined, "SCALE 1:n" below; (x, y) = centre of the underline */
export const ViewTitle = ({ x, y, title, scale }) => (
  <g><Tx x={x} y={y - 1} h={3.5} a="middle">{title}</Tx><Ln a={[x - textWidth(title, 3.5) / 2, y]} b={[x + textWidth(title, 3.5) / 2, y]} k="TITLE" />
    <Tx x={x} y={y + 1 + TXT} a="middle">{scale ? `SCALE 1:${scale}` : "NOT TO SCALE"}</Tx></g>
);
/** section cut marker: filled triangle pointing in the view direction + letter (3.5 mm) */
export const Cut = ({ c, dir, letter }) => {
  const [x, y] = c, s = 2.6, tri = { down: [[x - s, y], [x + s, y], [x, y + s * 1.3]], up: [[x - s, y], [x + s, y], [x, y - s * 1.3]], right: [[x, y - s], [x, y + s], [x + s * 1.3, y]], left: [[x, y - s], [x, y + s], [x - s * 1.3, y]] }[dir];
  const tp = { down: [x, y - 1.5], up: [x, y + 5], right: [x - 1.5, y + 1.3], left: [x + 1.5, y + 1.3] }[dir];
  return <g><polygon points={tri.map((q) => q.join(",")).join(" ")} fill="#000" /><Tx x={tp[0]} y={tp[1]} h={3.5} a={dir === "right" ? "end" : dir === "left" ? "start" : "middle"}>{letter}</Tx></g>;
};
/** first scale of the ladder at which (w, h) model mm fits (bw, bh) paper mm */
export const fitScale = (w, h, bw, bh, ladder = [10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200]) => ladder.find((s) => w / s <= bw && h / s <= bh) || ladder[ladder.length - 1];

function wrap(s, width, h = TXT) {
  const out = []; let line = "";
  for (const w of String(s).split(/\s+/)) { const t = (line + " " + w).trim(); if (line && textWidth(t, h) > width) { out.push(line); line = w; } else line = t; }
  return line ? [...out, line] : out;
}

/** frame, strip with NOTES, status and title block — kit.Sheet._title_block (rows measured from the bottom frame line) */
function SheetFrame({ title, drgNo, project, scales, notes, rev = "P0", status = "PRELIMINARY - NOT FOR CONSTRUCTION" }) {
  const { x0, y0, x1, y1 } = FRAME, Y = (y) => H - y, tx = STRIP + 3;
  const rows = [[y0, 26, "DRAWING No.", drgNo, 5.0], [26, 38, "REVISION", rev, 3.5], [38, 50, "SHEET / SCALE", `A1  ${scales}`, 3.5],
    [50, 62, "DATE", new Date().toISOString().slice(0, 10), 3.5], [62, 74, "DRAWN / CHECKED", "CIVILSPACE / ________", 3.0],
    [74, 100, "DRAWING TITLE", title, 4.5], [100, 116, "PROJECT", project || "—", 3.5]];
  let y = 8; const noteEls = [<Tx key="h" x={tx} y={y0 + y} h={3.5}>NOTES</Tx>];
  notes.forEach((n, i) => { y += 6; wrap(`${i + 1}. ${n}`, x1 - 3 - STRIP - 8).forEach((ln, k) => { if (k) y += 4; noteEls.push(<Tx key={i + "." + k} x={tx + (k ? 4 : 0)} y={y0 + y}>{ln}</Tx>); }); });
  return (
    <g>
      <Rect x={x0} y={y0} w={x1 - x0} h={y1 - y0} k="BORDER" />
      <Ln a={[STRIP, y0]} b={[STRIP, y1]} k="BORDER" />
      {noteEls}
      <Tx x={tx} y={Y(120)} h={3.0} k="CHECK">{status}</Tx>
      {rows.map(([a, b, lab, val, h]) => (
        <g key={lab}><Ln a={[STRIP, Y(b)]} b={[x1, Y(b)]} k="TITLE" /><Tx x={tx} y={Y(b - 3.5)}>{lab}</Tx>
          {wrap(val, x1 - tx - 3, h).slice(0, 2).map((ln, i, arr) => <Tx key={i} x={tx} y={Y(a + 2.5) - (arr.length - 1 - i) * (h + 1.5)} h={h}>{ln}</Tx>)}</g>
      ))}
    </g>
  );
}

/** sheets: [{ title, drgNo, scales, notes: [], body: <g> in paper mm inside the drawing area }] */
export function printDetails({ project, sheets }) {
  const pages = sheets.map((s) => `<section class="sheet">${renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={`${W}mm`} height={`${H}mm`} strokeLinecap="round" strokeLinejoin="round">
      <rect width={W} height={H} fill="#fff" />
      <SheetFrame project={project} {...s} />
      {s.body}
    </svg>)}</section>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${(sheets[0]?.drgNo || "details")}${project ? " - " + String(project).replace(/[<>&"]/g, "") : ""}</title>
<style>@page { size: ${W}mm ${H}mm; margin: 0; } html, body { margin: 0; background: #fff; }
.sheet { width: ${W}mm; height: ${H}mm; page-break-after: always; overflow: hidden; } .sheet:last-child { page-break-after: auto; } svg { display: block; }
@media screen { body { background: #777; } .sheet { margin: 10px auto; box-shadow: 0 2px 10px #0006; } }</style></head><body>${pages}</body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups for this site to download the details."); return; }
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 500);
}
