import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { C, UI, MONO, SERIF, fmt, sColor } from "../theme.js";
import { Field, FormSec, FormulaLedger, useKaTeX, ThemeToggle, VerdictBadge, countBlank, blankMsg, useNumText } from "../components/ui.jsx";
import Feedback from "../components/Feedback.jsx";

/* =====================================================================
   ISOLATED FOOTING DESIGN  (biaxial, IS 456:2000)
   Reproduces "Isolated footing FLAT (1).xlsx" EXACTLY — verified against
   the sheet's worked footings F1/F2/F3 by scripts/verify-footing.mjs
   (92/92 cells match). Constants kept literally as the sheet:
     • effective depth  dx = D−cover−24 , dz = D−cover−8   (fixed offsets)
     • gross soil pressure uses axial ×1.1 , ÷ load factor
     • min steel = 85/fy %   ·   AP = 1.005·fy/fck
     • min-depth factor 3.32   ·   punch permissible = √fck / 4
   Each footing carries N load COMBINATIONS (LF, axial P, Mux, Muz …);
   soil pressure is checked per combo, design moments / depth take the
   envelope MAX across combos — exactly like the sheet's paired rows.
   Pux, Puz, Muy are recorded but inert (do not feed the calc, per sheet).
   ===================================================================== */

const sq = Math.sqrt;

/* one load-combination line = one sheet row (columns R..BW) */
function computeCombo(c) {
  const { LF, P, Mux, Muz, Lx, Lz, Dprov, Pedx, Pedz, plat, fck, fy, cover, dia, spX, spZ } = c;
  const K = Mux, L = Muz, Q = Dprov;
  const base = (P * 1.1) / Lx / Lz;
  const mx = (6 * K) / Lx / Lz / Lz, mz = (6 * L) / Lz / Lx / Lx;
  const p1 = (base + mx + mz) / LF, p2 = (base + mx - mz) / LF;
  const p3 = (base - mx + mz) / LF, p4 = (base - mx - mz) / LF;
  const pavg = (p1 + p2 + p3 + p4) / 4;
  const pdes = (P / Lx / Lz + (6 * K) / Lx / Lz / Lz + (6 * L) / Lz / Lx / Lx) / LF;
  const Bx = Lx * 1000, Bz = Lz * 1000;
  const Mux_d = (pdes * (Lx - Pedx / 1000) ** 2 / 8) * LF * Lz;
  const Muz_d = (pdes * (Lz - Pedz / 1000) ** 2 / 8) * LF * Lx;
  const dx = Dprov - cover - 24, dz = Dprov - cover - 8;
  const MuBd2x = (Mux_d * 1e6) / Bz / dx / dx, MuBd2z = (Muz_d * 1e6) / Bx / dz / dz;
  const AP = (1.005 * fy) / fck;
  const Qx = MuBd2x / 0.87 / fy, Qz = MuBd2z / 0.87 / fy;
  const discX = 1 - 4 * AP * Qx, discZ = 1 - 4 * AP * Qz;
  const overX = discX < 0, overZ = discZ < 0;
  const ptx = overX ? NaN : Math.max((100 * (1 - sq(discX))) / 2 / AP, 85 / fy);
  const ptz = overZ ? NaN : Math.max((100 * (1 - sq(discZ))) / 2 / AP, 85 / fy);
  const Astx = (ptx * Bz * dx) / 100 / Lz, Astz = (ptz * Bx * dz) / 100 / Lx;
  const spx = (3.142 * dia * dia) / 4 / Astx * 1000, spz = (3.142 * dia * dia) / 4 / Astz * 1000;
  const AstxP = (0.785 * dia * dia * 1000) / spX, AstzP = (0.785 * dia * dia * 1000) / spZ;
  const ratx = ((Bx - Pedx) / 2 - dx) / ((Bx - Pedx) / 2 - plat);
  const trTopX = Bx - (Bx - Pedx - 2 * plat) * ratx, trDx = (Dprov - Q) * ratx + Q;
  const trAx = Bx * Q + ((Bx + trTopX) / 2) * (trDx - Q);
  const VuX = ((Bx - Pedx) / 2 - dx) / 1000 * Lz * pdes;
  const ratz = ((Bz - Pedz) / 2 - dz) / ((Bz - Pedz) / 2 - plat);
  const trTopZ = Bz - (Bz - Pedz - 2 * plat) * ratz, trDz = (Dprov - Q) * ratz + Q;
  const trAz = Bz * Q + ((Bz + trTopZ) / 2) * (trDz - Q);
  const VuZ = ((Bz - Pedz) / 2 - dz) / 1000 * Lx * pdes;
  const tauX = (VuX * 1000 * LF) / trAx, tauZ = (VuZ * 1000 * LF) / trAz;
  const betaX = (0.8 * fck) / 6.89 / AstxP * trAx / 100;
  const tauPx = (0.85 * sq(0.8 * fck) * (sq(1 + 5 * betaX) - 1)) / 6 / betaX * 2;
  const betaZ = (0.8 * fck) / 6.89 / AstzP * trAz / 100;
  const tauPz = (0.85 * sq(0.8 * fck) * (sq(1 + 5 * betaZ) - 1)) / 6 / betaZ * 2;
  const punchF = (Lx * Lz - ((Pedx + dx) * (Pedz + dz)) / 1e6) * pavg * LF;
  const punchA = (Pedx + dx + Pedz + dz) * 2 * dx;
  const punchS = (punchF * 1000) / punchA, punchP = sq(fck) / 4;
  const maxP = Math.max(p1, p2, p3, p4), minP = Math.min(p1, p2, p3, p4);
  return { p1, p2, p3, p4, pavg, pdes, maxP, minP, Bx, Bz, Mux_d, Muz_d, dx, dz, MuBd2x, MuBd2z, AP, overX, overZ, ptx, ptz, Astx, Astz, spx, spz, AstxP, AstzP, trAx, VuX, trAz, VuZ, tauX, tauZ, tauPx, tauPz, punchF, punchA, punchS, punchP };
}

