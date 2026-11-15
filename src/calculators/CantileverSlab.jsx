import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { C, UI, MONO, SERIF, fmt, sColor } from "../theme.js";
import { Field, FormSec, FormulaLedger, useKaTeX, ThemeToggle, VerdictBadge, countBlank, blankMsg } from "../components/ui.jsx";
import Feedback from "../components/Feedback.jsx";

/* =====================================================================
   CANTILEVER BALCONY / SLAB DESIGN
   Reproduces "Cantilever Balcony.xls" exactly. Per user's choice:
     • factored beam-face moment M is a typed INPUT (mirror the sheet)
     • finishes / floor-sunk / railing / live load / extra moment are
       recorded fields that do NOT feed the calc (as in the sheet)
     • multiple independent cases in a list

   Chain (sheet cells C8..E41):
     span  = S1 + S2                         d = avg − 25
     avg   = (thk1 + thk2)/2
     thkChk= avg > span·1000/12 ? Can Proceed : Recheck
     Mu/bd²= M·10⁶/(1000·d²)
     pt    = max( fck/(2fy)·(1−√(1−4.598·Mu/bd²/fck))·100 , 0.2 )
     Ast   = pt·d/10                         (cm²/m)
     Sreq  = 1000·a_bar(Ø)/Ast               a_bar uses 3.14, NOT π (sheet)
   Deflection:
     dReq0 = span·1000/7 + 25
     ptProv= AstProv·10/d ;  fs = 0.58·fy·Ast/AstProv_tension
     MFt   = 1/(0.225 + 0.00322·fs − 0.625·log10(1/ptProv_t))
     MFc   = ptc<0.75 ? 1+0.15·ptc/0.5 : min(1.5, round(1.6·ptc/(ptc+0.275),2))
     dReq  = span·1000/7 / MFc / MFt + 25 ;  SAFE if dReq < avg
   ===================================================================== */

const abarCm2 = (dia) => (3.14 * (dia / 10) * (dia / 10)) / 4; // sheet uses 3.14
const round2 = (x) => Math.round(x * 100) / 100;

function computeCantilever(p, g) {
  const { S1, S2, thk1, thk2, fck, fy, M, mainDia, tenDia, tenSp, compDia, compSp } = p;
  const { minPct, cover, ratioCant, ratioThk } = g;

  const nb = countBlank(p, ["S1", "S2", "thk1", "thk2", "fck", "fy", "M", "mainDia", "tenDia", "tenSp", "compDia", "compSp"]) + countBlank(g, ["minPct", "cover", "ratioCant", "ratioThk"]);
  if (nb) return { incomplete: true, missing: blankMsg(nb) };
  const missing = [];
  if (!(S1 + S2 > 0)) missing.push("span");
  if (!(thk1 + thk2 > 0)) missing.push("thickness");
  if (!(fck > 0)) missing.push("fck");
  if (!(M > 0)) missing.push("moment M");
  if (missing.length) return { incomplete: true, missing };

  const span = S1 + S2;
  const avg = (thk1 + thk2) / 2;
  const d = avg - cover;
  const thkChk = avg > (span * 1000) / ratioThk ? "Can Proceed" : "Recheck";

  const MuBd2 = (M * 1e6) / (1000 * d * d);
  const disc = 1 - (4.598 * MuBd2) / fck;
  const inadequate = disc < 0;
  const pt = inadequate ? NaN : Math.max((fck / (2 * fy)) * (1 - Math.sqrt(disc)) * 100, minPct);
  const AstCm2 = inadequate ? NaN : (pt * d) / 10; // cm²/m
  const reqSp = inadequate || !(mainDia > 0) ? null : (1000 * abarCm2(mainDia)) / AstCm2;

  // --- deflection ---
  const dReq0 = (span * 1000) / ratioCant + cover;
  const astProvTen = tenSp > 0 ? (1000 / tenSp) * abarCm2(tenDia) : 0;       // cm²/m
  const ptProvTen = d > 0 ? (astProvTen * 10) / d : 0;                       // %
  const fs = astProvTen > 0 && !inadequate ? (0.58 * fy * AstCm2) / astProvTen : NaN;
  const MFt = ptProvTen > 0 && isFinite(fs)
    ? 1 / (0.225 + 0.00322 * fs - 0.625 * Math.log10(1 / ptProvTen))
    : NaN;
  const astProvComp = compSp > 0 ? (1000 / compSp) * abarCm2(compDia) : 0;   // cm²/m
  const ptProvComp = d > 0 ? (astProvComp * 10) / d : 0;                     // %
  const MFc = ptProvComp < 0.75
    ? 1 + (0.15 * ptProvComp) / 0.5
    : round2((1.6 * ptProvComp) / (ptProvComp + 0.275)) >= 1.5
    ? 1.5
    : round2((1.6 * ptProvComp) / (ptProvComp + 0.275));
  const dReq = isFinite(MFt) && MFc ? (span * 1000) / ratioCant / MFc / MFt + cover : NaN;
  const deflOK = isFinite(dReq) ? dReq < avg : null;
  const verdict = inadequate ? "REDESIGN" : deflOK === null ? "-" : deflOK ? "SAFE" : "UNSAFE";

  return {
    span, avg, d, thkChk, MuBd2, inadequate, pt, AstCm2, reqSp,
    dReq0, astProvTen, ptProvTen, fs, MFt, astProvComp, ptProvComp, MFc, dReq, deflOK, verdict,
  };
}

