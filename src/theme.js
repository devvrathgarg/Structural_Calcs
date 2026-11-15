import { useEffect, useState } from "react";

/* =====================================================================
   CivilSpace — shared design system  (matches "DBR Check by CivilSpace")
   One source of truth for colour, type, motion. Two surfaces — a dark
   navy "marketing" surface and a light warm-paper "app" surface — that
   share one accent + verdict palette and one typeface system.

   Theme reactivity:  `C` is a single MUTABLE palette object that every
   component imports and reads inline (color: C.ink, fill: C.teal, …).
   Toggling the theme mutates C in place, flips <html data-theme>, and
   notifies subscribers so the tree repaints. No per-component churn.
   ===================================================================== */

/* ---- accent + verdict colours (identical in both modes) ---- */
const ACCENTS = {
  cyan: "#22D3EE", // bright — glows, dark-surface accents
  cyanDeep: "#0E7490", // readable primary (buttons, links, focus text)
  indigo: "#6366F1",
  // legacy token names kept so existing inline usage stays valid,
  // remapped into the new accent family:
  brass: "#0E7490", // was gold primary  -> cyanDeep (primary action)
  teal: "#0891B2", // secondary cyan
  violet: "#6366F1", // -> indigo
  amber: "#E08A00", // REVIEW
  green: "#0E9F6E", // PASS / SAFE
  red: "#E11D48", // FLAW / UNSAFE
  brassBg: "rgba(14,116,144,0.10)",
  tealBg: "rgba(8,145,178,0.10)",
};

/* ---- the two surfaces ---- */
export const PALETTES = {
  light: {
    ...ACCENTS,
    bg: "#FAF7F2", // paper
    surf: "#FFFFFF", // panel
    surf2: "#F4EFE4", // sand
    line: "#E8E4DC", // border
    ink: "#0A1628", // primary text
    ink2: "#33414D", // secondary text
    inkDim: "#6B6860", // muted
    subtle: "#94908A",
  },
  dark: {
    ...ACCENTS,
    bg: "#0A1628", // navy
    surf: "#14233D", // surface
    surf2: "#1B2E4A",
    line: "#1F3A5F", // borderD
    ink: "#F1F5F9", // primary text (light on dark)
    ink2: "#CBD5E1",
    inkDim: "#94A3B8", // mutedD
    subtle: "#64748B",
  },
};

/* Live, mutable palette. Import this everywhere; it is mutated on toggle. */
export const C = { ...PALETTES.light };

/* ---- type ----------------------------------------------------------
   DISPLAY : DM Serif Display — big editorial headings (weight 400)
   UI      : Inter — body / labels / buttons
   MONO    : JetBrains Mono — numbers, symbols, code clauses, eyebrows   */
export const SERIF = "'DM Serif Display',Georgia,'Times New Roman',serif";
export const UI = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
export const MONO = "'JetBrains Mono',ui-monospace,Menlo,monospace";

