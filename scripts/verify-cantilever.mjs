// Verify the cantilever engine reproduces "Cantilever Balcony.xls".
const abarCm2 = (dia) => (3.14 * (dia / 10) * (dia / 10)) / 4;
const round2 = (x) => Math.round(x * 100) / 100;
const g = { minPct: 0.2, cover: 25, ratioCant: 7, ratioThk: 12 };

function calc(p) {
  const span = p.S1 + p.S2;
  const avg = (p.thk1 + p.thk2) / 2;
  const d = avg - g.cover;
  const thkChk = avg > (span * 1000) / g.ratioThk ? "Can Proceed" : "Recheck";
  const MuBd2 = (p.M * 1e6) / (1000 * d * d);
  const pt = Math.max((p.fck / (2 * p.fy)) * (1 - Math.sqrt(1 - (4.598 * MuBd2) / p.fck)) * 100, g.minPct);
  const AstCm2 = (pt * d) / 10;
  const reqSp = (1000 * abarCm2(p.mainDia)) / AstCm2;
  const dReq0 = (span * 1000) / g.ratioCant + g.cover;
  const astProvTen = (1000 / p.tenSp) * abarCm2(p.tenDia);
  const ptProvTen = (astProvTen * 10) / d;
  const fs = (0.58 * p.fy * AstCm2) / astProvTen;
  const MFt = 1 / (0.225 + 0.00322 * fs - 0.625 * Math.log10(1 / ptProvTen));
  const astProvComp = (1000 / p.compSp) * abarCm2(p.compDia);
  const ptProvComp = (astProvComp * 10) / d;
  const MFc = ptProvComp < 0.75 ? 1 + (0.15 * ptProvComp) / 0.5 : Math.min(1.5, round2((1.6 * ptProvComp) / (ptProvComp + 0.275)));
  const dReq = (span * 1000) / g.ratioCant / MFc / MFt + g.cover;
  const verdict = dReq < avg ? "SAFE" : "UNSAFE";
  return { span, avg, d, thkChk, MuBd2, pt, AstCm2, reqSp, dReq0, astProvTen, ptProvTen, fs, MFt, astProvComp, ptProvComp, MFc, dReq, verdict };
}

const p = { S1: 1.5, S2: 1.2, thk1: 325, thk2: 225, fck: 40, fy: 500, M: 74, mainDia: 10, tenDia: 12, tenSp: 100, compDia: 10, compSp: 100 };
const exp = { span: 2.7, avg: 275, thkChk: "Can Proceed", MuBd2: 1.184, pt: 0.2822, AstCm2: 7.0538, reqSp: 111.2872, dReq0: 410.7143, astProvTen: 11.304, ptProvTen: 0.4522, fs: 180.9632, MFt: 1.6884, astProvComp: 7.85, ptProvComp: 0.314, MFc: 1.0942, dReq: 233.7761, verdict: "SAFE" };

const r = calc(p);
let fail = 0;
for (const [k, ev] of Object.entries(exp)) {
  const got = r[k];
  const ok = typeof ev === "string" ? got === ev : Math.abs(got - ev) < Math.max(0.001, Math.abs(ev) * 0.002);
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${k}: got ${typeof got === "number" ? got.toFixed(4) : got} vs sheet ${ev}`);
}
console.log(`\n=== ${fail ? "FAIL" : "PASS"} (${Object.keys(exp).length - fail}/${Object.keys(exp).length}) ===`);
process.exit(fail ? 1 : 0);
