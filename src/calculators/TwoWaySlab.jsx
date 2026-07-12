import React, { useState, useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import * as XLSX from "xlsx";
import { C, UI, MONO, SERIF, fmt, sColor, useSharedStyles, useThemeMode } from "../theme.js";
import { Field, RVal, Group, SecHead, FormulaLedger, TeX, useKaTeX, ThemeToggle, VerdictBadge } from "../components/ui.jsx";
import Feedback from "../components/Feedback.jsx";

const HX = (s) => parseInt(String(s).replace("#", ""), 16); // "#RRGGBB" -> 0xRRGGBB for three.js

/* ===== IS 456 Table 26 coefficients (as used by the firm's sheet) ===== */
const RATIOS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0];
const AXN = { 1: [.032, .037, .043, .047, .051, .053, .06, .065], 2: [.037, .043, .048, .051, .055, .057, .064, .068], 3: [.037, .044, .052, .057, .063, .067, .077, .085], 4: [.047, .053, .06, .065, .071, .075, .084, .091], 5: [.045, .049, .052, .056, .059, .06, .065, .069], 6: null, 7: [.057, .064, .071, .076, .08, .084, .091, .097], 8: null, 9: null };
const AXP = { 1: [.024, .028, .032, .036, .039, .041, .045, .049], 2: [.028, .032, .036, .039, .041, .044, .048, .052], 3: [.028, .033, .039, .044, .047, .051, .059, .065], 4: [.035, .04, .045, .049, .053, .056, .063, .069], 5: [.035, .037, .04, .043, .044, .045, .049, .052], 6: [.035, .043, .051, .057, .063, .068, .08, .088], 7: [.043, .048, .053, .057, .06, .064, .069, .073], 8: [.043, .051, .059, .065, .071, .076, .087, .096], 9: [.056, .064, .072, .079, .085, .089, .1, .107] };
const AYP = { 1: .024, 2: .028, 3: .028, 4: .035, 5: .035, 6: .035, 7: .043, 8: .043, 9: .056 };
const AYN = { 1: .032, 2: .037, 3: .037, 4: .047, 5: 0, 6: .045, 7: 0, 8: .057, 9: 0 };
const COND_NAMES = { 1: "Interior panel", 2: "One short edge discontinuous", 3: "One long edge discontinuous", 4: "Two adjacent edges discontinuous", 5: "Two short edges discontinuous", 6: "Two long edges discontinuous", 7: "Three edges discont. (one long continuous)", 8: "Three edges discont. (one short continuous)", 9: "Four edges discontinuous" };
const SPD = { 1: 26, 2: 26, 3: 23, 4: 23, 5: 26, 6: 20, 7: 23, 8: 20, 9: 20 };
const EDGES = { 1: { top: "C", bottom: "C", left: "C", right: "C" }, 2: { top: "C", bottom: "D", left: "C", right: "C" }, 3: { top: "C", bottom: "C", left: "C", right: "D" }, 4: { top: "C", bottom: "D", left: "C", right: "D" }, 5: { top: "D", bottom: "D", left: "C", right: "C" }, 6: { top: "C", bottom: "C", left: "D", right: "D" }, 7: { top: "D", bottom: "D", left: "C", right: "D" }, 8: { top: "D", bottom: "C", left: "D", right: "D" }, 9: { top: "D", bottom: "D", left: "D", right: "D" } };

function interpCoef(t, r) { if (!t) return null; const rc = Math.min(Math.max(r, 1), 2); for (let i = 0; i < RATIOS.length - 1; i++) if (rc >= RATIOS[i] && rc <= RATIOS[i + 1]) { const f = (rc - RATIOS[i]) / (RATIOS[i + 1] - RATIOS[i]); return t[i] + f * (t[i + 1] - t[i]); } return t[t.length - 1]; }