export const T = {
  // serif display / headings
  display: { font: `400 clamp(38px,5vw,56px)/1.05 ${SERIF}`, letterSpacing: "-0.02em" },
  h1: { font: `400 40px/1.1 ${SERIF}`, letterSpacing: "-0.02em" },
  h2: { font: `400 30px/1.15 ${SERIF}`, letterSpacing: "-0.01em" },
  h3: { font: `400 22px/1.2 ${SERIF}` },
  // body (Inter)
  body: { font: `400 16px/1.6 ${UI}` },
  bodyStrong: { font: `600 16px/1.5 ${UI}` },
  small: { font: `400 14px/1.5 ${UI}` },
  // labels / eyebrows / mono values (JetBrains Mono)
  label: { font: `600 13px ${UI}`, letterSpacing: 0.3 },
  eyebrow: { font: `600 11px ${MONO}`, letterSpacing: 1.6, textTransform: "uppercase" },
  value: { font: `700 20px ${MONO}` },
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

/* =====================================================================
   Theme mode: mutate-in-place + subscriber notification
   ===================================================================== */
const STORAGE_KEY = "cs-theme";
let currentMode = "light";
const listeners = new Set();

function readOverride() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function paint(mode) {
  currentMode = mode;
  Object.assign(C, PALETTES[mode]);
  if (typeof document !== "undefined") document.documentElement.dataset.theme = mode;
}

/* Apply a page's default surface unless the user set an explicit override.
   Safe to call from render: it only mutates C + the DOM attribute (idempotent)
   and never calls setState, so children read fresh C before first paint.
   Navigation remounts pages, so freshly-mounted toggles read `currentMode`
   directly — no notification is needed here (that would setState-in-render). */
export function applyTheme(defaultMode = "light") {
  const mode = readOverride() || defaultMode;
  paint(mode);
  return mode;
}

/* Explicit user action — flips the surface and persists the choice. */
export function toggleTheme() {
  const next = currentMode === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
  paint(next);
  listeners.forEach((l) => l(next));
}

export function getThemeMode() {
  return currentMode;
}

/* Subscribe a component to mode changes (returns current mode). */
export function useThemeMode() {
  const [m, setM] = useState(currentMode);
  useEffect(() => {
    const l = (mode) => setM(mode);
    listeners.add(l);
    setM(currentMode);
    return () => listeners.delete(l);
  }, []);
  return m;
}

// paint the stored/override or light default at module load
paint(readOverride() || "light");

/* ---- lively count-up hook (respects reduced motion) ---- */
export function useCountUp(target, { duration = 850, start = true } = {}) {
  const numeric = typeof target === "number" ? target : parseFloat(target);
  const [val, setVal] = useState(0); // start at 0 so it counts up cleanly
  useEffect(() => {
    if (!Number.isFinite(numeric)) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!start || reduce) {
      setVal(numeric);
      return;
    }
    let raf,
      t0 = null;
    const from = 0;
    const tick = (t) => {
      if (t0 == null) t0 = t;
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (numeric - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [numeric, duration, start]);
  return Number.isFinite(numeric) ? val : target;
}

/* =====================================================================
   Shared CSS — theme variables + cards / fields / buttons / grid bg
   + the "lively" keyframes (spring easing, hover-lift, glow, pulse).
   ===================================================================== */
export const GLOBAL_CSS = `
  :root{ --spring: cubic-bezier(.34,1.56,.64,1); }

  :root[data-theme="light"]{
    --bg:#FAF7F2; --panel:#FFFFFF; --panel2:#F4EFE4; --line:#E8E4DC;
    --text:#0A1628; --muted:#6B6860;
    --grid: rgba(10,22,40,.035);
    --shadow-sm: 0 1px 2px rgba(10,22,40,.05); --shadow-lg: 0 6px 22px rgba(10,22,40,.07);
    --hover-shadow: 0 14px 34px rgba(10,22,40,.12);
    --accent:#0E7490; --accent-bright:#22D3EE; --glow: rgba(34,211,238,.30);
    --focus: rgba(34,211,238,.28);
  }
  :root[data-theme="dark"]{
    --bg:#0A1628; --panel:#14233D; --panel2:#1B2E4A; --line:#1F3A5F;
    --text:#F1F5F9; --muted:#94A3B8;
    --grid: rgba(255,255,255,.028);
    --shadow-sm: 0 1px 2px rgba(0,0,0,.4); --shadow-lg: 0 10px 30px rgba(0,0,0,.45);
    --hover-shadow: 0 22px 44px rgba(0,0,0,.55);
    --accent:#22D3EE; --accent-bright:#22D3EE; --glow: rgba(34,211,238,.45);
    --focus: rgba(34,211,238,.40);
  }

  @keyframes csin{from{opacity:0}to{opacity:1}}
  .csin{animation:csin .2s ease-out both}
  @keyframes cs-fade-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  .cs-fade-up{animation:cs-fade-up .55s var(--spring) both}
  @keyframes cs-pulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.6);opacity:0}}
  @keyframes cs-pop{0%{opacity:0;transform:scale(.7)}60%{transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
  .cs-pop{}

  .cs-bp{background-color:var(--bg)}
  .cs-card{box-shadow:var(--shadow-sm),var(--shadow-lg)}
  .cs-rval{transition:transform .18s var(--spring),box-shadow .2s ease,border-color .18s ease}
  
  .cs-field{transition:border-color .15s,box-shadow .15s}
  .cs-field:focus-within{border-color:var(--accent-bright);box-shadow:0 0 0 3px var(--focus)}
  .cs-tile{transition:transform .2s var(--spring),box-shadow .22s ease,border-color .18s ease}
  .cs-tile:hover:not(:disabled){border-color:var(--accent)}
  
  .cs-panel{transition:transform .14s var(--spring),border-color .15s ease}
  
  .cs-cond{transition:transform .12s var(--spring),border-color .15s,background .15s}
  
  .cs-btn{transition:transform .12s var(--spring),box-shadow .2s ease,filter .2s ease}
  .cs-btn:hover:not(:disabled){filter:brightness(.97)}
  
  input.cs-in::placeholder,textarea::placeholder{color:var(--muted);opacity:.7}

  @media(prefers-reduced-motion:reduce){
    .csin,.cs-fade-up,.cs-pop{animation:none}
    .cs-rval,.cs-btn,.cs-tile,.cs-panel,.cs-cond{transition:none}
    *{animation-duration:.001ms !important;animation-iteration-count:1 !important}
  }
`;

/* Injects the shared CSS once. Safe to call from any page. */
export function useSharedStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("cs-shared-css")) return;
  const s = document.createElement("style");
  s.id = "cs-shared-css";
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}