/* whole footing: run every combo + envelope the design & pass/fail checks */
function computeFooting(f) {
  const nb = countBlank(f, ["Lx", "Lz", "Dprov", "SBC", "Pedx", "Pedz", "plat", "fck", "fy", "cover", "dia", "spX", "spZ"]) + f.combos.reduce((n, c) => n + countBlank(c, ["LF", "P", "Mux", "Muz"]), 0);
  if (nb) return { incomplete: true, missing: blankMsg(nb) };
  const missing = [];
  if (!(f.Lx > 0)) missing.push("Lx");
  if (!(f.Lz > 0)) missing.push("Lz");
  if (!(f.Dprov > 0)) missing.push("D");
  if (!(f.SBC > 0)) missing.push("SBC");
  if (!f.combos.length || !f.combos.some((c) => c.P > 0)) missing.push("a load combination");
  if (missing.length) return { incomplete: true, missing };

  const shared = { Lx: f.Lx, Lz: f.Lz, Dprov: f.Dprov, Pedx: f.Pedx, Pedz: f.Pedz, plat: f.plat, fck: f.fck, fy: f.fy, cover: f.cover, dia: f.dia, spX: f.spX, spZ: f.spZ };
  const rows = f.combos.map((c) => ({ combo: c, r: computeCombo({ ...shared, LF: c.LF || 1, P: c.P || 0, Mux: c.Mux || 0, Muz: c.Muz || 0 }) }));
  const R = rows.map((x) => x.r);

  const maxCorner = Math.max(...R.map((r) => r.maxP));
  const minCorner = Math.min(...R.map((r) => r.minP));
  const govX = rows.reduce((a, b) => (b.r.Mux_d > a.r.Mux_d ? b : a));
  const govZ = rows.reduce((a, b) => (b.r.Muz_d > a.r.Muz_d ? b : a));
  const AEmax = govX.r.Mux_d;
  const minDreqd = sq((AEmax * 1e6) / 3.32 / (f.Lx * 1000)) + f.cover + 10;

  // worst shear & punching across combos
  const shearWorst = R.reduce((a, r) => (Math.max(r.tauX / r.tauPx, r.tauZ / r.tauPz) > Math.max(a.tauX / a.tauPx, a.tauZ / a.tauPz) ? r : a));
  const punchWorst = R.reduce((a, r) => (r.punchS / r.punchP > a.punchS / a.punchP ? r : a));

  const pressureOK = maxCorner <= f.SBC && minCorner >= 0;
  const depthOK = f.Dprov >= minDreqd;
  const shearOK = R.every((r) => r.tauX <= r.tauPx && r.tauZ <= r.tauPz);
  const punchOK = R.every((r) => r.punchS <= r.punchP);
  const AstxProv = govX.r.AstxP, AstzProv = govZ.r.AstzP;
  const steelOK = !govX.r.overX && !govZ.r.overZ && AstxProv >= govX.r.Astx && AstzProv >= govZ.r.Astz;

  const checks = { pressureOK, depthOK, shearOK, punchOK, steelOK };
  const allOK = pressureOK && depthOK && shearOK && punchOK && steelOK;
  const verdict = allOK ? "SAFE" : !pressureOK || !depthOK || govX.r.overX || govZ.r.overZ ? "REDESIGN" : "UNSAFE";

  return {
    incomplete: false, rows, R, maxCorner, minCorner, minDreqd, govX: govX.r, govZ: govZ.r, govXcombo: govX.combo, govZcombo: govZ.combo,
    shearWorst, punchWorst, AstxProv, AstzProv, checks, verdict,
  };
}

