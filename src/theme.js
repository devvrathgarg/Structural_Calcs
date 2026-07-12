/* =====================================================================
   Structural Calculators — shared design system
   One source of truth for colour, type and spacing. Every calculator
   and the hub import from here so the whole product feels like one tool.
   ===================================================================== */

/* ---- palette (carried over from CivilSpaceCalc, kept consistent) ---- */
export const C = {
  bg: "#EDF1F5",
  surf: "#FFFFFF",
  surf2: "#F4F7F9",
  line: "#DCE3E9",
  ink: "#152128",
  ink2: "#33454F",
  inkDim: "#5A6E7B",
  brass: "#A66E12",
  brassBg: "rgba(166,110,18,0.08)",
  teal: "#0B7E96",
  tealBg: "rgba(11,126,150,0.07)",
  green: "#0F8F5B",
  red: "#C63C22",
  amber: "#A66E12",
  violet: "#6A4FB3",
};

/* ---- type ----------------------------------------------------------
   UI  : Lato / Source Sans — warm, humanist, familiar (Calibri-adjacent)
   MONO: IBM Plex Mono — numbers, symbols, code clauses
   Sizes bumped ~2–3px vs the old sheet so it reads comfortably.        */
export const UI = "'Lato','Source Sans 3','Segoe UI',system-ui,sans-serif";
export const MONO = "'IBM Plex Mono',ui-monospace,Menlo,monospace";

export const T = {
  // display / headings
  h1: { font: `900 30px/1.15 ${UI}`, letterSpacing: "-0.02em" },
  h2: { font: `700 22px/1.2 ${UI}`, letterSpacing: "-0.01em" },
  h3: { font: `700 18px/1.25 ${UI}` },
  // body
  body: { font: `400 15px/1.55 ${UI}` },
  bodyStrong: { font: `600 15px/1.5 ${UI}` },
  small: { font: `400 13px/1.5 ${UI}` },
  // labels / eyebrows
  label: { font: `600 12px ${UI}`, letterSpacing: 0.3 },
  eyebrow: { font: `700 11px ${UI}`, letterSpacing: 1.4, textTransform: "uppercase" },
  // mono values
  value: { font: `700 18px ${MONO}` },
  mono: { font: `500 13px ${MONO}` },
  monoSmall: { font: `500 11px ${MONO}` },
};

/* ---- verdict colour helper ---- */
export const sColor = (v) =>
  v === "SAFE"
    ? C.green
    : v === "UNSAFE" || v === "REDESIGN"
    ? C.red
    : C.inkDim;

/* ---- number formatter ---- */
export const fmt = (v, d = 0) =>
  v == null ? "NA" : Number.isNaN(v) ? "—" : Number(v).toFixed(d);

/* ---- shared CSS injected once (cards, fields, buttons, blueprint bg) ---- */
export const GLOBAL_CSS = `
  @keyframes csin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .csin{animation:csin .45s cubic-bezier(.4,0,.2,1) both}
  .cs-bp{background-color:#EDF1F5;background-image:linear-gradient(rgba(21,33,40,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(21,33,40,.028) 1px,transparent 1px);background-size:30px 30px}
  .cs-card{box-shadow:0 1px 2px rgba(21,33,40,.05),0 6px 20px rgba(21,33,40,.05)}
  .cs-rval{transition:transform .15s ease,box-shadow .15s ease}
  .cs-rval:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(21,33,40,.09)}
  .cs-field{transition:border-color .15s,box-shadow .15s}
  .cs-field:focus-within{border-color:#A66E12;box-shadow:0 0 0 3px rgba(166,110,18,.13)}
  .cs-tile{transition:transform .14s cubic-bezier(.4,0,.2,1),box-shadow .2s ease,border-color .15s ease}
  .cs-tile:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(21,33,40,.10);border-color:#C6D0D8}
  .cs-tile:active{transform:translateY(-1px)}
  .cs-btn{transition:transform .1s ease,box-shadow .2s ease,filter .2s ease}
  .cs-btn:hover:not(:disabled){filter:brightness(1.04);box-shadow:0 5px 16px rgba(166,110,18,.22)}
  .cs-btn:active:not(:disabled){transform:translateY(1px)}
  input.cs-in::placeholder{color:#AAB8C1}
  @media(prefers-reduced-motion:reduce){.csin{animation:none}.cs-rval,.cs-btn,.cs-tile{transition:none}}
`;

/* Injects the shared font links + CSS once. Safe to call from any page. */
export function useSharedStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("cs-shared-css")) return;
  const s = document.createElement("style");
  s.id = "cs-shared-css";
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}