/* ---- cantilever section diagram ---- */
function CantileverView({ p }) {
  const w = 470, h = 210, wallX = 70, top = 40, tipY = 96;
  const rootTh = Math.max(18, Math.min(56, (p.thk1 || 200) / 6));
  const tipTh = Math.max(12, Math.min(rootTh, (p.thk2 || 150) / 6));
  const projR = w - wallX - 30;
  const s1frac = p.S1 + p.S2 > 0 ? p.S1 / (p.S1 + p.S2) : 0.55;
  const midX = wallX + projR * s1frac;
  const midTh = rootTh + (tipTh - rootTh) * s1frac;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ display: "block" }}>
      {/* support wall/beam */}
      <rect x={wallX - 26} y={top - 6} width={26} height={120} fill={C.surf2} stroke={C.ink2} strokeWidth="1.2" />
      {[...Array(6)].map((_, i) => <line key={i} x1={wallX - 26} y1={top - 6 + i * 22} x2={wallX - 33} y2={top + 1 + i * 22} stroke={C.ink2} strokeWidth="0.8" />)}
      {/* tapered slab */}
      <path d={`M${wallX} ${top} L${w - 30} ${tipY} L${w - 30} ${tipY + tipTh} L${wallX} ${top + rootTh} Z`} fill={C.surf2} stroke={C.teal} strokeWidth="1.6" />
      {/* top tension steel */}
      <line x1={wallX + 4} y1={top + 4} x2={w - 34} y2={tipY + 4} stroke={C.red} strokeWidth="2.4" />
      <text x={wallX + 30} y={top - 12} style={{ font: `600 11px ${MONO}`, fill: C.red }}>top steel (tension)</text>
      {/* span markers */}
      <line x1={wallX} y1={h - 34} x2={midX} y2={h - 34} stroke={C.inkDim} strokeWidth="1" markerStart="url(#c)" markerEnd="url(#c)" />
      <line x1={midX} y1={h - 34} x2={w - 30} y2={h - 34} stroke={C.inkDim} strokeWidth="1" markerStart="url(#c)" markerEnd="url(#c)" />
      <text x={(wallX + midX) / 2} y={h - 20} textAnchor="middle" style={{ font: `600 10.5px ${MONO}`, fill: C.ink2 }}>S1 {p.S1 || "—"}</text>
      <text x={(midX + w - 30) / 2} y={h - 20} textAnchor="middle" style={{ font: `600 10.5px ${MONO}`, fill: C.ink2 }}>S2 {p.S2 || "—"}</text>
      <text x={wallX - 40} y={top + rootTh / 2 + 4} style={{ font: `600 10px ${MONO}`, fill: C.ink2 }}>{p.thk1 || "—"}</text>
      <text x={w - 26} y={tipY + tipTh / 2 + 4} style={{ font: `600 10px ${MONO}`, fill: C.ink2 }}>{p.thk2 || "—"}</text>
      <defs><marker id="c" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M1 4h6M4 1l3 3-3 3" stroke={C.inkDim} strokeWidth="1" fill="none" /></marker></defs>
    </svg>
  );
}

