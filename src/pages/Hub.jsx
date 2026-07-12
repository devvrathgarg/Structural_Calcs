import React, { useMemo, useState } from "react";
import { C, UI, MONO, useSharedStyles } from "../theme.js";
import { CALCULATORS, CATEGORIES } from "../calculators.js";
import CalcIcon from "../components/CalcIcon.jsx";
import Feedback from "../components/Feedback.jsx";

/* =====================================================================
   Hub — the landing page. Lists every structural calculator grouped by
   discipline, with search. Clicking a "ready" card opens the tool.
   ===================================================================== */

function Logo() {
  return (
    <div
      className="flex items-center justify-center rounded-xl"
      style={{ width: 46, height: 46, background: "linear-gradient(135deg,#FBF3E2,#F6ECD6)", border: `1px solid ${C.line}` }}
    >
      <svg width="30" height="30" viewBox="0 0 34 34">
        <rect x="3" y="3" width="28" height="28" rx="2" fill="none" stroke={C.brass} strokeWidth="2.4" />
        <line x1="3" y1="12" x2="31" y2="12" stroke={C.brass} strokeWidth="1.6" />
        <line x1="12" y1="12" x2="12" y2="31" stroke={C.teal} strokeWidth="1.6" />
        <circle cx="12" cy="12" r="2.4" fill={C.teal} />
      </svg>
    </div>
  );
}

function StatusChip({ status }) {
  const ready = status === "ready";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        font: `700 11px ${MONO}`,
        letterSpacing: 0.4,
        color: ready ? C.green : C.inkDim,
        background: ready ? "rgba(15,143,91,0.10)" : C.surf2,
        border: `1px solid ${ready ? "rgba(15,143,91,0.30)" : C.line}`,
      }}
    >
      <span
        style={{ width: 7, height: 7, borderRadius: 7, background: ready ? C.green : "#B4C0C8", display: "inline-block" }}
      />
      {ready ? "READY" : "SOON"}
    </span>
  );
}

