import React, { useState, useEffect } from "react";
import { C, UI, MONO, useThemeMode, toggleTheme } from "../theme.js";

/* =====================================================================
   Shared calculator UI primitives — one design system for every tool.
   Field · RVal · Group · SecHead · TeX · FormulaLedger · useKaTeX
   ===================================================================== */

/* ---- KaTeX loader (injects CDN css+js once, returns ready flag) ---- */
export function useKaTeX() {
  const [ready, setReady] = useState(!!(typeof window !== "undefined" && window.katex));
  useEffect(() => {
    if (window.katex) { setReady(true); return; }
    if (!document.getElementById("katex-css")) {
      const kc = document.createElement("link");
      kc.id = "katex-css"; kc.rel = "stylesheet";
      kc.href = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css";
      document.head.appendChild(kc);
    }
    let ks = document.getElementById("katex-js");
    if (!ks) {
      ks = document.createElement("script");
      ks.id = "katex-js";
      ks.src = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js";
      document.head.appendChild(ks);
    }
    ks.addEventListener("load", () => setReady(true));
  }, []);
  return ready;
}

export function TeX({ tex, ready, block }) {
  if (!ready || !window.katex)
    return <span style={{ fontFamily: MONO, fontSize: 13, color: C.ink2 }}>{tex}</span>;
  let html;
  try { html = window.katex.renderToString(tex, { throwOnError: false, displayMode: !!block }); }
  catch { html = tex; }
  return <span style={{ display: block ? "block" : "inline" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* number of required inputs left blank (null / "") — calculators gate results on this */
export const countBlank = (o, keys) => keys.filter((k) => o[k] == null || o[k] === "").length;
export const blankMsg = (n) => [`the ${n} highlighted input${n > 1 ? "s" : ""}`];

/* text <-> number sync shared by Field and inline cells: an empty box is null, never 0 */
export function useNumText(value, onChange, text, re = /^[0-9]*\.?[0-9]*$/) {
  const [txt, setTxt] = useState(value != null ? String(value) : "");
  useEffect(() => {
    if (text) { if (String(value ?? "") !== txt) setTxt(value ?? ""); return; }
    const n = parseFloat(txt);
    if ((isNaN(n) ? null : n) !== value) setTxt(value != null ? String(value) : "");
  }, [value]);
  const handle = (e) => {
    const raw = e.target.value;
    if (text) { setTxt(raw); onChange(raw); return; }
    if (re.test(raw)) {
      setTxt(raw);
      const n = parseFloat(raw);
      onChange(isNaN(n) ? null : n);
    }
  };
  return [txt, handle];
}

/* ---- numeric input field ---- */
export function Field({ label, unit, value, onChange, hint, text, compact }) {
  const [txt, handle] = useNumText(value, onChange, text);
  const empty = !text && value == null;
  if (compact) return (
    <label className="flex items-center gap-2 py-1.5">
      <span className="grow min-w-0" style={{ font: `500 13.5px ${UI}`, color: C.ink2 }}>
        {label}{hint && <span style={{ color: C.brass, font: `600 12px ${MONO}` }}> {hint}</span>}
      </span>
      <input
        type="text" inputMode={text ? "text" : "decimal"} value={txt} placeholder={text ? "" : "—"}
        onChange={handle}
        className="cs-in outline-none rounded-md"
        style={{ width: text ? 150 : 88, padding: "5px 8px", font: `600 15px ${text ? UI : MONO}`, color: C.ink, background: empty ? `${C.amber}10` : C.surf2, border: empty ? `1px dashed ${C.amber}` : `1px solid ${C.line}`, textAlign: text ? "left" : "right" }}
      />
      <span style={{ width: 48, font: `500 12px ${MONO}`, color: C.inkDim, whiteSpace: "nowrap" }}>{unit}</span>
    </label>
  );
  return (
    <label className="cs-field flex flex-col gap-1 px-3.5 py-2.5 rounded-lg" style={{ background: C.surf, border: empty ? `1px dashed ${C.amber}` : `1px solid ${C.line}` }}>
      <span style={{ font: `600 13px ${UI}`, color: C.inkDim, letterSpacing: .2 }}>
        {label}{hint && <span style={{ color: C.brass, fontWeight: 700, fontFamily: MONO }}> {hint}</span>}
      </span>
      <span className="flex items-baseline gap-1.5">
        <input
          type="text" inputMode={text ? "text" : "decimal"} value={txt} placeholder={text ? "" : "—"}
          onChange={handle}
          className="cs-in outline-none grow min-w-0"
          style={{ width: "100%", font: `700 21px ${text ? UI : MONO}`, color: C.ink, background: "transparent", border: "none", textAlign: text ? "left" : "right" }}
        />
        {unit && <span style={{ font: `600 14px ${MONO}`, color: C.ink2, whiteSpace: "nowrap" }}>{unit}</span>}
      </span>
    </label>
  );
}

/* ---- labelled result value ---- */
export function RVal({ name, sym, val, unit, color, accent }) {
  return (
    <div className="cs-rval px-3.5 py-2.5 rounded-lg" style={{ background: C.surf, border: `1px solid ${C.line}`, borderLeft: `3px solid ${accent || C.cyanDeep}` }}>
      <div style={{ font: `600 13px/1.3 ${UI}`, color: C.ink2 }}>
        {name} {sym && <span style={{ fontFamily: MONO, color: accent || C.cyanDeep, fontWeight: 700 }}>{sym}</span>}
      </div>
      <div className="flex items-baseline gap-1.5" style={{ marginTop: 3 }}>
        <span style={{ font: `700 24px ${MONO}`, color: color || C.ink }}>{val}</span>
        {unit && <span style={{ font: `600 14px ${MONO}`, color: C.ink2, whiteSpace: "nowrap" }}>{unit}</span>}
      </div>
    </div>
  );
}

export function SecHead({ label, accent }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 9 }}>
      <span style={{ width: 14, height: 3, borderRadius: 2, background: accent || C.brass }} />
      <span style={{ font: `700 11.5px ${UI}`, color: C.ink2, letterSpacing: 1.1 }}>{label}</span>
    </div>
  );
}

