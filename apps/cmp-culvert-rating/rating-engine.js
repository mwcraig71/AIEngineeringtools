/**
 * CMP Culvert Load Rating Engine
 *
 * Scope:
 * - Circular CMP culvert rating across multiple fill heights.
 * - Baseline and deteriorated outputs in one run.
 * - Explicit section-loss handling for steel, rebar, and prestressing.
 * - Inventory and operating rating factors for key limit states.
 *
 * Units:
 * - length: ft, in
 * - stress: ksi
 * - pressure: kip/ft^2
 * - forces: kip/ft (strip along culvert length)
 */

const CMP_RATING_FACTORS = {
  inventory: { gammaDC: 1.25, gammaLL: 1.75 },
  operating: { gammaDC: 1.25, gammaLL: 1.35 }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function validatePercent(name, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(name + ' must be between 0 and 100.');
  }
  return n;
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function parseFillHeights(fillHeightsFt) {
  if (!Array.isArray(fillHeightsFt) || fillHeightsFt.length === 0) {
    throw new Error('fillHeightsFt must contain at least one value.');
  }
  const parsed = fillHeightsFt.map((f, i) => {
    const n = Number(f);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error('fillHeightsFt[' + i + '] must be a non-negative number.');
    }
    return n;
  });
  return parsed;
}

function computeSteelThicknessByZone(input, deterioration, mode) {
  const baseThickness = Number(input.geometry.wallThicknessIn);
  if (!Number.isFinite(baseThickness) || baseThickness <= 0) {
    throw new Error('wallThicknessIn must be > 0.');
  }

  if (mode === 'baseline') {
    return {
      crownIn: baseThickness,
      springlineIn: baseThickness,
      invertIn: baseThickness,
      averageIn: baseThickness
    };
  }

  const steel = deterioration.steel;
  const uniformLoss = validatePercent('steel.uniformLossPercent', steel.uniformLossPercent);
  const useSegmented = !!steel.useSegmentedLoss;

  const crownLoss = useSegmented
    ? validatePercent('steel.crownLossPercent', steel.crownLossPercent)
    : uniformLoss;
  const springlineLoss = useSegmented
    ? validatePercent('steel.springlineLossPercent', steel.springlineLossPercent)
    : uniformLoss;
  const invertLoss = useSegmented
    ? validatePercent('steel.invertLossPercent', steel.invertLossPercent)
    : uniformLoss;

  const crownIn = baseThickness * (1 - crownLoss / 100);
  const springlineIn = baseThickness * (1 - springlineLoss / 100);
  const invertIn = baseThickness * (1 - invertLoss / 100);

  return {
    crownIn,
    springlineIn,
    invertIn,
    averageIn: mean([crownIn, springlineIn, invertIn])
  };
}

function computeEffectiveCompositeAreas(input, deterioration, mode) {
  const as0 = Math.max(0, Number(input.composite.rebarAreaIn2PerFt || 0));
  const aps0 = Math.max(0, Number(input.composite.prestressAreaIn2PerFt || 0));

  if (mode === 'baseline') {
    return {
      rebarOriginalIn2PerFt: as0,
      rebarEffectiveIn2PerFt: as0,
      prestressOriginalIn2PerFt: aps0,
      prestressEffectiveIn2PerFt: aps0
    };
  }

  const rebarLoss = validatePercent('rebar.lossPercent', deterioration.rebar.lossPercent);
  const prestressLoss = validatePercent('prestress.lossPercent', deterioration.prestress.lossPercent);

  return {
    rebarOriginalIn2PerFt: as0,
    rebarEffectiveIn2PerFt: as0 * (1 - rebarLoss / 100),
    prestressOriginalIn2PerFt: aps0,
    prestressEffectiveIn2PerFt: aps0 * (1 - prestressLoss / 100)
  };
}

