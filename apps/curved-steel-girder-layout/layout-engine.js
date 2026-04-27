/**
 * Curved steel girder layout engine.
 *
 * Builds concentric girder geometry for a constant-radius horizontal curve
 * and emits an MDX Software-style ASCII input payload.
 */

function roundTo(value, digits) {
  const factor = Math.pow(10, digits || 3);
  return Math.round(value * factor) / factor;
}

function sanitizeNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return n;
}

function sanitizePercent(value, label) {
  const n = sanitizeNumber(value, label);
  if (n < 0 || n > 100) {
    throw new Error(`${label} must be between 0 and 100 percent.`);
  }
  return n;
}

function sanitizeIsoTimestamp(value, label) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO date/time.`);
  }
  return parsed.toISOString();
}

function escapeAsciiText(value) {
  return String(value || '')
    .replace(/[\r\n]/g, ' ')
    .replace(/"/g, "''")
    .trim();
}

function normalizeDeterioration(raw) {
  const src = raw || {};
  return {
    steelSectionLossPercent: sanitizePercent(src.steelSectionLossPercent || 0, 'Steel section loss'),
    rebarSectionLossPercent: sanitizePercent(src.rebarSectionLossPercent || 0, 'Rebar section loss'),
    prestressSectionLossPercent: sanitizePercent(src.prestressSectionLossPercent || 0, 'Prestress section loss')
  };
}

function formatStationLabel(stationFt) {
  const sign = stationFt < 0 ? '-' : '';
  const absFt = Math.abs(stationFt);
  const major = Math.floor(absFt / 100);
  const remainder = absFt - major * 100;
  const remainderText = remainder.toFixed(3).padStart(6, '0');
  return `${sign}${major}+${remainderText}`;
}

function normalizeLayoutInputs(raw) {
  const radiusFt = sanitizeNumber(raw.radiusFt, 'Radius');
  const centralAngleDeg = sanitizeNumber(raw.centralAngleDeg, 'Central angle');
  const girderCount = Math.round(sanitizeNumber(raw.girderCount, 'Girder count'));
  const girderSpacingFt = sanitizeNumber(raw.girderSpacingFt, 'Girder spacing');
  const stationIntervalFt = sanitizeNumber(raw.stationIntervalFt, 'Station interval');

  if (radiusFt <= 0) throw new Error('Radius must be greater than 0 ft.');
  if (centralAngleDeg <= 0 || centralAngleDeg >= 180) {
    throw new Error('Central angle must be greater than 0 and less than 180 degrees.');
  }
  if (girderCount < 1) throw new Error('Girder count must be at least 1.');
  if (girderSpacingFt <= 0) throw new Error('Girder spacing must be greater than 0 ft.');
  if (stationIntervalFt <= 0) throw new Error('Station interval must be greater than 0 ft.');

  const normalizedProjectName = String(raw.projectName || '').trim() || 'CURVED_STEEL_GIRDER_LAYOUT';
  const normalizedMdxSoftwareVersion = String(raw.mdxSoftwareVersion || '').trim() || 'MDX-2025.1-ASSUMED';
  const normalizedGeneratedAt = raw.generatedAt
    ? sanitizeIsoTimestamp(raw.generatedAt, 'Generated-at timestamp')
    : new Date().toISOString();

  return {
    radiusFt,
    centralAngleDeg,
    girderCount,
    girderSpacingFt,
    stationIntervalFt,
    curveDirection: raw.curveDirection === 'right' ? 'right' : 'left',
    projectName: normalizedProjectName,
    mdxSoftwareVersion: normalizedMdxSoftwareVersion,
    generatedAt: normalizedGeneratedAt,
    deterioration: normalizeDeterioration(raw.deterioration)
  };
}

function buildStationMarks(totalLengthFt, intervalFt) {
  const marks = [0];
  let next = intervalFt;
  while (next < totalLengthFt) {
    marks.push(next);
    next += intervalFt;
  }
  if (marks[marks.length - 1] !== totalLengthFt) {
    marks.push(totalLengthFt);
  }
  return marks;
}

function buildEqualSpanLayout(totalLengthFt, count) {
  const spanCount = Math.max(1, Math.round(count || 3));
  const supportStationsFt = [];
  for (let i = 0; i <= spanCount; i += 1) {
    supportStationsFt.push(roundTo((totalLengthFt * i) / spanCount, 3));
  }

  const spans = [];
  for (let i = 0; i < spanCount; i += 1) {
    const start = supportStationsFt[i];
    const end = supportStationsFt[i + 1];
    spans.push({
      spanId: `SPAN${i + 1}`,
      startStationFt: start,
      endStationFt: end,
      arcLengthFt: roundTo(end - start, 3)
    });
  }

  return {
    spanCount,
    supportStationsFt,
    spans
  };
}

function buildCurvedGirderLayout(rawInputs) {
  const inputs = normalizeLayoutInputs(rawInputs);

  const thetaRad = (inputs.centralAngleDeg * Math.PI) / 180;
  const centerlineArcLengthFt = inputs.radiusFt * thetaRad;
  const centerlineChordFt = 2 * inputs.radiusFt * Math.sin(thetaRad / 2);
  const centerlineExternalFt = inputs.radiusFt * (1 - Math.cos(thetaRad / 2));

  const stationMarksFt = buildStationMarks(centerlineArcLengthFt, inputs.stationIntervalFt);
  const spanLayout = buildEqualSpanLayout(centerlineArcLengthFt, 3);

  const girders = [];
  const midIndex = (inputs.girderCount - 1) / 2;

  for (let i = 0; i < inputs.girderCount; i += 1) {
    const offsetFromCenterlineFt = (i - midIndex) * inputs.girderSpacingFt;
    const signedOffsetFt = inputs.curveDirection === 'left' ? offsetFromCenterlineFt : -offsetFromCenterlineFt;
    const girderRadiusFt = inputs.radiusFt + signedOffsetFt;

    if (girderRadiusFt <= 0) {
      throw new Error(`Girder ${i + 1} radius became non-positive. Reduce spacing/count or increase centerline radius.`);
    }

    const girderArcLengthFt = girderRadiusFt * thetaRad;
    const stationPoints = stationMarksFt.map((centerlineStationFt) => {
      const theta = centerlineStationFt / inputs.radiusFt;
      const xBase = girderRadiusFt * Math.sin(theta);
      const yBase = girderRadiusFt * (1 - Math.cos(theta));
      const y = inputs.curveDirection === 'left' ? yBase : -yBase;

      return {
        stationCenterlineFt: roundTo(centerlineStationFt, 3),
        thetaDeg: roundTo((theta * 180) / Math.PI, 4),
        xFt: roundTo(xBase, 3),
        yFt: roundTo(y, 3)
      };
    });

    girders.push({
      girderId: `G${i + 1}`,
      order: i + 1,
      offsetFromCenterlineFt: roundTo(offsetFromCenterlineFt, 3),
      radiusFt: roundTo(girderRadiusFt, 3),
      arcLengthFt: roundTo(girderArcLengthFt, 3),
      stationPoints
    });
  }

  return {
    meta: {
      projectName: inputs.projectName,
      generatedAt: inputs.generatedAt,
      units: 'ft',
      curveDirection: inputs.curveDirection,
      deterioration: inputs.deterioration
    },
    alignment: {
      radiusFt: roundTo(inputs.radiusFt, 3),
      centralAngleDeg: roundTo(inputs.centralAngleDeg, 6),
      centralAngleRad: roundTo(thetaRad, 8),
      centerlineArcLengthFt: roundTo(centerlineArcLengthFt, 3),
      centerlineChordFt: roundTo(centerlineChordFt, 3),
      centerlineExternalFt: roundTo(centerlineExternalFt, 3)
    },
    spanLayout,
    layout: {
      girderCount: inputs.girderCount,
      girderSpacingFt: roundTo(inputs.girderSpacingFt, 3),
      stationIntervalFt: roundTo(inputs.stationIntervalFt, 3),
      stationsCenterlineFt: stationMarksFt.map((s) => roundTo(s, 3)),
      stationLabels: stationMarksFt.map((s) => formatStationLabel(roundTo(s, 3)))
    },
    girders,
    mdxSoftwareVersion: inputs.mdxSoftwareVersion
  };
}

function emitMdxInput(layout) {
  const q = (text) => `"${escapeAsciiText(text)}"`;
  const f3 = (n) => Number(n).toFixed(3);
  const f4 = (n) => Number(n).toFixed(4);

  const lines = [];
  lines.push('! MDX SOFTWARE INPUT FILE (ASCII KEYWORD FORMAT)');
  lines.push('! VERSION_ASSUMPTION=' + layout.mdxSoftwareVersion);
  lines.push('! NOTE=Keyword mapping follows STR-53 plan assumptions until board-supplied worked sample is attached.');
  lines.push('');

  lines.push('BEGIN_PROJECT');
  lines.push(`PROJECT_NAME=${q(layout.meta.projectName)}`);
  lines.push(`GENERATED_AT=${q(layout.meta.generatedAt)}`);
  lines.push(`UNITS=${q(String(layout.meta.units || '').toUpperCase())}`);
  lines.push(`CURVE_DIRECTION=${q(String(layout.meta.curveDirection || '').toUpperCase())}`);
  lines.push('END_PROJECT');
  lines.push('');

  lines.push('BEGIN_DETERIORATION');
  lines.push(`STEEL_SECTION_LOSS_PERCENT=${f3(layout.meta.deterioration.steelSectionLossPercent)}`);
  lines.push(`REBAR_SECTION_LOSS_PERCENT=${f3(layout.meta.deterioration.rebarSectionLossPercent)}`);
  lines.push(`PRESTRESS_SECTION_LOSS_PERCENT=${f3(layout.meta.deterioration.prestressSectionLossPercent)}`);
  lines.push('END_DETERIORATION');
  lines.push('');

  lines.push('BEGIN_GEOMETRY');
  lines.push(`CENTERLINE_RADIUS_FT=${f3(layout.alignment.radiusFt)}`);
  lines.push(`CENTERLINE_CENTRAL_ANGLE_DEG=${f4(layout.alignment.centralAngleDeg)}`);
  lines.push(`CENTERLINE_ARC_LENGTH_FT=${f3(layout.alignment.centerlineArcLengthFt)}`);
  lines.push(`CENTERLINE_CHORD_FT=${f3(layout.alignment.centerlineChordFt)}`);
  lines.push(`CENTERLINE_EXTERNAL_FT=${f3(layout.alignment.centerlineExternalFt)}`);
  lines.push('END_GEOMETRY');
  lines.push('');

  lines.push('BEGIN_FRAMING');
  lines.push(`GIRDER_COUNT=${layout.layout.girderCount}`);
  lines.push(`GIRDER_SPACING_FT=${f3(layout.layout.girderSpacingFt)}`);
  lines.push(`STATION_INTERVAL_FT=${f3(layout.layout.stationIntervalFt)}`);
  layout.girders.forEach((g) => {
    lines.push(`GIRDER=${g.girderId}|${g.order}|${f3(g.offsetFromCenterlineFt)}|${f3(g.radiusFt)}|${f3(g.arcLengthFt)}`);
  });
  lines.push('END_FRAMING');
  lines.push('');

  lines.push('BEGIN_CROSS_FRAMES');
  lines.push('CROSS_FRAME_SPACING_RULE=UNIFORM_BY_STATION_INTERVAL');
  lines.push(`CROSS_FRAME_INTERVAL_FT=${f3(layout.layout.stationIntervalFt)}`);
  lines.push(`CROSS_FRAME_STATIONS_FT=${layout.layout.stationsCenterlineFt.map(f3).join(',')}`);
  lines.push('END_CROSS_FRAMES');
  lines.push('');

  lines.push('BEGIN_SECTION_SCHEDULE');
  lines.push('SECTION_FAMILY=STEEL_PLATE_GIRDER');
  lines.push('SECTION_ASSIGNMENT_RULE=UNIFORM_ALL_SPANS');
  lines.push('WEB_DEPTH_IN=72.000');
  lines.push('WEB_THICKNESS_IN=0.500');
  lines.push('TOP_FLANGE_IN=16.000,1.250');
  lines.push('BOTTOM_FLANGE_IN=18.000,1.500');
  lines.push('END_SECTION_SCHEDULE');
  lines.push('');

  lines.push('BEGIN_SUPPORTS');
  lines.push(`SPAN_COUNT=${layout.spanLayout.spanCount}`);
  layout.spanLayout.supportStationsFt.forEach((s, idx) => {
    lines.push(`SUPPORT=${idx + 1}|${f3(s)}|PIN`);
  });
  layout.spanLayout.spans.forEach((span) => {
    lines.push(`SPAN=${span.spanId}|${f3(span.startStationFt)}|${f3(span.endStationFt)}|${f3(span.arcLengthFt)}`);
  });
  lines.push('END_SUPPORTS');
  lines.push('');

  lines.push('BEGIN_COMPOSITE');
  lines.push('DECK_COMPOSITE=YES');
  lines.push('DECK_THICKNESS_IN=8.500');
  lines.push('DECK_EFFECTIVE_MODULUS_KSI=4000.000');
  lines.push('END_COMPOSITE');
  lines.push('');

  lines.push('BEGIN_GIRDER_GEOMETRY');
  layout.girders.forEach((g) => {
    g.stationPoints.forEach((p) => {
      lines.push(`POINT=${g.girderId}|${f3(p.stationCenterlineFt)}|${f4(p.thetaDeg)}|${f3(p.xFt)}|${f3(p.yFt)}`);
    });
  });
  lines.push('END_GIRDER_GEOMETRY');

  return lines.join('\n') + '\n';
}

function trimQuoted(value) {
  const s = String(value || '').trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1).replace(/''/g, '"');
  }
  return s;
}

function parseMdxInput(mdxText) {
  const text = String(mdxText || '').replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n').map((line) => line.trim());

  if (!lines.length || lines[0] !== '! MDX SOFTWARE INPUT FILE (ASCII KEYWORD FORMAT)') {
    throw new Error('MDX Software input format not recognized.');
  }

  const blocks = {
    PROJECT: {},
    DETERIORATION: {},
    GEOMETRY: {},
    FRAMING: [],
    CROSS_FRAMES: {},
    SUPPORTS: [],
    SPANS: [],
    GIRDER_GEOMETRY: []
  };

  let current = '';
  lines.forEach((line) => {
    if (!line || line[0] === '!') return;
    if (/^BEGIN_[A-Z_]+$/.test(line)) {
      current = line.slice(6);
      return;
    }
    if (/^END_[A-Z_]+$/.test(line)) {
      current = '';
      return;
    }

    if (current === 'FRAMING' && line.startsWith('GIRDER=')) {
      blocks.FRAMING.push(line.slice('GIRDER='.length));
      return;
    }
    if (current === 'SUPPORTS' && line.startsWith('SUPPORT=')) {
      blocks.SUPPORTS.push(line.slice('SUPPORT='.length));
      return;
    }
    if (current === 'SUPPORTS' && line.startsWith('SPAN=')) {
      blocks.SPANS.push(line.slice('SPAN='.length));
      return;
    }
    if (current === 'GIRDER_GEOMETRY' && line.startsWith('POINT=')) {
      blocks.GIRDER_GEOMETRY.push(line.slice('POINT='.length));
      return;
    }

    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    if (blocks[current] && !Array.isArray(blocks[current])) {
      blocks[current][key] = value;
    }
  });

  const layout = {
    meta: {
      projectName: trimQuoted(blocks.PROJECT.PROJECT_NAME || 'CURVED_STEEL_GIRDER_LAYOUT'),
      generatedAt: trimQuoted(blocks.PROJECT.GENERATED_AT || new Date().toISOString()),
      units: String(trimQuoted(blocks.PROJECT.UNITS || 'FT')).toLowerCase(),
      curveDirection: String(trimQuoted(blocks.PROJECT.CURVE_DIRECTION || 'LEFT')).toLowerCase(),
      deterioration: {
        steelSectionLossPercent: Number(blocks.DETERIORATION.STEEL_SECTION_LOSS_PERCENT || 0),
        rebarSectionLossPercent: Number(blocks.DETERIORATION.REBAR_SECTION_LOSS_PERCENT || 0),
        prestressSectionLossPercent: Number(blocks.DETERIORATION.PRESTRESS_SECTION_LOSS_PERCENT || 0)
      }
    },
    alignment: {
      radiusFt: Number(blocks.GEOMETRY.CENTERLINE_RADIUS_FT || 0),
      centralAngleDeg: Number(blocks.GEOMETRY.CENTERLINE_CENTRAL_ANGLE_DEG || 0),
      centerlineArcLengthFt: Number(blocks.GEOMETRY.CENTERLINE_ARC_LENGTH_FT || 0),
      centerlineChordFt: Number(blocks.GEOMETRY.CENTERLINE_CHORD_FT || 0),
      centerlineExternalFt: Number(blocks.GEOMETRY.CENTERLINE_EXTERNAL_FT || 0)
    },
    spanLayout: {
      spanCount: Number((lines.find((line) => line.startsWith('SPAN_COUNT=')) || '').split('=')[1] || 0),
      supportStationsFt: [],
      spans: []
    },
    layout: {
      girderCount: Number((blocks.FRAMING.find((line) => line.startsWith('GIRDER_COUNT=')) || '').split('=')[1] || 0),
      girderSpacingFt: Number((blocks.FRAMING.find((line) => line.startsWith('GIRDER_SPACING_FT=')) || '').split('=')[1] || 0),
      stationIntervalFt: Number((blocks.FRAMING.find((line) => line.startsWith('STATION_INTERVAL_FT=')) || '').split('=')[1] || 0),
      stationsCenterlineFt: [],
      stationLabels: []
    },
    girders: [],
    mdxSoftwareVersion: 'MDX-2025.1-ASSUMED'
  };

  const headerVersion = lines.find((line) => line.startsWith('! VERSION_ASSUMPTION='));
  if (headerVersion) {
    layout.mdxSoftwareVersion = headerVersion.split('=')[1].trim();
  }

  const supportPrefix = 'SUPPORT=';
  lines
    .filter((line) => line.startsWith(supportPrefix))
    .forEach((line) => {
      const cols = line.slice(supportPrefix.length).split('|');
      layout.spanLayout.supportStationsFt.push(Number(cols[1] || 0));
    });

  const spanPrefix = 'SPAN=';
  lines
    .filter((line) => line.startsWith(spanPrefix))
    .forEach((line) => {
      const cols = line.slice(spanPrefix.length).split('|');
      layout.spanLayout.spans.push({
        spanId: cols[0] || '',
        startStationFt: Number(cols[1] || 0),
        endStationFt: Number(cols[2] || 0),
        arcLengthFt: Number(cols[3] || 0)
      });
    });

  const girderPrefix = 'GIRDER=';
  lines
    .filter((line) => line.startsWith(girderPrefix))
    .forEach((line) => {
      const cols = line.slice(girderPrefix.length).split('|');
      layout.girders.push({
        girderId: cols[0] || '',
        order: Number(cols[1] || 0),
        offsetFromCenterlineFt: Number(cols[2] || 0),
        radiusFt: Number(cols[3] || 0),
        arcLengthFt: Number(cols[4] || 0),
        stationPoints: []
      });
    });

  const pointsByGirder = {};
  layout.girders.forEach((g) => {
    pointsByGirder[g.girderId] = g;
  });

  const pointPrefix = 'POINT=';
  lines
    .filter((line) => line.startsWith(pointPrefix))
    .forEach((line) => {
      const cols = line.slice(pointPrefix.length).split('|');
      const girderId = cols[0] || '';
      const target = pointsByGirder[girderId];
      if (!target) return;
      target.stationPoints.push({
        stationCenterlineFt: Number(cols[1] || 0),
        thetaDeg: Number(cols[2] || 0),
        xFt: Number(cols[3] || 0),
        yFt: Number(cols[4] || 0)
      });
    });

  const centerlineStations = {};
  layout.girders.forEach((g) => {
    g.stationPoints.forEach((p) => {
      centerlineStations[p.stationCenterlineFt.toFixed(3)] = p.stationCenterlineFt;
    });
  });

  layout.layout.stationsCenterlineFt = Object.keys(centerlineStations)
    .map((k) => centerlineStations[k])
    .sort((a, b) => a - b)
    .map((v) => roundTo(v, 3));
  layout.layout.stationLabels = layout.layout.stationsCenterlineFt.map((s) => formatStationLabel(s));

  if (!layout.girders.length) {
    throw new Error('MDX Software payload missing GIRDER records.');
  }

  return layout;
}
