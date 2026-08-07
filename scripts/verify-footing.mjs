// Verify the isolated-footing engine reproduces "Isolated footing FLAT (1).xlsx".
// Each footing row (marked rows F1/F2/F3) is fed as ONE load combination; the
// design (min-depth) envelope for these marked rows equals their own moment, so
// a single-combo check matches every column R..BW of the sheet.
//
// Column map (row 9 headers) → variables:
//   D LF · F axial(Puy) · H Mux(=K Muxb) · J Muz(=L Muzb)
//   N Lx · O Lz · P Dprov · X SBC · Y Ped-x · Z Ped-z · AA platform
//   AB fck · AC fy · AD cover · AW dia · AZ spX · BA spZ

const sq = Math.sqrt;

/* one load-combination line = one sheet row (all columns computed) */
function combo(c) {
  const { LF, P, Mux, Muz, Lx, Lz, Dprov, Pedx, Pedz, plat, fck, fy, cover, dia, spX, spZ } = c;
  const K = Mux, L = Muz, Q = Dprov;                                   // Q(d) = Dprov
  // gross soil pressure at 4 corners (service; Pu ÷ LF), ×1.1 on axial
  const base = (P * 1.1) / Lx / Lz;
  const mx = (6 * K) / Lx / Lz / Lz, mz = (6 * L) / Lz / Lx / Lx;
  const p1 = (base + mx + mz) / LF;                                    // R
  const p2 = (base + mx - mz) / LF;                                    // S
  const p3 = (base - mx + mz) / LF;                                    // T
  const p4 = (base - mx - mz) / LF;                                    // U
  const pavg = (p1 + p2 + p3 + p4) / 4;                               // V
  const pdes = (P / Lx / Lz + (6 * K) / Lx / Lz / Lz + (6 * L) / Lz / Lx / Lx) / LF; // W (net, no 1.1)
  const Bx = Lx * 1000, Bz = Lz * 1000;                               // AG, AH
  const Mux_d = (pdes * (Lx - Pedx / 1000) ** 2 / 8) * LF * Lz;        // AE
  const Muz_d = (pdes * (Lz - Pedz / 1000) ** 2 / 8) * LF * Lx;        // AF
  const dx = Dprov - cover - 24, dz = Dprov - cover - 8;              // AJ, AK (hardcoded offsets)
  const MuBd2x = (Mux_d * 1e6) / Bz / dx / dx;                        // AN
  const MuBd2z = (Muz_d * 1e6) / Bx / dz / dz;                        // AO
  const AP = (1.005 * fy) / fck;                                      // AP
  const Qx = MuBd2x / 0.87 / fy, Qz = MuBd2z / 0.87 / fy;             // AQ, AR
  const ptx = Math.max((100 * (1 - sq(1 - 4 * AP * Qx))) / 2 / AP, 85 / fy); // AS
  const ptz = Math.max((100 * (1 - sq(1 - 4 * AP * Qz))) / 2 / AP, 85 / fy); // AT
  const Astx = (ptx * Bz * dx) / 100 / Lz;                           // AU (mm²/m)
  const Astz = (ptz * Bx * dz) / 100 / Lx;                           // AV
  const spx = (3.142 * dia * dia) / 4 / Astx * 1000;                 // AX
  const spz = (3.142 * dia * dia) / 4 / Astz * 1000;                 // AY
  const AstxP = (0.785 * dia * dia * 1000) / spX;                    // BB
  const AstzP = (0.785 * dia * dia * 1000) / spZ;                    // BC
  // one-way shear — trapezoidal critical section
  const ratx = ((Bx - Pedx) / 2 - dx) / ((Bx - Pedx) / 2 - plat);    // BD
  const trTopX = Bx - (Bx - Pedx - 2 * plat) * ratx;                 // BE
  const trDx = (Dprov - Q) * ratx + Q;                              // BF
  const trAx = Bx * Q + ((Bx + trTopX) / 2) * (trDx - Q);           // BG
  const VuX = ((Bx - Pedx) / 2 - dx) / 1000 * Lz * pdes;            // BH
  const ratz = ((Bz - Pedz) / 2 - dz) / ((Bz - Pedz) / 2 - plat);   // BI
  const trTopZ = Bz - (Bz - Pedz - 2 * plat) * ratz;                // BJ
  const trDz = (Dprov - Q) * ratz + Q;                              // BK
  const trAz = Bz * Q + ((Bz + trTopZ) / 2) * (trDz - Q);           // BL
  const VuZ = ((Bz - Pedz) / 2 - dz) / 1000 * Lx * pdes;           // BM
  const tauX = (VuX * 1000 * LF) / trAx;                            // BN
  const tauZ = (VuZ * 1000 * LF) / trAz;                            // BO
  const betaX = (0.8 * fck) / 6.89 / AstxP * trAx / 100;           // BP
  const tauPx = (0.85 * sq(0.8 * fck) * (sq(1 + 5 * betaX) - 1)) / 6 / betaX * 2; // BQ
  const betaZ = (0.8 * fck) / 6.89 / AstzP * trAz / 100;           // BR
  const tauPz = (0.85 * sq(0.8 * fck) * (sq(1 + 5 * betaZ) - 1)) / 6 / betaZ * 2; // BS
  // punching shear
  const punchF = (Lx * Lz - ((Pedx + dx) * (Pedz + dz)) / 1e6) * pavg * LF; // BT
  const punchA = (Pedx + dx + Pedz + dz) * 2 * dx;                  // BU
  const punchS = (punchF * 1000) / punchA;                          // BV
  const punchP = sq(fck) / 4;                                       // BW
  return { p1, p2, p3, p4, pavg, pdes, Bx, Bz, Mux_d, Muz_d, dx, dz, MuBd2x, MuBd2z, AP, ptx, ptz, Astx, Astz, spx, spz, AstxP, AstzP, ratx, trTopX, trAx, VuX, ratz, trTopZ, trAz, VuZ, tauX, tauZ, betaX, tauPx, betaZ, tauPz, punchF, punchA, punchS, punchP };
}