function computeCapacity(input, scenarioName) {
  const mode = scenarioName === 'baseline' ? 'baseline' : 'deteriorated';
  const steelThickness = computeSteelThicknessByZone(input, input.deterioration, mode);
  const composite = computeEffectiveCompositeAreas(input, input.deterioration, mode);

  const Dft = Number(input.geometry.diameterFt);
  const Din = Dft * 12;
  const Rft = Dft / 2;
  const fyKsi = Number(input.materials.steelFyKsi);
  const EsKsi = Number(input.materials.steelEKsi);
  const nu = clamp(Number(input.materials.poisson || 0.3), 0.05, 0.49);

  const tAvg = steelThickness.averageIn;
  const areaSteelIn2PerFt = tAvg * 12;
  const seamFactor = clamp(Number(input.geometry.seamEfficiency || 0.85), 0.5, 1.0);
  const beddingFactor = clamp(Number(input.geometry.beddingFactor || 1.0), 0.5, 1.5);

  const rebarFy = Number(input.materials.rebarFyKsi || 60);
  const fpe = Number(input.materials.prestressEffectiveStressKsi || 120);
  const leverArmIn = Math.max(1, Number(input.composite.leverArmIn || 6));

  const steelCompressionKipPerFt = fyKsi * areaSteelIn2PerFt;
  const rebarCompressionKipPerFt = rebarFy * composite.rebarEffectiveIn2PerFt;
  const prestressCompressionKipPerFt = fpe * composite.prestressEffectiveIn2PerFt;
  const ringCompressionCapacity = steelCompressionKipPerFt + rebarCompressionKipPerFt + prestressCompressionKipPerFt;

  const steelZIn3PerFt = 12 * tAvg * tAvg / 4;
  const steelMnKipFtPerFt = (fyKsi * steelZIn3PerFt) / 12;
  const rebarMnKipFtPerFt = (rebarFy * composite.rebarEffectiveIn2PerFt * leverArmIn) / 12;
  const prestressMnKipFtPerFt = (fpe * composite.prestressEffectiveIn2PerFt * leverArmIn) / 12;
  const bendingCapacity = steelMnKipFtPerFt + rebarMnKipFtPerFt + prestressMnKipFtPerFt;

  const bucklingPsi = (
    2 * EsKsi * 1000 / Math.sqrt(3 * (1 - nu * nu))
  ) * Math.pow(Math.max(1e-6, tAvg / Din), 3);
  const bucklingCapacityKsf = (bucklingPsi / 1000) * 144 * beddingFactor;

  const seamCapacity = seamFactor * steelCompressionKipPerFt;

  const deflectionConstant = Number(input.serviceability.deflectionConstant || 0.02);
  const deflectionCapacityPercent = Number(input.serviceability.allowableDeflectionPercent || 5);

  return {
    scenario: scenarioName,
    effectiveSection: {
      steelThicknessIn: steelThickness,
      steelAreaIn2PerFt: areaSteelIn2PerFt,
      rebarAreaIn2PerFt: {
        original: composite.rebarOriginalIn2PerFt,
        effective: composite.rebarEffectiveIn2PerFt
      },
      prestressAreaIn2PerFt: {
        original: composite.prestressOriginalIn2PerFt,
        effective: composite.prestressEffectiveIn2PerFt
      }
    },
    capacities: {
      ringCompressionKipPerFt: ringCompressionCapacity,
      bendingKipFtPerFt: bendingCapacity,
      bucklingPressureKsf: bucklingCapacityKsf,
      seamKipPerFt: seamCapacity,
      deflectionCapacityPercent,
      deflectionConstant,
      radiusFt: Rft
    }
  };
}

function computeDemandsForFill(input, fillFt) {
  const Rft = Number(input.geometry.diameterFt) / 2;

  const gammaSoilPcf = Number(input.loads.soilUnitWeightPcf);
  const constructionSurchargeKsf = Number(input.loads.constructionSurchargeKsf || 0);

  const truckIntensityKsf = Number(input.loads.liveSurfaceIntensityKsf || 1.6);
  const liveDepthExponent = Math.max(0.5, Number(input.loads.liveDepthExponent || 1.25));
  const impact = Math.max(0, Number(input.loads.impactFactor || 0.33));

  const deadPressure = gammaSoilPcf * fillFt / 1000 + constructionSurchargeKsf;
  const livePressure = (truckIntensityKsf / Math.pow(fillFt + 1, liveDepthExponent)) * (1 + impact);

  const ringCompressionDead = deadPressure * Rft;
  const ringCompressionLive = livePressure * Rft;

  const kBend = 0.10 + 0.015 * fillFt;
  const bendingDead = kBend * deadPressure * Rft * Rft;
  const bendingLive = kBend * livePressure * Rft * Rft;

  const seamDead = 0.85 * ringCompressionDead;
  const seamLive = 0.85 * ringCompressionLive;

  const kDef = Number(input.serviceability.deflectionConstant || 0.02);
  const DOverT = (Number(input.geometry.diameterFt) * 12) / Number(input.geometry.wallThicknessIn);
  const deflectionDeadPercent = kDef * deadPressure * Math.pow(DOverT / 100, 2);
  const deflectionLivePercent = kDef * livePressure * Math.pow(DOverT / 100, 2);

  return {
    fillFt,
    pressuresKsf: {
      dead: deadPressure,
      live: livePressure,
      total: deadPressure + livePressure
    },
    ringCompressionKipPerFt: {
      dead: ringCompressionDead,
      live: ringCompressionLive
    },
    bendingKipFtPerFt: {
      dead: bendingDead,
      live: bendingLive
    },
    seamKipPerFt: {
      dead: seamDead,
      live: seamLive
    },
    deflectionPercent: {
      dead: deflectionDeadPercent,
      live: deflectionLivePercent
    }
  };
}

function ratingFactor(capacity, deadDemand, liveDemand, factors) {
  if (liveDemand <= 0) return Number.POSITIVE_INFINITY;
  return (capacity - factors.gammaDC * deadDemand) / (factors.gammaLL * liveDemand);
}