function buildFormulas(p, r, g) {
  if (r.incomplete) return [];
  const d2 = (v) => fmt(v, 2), d3 = (v) => fmt(v, 3), d0 = (v) => fmt(v, 0);
  const F = [];
  F.push({ label: "Total span", sym: "S = S_1 + S_2", sub: `${p.S1} + ${p.S2}`, val: `${d2(r.span)} m`, cl: "geometry" });
  F.push({ label: "Average depth", sym: "\\bar{D} = (t_1 + t_2)/2", sub: `(${p.thk1}+${p.thk2})/2`, val: `${d0(r.avg)} mm`, cl: "geometry" });
  F.push({ label: "Depth check", sym: "\\bar{D} \\;?\\; S\\cdot1000/12", sub: `${d0(r.avg)} vs ${d0((r.span * 1000) / g.ratioThk)}`, val: r.thkChk, cl: "span/12" });
  F.push({ label: "Effective depth", sym: "d = \\bar{D} - 25", sub: `${d0(r.avg)} - ${g.cover}`, val: `${d0(r.d)} mm`, cl: "cover" });
  F.push({ label: "Mu/bd²", sym: "\\dfrac{M\\cdot10^6}{1000\\,d^2}", sub: `${p.M}\\times10^6/(1000\\cdot${d0(r.d)}^2)`, val: `${d3(r.MuBd2)} N/mm²`, cl: "SP 16" });
  F.push({ label: "pt", sym: "\\max\\!\\Big(\\tfrac{f_{ck}}{2f_y}\\big(1-\\sqrt{1-\\tfrac{4.598\\,M_u}{f_{ck}bd^2}}\\big)100,\\,0.2\\Big)", sub: `f_{ck}=${p.fck},\\ f_y=${p.fy}`, val: `${r.inadequate ? "—" : d3(r.pt)} %`, cl: "min 0.2%" });
  F.push({ label: "Ast", sym: "A_{st} = p_t\\,d/10", sub: `${r.inadequate ? "—" : d3(r.pt)}\\cdot${d0(r.d)}/10`, val: `${r.inadequate ? "—" : d2(r.AstCm2)} cm²/m`, cl: `${r.inadequate ? "" : d0(r.AstCm2 * 100) + " mm²/m"}` });
  if (r.reqSp) F.push({ label: "Required spacing", sym: "S = \\dfrac{1000\\,a_\\phi}{A_{st}}", sub: `\\phi=${p.mainDia}`, val: `${d2(r.reqSp)} mm c/c`, cl: "main bar" });
  F.push({ label: "Basic req. depth", sym: "d_{req,0} = S\\cdot1000/7 + 25", sub: `${p.S1 + p.S2 ? d2(r.span) : "—"}\\cdot1000/7 + 25`, val: `${d2(r.dReq0)} mm`, cl: "cantilever L/d=7" });
  F.push({ label: "Service stress fs", sym: "f_s = 0.58 f_y \\dfrac{A_{st,req}}{A_{st,prov}}", sub: `0.58\\cdot${p.fy}\\cdot\\frac{${r.inadequate ? "—" : d2(r.AstCm2)}}{${d2(r.astProvTen)}}`, val: `${isFinite(r.fs) ? d2(r.fs) : "—"} N/mm²`, cl: "Ø" + p.tenDia + "@" + p.tenSp });
  F.push({ label: "MF tension", sym: "MF_t = \\dfrac{1}{0.225 + 0.00322 f_s - 0.625\\log_{10}(1/p_t)}", sub: `p_{t,prov}=${d3(r.ptProvTen)}`, val: `${isFinite(r.MFt) ? d3(r.MFt) : "—"}`, cl: "Fig 4" });
  F.push({ label: "MF compression", sym: "MF_c\\,(p_{t,c}=" + d3(r.ptProvComp) + ")", sub: `\\phi=${p.compDia}@${p.compSp}`, val: `${d3(r.MFc)}`, cl: "Fig 5" });
  F.push({ label: "Required depth", sym: "d_{req} = \\dfrac{S\\cdot1000/7}{MF_c\\,MF_t} + 25", sub: `→ vs \\bar{D}=${d0(r.avg)}`, val: `${isFinite(r.dReq) ? d2(r.dReq) : "—"} mm → ${r.verdict}`, cl: "Cl 23.2.1" });
  return F;
}

const DEF = { type: "cant", S1: null, S2: null, thk1: null, thk2: null, fck: 40, fy: 500, M: null, mainDia: null, tenDia: null, tenSp: null, compDia: null, compSp: null, finishes: 100, floorSunk: 0, railH: 0, railTh: 0, live: 5, extraM: 0 };

