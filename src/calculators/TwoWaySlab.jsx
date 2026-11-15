import React, { useState, useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import * as XLSX from "xlsx";
import { C, UI, MONO, SERIF, fmt, sColor, useSharedStyles, useThemeMode } from "../theme.js";
import { Field, FormSec, FormulaLedger, TeX, useKaTeX, ThemeToggle, VerdictBadge, countBlank, blankMsg } from "../components/ui.jsx";
import Feedback from "../components/Feedback.jsx";
import { printDetails, Ln, Rect, Tx, Leader, Dim, ViewTitle, Cut, fitScale, textWidth, Brk, slabSection, MarkTable, BW } from "../components/DetailSheet.jsx";

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
  const nb = countBlank(p, ["Lx", "Ly", "w", "D", "dia", "sProv"]) + countBlank(g, ["fck", "fy", "cover", "minPct"]);
  if (nb) return { incomplete: true, missing: blankMsg(nb), verdict: "-" };
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

/* ===== typical slab detail sheet (CivilSpace drafting style, see components/DetailSheet.jsx) =====
   Conventions from the firm's typical slab detail: ALTHROUGH bottom mesh stated once, not drawn in plan; extra top
   bars drawn once each, dimensioned from the beam face and called up by mark (n, n1 ...) in a SLAB REINF. MARKED
   table; sections cut through the beams. Extents are span fractions: 0.3 Lx over continuous edges, 0.1 Lx at
   discontinuous edges (50 % of mid-span steel), torsion steel over Lx/5 (IS 456 Annex D-1.8, D-1.9). */
function twoWayDetail(p, r, g, sheetNo, nSheets) {
  const e = EDGES[p.cond], dia = p.dia, cov = g.cover, Lx = p.Lx * 1000, Ly = p.Ly * 1000;
  const cap = Math.floor(Math.min(3 * r.d, 300) / 25) * 25;
  const sp = (s) => Math.min(Math.floor(s / 25) * 25, cap);
  const up50 = (v) => Math.ceil(v / 50) * 50;
  const ext = { C: up50(0.3 * Lx), D: up50(0.1 * Lx) };
  const bar = (s) => `${dia}Ø @ ${s} C/C`;
  const dist = sp((Math.PI * dia * dia / 4) * 1000 / r.minAst);

  // ---- bar marks (one mark per distinct bar) ----
  const marks = [], markOf = (key, bars, where) => { let m = marks.find((q) => q.key === key); if (!m) { m = { key, mk: (key[0] === "t" ? "t" : "n") + (marks.filter((q) => q.key[0] === key[0]).length || ""), bars, where }; marks.push(m); } return m.mk; };
  const topMark = (edge) => { const xdir = edge === "left" || edge === "right";
    if (e[edge] === "C") { const s = xdir ? r.S.xn : r.S.yn; return markOf(`n${s}C`, bar(s), `TOP ${xdir ? "SHORT" : "LONG"}-SPAN BARS OVER CONTINUOUS EDGE, ${ext.C} EACH SIDE OF BEAM`); }
    const s = sp(2 * (xdir ? r.S.xp : r.S.yp)); return markOf(`n${s}D${xdir}`, bar(s), `TOP ${xdir ? "SHORT" : "LONG"}-SPAN BARS AT DISCONT. EDGE (50% MID-SPAN), ${ext.D} FROM BEAM`); };
  const tm = {}; ["left", "right", "top", "bottom"].forEach((k) => (tm[k] = topMark(k)));
  const corner = (a, b) => (e[a] === "D") + (e[b] === "D");
  const nC = [["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].map(([a, b]) => corner(a, b));
  const tFull = nC.includes(2) ? markOf("t2", `${bar(sp(r.S.xp / 0.75))} BOTH WAYS, T & B`, `TORSION MESH, CORNER WITH BOTH EDGES DISCONT., ${up50(Lx / 5)} x ${up50(Lx / 5)}`) : null;
  const tHalf = nC.includes(1) ? markOf("t1", `${bar(sp(r.S.xp / 0.375))} BOTH WAYS, T & B`, `TORSION MESH, CORNER WITH ONE EDGE DISCONT., ${up50(Lx / 5)} x ${up50(Lx / 5)}`) : null;

  // ---- PLAN ----
  const cont = 600, Wm = Lx + 2 * BW + 2 * cont, Hm = Ly + 2 * BW + 2 * cont;
  const sc = fitScale(Wm, Hm, 270, 400, [20, 25, 30, 40, 50, 75, 100]);
  const ox = 40 + (290 - Wm / sc) / 2 + (BW + cont) / sc, oy = 40 + (430 - Hm / sc) / 2 + (BW + cont) / sc;
  const P = (x, y) => [ox + x / sc, oy + y / sc];
  const plan = [];
  // beams (dashed: under the slab) and columns (solid grey)
  for (const y of [-BW, 0, Ly, Ly + BW]) plan.push(<Ln key={"bh" + y} a={P(-BW, y)} b={P(Lx + BW, y)} k="HID" />);
  for (const x of [-BW, 0, Lx, Lx + BW]) plan.push(<Ln key={"bv" + x} a={P(x, -BW)} b={P(x, Ly + BW)} k="HID" />);
  for (const [x, y] of [[-BW, -BW], [Lx, -BW], [-BW, Ly], [Lx, Ly]]) { const [a, b] = P(x, y); plan.push(<Rect key={"c" + x + y} x={a} y={b} w={BW / sc} h={BW / sc} fill="#808080" />); }
  // slab edges: discontinuous = slab stops at the beam's outer face; continuous = slab carries on (break line)
  const brk = (a, b) => <Brk a={a} b={b} />;
  const out = (k) => (e[k] === "C" ? BW + cont : BW);   // slab's outer extent beyond each panel edge
  const X0 = -out("left"), X1 = Lx + out("right"), Y0 = -out("top"), Y1 = Ly + out("bottom");
  const edgeLine = { top: [[X0, Y0], [X1, Y0]], bottom: [[X0, Y1], [X1, Y1]], left: [[X0, Y0], [X0, Y1]], right: [[X1, Y0], [X1, Y1]] };
  for (const k of ["top", "bottom", "left", "right"]) { const [a, b] = edgeLine[k];
    plan.push(e[k] === "D" ? <Ln key={"e" + k} a={P(...a)} b={P(...b)} k="CONC" /> : <g key={"e" + k}>{brk(P(...a), P(...b))}</g>); }
  // extra top bars, one of each, dimensioned from the beam face
  const tick = 1.6;
  const tb = { left: [0.3, "x", 0, 1], right: [0.7, "x", Lx, -1], top: [0.7, "y", 0, 1], bottom: [0.3, "y", Ly, -1] };
  for (const [k, [f, ax, face, dir]] of Object.entries(tb)) {
    const C_ = e[k] === "C", Lb = ext[e[k]], outer = face - dir * (C_ ? BW + Lb : BW - cov), inner = face + dir * Lb;
    const at = (u) => (ax === "x" ? P(u, f * Ly) : P(f * Lx, u));
    const A = at(outer), B = at(inner);
    plan.push(<g key={"t" + k}>
      <Ln a={A} b={B} k="BAR" />
      {!C_ && (ax === "x" ? <Ln a={A} b={[A[0], A[1] + tick]} k="BAR" /> : <Ln a={A} b={[A[0] + tick, A[1]]} k="BAR" />)}
      {ax === "x" ? <Dim p1={at(face)} p2={B} off={-3} text={`${Lb}`} /> : <Dim p1={at(face)} p2={B} off={-3} text={`${Lb}`} vertical />}
      {C_ && (ax === "x" ? <Dim p1={at(face - dir * BW)} p2={A} off={-3} text={`${Lb}`} /> : <Dim p1={at(face - dir * BW)} p2={A} off={-3} text={`${Lb}`} vertical />)}
      <Leader to={at(face + dir * Lb * 0.55)} at={ax === "x" ? [at(face + dir * Lb * 0.55)[0] + 4 * dir, at(0)[1] + 9] : [at(0)[0] + 7, at(face + dir * Lb * 0.55)[1] + 8 * dir]} text={tm[k]} a={dir > 0 ? "start" : "end"} />
    </g>);
  }
  // torsion zones at corners
  const tz = up50(Lx / 5) / sc;
  [["top", "left", 0, 0, 1, 1], ["top", "right", Lx, 0, -1, 1], ["bottom", "left", 0, Ly, 1, -1], ["bottom", "right", Lx, Ly, -1, -1]].forEach(([a, b, x, y, sx, sy], i) => {
    const n = nC[i]; if (!n) return; const [px, py] = P(x, y), x0 = sx > 0 ? px : px - tz, y0 = sy > 0 ? py : py - tz;
    plan.push(<g key={"tz" + i}><Rect x={x0} y={y0} w={tz} h={tz} k="EDGE" /><Ln a={[x0, y0]} b={[x0 + tz, y0 + tz]} k="HATCH" /><Ln a={[x0 + tz, y0]} b={[x0, y0 + tz]} k="HATCH" />
      <Tx x={x0 + tz / 2} y={y0 + tz / 2 - 1} a="middle">{n === 2 ? tFull : tHalf}</Tx></g>);
  });
  // spans, cut lines A-A (short span) and B-B (long span)
  plan.push(<Dim key="dx" p1={P(0, Y1)} p2={P(Lx, Y1)} off={12} text={`${Lx}`} />);
  plan.push(<Dim key="dy" p1={P(X1, 0)} p2={P(X1, Ly)} off={12} text={`${Ly}`} vertical />);
  const ya = P(0, 0.5 * Ly)[1], xb = P(0.5 * Lx, 0)[0];
  plan.push(<g key="cuts"><Cut c={[P(X0, 0)[0] - 4, ya]} dir="up" letter="A" /><Cut c={[P(X1, 0)[0] + 4, ya]} dir="up" letter="A" />
    <Cut c={[xb, P(0, Y0)[1] - 4]} dir="left" letter="B" /><Cut c={[xb, P(0, Y1)[1] + 4]} dir="left" letter="B" /></g>);
  const [pcx] = P(Lx / 2, 0), pBot = P(0, Y1)[1] + 6;
  plan.push(<ViewTitle key="vt" x={pcx} y={pBot + 22} title={`TYPICAL SLAB REINFORCEMENT PLAN - ${String(p.name).toUpperCase()}`} scale={sc} />);
  const alth = `ALTHROUGH REINF. ${bar(r.S.xp)} (SHORT SPAN) & ${bar(r.S.yp)} (LONG SPAN) AT BOTTOM, NOT SHOWN IN PLAN FOR CLARITY, EXCEPT SHOWN.`;
  const altW = Math.min(300, textWidth(alth) + 8), altLines = altW < textWidth(alth) + 8 ? [alth.slice(0, alth.indexOf(" AT BOTTOM") + 10), alth.slice(alth.indexOf(" AT BOTTOM") + 11)] : [alth];
  plan.push(<g key="alth"><Rect x={pcx - altW / 2} y={pBot + 34} w={altW} h={4 + altLines.length * 5} k="TITLE" />{altLines.map((t, i) => <Tx key={i} x={pcx} y={pBot + 39.5 + i * 5} a="middle">{t}</Tx>)}</g>);

  // ---- SECTIONS ----
  const sx = { D: p.D, dia, cov, ext, dist, bar, x0: 345, boxW: 290 };
  const secA = slabSection({ ...sx, y0: 70, span: Lx, eL: e.left, eR: e.right, mL: tm.left, mR: tm.right, mainS: r.S.xp, crossS: r.S.yp, mainOuter: true, title: "SECTION A-A" });
  const secB = slabSection({ ...sx, y0: 205, span: Ly, eL: e.top, eR: e.bottom, mL: tm.top, mR: tm.bottom, mainS: r.S.yp, crossS: r.S.xp, mainOuter: false, title: "SECTION B-B" });

  // ---- SLAB REINF. MARKED ----
  const rows = [["MARK", "BARS", "LOCATION"], ...marks.map((m) => [m.mk, m.bars, m.where]), ["DIST.", bar(dist), "UNDER TOP BARS (MIN. STEEL)"]];
  const table = <MarkTable key="tbl" rows={rows} x={350} y={360} />;

  const notes = [
    "ALL DIMENSIONS IN mm UNLESS NOTED. DO NOT SCALE THE DRAWING.",
    `CONCRETE M${g.fck}, REINFORCEMENT Fe${g.fy} TO IS 1786. SLAB ${p.D} THK. CLEAR COVER ${g.cover}.`,
    `${alth}`,
    "BOTTOM BARS OF THE SHORT SPAN IN THE OUTER LAYER, LONG SPAN ABOVE THEM. ALL BOTTOM BARS CARRIED INTO THE SUPPORTS; NOT CURTAILED.",
    `TOP BARS OVER CONTINUOUS EDGES EXTEND 0.3 Lx = ${ext.C} FROM THE BEAM FACE ON EACH SIDE.`,
    `AT DISCONTINUOUS EDGES TOP BARS = 50% OF MID-SPAN STEEL, EXTEND 0.1 Lx = ${ext.D} FROM THE BEAM FACE, BENT DOWN INTO THE BEAM (IS 456 ANNEX D).`,
    `TORSION STEEL AT CORNERS OVER Lx/5 = ${up50(Lx / 5)} EACH WAY, TOP AND BOTTOM: 3/4 OF SHORT-SPAN MID-SPAN STEEL WHERE BOTH EDGES ARE DISCONTINUOUS, HALF OF THAT WHERE ONE IS (IS 456 ANNEX D-1.8, D-1.9).`,
    `DISTRIBUTION BARS ${bar(dist)} UNDER ALL TOP BARS. MAX. BAR SPACING ${cap} (IS 456 CL 26.3.3).`,
    "LAPS AND ANCHORAGE AS PER IS 456 CL 26.2. NO LAPS OF MAIN BARS IN HIGH-MOMENT ZONES; NOT MORE THAN 50% LAPPED AT ONE SECTION.",
    "BEAMS ARE INDICATIVE: AS PER BEAM DETAIL. DRAWINGS TO BE READ WITH ARCHITECTURAL DRAWINGS; VERIFY DIMENSIONS AT SITE.",
    "OPENINGS LARGER THAN SHOWN NOT TO BE MADE WITHOUT STRUCTURAL REVIEW.",
  ];
  return {
    title: `TYPICAL SLAB DETAIL - ${String(p.name).toUpperCase()} (CASE ${p.cond})`,
    drgNo: `CS-SL-${String(sheetNo).padStart(2, "0")}`,
    scales: [...new Set([sc, ...[secA, secB].map((s) => s.find((q) => q.key === "vt").props.scale)])].map((v) => `1:${v}`).join(", "),
    notes,
    body: <g>{plan}{secA}{secB}{table}</g>,
  };
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
  const add = () => { const id = nextId.current++; setPanels((ps) => [...ps, { id, name: "S" + id, cond: 4, Lx: null, Ly: null, w: null, D: null, dia: null, sProv: null }]); setSelId(id); setShowWork(false); };
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

  const detailable = panels.filter((p) => { const r = results[p.id]; return !r.incomplete && !Number.isNaN(r.Ast.xp); });
  const downloadDetails = () => printDetails({ project, sheets: detailable.map((p, i) => twoWayDetail(p, results[p.id], g, i + 1, detailable.length)) });
  const F = sel && R ? buildFormulas(sel, R, g) : [];
  const btn = (x) => ({ font: `600 12px ${UI}`, ...x });
  const KEYS = [["xp", "Bottom · short span", "Mx+"], ["yp", "Bottom · long span", "My+"], ["xn", "Top · short span (support)", "Mx−"], ["yn", "Top · long span (support)", "My−"]];
  const barTxt = (p, r, k) => r.Ast[k] == null ? "NA" : Number.isNaN(r.Ast[k]) ? "fails" : `Ø${p.dia} @ ${fmt(r.S[k], 0)}`;

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
            <div style={{ font: `400 21px ${SERIF}`, letterSpacing: "-0.01em", color: C.ink }}>Two-way Slab Design</div>
            <div style={{ font: `400 12px ${UI}`, color: C.inkDim }}>IS 456:2000 · Table 26 · deflection with BS 8110 fallback</div>
          </div>
          <div className="flex items-center gap-2 ml-2 px-3 py-1.5 rounded-lg" style={{ background: C.surf2, border: `1px solid ${C.line}` }}>
            <span style={{ font: `500 12px ${UI}`, color: C.inkDim }}>Project</span>
            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="untitled" className="outline-none" style={{ font: `600 14px ${MONO}`, color: C.ink, minWidth: 150, background: "transparent" }} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Feedback context="two-way-slab" inline />
            <button onClick={exportXlsx} disabled={!panels.length} className="cs-btn px-3.5 py-2 rounded-lg" style={btn({ border: `1px solid ${panels.length ? C.brass : C.line}`, color: panels.length ? C.brass : C.inkDim, background: C.surf })}>Export Excel</button>
            <button onClick={downloadDetails} disabled={!detailable.length} title={detailable.length ? "Opens a print-ready sheet per panel — choose Save as PDF" : "Complete a panel first"} className="cs-btn px-3.5 py-2 rounded-lg" style={btn({ border: `1px solid ${detailable.length ? C.brass : C.line}`, color: detailable.length ? C.brass : C.inkDim, background: C.surf })}>Typical details (PDF)</button>
            <button onClick={() => setShowReport(true)} disabled={!panels.length} className="cs-btn px-3.5 py-2 rounded-lg" style={btn({ background: panels.length ? C.green : C.line, color: "#fff" })}>Generate report</button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* PANEL SCHEDULE */}
      {panels.length > 0 && (() => {
        const th = { font: `700 11px ${UI}`, color: C.inkDim, letterSpacing: 0.8, textTransform: "uppercase", padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" };
        const td = { font: `600 13.5px ${MONO}`, color: C.ink, padding: "7px 12px", textAlign: "right", borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap" };
        const v = (x) => (x == null ? "—" : x);
        return (
          <section className="mx-auto px-4 pt-4" style={{ maxWidth: 1320 }}>
            <div className="cs-card rounded-xl overflow-hidden" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span style={{ font: `700 13px ${UI}`, color: C.ink }}>Panel schedule</span>
                <span style={{ font: `500 12px ${UI}`, color: C.inkDim }}>{safeN} of {panels.length} safe</span>
                <button onClick={add} className="cs-btn ml-auto px-3 py-1.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 13px ${UI}` }}>+ Add panel</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "left" }}>Panel</th><th style={th}>Case</th><th style={th}>Lx × Ly (m)</th><th style={th}>D</th><th style={th}>w (T/m²)</th>
                    <th style={th}>Bottom x</th><th style={th}>Bottom y</th><th style={th}>Top x</th><th style={th}>Top y</th><th style={{ ...th, textAlign: "left" }}>Status</th><th style={th} />
                  </tr></thead>
                  <tbody>
                    {panels.map((p) => { const r = results[p.id], on = selId === p.id, done = !r.incomplete;
                      return (
                        <tr key={p.id} onClick={() => { setSelId(p.id); setShowWork(false); }} className="cursor-pointer" style={{ background: on ? C.brassBg : "transparent", boxShadow: on ? `inset 3px 0 0 ${C.brass}` : "none" }}>
                          <td style={{ ...td, font: `700 13.5px ${UI}`, color: on ? C.brass : C.ink, textAlign: "left" }}>{p.name}</td>
                          <td style={td}>{p.cond}</td><td style={td}>{v(p.Lx)} × {v(p.Ly)}</td><td style={td}>{v(p.D)}</td><td style={td}>{v(p.w)}</td>
                          {KEYS.map(([k]) => <td key={k} style={td}>{done ? barTxt(p, r, k) : "—"}</td>)}
                          <td style={{ ...td, font: `600 12.5px ${UI}`, color: sColor(r.verdict), textAlign: "left" }}>● {done ? r.verdict.toLowerCase() + (r.tag ? " (BS)" : "") : "awaiting inputs"}</td>
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
        {/* LEFT — compact form */}
        {sel && (
          <aside className="cs-card rounded-xl px-4 py-3 lg:sticky lg:top-4" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
            <Field compact text label="Name" value={sel.name} onChange={(v) => upd(sel.id, "name", v)} />
            <FormSec title="Geometry & load" />
            <Field compact label="Short span" hint="Lx" unit="m" value={sel.Lx} onChange={(v) => upd(sel.id, "Lx", v)} />
            <Field compact label="Long span" hint="Ly" unit="m" value={sel.Ly} onChange={(v) => upd(sel.id, "Ly", v)} />
            <Field compact label="Thickness" hint="D" unit="mm" value={sel.D} onChange={(v) => upd(sel.id, "D", v)} />
            <Field compact label="Factored load" hint="w" unit="T/m²" value={sel.w} onChange={(v) => upd(sel.id, "w", v)} />
            <FormSec title="Support condition" />
            <div className="grid grid-cols-9 gap-1">{Object.keys(COND_NAMES).map((k) => { const kn = +k, on = sel.cond === kn; return (<button key={k} onClick={() => upd(sel.id, "cond", kn)} title={COND_NAMES[kn]} className="rounded-md flex flex-col items-center py-0.5" style={{ background: on ? C.brassBg : C.surf2, border: `1px solid ${on ? C.brass : C.line}` }}><CondGlyph cond={kn} size={30} active={on} /><span style={{ font: `700 10px ${MONO}`, color: on ? C.brass : C.inkDim }}>{k}</span></button>); })}</div>
            <div style={{ font: `500 12px ${UI}`, color: C.ink2, margin: "6px 0 2px" }}><b style={{ color: C.brass }}>{sel.cond}.</b> {COND_NAMES[sel.cond]}</div>
            <FormSec title="Reinforcement" />
            <Field compact label="Bar diameter" hint="Ø" unit="mm" value={sel.dia} onChange={(v) => upd(sel.id, "dia", v)} />
            <Field compact label="Spacing provided, bottom" hint="Sx+" unit="mm" value={sel.sProv} onChange={(v) => upd(sel.id, "sProv", v)} />
            <FormSec title="Materials · all panels" />
            <Field compact label="Concrete grade" hint="fck" unit="N/mm²" value={g.fck} onChange={(v) => setG({ ...g, fck: v })} />
            <Field compact label="Steel grade" hint="fy" unit="N/mm²" value={g.fy} onChange={(v) => setG({ ...g, fy: v })} />
            <Field compact label="Clear cover" unit="mm" value={g.cover} onChange={(v) => setG({ ...g, cover: v })} />
            <Field compact label="Minimum steel" unit="%" value={g.minPct} onChange={(v) => setG({ ...g, minPct: v })} />
          </aside>
        )}

        {/* RIGHT — 3D + answer + checks */}
        <main className="min-w-0">
          {sel ? (
            <>
              <div className="cs-card rounded-xl relative" style={{ background: C.surf, border: `1px solid ${C.line}`, height: 280, overflow: "hidden" }}>
                <SlabViewer key={mode} panel={sel} />
                <div className="absolute top-3 left-4 pointer-events-none"><div style={{ font: `700 18px ${UI}`, color: C.ink }}>{sel.name}</div><div style={{ font: `400 12px ${UI}`, color: C.inkDim }}>{COND_NAMES[sel.cond]} · drag to rotate</div></div>
                {R && !R.incomplete && <div className="absolute top-3 right-4"><VerdictBadge verdict={R.verdict} label={`${R.verdict}${R.tag ? " · " + R.tag : ""}`} size="lg" /></div>}
                <div className="absolute bottom-3 right-4 flex items-center gap-3 pointer-events-none" style={{ font: `500 11px ${UI}`, color: C.inkDim }}><span className="flex items-center gap-1"><span style={{ width: 12, height: 3, background: C.cyanDeep, display: "inline-block", borderRadius: 2 }} />continuous edge</span><span className="flex items-center gap-1"><span style={{ width: 6, height: 6, background: C.cyan, borderRadius: 6, display: "inline-block" }} />discontinuous</span></div>
              </div>

              {R && !R.incomplete && (() => {
                const th = { font: `700 11px ${UI}`, color: C.inkDim, letterSpacing: 1, textTransform: "uppercase", padding: "8px 14px", textAlign: "right" };
                const td = { font: `600 14px ${MONO}`, color: C.ink, padding: "8px 14px", textAlign: "right", borderTop: `1px solid ${C.line}` };
                const coef = { xp: R.axp, yp: R.ayp, xn: R.axn, yn: R.ayn };
                const checks = [];
                if (R.defl) checks.push(["Deflection — IS 456 Cl 23.2.1", fmt(R.defl.allow, 2), `≥ ${sel.Lx}`, "m", R.defl.status === "SAFE"]);
                if (R.bs) checks.push(["Deflection — BS 8110 fallback", fmt(R.bs.allowB, 2), `≥ ${sel.Lx}`, "m", R.bs.stB === "SAFE"]);
                return (
                  <div className="mt-3 space-y-3 csin" key={sel.id}>
                    {/* 1 — the answer: four bar sets */}
                    <div className="cs-card rounded-xl grid grid-cols-2 lg:grid-cols-4" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                      {KEYS.map(([k, name], i) => { const bad = Number.isNaN(R.Ast[k]); return (
                        <div key={k} className="px-4 py-3" style={{ borderLeft: i ? `1px solid ${C.line}` : "none" }}>
                          <div style={{ font: `600 12.5px ${UI}`, color: C.inkDim }}><span style={{ color: k.endsWith("n") ? C.red : C.teal }}>●</span> {name}</div>
                          <div style={{ font: `700 24px ${MONO}`, color: bad ? C.red : C.ink, marginTop: 2 }}>{R.Ast[k] == null ? "—" : bad ? "fails" : <>Ø{sel.dia} @ {fmt(R.S[k], 0)}</>}</div>
                          <div style={{ font: `400 12px ${UI}`, color: bad ? C.red : C.inkDim }}>{R.Ast[k] == null ? "edge discontinuous — no hogging steel" : bad ? "section too thin — increase D" : `Ast ${fmt(R.Ast[k], 0)} mm²/m`}</div>
                        </div>); })}
                    </div>

                    {/* 2 — summary + checks */}
                    <div className="cs-card rounded-xl overflow-x-auto" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                      <table className="w-full" style={{ borderCollapse: "collapse" }}>
                        <thead><tr><th style={{ ...th, textAlign: "left" }}>Design summary</th><th style={th}>Coeff.</th><th style={th}>M (T·m/m)</th><th style={th}>Ast (mm²/m)</th><th style={th}>Spacing (mm)</th></tr></thead>
                        <tbody>
                          {KEYS.map(([k, , sym]) => (
                            <tr key={k}>
                              <td style={{ ...td, font: `500 13.5px ${UI}`, color: C.ink2, textAlign: "left" }}>{sym}</td>
                              <td style={td}>{coef[k] ? fmt(coef[k], 3) : "—"}</td><td style={td}>{fmt(R.M[k], 3)}</td><td style={td}>{fmt(R.Ast[k], 0)}</td><td style={td}>{fmt(R.S[k], 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="cs-card rounded-xl overflow-x-auto" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
                      <table className="w-full" style={{ borderCollapse: "collapse" }}>
                        <thead><tr><th style={{ ...th, textAlign: "left" }}>Check</th><th style={th}>Allowable span</th><th style={th}>Limit</th><th style={{ ...th, textAlign: "left" }}>Unit</th><th style={th}>Result</th></tr></thead>
                        <tbody>
                          {checks.length ? checks.map(([name, val, lim, unit, ok]) => (
                            <tr key={name}>
                              <td style={{ ...td, font: `500 13.5px ${UI}`, color: C.ink2, textAlign: "left" }}>{name}</td>
                              <td style={{ ...td, color: ok ? C.ink : C.red }}>{val}</td><td style={{ ...td, color: C.ink2 }}>{lim}</td>
                              <td style={{ ...td, font: `500 12px ${MONO}`, color: C.inkDim, textAlign: "left" }}>{unit}</td>
                              <td style={{ ...td, font: `700 12.5px ${UI}`, color: ok ? C.green : C.red }}>{ok ? "✓ OK" : "✗ FAIL"}</td>
                            </tr>
                          )) : <tr><td colSpan={5} style={{ ...td, font: `500 13px ${UI}`, color: C.red, textAlign: "left" }}>Deflection not checked — short-span bottom steel fails flexure.</td></tr>}
                          {R.bs?.extra && <tr><td colSpan={5} style={{ ...td, font: `500 13px ${UI}`, color: C.red, textAlign: "left" }}>{R.bs.extra.verdict === "REDESIGN" ? "Redesign — no steel increase can satisfy deflection. Increase D." : `Increase short-span bottom steel by ${fmt(R.bs.extra.pct, 0)}% (to ${fmt(R.bs.extra.astReq2, 0)} mm²/m).`}</td></tr>}
                        </tbody>
                      </table>
                    </div>

                    {/* 3 — details */}
                    <div>
                      <button onClick={() => setShowWork((v) => !v)} className="cs-btn px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.ink2, background: C.surf, font: `600 12px ${UI}` }}>{showWork ? "Hide calculation details" : "Show calculation details"}</button>
                      {showWork && (
                        <div className="mt-2 csin">
                          <div style={{ font: `400 13px/1.6 ${UI}`, color: C.ink2, marginBottom: 8 }}>
                            Ly/Lx = {fmt(R.r, 3)} · d = {fmt(R.d, 0)} mm · Ast,min = {fmt(R.minAst, 0)} mm²/m
                            {R.defl && <> · pt = {fmt(R.defl.pt, 3)}% · MF = {fmt(R.defl.MF, 3)} · basic L/d = {R.defl.basic}</>}
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
              <div style={{ font: `400 24px ${SERIF}`, color: C.ink }}>Start a two-way slab panel</div>
              <div style={{ font: `400 14px ${UI}`, color: C.inkDim, maxWidth: 400, marginTop: 6, lineHeight: 1.5 }}>Add a panel, then fill in spans, thickness, load, support case and bars on the left.</div>
              <button onClick={add} className="cs-btn mt-5 px-5 py-2.5 rounded-lg" style={{ background: C.brass, color: "#fff", font: `700 14px ${UI}` }}>+ Add your first panel</button>
            </div>
          )}
        </main>
      </div>
      {showReport && <Report panels={panels} results={results} g={g} project={project} ready={kReady} onClose={() => setShowReport(false)} onXlsx={exportXlsx} />}
    </div>
  );
}
