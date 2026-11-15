import React, { useState } from "react";
import { C, UI, MONO } from "../theme.js";

/* =====================================================================
   Feedback / suggestion widget.
   Used two ways:
     <Feedback context="hub" />                 floating button (outside)
     <Feedback context="one-way-slab" inline /> inline button (inside a tool)

   No backend yet: submissions are saved to localStorage. `sendFeedback`
   is the ONE place to wire your website's API later — see the TODO.
   ===================================================================== */

export async function sendFeedback(payload) {
  // ---- Persist locally so nothing is lost before the backend exists ----
  try {
    const key = "cs_feedback";
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    prev.push(payload);
    localStorage.setItem(key, JSON.stringify(prev));
  } catch {
    /* storage may be unavailable (private mode) — ignore */
  }

  // ---- TODO(backend): replace the block above / add here when ready ----
  // await fetch("/api/feedback", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(payload),
  // });

  return true;
}

const KINDS = [
  { key: "suggestion", label: "Suggestion", color: C.teal },
  { key: "bug", label: "Something's wrong", color: C.red },
  { key: "other", label: "Other", color: C.inkDim },
];

function Modal({ context, onClose }) {
  const [kind, setKind] = useState("suggestion");
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("edit"); // edit | sending | done

  const submit = async () => {
    if (!msg.trim()) return;
    setState("sending");
    await sendFeedback({
      kind,
      message: msg.trim(),
      email: email.trim() || null,
      context,
      page: typeof window !== "undefined" ? window.location.hash || "/" : null,
      // no Date.now() dependency issues here (runs in browser, not workflow)
      at: new Date().toISOString(),
    });
    setState("done");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ background: "rgba(3,8,18,0.62)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="cs-card cs-pop rounded-2xl w-full" style={{ maxWidth: 460, background: C.surf, border: `1px solid ${C.line}` }} onClick={(e) => e.stopPropagation()}>
        {state === "done" ? (
          <div className="px-7 py-10 text-center flex flex-col items-center">
            <div className="flex items-center justify-center rounded-full mb-4" style={{ width: 56, height: 56, background: `${C.green}1f` }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4 10-10.5" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ font: `700 20px ${UI}`, color: C.ink }}>Thank you</div>
            <p style={{ font: `400 14px/1.5 ${UI}`, color: C.inkDim, marginTop: 6 }}>Your feedback helps shape these tools. We read every note.</p>
            <button onClick={onClose} className="cs-btn mt-6 px-5 py-2.5 rounded-xl" style={{ background: C.brass, color: "#fff", font: `700 14px ${UI}` }}>Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
              <div>
                <div style={{ font: `700 18px ${UI}`, color: C.ink }}>Share feedback</div>
                <div style={{ font: `500 11px ${MONO}`, color: C.inkDim }}>Suggestions, bugs, or anything missing</div>
              </div>
              <button onClick={onClose} style={{ font: `400 22px ${UI}`, color: C.inkDim, lineHeight: 1 }}>×</button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex gap-2">
                {KINDS.map((k) => {
                  const on = kind === k.key;
                  return (
                    <button key={k.key} onClick={() => setKind(k.key)} className="px-3 py-2 rounded-lg grow"
                      style={{ font: `600 12.5px ${UI}`, color: on ? "#fff" : C.ink2, background: on ? k.color : C.surf2, border: `1px solid ${on ? k.color : C.line}` }}>
                      {k.label}
                    </button>
                  );
                })}
              </div>
              <label className="flex flex-col gap-1">
                <span style={{ font: `600 12px ${UI}`, color: C.inkDim }}>Your message</span>
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} autoFocus
                  placeholder="What would make this more useful?"
                  className="cs-field outline-none rounded-lg px-3 py-2"
                  style={{ font: `400 14px ${UI}`, color: C.ink, background: C.surf, border: `1px solid ${C.line}`, resize: "vertical" }} />
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ font: `600 12px ${UI}`, color: C.inkDim }}>Email <span style={{ color: C.inkDim, fontWeight: 400 }}>(optional, if you'd like a reply)</span></span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.com"
                  className="cs-field outline-none rounded-lg px-3 py-2"
                  style={{ font: `500 14px ${MONO}`, color: C.ink, background: C.surf, border: `1px solid ${C.line}` }} />
              </label>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl" style={{ font: `600 13px ${UI}`, color: C.ink2, border: `1px solid ${C.line}`, background: C.surf }}>Cancel</button>
                <button onClick={submit} disabled={!msg.trim() || state === "sending"} className="cs-btn px-5 py-2.5 rounded-xl"
                  style={{ font: `700 13px ${UI}`, color: "#fff", background: msg.trim() ? C.teal : C.line }}>
                  {state === "sending" ? "Sending…" : "Send feedback"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Feedback({ context = "app", inline = false }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {inline ? (
        <button onClick={() => setOpen(true)} className="cs-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg"
          style={{ border: `1px solid ${C.line}`, background: C.surf, color: C.ink2, font: `600 13px ${UI}` }}>
          <ChatIcon color={C.teal} /> Feedback
        </button>
      ) : (
        <button onClick={() => setOpen(true)} title="Share feedback"
          className="cs-btn fixed z-50 flex items-center gap-2 px-4 py-3 rounded-full"
          style={{ right: 22, bottom: 22, background: C.cyanDeep, color: "#fff", font: `700 14px ${UI}`, boxShadow: `0 6px 22px ${C.cyanDeep}55` }}>
          <ChatIcon color="#fff" /> Feedback
        </button>
      )}
      {open && <Modal context={context} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatIcon({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M3 5.5A1.5 1.5 0 014.5 4h11A1.5 1.5 0 0117 5.5v7A1.5 1.5 0 0115.5 14H8l-4 3v-3H4.5A1.5 1.5 0 013 12.5z"
        stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
