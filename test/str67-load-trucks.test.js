const test = require("node:test");
const assert = require("node:assert/strict");

const sharedCatalog = require("../apps/_shared/load-trucks/nc-noninterstate-fig6-147.js");
const bridgeLiveLoadCatalog = require("../apps/bridge-live-load/trucks.js");

function findTruck(id) {
  const truck = sharedCatalog.trucks.find((item) => item.id === id);
  assert.ok(truck, `truck ${id} should exist`);
  return truck;
}

test("STR-67 shared module includes NC non-interstate legal trucks and emergency variants", () => {
  assert.equal(Array.isArray(sharedCatalog.trucks), true);
  assert.equal(sharedCatalog.trucks.length, 18);
  assert.deepEqual(
    sharedCatalog.trucks.map((truck) => truck.id),
    [
      "N01",
      "N02",
      "N03",
      "N04",
      "N05",
      "N06",
      "N07",
      "N08",
      "N09",
      "N10",
      "N11",
      "N12",
      "N13",
      "N14",
      "N15",
      "N16",
      "EV2",
      "EV3"
    ]
  );
});

test("STR-67 fixture trucks N01/N05/N10/N16/EV3 are deterministic", () => {
  const expected = {
    N01: { axles: 2, grossK: 27 },
    N05: { axles: 4, grossK: 69.85 },
    N10: { axles: 4, grossK: 66.15 },
    N16: { axles: 5, grossK: 90 },
    EV3: { axles: 3, grossK: 86 }
  };

  for (const [id, target] of Object.entries(expected)) {
    const truck = findTruck(id);
    assert.equal(truck.axles.length, target.axles, `${id} axle count should be stable`);
    assert.equal(truck.grossK, target.grossK, `${id} gross kips should be stable`);
    assert.equal(
      truck.grossTon,
      Number((target.grossK / 2).toFixed(2)),
      `${id} gross tons should match grossK/2`
    );
  }
});

test("STR-67 shared adapter returns legacy axle format for analysis compatibility", () => {
  const n10 = findTruck("N10");
  const legacy = sharedCatalog.toLegacyAxleArray(n10);

  assert.deepEqual(legacy, [
    { weight: 12.1, position: 0 },
    { weight: 12.05, position: 9 },
    { weight: 21, position: 18 },
    { weight: 21, position: 22 }
  ]);

  const byId = sharedCatalog.getLegacyTruck("N10");
  assert.equal(byId.id, "N10");
  assert.deepEqual(byId.axles, legacy);
});

test("bridge-live-load truck module re-exports the shared NC legal module", () => {
  assert.equal(Array.isArray(bridgeLiveLoadCatalog.trucks), true);
  assert.equal(bridgeLiveLoadCatalog.trucks.length, sharedCatalog.trucks.length);

  const n16 = bridgeLiveLoadCatalog.getLegacyTruck("N16");
  assert.equal(n16.id, "N16");
  assert.equal(n16.grossK, 90);
  assert.equal(n16.axles.length, 5);
  assert.equal(n16.axles[0].position, 0);
});
