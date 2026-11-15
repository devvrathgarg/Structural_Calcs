import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { C, UI, MONO, SERIF, fmt } from "../theme.js";
import { Field, FormSec, FormulaLedger, useKaTeX, ThemeToggle, VerdictBadge, countBlank, blankMsg } from "../components/ui.jsx";
import Feedback from "../components/Feedback.jsx";

/* =====================================================================
   ONE-WAY SLAB DESIGN
   Reproduces "ONE WAY SLAB_HDFC(LG)" exactly (Reynolds Ch.33 coefficients),
   then adds the one agreed extension: Ast -> bar Ø @ spacing.

   Per-panel chain (from the sheet):
     F  = D/1000·γc + E/1000·γf + w0            permanent, unfactored
     wp = 1.5·F                                 factored permanent  (col I)
     wt = 1.5·L + Ftender                       factored temporary  (col J)
     d  = D − 25
     M⁻ = α⁻DL·wp·B² + α⁻LL·wt·B²               support (top) moment (col K)
     M⁺ = α⁺DL·wp·B² + α⁺LL·wt·B²               mid   (bottom) moment (col O)
     Mu/bd² = M·10⁶ / (1000·d²)
     pt = max( fck/(2·fy)·(1−√(1−4.598·Mu/bd²/fck))·100 , 0.12 )   [fy=550 in sheet]
     Ast = pt/100·b·d           (b = 1000 mm)   → sheet shows cm²/m (Ast/100)
   Added:  S = (π/4)φ²·1000 / Ast, rounded to the firm's 25 mm convention.
   ===================================================================== */

const COEF = {
  edge:     { label: "Edge panel",     topDL: 0.105, topLL: 0.12,  midDL: 0.078, midLL: 0.1  },
  internal: { label: "Internal panel", topDL: 0.079, topLL: 0.111, midDL: 0.046, midLL: 0.086 },
};

function computeOneWay(p, g) {
  const { type, B, D: Th, fck, E, live, fire, dia } = p;
  const { fy, gammaC, gammaFill, addDL, lfDL, lfLL, cover, minPct } = g;

  const nb = countBlank(p, ["B", "D", "fck", "E", "live", "fire", "dia"]) + countBlank(g, ["fy", "gammaC", "gammaFill", "addDL", "lfDL", "lfLL", "cover", "minPct"]);
  if (nb) return { incomplete: true, missing: blankMsg(nb) };
  const missing = [];
  if (!(B > 0)) missing.push("span");
  if (!(Th > 0)) missing.push("thickness");
  if (!(fck > 0)) missing.push("grade");
  if (missing.length) return { incomplete: true, missing };

  const co = COEF[type];
  const F = (Th / 1000) * gammaC + (E / 1000) * gammaFill + addDL; // permanent unfactored
  const wp = F * lfDL;                                             // factored permanent
  const wt = live * lfLL + fire;                                   // factored temporary
  const d = Th - cover;

  const topM = co.topDL * wp * B * B + co.topLL * wt * B * B;      // support (top)
  const midM = co.midDL * wp * B * B + co.midLL * wt * B * B;      // mid (bottom)

  const bd2 = (m) => (m * 1e6) / (1000 * d * d);
  const ptOf = (mbd2) => {
    const disc = 1 - (4.598 * mbd2) / fck;
    if (disc < 0) return NaN;                                      // section inadequate
    return Math.max((fck / (2 * fy)) * (1 - Math.sqrt(disc)) * 100, minPct);
  };
  const topBd2 = bd2(topM), midBd2 = bd2(midM);
  const ptTop = ptOf(topBd2), ptMid = ptOf(midBd2);

  const astOf = (pt) => (Number.isNaN(pt) ? NaN : (pt / 100) * 1000 * d); // mm²/m
  const AstTop = astOf(ptTop), AstMid = astOf(ptMid);

  const Abar = (Math.PI / 4) * dia * dia;
  const spOf = (A) => {
    if (!(A > 0) || Number.isNaN(A) || !(dia > 0)) return null;
    const s = (Abar * 1000) / A, cap = 3 * d;
    if (s > cap) return Math.floor(cap / 25) * 25;
    return s % 25 > 5 ? Math.floor(s / 25) * 25 : (Math.floor(s / 25) - 1) * 25;
  };
  const sTop = spOf(AstTop), sMid = spOf(AstMid);

  const inadequate = Number.isNaN(ptTop) || Number.isNaN(ptMid);
  return { co, F, wp, wt, d, topM, midM, topBd2, midBd2, ptTop, ptMid, AstTop, AstMid, sTop, sMid, Abar, inadequate };
}

