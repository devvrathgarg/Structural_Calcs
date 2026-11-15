import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { C, UI, MONO, SERIF, fmt, sColor } from "../theme.js";
import { Field, RVal, Group, SecHead, FormulaLedger, useKaTeX, ThemeToggle, VerdictBadge, countBlank, blankMsg } from "../components/ui.jsx";
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
      <header className="px-4 pt-4 mx-auto" style={{ maxWidth: 1480 }}>
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

      <div className="mx-auto px-4 py-4 flex flex-col lg:flex-row gap-4" style={{ maxWidth: 1480 }}>
        <aside className="lg:w-52 shrink-0">
          <div className="flex items-center justify-between mb-2"><span style={{ font: `600 12px ${UI}`, color: C.inkDim }}>Balconies</span>{cases.length > 0 && <span style={{ font: `600 11px ${MONO}`, color: C.inkDim }}>{safeN}/{doneN} safe</span>}</div>
          <div className="space-y-1.5">
            {cases.map((p) => { const r = results[p.id], on = selId === p.id; return (
              <div key={p.id} onClick={() => { setSelId(p.id); setShowWork(false); }} className={"cs-panel px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-2 " + (on ? "cs-card" : "")} style={{ background: C.surf, border: `1px solid ${on ? C.brass : C.line}`, borderLeft: `3px solid ${on ? C.brass : sColor(r.verdict)}` }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: sColor(r.verdict), flexShrink: 0 }} />
                <div className="grow min-w-0"><div style={{ font: `700 14px ${UI}`, color: on ? C.brass : C.ink }}>{p.name}</div><div className="truncate" style={{ font: `400 10px ${MONO}`, color: C.inkDim }}>{r.incomplete ? "awaiting inputs" : `${r.verdict} · ${fmt(r.span, 1)}m`}</div></div>
                <span onClick={(e) => { e.stopPropagation(); del(p.id); }} style={{ color: C.inkDim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</span>
              </div>); })}
          </div>
          <button onClick={add} className="cs-btn w-full mt-2 px-3 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 13px ${UI}`, boxShadow: `0 2px 10px ${C.cyanDeep}33` }}>+ Add balcony</button>
        </aside>

        <main className="grow min-w-0">
          <div className="cs-card rounded-xl relative" style={{ backgroundColor: C.surf, backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${C.surf} 0%, ${C.surf2} 100%)`, border: `1px solid ${C.line}`, minHeight: 250, overflow: "hidden" }}>
            {sel ? (
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div><div style={{ font: `700 18px ${UI}`, color: C.ink }}>{sel.name}</div><div style={{ font: `500 11px ${MONO}`, color: C.inkDim }}>Cantilever balcony</div></div>
                  {R && !R.incomplete && <VerdictBadge verdict={R.verdict} size="lg" />}
                </div>
                <div style={{ height: 205, marginTop: 4 }}><CantileverView p={sel} /></div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6" style={{ minHeight: 250 }}>
                <div style={{ font: `400 24px ${SERIF}`, color: C.ink }}>Start a cantilever balcony</div>
                <div style={{ font: `400 14px ${UI}`, color: C.inkDim, maxWidth: 380, marginTop: 6, lineHeight: 1.5 }}>Add a case, enter spans, thickness and the factored beam-face moment.</div>
                <button onClick={add} className="cs-btn mt-5 px-5 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 14px ${UI}`, boxShadow: `0 3px 14px ${C.cyanDeep}3a` }}>+ Add your first balcony</button>
              </div>
            )}
          </div>

          {R && !R.incomplete && (
            <div className="mt-3 csin" key={sel.id}>
              <Group title="Section" accent={C.teal} cols="grid-cols-2 sm:grid-cols-4">
                <RVal accent={C.teal} name="Total span" sym="S" val={fmt(R.span, 2)} unit="m" />
                <RVal accent={C.teal} name="Average depth" sym="D̄" val={fmt(R.avg)} unit="mm" />
                <RVal accent={C.teal} name="Effective d" sym="d" val={fmt(R.d)} unit="mm" />
                <RVal accent={R.thkChk === "Can Proceed" ? C.green : C.red} name="Depth check" sym="S/12" val={R.thkChk} color={R.thkChk === "Can Proceed" ? C.green : C.red} />
              </Group>
              <Group title="Flexure" accent={C.brass} cols="grid-cols-2 sm:grid-cols-4">
                <RVal accent={C.brass} name="Mu/bd²" sym="" val={fmt(R.MuBd2, 3)} unit="N/mm²" />
                <RVal accent={C.brass} name="Steel %" sym="pt" val={R.inadequate ? "—" : fmt(R.pt, 3)} unit="%" color={R.inadequate ? C.red : undefined} />
                <RVal accent={C.brass} name="Ast" sym="Ast" val={R.inadequate ? "—" : fmt(R.AstCm2, 2)} unit="cm²/m" />
                <RVal accent={C.brass} name={`Req. spacing Ø${sel.mainDia}`} sym="S" val={R.reqSp ? fmt(R.reqSp, 1) : "—"} unit="mm c/c" />
              </Group>
              <Group title="Deflection check (L/d = 7)" accent={R.deflOK ? C.green : sColor(R.verdict)} cols="grid-cols-2 sm:grid-cols-4">
                <RVal accent={C.inkDim} name="Basic req. depth" sym="dreq0" val={fmt(R.dReq0, 1)} unit="mm" />
                <RVal accent={C.inkDim} name="MF tension" sym="MFt" val={isFinite(R.MFt) ? fmt(R.MFt, 3) : "—"} />
                <RVal accent={C.inkDim} name="MF compression" sym="MFc" val={fmt(R.MFc, 3)} />
                <RVal accent={sColor(R.verdict)} name="Required depth" sym="dreq" val={isFinite(R.dReq) ? fmt(R.dReq, 1) : "—"} unit="mm" color={sColor(R.verdict)} />
              </Group>
              {R.inadequate && <div className="mt-3 px-4 py-3 rounded-lg" style={{ background: `${C.red}12`, border: `1px solid ${C.red}44`, color: C.red, font: `600 13px ${UI}` }}>Mu/bd² exceeds the singly-reinforced limit for M{sel.fck} — increase thickness or grade.</div>}
              <div className="mt-4">
                <button onClick={() => setShowWork((v) => !v)} className="cs-btn px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.ink2, background: C.surf, font: `600 12px ${UI}` }}>{showWork ? "Hide calculation details" : "Show calculation details"}</button>
                {showWork && <div className="mt-2 csin"><FormulaLedger F={F} ready={kReady} /></div>}
              </div>
            </div>
          )}
          {R?.incomplete && <div className="mt-3 px-4 py-6 rounded text-center" style={{ background: C.surf, border: `1px dashed ${C.line}`, color: C.inkDim, font: `500 14px ${UI}` }}>Enter {R.missing.join(", ")} on the right.</div>}
        </main>

        {sel && (
          <aside className="lg:w-72 shrink-0 space-y-4">
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="CASE" accent={C.brass} />
              <Field text label="Name" value={sel.name} onChange={(v) => upd(sel.id, "name", v)} />
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="GEOMETRY" accent={C.teal} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Span S1" hint="S1" unit="m" value={sel.S1} onChange={(v) => upd(sel.id, "S1", v)} />
                <Field label="Span S2" hint="S2" unit="m" value={sel.S2} onChange={(v) => upd(sel.id, "S2", v)} />
                <Field label="Thickness at S1" hint="t1" unit="mm" value={sel.thk1} onChange={(v) => upd(sel.id, "thk1", v)} />
                <Field label="Thickness at S2" hint="t2" unit="mm" value={sel.thk2} onChange={(v) => upd(sel.id, "thk2", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="MATERIAL & MOMENT" accent={C.violet} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Concrete grade" hint="fck" unit="N/mm²" value={sel.fck} onChange={(v) => upd(sel.id, "fck", v)} />
                <Field label="Steel grade" hint="fy" unit="N/mm²" value={sel.fy} onChange={(v) => upd(sel.id, "fy", v)} />
                <Field label="Factored moment" hint="M" unit="kNm" value={sel.M} onChange={(v) => upd(sel.id, "M", v)} />
                <Field label="Main bar Ø" hint="Ø" unit="mm" value={sel.mainDia} onChange={(v) => upd(sel.id, "mainDia", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="PROVIDED STEEL (for deflection)" accent={C.green} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tension bar Ø" hint="Ø" unit="mm" value={sel.tenDia} onChange={(v) => upd(sel.id, "tenDia", v)} />
                <Field label="Tension spacing" unit="mm" value={sel.tenSp} onChange={(v) => upd(sel.id, "tenSp", v)} />
                <Field label="Comp. bar Ø" hint="Ø" unit="mm" value={sel.compDia} onChange={(v) => upd(sel.id, "compDia", v)} />
                <Field label="Comp. spacing" unit="mm" value={sel.compSp} onChange={(v) => upd(sel.id, "compSp", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between">
                <SecHead label="PROJECT RECORD (not calculated)" accent={C.inkDim} />
                <button onClick={() => setShowRec((v) => !v)} style={{ font: `600 11px ${UI}`, color: C.inkDim }}>{showRec ? "hide" : "show"}</button>
              </div>
              {showRec && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Finishes" unit="mm" value={sel.finishes} onChange={(v) => upd(sel.id, "finishes", v)} />
                  <Field label="Floor sunk" unit="mm" value={sel.floorSunk} onChange={(v) => upd(sel.id, "floorSunk", v)} />
                  <Field label="Railing height" unit="m" value={sel.railH} onChange={(v) => upd(sel.id, "railH", v)} />
                  <Field label="Railing wall th." unit="mm" value={sel.railTh} onChange={(v) => upd(sel.id, "railTh", v)} />
                  <Field label="Live load" unit="kN/m²" value={sel.live} onChange={(v) => upd(sel.id, "live", v)} />
                  <Field label="Extra moment" unit="kNm" value={sel.extraM} onChange={(v) => upd(sel.id, "extraM", v)} />
                </div>
              )}
              <div style={{ font: `400 10.5px ${MONO}`, color: C.inkDim, marginTop: showRec ? 8 : 0, lineHeight: 1.5 }}>These match the sheet but don't feed the moment — enter the factored moment above directly.</div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