// min-depth envelope over the footing's combos (AI): governed by max design Mux (AE)
function minDepth(combos, res, cover) {
  const AEmax = Math.max(...res.map((r) => r.Mux_d));
  const Bx = res[0].Bx;
  return sq((AEmax * 1e6) / 3.32 / Bx) + cover + 10;
}

/* --- the three fully-worked footings from the sheet --- */
const CASES = [
  {
    name: "F1", in: { LF: 1, P: 420, Mux: 0.879, Muz: 1.355, Lx: 1.8, Lz: 2, Dprov: 300, Pedx: 300, Pedz: 600, plat: 0, fck: 25, fy: 500, cover: 50, dia: 10, spX: 150, spZ: 150 },
    exp: { p1: 130.3205, p2: 127.8112, p3: 128.8555, p4: 126.3462, pavg: 128.3333, pdes: 118.6538, Mux_d: 66.7428, Muz_d: 52.3263, dx: 226, dz: 242, MuBd2x: 0.6534, MuBd2z: 0.4964, AP: 20.1, ptx: 0.17, ptz: 0.17, Astx: 384.2, Astz: 411.4, spx: 204.4508, spz: 190.9334, AstxP: 523.3333, trAx: 540000, VuX: 124.3492, trAz: 600000, VuZ: 97.8182, tauX: 0.2303, tauZ: 0.163, tauPx: 0.4771, tauPz: 0.4545, punchF: 405.1622, punchA: 618336, punchS: 0.6552, punchP: 1.25, AI: 165.681 },
  },
  {
    name: "F2", in: { LF: 1, P: 553, Mux: 1.297, Muz: 3.726, Lx: 2, Lz: 2.4, Dprov: 300, Pedx: 300, Pedz: 600, plat: 0, fck: 25, fy: 500, cover: 50, dia: 10, spX: 150, spZ: 150 },
    exp: { p1: 129.7334, p2: 125.0759, p3: 128.3824, p4: 123.7249, pavg: 126.7292, pdes: 118.2126, Mux_d: 102.4903, Muz_d: 95.7522, MuBd2x: 0.8361, MuBd2z: 0.8175, ptx: 0.2003, ptz: 0.1956, Astx: 452.603, Astz: 473.408, spx: 173.5516, spz: 165.9245, trAx: 600000, VuX: 177.0352, trAz: 720000, VuZ: 155.5678, tauX: 0.2951, tauZ: 0.2161, tauPx: 0.4545, tauPz: 0.4177, punchF: 552.1727, punchA: 618336, punchS: 0.893, punchP: 1.25, AI: 184.2388 },
  },
  {
    name: "F3", in: { LF: 1, P: 685, Mux: 0.631, Muz: 3.885, Lx: 2.25, Lz: 2.6, Dprov: 300, Pedx: 300, Pedz: 600, plat: 0, fck: 25, fy: 500, cover: 50, dia: 10, spX: 125, spZ: 125 },
    exp: { p1: 130.8233, p2: 127.2814, p3: 130.3254, p4: 126.7836, pavg: 128.8034, pdes: 119.1139, Mux_d: 147.2024, Muz_d: 134.0031, MuBd2x: 1.1085, MuBd2z: 1.017, ptx: 0.2694, ptz: 0.2459, Astx: 608.8668, Astz: 595.1761, spx: 129.0102, spz: 131.9777, AstxP: 628, trAx: 675000, VuX: 231.9624, trAz: 780000, VuZ: 203.1487, tauX: 0.3436, tauZ: 0.2604, tauPx: 0.4683, tauPz: 0.438, punchF: 696.454, punchA: 618336, punchS: 1.1263, punchP: 1.25, AI: 200.3774 },
  },
];

let fail = 0, total = 0;
for (const cse of CASES) {
  const r = combo(cse.in);
  r.AI = minDepth([cse.in], [r], cse.in.cover);
  console.log(`\n--- ${cse.name} ---`);
  for (const [k, ev] of Object.entries(cse.exp)) {
    total++;
    const got = r[k];
    const ok = Math.abs(got - ev) < Math.max(0.01, Math.abs(ev) * 0.003);
    if (!ok) fail++;
    console.log(`${ok ? "✓" : "✗"} ${k}: got ${typeof got === "number" ? got.toFixed(4) : got} vs sheet ${ev}`);
  }
}
console.log(`\n=== ${fail ? "FAIL" : "PASS"} (${total - fail}/${total}) ===`);
process.exit(fail ? 1 : 0);
