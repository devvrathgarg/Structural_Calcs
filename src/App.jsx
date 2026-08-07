import React, { useEffect, useState } from "react";
import Hub from "./pages/Hub.jsx";
import ComingSoon from "./pages/ComingSoon.jsx";
import TwoWaySlab from "./calculators/TwoWaySlab.jsx";
import OneWaySlab from "./calculators/OneWaySlab.jsx";
import CantileverSlab from "./calculators/CantileverSlab.jsx";
import IsolatedFooting from "./calculators/IsolatedFooting.jsx";
import { byId } from "./calculators.js";
import { useSharedStyles, useThemeMode, applyTheme } from "./theme.js";

/* =====================================================================
   App shell. Lightweight state + hash navigation (no router dependency)
   so these components stay easy to drop into an existing site.
     #/            -> hub
     #/two-way-slab -> a calculator
   ===================================================================== */

// Ready calculators map to their component. Everything else -> ComingSoon.
const READY = {
  "two-way-slab": TwoWaySlab,
  "one-way-slab": OneWaySlab,
  "cantilever-slab": CantileverSlab,
  "isolated-footing": IsolatedFooting,
};

function parseHash() {
  const h = (window.location.hash || "").replace(/^#\/?/, "").trim();
  return h || null;
}

export default function App() {
  useSharedStyles();
  const [route, setRoute] = useState(parseHash());
  // Subscribe to theme mode so the whole tree repaints on toggle.
  useThemeMode();

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (id) => {
    window.location.hash = id ? `/${id}` : "/";
    setRoute(id);
    window.scrollTo(0, 0);
  };

  const calc = route ? byId(route) : null;

  // Hub defaults to the dark navy surface; calculators to light paper.
  // A user override (via the toggle) wins over these defaults.
  applyTheme(calc ? "light" : "dark");

  if (!calc) return <Hub onOpen={go} />;

  const Ready = READY[calc.id];
  if (Ready) return <Ready onBack={() => go(null)} />;

  return <ComingSoon calc={calc} onBack={() => go(null)} />;
}
