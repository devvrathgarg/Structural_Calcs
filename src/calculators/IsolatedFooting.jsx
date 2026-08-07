import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { C, UI, MONO, SERIF, fmt, sColor } from "../theme.js";
import { Field, RVal, Group, SecHead, FormulaLedger, useKaTeX, ThemeToggle, VerdictBadge } from "../components/ui.jsx";
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
  const gx = res.govX, gz = res.govZ, c = res.govXcombo;
  const F = [];
  F.push({ label: "Gross soil pressure", sym: "p = \\dfrac{1.1P/A \\pm 6M_x/L_xL_z^2 \\pm 6M_z/L_zL_x^2}{LF}", sub: `A=${d2(f.Lx * f.Lz)}\\,m^2`, val: `${d2(res.maxCorner)} / ${d2(res.minCorner)} kN/m²`, cl: `SBC ${f.SBC}` });
  F.push({ label: "Net design pressure", sym: "p_{des} = \\dfrac{P/A + 6M_x/L_xL_z^2 + 6M_z/L_zL_x^2}{LF}", sub: `combo ${c.label}`, val: `${d2(gx.pdes)} kN/m²`, cl: "for BM" });
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
  const w = 460, h = 300, pad = 54;
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
  const [t, setT] = useState(value != null && value !== "" ? String(value) : "");
  React.useEffect(() => { if (text) { if (String(value) !== t) setT(value ?? ""); } else { const n = parseFloat(t); if (!((n === value) || (t === "" && !value))) setT(value ? String(value) : ""); } }, [value]);
  const h = (e) => { const raw = e.target.value; if (text) { setT(raw); onChange(raw); return; } if (/^-?[0-9]*\.?[0-9]*$/.test(raw)) { setT(raw); const n = parseFloat(raw); onChange(isNaN(n) ? 0 : n); } };
  return <input value={t} onChange={h} inputMode={text ? "text" : "decimal"} className="cs-field cs-in outline-none rounded-md px-2 py-1.5" style={{ width: w, font: `600 13px ${text ? UI : MONO}`, color: C.ink, background: C.surf, border: `1px solid ${C.line}`, textAlign: text ? "left" : "right" }} />;
}

