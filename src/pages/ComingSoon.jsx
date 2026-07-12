import React from "react";
import { C, UI, MONO, useSharedStyles } from "../theme.js";
import CalcIcon from "../components/CalcIcon.jsx";
import Feedback from "../components/Feedback.jsx";
import { CATEGORIES } from "../calculators.js";

/* Placeholder shown for calculators that aren't wired up yet. */
export default function ComingSoon({ calc, onBack }) {
  useSharedStyles();
  const accent = CATEGORIES.find((c) => c.key === calc.category)?.accent || C.brass;
  return (
    <div className="min-h-screen cs-bp flex flex-col" style={{ fontFamily: UI, color: C.ink }}>
      <TopBar onBack={onBack} title={calc.name} code={calc.code} />
      <div className="grow flex items-center justify-center px-5">
        <div
          className="cs-card rounded-2xl px-8 py-12 text-center flex flex-col items-center"
          style={{ background: C.surf, border: `1px solid ${C.line}`, maxWidth: 520 }}
        >
          <div
            className="flex items-center justify-center rounded-2xl mb-5"
            style={{ width: 76, height: 76, background: `${accent}12`, border: `1px solid ${accent}33` }}
          >
            <CalcIcon name={calc.icon} size={42} color={accent} />
          </div>
          <div style={{ font: `700 12px ${MONO}`, letterSpacing: 1.4, color: accent }}>IN DEVELOPMENT</div>
          <h1 style={{ font: `900 26px/1.2 ${UI}`, letterSpacing: "-0.01em", color: C.ink, marginTop: 8 }}>
            {calc.name}
          </h1>
          <p style={{ font: `400 15px/1.55 ${UI}`, color: C.inkDim, marginTop: 10 }}>{calc.blurb}</p>
          <p style={{ font: `400 14px/1.5 ${UI}`, color: C.ink2, marginTop: 16 }}>
            Share the Excel sheet for this calculator and we’ll extract the formulas and build the
            interface here — matched to <b style={{ color: accent }}>{calc.code}</b>.
          </p>
          <button
            onClick={onBack}
            className="cs-btn mt-7 px-5 py-2.5 rounded-xl"
            style={{ background: accent, color: "#fff", font: `700 14px ${UI}` }}
          >
            ← Back to all calculators
          </button>
        </div>
      </div>
      <Feedback context={calc.id} />
    </div>
  );
}

export function TopBar({ onBack, title, code }) {
  return (
    <header className="mx-auto w-full px-5 pt-5" style={{ maxWidth: 1480 }}>
      <div
        className="cs-card flex items-center gap-4 px-4 py-3 rounded-xl"
        style={{ background: C.surf, border: `1px solid ${C.line}` }}
      >
        <button
          onClick={onBack}
          className="cs-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg"
          style={{ border: `1px solid ${C.line}`, background: C.surf, color: C.ink2, font: `600 13px ${UI}` }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M12 8H4M7.5 4.5L4 8l3.5 3.5" stroke={C.ink2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All calculators
        </button>
        <div className="min-w-0">
          <div className="truncate" style={{ font: `700 17px ${UI}`, color: C.ink }}>{title}</div>
          {code && <div style={{ font: `500 11px ${MONO}`, color: C.inkDim, letterSpacing: 0.6 }}>{code}</div>}
        </div>
      </div>
    </header>
  );
}
