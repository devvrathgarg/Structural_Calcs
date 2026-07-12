// Verify the one-way engine reproduces the source sheet's numbers.
const COEF = {
  edge:     { topDL: 0.105, topLL: 0.12,  midDL: 0.078, midLL: 0.1  },
  internal: { topDL: 0.079, topLL: 0.111, midDL: 0.046, midLL: 0.086 },
};
const g = { fy: 550, gammaC: 25, gammaFill: 20, addDL: 0.006 * 22, lfDL: 1.5, lfLL: 1.5, cover: 25, minPct: 0.12 };

function calc(type, B, Th, fck, E, live, fire) {
  const co = COEF[type];
  const F = (Th / 1000) * g.gammaC + (E / 1000) * g.gammaFill + g.addDL;
  const wp = F * g.lfDL;
  const wt = live * g.lfLL + fire;
  const d = Th - g.cover;
  const topM = co.topDL * wp * B * B + co.topLL * wt * B * B;
  const midM = co.midDL * wp * B * B + co.midLL * wt * B * B;
  const bd2 = (m) => (m * 1e6) / (1000 * d * d);
  const ptOf = (mbd2) => Math.max((fck / (2 * g.fy)) * (1 - Math.sqrt(1 - (4.598 * mbd2) / fck)) * 100, g.minPct);
  const topBd2 = bd2(topM), midBd2 = bd2(midM);
  const ptTop = ptOf(topBd2), ptMid = ptOf(midBd2);
  const AstTop = (ptTop / 100) * 1000 * d, AstMid = (ptMid / 100) * 1000 * d;
  return { F, wp, wt, topM, topBd2, ptTop, AstTopCm2: AstTop / 100, midM, midBd2, ptMid, AstMidCm2: AstMid / 100 };
}

const cases = [
  { name: "S2 (edge)",     args: ["edge", 3.02, 250, 25, 100, 5, 0], exp: { F: 8.382, wp: 12.573, wt: 7.5, topM: 20.2488, topBd2: 0.4, ptTop: 0.12, AstTopCm2: 2.7, midM: 15.7846, ptMid: 0.12, AstMidCm2: 2.7 } },
  { name: "S3 (edge)",     args: ["edge", 3.88, 250, 25, 100, 5, 0], exp: { topM: 33.4233, topBd2: 0.6602, ptTop: 0.1424, AstTopCm2: 3.2051, midM: 26.0546, ptMid: 0.12 } },
  { name: "S10/S38 (edge)", args: ["edge", 4.75, 200, 25, 100, 5, 0], exp: { topM: 45.6505, topBd2: 1.4906, ptTop: 0.3364, AstTopCm2: 5.8878, midBd2: 1.1673, ptMid: 0.2587, AstMidCm2: 4.5271 } },
  { name: "S7 (internal)", args: ["internal", 4.52, 250, 25, 100, 5, 0], exp: { topM: 37.3012, topBd2: 0.7368, ptTop: 0.1596, AstTopCm2: 3.5909, midM: 24.9937, ptMid: 0.12, AstMidCm2: 2.7 } },
  { name: "S17(internal)", args: ["internal", 3.9, 175, 25, 100, 5, 0], exp: { topM: 24.3904, ptTop: 0.2391, AstTopCm2: 3.5871, midM: 16.6395, ptMid: 0.1602, AstMidCm2: 2.4031 } },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const r = calc(...c.args);
  const rows = [];
  let ok = true;
  for (const [k, ev] of Object.entries(c.exp)) {
    const got = r[k];
    const near = Math.abs(got - ev) < Math.max(0.001, Math.abs(ev) * 0.002);
    if (!near) ok = false;
    rows.push(`${near ? "✓" : "✗"} ${k}: got ${(+got).toFixed(4)} vs sheet ${ev}`);
  }
  console.log(`\n${ok ? "PASS" : "FAIL"} — ${c.name}`);
  rows.forEach((x) => console.log("   " + x));
  ok ? pass++ : fail++;
}
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