/* ===== engine — reproduces the firm's spreadsheet exactly ===== */
function computePanel(p, g) {
  const { cond, Lx, Ly, w, D, dia, sProv } = p, { fck, fy, cover, minPct } = g;
  if (!(Lx > 0 && Ly > 0)) return { incomplete: true, missing: [!Lx && "Lx", !Ly && "Ly"].filter(Boolean), verdict: "-" };
  const r = Ly / Lx;
  if (!(w > 0)) return { incomplete: true, missing: ["load w"], r, verdict: "-" };
  const axp = interpCoef(AXP[cond], r), axn = interpCoef(AXN[cond], r), ayp = AYP[cond], ayn = AYN[cond] || 0;
  const d = D - cover - dia / 2;                 // sheet: single d for all directions
  const AbarPi = 3.141592654 * dia * dia / 4;    // sheet AA26
  const minAst = minPct / 100 * 1000 * D;        // sheet: 0.12% * b * D
  const M = { xp: axp * w * Lx * Lx, yp: ayp * w * Lx * Lx, xn: axn ? axn * w * Lx * Lx : null, yn: ayn ? ayn * w * Lx * Lx : null };
  const astOf = (Mt) => { if (Mt == null) return null; const Mu = Mt * 1e7; const disc = 1 - 4.6 * Mu / (fck * 1000 * d * d); if (disc < 0) return NaN; return Math.max(0.5 * (fck / fy) * (1 - Math.sqrt(disc)) * 1000 * d, minAst); };
  const spOf = (A) => { if (A == null || Number.isNaN(A)) return A; const s = AbarPi * 1000 / A, cap = 3 * d; if (s > cap) return Math.floor(cap / 25) * 25; return s % 25 > 5 ? Math.floor(s / 25) * 25 : (Math.floor(s / 25) - 1) * 25; };
  const Ast = { xp: astOf(M.xp), yp: astOf(M.yp), xn: astOf(M.xn), yn: astOf(M.yn) };
  const S = { xp: spOf(Ast.xp), yp: spOf(Ast.yp), xn: spOf(Ast.xn), yn: spOf(Ast.yn) };
  let defl = null, bs = null;
  if (Ast.xp && isFinite(Ast.xp) && sProv > 0) {
    const AstProv = 1000 * 3.14 * 0.25 * dia * dia / sProv;   // sheet AJ uses 3.14
    const pt = Ast.xp * 100 / (1000 * d);
    const fsTerm = 0.00322 * 0.58 * fy * (Ast.xp / AstProv);
    const MF = 1 / (0.225 + fsTerm - 0.625 * Math.log10(1 / pt));  // uncapped, per sheet
    const basic = SPD[cond], allow = MF * basic * d / 1000, status = allow >= Lx ? "SAFE" : "UNSAFE";
    defl = { pt, fsService: 0.58 * fy * (Ast.xp / AstProv), MF, basic, allow, status, AstProv };
    if (status === "UNSAFE") {
      const Mubd2 = M.xp * 1e7 / (1000 * d * d), fsb = 5 * fy / 8;
      const MFb = Math.min(2, 0.55 + (477 - fsb) / (120 * (0.9 + Mubd2)));
      const allowB = MFb * basic * d / 1000, stB = allowB >= Lx ? "SAFE" : "UNSAFE";
      let extra = null;
      if (stB === "UNSAFE") { const fReq = Lx * 1000 / (basic * d); if (fReq > 2) extra = { verdict: "REDESIGN" }; else { const fsReq = 477 - (fReq - 0.55) * 120 * (0.9 + Mubd2); if (fsReq < 0) extra = { verdict: "REDESIGN" }; else { const astReq2 = 5 * fy * Ast.xp / (8 * fsReq); extra = { verdict: "INCREASE", pct: astReq2 / Ast.xp * 100 - 100, astReq2 }; } } }
      bs = { Mubd2, fsb, MFb, allowB, stB, extra };
    }
  }
  let verdict = "calc", tag = null;
  if (defl) { if (defl.status === "SAFE") verdict = "SAFE"; else if (bs?.stB === "SAFE") { verdict = "SAFE"; tag = "via BS 8110"; } else if (bs?.extra?.verdict === "REDESIGN") verdict = "REDESIGN"; else verdict = "UNSAFE"; }
  const util = defl ? Lx / defl.allow : null;
  return { r, axp, axn, ayp, ayn, d, AbarPi, minAst, M, Ast, S, defl, bs, verdict, tag, util };
}

/* ===== 3D live slab viewer ===== */
function SlabViewer({ panel }) {
  const mount = useRef(null), state = useRef({});
  useEffect(() => {
    const el = mount.current; if (!el) return;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, 1, .1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, .9));
    const dir = new THREE.DirectionalLight(0xffffff, .75); dir.position.set(4, 9, 6); scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xcfe4ec, .3); dir2.position.set(-5, 3, -4); scene.add(dir2);
    const grid = new THREE.GridHelper(16, 16, HX(C.line), HX(C.surf2)); grid.position.y = -1.2; scene.add(grid);
    const group = new THREE.Group(); scene.add(group);
    const rot = { theta: -0.7, phi: 1.05, r: 8.5, drag: false, px: 0, py: 0, auto: true };
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const dn = (e) => { rot.drag = true; rot.auto = false; rot.px = e.clientX; rot.py = e.clientY; };
    const mv = (e) => { if (!rot.drag) return; rot.theta -= (e.clientX - rot.px) * .01; rot.phi = Math.min(1.5, Math.max(.25, rot.phi - (e.clientY - rot.py) * .01)); rot.px = e.clientX; rot.py = e.clientY; };
    const up = () => { rot.drag = false; };
    renderer.domElement.addEventListener("pointerdown", dn); window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    let raf; const loop = () => { raf = requestAnimationFrame(loop); if (rot.auto) rot.theta += .0035; cam.position.set(rot.r * Math.sin(rot.phi) * Math.cos(rot.theta), rot.r * Math.cos(rot.phi), rot.r * Math.sin(rot.phi) * Math.sin(rot.theta)); cam.lookAt(0, 0, 0); renderer.render(scene, cam); };
    loop();
    state.current = { scene, cam, renderer, group, rot };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.domElement.removeEventListener("pointerdown", dn); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); };
  }, []);
  useEffect(() => {
    const st = state.current; if (!st) return;
    const g = st.group; while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
    const { Lx, Ly, D, cond, dia, sProv } = panel;
    const hasX = Lx > 0, hasY = Ly > 0, S = 4 / Math.max(Lx || 1, Ly || 1, 1);
    const wx = (hasX ? Lx : 1) * S, wz = (hasY ? Ly : (hasX ? .25 : 1)) * S, th = Math.max(.12, (D || 120) / 1000 * S * 3.2), ghost = !hasX || !hasY;
    const geo = new THREE.BoxGeometry(wx, th, wz);
    g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: ghost ? 0xC9D4DB : 0xB4C0C8, transparent: true, opacity: ghost ? .4 : .96 })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: ghost ? HX(C.cyan) : HX(C.cyanDeep) })));
    if (!ghost) {
      const e = EDGES[cond] || {};
      const beam = (x, z, lx, lz) => { const bh = th * 1.4; const m = new THREE.Mesh(new THREE.BoxGeometry(lx, bh, lz), new THREE.MeshLambertMaterial({ color: HX(C.cyanDeep) })); m.position.set(x, -th / 2 - bh / 2 + .02, z); g.add(m); };
      const rollers = (x, z, along, len) => { const n = Math.max(3, Math.round(len / .5)); for (let i = 0; i <= n; i++) { const t = -len / 2 + len / n * i; const m = new THREE.Mesh(new THREE.SphereGeometry(th * .35, 8, 8), new THREE.MeshLambertMaterial({ color: HX(C.cyan) })); m.position.set(along === "x" ? x + t : x, -th / 2 - th * .35, along === "z" ? z + t : z); g.add(m); } };
      const hx = wx / 2, hz = wz / 2, bw = Math.min(.14, th * 1.1);
      (e.top === "C" ? beam(0, -hz, wx, bw) : rollers(0, -hz, "x", wx));
      (e.bottom === "C" ? beam(0, hz, wx, bw) : rollers(0, hz, "x", wx));
      (e.left === "C" ? beam(-hx, 0, bw, wz) : rollers(-hx, 0, "z", wz));
      (e.right === "C" ? beam(hx, 0, bw, wz) : rollers(hx, 0, "z", wz));
      if (dia > 0 && sProv > 0) { const alongX = Lx <= Ly, n = 7, m2 = new THREE.MeshLambertMaterial({ color: HX(C.cyan) }); for (let i = 1; i < n; i++) { const t = -.5 + i / n, len = (alongX ? wx : wz) * .92, rr = Math.max(.012, dia / 1000 * S * 2.2); const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, len, 8), m2); cyl.rotation.z = Math.PI / 2; if (alongX) cyl.position.set(0, -th / 2 + rr * 1.5, t * wz); else { cyl.rotation.y = Math.PI / 2; cyl.position.set(t * wx, -th / 2 + rr * 1.5, 0); } g.add(cyl); } }
    }
    st.rot.r = Math.max(6, Math.max(wx, wz) * 1.9 + 2.5);
  }, [panel.Lx, panel.Ly, panel.D, panel.cond, panel.dia, panel.sProv]);
  return <div ref={mount} style={{ width: "100%", height: "100%", cursor: "grab", touchAction: "none" }} />;
}

