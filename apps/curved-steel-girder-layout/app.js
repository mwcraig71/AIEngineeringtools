(function () {
  const ids = [
    'projectName',
    'mdxSoftwareVersion',
    'generatedAt',
    'radiusFt',
    'centralAngleDeg',
    'curveDirection',
    'girderCount',
    'girderSpacingFt',
    'stationIntervalFt',
    'steelSectionLossPercent',
    'rebarSectionLossPercent',
    'prestressSectionLossPercent'
  ];

  function getValue(id) {
    return document.getElementById(id).value;
  }

  function getInputs() {
    return {
      projectName: getValue('projectName'),
      mdxSoftwareVersion: getValue('mdxSoftwareVersion'),
      generatedAt: getValue('generatedAt'),
      radiusFt: getValue('radiusFt'),
      centralAngleDeg: getValue('centralAngleDeg'),
      curveDirection: getValue('curveDirection'),
      girderCount: getValue('girderCount'),
      girderSpacingFt: getValue('girderSpacingFt'),
      stationIntervalFt: getValue('stationIntervalFt'),
      deterioration: {
        steelSectionLossPercent: getValue('steelSectionLossPercent'),
        rebarSectionLossPercent: getValue('rebarSectionLossPercent'),
        prestressSectionLossPercent: getValue('prestressSectionLossPercent')
      }
    };
  }

  function setInputsFromLayout(layout) {
    document.getElementById('projectName').value = layout.meta.projectName || '';
    document.getElementById('mdxSoftwareVersion').value = layout.mdxSoftwareVersion || 'MDX-2025.1-ASSUMED';
    document.getElementById('generatedAt').value = layout.meta.generatedAt || '';
    document.getElementById('radiusFt').value = layout.alignment.radiusFt || '';
    document.getElementById('centralAngleDeg').value = layout.alignment.centralAngleDeg || '';
    document.getElementById('curveDirection').value = layout.meta.curveDirection === 'right' ? 'right' : 'left';
    document.getElementById('girderCount').value = layout.layout.girderCount || '';
    document.getElementById('girderSpacingFt').value = layout.layout.girderSpacingFt || '';
    document.getElementById('stationIntervalFt').value = layout.layout.stationIntervalFt || '';

    const det = layout.meta.deterioration || {};
    document.getElementById('steelSectionLossPercent').value = det.steelSectionLossPercent || 0;
    document.getElementById('rebarSectionLossPercent').value = det.rebarSectionLossPercent || 0;
    document.getElementById('prestressSectionLossPercent').value = det.prestressSectionLossPercent || 0;
  }

  function setStatus(message, isError) {
    const el = document.getElementById('status');
    el.textContent = message;
    el.style.color = isError ? '#9b1c1c' : '#1f2a37';
  }

  function renderSummary(layout) {
    const radii = layout.girders.map((g) => g.radiusFt);
    const insideRadius = Math.min.apply(null, radii);
    const outsideRadius = Math.max.apply(null, radii);
    const lines = [
      `Project: ${layout.meta.projectName}`,
      `MDX Software Version Assumption: ${layout.mdxSoftwareVersion}`,
      `Curve: ${layout.meta.curveDirection} | Radius = ${layout.alignment.radiusFt.toFixed(3)} ft | Angle = ${layout.alignment.centralAngleDeg.toFixed(3)} deg`,
      `Centerline Arc = ${layout.alignment.centerlineArcLengthFt.toFixed(3)} ft | Chord = ${layout.alignment.centerlineChordFt.toFixed(3)} ft`,
      `Girders: ${layout.layout.girderCount} @ ${layout.layout.girderSpacingFt.toFixed(3)} ft spacing`,
      `Inside/Outside Radius: ${insideRadius.toFixed(3)} ft / ${outsideRadius.toFixed(3)} ft`,
      `Stations generated: ${layout.layout.stationsCenterlineFt.length} (every ${layout.layout.stationIntervalFt.toFixed(3)} ft)`,
      `Derived support count: ${layout.spanLayout.supportStationsFt.length} (equal ${layout.spanLayout.spanCount}-span layout)`,
      `Deterioration handoff (steel/rebar/prestress): ${layout.meta.deterioration.steelSectionLossPercent.toFixed(1)}% / ${layout.meta.deterioration.rebarSectionLossPercent.toFixed(1)}% / ${layout.meta.deterioration.prestressSectionLossPercent.toFixed(1)}%`
    ];
    document.getElementById('summary').textContent = lines.join('\n');
    document.getElementById('stationLabels').textContent = layout.layout.stationLabels.join(', ');
  }

  function renderPlanPreview(layout) {
    const svg = document.getElementById('planPreview');
    const w = 920;
    const h = 260;
    const pad = 22;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const allPoints = [];
    layout.girders.forEach((g) => {
      g.stationPoints.forEach((p) => allPoints.push({ x: p.xFt, y: p.yFt }));
    });
    const minX = Math.min.apply(null, allPoints.map((p) => p.x));
    const maxX = Math.max.apply(null, allPoints.map((p) => p.x));
    const minY = Math.min.apply(null, allPoints.map((p) => p.y));
    const maxY = Math.max.apply(null, allPoints.map((p) => p.y));
    const spanX = Math.max(1e-6, maxX - minX);
    const spanY = Math.max(1e-6, maxY - minY);
    const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
    const toScreen = (pt) => ({
      x: pad + (pt.x - minX) * scale,
      y: h - (pad + (pt.y - minY) * scale)
    });

    const colors = ['#0f4c81', '#1b6ca8', '#2b8cc4', '#58a6d6', '#8dc4e7', '#b8dff4'];
    let markup = '';
    layout.girders.forEach((g, idx) => {
      const points = g.stationPoints.map((pt) => {
        const s = toScreen({ x: pt.xFt, y: pt.yFt });
        return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
      }).join(' ');
      const color = colors[idx % colors.length];
      markup += `<polyline fill="none" stroke="${color}" stroke-width="2" points="${points}"></polyline>`;
    });

    const centerGirder = layout.girders[Math.floor(layout.girders.length / 2)];
    if (centerGirder && centerGirder.stationPoints.length) {
      const indices = [0, Math.floor(centerGirder.stationPoints.length / 2), centerGirder.stationPoints.length - 1];
      indices.forEach((stationIndex) => {
        const p = centerGirder.stationPoints[stationIndex];
        const s = toScreen({ x: p.xFt, y: p.yFt });
        const stationLabel = layout.layout.stationLabels[stationIndex];
        markup += `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="3" fill="#102a43"></circle>`;
        markup += `<text x="${(s.x + 6).toFixed(1)}" y="${(s.y - 6).toFixed(1)}" font-size="10" fill="#102a43">${stationLabel}</text>`;
      });
    }

    svg.innerHTML = markup;
  }

  let currentMdx = '';

  function generate() {
    try {
      const layout = buildCurvedGirderLayout(getInputs());
      currentMdx = emitMdxInput(layout);
      document.getElementById('mdxOutput').value = currentMdx;
      renderSummary(layout);
      renderPlanPreview(layout);
      setStatus('MDX Software input generated successfully.', false);
    } catch (err) {
      setStatus(err.message || 'Failed to generate layout.', true);
    }
  }

  async function copyMdx() {
    if (!currentMdx) {
      setStatus('Generate a layout before copying.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(currentMdx);
      setStatus('MDX Software input copied to clipboard.', false);
    } catch (_) {
      setStatus('Clipboard copy failed. Manual copy from output box.', true);
    }
  }

  function importMdx() {
    try {
      const parsed = parseMdxInput(document.getElementById('mdxOutput').value);
      setInputsFromLayout(parsed);
      generate();
      setStatus('MDX Software input imported successfully.', false);
    } catch (err) {
      setStatus(err.message || 'MDX Software import failed.', true);
    }
  }

  document.getElementById('runBtn').addEventListener('click', generate);
  document.getElementById('copyBtn').addEventListener('click', copyMdx);
  document.getElementById('importBtn').addEventListener('click', importMdx);

  ids.forEach((id) => {
    document.getElementById(id).addEventListener('change', () => setStatus('Inputs changed. Regenerate layout.', false));
  });

  generate();
})();