const DEF_COMBO = () => ({ label: "DL+LL", LF: 1, P: 0, Pux: 0, Puz: 0, Mux: 0, Muy: 0, Muz: 0 });
const DEF_FOOTING = {
  Lx: 1.8, Lz: 2, Dprov: 300, SBC: 134, fdnDepth: 0,
  Pedx: 300, Pedz: 600, plat: 0,
  fck: 25, fy: 500, cover: 50, dia: 10, spX: 150, spZ: 150,
  combos: [
    { label: "DL+LL", LF: 1, P: 420, Pux: 1.362, Puz: 0.829, Mux: 0.879, Muy: 0.042, Muz: 1.355 },
    { label: "DL+LL·1.5", LF: 1.5, P: 630, Pux: -9.29, Puz: 0.44, Mux: 0.221, Muy: 0, Muz: -5.537 },
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
      <header className="px-4 pt-4 mx-auto" style={{ maxWidth: 1480 }}>
        <div className="cs-card flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
          {onBack && (
            <button onClick={onBack} className="cs-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.surf, color: C.ink2, font: `600 13px ${UI}` }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M12 8H4M7.5 4.5L4 8l3.5 3.5" stroke={C.ink2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>All
            </button>
          )}
          <div>
            <div style={{ font: `400 21px ${SERIF}`, letterSpacing: "-0.01em", color: C.ink }}>Isolated Footing <span style={{ color: C.cyan, fontStyle: "italic" }}>Design</span></div>
            <div style={{ font: `500 10px ${MONO}`, color: C.inkDim, letterSpacing: 1 }}>BIAXIAL · IS 456:2000</div>
          </div>
          <div className="flex items-center gap-2 ml-2 px-3 py-1.5 rounded-lg" style={{ background: C.surf2, border: `1px solid ${C.line}` }}>
            <span style={{ font: `600 10px ${MONO}`, color: C.inkDim }}>PROJECT</span>
            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="untitled" className="outline-none" style={{ font: `600 14px ${MONO}`, color: C.ink, minWidth: 150, background: "transparent" }} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Feedback context="isolated-footing" inline />
            <button onClick={exportXlsx} disabled={!footings.length} className="cs-btn px-3.5 py-2 rounded-lg" style={{ font: `600 12px ${UI}`, border: `1px solid ${footings.length ? C.brass : C.line}`, color: footings.length ? C.brass : C.inkDim, background: C.surf }}>Export Excel</button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto px-4 py-4 flex flex-col lg:flex-row gap-4" style={{ maxWidth: 1480 }}>
        {/* footing list */}
        <aside className="lg:w-52 shrink-0">
          <div className="flex items-center justify-between mb-2"><span style={{ font: `600 10px ${MONO}`, color: C.inkDim, letterSpacing: 1 }}>FOOTINGS</span>{footings.length > 0 && <span style={{ font: `600 11px ${MONO}`, color: C.inkDim }}>{safeN}/{doneN} safe</span>}</div>
          <div className="space-y-1.5">
            {footings.map((f) => { const r = results[f.id], on = selId === f.id; return (
              <div key={f.id} onClick={() => { setSelId(f.id); setShowWork(false); }} className={"cs-panel px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-2 " + (on ? "cs-card" : "")} style={{ background: C.surf, border: `1px solid ${on ? C.brass : C.line}`, borderLeft: `3px solid ${on ? C.brass : sColor(r.verdict)}` }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: sColor(r.verdict), flexShrink: 0 }} />
                <div className="grow min-w-0"><div style={{ font: `700 14px ${UI}`, color: on ? C.brass : C.ink }}>{f.name}</div><div className="truncate" style={{ font: `400 10px ${MONO}`, color: C.inkDim }}>{r.incomplete ? "awaiting inputs" : `${r.verdict} · ${f.Lx}×${f.Lz}m`}</div></div>
                <span onClick={(e) => { e.stopPropagation(); del(f.id); }} style={{ color: C.inkDim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</span>
              </div>); })}
          </div>
          <button onClick={add} className="cs-btn w-full mt-2 px-3 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 13px ${UI}`, boxShadow: `0 2px 10px ${C.cyanDeep}33` }}>+ Add footing</button>
        </aside>

        {/* center */}
        <main className="grow min-w-0">
          <div className="cs-card rounded-xl relative" style={{ backgroundColor: C.surf, backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${C.surf} 0%, ${C.surf2} 100%)`, border: `1px solid ${C.line}`, minHeight: 300, overflow: "hidden" }}>
            {sel ? (
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div><div style={{ font: `400 22px ${SERIF}`, color: C.ink }}>{sel.name}</div><div style={{ font: `500 11px ${MONO}`, color: C.inkDim }}>{sel.combos.length} load combination{sel.combos.length === 1 ? "" : "s"} · plan</div></div>
                  {R && !R.incomplete && <VerdictBadge verdict={R.verdict} size="lg" />}
                </div>
                <div style={{ height: 300, marginTop: 4 }}><FootingPlan f={sel} res={R} /></div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6" style={{ minHeight: 300 }}>
                <div style={{ font: `400 24px ${SERIF}`, color: C.ink }}>Start an isolated footing</div>
                <div style={{ font: `400 14px ${UI}`, color: C.inkDim, maxWidth: 380, marginTop: 6, lineHeight: 1.5 }}>Add a footing, enter its size, pedestal and load combinations. Soil pressure, steel and shear checks build as you type.</div>
                <button onClick={add} className="cs-btn mt-5 px-5 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 14px ${UI}`, boxShadow: `0 3px 14px ${C.cyanDeep}3a` }}>+ Add your first footing</button>
              </div>
            )}
          </div>

          {R && !R.incomplete && (
            <div className="mt-3 csin" key={sel.id}>
              <Group title="Soil bearing pressure (service)" accent={R.checks.pressureOK ? C.green : C.red} cols="grid-cols-2 sm:grid-cols-4">
                <RVal accent={C.teal} name="Max corner" sym="p,max" val={fmt(R.maxCorner, 1)} unit="kN/m²" color={R.checks.pressureOK ? undefined : C.red} />
                <RVal accent={C.teal} name="Min corner" sym="p,min" val={fmt(R.minCorner, 1)} unit="kN/m²" color={R.minCorner < 0 ? C.red : undefined} />
                <RVal accent={C.teal} name="Allowable (SBC)" sym="qa" val={fmt(sel.SBC, 0)} unit="kN/m²" />
                <RVal accent={R.checks.pressureOK ? C.green : C.red} name="Pressure check" sym="p≤SBC" val={R.checks.pressureOK ? "OK" : "HIGH"} color={R.checks.pressureOK ? C.green : C.red} />
              </Group>
              <Group title="Depth" accent={R.checks.depthOK ? C.green : C.red} cols="grid-cols-2 sm:grid-cols-4">
                <RVal accent={C.violet} name="Min depth reqd" sym="Dmin" val={fmt(R.minDreqd, 0)} unit="mm" />
                <RVal accent={C.violet} name="Provided" sym="D" val={fmt(sel.Dprov, 0)} unit="mm" />
                <RVal accent={C.violet} name="Eff. depth x / z" sym="dx,dz" val={`${fmt(R.govX.dx, 0)}/${fmt(R.govZ.dz, 0)}`} unit="mm" />
                <RVal accent={R.checks.depthOK ? C.green : C.red} name="Depth check" sym="D≥Dmin" val={R.checks.depthOK ? "OK" : "INCREASE"} color={R.checks.depthOK ? C.green : C.red} />
              </Group>
              <Group title="Reinforcement" accent={C.brass} cols="grid-cols-2 sm:grid-cols-4">
                <RVal accent={C.brass} name="Steel % (x)" sym="pt,x" val={R.govX.overX ? "OVER" : fmt(R.govX.ptx, 3)} unit="%" color={R.govX.overX ? C.red : undefined} />
                <RVal accent={C.brass} name="Ast reqd (x)" sym="Ast,x" val={R.govX.overX ? "—" : fmt(R.govX.Astx, 0)} unit="mm²/m" />
                <RVal accent={C.brass} name={`Spacing reqd Ø${sel.dia} (x)`} sym="Sx" val={R.govX.overX ? "—" : fmt(R.govX.spx, 0)} unit="mm" />
                <RVal accent={R.checks.steelOK ? C.green : C.red} name={`Provided (x) @${sel.spX}`} sym="Ast,prov" val={fmt(R.AstxProv, 0)} unit="mm²/m" color={R.checks.steelOK ? C.green : C.red} />
                <RVal accent={C.brass} name="Steel % (z)" sym="pt,z" val={R.govZ.overZ ? "OVER" : fmt(R.govZ.ptz, 3)} unit="%" color={R.govZ.overZ ? C.red : undefined} />
                <RVal accent={C.brass} name="Ast reqd (z)" sym="Ast,z" val={R.govZ.overZ ? "—" : fmt(R.govZ.Astz, 0)} unit="mm²/m" />
                <RVal accent={C.brass} name={`Spacing reqd Ø${sel.dia} (z)`} sym="Sz" val={R.govZ.overZ ? "—" : fmt(R.govZ.spz, 0)} unit="mm" />
                <RVal accent={C.brass} name={`Provided (z) @${sel.spZ}`} sym="Ast,prov" val={fmt(R.AstzProv, 0)} unit="mm²/m" />
              </Group>
              <Group title="One-way (flexural) shear" accent={R.checks.shearOK ? C.green : C.red} cols="grid-cols-2 sm:grid-cols-4">
                <RVal accent={C.ink2} name="τ acting (x)" sym="τx" val={fmt(R.shearWorst.tauX, 3)} unit="N/mm²" />
                <RVal accent={C.ink2} name="τ permissible (x)" sym="τc,x" val={fmt(R.shearWorst.tauPx, 3)} unit="N/mm²" />
                <RVal accent={C.ink2} name="τ acting (z)" sym="τz" val={fmt(R.shearWorst.tauZ, 3)} unit="N/mm²" />
                <RVal accent={R.checks.shearOK ? C.green : C.red} name="Shear check" sym="τ≤τc" val={R.checks.shearOK ? "OK" : "FAIL"} color={R.checks.shearOK ? C.green : C.red} />
              </Group>
              <Group title="Punching (two-way) shear" accent={R.checks.punchOK ? C.green : C.red} cols="grid-cols-2 sm:grid-cols-4">
                <RVal accent={C.amber} name="Punch stress" sym="τv" val={fmt(R.punchWorst.punchS, 3)} unit="N/mm²" />
                <RVal accent={C.amber} name="Permissible" sym="0.25√fck" val={fmt(R.punchWorst.punchP, 3)} unit="N/mm²" />
                <RVal accent={C.amber} name="Punch force" sym="Vp" val={fmt(R.punchWorst.punchF, 0)} unit="kN" />
                <RVal accent={R.checks.punchOK ? C.green : C.red} name="Punching check" sym="τv≤perm" val={R.checks.punchOK ? "OK" : "FAIL"} color={R.checks.punchOK ? C.green : C.red} />
              </Group>
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
          <aside className="lg:w-80 shrink-0 space-y-4">
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="FOOTING" accent={C.brass} />
              <Field text label="Footing mark" value={sel.name} onChange={(v) => upd(sel.id, "name", v)} />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Field label="Size Lx" hint="Lx" unit="m" value={sel.Lx} onChange={(v) => upd(sel.id, "Lx", v)} />
                <Field label="Size Lz" hint="Lz" unit="m" value={sel.Lz} onChange={(v) => upd(sel.id, "Lz", v)} />
                <Field label="Depth provided" hint="D" unit="mm" value={sel.Dprov} onChange={(v) => upd(sel.id, "Dprov", v)} />
                <Field label="Safe bearing cap." hint="SBC" unit="kN/m²" value={sel.SBC} onChange={(v) => upd(sel.id, "SBC", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="PEDESTAL / COLUMN" accent={C.teal} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Pedestal size x" hint="ax" unit="mm" value={sel.Pedx} onChange={(v) => upd(sel.id, "Pedx", v)} />
                <Field label="Pedestal size z" hint="az" unit="mm" value={sel.Pedz} onChange={(v) => upd(sel.id, "Pedz", v)} />
                <Field label="Platform width" hint="—" unit="mm" value={sel.plat} onChange={(v) => upd(sel.id, "plat", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="MATERIALS & BARS" accent={C.violet} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Concrete grade" hint="fck" unit="N/mm²" value={sel.fck} onChange={(v) => upd(sel.id, "fck", v)} />
                <Field label="Steel grade" hint="fy" unit="N/mm²" value={sel.fy} onChange={(v) => upd(sel.id, "fy", v)} />
                <Field label="Clear cover" hint="c" unit="mm" value={sel.cover} onChange={(v) => upd(sel.id, "cover", v)} />
                <Field label="Bar diameter" hint="Ø" unit="mm" value={sel.dia} onChange={(v) => upd(sel.id, "dia", v)} />
                <Field label="Spacing prov. x" unit="mm" value={sel.spX} onChange={(v) => upd(sel.id, "spX", v)} />
                <Field label="Spacing prov. z" unit="mm" value={sel.spZ} onChange={(v) => upd(sel.id, "spZ", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between mb-1">
                <SecHead label="LOAD COMBINATIONS" accent={C.green} />
                <button onClick={() => addCombo(sel.id)} className="cs-btn px-2 py-1 rounded-md" style={{ font: `700 11px ${MONO}`, color: C.cyanDeep, border: `1px solid ${C.cyanDeep}55`, background: `${C.cyanDeep}12` }}>+ combo</button>
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 42px 62px 58px 58px 18px" }}>
                {["Case", "LF", "P kN", "Mux", "Muz", ""].map((hh) => <span key={hh} style={{ font: `600 9px ${MONO}`, color: C.inkDim, letterSpacing: 0.4, textAlign: hh === "Case" ? "left" : "right" }}>{hh}</span>)}
                {sel.combos.map((c) => (
                  <React.Fragment key={c.id}>
                    <NumCell text w={"100%"} value={c.label} onChange={(v) => updCombo(sel.id, c.id, "label", v)} />
                    <NumCell w={"100%"} value={c.LF} onChange={(v) => updCombo(sel.id, c.id, "LF", v)} />
                    <NumCell w={"100%"} value={c.P} onChange={(v) => updCombo(sel.id, c.id, "P", v)} />
                    <NumCell w={"100%"} value={c.Mux} onChange={(v) => updCombo(sel.id, c.id, "Mux", v)} />
                    <NumCell w={"100%"} value={c.Muz} onChange={(v) => updCombo(sel.id, c.id, "Muz", v)} />
                    <button onClick={() => delCombo(sel.id, c.id)} style={{ color: C.inkDim, fontSize: 14, lineHeight: 1 }} title="remove">×</button>
                  </React.Fragment>
                ))}
              </div>
              <div style={{ font: `400 10px ${MONO}`, color: C.inkDim, marginTop: 8, lineHeight: 1.5 }}>P = axial (Puy), Mux/Muz = base moments. Soil pressure is checked per combo; design moment &amp; depth take the envelope. (Pux, Puz, Muy are recorded but do not feed the calc, per the sheet.)</div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