function CondGlyph({ cond, size = 40, active }) {
  const e = EDGES[cond], p = 5, s = size - p * 2, col = active ? C.brass : C.ink2;
  const line = (x1, y1, x2, y2, cont) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={cont ? col : C.subtle} strokeWidth={cont ? 2.8 : 1.1} strokeDasharray={cont ? "0" : "3 2.5"} strokeLinecap="round" />;
  return (<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><rect x={p} y={p} width={s} height={s} fill={active ? `${C.brass}14` : `${C.teal}0d`} />{line(p, p, p + s, p, e.top === "C")}{line(p, p + s, p + s, p + s, e.bottom === "C")}{line(p, p, p, p + s, e.left === "C")}{line(p + s, p, p + s, p + s, e.right === "C")}</svg>);
}

/* ===== formulas (LaTeX) — mirrors the sheet's method ===== */
function buildFormulas(p, res, g) {
  if (res.incomplete) return [];
  const d2 = (v) => fmt(v, 2), d3 = (v) => fmt(v, 3), d0 = (v) => fmt(v, 0);
  const F = [];
  F.push({ label: "Aspect ratio", sym: "r = \\dfrac{L_y}{L_x}", sub: `${p.Ly} / ${p.Lx}`, val: `${d3(res.r)}`, cl: "Table 26" });
  F.push({ label: "Moment coefficients", sym: "\\alpha_{x+},\\ \\alpha_{y+},\\ \\alpha_{x-},\\ \\alpha_{y-}", sub: "Table 26 (interpolated on r)", val: `${d3(res.axp)}, ${d3(res.ayp)}, ${res.axn ? d3(res.axn) : "NA"}, ${res.ayn ? d3(res.ayn) : "NA"}`, cl: "Table 26" });
  F.push({ label: "Moment Mx+", sym: "M_{x+} = \\alpha_{x+}\\, w\\, L_x^{2}", sub: `${d3(res.axp)} \\times ${p.w} \\times ${p.Lx}^2`, val: `${d2(res.M.xp)} Tm/M`, cl: "Annex D-1.1" });
  F.push({ label: "Effective depth", sym: "d = D - c - \\dfrac{\\phi}{2}", sub: `${p.D} - ${g.cover} - ${p.dia}/2`, val: `${d0(res.d)} mm`, cl: "Cl 26.4" });
  F.push({ label: "Steel Ast, x+", sym: "A_{st} = 0.5\\dfrac{f_{ck}}{f_y}\\!\\left[1-\\sqrt{1-\\dfrac{4.6\\,M_u}{f_{ck}\\,b\\,d^{2}}}\\right]\\!b\\,d", sub: `M_u = ${d2(res.M.xp * 10)} kNm,\\ f_{ck}=${g.fck},\\ f_y=${g.fy}`, val: `${d0(res.Ast.xp)} mm²/M`, cl: "Annex G-1.1(b)" });
  F.push({ label: "Minimum steel", sym: "A_{st,\\min} = \\dfrac{p_{\\min}}{100}\\,b\\,D", sub: `${g.minPct}\\% \\times 1000 \\times ${p.D}`, val: `${d0(res.minAst)} mm²/M`, cl: "Cl 26.5.2.1" });
  F.push({ label: "Spacing Sx+", sym: "S = \\dfrac{1000\\cdot\\frac{\\pi}{4}\\phi^{2}}{A_{st}} \\le 3d", sub: `\\phi=${p.dia},\\ A_{st}=${d0(res.Ast.xp)}`, val: `${fmt(res.S.xp)} mm c/c`, cl: "Cl 26.3.3(b)" });
  if (res.defl) {
    F.push({ label: "pt, x+", sym: "p_{t} = \\dfrac{100\\,A_{st}}{1000\\,d}", sub: `A_{st}=${d0(res.Ast.xp)},\\ d=${d0(res.d)}`, val: `${d3(res.defl.pt)} %`, cl: "Cl 23.2.1" });
    F.push({ label: "Service stress fs", sym: "f_s = 0.58\\,f_y\\dfrac{A_{st,req}}{A_{st,prov}}", sub: `0.58\\times ${g.fy}\\times \\frac{${d0(res.Ast.xp)}}{${d0(res.defl.AstProv)}}`, val: `${d2(res.defl.fsService)} N/mm²`, cl: "Cl 23.2.1" });
    F.push({ label: "Modification factor", sym: "MF = \\dfrac{1}{0.225 + 0.00322 f_s - 0.625\\log_{10}\\frac{1}{p_t}}", sub: "IS 456 Fig 4 (curve fit)", val: `${d3(res.defl.MF)}`, cl: "Fig 4" });
    F.push({ label: "Deflection check", sym: "L_{allow} = MF \\cdot \\left(\\tfrac{L}{d}\\right)_{basic}\\! \\cdot d \\ \\ge\\ L_x", sub: `${d3(res.defl.MF)}\\times ${res.defl.basic}\\times ${d0(res.d)}`, val: `${d2(res.defl.allow)} m vs ${p.Lx} m → ${res.defl.status}`, cl: "Cl 23.2.1" });
    if (res.bs) {
      F.push({ label: "BS 8110 · Mu/bd²", sym: "\\dfrac{M_u}{b\\,d^{2}}", sub: `${d2(res.M.xp * 10)}\\times10^6 / (1000\\cdot${d0(res.d)}^2)`, val: `${d2(res.bs.Mubd2)} N/mm²`, cl: "BS 8110 T3.10" });
      F.push({ label: "BS 8110 · MF", sym: "MF = 0.55 + \\dfrac{477 - f_s}{120(0.9 + M/bd^2)}", sub: `f_s = \\tfrac{5}{8}f_y = ${d0(res.bs.fsb)}`, val: `${d3(res.bs.MFb)}`, cl: "BS 8110 T3.10" });
      F.push({ label: "BS 8110 · check", sym: "L_{allow} = MF\\cdot(L/d)_{basic}\\cdot d", sub: `${d3(res.bs.MFb)}\\times ${res.defl.basic}\\times ${d0(res.d)}`, val: `${d2(res.bs.allowB)} m → ${res.bs.stB}${res.bs.extra ? (res.bs.extra.verdict === "REDESIGN" ? " (REDESIGN)" : ` (+${d0(res.bs.extra.pct)}% steel)`) : ""}`, cl: "BS 8110 T3.10" });
    }
  }
  return F;
}

