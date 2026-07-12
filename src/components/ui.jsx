import React, { useState, useEffect } from "react";
import { C, UI, MONO } from "../theme.js";

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

/* ---- numeric input field ---- */
export function Field({ label, unit, value, onChange, hint, text }) {
  const [txt, setTxt] = useState(value != null && value !== "" ? String(value) : "");
  useEffect(() => {
    if (text) { if (String(value) !== txt) setTxt(value ?? ""); return; }
    const n = parseFloat(txt);
    if (!((n === value) || (txt === "" && !value))) setTxt(value ? String(value) : "");
  }, [value]);
  const handle = (e) => {
    const raw = e.target.value;
    if (text) { setTxt(raw); onChange(raw); return; }
    if (/^[0-9]*\.?[0-9]*$/.test(raw)) {
      setTxt(raw);
      const n = parseFloat(raw);
      onChange(isNaN(n) ? 0 : n);
    }
  };
  return (
    <label className="cs-field flex flex-col gap-1 px-3.5 py-2.5 rounded-lg" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
      <span style={{ font: `600 13px ${UI}`, color: C.inkDim, letterSpacing: .2 }}>
        {label}{hint && <span style={{ color: C.brass, fontWeight: 700, fontFamily: MONO }}> {hint}</span>}
      </span>
      <span className="flex items-baseline gap-1.5">
        <input
          type="text" inputMode={text ? "text" : "decimal"} value={txt} placeholder={text ? "" : "0"}
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
    <div className="cs-rval px-3.5 py-2.5 rounded-lg" style={{ background: C.surf, border: `1px solid ${C.line}`, borderLeft: `3px solid ${accent || C.line}` }}>
      <div style={{ font: `600 13px/1.3 ${UI}`, color: C.ink2 }}>
        {name} {sym && <span style={{ fontFamily: MONO, color: accent || C.brass, fontWeight: 700 }}>{sym}</span>}
      </div>
      <div className="flex items-baseline gap-1.5" style={{ marginTop: 3 }}>
        <span style={{ font: `800 24px ${MONO}`, color: color || C.ink }}>{val}</span>
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
            {f.cl && <span className="px-1.5 py-0.5 rounded" style={{ font: `500 10.5px ${MONO}`, color: C.teal, background: "rgba(11,126,150,0.09)", border: "1px solid rgba(11,126,150,0.22)" }}>{f.cl}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
