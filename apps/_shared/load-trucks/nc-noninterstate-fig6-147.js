(function initNcNonInterstateFig6147(globalScope) {
  const SOURCE = "NCDOT Figure 6-147 non-interstate legal loads";

  function toGrossK(axles) {
    return axles.reduce((sum, axle) => sum + axle.weightK, 0);
  }

  function toGrossTon(grossK) {
    return Number((grossK / 2).toFixed(2));
  }

  function truck(id, code, klass, group, axles) {
    const grossK = toGrossK(axles);
    return {
      id,
      code,
      class: klass,
      group,
      axles,
      grossK,
      grossTon: toGrossTon(grossK),
      source: SOURCE
    };
  }

  const NC_NONINTERSTATE_FIG6_147 = [
    truck("N01", "SNSH", "single-unit", "non-interstate", [
      { weightK: 5, spacingFtFromPrev: 0 },
      { weightK: 22, spacingFtFromPrev: 14 }
    ]),
    truck("N02", "SNGARBS2", "single-unit", "non-interstate", [
      { weightK: 23.5, spacingFtFromPrev: 0 },
      { weightK: 16.5, spacingFtFromPrev: 14 }
    ]),
    truck("N03", "SNAGRIS2", "single-unit", "non-interstate", [
      { weightK: 22, spacingFtFromPrev: 0 },
      { weightK: 22, spacingFtFromPrev: 14 }
    ]),
    truck("N04", "SNCOTTS3", "single-unit", "non-interstate", [
      { weightK: 4.5, spacingFtFromPrev: 0 },
      { weightK: 25, spacingFtFromPrev: 11 },
      { weightK: 25, spacingFtFromPrev: 4 }
    ]),
    truck("N05", "SNAGGRS4", "single-unit", "non-interstate", [
      { weightK: 16, spacingFtFromPrev: 0 },
      { weightK: 15.85, spacingFtFromPrev: 9 },
      { weightK: 19, spacingFtFromPrev: 4 },
      { weightK: 19, spacingFtFromPrev: 4 }
    ]),
    truck("N06", "SNS5A", "single-unit", "non-interstate", [
      { weightK: 12.1, spacingFtFromPrev: 0 },
      { weightK: 8.5, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 8.5, spacingFtFromPrev: 4 }
    ]),
    truck("N07", "SNS6A", "single-unit", "non-interstate", [
      { weightK: 12.1, spacingFtFromPrev: 0 },
      { weightK: 8.6, spacingFtFromPrev: 9 },
      { weightK: 8.6, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 8.6, spacingFtFromPrev: 4 }
    ]),
    truck("N08", "SNS7B", "single-unit", "non-interstate", [
      { weightK: 7.6, spacingFtFromPrev: 0 },
      { weightK: 8.6, spacingFtFromPrev: 9 },
      { weightK: 8.6, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 8.6, spacingFtFromPrev: 4 },
      { weightK: 8.6, spacingFtFromPrev: 4 }
    ]),
    truck("N09", "TNAGRIT3", "tractor-semitrailer", "non-interstate", [
      { weightK: 22, spacingFtFromPrev: 0 },
      { weightK: 22, spacingFtFromPrev: 9 },
      { weightK: 22, spacingFtFromPrev: 9 }
    ]),
    truck("N10", "TNT4A", "tractor-semitrailer", "non-interstate", [
      { weightK: 12.1, spacingFtFromPrev: 0 },
      { weightK: 12.05, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 4 }
    ]),
    truck("N11", "TNT6A", "tractor-semitrailer", "non-interstate", [
      { weightK: 12.1, spacingFtFromPrev: 0 },
      { weightK: 8.2, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 10.45, spacingFtFromPrev: 9 },
      { weightK: 10.45, spacingFtFromPrev: 4 }
    ]),
    truck("N12", "TNT7A", "tractor-semitrailer", "non-interstate", [
      { weightK: 4.1, spacingFtFromPrev: 0 },
      { weightK: 4, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 11.3, spacingFtFromPrev: 9 },
      { weightK: 11.3, spacingFtFromPrev: 4 },
      { weightK: 11.3, spacingFtFromPrev: 4 }
    ]),
    truck("N13", "TNT7B", "tractor-semitrailer", "non-interstate", [
      { weightK: 4.1, spacingFtFromPrev: 0 },
      { weightK: 10.5, spacingFtFromPrev: 9 },
      { weightK: 10.5, spacingFtFromPrev: 4 },
      { weightK: 8.45, spacingFtFromPrev: 9 },
      { weightK: 8.45, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 4 }
    ]),
    truck("N14", "TNAGRIT4", "tractor-semitrailer", "non-interstate", [
      { weightK: 22, spacingFtFromPrev: 0 },
      { weightK: 22, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 4 }
    ]),
    truck("N15", "TNAGT5A", "tractor-semitrailer", "non-interstate", [
      { weightK: 22, spacingFtFromPrev: 0 },
      { weightK: 21, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 13, spacingFtFromPrev: 9 },
      { weightK: 13, spacingFtFromPrev: 4 }
    ]),
    truck("N16", "TNAGT5B", "tractor-semitrailer", "non-interstate", [
      { weightK: 6, spacingFtFromPrev: 0 },
      { weightK: 21, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 4 },
      { weightK: 21, spacingFtFromPrev: 9 },
      { weightK: 21, spacingFtFromPrev: 4 }
    ]),
    truck("EV2", "EV2", "emergency-vehicle", "escort", [
      { weightK: 24, spacingFtFromPrev: 0 },
      { weightK: 33.5, spacingFtFromPrev: 15 }
    ]),
    truck("EV3", "EV3", "emergency-vehicle", "escort", [
      { weightK: 24, spacingFtFromPrev: 0 },
      { weightK: 31, spacingFtFromPrev: 15 },
      { weightK: 31, spacingFtFromPrev: 4 }
    ])
  ];

  function toLegacyAxleArray(truckDefinition) {
    let position = 0;
    return truckDefinition.axles.map((axle, index) => {
      if (index > 0) {
        position += axle.spacingFtFromPrev;
      }
      return {
        weight: axle.weightK,
        position
      };
    });
  }

  function getLegacyTruck(id) {
    const match = NC_NONINTERSTATE_FIG6_147.find((truckDef) => truckDef.id === id);
    if (!match) {
      return null;
    }

    return {
      id: match.id,
      code: match.code,
      class: match.class,
      group: match.group,
      grossK: match.grossK,
      grossTon: match.grossTon,
      source: match.source,
      axles: toLegacyAxleArray(match)
    };
  }

  const api = {
    source: SOURCE,
    trucks: NC_NONINTERSTATE_FIG6_147,
    toLegacyAxleArray,
    getLegacyTruck
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.StrintegLoadTrucks = globalScope.StrintegLoadTrucks || {};
  globalScope.StrintegLoadTrucks.ncNonInterstateFig6147 = api;
})(typeof window !== "undefined" ? window : globalThis);