function Report({ panels, results, g, project, onClose, onXlsx, ready }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto py-8 px-4" style={{ background: "rgba(3,8,18,0.62)", backdropFilter: "blur(3px)" }}>
      <div className="w-full max-w-3xl rounded-lg cs-pop" style={{ background: "#FFFFFF" }}>
        <div className="flex justify-between items-center px-6 py-3" style={{ borderBottom: "2px solid #0E7490" }}>
          <div style={{ fontFamily: SERIF, color: "#0A1628", fontSize: 19 }}>Calculation report <span style={{ color: "#0E7490", fontStyle: "italic" }}>· all formulas</span></div>
          <div className="flex gap-2">
            <button onClick={onXlsx} className="cs-btn px-3 py-1.5 rounded-lg text-sm text-white" style={{ background: "#0E9F6E", fontFamily: UI, fontWeight: 600 }}>Export Excel</button>
            <button onClick={() => window.print()} className="cs-btn px-3 py-1.5 rounded-lg text-sm text-white" style={{ background: "#0E7490", fontFamily: UI, fontWeight: 600 }}>Print / PDF</button>
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #E8E4DC", fontFamily: UI, fontWeight: 600, color: "#33414D" }}>Close</button>
          </div>
        </div>
        <div className="px-8 py-6" style={{ color: "#0A1628", fontFamily: UI }}>
          <div className="grid grid-cols-3" style={{ border: "2px solid #0A1628" }}>
            {[["PROJECT", project || "-"], ["ELEMENT", "Two-way slabs"], ["CODE", "IS 456:2000 + BS 8110"], ["PANELS", String(panels.length)], ["MATERIALS", `M${g.fck} / Fe${g.fy}`], ["DATE", new Date().toLocaleDateString("en-IN")]].map(([k, v]) => (<div key={k} className="px-3 py-2" style={{ border: "1px solid #0A1628" }}><div style={{ fontSize: 10, letterSpacing: 2, color: "#6B6860", fontFamily: MONO }}>{k}</div><div style={{ fontFamily: MONO, fontWeight: 600 }}>{v}</div></div>))}
          </div>
          {panels.map((p) => { const r = results[p.id], F = buildFormulas(p, r, g); return (
            <div key={p.id} className="mt-5 pb-4" style={{ borderBottom: "1px solid #E8E4DC" }}>
              <div className="flex justify-between items-baseline"><div style={{ fontFamily: SERIF, fontSize: 17 }}>{p.name} — {COND_NAMES[p.cond]}</div><span className="px-2 py-0.5 rounded" style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: r.verdict === "SAFE" ? "#0E9F6E" : "#E11D48", background: r.verdict === "SAFE" ? "#0E9F6E18" : "#E11D4818" }}>{r.verdict}{r.tag ? " " + r.tag : ""}</span></div>
              <div style={{ fontSize: 11, fontFamily: MONO, color: "#6B6860", margin: "2px 0 8px" }}>Lx {p.Lx} × Ly {p.Ly} m · w {p.w} T/m² · D {p.D} · Ø{p.dia}@{p.sProv}</div>
              {r.incomplete ? <div style={{ fontSize: 12, color: "#E11D48" }}>Incomplete — missing {r.missing.join(", ")}</div> :
                <div className="space-y-2">{F.map((f, i) => (<div key={i} className="flex flex-wrap items-center gap-x-3" style={{ fontSize: 12, borderTop: i ? "1px solid #F0ECE3" : "none", paddingTop: i ? 5 : 0 }}><span style={{ width: 130, fontWeight: 600 }}>{f.label}</span><span className="grow" style={{ minWidth: 180 }}><TeX tex={f.sym} ready={ready} /></span><span style={{ color: "#0E9F6E", fontFamily: MONO, fontWeight: 600 }}>{f.val}</span><span style={{ color: "#0E7490", fontFamily: MONO, fontSize: 10 }}>{f.cl}</span></div>))}</div>}
            </div>); })}
          <div className="mt-8 grid grid-cols-2 gap-8">{["Designed by", "Checked & approved (sign-off)"].map((t) => <div key={t}><div className="h-12" style={{ borderBottom: "1px solid #0A1628" }} /><div style={{ fontSize: 11, color: "#6B6860", marginTop: 4 }}>{t}</div></div>)}</div>
          <p className="mt-6" style={{ fontSize: 10, color: "#6B6860" }}>Reproduces the firm's spreadsheet method: single effective depth, IS 456 Table 26 coefficients (interpolated), deflection per Cl 23.2.1 with BS 8110 fallback. Loads factored; 1 T = 10 kN. The signing engineer retains responsibility.</p>
        </div>
      </div>
    </div>
  );
}