/* ---- formula ledger for the governing x-combination ---- */
function buildFormulas(f, res) {
  if (res.incomplete) return [];
  const d2 = (v) => fmt(v, 2), d3 = (v) => fmt(v, 3), d0 = (v) => fmt(v, 0), d4 = (v) => fmt(v, 4);
  const gx = res.govX, gz = res.govZ;
  const F = [];
  F.push({ label: "Gross soil pressure", sym: "p = \\dfrac{1.1P/A \\pm 6M_x/L_xL_z^2 \\pm 6M_z/L_zL_x^2}{LF}", sub: `A=${d2(f.Lx * f.Lz)}\\,m^2`, val: `${d2(res.maxCorner)} / ${d2(res.minCorner)} kN/m²`, cl: `SBC ${f.SBC}` });
  F.push({ label: "Net design pressure", sym: "p_{des} = \\dfrac{P/A + 6M_x/L_xL_z^2 + 6M_z/L_zL_x^2}{LF}", val: `${d2(gx.pdes)} kN/m²`, cl: "for BM" });
  F.push({ label: "Design moment Mux", sym: "M_{ux} = p_{des}\\dfrac{(L_x - a_x)^2}{8}\\,LF\\,L_z", sub: `a_x=${d0(f.Pedx)}mm`, val: `${d2(gx.Mux_d)} kN·m`, cl: "cantilever" });
  F.push({ label: "Effective depth", sym: "d_x = D - c - 24,\\ \\ d_z = D - c - 8", sub: `${f.Dprov}-${f.cover}`, val: `${d0(gx.dx)} / ${d0(gx.dz)} mm`, cl: "sheet" });
  F.push({ label: "Min depth reqd", sym: "d_{min} = \\sqrt{\\dfrac{M_{ux}\\cdot10^6}{3.32\\,L_x}} + c + 10", sub: `M_{ux}=${d2(gx.Mux_d)}`, val: `${d2(res.minDreqd)} mm vs ${f.Dprov}`, cl: "singly reinf" });
  F.push({ label: "Steel % (x)", sym: "p_t = \\max\\!\\Big(\\tfrac{100}{2AP}\\big(1-\\sqrt{1-4\\,AP\\,\\tfrac{M/bd^2}{0.87f_y}}\\big),\\ \\tfrac{85}{f_y}\\Big)", sub: `AP=${d3(gx.AP)},\\ M/bd^2=${d3(gx.MuBd2x)}`, val: `${gx.overX ? "OVER" : d3(gx.ptx)} %`, cl: "IS 456" });
  F.push({ label: "Steel area (x)", sym: "A_{st,x} = \\dfrac{p_t\\,B_z\\,d_x}{100\\,L_z}", sub: `\\phi=${f.dia}`, val: `${gx.overX ? "—" : d0(gx.Astx)} mm²/m`, cl: `@ ${d0(gx.spx)} c/c` });
  F.push({ label: "Steel provided (x)", sym: "A_{st,prov} = \\dfrac{0.785\\,\\phi^2\\,1000}{S}", sub: `S=${f.spX}mm`, val: `${d0(res.AstxProv)} mm²/m`, cl: res.checks.steelOK ? "≥ reqd ✓" : "check" });
  F.push({ label: "One-way shear (x)", sym: "\\tau_x = \\dfrac{V_u\\,LF}{A_{trap}}\\ \\le\\ \\tau_c", sub: `V_u=${d1(gx.VuX)}kN`, val: `${d3(res.shearWorst.tauX)} vs ${d3(res.shearWorst.tauPx)}`, cl: "Cl 40" });
  F.push({ label: "Punching shear", sym: "\\tau_v = \\dfrac{P_{punch}}{b_0\\,d}\\ \\le\\ 0.25\\sqrt{f_{ck}}", sub: `P=${d1(res.punchWorst.punchF)}kN`, val: `${d3(res.punchWorst.punchS)} vs ${d2(res.punchWorst.punchP)}`, cl: "Cl 31.6" });
  return F;
}
const d1 = (v) => fmt(v, 1);