/* ---- longitudinal section diagram ---- */
function SlabSection({ p, res }) {
  const type = p.type;
  const w = 460, h = 190, mx = 54, top = 46, th = 34;
  const spanW = w - mx * 2;
  const continuous = { left: type === "internal", right: true }; // edge: right continuous, left simple
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ display: "block" }}>
      {/* slab band */}
      <rect x={mx} y={top} width={spanW} height={th} rx={2} fill={C.surf2} stroke={C.teal} strokeWidth="1.6" />
      {/* supports */}
      {[mx, w - mx].map((cx, i) => (
        <g key={i}>
          <rect x={cx - 12} y={top + th} width={24} height={26} fill={C.surf2} stroke={C.ink2} strokeWidth="1" />
          <path d={`M${cx - 12} ${top + th + 26} l24 0`} stroke={C.ink2} strokeWidth="1" />
          {[0, 1, 2, 3].map((k) => (
            <line key={k} x1={cx - 12 + k * 7} y1={top + th + 26} x2={cx - 16 + k * 7} y2={top + th + 33} stroke={C.ink2} strokeWidth="0.8" />
          ))}
        </g>
      ))}
      {/* bottom (mid-span) steel */}
      <line x1={mx + 14} y1={top + th - 6} x2={w - mx - 14} y2={top + th - 6} stroke={C.brass} strokeWidth="2.4" />
      <text x={w / 2} y={top + th + 20} textAnchor="middle" style={{ font: `600 11px ${MONO}`, fill: C.brass }}>
        bottom steel {res && !res.incomplete && res.sTop != null ? `Ø${p.dia}@${res.sMid ?? "—"}` : ""}
      </text>
      {/* top (support) steel — over continuous supports */}
      {[["left", mx, continuous.left], ["right", w - mx, continuous.right]].map(([side, cx, cont]) =>
        cont ? (
          <line key={side} x1={cx - spanW * 0.22} y1={top + 6} x2={cx + spanW * 0.22} y2={top + 6} stroke={C.red} strokeWidth="2.4" />
        ) : null
      )}
      <text x={mx + spanW * 0.24} y={top - 6} textAnchor="middle" style={{ font: `600 11px ${MONO}`, fill: C.red }}>
        top steel {res && !res.incomplete && res.sTop != null ? `Ø${p.dia}@${res.sTop}` : ""}
      </text>
      {/* dims */}
      <line x1={mx} y1={h - 22} x2={w - mx} y2={h - 22} stroke={C.inkDim} strokeWidth="1" markerStart="url(#a)" markerEnd="url(#a)" />
      <text x={w / 2} y={h - 8} textAnchor="middle" style={{ font: `600 11px ${MONO}`, fill: C.ink2 }}>L = {p.B || "—"} m</text>
      <text x={w - mx + 16} y={top + th / 2 + 4} style={{ font: `600 11px ${MONO}`, fill: C.ink2 }}>D {p.D || "—"}</text>
      <defs>
        <marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M1 4h6M4 1l3 3-3 3" stroke={C.inkDim} strokeWidth="1" fill="none" /></marker>
      </defs>
    </svg>
  );
}