export default function CivilSpaceCalc({ onBack }) {
  const [g, setG] = useState({ fck: 25, fy: 500, cover: 20, minPct: 0.12 });
  const [panels, setPanels] = useState([]);
  const [selId, setSelId] = useState(null);
  const [project, setProject] = useState("");
  const [showWork, setShowWork] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const nextId = useRef(1);
  useSharedStyles();
  const kReady = useKaTeX();
  const mode = useThemeMode(); // re-mounts the 3D viewer so its colours follow the theme

  const results = useMemo(() => { const o = {}; for (const p of panels) o[p.id] = computePanel(p, g); return o; }, [panels, g]);
  const sel = panels.find((p) => p.id === selId) || null;
  const R = sel ? results[sel.id] : null;
  const safeN = panels.filter((p) => results[p.id].verdict === "SAFE").length;
  const doneN = panels.filter((p) => !results[p.id].incomplete).length;

  const upd = (id, k, v) => setPanels((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  const add = () => { const id = nextId.current++; setPanels((ps) => [...ps, { id, name: "S" + id, cond: 4, Lx: 0, Ly: 0, w: 0, D: 150, dia: 8, sProv: 0 }]); setSelId(id); setShowWork(false); };
  const del = (id) => { setPanels((ps) => ps.filter((p) => p.id !== id)); if (selId === id) setSelId((panels.find((p) => p.id !== id) || {}).id ?? null); };

  const exportXlsx = () => {
    const head = ["Panel", "Cond", "Lx(m)", "Ly(m)", "w(T/m2)", "D(mm)", "Dia(mm)", "Sx+prov(mm)", "Ly/Lx", "ax+", "ay+", "ax-", "ay-", "Mx+", "My+", "Mx-", "My-", "Ast x+", "Ast y+", "Ast x-", "Ast y-", "Sx+", "Sy+", "Sx-", "Sy-", "pt x+", "MF", "allow(m)", "Status"];
    const rows = panels.map((p) => { const r = results[p.id]; if (r.incomplete) return [p.name, p.cond, p.Lx, p.Ly, p.w, p.D, p.dia, p.sProv, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "INCOMPLETE"]; const num = (v) => (v == null ? "NA" : Number.isNaN(v) ? "ERR" : +v.toFixed(1)); return [p.name, p.cond, p.Lx, p.Ly, p.w, p.D, p.dia, p.sProv, +r.r.toFixed(3), +r.axp.toFixed(4), +r.ayp.toFixed(4), r.axn ? +r.axn.toFixed(4) : "NA", r.ayn ? +r.ayn.toFixed(4) : "NA", +r.M.xp.toFixed(3), +r.M.yp.toFixed(3), r.M.xn ? +r.M.xn.toFixed(3) : "NA", r.M.yn ? +r.M.yn.toFixed(3) : "NA", num(r.Ast.xp), num(r.Ast.yp), num(r.Ast.xn), num(r.Ast.yn), num(r.S.xp), num(r.S.yp), num(r.S.xn), num(r.S.yn), r.defl ? +r.defl.pt.toFixed(3) : "", r.defl ? +r.defl.MF.toFixed(3) : "", r.defl ? +r.defl.allow.toFixed(2) : "", r.verdict + (r.tag ? " " + r.tag : "")]; });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["CivilSpace — Two-Way Slab Design (IS 456:2000)"], ["Project", project], [], head, ...rows]), "Design");
    const fRows = [["Panel", "Quantity", "Formula", "Substitution", "Result", "Clause"]];
    for (const p of panels) { const r = results[p.id]; for (const f of buildFormulas(p, r, g)) fRows.push([p.name, f.label, f.sym.replace(/\\dfrac|\\frac/g, "").replace(/[{}\\]/g, ""), f.sub.replace(/[{}\\]/g, ""), f.val, f.cl]); }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fRows), "Formulas");
    XLSX.writeFile(wb, "civilspace_slab_design.xlsx");
  };

  const F = sel && R ? buildFormulas(sel, R, g) : [];
  const btn = (x) => ({ font: `600 12px ${UI}`, ...x });

  return (
    <div className="min-h-screen cs-bp" style={{ color: C.ink, fontFamily: UI }}>
      <header className="px-4 pt-4 mx-auto" style={{ maxWidth: 1480 }}>
        <div className="cs-card flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
          {onBack && (
            <button onClick={onBack} className="cs-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.surf, color: C.ink2, font: `600 13px ${UI}` }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M12 8H4M7.5 4.5L4 8l3.5 3.5" stroke={C.ink2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              All
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 40, height: 40, background: C.surf2, border: `1px solid ${C.line}` }}>
              <svg width="26" height="26" viewBox="0 0 34 34"><rect x="3" y="3" width="28" height="28" rx="2" fill="none" stroke={C.cyanDeep} strokeWidth="2.4" /><line x1="3" y1="12" x2="31" y2="12" stroke={C.cyanDeep} strokeWidth="1.6" /><line x1="12" y1="12" x2="12" y2="31" stroke={C.cyan} strokeWidth="1.6" /><circle cx="12" cy="12" r="2.4" fill={C.cyan} /></svg>
            </div>
            <div><div style={{ font: `400 21px ${SERIF}`, color: C.ink, letterSpacing: "-.01em" }}>CivilSpace <span style={{ color: C.cyan, fontStyle: "italic" }}>Calc</span></div><div style={{ font: `500 10px ${MONO}`, color: C.inkDim, letterSpacing: 1 }}>TWO-WAY SLAB · IS 456:2000</div></div>
          </div>
          <div className="flex items-center gap-2 ml-2 px-3 py-1.5 rounded-lg" style={{ background: C.surf2, border: `1px solid ${C.line}` }}><span style={{ font: `600 10px ${MONO}`, color: C.inkDim }}>PROJECT</span><input value={project} onChange={(e) => setProject(e.target.value)} placeholder="untitled" className="outline-none" style={{ font: `600 14px ${MONO}`, color: C.ink, minWidth: 170, background: "transparent" }} /></div>
          <div className="ml-auto flex items-center gap-2">
            <Feedback context="two-way-slab" inline />
            <button onClick={exportXlsx} disabled={!panels.length} className="cs-btn px-3.5 py-2 rounded-lg" style={btn({ border: `1px solid ${panels.length ? C.brass : C.line}`, color: panels.length ? C.brass : C.inkDim, background: C.surf })}>Export Excel</button>
            <button onClick={() => setShowReport(true)} disabled={!panels.length} className="cs-btn px-3.5 py-2 rounded-lg" style={btn({ background: panels.length ? C.green : C.line, color: "#fff" })}>Generate report</button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto px-4 py-4 flex flex-col lg:flex-row gap-4" style={{ maxWidth: 1480 }}>
        <aside className="lg:w-52 shrink-0">
          <div className="flex items-center justify-between mb-2"><span style={{ font: `600 10px ${MONO}`, color: C.inkDim, letterSpacing: 1 }}>PANELS</span>{panels.length > 0 && <span style={{ font: `600 11px ${MONO}`, color: C.inkDim }}>{safeN}/{doneN} pass</span>}</div>
          <div className="space-y-1.5">
            {panels.map((p) => { const r = results[p.id], on = selId === p.id; return (
              <div key={p.id} onClick={() => { setSelId(p.id); setShowWork(false); }} className={"cs-panel px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-2" + (on ? " cs-card" : "")} style={{ background: on ? C.surf : C.surf, borderLeft: `3px solid ${on ? C.brass : sColor(r.verdict)}`, border: `1px solid ${on ? C.brass : C.line}`, borderLeftWidth: 3, borderLeftColor: on ? C.brass : sColor(r.verdict) }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: sColor(r.verdict), flexShrink: 0, boxShadow: `0 0 0 3px ${sColor(r.verdict)}22` }} />
                <div className="grow min-w-0"><div style={{ font: `700 14px ${UI}`, color: on ? C.brass : C.ink }}>{p.name}</div><div className="truncate" style={{ font: `400 10px ${MONO}`, color: C.inkDim }}>{r.incomplete ? "awaiting inputs" : COND_NAMES[p.cond].split("(")[0]}</div></div>
                <span onClick={(e) => { e.stopPropagation(); del(p.id); }} style={{ color: C.inkDim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</span>
              </div>); })}
          </div>
          <button onClick={add} className="cs-btn w-full mt-2 px-3 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 13px ${UI}`, boxShadow: `0 2px 10px ${C.cyanDeep}33` }}>+ Add panel</button>
        </aside>

        <main className="grow min-w-0">
          <div className="cs-card rounded-xl relative" style={{ backgroundColor: C.surf, backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${C.surf} 0%, ${C.surf2} 100%), linear-gradient(var(--grid) 1px,transparent 1px), linear-gradient(90deg,var(--grid) 1px,transparent 1px)`, backgroundSize: "auto, 28px 28px, 28px 28px", border: `1px solid ${C.line}`, height: 360, overflow: "hidden" }}>
            {sel ? <SlabViewer key={mode} panel={sel} /> : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <svg width="76" height="76" viewBox="0 0 72 72" style={{ marginBottom: 14 }}><polygon points="12,30 36,18 60,30 36,42" fill="none" stroke={C.cyanDeep} strokeWidth="2" strokeLinejoin="round" /><polygon points="12,30 36,42 36,54 12,42" fill={`${C.cyanDeep}14`} stroke={C.cyanDeep} strokeWidth="1.5" strokeLinejoin="round" /><polygon points="60,30 36,42 36,54 60,42" fill={`${C.cyan}18`} stroke={C.cyan} strokeWidth="1.5" strokeLinejoin="round" /></svg>
                <div style={{ font: `400 24px ${SERIF}`, color: C.ink }}>Start a new slab panel</div>
                <div style={{ font: `400 13px ${UI}`, color: C.inkDim, maxWidth: 380, marginTop: 6, lineHeight: 1.5 }}>Add a panel, then type its span, thickness and load. The slab takes shape here and results appear as you go.</div>
                <button onClick={add} className="cs-btn mt-5 px-5 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 14px ${UI}`, boxShadow: `0 3px 14px ${C.cyanDeep}3a` }}>+ Add your first panel</button>
              </div>
            )}
            {sel && (<>
              <div className="absolute top-3 left-4"><div style={{ font: `400 21px ${SERIF}`, color: C.ink }}>{sel.name}</div><div style={{ font: `500 11px ${MONO}`, color: C.inkDim }}>{COND_NAMES[sel.cond]}</div></div>
              <div className="absolute top-3 right-4">{R?.incomplete ? <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: C.surf, color: C.inkDim, font: `600 12px ${MONO}`, border: `1px solid ${C.line}` }}>enter {R.missing.join(", ")}</span> : <VerdictBadge verdict={R.verdict} label={`${R.verdict}${R.tag ? " · " + R.tag : ""}`} size="lg" />}</div>
              <div className="absolute bottom-3 left-4 flex gap-4" style={{ font: `600 11px ${MONO}`, color: C.inkDim }}><span>Lx <b style={{ color: C.ink }}>{sel.Lx || "-"}</b> m</span><span>Ly <b style={{ color: C.ink }}>{sel.Ly || "-"}</b> m</span><span>D <b style={{ color: C.ink }}>{sel.D || "-"}</b> mm</span></div>
              <div className="absolute bottom-3 right-4 flex items-center gap-3" style={{ font: `500 10px ${MONO}`, color: C.inkDim }}><span className="flex items-center gap-1"><span style={{ width: 12, height: 3, background: C.brass, display: "inline-block", borderRadius: 2 }} />supported edge</span><span className="flex items-center gap-1"><span style={{ width: 6, height: 6, background: C.teal, borderRadius: 6, display: "inline-block" }} />free edge</span></div>
            </>)}
          </div>

          {R && !R.incomplete && (
            <div className="mt-3 csin" key={sel.id}>
              <Group title="Moments (M = α·w·Lx²)" accent={C.teal}>
                <RVal accent={C.teal} name="Short +ve" sym="Mx+" val={fmt(R.M.xp, 2)} unit="Tm/M" />
                <RVal accent={C.teal} name="Long +ve" sym="My+" val={fmt(R.M.yp, 2)} unit="Tm/M" />
                <RVal accent={C.teal} name="Short −ve" sym="Mx−" val={fmt(R.M.xn, 2)} unit="Tm/M" />
                <RVal accent={C.teal} name="Long −ve" sym="My−" val={fmt(R.M.yn, 2)} unit="Tm/M" />
              </Group>
              <Group title="Reinforcement required" accent={C.brass}>
                <RVal accent={C.brass} name="Short +ve" sym="Ast,x+" val={fmt(R.Ast.xp)} unit="mm²/M" />
                <RVal accent={C.brass} name="Long +ve" sym="Ast,y+" val={fmt(R.Ast.yp)} unit="mm²/M" />
                <RVal accent={C.brass} name="Short −ve" sym="Ast,x−" val={fmt(R.Ast.xn)} unit="mm²/M" />
                <RVal accent={C.brass} name="Long −ve" sym="Ast,y−" val={fmt(R.Ast.yn)} unit="mm²/M" />
              </Group>
              <Group title="Spacing required" accent={C.ink2}>
                <RVal accent={C.ink2} name="Short +ve" sym="Sx+" val={fmt(R.S.xp)} unit="mm c/c" />
                <RVal accent={C.ink2} name="Long +ve" sym="Sy+" val={fmt(R.S.yp)} unit="mm c/c" />
                <RVal accent={C.ink2} name="Short −ve" sym="Sx−" val={fmt(R.S.xn)} unit="mm c/c" />
                <RVal accent={C.ink2} name="Long −ve" sym="Sy−" val={fmt(R.S.yn)} unit="mm c/c" />
              </Group>
              <Group title="Deflection check (IS 456)" accent={R.defl ? sColor(R.defl.status) : C.inkDim}>
                <RVal accent={C.inkDim} name="Steel %" sym="pt,x+" val={R.defl ? fmt(R.defl.pt, 3) : "—"} unit="%" />
                <RVal accent={C.inkDim} name="Basic" sym="span/d" val={R.defl ? R.defl.basic : "—"} unit="ratio" />
                <RVal accent={C.inkDim} name="Modif." sym="MF" val={R.defl ? fmt(R.defl.MF, 3) : "—"} unit="factor" />
                <RVal accent={R.defl ? sColor(R.defl.status) : C.inkDim} name="Allowable" sym="allwbl.spn." val={R.defl ? fmt(R.defl.allow, 2) : "add rebar"} unit={R.defl ? "m" : ""} color={R.defl ? sColor(R.defl.status) : C.inkDim} />
              </Group>
              {R.bs && (
                <Group title="Check as per BS 8110 (fallback)" accent={C.amber}>
                  <RVal accent={C.amber} name="Moment" sym="Mu/bd²" val={fmt(R.bs.Mubd2, 2)} unit="N/mm²" />
                  <RVal accent={C.amber} name="Modif." sym="MF" val={fmt(R.bs.MFb, 3)} unit="factor" />
                  <RVal accent={sColor(R.bs.stB)} name="Allowable" sym="allwbl.spn." val={fmt(R.bs.allowB, 2)} unit="m" color={sColor(R.bs.stB)} />
                  <RVal accent={R.bs.stB === "SAFE" ? C.green : C.red} name={R.bs.extra?.verdict === "REDESIGN" ? "Verdict" : "Extra steel"} sym={R.bs.extra?.verdict === "REDESIGN" ? "STATUS" : "%age"} val={R.bs.extra ? (R.bs.extra.verdict === "REDESIGN" ? "REDESIGN" : fmt(R.bs.extra.pct, 0)) : R.bs.stB} unit={R.bs.extra?.verdict === "INCREASE" ? "%" : ""} color={R.bs.stB === "SAFE" ? C.green : C.red} />
                </Group>
              )}
              <div className="mt-4">
                <button onClick={() => setShowWork((v) => !v)} className="cs-btn px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.ink2, background: C.surf, font: `600 12px ${UI}` }}>{showWork ? "Hide calculation details" : "Show calculation details"}</button>
                {showWork && <div className="mt-2 csin"><FormulaLedger F={F} ready={kReady} /></div>}
              </div>
            </div>
          )}
          {R?.incomplete && <div className="mt-3 px-4 py-6 rounded text-center" style={{ background: C.surf, border: `1px dashed ${C.line}`, color: C.inkDim, font: `500 14px ${UI}` }}>Enter {R.missing.join(" and ")} on the right — the slab and results build as you type.</div>}
        </main>

        {sel && (
          <aside className="lg:w-72 shrink-0 space-y-4">
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="GEOMETRY" accent={C.teal} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Short span" hint="Lx" unit="m" value={sel.Lx} onChange={(v) => upd(sel.id, "Lx", v)} />
                <Field label="Long span" hint="Ly" unit="m" value={sel.Ly} onChange={(v) => upd(sel.id, "Ly", v)} />
                <Field label="Thickness" hint="D" unit="mm" value={sel.D} onChange={(v) => upd(sel.id, "D", v)} />
                <Field label="Factored load" hint="w" unit="T/m²" value={sel.w} onChange={(v) => upd(sel.id, "w", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="SUPPORT CONDITION" accent={C.brass} />
              <div className="grid grid-cols-3 gap-1.5">{Object.keys(COND_NAMES).map((k) => { const kn = +k, on = sel.cond === kn; return (<button key={k} onClick={() => upd(sel.id, "cond", kn)} title={COND_NAMES[kn]} className="cs-cond rounded-lg p-1 flex flex-col items-center" style={{ background: on ? C.brassBg : C.surf2, border: `1px solid ${on ? C.brass : C.line}` }}><CondGlyph cond={kn} size={40} active={on} /><span style={{ font: `700 10px ${MONO}`, color: on ? C.brass : C.inkDim }}>{k}</span></button>); })}</div>
              <div style={{ font: `500 11px ${UI}`, color: C.ink2, marginTop: 8, lineHeight: 1.4 }}><b style={{ color: C.brass }}>{sel.cond}.</b> {COND_NAMES[sel.cond]}</div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="REINFORCEMENT" accent={C.ink2} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Bar diameter" hint="Ø" unit="mm" value={sel.dia} onChange={(v) => upd(sel.id, "dia", v)} />
                <Field label="Provided spacing" hint="Sx+" unit="mm" value={sel.sProv} onChange={(v) => upd(sel.id, "sProv", v)} />
              </div>
            </div>
            <div className="cs-card rounded-xl p-3" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <SecHead label="MATERIALS" accent={C.green} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Concrete" hint="fck" unit="N/mm²" value={g.fck} onChange={(v) => setG({ ...g, fck: v })} />
                <Field label="Steel" hint="fy" unit="N/mm²" value={g.fy} onChange={(v) => setG({ ...g, fy: v })} />
                <Field label="Cover" unit="mm" value={g.cover} onChange={(v) => setG({ ...g, cover: v })} />
                <Field label="Min steel" unit="%" value={g.minPct} onChange={(v) => setG({ ...g, minPct: v })} />
              </div>
            </div>
          </aside>
        )}
      </div>
      {showReport && <Report panels={panels} results={results} g={g} project={project} ready={kReady} onClose={() => setShowReport(false)} onXlsx={exportXlsx} />}
    </div>
  );
}