export default function CantileverSlab({ onBack }) {
  const [g, setG] = useState({ minPct: 0.2, cover: 25, ratioCant: 7, ratioThk: 12 });
  const [cases, setCases] = useState([]);
  const [selId, setSelId] = useState(null);
  const [project, setProject] = useState("");
  const [showWork, setShowWork] = useState(false);
  const [showRec, setShowRec] = useState(false);
  const kReady = useKaTeX();
  const nextId = useRef(1);

  const results = useMemo(() => { const o = {}; for (const p of cases) o[p.id] = computeCantilever(p, g); return o; }, [cases, g]);
  const sel = cases.find((p) => p.id === selId) || null;
  const R = sel ? results[sel.id] : null;
  const safeN = cases.filter((p) => results[p.id].verdict === "SAFE").length;
  const doneN = cases.filter((p) => !results[p.id].incomplete).length;

  const upd = (id, k, v) => setCases((cs) => cs.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  const add = () => { const id = nextId.current++; setCases((cs) => [...cs, { id, name: "B" + id, ...DEF }]); setSelId(id); setShowWork(false); };
  const del = (id) => { setCases((cs) => cs.filter((p) => p.id !== id)); if (selId === id) setSelId((cases.find((p) => p.id !== id) || {}).id ?? null); };

  const exportXlsx = () => {
    const head = ["Case", "S1", "S2", "Span", "t1", "t2", "avg", "fck", "fy", "M(kNm)", "Mu/bd2", "pt%", "Ast(cm2/m)", "ReqSp", "dReq0", "MFt", "MFc", "dReq", "Verdict"];
    const rows = cases.map((p) => {
      const r = results[p.id];
      if (r.incomplete) return [p.name, p.S1, p.S2, "", p.thk1, p.thk2, "", p.fck, p.fy, p.M, "", "", "", "", "", "", "", "", "INCOMPLETE"];
      const nn = (v) => (v == null ? "" : Number.isNaN(v) ? "—" : +v.toFixed(v < 10 ? 3 : 2));
      return [p.name, p.S1, p.S2, nn(r.span), p.thk1, p.thk2, nn(r.avg), p.fck, p.fy, p.M, nn(r.MuBd2), nn(r.pt), nn(r.AstCm2), nn(r.reqSp), nn(r.dReq0), nn(r.MFt), nn(r.MFc), nn(r.dReq), r.verdict];
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["CivilSpace — Cantilever Balcony Design (IS 456)"], ["Project", project], [], head, ...rows]), "Design");
    XLSX.writeFile(wb, "civilspace_cantilever.xlsx");
  };

  const F = sel && R ? buildFormulas(sel, R, g) : [];

  return (
    <div className="min-h-screen cs-bp" style={{ color: C.ink, fontFamily: UI }}>
      <header className="px-4 pt-4 mx-auto" style={{ maxWidth: 1320 }}>
        <div className="cs-card flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
          {onBack && (
            <button onClick={onBack} className="cs-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.surf, color: C.ink2, font: `600 13px ${UI}` }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M12 8H4M7.5 4.5L4 8l3.5 3.5" stroke={C.ink2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>All
            </button>
          )}
          <div>
            <div style={{ font: `400 21px ${SERIF}`, letterSpacing: "-0.01em", color: C.ink }}>Cantilever Balcony Design</div>
            <div style={{ font: `400 12px ${UI}`, color: C.inkDim }}>IS 456:2000 · L/d = 7</div>
          </div>
          <div className="flex items-center gap-2 ml-2 px-3 py-1.5 rounded-lg" style={{ background: C.surf2, border: `1px solid ${C.line}` }}>
            <span style={{ font: `500 12px ${UI}`, color: C.inkDim }}>Project</span>
            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="untitled" className="outline-none" style={{ font: `600 14px ${MONO}`, color: C.ink, minWidth: 150, background: "transparent" }} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Feedback context="cantilever-slab" inline />
            <button onClick={exportXlsx} disabled={!cases.length} className="cs-btn px-3.5 py-2 rounded-lg" style={{ font: `600 12px ${UI}`, border: `1px solid ${cases.length ? C.brass : C.line}`, color: cases.length ? C.brass : C.inkDim, background: C.surf }}>Export Excel</button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* BALCONY SCHEDULE — every case at a glance; click a row to edit it below */}
      {cases.length > 0 && (() => {
        const th = { font: `700 11px ${UI}`, color: C.inkDim, letterSpacing: 0.8, textTransform: "uppercase", padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" };
        const td = { font: `600 13.5px ${MONO}`, color: C.ink, padding: "7px 12px", textAlign: "right", borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap" };
        const v = (x) => (x == null ? "—" : x);
        return (
          <section className="mx-auto px-4 pt-4" style={{ maxWidth: 1320 }}>
            <div className="cs-card rounded-xl overflow-hidden" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span style={{ font: `700 13px ${UI}`, color: C.ink }}>Balcony schedule</span>
                <span style={{ font: `500 12px ${UI}`, color: C.inkDim }}>{safeN} of {cases.length} safe</span>
                <button onClick={add} className="cs-btn ml-auto px-3 py-1.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 13px ${UI}` }}>+ Add balcony</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "left" }}>Balcony</th><th style={th}>S1 + S2 (m)</th><th style={th}>t1 / t2 (mm)</th><th style={th}>fck</th><th style={th}>M (kN·m)</th>
                    <th style={th}>Main steel</th><th style={th}>d req / D̄ (mm)</th><th style={{ ...th, textAlign: "left" }}>Status</th><th style={th} />
                  </tr></thead>
                  <tbody>
                    {cases.map((p) => { const r = results[p.id], on = selId === p.id, done = !r.incomplete;
                      return (
                        <tr key={p.id} onClick={() => { setSelId(p.id); setShowWork(false); }} className="cursor-pointer" style={{ background: on ? C.brassBg : "transparent", boxShadow: on ? `inset 3px 0 0 ${C.brass}` : "none" }}>
                          <td style={{ ...td, font: `700 13.5px ${UI}`, color: on ? C.brass : C.ink, textAlign: "left" }}>{p.name}</td>
                          <td style={td}>{v(p.S1)} + {v(p.S2)}</td><td style={td}>{v(p.thk1)} / {v(p.thk2)}</td><td style={td}>{v(p.fck)}</td><td style={td}>{v(p.M)}</td>
                          <td style={td}>{done && r.reqSp ? `Ø${p.mainDia} @ ${fmt(r.reqSp, 0)}` : "—"}</td>
                          <td style={{ ...td, color: done && r.deflOK === false ? C.red : C.ink }}>{done && isFinite(r.dReq) ? `${fmt(r.dReq, 0)} / ${fmt(r.avg, 0)}` : "—"}</td>
                          <td style={{ ...td, font: `600 12.5px ${UI}`, color: sColor(r.verdict), textAlign: "left" }}>● {done ? r.verdict.toLowerCase() : "awaiting inputs"}</td>
                          <td style={{ ...td, width: 32 }}><span onClick={(e) => { e.stopPropagation(); del(p.id); }} title="Remove balcony" style={{ color: C.inkDim, fontSize: 16 }}>×</span></td>
                        </tr>); })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })()}

      <div className={"mx-auto px-4 py-4 grid grid-cols-1 gap-4 items-start " + (sel ? "lg:grid-cols-[400px_minmax(0,1fr)]" : "")} style={{ maxWidth: 1320 }}>
        {/* LEFT — compact input form for the selected case */}
        {sel && (
          <aside className="cs-card rounded-xl px-4 py-3 lg:sticky lg:top-4" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
            <Field compact text label="Name" value={sel.name} onChange={(v) => upd(sel.id, "name", v)} />
            <FormSec title="Geometry" />
            <Field compact label="Span" hint="S1" unit="m" value={sel.S1} onChange={(v) => upd(sel.id, "S1", v)} />
            <Field compact label="Span" hint="S2" unit="m" value={sel.S2} onChange={(v) => upd(sel.id, "S2", v)} />
            <Field compact label="Thickness at S1" hint="t1" unit="mm" value={sel.thk1} onChange={(v) => upd(sel.id, "thk1", v)} />
            <Field compact label="Thickness at S2" hint="t2" unit="mm" value={sel.thk2} onChange={(v) => upd(sel.id, "thk2", v)} />
            <FormSec title="Material & moment" />
            <Field compact label="Concrete grade" hint="fck" unit="N/mm²" value={sel.fck} onChange={(v) => upd(sel.id, "fck", v)} />
            <Field compact label="Steel grade" hint="fy" unit="N/mm²" value={sel.fy} onChange={(v) => upd(sel.id, "fy", v)} />
            <Field compact label="Factored moment" hint="M" unit="kN·m" value={sel.M} onChange={(v) => upd(sel.id, "M", v)} />
            <Field compact label="Main bar diameter" hint="Ø" unit="mm" value={sel.mainDia} onChange={(v) => upd(sel.id, "mainDia", v)} />
            <FormSec title="Provided steel (for deflection)" />
            <Field compact label="Tension bar diameter" hint="Ø" unit="mm" value={sel.tenDia} onChange={(v) => upd(sel.id, "tenDia", v)} />
            <Field compact label="Tension bar spacing" unit="mm" value={sel.tenSp} onChange={(v) => upd(sel.id, "tenSp", v)} />
            <Field compact label="Compression bar diameter" hint="Ø" unit="mm" value={sel.compDia} onChange={(v) => upd(sel.id, "compDia", v)} />
            <Field compact label="Compression bar spacing" unit="mm" value={sel.compSp} onChange={(v) => upd(sel.id, "compSp", v)} />
            <FormSec title="Project record (not calculated)" right={<button onClick={() => setShowRec((v) => !v)} style={{ font: `600 11.5px ${UI}`, color: C.brass }}>{showRec ? "hide" : "show"}</button>} />
            {showRec && <>
              <Field compact label="Finishes" unit="mm" value={sel.finishes} onChange={(v) => upd(sel.id, "finishes", v)} />
              <Field compact label="Floor sunk" unit="mm" value={sel.floorSunk} onChange={(v) => upd(sel.id, "floorSunk", v)} />
              <Field compact label="Railing height" unit="m" value={sel.railH} onChange={(v) => upd(sel.id, "railH", v)} />
              <Field compact label="Railing wall thickness" unit="mm" value={sel.railTh} onChange={(v) => upd(sel.id, "railTh", v)} />
              <Field compact label="Live load" unit="kN/m²" value={sel.live} onChange={(v) => upd(sel.id, "live", v)} />
              <Field compact label="Extra moment" unit="kN·m" value={sel.extraM} onChange={(v) => upd(sel.id, "extraM", v)} />
            </>}
            <div style={{ font: `400 11px/1.5 ${UI}`, color: C.inkDim, marginTop: 6 }}>Record fields match the sheet but don't feed the moment — enter the factored moment directly.</div>
          </aside>
        )}

        {/* RIGHT — section + answer + checks */}
        <main className="min-w-0">
          {sel ? (
            <>
              <div className="cs-card rounded-xl px-4 pt-3 pb-1" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                <div className="flex items-start justify-between">
                  <div><div style={{ font: `700 18px ${UI}`, color: C.ink }}>{sel.name}</div><div style={{ font: `400 12px ${UI}`, color: C.inkDim }}>Cantilever balcony · section</div></div>
                  {R && !R.incomplete && <VerdictBadge verdict={R.verdict} size="lg" />}
                </div>
                <div style={{ height: 180 }}><CantileverView p={sel} /></div>
              </div>

              {R && !R.incomplete && (() => {
                const deflOK = R.deflOK === true;
                const checks = [
                  ["Thickness vs span / " + g.ratioThk, fmt(R.avg, 0), `> ${fmt((R.span * 1000) / g.ratioThk, 0)}`, "mm", R.thkChk === "Can Proceed"],
                  ["Flexure — singly reinforced", fmt(R.MuBd2, 3), `≤ ${fmt(sel.fck / 4.598, 3)}`, "N/mm²", !R.inadequate],
                  ["Deflection — required depth", isFinite(R.dReq) ? fmt(R.dReq, 1) : "—", `< ${fmt(R.avg, 0)}`, "mm", deflOK],
                ];
                const th = { font: `700 11px ${UI}`, color: C.inkDim, letterSpacing: 1, textTransform: "uppercase", padding: "8px 14px", textAlign: "right" };
                const td = { font: `600 14px ${MONO}`, color: C.ink, padding: "8px 14px", textAlign: "right", borderTop: `1px solid ${C.line}` };
                return (
                  <div className="mt-3 space-y-3 csin" key={sel.id}>
                    {/* 1 — the answer */}
                    <div className="cs-card rounded-xl grid grid-cols-1 sm:grid-cols-2" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                      <div className="px-5 py-4">
                        <div style={{ font: `600 13px ${UI}`, color: C.inkDim }}><span style={{ color: C.red }}>●</span> Top steel · main bars</div>
                        {R.inadequate ? (
                          <div style={{ font: `600 14px ${UI}`, color: C.red, marginTop: 6 }}>Section inadequate — Mu/bd² exceeds the singly-reinforced limit for M{sel.fck}. Increase thickness or grade.</div>
                        ) : (<>
                          <div style={{ font: `700 30px ${MONO}`, color: C.ink, marginTop: 2 }}>Ø{sel.mainDia} @ {fmt(R.reqSp, 0)}<span style={{ font: `500 14px ${MONO}`, color: C.inkDim }}> mm c/c max</span></div>
                          <div style={{ font: `400 12.5px ${UI}`, color: C.inkDim }}>Ast required {fmt(R.AstCm2 * 100, 0)} mm²/m · pt {fmt(R.pt, 3)}%</div>
                        </>)}
                      </div>
                      <div className="px-5 py-4" style={{ borderLeft: `1px solid ${C.line}` }}>
                        <div style={{ font: `600 13px ${UI}`, color: C.inkDim }}>Deflection · with Ø{sel.tenDia} @ {sel.tenSp} provided</div>
                        <div style={{ font: `700 30px ${MONO}`, color: deflOK ? C.ink : C.red, marginTop: 2 }}>{isFinite(R.dReq) ? fmt(R.dReq, 0) : "—"}<span style={{ font: `500 14px ${MONO}`, color: C.inkDim }}> mm required</span></div>
                        <div style={{ font: `400 12.5px ${UI}`, color: deflOK ? C.inkDim : C.red }}>Average depth provided {fmt(R.avg, 0)} mm — {deflOK ? "OK" : "increase depth or tension steel"}</div>
                      </div>
                    </div>

                    {/* 2 — checks */}
                    <div className="cs-card rounded-xl overflow-x-auto" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                      <table className="w-full" style={{ borderCollapse: "collapse" }}>
                        <thead><tr><th style={{ ...th, textAlign: "left" }}>Check</th><th style={th}>Value</th><th style={th}>Limit</th><th style={{ ...th, textAlign: "left" }}>Unit</th><th style={th}>Result</th></tr></thead>
                        <tbody>
                          {checks.map(([name, val, lim, unit, ok]) => (
                            <tr key={name}>
                              <td style={{ ...td, font: `500 13.5px ${UI}`, color: C.ink2, textAlign: "left" }}>{name}</td>
                              <td style={{ ...td, color: ok ? C.ink : C.red }}>{val}</td>
                              <td style={{ ...td, color: C.ink2 }}>{lim}</td>
                              <td style={{ ...td, font: `500 12px ${MONO}`, color: C.inkDim, textAlign: "left" }}>{unit}</td>
                              <td style={{ ...td, font: `700 12.5px ${UI}`, color: ok ? C.green : C.red }}>{ok ? "✓ OK" : "✗ FAIL"}</td>
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
                          <div style={{ font: `400 13px/1.6 ${UI}`, color: C.ink2, marginBottom: 8 }}>
                            Span {fmt(R.span, 2)} m · D̄ = {fmt(R.avg, 0)} mm · d = {fmt(R.d, 0)} mm · basic required depth {fmt(R.dReq0, 1)} mm ·
                            MF<sub>t</sub> = {isFinite(R.MFt) ? fmt(R.MFt, 3) : "—"} · MF<sub>c</sub> = {fmt(R.MFc, 3)}
                          </div>
                          <FormulaLedger F={F} ready={kReady} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {R?.incomplete && <div className="mt-3 px-4 py-6 rounded-xl text-center" style={{ background: C.surf, border: `1px dashed ${C.line}`, color: C.inkDim, font: `500 14px ${UI}` }}>Enter {R.missing.join(", ")} on the left — results appear once all inputs are filled.</div>}
            </>
          ) : (
            <div className="cs-card rounded-xl flex flex-col items-center justify-center text-center px-6" style={{ background: C.surf, border: `1px solid ${C.line}`, minHeight: 280 }}>
              <div style={{ font: `400 24px ${SERIF}`, color: C.ink }}>Start a cantilever balcony</div>
              <div style={{ font: `400 14px ${UI}`, color: C.inkDim, maxWidth: 400, marginTop: 6, lineHeight: 1.5 }}>Add a balcony, then fill in spans, thickness, the factored beam-face moment and the bars on the left.</div>
              <button onClick={add} className="cs-btn mt-5 px-5 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 14px ${UI}` }}>+ Add your first balcony</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