function CalcCard({ calc, accent, onOpen }) {
  const ready = calc.status === "ready";
  return (
    <button
      onClick={() => ready && onOpen(calc.id)}
      disabled={!ready}
      className="cs-tile cs-card text-left rounded-2xl p-5 flex flex-col gap-3 h-full"
      style={{
        background: C.surf,
        border: `1px solid ${C.line}`,
        cursor: ready ? "pointer" : "default",
        opacity: ready ? 1 : 0.82,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex items-center justify-center rounded-xl shrink-0"
          style={{ width: 52, height: 52, background: ready ? `${accent}12` : C.surf2, border: `1px solid ${ready ? `${accent}33` : C.line}` }}
        >
          <CalcIcon name={calc.icon} size={30} color={ready ? accent : C.inkDim} />
        </div>
        <StatusChip status={calc.status} />
      </div>

      <div className="flex items-baseline gap-2">
        <span style={{ font: `700 13px ${MONO}`, color: accent, opacity: 0.65 }}>
          {String(calc.n).padStart(2, "0")}
        </span>
        <h3 style={{ font: `700 18px/1.25 ${UI}`, color: C.ink, letterSpacing: "-0.01em" }}>{calc.name}</h3>
      </div>

      <p style={{ font: `400 14px/1.5 ${UI}`, color: C.inkDim, flexGrow: 1 }}>{calc.blurb}</p>

      <div className="flex items-center justify-between pt-1">
        <span
          className="px-2 py-1 rounded-md"
          style={{ font: `600 11px ${MONO}`, color: C.teal, background: "rgba(11,126,150,0.08)", border: "1px solid rgba(11,126,150,0.20)" }}
        >
          {calc.code}
        </span>
        {ready && (
          <span className="inline-flex items-center gap-1" style={{ font: `700 13px ${UI}`, color: accent }}>
            Open
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 8h8M8.5 4.5L12 8l-3.5 3.5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
    </button>
  );
}

export default function Hub({ onOpen }) {
  useSharedStyles();
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    return CATEGORIES.map((cat) => ({
      ...cat,
      items: CALCULATORS.filter(
        (c) =>
          c.category === cat.key &&
          (!query ||
            c.name.toLowerCase().includes(query) ||
            c.blurb.toLowerCase().includes(query) ||
            c.code.toLowerCase().includes(query))
      ),
    })).filter((g) => g.items.length);
  }, [q]);

  const readyCount = CALCULATORS.filter((c) => c.status === "ready").length;

  return (
    <div className="min-h-screen cs-bp" style={{ fontFamily: UI, color: C.ink }}>
      {/* header */}
      <header className="mx-auto px-5 pt-7" style={{ maxWidth: 1180 }}>
        <div
          className="cs-card flex flex-wrap items-center gap-4 px-5 py-4 rounded-2xl"
          style={{ background: C.surf, border: `1px solid ${C.line}` }}
        >
          <Logo />
          <div>
            <div style={{ font: `900 22px ${UI}`, letterSpacing: "-0.02em", color: C.ink }}>
              CivilSpace <span style={{ color: C.brass }}>Calc</span>
            </div>
            <div style={{ font: `500 12px ${MONO}`, color: C.inkDim, letterSpacing: 1 }}>
              STRUCTURAL DESIGN SUITE · IS 456 / IS 800
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: C.surf2, border: `1px solid ${C.line}` }}>
            <span style={{ width: 8, height: 8, borderRadius: 8, background: C.green, display: "inline-block" }} />
            <span style={{ font: `600 13px ${MONO}`, color: C.ink2 }}>
              {readyCount} live · {CALCULATORS.length - readyCount} in build
            </span>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto px-5 pt-9 pb-2" style={{ maxWidth: 1180 }}>
        <h1 style={{ font: `900 34px/1.12 ${UI}`, letterSpacing: "-0.02em", color: C.ink, maxWidth: 720 }}>
          Structural calculators, out of the spreadsheet.
        </h1>
        <p style={{ font: `400 17px/1.55 ${UI}`, color: C.inkDim, maxWidth: 640, marginTop: 12 }}>
          Every check your team runs in Excel — rebuilt as clean, code-referenced web tools you can
          trust, share and export. Pick a calculator to begin.
        </p>

        {/* search */}
        <div
          className="cs-field flex items-center gap-3 mt-7 px-4 py-3 rounded-xl"
          style={{ background: C.surf, border: `1px solid ${C.line}`, maxWidth: 460 }}
        >
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
          {q && (
            <button onClick={() => setQ("")} style={{ font: `600 13px ${MONO}`, color: C.inkDim }}>
              clear
            </button>
          )}
        </div>
      </section>

      {/* groups */}
      <main className="mx-auto px-5 pb-16 pt-6" style={{ maxWidth: 1180 }}>
        {groups.length === 0 && (
          <div
            className="rounded-2xl px-6 py-12 text-center"
            style={{ background: C.surf, border: `1px dashed ${C.line}`, color: C.inkDim, font: `500 15px ${UI}` }}
          >
            No calculator matches “{q}”.
          </div>
        )}

        {groups.map((cat) => (
          <div key={cat.key} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span style={{ width: 18, height: 4, borderRadius: 2, background: cat.accent }} />
              <h2 style={{ font: `700 13px ${UI}`, letterSpacing: 1.4, textTransform: "uppercase", color: C.ink2 }}>
                {cat.label}
              </h2>
              <span style={{ font: `600 12px ${MONO}`, color: C.inkDim }}>{cat.items.length}</span>
              <span className="grow" style={{ height: 1, background: C.line }} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cat.items.map((calc) => (
                <CalcCard key={calc.id} calc={calc} accent={cat.accent} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ))}
      </main>

      <footer className="mx-auto px-5 pb-10" style={{ maxWidth: 1180 }}>
        <div style={{ height: 1, background: C.line, marginBottom: 16 }} />
        <p style={{ font: `400 12px ${MONO}`, color: C.inkDim }}>
          CivilSpace Calc · design aids to IS 456:2000 & IS 800:2007 · the signing engineer retains responsibility.
        </p>
      </footer>

      <Feedback context="hub" />
    </div>
  );
}
