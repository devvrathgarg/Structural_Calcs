import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { C, UI, MONO, fmt } from "../theme.js";
import { Field, RVal, Group, SecHead, FormulaLedger, useKaTeX } from "../components/ui.jsx";
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
      <rect x={mx} y={top} width={spanW} height={th} rx={2} fill="#DCE6EB" stroke={C.teal} strokeWidth="1.6" />
      {/* supports */}
      {[mx, w - mx].map((cx, i) => (
        <g key={i}>
          <rect x={cx - 12} y={top + th} width={24} height={26} fill="#C7D2D9" stroke={C.ink2} strokeWidth="1" />
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

const DEF_PANEL = { type: "edge", B: 0, D: 150, fck: 25, E: 100, live: 5, fire: 0, dia: 8 };

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
      <header className="px-4 pt-4 mx-auto" style={{ maxWidth: 1480 }}>
        <div className="cs-card flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
          {onBack && (
            <button onClick={onBack} className="cs-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.surf, color: C.ink2, font: `600 13px ${UI}` }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M12 8H4M7.5 4.5L4 8l3.5 3.5" stroke={C.ink2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              All
            </button>
          )}
          <div>
            <div style={{ font: `900 18px ${UI}`, letterSpacing: "-0.01em", color: C.ink }}>One-way Slab <span style={{ color: C.brass }}>Design</span></div>
            <div style={{ font: `500 10px ${MONO}`, color: C.inkDim, letterSpacing: 1 }}>REYNOLDS Ch.33 · IS 456:2000</div>
          </div>
          <div className="flex items-center gap-2 ml-2 px-3 py-1.5 rounded-lg" style={{ background: C.surf2, border: `1px solid ${C.line}` }}>
            <span style={{ font: `600 10px ${MONO}`, color: C.inkDim }}>PROJECT</span>
            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="untitled" className="outline-none" style={{ font: `600 14px ${MONO}`, color: C.ink, minWidth: 150, background: "transparent" }} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Feedback context="one-way-slab" inline />
            <button onClick={exportXlsx} disabled={!panels.length} className="cs-btn px-3.5 py-2 rounded-lg" style={{ font: `600 12px ${UI}`, border: `1px solid ${panels.length ? C.brass : C.line}`, color: panels.length ? C.brass : C.inkDim, background: C.surf }}>Export Excel</button>
          </div>
        </div>
      </header>

      <div className="mx-auto px-4 py-4 flex flex-col lg:flex-row gap-4" style={{ maxWidth: 1480 }}>
        {/* panel list */}
        <aside className="lg:w-52 shrink-0">
          <div className="flex items-center justify-between mb-2"><span style={{ font: `600 10px ${MONO}`, color: C.inkDim, letterSpacing: 1 }}>PANELS</span>{panels.length > 0 && <span style={{ font: `600 11px ${MONO}`, color: C.inkDim }}>{doneN}/{panels.length} done</span>}</div>
          <div className="space-y-1.5">
            {panels.map((p) => { const r = results[p.id], on = selId === p.id; return (
              <div key={p.id} onClick={() => { setSelId(p.id); setShowWork(false); }} className={"cs-panel px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-2 " + (on ? "cs-card" : "")} style={{ background: C.surf, border: `1px solid ${on ? C.brass : C.line}`, borderLeft: `3px solid ${on ? C.brass : r.incomplete ? C.inkDim : r.inadequate ? C.red : C.teal}` }}>
                <div className="grow min-w-0"><div style={{ font: `700 14px ${UI}`, color: on ? C.brass : C.ink }}>{p.name}</div><div className="truncate" style={{ font: `400 10px ${MONO}`, color: C.inkDim }}>{r.incomplete ? "awaiting inputs" : COEF[p.type].label}</div></div>
                <span onClick={(e) => { e.stopPropagation(); del(p.id); }} style={{ color: C.inkDim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</span>
              </div>); })}
          </div>
          <button onClick={add} className="cs-btn w-full mt-2 px-3 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 13px ${UI}`, boxShadow: "0 2px 8px rgba(166,110,18,.2)" }}>+ Add panel</button>
        </aside>

        {/* center */}
        <main className="grow min-w-0">
          <div className="cs-card rounded-xl relative" style={{ backgroundColor: "#FBFCFD", backgroundImage: "radial-gradient(120% 90% at 50% 0%, #FFFFFF 0%, #E9EEF2 100%)", border: `1px solid ${C.line}`, minHeight: 240, overflow: "hidden" }}>
            {sel ? (
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div><div style={{ font: `700 20px ${UI}`, color: C.ink }}>{sel.name}</div><div style={{ font: `500 11px ${MONO}`, color: C.inkDim }}>{COEF[sel.type].label}</div></div>
                  {R && !R.incomplete && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,.9)", color: R.inadequate ? C.red : C.green, font: `700 13px ${MONO}`, border: `1px solid ${(R.inadequate ? C.red : C.green)}55` }}>
                      {R.inadequate ? "SECTION INADEQUATE" : "DESIGNED"}
                    </span>
                  )}
                </div>
                <div style={{ height: 190, marginTop: 4 }}><SlabSection p={sel} res={R} /></div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6" style={{ minHeight: 240 }}>
                <div style={{ font: `700 20px ${UI}`, color: C.ink }}>Start a one-way slab panel</div>
                <div style={{ font: `400 14px ${UI}`, color: C.inkDim, maxWidth: 380, marginTop: 6, lineHeight: 1.5 }}>Add a panel, choose edge or internal, then enter span, thickness and loads.</div>
                <button onClick={add} className="cs-btn mt-5 px-5 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 14px ${UI}`, boxShadow: "0 3px 12px rgba(166,110,18,.25)" }}>+ Add your first panel</button>
              </div>
            )}
          </div>

          {R && !R.incomplete && (
            <div className="mt-3 csin" key={sel.id}>
              <Group title="Design loads" accent={C.teal} cols="grid-cols-1 sm:grid-cols-3">
                <RVal accent={C.teal} name="Permanent load" sym="w" val={fmt(R.F, 3)} unit="kN/m²" />
                <RVal accent={C.teal} name="Factored permanent load" sym="wp" val={fmt(R.wp, 3)} unit="kN/m²" />
                <RVal accent={C.teal} name="Factored temporary load" sym="wt" val={fmt(R.wt, 3)} unit="kN/m²" />
              </Group>
              <Group title="Bending moments (M = α·w·L²)" accent={C.violet} cols="grid-cols-1 sm:grid-cols-2">
                <RVal accent={C.violet} name="Support moment (top / hogging)" sym="M⁻" val={fmt(R.topM, 3)} unit="kN·m/m" />
                <RVal accent={C.violet} name="Span moment (bottom / sagging)" sym="M⁺" val={fmt(R.midM, 3)} unit="kN·m/m" />
              </Group>
              <Group title="Design moment factor  Mu / b·d²  (drives pt)" accent={C.amber} cols="grid-cols-1 sm:grid-cols-2">
                <RVal accent={C.amber} name="Moment factor at support (top)" sym="Mu/bd²" val={fmt(R.topBd2, 4)} unit="N/mm²" />
                <RVal accent={C.amber} name="Moment factor at span (bottom)" sym="Mu/bd²" val={fmt(R.midBd2, 4)} unit="N/mm²" />
              </Group>
              <Group title="Reinforcement required  (Ast = pt · b · d / 100)" accent={C.brass} cols="grid-cols-2 sm:grid-cols-4">
                <RVal accent={C.brass} name="Steel percentage at top" sym="pt" val={Number.isNaN(R.ptTop) ? "—" : fmt(R.ptTop, 4)} unit="%" />
                <RVal accent={C.brass} name="Steel area at top" sym="Ast" val={Number.isNaN(R.AstTop) ? "—" : fmt(R.AstTop, 1)} unit="mm²/m" color={R.inadequate ? C.red : undefined} />
                <RVal accent={C.brass} name="Steel percentage at bottom" sym="pt" val={Number.isNaN(R.ptMid) ? "—" : fmt(R.ptMid, 4)} unit="%" />
                <RVal accent={C.brass} name="Steel area at bottom" sym="Ast" val={Number.isNaN(R.AstMid) ? "—" : fmt(R.AstMid, 1)} unit="mm²/m" />
              </Group>
              <Group title="Bar spacing (derived from bar diameter)" accent={C.ink2} cols="grid-cols-1 sm:grid-cols-2">
                <RVal accent={C.ink2} name={`Top steel spacing  (Ø ${sel.dia} mm)`} val={R.sTop ?? "—"} unit="mm c/c" />
                <RVal accent={C.ink2} name={`Bottom steel spacing  (Ø ${sel.dia} mm)`} val={R.sMid ?? "—"} unit="mm c/c" />
              </Group>
              {R.inadequate && <div className="mt-3 px-4 py-3 rounded-lg" style={{ background: "rgba(198,60,34,0.06)", border: `1px solid ${C.red}44`, color: C.red, font: `600 13px ${UI}` }}>Mu/bd² exceeds the singly-reinforced limit for M{sel.fck} — increase thickness or grade (the sheet would show an error here).</div>}
              <div className="mt-4">
                <button onClick={() => setShowWork((v) => !v)} className="cs-btn px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.ink2, background: C.surf, font: `600 12px ${UI}` }}>{showWork ? "Hide calculation details" : "Show calculation details"}</button>
                {showWork && <div className="mt-2 csin"><FormulaLedger F={F} ready={kReady} /></div>}
              </div>
            </div>
          )}
          {R?.incomplete && <div className="mt-3 px-4 py-6 rounded text-center" style={{ background: C.surf, border: `1px dashed ${C.line}`, color: C.inkDim, font: `500 14px ${UI}` }}>Enter {R.missing.join(", ")} on the right — results build as you type.</div>}
        </main>

        {/* inputs */}
        {sel && (
          <aside className="lg:w-72 shrink-0 space-y-4">
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="PANEL" accent={C.brass} />
              <Field text label="Panel name" value={sel.name} onChange={(v) => upd(sel.id, "name", v)} />
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {Object.entries(COEF).map(([k, co]) => { const on = sel.type === k; return (
                  <button key={k} onClick={() => upd(sel.id, "type", k)} className="cs-cond rounded-lg px-2 py-2" style={{ background: on ? C.brassBg : C.surf2, border: `1px solid ${on ? C.brass : C.line}`, font: `700 12px ${UI}`, color: on ? C.brass : C.ink2 }}>{co.label}</button>
                ); })}
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="GEOMETRY & GRADE" accent={C.teal} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Span" hint="L" unit="m" value={sel.B} onChange={(v) => upd(sel.id, "B", v)} />
                <Field label="Thickness" hint="D" unit="mm" value={sel.D} onChange={(v) => upd(sel.id, "D", v)} />
                <Field label="Concrete grade" hint="fck" unit="N/mm²" value={sel.fck} onChange={(v) => upd(sel.id, "fck", v)} />
                <Field label="Earth fill/finish" hint="E" unit="mm" value={sel.E} onChange={(v) => upd(sel.id, "E", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="LOADS & BAR" accent={C.violet} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Live load" hint="LL" unit="kN/m²" value={sel.live} onChange={(v) => upd(sel.id, "live", v)} />
                <Field label="Fire tender load" hint="Ff" unit="kN/m²" value={sel.fire} onChange={(v) => upd(sel.id, "fire", v)} />
                <Field label="Bar diameter" hint="Ø" unit="mm" value={sel.dia} onChange={(v) => upd(sel.id, "dia", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between">
                <SecHead label="MATERIALS & FACTORS" accent={C.green} />
                <button onClick={() => setShowAssume((v) => !v)} style={{ font: `600 11px ${UI}`, color: C.inkDim }}>{showAssume ? "less" : "more"}</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Steel grade" hint="fy" unit="N/mm²" value={g.fy} onChange={(v) => gField("fy", v)} />
                <Field label="Cover to c/c" unit="mm" value={g.cover} onChange={(v) => gField("cover", v)} />
              </div>
              {showAssume && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Field label="Concrete unit weight" hint="γc" unit="kN/m³" value={g.gammaC} onChange={(v) => gField("gammaC", v)} />
                  <Field label="Fill unit weight" hint="γf" unit="kN/m³" value={g.gammaFill} onChange={(v) => gField("gammaFill", v)} />
                  <Field label="Extra dead load" hint="w₀" unit="kN/m²" value={g.addDL} onChange={(v) => gField("addDL", v)} />
                  <Field label="Minimum steel" unit="%" value={g.minPct} onChange={(v) => gField("minPct", v)} />
                  <Field label="Load factor — permanent" value={g.lfDL} onChange={(v) => gField("lfDL", v)} />
                  <Field label="Load factor — temporary" value={g.lfLL} onChange={(v) => gField("lfLL", v)} />
                </div>
              )}
              <div style={{ font: `400 10.5px ${MONO}`, color: C.inkDim, marginTop: 8, lineHeight: 1.5 }}>Defaults match the source sheet (fy 550, γc 25, γf 20, w₀ 0.132).</div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
