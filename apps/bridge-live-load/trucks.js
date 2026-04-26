/**
 * Design vehicle definitions for AASHTO HL-93, NCDOT, and SCDOT.
 *
 * Each truck is an array of { weight (kip), position (ft from front axle) }.
 * Position 0 = front axle; subsequent axles are measured from front.
 * Axle spacings can be variable (AASHTO HL-93 has 14-30 ft rear spacing).
 */

const TRUCKS = {
  // ---- AASHTO HL-93 Design Truck ----
  AASHTO: {
    name: 'AASHTO HL-93 Design Truck',
    description: 'Standard HL-93: 8k front, 32k drive, 32k rear (14-30 ft variable spacing)',
    axles: [
      { weight: 8, position: 0 },
      { weight: 32, position: 14 },
      { weight: 32, position: 28 }  // 14 ft default; envelope 14-30 ft
    ],
    variableSpacing: { axleIndex: 2, min: 14, max: 30 },
    tandem: { weight: 25, spacing: 4 },  // Design tandem: 2x25k @ 4ft
    laneLoad: 0.64 // kip/ft
  },

  // ---- North Carolina (NCDOT) ----
  NC: {
    name: 'NCDOT Design Vehicle',
    description: 'NCDOT uses AASHTO HL-93 with NC-specific legal loads for rating. Primary design vehicle is HL-93.',
    axles: [
      { weight: 8, position: 0 },
      { weight: 32, position: 14 },
      { weight: 32, position: 28 }
    ],
    variableSpacing: { axleIndex: 2, min: 14, max: 30 },
    tandem: { weight: 25, spacing: 4 },
    laneLoad: 0.64,
    notes: 'NCDOT follows AASHTO LRFD. Additional NC legal loads (Type 3, Type 3S2, Type 3-3) used for load rating per NCDOT Structures Management Unit guidelines.'
  },

  // ---- NC Legal Loads (Fig 6-147) — Single Vehicle (SV) ----
  NC_SNSH: {
    name: 'SNSH (N01) — SV 2-Axle',
    description: 'NC Legal Load: Single Vehicle, 2 axles, 27K GVW (13.5 ton)',
    category: 'NC Legal Load — Single Vehicle',
    ncCode: 'N01',
    axles: [
      { weight: 5, position: 0 },
      { weight: 22, position: 14 }
    ],
    laneLoad: 0
  },
  NC_SNGARBS2: {
    name: 'SNGARBS2 (N02) — SV 2-Axle',
    description: 'NC Legal Load: Single Vehicle, 2 axles, 40K GVW (20 ton)',
    category: 'NC Legal Load — Single Vehicle',
    ncCode: 'N02',
    axles: [
      { weight: 23.5, position: 0 },
      { weight: 16.5, position: 14 }
    ],
    laneLoad: 0
  },
  NC_SNAGRIS2: {
    name: 'SNAGRIS2 (N03) — SV 2-Axle',
    description: 'NC Legal Load: Single Vehicle, 2 axles, 44K GVW (22 ton)',
    category: 'NC Legal Load — Single Vehicle',
    ncCode: 'N03',
    axles: [
      { weight: 22, position: 0 },
      { weight: 22, position: 14 }
    ],
    laneLoad: 0
  },
  NC_SNCOTTS3: {
    name: 'SNCOTTS3 (N04) — SV 3-Axle',
    description: 'NC Legal Load: Single Vehicle, 3 axles, 54.5K GVW (27.25 ton)',
    category: 'NC Legal Load — Single Vehicle',
    ncCode: 'N04',
    axles: [
      { weight: 4.5, position: 0 },
      { weight: 25, position: 11 },
      { weight: 25, position: 15 }
    ],
    laneLoad: 0
  },
  NC_SNAGGRS4: {
    name: 'SNAGGRS4 (N05) — SV 4-Axle',
    description: 'NC Legal Load: Single Vehicle, 4 axles, 69.85K GVW (34.925 ton)',
    category: 'NC Legal Load — Single Vehicle',
    ncCode: 'N05',
    axles: [
      { weight: 16, position: 0 },
      { weight: 15.85, position: 9 },
      { weight: 19, position: 13 },
      { weight: 19, position: 17 }
    ],
    laneLoad: 0
  },
  NC_SNS5A: {
    name: 'SNS5A (N06) — SV 5-Axle',
    description: 'NC Legal Load: Single Vehicle, 5 axles, 71.1K GVW (35.55 ton)',
    category: 'NC Legal Load — Single Vehicle',
    ncCode: 'N06',
    axles: [
      { weight: 12.1, position: 0 },
      { weight: 8.5, position: 9 },
      { weight: 21, position: 13 },
      { weight: 21, position: 17 },
      { weight: 8.5, position: 21 }
    ],
    laneLoad: 0
  },
  NC_SNS6A: {
    name: 'SNS6A (N07) — SV 6-Axle',
    description: 'NC Legal Load: Single Vehicle, 6 axles, 79.9K GVW (39.95 ton)',
    category: 'NC Legal Load — Single Vehicle',
    ncCode: 'N07',
    axles: [
      { weight: 12.1, position: 0 },
      { weight: 8.6, position: 9 },
      { weight: 8.6, position: 13 },
      { weight: 21, position: 17 },
      { weight: 21, position: 21 },
      { weight: 8.6, position: 25 }
    ],
    laneLoad: 0
  },
  NC_SNS7B: {
    name: 'SNS7B (N08) — SV 7-Axle',
    description: 'NC Legal Load: Single Vehicle, 7 axles, 84K GVW (42 ton)',
    category: 'NC Legal Load — Single Vehicle',
    ncCode: 'N08',
    axles: [
      { weight: 7.6, position: 0 },
      { weight: 8.6, position: 9 },
      { weight: 8.6, position: 13 },
      { weight: 21, position: 17 },
      { weight: 21, position: 21 },
      { weight: 8.6, position: 25 },
      { weight: 8.6, position: 29 }
    ],
    laneLoad: 0
  },

  // ---- NC Legal Loads (Fig 6-147) — Truck Tractor Semi-Trailer (TTST) ----
  NC_TNAGRIT3: {
    name: 'TNAGRIT3 (N09) — TTST 3-Axle',
    description: 'NC Legal Load: Tractor Semi-Trailer, 3 axles, 66K GVW (33 ton)',
    category: 'NC Legal Load — Tractor Semi-Trailer',
    ncCode: 'N09',
    axles: [
      { weight: 22, position: 0 },
      { weight: 22, position: 9 },
      { weight: 22, position: 18 }
    ],
    laneLoad: 0
  },
  NC_TNT4A: {
    name: 'TNT4A (N10) — TTST 4-Axle',
    description: 'NC Legal Load: Tractor Semi-Trailer, 4 axles, 66.15K GVW (33.075 ton)',
    category: 'NC Legal Load — Tractor Semi-Trailer',
    ncCode: 'N10',
    axles: [
      { weight: 12.1, position: 0 },
      { weight: 12.05, position: 9 },
      { weight: 21, position: 18 },
      { weight: 21, position: 22 }
    ],
    laneLoad: 0
  },
  NC_TNT6A: {
    name: 'TNT6A (N11) — TTST 6-Axle',
    description: 'NC Legal Load: Tractor Semi-Trailer, 6 axles, 83.2K GVW (41.6 ton)',
    category: 'NC Legal Load — Tractor Semi-Trailer',
    ncCode: 'N11',
    axles: [
      { weight: 12.1, position: 0 },
      { weight: 8.2, position: 9 },
      { weight: 21, position: 13 },
      { weight: 21, position: 17 },
      { weight: 10.45, position: 26 },
      { weight: 10.45, position: 30 }
    ],
    laneLoad: 0
  },
  NC_TNT7A: {
    name: 'TNT7A (N12) — TTST 7-Axle',
    description: 'NC Legal Load: Tractor Semi-Trailer, 7 axles, 84K GVW (42 ton)',
    category: 'NC Legal Load — Tractor Semi-Trailer',
    ncCode: 'N12',
    axles: [
      { weight: 4.1, position: 0 },
      { weight: 4, position: 9 },
      { weight: 21, position: 13 },
      { weight: 21, position: 17 },
      { weight: 11.3, position: 26 },
      { weight: 11.3, position: 30 },
      { weight: 11.3, position: 34 }
    ],
    laneLoad: 0
  },
  NC_TNT7B: {
    name: 'TNT7B (N13) — TTST 7-Axle',
    description: 'NC Legal Load: Tractor Semi-Trailer, 7 axles, 84K GVW (42 ton)',
    category: 'NC Legal Load — Tractor Semi-Trailer',
    ncCode: 'N13',
    axles: [
      { weight: 4.1, position: 0 },
      { weight: 10.5, position: 9 },
      { weight: 10.5, position: 13 },
      { weight: 8.45, position: 22 },
      { weight: 8.45, position: 26 },
      { weight: 21, position: 30 },
      { weight: 21, position: 34 }
    ],
    laneLoad: 0
  },
  NC_TNAGRIT4: {
    name: 'TNAGRIT4 (N14) — TTST 4-Axle',
    description: 'NC Legal Load: Tractor Semi-Trailer, 4 axles, 86K GVW (43 ton)',
    category: 'NC Legal Load — Tractor Semi-Trailer',
    ncCode: 'N14',
    axles: [
      { weight: 22, position: 0 },
      { weight: 22, position: 9 },
      { weight: 21, position: 18 },
      { weight: 21, position: 22 }
    ],
    laneLoad: 0
  },
  NC_TNAGT5A: {
    name: 'TNAGT5A (N15) — TTST 5-Axle',
    description: 'NC Legal Load: Tractor Semi-Trailer, 5 axles, 90K GVW (45 ton)',
    category: 'NC Legal Load — Tractor Semi-Trailer',
    ncCode: 'N15',
    axles: [
      { weight: 22, position: 0 },
      { weight: 21, position: 9 },
      { weight: 21, position: 13 },
      { weight: 13, position: 22 },
      { weight: 13, position: 26 }
    ],
    laneLoad: 0
  },
  NC_TNAGT5B: {
    name: 'TNAGT5B (N16) — TTST 5-Axle',
    description: 'NC Legal Load: Tractor Semi-Trailer, 5 axles, 90K GVW (45 ton)',
    category: 'NC Legal Load — Tractor Semi-Trailer',
    ncCode: 'N16',
    axles: [
      { weight: 6, position: 0 },
      { weight: 21, position: 9 },
      { weight: 21, position: 13 },
      { weight: 21, position: 22 },
      { weight: 21, position: 26 }
    ],
    laneLoad: 0
  },

  // ---- NC Legal Loads (Fig 6-147) — FAST Act Emergency Vehicles ----
  NC_EV2: {
    name: 'EV2 — Emergency Vehicle 2-Axle',
    description: 'FAST Act Emergency Vehicle, 2 axles, 57.5K GVW (28.75 ton)',
    category: 'NC Legal Load — Emergency Vehicle',
    ncCode: 'EV2',
    axles: [
      { weight: 24, position: 0 },
      { weight: 33.5, position: 15 }
    ],
    laneLoad: 0
  },
  NC_EV3: {
    name: 'EV3 — Emergency Vehicle 3-Axle',
    description: 'FAST Act Emergency Vehicle, 3 axles, 86K GVW (43 ton)',
    category: 'NC Legal Load — Emergency Vehicle',
    ncCode: 'EV3',
    axles: [
      { weight: 24, position: 0 },
      { weight: 31, position: 15 },
      { weight: 31, position: 19 }
    ],
    laneLoad: 0
  },

  // ---- NC Legal Loads (Fig 6-146) — Interstate Single Vehicle (SV) ----
  NC_I_SH: {
    name: 'SH (IO1) — SV 2-Axle',
    description: 'NC Interstate Legal Load: Single Vehicle, 2 axles, 25K GVW (12.5 ton)',
    category: 'NC Interstate Legal Load — Single Vehicle',
    ncCode: 'IO1',
    axles: [
      { weight: 5, position: 0 },
      { weight: 20, position: 14 }
    ],
    laneLoad: 0
  },
  NC_I_S3C: {
    name: 'S3C (IO2) — SV 3-Axle',
    description: 'NC Interstate Legal Load: Single Vehicle, 3 axles, 43K GVW (21.5 ton)',
    category: 'NC Interstate Legal Load — Single Vehicle',
    ncCode: 'IO2',
    axles: [
      { weight: 5, position: 0 },
      { weight: 19, position: 11 },
      { weight: 19, position: 15 }
    ],
    laneLoad: 0
  },
  NC_I_S3A: {
    name: 'S3A (IO3) — SV 3-Axle',
    description: 'NC Interstate Legal Load: Single Vehicle, 3 axles, 45.5K GVW (22.75 ton)',
    category: 'NC Interstate Legal Load — Single Vehicle',
    ncCode: 'IO3',
    axles: [
      { weight: 7.5, position: 0 },
      { weight: 19, position: 9 },
      { weight: 19, position: 13 }
    ],
    laneLoad: 0
  },
  NC_I_S4A: {
    name: 'S4A (IO4) — SV 4-Axle',
    description: 'NC Interstate Legal Load: Single Vehicle, 4 axles, 53.5K GVW (26.75 ton)',
    category: 'NC Interstate Legal Load — Single Vehicle',
    ncCode: 'IO4',
    axles: [
      { weight: 11.5, position: 0 },
      { weight: 4, position: 9 },
      { weight: 19, position: 13 },
      { weight: 19, position: 17 }
    ],
    laneLoad: 0
  },
  NC_I_S5A: {
    name: 'S5A (IO5) — SV 5-Axle',
    description: 'NC Interstate Legal Load: Single Vehicle, 5 axles, 61K GVW (30.5 ton)',
    category: 'NC Interstate Legal Load — Single Vehicle',
    ncCode: 'IO5',
    axles: [
      { weight: 11, position: 0 },
      { weight: 6, position: 9 },
      { weight: 19, position: 13 },
      { weight: 19, position: 17 },
      { weight: 6, position: 21 }
    ],
    laneLoad: 0
  },
  NC_I_S6A: {
    name: 'S6A (IO6) — SV 6-Axle',
    description: 'NC Interstate Legal Load: Single Vehicle, 6 axles, 69K GVW (34.5 ton)',
    category: 'NC Interstate Legal Load — Single Vehicle',
    ncCode: 'IO6',
    axles: [
      { weight: 11, position: 0 },
      { weight: 6.66, position: 9 },
      { weight: 6.67, position: 13 },
      { weight: 19, position: 17 },
      { weight: 19, position: 21 },
      { weight: 6.67, position: 25 }
    ],
    laneLoad: 0
  },
  NC_I_S7B: {
    name: 'S7B (IO7) — SV 7-Axle',
    description: 'NC Interstate Legal Load: Single Vehicle, 7 axles, 77K GVW (38.5 ton)',
    category: 'NC Interstate Legal Load — Single Vehicle',
    ncCode: 'IO7',
    axles: [
      { weight: 11, position: 0 },
      { weight: 7, position: 9 },
      { weight: 7, position: 13 },
      { weight: 19, position: 17 },
      { weight: 19, position: 21 },
      { weight: 7, position: 25 },
      { weight: 7, position: 29 }
    ],
    laneLoad: 0
  },
  NC_I_S7A: {
    name: 'S7A (IO8) — SV 7-Axle',
    description: 'NC Interstate Legal Load: Single Vehicle, 7 axles, 80K GVW (40 ton)',
    category: 'NC Interstate Legal Load — Single Vehicle',
    ncCode: 'IO8',
    axles: [
      { weight: 11, position: 0 },
      { weight: 6.66, position: 9 },
      { weight: 6.67, position: 13 },
      { weight: 19, position: 17 },
      { weight: 19, position: 21 },
      { weight: 6.67, position: 25 },
      { weight: 11, position: 34 }
    ],
    laneLoad: 0
  },

  // ---- NC Legal Loads (Fig 6-146) — Interstate Truck Tractor Semi-Trailer (TTST) ----
  NC_I_T4A: {
    name: 'T4A (IO9) — TTST 4-Axle',
    description: 'NC Interstate Legal Load: Tractor Semi-Trailer, 4 axles, 56.5K GVW (28.25 ton)',
    category: 'NC Interstate Legal Load — Tractor Semi-Trailer',
    ncCode: 'IO9',
    axles: [
      { weight: 11, position: 0 },
      { weight: 7.5, position: 9 },
      { weight: 19, position: 18 },
      { weight: 19, position: 22 }
    ],
    laneLoad: 0
  },
  NC_I_T5B: {
    name: 'T5B (I10) — TTST 5-Axle',
    description: 'NC Interstate Legal Load: Tractor Semi-Trailer, 5 axles, 64K GVW (32 ton)',
    category: 'NC Interstate Legal Load — Tractor Semi-Trailer',
    ncCode: 'I10',
    axles: [
      { weight: 6.5, position: 0 },
      { weight: 19, position: 9 },
      { weight: 19, position: 13 },
      { weight: 9.75, position: 22 },
      { weight: 9.75, position: 26 }
    ],
    laneLoad: 0
  },
  NC_I_T6A: {
    name: 'T6A (I11) — TTST 6-Axle',
    description: 'NC Interstate Legal Load: Tractor Semi-Trailer, 6 axles, 72K GVW (36 ton)',
    category: 'NC Interstate Legal Load — Tractor Semi-Trailer',
    ncCode: 'I11',
    axles: [
      { weight: 11, position: 0 },
      { weight: 4, position: 9 },
      { weight: 19, position: 13 },
      { weight: 19, position: 17 },
      { weight: 9.5, position: 26 },
      { weight: 9.5, position: 30 }
    ],
    laneLoad: 0
  },
  NC_I_T7A: {
    name: 'T7A (I12) — TTST 7-Axle',
    description: 'NC Interstate Legal Load: Tractor Semi-Trailer, 7 axles, 80K GVW (40 ton)',
    category: 'NC Interstate Legal Load — Tractor Semi-Trailer',
    ncCode: 'I12',
    axles: [
      { weight: 11, position: 0 },
      { weight: 4, position: 9 },
      { weight: 19, position: 13 },
      { weight: 19, position: 17 },
      { weight: 9, position: 26 },
      { weight: 9, position: 30 },
      { weight: 9, position: 34 }
    ],
    laneLoad: 0
  },
  NC_I_T7B: {
    name: 'T7B (I13) — TTST 7-Axle',
    description: 'NC Interstate Legal Load: Tractor Semi-Trailer, 7 axles, 80K GVW (40 ton)',
    category: 'NC Interstate Legal Load — Tractor Semi-Trailer',
    ncCode: 'I13',
    axles: [
      { weight: 11, position: 0 },
      { weight: 9.5, position: 9 },
      { weight: 9.5, position: 13 },
      { weight: 6, position: 22 },
      { weight: 6, position: 26 },
      { weight: 19, position: 30 },
      { weight: 19, position: 34 }
    ],
    laneLoad: 0
  },

  // ---- South Carolina (SCDOT) ----
  SC: {
    name: 'SCDOT Design Vehicle',
    description: 'SCDOT uses AASHTO HL-93 for design. SC permits up to 90k GVW on designated routes.',
    axles: [
      { weight: 8, position: 0 },
      { weight: 32, position: 14 },
      { weight: 32, position: 28 }
    ],
    variableSpacing: { axleIndex: 2, min: 14, max: 30 },
    tandem: { weight: 25, spacing: 4 },
    laneLoad: 0.64,
    notes: 'SCDOT follows AASHTO LRFD 9th Edition. Additional SCDOT-specific permit vehicles may apply for load rating analysis per SCDOT Bridge Design Manual.'
  }
};