/* ---- plan-view diagram ---- */
function FootingPlan({ f, res }) {
  const w = 460, h = 300, pad = 36;
  const Lx = f.Lx > 0 ? f.Lx : 2, Lz = f.Lz > 0 ? f.Lz : 2;
  const s = Math.min((w - pad * 2) / Lx, (h - pad * 2) / Lz);
  const fw = Lx * s, fh = Lz * s, x0 = (w - fw) / 2, y0 = (h - fh) / 2;
  const px = (f.Pedx / 1000) * s, pz = (f.Pedz / 1000) * s;
  const cx = x0 + fw / 2, cy = y0 + fh / 2;
  const ok = res && !res.incomplete && res.checks.pressureOK;
  const pcol = res && !res.incomplete ? (res.checks.pressureOK ? C.green : C.red) : C.inkDim;
  const corners = res && !res.incomplete ? [res.rows[0].r.p1, res.rows[0].r.p2, res.rows[0].r.p3, res.rows[0].r.p4] : null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ display: "block" }}>
      {/* footing slab */}
      <rect x={x0} y={y0} width={fw} height={fh} rx={3} fill={C.surf2} stroke={C.teal} strokeWidth="1.8" />
      {/* one-way shear critical section (d from pedestal face) */}
      {res && !res.incomplete && (() => {
        const dxs = (res.govX.dx / 1000) * s, dzs = (res.govZ.dz / 1000) * s;
        const l = cx - px / 2 - dxs, r = cx + px / 2 + dxs, t = cy - pz / 2 - dzs, b = cy + pz / 2 + dzs;
        return <rect x={l} y={t} width={r - l} height={b - t} fill="none" stroke={C.amber} strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />;
      })()}
      {/* pedestal / column */}
      <rect x={cx - px / 2} y={cy - pz / 2} width={px} height={pz} fill={`${C.cyanDeep}22`} stroke={C.cyanDeep} strokeWidth="1.6" />
      <text x={cx} y={cy + 4} textAnchor="middle" style={{ font: `600 10px ${MONO}`, fill: C.cyanDeep }}>{f.Pedx}×{f.Pedz}</text>
      {/* reinforcement direction hints */}
      {[0.28, 0.72].map((t, i) => <line key={"h" + i} x1={x0 + 8} y1={y0 + fh * t} x2={x0 + fw - 8} y2={y0 + fh * t} stroke={C.brass} strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />)}
      {/* corner pressure readouts */}
      {corners && [[x0, y0, "start", "hanging"], [x0 + fw, y0, "end", "hanging"], [x0, y0 + fh, "start", "auto"], [x0 + fw, y0 + fh, "end", "auto"]].map(([bx, by, anch, base], i) => (
        <text key={i} x={bx + (anch === "start" ? 3 : -3)} y={by + (base === "hanging" ? 12 : -4)} textAnchor={anch} dominantBaseline={base} style={{ font: `600 9px ${MONO}`, fill: pcol }}>{fmt(corners[i], 0)}</text>
      ))}
      {/* dims */}
      <text x={cx} y={y0 + fh + 22} textAnchor="middle" style={{ font: `600 11px ${MONO}`, fill: C.ink2 }}>Lx = {f.Lx || "—"} m</text>
      <text x={x0 - 14} y={cy} textAnchor="middle" transform={`rotate(-90 ${x0 - 14} ${cy})`} style={{ font: `600 11px ${MONO}`, fill: C.ink2 }}>Lz = {f.Lz || "—"} m</text>
      <text x={x0 + fw + 16} y={y0 + 4} textAnchor="start" style={{ font: `500 9px ${MONO}`, fill: C.inkDim }}>p (kN/m²)</text>
    </svg>
  );
}

/* compact numeric cell for the load-combination table */
function NumCell({ value, onChange, text, w = 64 }) {
  const [t, h] = useNumText(value, onChange, text, /^-?[0-9]*\.?[0-9]*$/);
  const empty = !text && value == null;
  return <input value={t} onChange={h} inputMode={text ? "text" : "decimal"} placeholder={text ? "" : "—"} className="cs-field cs-in outline-none rounded-md px-2 py-1.5" style={{ width: w, font: `600 13px ${text ? UI : MONO}`, color: C.ink, background: C.surf, border: empty ? `1px dashed ${C.amber}` : `1px solid ${C.line}`, textAlign: text ? "left" : "right" }} />;
}