function buildFormulas(p, r, g) {
  if (r.incomplete) return [];
  const d2 = (v) => fmt(v, 2), d3 = (v) => fmt(v, 3), d0 = (v) => fmt(v, 0);
  const co = r.co;
  const F = [];
  const d4 = (v) => fmt(v, 4);
  F.push({ label: "Permanent load", sym: "w = \\gamma_c\\tfrac{D}{1000} + \\gamma_f\\tfrac{E}{1000} + w_0", sub: `${g.gammaC}\\cdot${p.D}/1000 + ${g.gammaFill}\\cdot${p.E}/1000 + ${g.addDL}`, val: `${d3(r.F)} kN/m²`, cl: "Reynolds Ch.33" });
  F.push({ label: "Factored permanent load", sym: "w_p = 1.5\\,w", sub: `1.5 \\times ${d3(r.F)}`, val: `${d3(r.wp)} kN/m²`, cl: "IS 456 T18" });
  F.push({ label: "Factored temporary load", sym: "w_t = 1.5\\,L + F_{fire}", sub: `1.5\\times${p.live} + ${p.fire}`, val: `${d3(r.wt)} kN/m²`, cl: "IS 456 T18" });
  F.push({ label: "Effective depth", sym: "d = D - 25", sub: `${p.D} - ${g.cover}`, val: `${d0(r.d)} mm`, cl: "cover to c/c" });
  F.push({ label: "Support moment (top)", sym: "M^- = \\alpha^-_{DL}w_pB^2 + \\alpha^-_{LL}w_tB^2", sub: `${co.topDL}\\cdot${d3(r.wp)}\\cdot${p.B}^2 + ${co.topLL}\\cdot${d3(r.wt)}\\cdot${p.B}^2`, val: `${d3(r.topM)} kN·m/m`, cl: co.label });
  F.push({ label: "Span moment (bottom)", sym: "M^+ = \\alpha^+_{DL}w_pB^2 + \\alpha^+_{LL}w_tB^2", sub: `${co.midDL}\\cdot${d3(r.wp)}\\cdot${p.B}^2 + ${co.midLL}\\cdot${d3(r.wt)}\\cdot${p.B}^2`, val: `${d3(r.midM)} kN·m/m`, cl: co.label });
  F.push({ label: "Moment factor (top)", sym: "\\dfrac{M^-\\cdot10^6}{1000\\,d^2}", sub: `${d3(r.topM)}\\times10^6/(1000\\cdot${d0(r.d)}^2)`, val: `${d4(r.topBd2)} N/mm²`, cl: "SP 16" });
  F.push({ label: "Moment factor (bottom)", sym: "\\dfrac{M^+\\cdot10^6}{1000\\,d^2}", sub: `${d3(r.midM)}\\times10^6/(1000\\cdot${d0(r.d)}^2)`, val: `${d4(r.midBd2)} N/mm²`, cl: "SP 16" });
  F.push({ label: "Steel percentage (top)", sym: "p_t = \\max\\!\\Big(\\tfrac{f_{ck}}{2f_y}\\big(1-\\sqrt{1-\\tfrac{4.598\\,M_u}{f_{ck}bd^2}}\\big)100,\\;${g.minPct}\\Big)", sub: `f_{ck}=${p.fck},\\ f_y=${g.fy}`, val: `${Number.isNaN(r.ptTop) ? "—" : d4(r.ptTop)} %`, cl: "SP 16" });
  F.push({ label: "Steel area (top)", sym: "A_{st} = \\tfrac{p_t}{100}\\,b\\,d", sub: `\\tfrac{${Number.isNaN(r.ptTop) ? "—" : d4(r.ptTop)}}{100}\\cdot1000\\cdot${d0(r.d)}`, val: `${Number.isNaN(r.AstTop) ? "—" : fmt(r.AstTop, 1)} mm²/m`, cl: "= " + (Number.isNaN(r.AstTop) ? "—" : fmt(r.AstTop / 100, 3)) + " cm²/m" });
  F.push({ label: "Steel percentage (bottom)", sym: "p_t^+", sub: `f_{ck}=${p.fck},\\ f_y=${g.fy}`, val: `${Number.isNaN(r.ptMid) ? "—" : d4(r.ptMid)} \\%`, cl: "SP 16" });
  F.push({ label: "Steel area (bottom)", sym: "A_{st}^+ = \\tfrac{p_t^+}{100}\\,b\\,d", sub: `p_t^+=${Number.isNaN(r.ptMid) ? "—" : d4(r.ptMid)}\\%`, val: `${Number.isNaN(r.AstMid) ? "—" : fmt(r.AstMid, 1)} mm²/m`, cl: "= " + (Number.isNaN(r.AstMid) ? "—" : fmt(r.AstMid / 100, 3)) + " cm²/m" });
  if (r.sTop != null || r.sMid != null)
    F.push({ label: "Bar spacing", sym: "S = \\dfrac{(\\pi/4)\\phi^2\\cdot1000}{A_{st}}", sub: `\\phi=${p.dia}\\,mm`, val: `top ${r.sTop ?? "—"} · bot ${r.sMid ?? "—"} mm c/c`, cl: "derived" });
  return F;
}

const DEF_PANEL = { type: "edge", B: null, D: null, fck: 25, E: null, live: null, fire: null, dia: null };

