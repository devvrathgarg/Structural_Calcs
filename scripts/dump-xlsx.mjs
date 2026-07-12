// Dump an Excel sheet's cells: value + formula, per sheet.
// Usage: node scripts/dump-xlsx.mjs "excels/FILE.xlsx" [sheetIndexOrName]
import * as XLSX from "xlsx";
import fs from "node:fs";

const file = process.argv[2];
const only = process.argv[3];
const buf = fs.readFileSync(file);
const wb = XLSX.read(buf, { cellFormula: true, cellNF: true });

console.log("FILE:", file);
console.log("SHEETS:", wb.SheetNames.join(" | "));
console.log("=".repeat(70));

const sheetsToShow = only
  ? [isNaN(+only) ? only : wb.SheetNames[+only]]
  : wb.SheetNames;

for (const name of sheetsToShow) {
  const ws = wb.Sheets[name];
  if (!ws || !ws["!ref"]) continue;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  console.log(`\n### SHEET: ${name}   (${ws["!ref"]})\n`);
  for (let r = range.s.r; r <= range.e.r; r++) {
    let rowOut = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      let s = addr + ": ";
      if (cell.f) s += "=" + cell.f + "  ⟶ ";
      const v = cell.v;
      s += typeof v === "number" ? +v.toFixed(4) : JSON.stringify(v);
      rowOut.push(s);
    }
    if (rowOut.length) console.log(rowOut.join("   |   "));
  }
}