const DEF_COMBO = () => ({ label: "DL+LL", LF: 1, P: null, Pux: null, Puz: null, Mux: null, Muy: null, Muz: null });
const DEF_FOOTING = {
  Lx: null, Lz: null, Dprov: null, SBC: null, fdnDepth: null,
  Pedx: null, Pedz: null, plat: null,
  fck: 25, fy: 500, cover: 50, dia: null, spX: null, spZ: null,
  combos: [
    { ...DEF_COMBO() },
    { ...DEF_COMBO(), label: "DL+LL·1.5", LF: 1.5 },
  ],
};

export default function IsolatedFooting({ onBack }) {
  const [footings, setFootings] = useState([]);
  const [selId, setSelId] = useState(null);
  const [project, setProject] = useState("");
  const [showWork, setShowWork] = useState(false);
  const kReady = useKaTeX();
  const nextId = useRef(1);
  const nextComboId = useRef(1);

  const results = useMemo(() => { const o = {}; for (const f of footings) o[f.id] = computeFooting(f); return o; }, [footings]);
  const sel = footings.find((f) => f.id === selId) || null;
  const R = sel ? results[sel.id] : null;
  const safeN = footings.filter((f) => results[f.id].verdict === "SAFE").length;
  const doneN = footings.filter((f) => !results[f.id].incomplete).length;

  const upd = (id, k, v) => setFootings((fs) => fs.map((f) => (f.id === id ? { ...f, [k]: v } : f)));
  const updCombo = (fid, cid, k, v) => setFootings((fs) => fs.map((f) => (f.id === fid ? { ...f, combos: f.combos.map((c) => (c.id === cid ? { ...c, [k]: v } : c)) } : f)));
  const addCombo = (fid) => setFootings((fs) => fs.map((f) => (f.id === fid ? { ...f, combos: [...f.combos, { id: nextComboId.current++, ...DEF_COMBO() }] } : f)));
  const delCombo = (fid, cid) => setFootings((fs) => fs.map((f) => (f.id === fid ? { ...f, combos: f.combos.filter((c) => c.id !== cid) } : f)));
  const add = () => { const id = nextId.current++; const combos = DEF_FOOTING.combos.map((c) => ({ id: nextComboId.current++, ...c })); setFootings((fs) => [...fs, { id, name: "F" + id, ...DEF_FOOTING, combos }]); setSelId(id); setShowWork(false); };
  const del = (id) => { setFootings((fs) => fs.filter((f) => f.id !== id)); if (selId === id) setSelId((footings.find((f) => f.id !== id) || {}).id ?? null); };

  const exportXlsx = () => {
    const head = ["Footing", "Combo", "LF", "P(kN)", "Mux", "Muz", "maxP", "minP", "SBC", "Mux_d", "Muz_d", "dx", "dz", "MinD", "pt-x%", "Ast-x", "Sp-x", "AstProv-x", "Tau-x", "TauP-x", "Punch", "PunchP", "Verdict"];
    const rows = [];
    for (const f of footings) {
      const r = results[f.id];
      if (r.incomplete) { rows.push([f.name, "—", "", "", "", "", "", "", f.SBC, "", "", "", "", "", "", "", "", "", "", "", "", "", "INCOMPLETE"]); continue; }
      r.rows.forEach((x, i) => {
        const rr = x.r, nn = (v) => (v == null ? "" : Number.isNaN(v) ? "—" : +v.toFixed(2));
        rows.push([i ? "" : f.name, x.combo.label, x.combo.LF, x.combo.P, x.combo.Mux, x.combo.Muz, nn(rr.maxP), nn(rr.minP), f.SBC, nn(rr.Mux_d), nn(rr.Muz_d), nn(rr.dx), nn(rr.dz), i ? "" : nn(r.minDreqd), nn(rr.ptx), nn(rr.Astx), nn(rr.spx), nn(rr.AstxP), nn(rr.tauX), nn(rr.tauPx), nn(rr.punchS), nn(rr.punchP), i ? "" : r.verdict]);
      });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["CivilSpace — Isolated Footing Design (IS 456:2000)"], ["Project", project], [], head, ...rows]), "Design");
    XLSX.writeFile(wb, "civilspace_isolated_footing.xlsx");
  };

  const F = sel && R ? buildFormulas(sel, R) : [];

  return (
    <div className="min-h-screen cs-bp" style={{ color: C.ink, fontFamily: UI }}>
      {/* header */}
      <header className="px-4 pt-4 mx-auto" style={{ maxWidth: 1320 }}>
        <div className="cs-card flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
          {onBack && (
            <button onClick={onBack} className="cs-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.surf, color: C.ink2, font: `600 13px ${UI}` }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M12 8H4M7.5 4.5L4 8l3.5 3.5" stroke={C.ink2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>All
            </button>
          )}
          <div>
            <div style={{ font: `400 21px ${SERIF}`, letterSpacing: "-0.01em", color: C.ink }}>Isolated Footing Design</div>
            <div style={{ font: `400 12px ${UI}`, color: C.inkDim }}>Biaxial · IS 456:2000</div>
          </div>
          <div className="flex items-center gap-2 ml-2 px-3 py-1.5 rounded-lg" style={{ background: C.surf2, border: `1px solid ${C.line}` }}>
            <span style={{ font: `500 12px ${UI}`, color: C.inkDim }}>Project</span>
            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="untitled" className="outline-none" style={{ font: `600 14px ${MONO}`, color: C.ink, minWidth: 150, background: "transparent" }} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Feedback context="isolated-footing" inline />
            <button onClick={exportXlsx} disabled={!footings.length} className="cs-btn px-3.5 py-2 rounded-lg" style={{ font: `600 12px ${UI}`, border: `1px solid ${footings.length ? C.brass : C.line}`, color: footings.length ? C.brass : C.inkDim, background: C.surf }}>Export Excel</button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* FOOTING SCHEDULE — every footing at a glance; click a row to edit it below */}
      {footings.length > 0 && (() => {
        const th = { font: `700 11px ${UI}`, color: C.inkDim, letterSpacing: 0.8, textTransform: "uppercase", padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" };
        const td = { font: `600 13.5px ${MONO}`, color: C.ink, padding: "7px 12px", textAlign: "right", borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap" };
        const v = (x) => (x == null ? "—" : x);
        return (
          <section className="mx-auto px-4 pt-4" style={{ maxWidth: 1320 }}>
            <div className="cs-card rounded-xl overflow-hidden" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span style={{ font: `700 13px ${UI}`, color: C.ink }}>Footing schedule</span>
                <span style={{ font: `500 12px ${UI}`, color: C.inkDim }}>{safeN} of {footings.length} safe</span>
                <button onClick={add} className="cs-btn ml-auto px-3 py-1.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 13px ${UI}` }}>+ Add footing</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "left" }}>Footing</th><th style={th}>Lx × Lz (m)</th><th style={th}>D (mm)</th><th style={th}>SBC</th><th style={th}>p max</th>
                    <th style={th}>Steel x</th><th style={th}>Steel z</th><th style={{ ...th, textAlign: "left" }}>Status</th><th style={th} />
                  </tr></thead>
                  <tbody>
                    {footings.map((f) => { const r = results[f.id], on = selId === f.id, done = !r.incomplete;
                      return (
                        <tr key={f.id} onClick={() => { setSelId(f.id); setShowWork(false); }} className="cursor-pointer" style={{ background: on ? C.brassBg : "transparent", boxShadow: on ? `inset 3px 0 0 ${C.brass}` : "none" }}>
                          <td style={{ ...td, font: `700 13.5px ${UI}`, color: on ? C.brass : C.ink, textAlign: "left" }}>{f.name}</td>
                          <td style={td}>{v(f.Lx)} × {v(f.Lz)}</td><td style={td}>{v(f.Dprov)}</td><td style={td}>{v(f.SBC)}</td>
                          <td style={{ ...td, color: done && !r.checks.pressureOK ? C.red : C.ink }}>{done ? fmt(r.maxCorner, 0) : "—"}</td>
                          <td style={td}>{done ? `Ø${f.dia} @ ${f.spX}` : "—"}</td><td style={td}>{done ? `Ø${f.dia} @ ${f.spZ}` : "—"}</td>
                          <td style={{ ...td, font: `600 12.5px ${UI}`, color: sColor(r.verdict), textAlign: "left" }}>● {done ? r.verdict.toLowerCase() : "awaiting inputs"}</td>
                          <td style={{ ...td, width: 32 }}><span onClick={(e) => { e.stopPropagation(); del(f.id); }} title="Remove footing" style={{ color: C.inkDim, fontSize: 16 }}>×</span></td>
                        </tr>); })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })()}

      <div className={"mx-auto px-4 py-4 grid grid-cols-1 gap-4 items-start " + (sel ? "lg:grid-cols-[400px_minmax(0,1fr)]" : "")} style={{ maxWidth: 1320 }}>
        {/* LEFT — compact input form for the selected footing */}
        {sel && (
          <aside className="cs-card rounded-xl px-4 py-3 lg:sticky lg:top-4" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
            <Field compact text label="Footing mark" value={sel.name} onChange={(v) => upd(sel.id, "name", v)} />
            <FormSec title="Footing" />
            <Field compact label="Size" hint="Lx" unit="m" value={sel.Lx} onChange={(v) => upd(sel.id, "Lx", v)} />
            <Field compact label="Size" hint="Lz" unit="m" value={sel.Lz} onChange={(v) => upd(sel.id, "Lz", v)} />
            <Field compact label="Depth provided" hint="D" unit="mm" value={sel.Dprov} onChange={(v) => upd(sel.id, "Dprov", v)} />
            <Field compact label="Safe bearing capacity" hint="SBC" unit="kN/m²" value={sel.SBC} onChange={(v) => upd(sel.id, "SBC", v)} />
            <FormSec title="Pedestal / column" />
            <Field compact label="Pedestal size" hint="ax" unit="mm" value={sel.Pedx} onChange={(v) => upd(sel.id, "Pedx", v)} />
            <Field compact label="Pedestal size" hint="az" unit="mm" value={sel.Pedz} onChange={(v) => upd(sel.id, "Pedz", v)} />
            <Field compact label="Platform width" unit="mm" value={sel.plat} onChange={(v) => upd(sel.id, "plat", v)} />
            <FormSec title="Materials & bars" />
            <Field compact label="Concrete grade" hint="fck" unit="N/mm²" value={sel.fck} onChange={(v) => upd(sel.id, "fck", v)} />
            <Field compact label="Steel grade" hint="fy" unit="N/mm²" value={sel.fy} onChange={(v) => upd(sel.id, "fy", v)} />
            <Field compact label="Clear cover" hint="c" unit="mm" value={sel.cover} onChange={(v) => upd(sel.id, "cover", v)} />
            <Field compact label="Bar diameter" hint="Ø" unit="mm" value={sel.dia} onChange={(v) => upd(sel.id, "dia", v)} />
            <Field compact label="Spacing provided, x" unit="mm" value={sel.spX} onChange={(v) => upd(sel.id, "spX", v)} />
            <Field compact label="Spacing provided, z" unit="mm" value={sel.spZ} onChange={(v) => upd(sel.id, "spZ", v)} />
            <FormSec title="Load combinations" right={<button onClick={() => addCombo(sel.id)} style={{ font: `600 11.5px ${UI}`, color: C.brass }}>+ add combination</button>} />
            <div className="grid gap-1.5 mt-1.5" style={{ gridTemplateColumns: "1fr 46px 58px 64px 66px 16px" }}>
              {["Case", "LF", "P (kN)", "Mux", "Muz", ""].map((hh, i) => <span key={i} style={{ font: `600 11px ${UI}`, color: C.inkDim, textAlign: hh === "Case" ? "left" : "right" }}>{hh}</span>)}
              {sel.combos.map((c) => (
                <React.Fragment key={c.id}>
                  <NumCell text w={"100%"} value={c.label} onChange={(v) => updCombo(sel.id, c.id, "label", v)} />
                  <NumCell w={"100%"} value={c.LF} onChange={(v) => updCombo(sel.id, c.id, "LF", v)} />
                  <NumCell w={"100%"} value={c.P} onChange={(v) => updCombo(sel.id, c.id, "P", v)} />
                  <NumCell w={"100%"} value={c.Mux} onChange={(v) => updCombo(sel.id, c.id, "Mux", v)} />
                  <NumCell w={"100%"} value={c.Muz} onChange={(v) => updCombo(sel.id, c.id, "Muz", v)} />
                  <button onClick={() => delCombo(sel.id, c.id)} style={{ color: C.inkDim, fontSize: 15, lineHeight: 1 }} title="Remove combination">×</button>
                </React.Fragment>
              ))}
            </div>
            <div style={{ font: `400 11px/1.5 ${UI}`, color: C.inkDim, marginTop: 8 }}>P = axial load, Mux / Muz = base moments (kN·m). Soil pressure is checked for every combination; moments and depth use the worst one.</div>
          </aside>
        )}

        {/* RIGHT — plan + answer + checks */}
        <main className="min-w-0">
          {sel ? (
            <>
              <div className="cs-card rounded-xl px-4 pt-3 pb-1" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                <div className="flex items-start justify-between">
                  <div><div style={{ font: `700 18px ${UI}`, color: C.ink }}>{sel.name}</div><div style={{ font: `400 12px ${UI}`, color: C.inkDim }}>Plan · {sel.combos.length} load combination{sel.combos.length === 1 ? "" : "s"}</div></div>
                  {R && !R.incomplete && <VerdictBadge verdict={R.verdict} size="lg" />}
                </div>
                <div style={{ height: 250 }}><FootingPlan f={sel} res={R} /></div>
              </div>

              {R && !R.incomplete && (() => {
                const gx = R.govX, gz = R.govZ;
                const xOK = !gx.overX && R.AstxProv >= gx.Astx, zOK = !gz.overZ && R.AstzProv >= gz.Astz;
                const sw = R.shearWorst, pw = R.punchWorst;
                const checks = [
                  ["Soil pressure (max corner)", fmt(R.maxCorner, 1), `≤ ${fmt(sel.SBC, 0)}`, "kN/m²", R.maxCorner <= sel.SBC],
                  ["Soil pressure (min corner)", fmt(R.minCorner, 1), "≥ 0", "kN/m²", R.minCorner >= 0],
                  ["Depth", fmt(sel.Dprov, 0), `≥ ${fmt(R.minDreqd, 0)}`, "mm", R.checks.depthOK],
                  ["Steel area, x", fmt(R.AstxProv, 0), gx.overX ? "section over-reinforced" : `≥ ${fmt(gx.Astx, 0)}`, "mm²/m", xOK],
                  ["Steel area, z", fmt(R.AstzProv, 0), gz.overZ ? "section over-reinforced" : `≥ ${fmt(gz.Astz, 0)}`, "mm²/m", zOK],
                  ["One-way shear, x", fmt(sw.tauX, 3), `≤ ${fmt(sw.tauPx, 3)}`, "N/mm²", sw.tauX <= sw.tauPx],
                  ["One-way shear, z", fmt(sw.tauZ, 3), `≤ ${fmt(sw.tauPz, 3)}`, "N/mm²", sw.tauZ <= sw.tauPz],
                  ["Punching shear", fmt(pw.punchS, 3), `≤ ${fmt(pw.punchP, 3)}`, "N/mm²", pw.punchS <= pw.punchP],
                ];
                const th = { font: `700 11px ${UI}`, color: C.inkDim, letterSpacing: 1, textTransform: "uppercase", padding: "8px 14px", textAlign: "right" };
                const td = { font: `600 14px ${MONO}`, color: C.ink, padding: "8px 14px", textAlign: "right", borderTop: `1px solid ${C.line}` };
                return (
                  <div className="mt-3 space-y-3 csin" key={sel.id}>
                    {/* 1 — the answer: bottom mesh each way */}
                    <div className="cs-card rounded-xl grid grid-cols-1 sm:grid-cols-2" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                      {[["Bottom steel, x", sel.spX, R.AstxProv, gx.Astx, gx.spx, gx.overX, xOK], ["Bottom steel, z", sel.spZ, R.AstzProv, gz.Astz, gz.spz, gz.overZ, zOK]].map(([t, sp, prov, req, spReq, over, ok], i) => (
                        <div key={t} className="px-5 py-4" style={{ borderLeft: i ? `1px solid ${C.line}` : "none" }}>
                          <div style={{ font: `600 13px ${UI}`, color: C.inkDim }}>{t}</div>
                          <div style={{ font: `700 30px ${MONO}`, color: ok ? C.ink : C.red, marginTop: 2 }}>Ø{sel.dia} @ {sp}<span style={{ font: `500 14px ${MONO}`, color: C.inkDim }}> mm c/c</span></div>
                          <div style={{ font: `400 12.5px ${UI}`, color: ok ? C.inkDim : C.red }}>
                            {over ? "Section over-reinforced — increase depth" : `Provides ${fmt(prov, 0)} mm²/m vs ${fmt(req, 0)} required · max spacing ${fmt(spReq, 0)} mm`}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 2 — every check on one table */}
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
                            Governing combination: x — {R.govXcombo.label}, z — {R.govZcombo.label} · d<sub>x</sub> / d<sub>z</sub> = {fmt(gx.dx, 0)} / {fmt(gz.dz, 0)} mm ·
                            p<sub>t,x</sub> = {gx.overX ? "—" : fmt(gx.ptx, 3)}% · p<sub>t,z</sub> = {gz.overZ ? "—" : fmt(gz.ptz, 3)}% · punching force = {fmt(pw.punchF, 0)} kN
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
              <div style={{ font: `400 24px ${SERIF}`, color: C.ink }}>Start an isolated footing</div>
              <div style={{ font: `400 14px ${UI}`, color: C.inkDim, maxWidth: 400, marginTop: 6, lineHeight: 1.5 }}>Add a footing, then fill in its size, pedestal, bars and load combinations on the left.</div>
              <button onClick={add} className="cs-btn mt-5 px-5 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 14px ${UI}` }}>+ Add your first footing</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
