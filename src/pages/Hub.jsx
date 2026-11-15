import React, { useMemo, useState } from "react";
import { C, UI, MONO, SERIF, useSharedStyles } from "../theme.js";
import { CALCULATORS, CATEGORIES } from "../calculators.js";
import CalcIcon from "../components/CalcIcon.jsx";
import Feedback from "../components/Feedback.jsx";
import { ThemeToggle } from "../components/ui.jsx";

/* =====================================================================
   Hub — the landing page. Live tools up top as cards; tools still in
   build as a compact list underneath. Search filters both.
   ===================================================================== */

function Logo() {
  return (
    <div
      className="flex items-center justify-center rounded-xl"
      style={{ width: 46, height: 46, background: C.surf2, border: `1px solid ${C.line}` }}
    >
      <svg width="30" height="30" viewBox="0 0 34 34">
        <rect x="3" y="3" width="28" height="28" rx="2" fill="none" stroke={C.cyanDeep} strokeWidth="2.4" />
        <line x1="3" y1="12" x2="31" y2="12" stroke={C.cyanDeep} strokeWidth="1.6" />
        <line x1="12" y1="12" x2="12" y2="31" stroke={C.cyan} strokeWidth="1.6" />
        <circle cx="12" cy="12" r="2.4" fill={C.cyan} />
      </svg>
    </div>
  );
}

const accentOf = (calc) => (CATEGORIES.find((c) => c.key === calc.category) || {}).accent || C.cyanDeep;
const catLabel = (calc) => (CATEGORIES.find((c) => c.key === calc.category) || {}).label || "";

function CalcCard({ calc, onOpen }) {
  const accent = accentOf(calc);
  return (
    <button
      onClick={() => onOpen(calc.id)}
      className="cs-tile cs-card text-left rounded-2xl p-5 flex flex-col gap-3 h-full"
      style={{ background: C.surf, border: `1px solid ${C.line}`, cursor: "pointer" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-xl shrink-0"
          style={{ width: 44, height: 44, background: `${accent}1e`, border: `1px solid ${accent}44` }}
        >
          <CalcIcon name={calc.icon} size={26} color={accent} />
        </div>
        <div className="min-w-0">
          <h3 style={{ font: `700 17px/1.25 ${UI}`, color: C.ink }}>{calc.name}</h3>
          <div style={{ font: `400 12px ${UI}`, color: C.inkDim }}>{catLabel(calc)} · {calc.code}</div>
        </div>
      </div>
      <p style={{ font: `400 14px/1.55 ${UI}`, color: C.inkDim, flexGrow: 1 }}>{calc.blurb}</p>
      <span className="inline-flex items-center gap-1" style={{ font: `700 13px ${UI}`, color: accent }}>
        Open
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M4 8h8M8.5 4.5L12 8l-3.5 3.5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

export default function Hub({ onOpen }) {
  useSharedStyles();
  const [q, setQ] = useState("");

  const match = useMemo(() => {
    const query = q.trim().toLowerCase();
    return CALCULATORS.filter(
      (c) => !query || c.name.toLowerCase().includes(query) || c.blurb.toLowerCase().includes(query) || c.code.toLowerCase().includes(query)
    );
  }, [q]);
  const ready = match.filter((c) => c.status === "ready");
  const soon = match.filter((c) => c.status !== "ready");

  const H2 = ({ children, n }) => (
    <div className="flex items-center gap-3 mb-4">
      <h2 style={{ font: `700 15px ${UI}`, color: C.ink }}>{children}</h2>
      <span style={{ font: `500 13px ${UI}`, color: C.inkDim }}>{n}</span>
      <span className="grow" style={{ height: 1, background: C.line }} />
    </div>
  );

  return (
    <div className="min-h-screen cs-bp" style={{ fontFamily: UI, color: C.ink }}>
      {/* header */}
      <header className="mx-auto px-5 pt-6" style={{ maxWidth: 1180 }}>
        <div className="cs-card flex flex-wrap items-center gap-4 px-5 py-3.5 rounded-2xl" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
          <Logo />
          <div>
            <div style={{ font: `400 23px ${SERIF}`, letterSpacing: "-0.01em", color: C.ink }}>CivilSpace Calc</div>
            <div style={{ font: `400 13px ${UI}`, color: C.inkDim }}>Structural design suite · IS 456 / IS 800</div>
          </div>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
      </header>

      {/* intro + search */}
      <section className="mx-auto px-5 pt-8" style={{ maxWidth: 1180 }}>
        <h1 style={{ font: `400 clamp(28px,3.6vw,38px)/1.15 ${SERIF}`, letterSpacing: "-0.01em", color: C.ink }}>
          Structural calculators, out of the spreadsheet.
        </h1>
        <p style={{ font: `400 16px/1.6 ${UI}`, color: C.inkDim, maxWidth: 620, marginTop: 8 }}>
          The checks your team runs in Excel, rebuilt as code-referenced tools you can share and export.
        </p>
        <div className="cs-field flex items-center gap-3 mt-5 px-4 py-2.5 rounded-xl" style={{ background: C.surf, border: `1px solid ${C.line}`, maxWidth: 460 }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke={C.inkDim} strokeWidth="1.7" />
            <path d="M13.5 13.5L17 17" stroke={C.inkDim} strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search calculators…"
            className="outline-none grow cs-in"
            style={{ font: `500 15px ${UI}`, color: C.ink, background: "transparent", border: "none" }}
          />
          {q && <button onClick={() => setQ("")} style={{ font: `600 13px ${UI}`, color: C.inkDim }}>Clear</button>}
        </div>
      </section>

      <main className="mx-auto px-5 pb-16 pt-8" style={{ maxWidth: 1180 }}>
        {!match.length && (
          <div className="rounded-2xl px-6 py-12 text-center" style={{ background: C.surf, border: `1px dashed ${C.line}`, color: C.inkDim, font: `500 15px ${UI}` }}>
            No calculator matches “{q}”.
          </div>
        )}

        {/* live tools */}
        {ready.length > 0 && (
          <div className="mb-10">
            <H2 n={ready.length}>Ready to use</H2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ready.map((calc) => <CalcCard key={calc.id} calc={calc} onOpen={onOpen} />)}
            </div>
          </div>
        )}

        {/* in build — compact list */}
        {soon.length > 0 && (
          <div>
            <H2 n={soon.length}>Coming soon</H2>
            <div className="rounded-xl overflow-hidden" style={{ background: C.surf, border: `1px solid ${C.line}` }}>
              {soon.map((calc, i) => (
                <div key={calc.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-0.5 px-4 py-3" style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
                  <CalcIcon name={calc.icon} size={20} color={C.inkDim} />
                  <span className="sm:w-60 shrink-0" style={{ font: `600 14px ${UI}`, color: C.ink2 }}>{calc.name}</span>
                  <span className="grow min-w-0 basis-full sm:basis-auto order-last sm:order-none" style={{ font: `400 13px ${UI}`, color: C.inkDim }}>{calc.blurb}</span>
                  <span className="shrink-0 ml-auto" style={{ font: `500 12px ${MONO}`, color: C.inkDim }}>{calc.code}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto px-5 pb-10" style={{ maxWidth: 1180 }}>
        <div style={{ height: 1, background: C.line, marginBottom: 16 }} />
        <p style={{ font: `400 12px ${UI}`, color: C.inkDim }}>
          CivilSpace Calc · design aids to IS 456:2000 & IS 800:2007 · the signing engineer retains responsibility.
        </p>
      </footer>

      <Feedback context="hub" />
    </div>
  );
}