export default function OneWaySlab({ onBack }) {
  const [g, setG] = useState({ fy: 550, gammaC: 25, gammaFill: 20, addDL: 0.132, lfDL: 1.5, lfLL: 1.5, cover: 25, minPct: 0.12 });
  const [panels, setPanels] = useState([]);
  const [selId, setSelId] = useState(null);
  const [project, setProject] = useState("");
  const [showWork, setShowWork] = useState(false);
  const [showAssume, setShowAssume] = useState(false);
  const kReady = useKaTeX();
  const nextId = useRef(1);

  const results = useMemo(() => { const o = {}; for (const p of panels) o[p.id] = computeOneWay(p, g); return o; }, [panels, g]);
  const sel = panels.find((p) => p.id === selId) || null;
  const R = sel ? results[sel.id] : null;
  const doneN = panels.filter((p) => !results[p.id].incomplete).length;

  const upd = (id, k, v) => setPanels((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  const add = () => { const id = nextId.current++; setPanels((ps) => [...ps, { id, name: "S" + id, ...DEF_PANEL }]); setSelId(id); setShowWork(false); };
  const del = (id) => { setPanels((ps) => ps.filter((p) => p.id !== id)); if (selId === id) setSelId((panels.find((p) => p.id !== id) || {}).id ?? null); };

  const exportXlsx = () => {
    const head = ["Panel", "Type", "Span(m)", "D(mm)", "fck", "Fill(mm)", "LL", "Fire", "wp", "wt", "d", "M-(kNm)", "M+(kNm)", "Mu/bd2 top", "pt top%", "Ast top(mm2/m)", "Ast bot(mm2/m)", "S top", "S bot"];
    const rows = panels.map((p) => {
      const r = results[p.id];
      if (r.incomplete) return [p.name, p.type, p.B, p.D, p.fck, p.E, p.live, p.fire, "", "", "", "", "", "", "", "", "", "", ""];
      const nn = (v) => (v == null ? "" : Number.isNaN(v) ? "INADEQ" : +v.toFixed(v < 10 ? 3 : 1));
      return [p.name, r.co.label, p.B, p.D, p.fck, p.E, p.live, p.fire, nn(r.wp), nn(r.wt), nn(r.d), nn(r.topM), nn(r.midM), nn(r.topBd2), nn(r.ptTop), nn(r.AstTop), nn(r.AstMid), r.sTop ?? "", r.sMid ?? ""];
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["CivilSpace — One-Way Slab Design (Reynolds Ch.33 / IS 456)"], ["Project", project], ["fy", g.fy, "γc", g.gammaC, "γfill", g.gammaFill, "w0", g.addDL], [], head, ...rows]), "Design");
    XLSX.writeFile(wb, "civilspace_one_way_slab.xlsx");
  };

  const F = sel && R ? buildFormulas(sel, R, g) : [];
  const gField = (k, v) => setG({ ...g, [k]: v });

  return (
    <div className="min-h-screen cs-bp" style={{ color: C.ink, fontFamily: UI }}>
      {/* header */}
      <header className="px-4 pt-4 mx-auto" style={{ maxWidth: 1320 }}>
        <div className="cs-card flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
          {onBack && (
            <button onClick={onBack} className="cs-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.surf, color: C.ink2, font: `600 13px ${UI}` }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M12 8H4M7.5 4.5L4 8l3.5 3.5" stroke={C.ink2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              All
            </button>
          )}
          <div>
            <div style={{ font: `400 21px ${SERIF}`, letterSpacing: "-0.01em", color: C.ink }}>One-way Slab Design</div>
            <div style={{ font: `400 12px ${UI}`, color: C.inkDim }}>REYNOLDS Ch.33 · IS 456:2000</div>
          </div>
          <div className="flex items-center gap-2 ml-2 px-3 py-1.5 rounded-lg" style={{ background: C.surf2, border: `1px solid ${C.line}` }}>
            <span style={{ font: `500 12px ${UI}`, color: C.inkDim }}>Project</span>
            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="untitled" className="outline-none" style={{ font: `600 14px ${MONO}`, color: C.ink, minWidth: 150, background: "transparent" }} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Feedback context="one-way-slab" inline />
            <button onClick={exportXlsx} disabled={!panels.length} className="cs-btn px-3.5 py-2 rounded-lg" style={{ font: `600 12px ${UI}`, border: `1px solid ${panels.length ? C.brass : C.line}`, color: panels.length ? C.brass : C.inkDim, background: C.surf }}>Export Excel</button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* PANEL SCHEDULE — every panel at a glance; click a row to edit it below */}
      {panels.length > 0 && (() => {
        const th = { font: `700 11px ${UI}`, color: C.inkDim, letterSpacing: 0.8, textTransform: "uppercase", padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" };
        const td = { font: `600 13.5px ${MONO}`, color: C.ink, padding: "7px 12px", textAlign: "right", borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap" };
        const v = (x) => (x == null ? "—" : x);
        return (
          <section className="mx-auto px-4 pt-4" style={{ maxWidth: 1320 }}>
            <div className="cs-card rounded-xl overflow-hidden" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span style={{ font: `700 13px ${UI}`, color: C.ink }}>Panel schedule</span>
                <span style={{ font: `500 12px ${MONO}`, color: C.inkDim }}>{doneN}/{panels.length} designed</span>
                <button onClick={add} className="cs-btn ml-auto px-3 py-1.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 13px ${UI}` }}>+ Add panel</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "left" }}>Panel</th><th style={{ ...th, textAlign: "left" }}>Type</th>
                    <th style={th}>L (m)</th><th style={th}>D (mm)</th><th style={th}>fck</th><th style={th}>LL (kN/m²)</th>
                    <th style={th}>Top steel</th><th style={th}>Bottom steel</th><th style={{ ...th, textAlign: "left" }}>Status</th><th style={th} />
                  </tr></thead>
                  <tbody>
                    {panels.map((p) => { const r = results[p.id], on = selId === p.id;
                      const st = r.incomplete ? ["awaiting inputs", C.inkDim] : r.inadequate ? ["inadequate", C.red] : ["designed", C.green];
                      const bar = (s) => (r.incomplete || r.inadequate || s == null ? "—" : `Ø${p.dia} @ ${s}`);
                      return (
                        <tr key={p.id} onClick={() => { setSelId(p.id); setShowWork(false); }} className="cursor-pointer" style={{ background: on ? C.brassBg : "transparent", boxShadow: on ? `inset 3px 0 0 ${C.brass}` : "none" }}>
                          <td style={{ ...td, font: `700 13.5px ${UI}`, color: on ? C.brass : C.ink, textAlign: "left" }}>{p.name}</td>
                          <td style={{ ...td, font: `500 13px ${UI}`, color: C.ink2, textAlign: "left" }}>{COEF[p.type].label.replace(" panel", "")}</td>
                          <td style={td}>{v(p.B)}</td><td style={td}>{v(p.D)}</td><td style={td}>{v(p.fck)}</td><td style={td}>{v(p.live)}</td>
                          <td style={td}>{bar(r.sTop)}</td><td style={td}>{bar(r.sMid)}</td>
                          <td style={{ ...td, font: `600 12.5px ${UI}`, color: st[1], textAlign: "left" }}>● {st[0]}</td>
                          <td style={{ ...td, width: 32 }}><span onClick={(e) => { e.stopPropagation(); del(p.id); }} title="Remove panel" style={{ color: C.inkDim, fontSize: 16 }}>×</span></td>
                        </tr>); })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })()}

      <div className={"mx-auto px-4 py-4 grid grid-cols-1 gap-4 items-start " + (sel ? "lg:grid-cols-[400px_minmax(0,1fr)]" : "")} style={{ maxWidth: 1320 }}>
        {/* LEFT — compact input form for the selected panel */}
        <aside className="space-y-3 lg:sticky lg:top-4">
          {sel && (
            <div className="cs-card rounded-xl px-4 py-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <Field compact text label="Panel name" value={sel.name} onChange={(v) => upd(sel.id, "name", v)} />
              <div className="grid grid-cols-2 gap-1.5 mt-1.5 mb-1">
                {Object.entries(COEF).map(([k, co]) => { const on = sel.type === k; return (
                  <button key={k} onClick={() => upd(sel.id, "type", k)} className="cs-cond rounded-lg px-2 py-1.5" style={{ background: on ? C.brassBg : C.surf2, border: `1px solid ${on ? C.brass : C.line}`, font: `700 12px ${UI}`, color: on ? C.brass : C.ink2 }}>{co.label}</button>
                ); })}
              </div>
              <FormSec title="Geometry & grade" />
              <Field compact label="Span" hint="L" unit="m" value={sel.B} onChange={(v) => upd(sel.id, "B", v)} />
              <Field compact label="Thickness" hint="D" unit="mm" value={sel.D} onChange={(v) => upd(sel.id, "D", v)} />
              <Field compact label="Concrete grade" hint="fck" unit="N/mm²" value={sel.fck} onChange={(v) => upd(sel.id, "fck", v)} />
              <Field compact label="Earth fill / finish" hint="E" unit="mm" value={sel.E} onChange={(v) => upd(sel.id, "E", v)} />
              <FormSec title="Loads & bar" />
              <Field compact label="Live load" hint="LL" unit="kN/m²" value={sel.live} onChange={(v) => upd(sel.id, "live", v)} />
              <Field compact label="Fire tender load" hint="Ff" unit="kN/m²" value={sel.fire} onChange={(v) => upd(sel.id, "fire", v)} />
              <Field compact label="Bar diameter" hint="Ø" unit="mm" value={sel.dia} onChange={(v) => upd(sel.id, "dia", v)} />
              <FormSec title="Materials & factors" right={<button onClick={() => setShowAssume((v) => !v)} style={{ font: `600 11.5px ${UI}`, color: C.brass }}>{showAssume ? "fewer" : "all factors"}</button>} />
              <Field compact label="Steel grade" hint="fy" unit="N/mm²" value={g.fy} onChange={(v) => gField("fy", v)} />
              <Field compact label="Cover to c/c" unit="mm" value={g.cover} onChange={(v) => gField("cover", v)} />
              {showAssume && <>
                <Field compact label="Concrete unit weight" hint="γc" unit="kN/m³" value={g.gammaC} onChange={(v) => gField("gammaC", v)} />
                <Field compact label="Fill unit weight" hint="γf" unit="kN/m³" value={g.gammaFill} onChange={(v) => gField("gammaFill", v)} />
                <Field compact label="Extra dead load" hint="w₀" unit="kN/m²" value={g.addDL} onChange={(v) => gField("addDL", v)} />
                <Field compact label="Minimum steel" unit="%" value={g.minPct} onChange={(v) => gField("minPct", v)} />
                <Field compact label="Load factor — permanent" value={g.lfDL} onChange={(v) => gField("lfDL", v)} />
                <Field compact label="Load factor — temporary" value={g.lfLL} onChange={(v) => gField("lfLL", v)} />
              </>}
              <div style={{ font: `400 11px ${UI}`, color: C.inkDim, marginTop: 6 }}>Defaults match the source sheet (fy 550, γc 25, γf 20, w₀ 0.132).</div>
            </div>
          )}
        </aside>

        {/* RIGHT — drawing + results */}
        <main className="min-w-0">
          {sel ? (
            <>
              <div className="cs-card rounded-xl px-4 pt-3 pb-1" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                <div className="flex items-start justify-between">
                  <div><div style={{ font: `700 18px ${UI}`, color: C.ink }}>{sel.name}</div><div style={{ font: `500 11px ${MONO}`, color: C.inkDim }}>{COEF[sel.type].label}</div></div>
                  {R && !R.incomplete && (
                    <VerdictBadge verdict={R.inadequate ? "INADEQUATE" : "DESIGNED"} label={R.inadequate ? "SECTION INADEQUATE" : "DESIGNED"} size="lg" />
                  )}
                </div>
                <div style={{ height: 160 }}><SlabSection p={sel} res={R} /></div>
              </div>
          {R && !R.incomplete && (() => {
            const nv = (v, d) => (v == null || Number.isNaN(v) ? "—" : fmt(v, d));
            const rows = [
              ["Bending moment", "M", "kN·m/m", nv(R.topM, 2), nv(R.midM, 2)],
              ["Moment factor", "Mu/bd²", "N/mm²", nv(R.topBd2, 3), nv(R.midBd2, 3)],
              ["Steel percentage", "pt", "%", nv(R.ptTop, 3), nv(R.ptMid, 3)],
              ["Steel area required", "Ast", "mm²/m", nv(R.AstTop, 1), nv(R.AstMid, 1)],
              ["Bar spacing", "S", "mm c/c", R.sTop ?? "—", R.sMid ?? "—"],
            ];
            const th = { font: `700 11px ${UI}`, color: C.inkDim, letterSpacing: 1, textTransform: "uppercase", padding: "8px 14px", textAlign: "right" };
            const td = { font: `600 14px ${MONO}`, color: C.ink, padding: "8px 14px", textAlign: "right", borderTop: `1px solid ${C.line}` };
            return (
              <div className="mt-3 space-y-3 csin" key={sel.id}>
                {/* 1 — the answer */}
                {R.inadequate ? (
                  <div className="px-5 py-4 rounded-xl" style={{ background: `${C.red}12`, border: `1px solid ${C.red}44`, color: C.red, font: `600 14px ${UI}` }}>
                    Section inadequate — Mu/bd² exceeds the singly-reinforced limit for M{sel.fck}. Increase thickness or concrete grade.
                  </div>
                ) : (
                  <div className="cs-card rounded-xl grid grid-cols-1 sm:grid-cols-2" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                    {[["Top steel", "at support", C.red, R.sTop, R.AstTop], ["Bottom steel", "at mid-span", C.cyanDeep, R.sMid, R.AstMid]].map(([t, where, col, s, ast], i) => (
                      <div key={t} className="px-5 py-4" style={{ borderLeft: i ? `1px solid ${C.line}` : "none" }}>
                        <div style={{ font: `600 13px ${UI}`, color: C.inkDim }}><span style={{ color: col }}>●</span> {t} <span style={{ fontWeight: 400 }}>· {where}</span></div>
                        <div style={{ font: `700 30px ${MONO}`, color: C.ink, marginTop: 2 }}>Ø{sel.dia} @ {s ?? "—"}<span style={{ font: `500 14px ${MONO}`, color: C.inkDim }}> mm c/c</span></div>
                        <div style={{ font: `400 12.5px ${UI}`, color: C.inkDim }}>Ast required {nv(ast, 1)} mm²/m</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2 — key numbers, top vs bottom */}
                <div className="cs-card rounded-xl overflow-x-auto" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead><tr><th style={{ ...th, textAlign: "left" }}>Design summary</th><th style={th}>Top · support</th><th style={th}>Bottom · span</th><th style={{ ...th, textAlign: "left" }}>Unit</th></tr></thead>
                    <tbody>
                      {rows.map(([name, sym, unit, a, b]) => (
                        <tr key={name}>
                          <td style={{ ...td, font: `500 13.5px ${UI}`, color: C.ink2, textAlign: "left" }}>{name} <span style={{ font: `600 12px ${MONO}`, color: C.brass }}>{sym}</span></td>
                          <td style={td}>{a}</td><td style={td}>{b}</td>
                          <td style={{ ...td, font: `500 12px ${MONO}`, color: C.inkDim, textAlign: "left" }}>{unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 3 — everything else, on demand */}
                <div>
                  <button onClick={() => setShowWork((v) => !v)} className="cs-btn px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.ink2, background: C.surf, font: `600 12px ${UI}` }}>{showWork ? "Hide calculation details" : "Show calculation details"}</button>
                  {showWork && (
                    <div className="mt-2 csin">
                      <div style={{ font: `400 13px ${UI}`, color: C.ink2, marginBottom: 8 }}>
                        Loads: w = {fmt(R.F, 3)} · w<sub>p</sub> = {fmt(R.wp, 3)} · w<sub>t</sub> = {fmt(R.wt, 3)} kN/m² · d = {fmt(R.d, 0)} mm
                      </div>
                      <FormulaLedger F={F} ready={kReady} />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          {R?.incomplete && <div className="mt-3 px-4 py-6 rounded text-center" style={{ background: C.surf, border: `1px dashed ${C.line}`, color: C.inkDim, font: `500 14px ${UI}` }}>Enter {R.missing.join(", ")} on the left — results appear once all inputs are filled.</div>}
            </>
          ) : (
            <div className="cs-card rounded-xl flex flex-col items-center justify-center text-center px-6" style={{ background: C.surf, border: `1px solid ${C.line}`, minHeight: 280 }}>
              <div style={{ font: `400 24px ${SERIF}`, color: C.ink }}>Start a one-way slab panel</div>
              <div style={{ font: `400 14px ${UI}`, color: C.inkDim, maxWidth: 380, marginTop: 6, lineHeight: 1.5 }}>Add a panel, choose edge or internal, then fill in span, thickness and loads on the left.</div>
              <button onClick={add} className="cs-btn mt-5 px-5 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 14px ${UI}` }}>+ Add your first panel</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