function evaluateLimitStates(demand, capacitySet) {
  const cap = capacitySet.capacities;

  const limitStates = [
    {
      id: 'ring_compression',
      demandDead: demand.ringCompressionKipPerFt.dead,
      demandLive: demand.ringCompressionKipPerFt.live,
      capacity: 0.9 * cap.ringCompressionKipPerFt
    },
    {
      id: 'bending',
      demandDead: demand.bendingKipFtPerFt.dead,
      demandLive: demand.bendingKipFtPerFt.live,
      capacity: 0.9 * cap.bendingKipFtPerFt
    },
    {
      id: 'buckling',
      demandDead: demand.pressuresKsf.dead,
      demandLive: demand.pressuresKsf.live,
      capacity: 0.75 * cap.bucklingPressureKsf
    },
    {
      id: 'seam',
      demandDead: demand.seamKipPerFt.dead,
      demandLive: demand.seamKipPerFt.live,
      capacity: 0.85 * cap.seamKipPerFt
    },
    {
      id: 'serviceability_deflection',
      demandDead: demand.deflectionPercent.dead,
      demandLive: demand.deflectionPercent.live,
      capacity: cap.deflectionCapacityPercent
    }
  ];

  const evaluated = limitStates.map((ls) => {
    const inv = ratingFactor(ls.capacity, ls.demandDead, ls.demandLive, CMP_RATING_FACTORS.inventory);
    const op = ratingFactor(ls.capacity, ls.demandDead, ls.demandLive, CMP_RATING_FACTORS.operating);
    return {
      limitState: ls.id,
      demand: { dead: ls.demandDead, live: ls.demandLive },
      capacity: ls.capacity,
      rating: {
        inventory: inv,
        operating: op
      }
    };
  });

  const governingInventory = evaluated.reduce((a, b) => (a.rating.inventory < b.rating.inventory ? a : b));
  const governingOperating = evaluated.reduce((a, b) => (a.rating.operating < b.rating.operating ? a : b));

  return {
    limitStates: evaluated,
    governing: {
      inventory: {
        limitState: governingInventory.limitState,
        value: governingInventory.rating.inventory
      },
      operating: {
        limitState: governingOperating.limitState,
        value: governingOperating.rating.operating
      }
    }
  };
}

function computeScenarioForFill(input, fillFt, scenarioName) {
  const demands = computeDemandsForFill(input, fillFt);
  const capacitySet = computeCapacity(input, scenarioName);
  const evaluation = evaluateLimitStates(demands, capacitySet);

  return {
    fillFt,
    scenario: scenarioName,
    demands,
    effectiveSection: capacitySet.effectiveSection,
    capacities: capacitySet.capacities,
    ...evaluation
  };
}

function runCMPCulvertRating(input) {
  const fillHeights = parseFillHeights(input.fillHeightsFt);

  const baseline = [];
  const deteriorated = [];
  const resultsByFill = [];

  for (let i = 0; i < fillHeights.length; i++) {
    const fillFt = fillHeights[i];
    const base = computeScenarioForFill(input, fillFt, 'baseline');
    const det = computeScenarioForFill(input, fillFt, 'deteriorated');

    baseline.push(base);
    deteriorated.push(det);

    resultsByFill.push({
      fillFt,
      baseline: base,
      deteriorated: det,
      sensitivity: {
        deltaInventoryRF: det.governing.inventory.value - base.governing.inventory.value,
        deltaOperatingRF: det.governing.operating.value - base.governing.operating.value
      }
    });
  }

  return {
    toolId: 'cmp-culvert-rating',
    generatedAt: new Date().toISOString(),
    input,
    fillHeightsFt: fillHeights,
    baseline,
    deteriorated,
    resultsByFill
  };
}

function createDefaultCMPCulvertInput() {
  return {
    fillHeightsFt: [2, 4, 6, 8, 10],
    geometry: {
      shape: 'circular',
      diameterFt: 8,
      wallThicknessIn: 0.188,
      seamEfficiency: 0.82,
      beddingFactor: 1.0
    },
    materials: {
      steelFyKsi: 42,
      steelEKsi: 29000,
      poisson: 0.30,
      rebarFyKsi: 60,
      prestressEffectiveStressKsi: 125
    },
    composite: {
      rebarAreaIn2PerFt: 0.45,
      prestressAreaIn2PerFt: 0.18,
      leverArmIn: 6
    },
    loads: {
      soilUnitWeightPcf: 125,
      liveSurfaceIntensityKsf: 1.6,
      liveDepthExponent: 1.25,
      impactFactor: 0.33,
      constructionSurchargeKsf: 0.15
    },
    serviceability: {
      allowableDeflectionPercent: 5,
      deflectionConstant: 0.02
    },
    deterioration: {
      steel: {
        useSegmentedLoss: true,
        uniformLossPercent: 15,
        crownLossPercent: 20,
        springlineLossPercent: 15,
        invertLossPercent: 25
      },
      rebar: {
        lossPercent: 10
      },
      prestress: {
        lossPercent: 12
      }
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CMP_RATING_FACTORS,
    parseFillHeights,
    computeSteelThicknessByZone,
    computeEffectiveCompositeAreas,
    computeCapacity,
    computeDemandsForFill,
    evaluateLimitStates,
    runCMPCulvertRating,
    createDefaultCMPCulvertInput
  };
}