export function Group({ title, accent, cols = "grid-cols-2 sm:grid-cols-4", children }) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{ margin: "12px 0 7px" }}>
        <span style={{ width: 16, height: 3, borderRadius: 2, background: accent || C.brass }} />
        <span style={{ font: `700 11.5px ${UI}`, color: C.ink2, letterSpacing: 1.1, textTransform: "uppercase" }}>{title}</span>
      </div>
      <div className={`grid ${cols} gap-2`}>{children}</div>
    </div>
  );
}

/* ---- formula ledger (label · LaTeX · substitution · value · clause) ---- */
export function FormulaLedger({ F, ready }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
      {F.map((f, i) => (
        <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5"
          style={{ background: i % 2 ? C.surf2 : C.surf, borderBottom: i < F.length - 1 ? `1px solid ${C.line}` : "none" }}>
          <div className="w-36 shrink-0" style={{ font: `600 12.5px ${UI}`, color: C.brass }}>{f.label}</div>
          <div className="grow" style={{ minWidth: 200 }}><TeX tex={f.sym} ready={ready} /></div>
          {f.sub && <div style={{ font: `400 12px ${MONO}`, color: C.inkDim }}><TeX tex={"= " + f.sub} ready={ready} /></div>}
          <div className="ml-auto flex items-center gap-2">
            <span style={{ font: `600 13px ${MONO}`, color: C.teal }}>{f.val}</span>
            {f.cl && <span className="px-1.5 py-0.5 rounded" style={{ font: `500 10.5px ${MONO}`, color: C.teal, background: C.tealBg, border: `1px solid ${C.teal}44` }}>{f.cl}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* =====================================================================
   Lively shared pieces — pulsing status dot, theme toggle, verdict badge
   ===================================================================== */

/* pulsing status dot (the "alive" signal) */
export function StatusDot({ color = C.green, size = 8 }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: size, height: size }}>
      <span style={{ position: "absolute", inset: size * 0.22, borderRadius: 999, background: color }} />
    </span>
  );
}

/* light / dark surface toggle — persists the choice */
export function ThemeToggle() {
  const mode = useThemeMode();
  const dark = mode === "dark";
  return (
    <button
      onClick={toggleTheme}
      title={dark ? "Switch to light" : "Switch to dark"}
      className="cs-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg"
      style={{ border: `1px solid ${C.line}`, background: C.surf, color: C.ink2, font: `600 13px ${UI}` }}
    >
      {dark ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4.2" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.cyanDeep} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z" />
        </svg>
      )}
      {dark ? "Light" : "Dark"}
    </button>
  );
}

const VERDICT_META = {
  SAFE: { label: "SAFE", color: C.green, icon: "check" },
  PASS: { label: "PASS", color: C.green, icon: "check" },
  DESIGNED: { label: "DESIGNED", color: C.green, icon: "check" },
  UNSAFE: { label: "UNSAFE", color: C.red, icon: "alert" },
  REDESIGN: { label: "REDESIGN", color: C.red, icon: "alert" },
  INADEQUATE: { label: "INADEQUATE", color: C.red, icon: "alert" },
  REVIEW: { label: "REVIEW", color: C.amber, icon: "eye" },
};

/* verdict badge — colour ALWAYS paired with an icon + label */
export function VerdictBadge({ verdict, label, size = "md" }) {
  const m = VERDICT_META[verdict] || { label: label || verdict, color: C.inkDim, icon: "dash" };
  const dims = size === "lg" ? { pad: "6px 13px", fs: 13, ic: 15 } : { pad: "5px 11px", fs: 11.5, ic: 13 };
  return (
    <span className="cs-pop inline-flex items-center gap-1.5" style={{ padding: dims.pad, borderRadius: 999, font: `700 ${dims.fs}px ${UI}`, letterSpacing: "0.03em", color: m.color, background: `${m.color}18`, border: `1px solid ${m.color}55`, whiteSpace: "nowrap" }}>
      <svg width={dims.ic} height={dims.ic} viewBox="0 0 24 24" fill="none" stroke={m.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {m.icon === "check" && <path d="M20 6 L9 17 l-5 -5" />}
        {m.icon === "alert" && <><path d="M12 3 L22 20 H2 Z" /><path d="M12 10 v4" /><path d="M12 17 h.01" /></>}
        {m.icon === "eye" && <><path d="M2 12 s4 -7 10 -7 10 7 10 7 -4 7 -10 7 -10 -7 -10 -7Z" /><circle cx="12" cy="12" r="2.6" /></>}
        {m.icon === "dash" && <><circle cx="12" cy="12" r="9" /><path d="M8 12 h8" /></>}
      </svg>
      {label || m.label}
    </span>
  );
}