/**
 * Generate truck axle positions for a given rear-axle spacing.
 */
function getTruckAxles(truckDef, rearSpacing) {
  const axles = truckDef.axles.map(a => ({ ...a }));
  if (truckDef.variableSpacing && rearSpacing !== undefined) {
    const idx = truckDef.variableSpacing.axleIndex;
    const prevPos = axles[idx - 1].position;
    axles[idx] = { ...axles[idx], position: prevPos + rearSpacing };
  }
  return axles;
}

/**
 * Get tandem axle definition.
 */
function getTandemAxles(truckDef) {
  if (!truckDef.tandem) return null;
  return [
    { weight: truckDef.tandem.weight, position: 0 },
    { weight: truckDef.tandem.weight, position: truckDef.tandem.spacing }
  ];
}

/**
 * Get info string for display.
 */
function getTruckInfoHTML(code) {
  const t = TRUCKS[code];
  if (!t) return '';
  let html = `<strong>${t.name}</strong><br>`;
  html += t.description + '<br>';
  const gvw = t.axles.reduce((sum, a) => sum + a.weight, 0);
  html += `Axles: ${t.axles.map(a => a.weight + 'k').join(' / ')} (GVW: ${gvw.toFixed(1)}k)<br>`;
  // Show axle spacings
  if (t.axles.length > 1) {
    const spacings = [];
    for (let i = 1; i < t.axles.length; i++) {
      spacings.push((t.axles[i].position - t.axles[i - 1].position) + "'");
    }
    html += `Spacings: ${spacings.join(' / ')}<br>`;
  }
  if (t.laneLoad > 0) {
    html += `Lane load: ${t.laneLoad} kip/ft`;
  } else if (t.category) {
    html += `<em>Legal load rating vehicle — no lane load combination</em>`;
  }
  if (t.tandem) html += `<br>Design tandem: 2 x ${t.tandem.weight}k @ ${t.tandem.spacing} ft`;
  if (t.notes) html += `<br><em>${t.notes}</em>`;
  if (t.ncCode) html += `<br>SNBI Code: ${t.ncCode} | Source: NCDOT Fig 6-147`;
  return html;
}
