import React from "react";

/* =====================================================================
   Line icons for each calculator. Structural-engineering themed,
   drawn on a 32×32 grid, single stroke colour so they tint per category.
   ===================================================================== */

const P = (d, extra = {}) => ({ d, ...extra });

const ICONS = {
  // one-way slab: slab with parallel one-direction bars
  oneWay: (
    <>
      <rect x="4" y="11" width="24" height="7" rx="1" />
      <path d="M8 14.5h16M8 11v7M14 11v7M20 11v7M26 11v7" strokeWidth="1.1" />
      <path d="M4 22h4M24 22h4" strokeWidth="1.6" />
    </>
  ),
  // two-way slab: grid mesh
  twoWay: (
    <>
      <rect x="5" y="5" width="22" height="22" rx="1.5" />
      <path d="M12 5v22M19 5v22M5 12h22M5 19h22" strokeWidth="1.1" />
    </>
  ),
  // cantilever slab: fixed wall + projecting slab
  cantilever: (
    <>
      <path d="M7 5v22" strokeWidth="2" />
      <path d="M7 5l3 3M7 10l3 3M7 15l3 3M7 20l3 3" strokeWidth="1" />
      <rect x="7" y="12" width="19" height="5" rx="1" />
      <path d="M26 12v-3M22 12v-3M18 12v-3" strokeWidth="1" />
    </>
  ),
  // short-term deflection: beam sagging with arrow
  deflectShort: (
    <>
      <path d="M4 9h24" strokeWidth="1.4" />
      <path d="M4 12q12 12 24 0" />
      <path d="M16 15v7M13 19l3 3 3-3" strokeWidth="1.3" />
    </>
  ),
  // long-term deflection: two curves (creep) + clock
  deflectLong: (
    <>
      <path d="M3 9h18" strokeWidth="1.3" />
      <path d="M3 11q9 8 18 0" strokeDasharray="2 2" />
      <path d="M3 11q9 13 18 0" />
      <circle cx="25" cy="22" r="5" />
      <path d="M25 19.5V22l1.8 1.2" strokeWidth="1.2" />
    </>
  ),
  // crack width: concrete block with a crack
  crack: (
    <>
      <rect x="5" y="7" width="22" height="18" rx="1.5" />
      <path d="M16 7l-2 5 3 3-2 4 2 6" strokeWidth="1.6" />
    </>
  ),
  // isolated footing: column on spread footing
  footing: (
    <>
      <path d="M13 4h6v11h-6z" />
      <path d="M6 15h20l-3 8H9z" />
      <path d="M6 26h20" strokeWidth="1.2" strokeDasharray="2 2" />
    </>
  ),
  // punching shear: column punching through slab, cone
  punching: (
    <>
      <rect x="4" y="13" width="24" height="6" rx="1" />
      <path d="M13 4h6v9h-6z" />
      <path d="M13 19l-3 6M19 19l3 6" strokeDasharray="2 2" strokeWidth="1.1" />
    </>
  ),
  // pile cap: cap over three piles
  pileCap: (
    <>
      <rect x="5" y="6" width="22" height="7" rx="1" />
      <path d="M9 13v13M16 13v13M23 13v13" strokeWidth="2" />
    </>
  ),
  // steel connection: I-section + bolts
  connection: (
    <>
      <path d="M6 5h8v22H6zM6 5v22" strokeWidth="0" />
      <path d="M5 6h9M5 26h9M9.5 6v20" strokeWidth="1.6" />
      <path d="M16 10h11v12H16z" />
      <circle cx="19.5" cy="13.5" r="1.2" />
      <circle cx="23.5" cy="13.5" r="1.2" />
      <circle cx="19.5" cy="18.5" r="1.2" />
      <circle cx="23.5" cy="18.5" r="1.2" />
    </>
  ),
  // column: vertical member with ties + axial arrow
  column: (
    <>
      <rect x="11" y="4" width="10" height="24" rx="1" />
      <path d="M11 9h10M11 15h10M11 21h10" strokeWidth="1" />
      <path d="M16 1v3M14.5 2.5L16 1l1.5 1.5" strokeWidth="1.2" />
    </>
  ),
  // beam: horizontal member with stirrups + supports
  beam: (
    <>
      <rect x="4" y="11" width="24" height="9" rx="1" />
      <path d="M9 11v9M16 11v9M23 11v9" strokeWidth="1" />
      <path d="M6 25l2-3 2 3zM22 25l2-3 2 3z" strokeWidth="1.2" />
    </>
  ),
};

export default function CalcIcon({ name, size = 30, color = "#33454F", strokeWidth = 1.4 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name] || ICONS.twoWay}
    </svg>
  );
}
