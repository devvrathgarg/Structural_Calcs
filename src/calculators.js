import { C } from "./theme.js";

/* =====================================================================
   Master registry of every structural calculator.
   The hub page, search and router all read from this one array.
   status: "ready" | "soon"
   ===================================================================== */

export const CATEGORIES = [
  { key: "slabs", label: "Slabs & Plates", accent: C.teal },
  { key: "service", label: "Serviceability Checks", accent: C.violet },
  { key: "foundations", label: "Foundations", accent: C.brass },
  { key: "members", label: "Members & Connections", accent: C.green },
];

export const CALCULATORS = [
  {
    id: "one-way-slab",
    n: 1,
    name: "One-way Slab Design",
    category: "slabs",
    icon: "oneWay",
    code: "Reynolds Ch.33 · IS 456",
    status: "ready",
    blurb: "Edge / internal panels — loads, support & span moments, pt, Ast (top & bottom) and bar spacing.",
  },
  {
    id: "two-way-slab",
    n: 2,
    name: "Two-way Slab Design",
    category: "slabs",
    icon: "twoWay",
    code: "IS 456 · Table 26",
    status: "ready",
    blurb: "Panel-by-panel design with Table 26 coefficients, reinforcement, spacing and deflection (IS 456 + BS 8110 fallback).",
  },
  {
    id: "cantilever-slab",
    n: 3,
    name: "Cantilever Slab Design",
    category: "slabs",
    icon: "cantilever",
    code: "IS 456:2000 · L/d 7",
    status: "ready",
    blurb: "Tapered balcony — Mu/bd², pt, Ast, bar spacing and a deflection check with tension & compression modification factors.",
  },
  {
    id: "short-term-deflection",
    n: 4,
    name: "Short-term Deflection Check",
    category: "service",
    icon: "deflectShort",
    code: "IS 456 · Annex C",
    status: "soon",
    blurb: "Immediate elastic deflection using effective moment of inertia (Ieff).",
  },
  {
    id: "long-term-deflection",
    n: 5,
    name: "Long-term Deflection Check",
    category: "service",
    icon: "deflectLong",
    code: "IS 456 · Annex C",
    status: "soon",
    blurb: "Deflection due to shrinkage and creep added to the short-term value.",
  },
  {
    id: "crack-width",
    n: 6,
    name: "Crack Width Check",
    category: "service",
    icon: "crack",
    code: "IS 456 · Annex F",
    status: "soon",
    blurb: "Surface crack width against permissible limits for the exposure condition.",
  },
  {
    id: "isolated-footing",
    n: 7,
    name: "Isolated Footing",
    category: "foundations",
    icon: "footing",
    code: "IS 456:2000",
    status: "soon",
    blurb: "Size the footing, check bearing pressure, one-way shear and bending steel.",
  },
  {
    id: "punching-shear",
    n: 8,
    name: "Punching Shear Check",
    category: "foundations",
    icon: "punching",
    code: "IS 456 · Cl 31.6",
    status: "soon",
    blurb: "Two-way (punching) shear on the critical perimeter around a column.",
  },
  {
    id: "pile-cap",
    n: 9,
    name: "Pile Cap Design",
    category: "foundations",
    icon: "pileCap",
    code: "IS 456 / IS 2911",
    status: "soon",
    blurb: "Pile group cap by the truss/strut method — geometry, shear and reinforcement.",
  },
  {
    id: "steel-connection",
    n: 10,
    name: "Steel Connection Design",
    category: "members",
    icon: "connection",
    code: "IS 800:2007",
    status: "soon",
    blurb: "Bolted / welded connection capacity — bolt shear, bearing and weld strength.",
  },
  {
    id: "column-design",
    n: 11,
    name: "Manual Column Design",
    category: "members",
    icon: "column",
    code: "IS 456:2000",
    status: "soon",
    blurb: "Axially / uniaxially loaded RC column — capacity, slenderness and ties.",
  },
  {
    id: "beam-design",
    n: 12,
    name: "Manual Beam Design",
    category: "members",
    icon: "beam",
    code: "IS 456:2000",
    status: "soon",
    blurb: "Singly / doubly reinforced RC beam — flexure, shear stirrups and checks.",
  },
];

export const byId = (id) => CALCULATORS.find((c) => c.id === id) || null;
