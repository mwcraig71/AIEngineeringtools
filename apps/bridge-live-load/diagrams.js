/**
 * Canvas rendering for moment diagrams, shear diagrams, and bridge geometry.
 */

const COLORS = {
  deadMoment: '#6b7280',
  maxEnvelope: '#dc2626',
  minEnvelope: '#2563eb',
  fill: 'rgba(74,108,247,0.08)',
  maxFill: 'rgba(220,38,38,0.12)',
  minFill: 'rgba(37,99,235,0.12)',
  axis: '#374151',
  grid: '#e5e7eb',
  support: '#1a1a2e',
  truck: '#f59e0b',
  bridge: '#6366f1',
  label: '#4b5563',
  zero: '#9ca3af'
};

function drawMomentDiagram(canvasId, result) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const pad = { left: 60, right: 30, top: 30, bottom: 40 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const positions = result.positions;
  const totalLen = positions[positions.length - 1];
  const xScale = plotW / totalLen;

  // Find range across all moment data
  const allM = [...result.combinedMaxMoments, ...result.combinedMinMoments, ...result.dead.moments];
  const maxM = Math.max(...allM);
  const minM = Math.min(...allM);
  const range = maxM - minM || 1;
  const mScale = plotH / (range * 1.1);
  const zeroY = pad.top + (maxM / (range * 1.1)) * plotH;

  // Grid
  drawGrid(ctx, pad, plotW, plotH, totalLen, minM, maxM, 'kip-ft');

  // Zero line
  ctx.strokeStyle = COLORS.zero;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(pad.left + plotW, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Dead load moment (dashed)
  drawCurve(ctx, positions, result.dead.moments, pad.left, zeroY, xScale, mScale, COLORS.deadMoment, true);

  // Max envelope fill
  drawFilledCurve(ctx, positions, result.combinedMaxMoments, pad.left, zeroY, xScale, mScale, COLORS.maxFill);
  // Min envelope fill
  drawFilledCurve(ctx, positions, result.combinedMinMoments, pad.left, zeroY, xScale, mScale, COLORS.minFill);

  // Max envelope line
  drawCurve(ctx, positions, result.combinedMaxMoments, pad.left, zeroY, xScale, mScale, COLORS.maxEnvelope, false);
  // Min envelope line
  drawCurve(ctx, positions, result.combinedMinMoments, pad.left, zeroY, xScale, mScale, COLORS.minEnvelope, false);

  // Support lines
  drawSupportLines(ctx, result.spans, pad.left, pad.top, plotH, xScale);

  // Legend
  drawLegend(ctx, W, pad.top, [
    { color: COLORS.maxEnvelope, label: 'Max Moment' },
    { color: COLORS.minEnvelope, label: 'Min Moment' },
    { color: COLORS.deadMoment, label: 'Dead Load', dashed: true }
  ]);

  // Critical values
  ctx.font = '11px sans-serif';
  ctx.fillStyle = COLORS.maxEnvelope;
  ctx.fillText(`Max: ${result.maxMoment.toFixed(1)} kip-ft`, pad.left + 5, pad.top + 15);
  ctx.fillStyle = COLORS.minEnvelope;
  ctx.fillText(`Min: ${result.minMoment.toFixed(1)} kip-ft`, pad.left + 5, pad.top + 28);
}

function drawShearDiagram(canvasId, result) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const pad = { left: 60, right: 30, top: 30, bottom: 40 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const positions = result.positions;
  const totalLen = positions[positions.length - 1];
  const xScale = plotW / totalLen;

  const allV = [...result.combinedMaxShears, ...result.combinedMinShears, ...result.dead.shears];
  const maxV = Math.max(...allV);
  const minV = Math.min(...allV);
  const range = maxV - minV || 1;
  const vScale = plotH / (range * 1.1);
  const zeroY = pad.top + (maxV / (range * 1.1)) * plotH;

  drawGrid(ctx, pad, plotW, plotH, totalLen, minV, maxV, 'kip');

  // Zero line
  ctx.strokeStyle = COLORS.zero;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(pad.left + plotW, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Dead load shear
  drawCurve(ctx, positions, result.dead.shears, pad.left, zeroY, xScale, vScale, COLORS.deadMoment, true);

  // Fills
  drawFilledCurve(ctx, positions, result.combinedMaxShears, pad.left, zeroY, xScale, vScale, COLORS.maxFill);
  drawFilledCurve(ctx, positions, result.combinedMinShears, pad.left, zeroY, xScale, vScale, COLORS.minFill);

  // Envelope lines
  drawCurve(ctx, positions, result.combinedMaxShears, pad.left, zeroY, xScale, vScale, COLORS.maxEnvelope, false);
  drawCurve(ctx, positions, result.combinedMinShears, pad.left, zeroY, xScale, vScale, COLORS.minEnvelope, false);

  drawSupportLines(ctx, result.spans, pad.left, pad.top, plotH, xScale);

  drawLegend(ctx, W, pad.top, [
    { color: COLORS.maxEnvelope, label: 'Max Shear' },
    { color: COLORS.minEnvelope, label: 'Min Shear' },
    { color: COLORS.deadMoment, label: 'Dead Load', dashed: true }
  ]);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = COLORS.maxEnvelope;
  ctx.fillText(`Max: ${result.maxShear.toFixed(1)} kip`, pad.left + 5, pad.top + 15);
  ctx.fillStyle = COLORS.minEnvelope;
  ctx.fillText(`Min: ${result.minShear.toFixed(1)} kip`, pad.left + 5, pad.top + 28);
}

function drawBridgeGeometry(canvasId, result, truckDef) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const pad = { left: 60, right: 30, top: 20, bottom: 30 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const spans = result.spans;
  const totalLen = spans.reduce((a, b) => a + b, 0);
  const xScale = plotW / totalLen;
  const deckY = pad.top + plotH * 0.4;

  // Draw deck
  ctx.strokeStyle = COLORS.bridge;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pad.left, deckY);
  ctx.lineTo(pad.left + plotW, deckY);
  ctx.stroke();

  // Draw supports (triangles)
  let xPos = 0;
  for (let i = 0; i <= spans.length; i++) {
    const sx = pad.left + xPos * xScale;
    drawTriangleSupport(ctx, sx, deckY, 12);
    // Label
    ctx.font = '10px sans-serif';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.fillText(`${xPos.toFixed(0)}'`, sx, deckY + 28);
    if (i < spans.length) xPos += spans[i];
  }

  // Span labels
  xPos = 0;
  for (let i = 0; i < spans.length; i++) {
    const midX = pad.left + (xPos + spans[i] / 2) * xScale;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = COLORS.bridge;
    ctx.textAlign = 'center';
    ctx.fillText(`Span ${i + 1}: ${spans[i]} ft`, midX, deckY - 12);
    xPos += spans[i];
  }

  // Draw truck silhouette at midspan
  if (truckDef) {
    const axles = getTruckAxles(truckDef, truckDef.variableSpacing ? truckDef.variableSpacing.min : undefined);
    const truckStart = totalLen * 0.3;
    ctx.fillStyle = COLORS.truck;
    ctx.strokeStyle = COLORS.truck;
    ctx.lineWidth = 2;

    for (const axle of axles) {
      const ax = pad.left + (truckStart + axle.position) * xScale;
      // Wheel
      ctx.beginPath();
      ctx.arc(ax, deckY - 6, 4, 0, Math.PI * 2);
      ctx.fill();
      // Load arrow
      ctx.beginPath();
      ctx.moveTo(ax, deckY - 25);
      ctx.lineTo(ax, deckY - 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax - 3, deckY - 14);
      ctx.lineTo(ax, deckY - 10);
      ctx.lineTo(ax + 3, deckY - 14);
      ctx.fill();
      // Weight label
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${axle.weight}k`, ax, deckY - 28);
    }
  }
}

// ============================================================
// Helper drawing functions
// ============================================================

function drawCurve(ctx, positions, values, x0, y0, xScale, yScale, color, dashed) {
  ctx.strokeStyle = color;
  ctx.lineWidth = dashed ? 1.5 : 2;
  if (dashed) ctx.setLineDash([6, 3]);
  else ctx.setLineDash([]);

  ctx.beginPath();
  for (let i = 0; i < positions.length; i++) {
    const x = x0 + positions[i] * xScale;
    const y = y0 - values[i] * yScale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawFilledCurve(ctx, positions, values, x0, y0, xScale, yScale, fillColor) {
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(x0 + positions[0] * xScale, y0);
  for (let i = 0; i < positions.length; i++) {
    ctx.lineTo(x0 + positions[i] * xScale, y0 - values[i] * yScale);
  }
  ctx.lineTo(x0 + positions[positions.length - 1] * xScale, y0);
  ctx.closePath();
  ctx.fill();
}

function drawGrid(ctx, pad, plotW, plotH, totalLen, minVal, maxVal, unit) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  ctx.font = '10px sans-serif';
  ctx.fillStyle = COLORS.label;

  // Horizontal grid (value axis)
  const range = maxVal - minVal || 1;
  const niceStep = niceNum(range / 5);
  const startVal = Math.floor(minVal / niceStep) * niceStep;
  const endVal = Math.ceil(maxVal / niceStep) * niceStep;
  const yRange = endVal - startVal;
  const yScale = plotH / yRange;

  for (let v = startVal; v <= endVal; v += niceStep) {
    const y = pad.top + (endVal - v) / yRange * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${v.toFixed(0)}`, pad.left - 5, y + 3);
  }

  // Unit label
  ctx.save();
  ctx.translate(12, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(unit, 0, 0);
  ctx.restore();

  // Vertical grid (position axis)
  const xStep = niceNum(totalLen / 8);
  for (let x = 0; x <= totalLen; x += xStep) {
    const px = pad.left + x / totalLen * plotW;
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, pad.top + plotH);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(`${x.toFixed(0)}'`, px, pad.top + plotH + 15);
  }

  // X-axis label
  ctx.textAlign = 'center';
  ctx.fillText('Position (ft)', pad.left + plotW / 2, pad.top + plotH + 32);
}

function niceNum(range) {
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice;
  if (frac <= 1.5) nice = 1;
  else if (frac <= 3) nice = 2;
  else if (frac <= 7) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

function drawSupportLines(ctx, spans, x0, y0, plotH, xScale) {
  ctx.strokeStyle = COLORS.support;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 4]);
  let pos = 0;
  for (let i = 0; i <= spans.length; i++) {
    const x = x0 + pos * xScale;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + plotH);
    ctx.stroke();
    if (i < spans.length) pos += spans[i];
  }
  ctx.setLineDash([]);
}

function drawTriangleSupport(ctx, x, y, size) {
  ctx.fillStyle = COLORS.support;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size / 2, y + size);
  ctx.lineTo(x + size / 2, y + size);
  ctx.closePath();
  ctx.fill();
  // Ground line
  ctx.strokeStyle = COLORS.support;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - size / 2 - 3, y + size + 2);
  ctx.lineTo(x + size / 2 + 3, y + size + 2);
  ctx.stroke();
}

function drawLegend(ctx, canvasW, topY, items) {
  const x0 = canvasW - 150;
  let y = topY + 12;
  ctx.font = '10px sans-serif';
  for (const item of items) {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    if (item.dashed) ctx.setLineDash([4, 3]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + 20, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.fillText(item.label, x0 + 25, y + 3);
    y += 16;
  }
}
