(function initRatingAppAdoption(globalScope) {
  function byId(id) {
    return document.getElementById(id);
  }

  function readRatio(id) {
    const value = Number(byId(id).value);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(95, value)) / 100;
  }

  function formatRatio(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function effectiveCapacity(baseCapacity, deterioration, materialUse) {
    const weightedLoss =
      deterioration.steelPct * (materialUse.steel ? 0.55 : 0) +
      deterioration.rebarPct * (materialUse.rebar ? 0.3 : 0) +
      deterioration.prestressPct * (materialUse.prestress ? 0.45 : 0);

    return Math.max(0.1, baseCapacity * (1 - weightedLoss));
  }

  function calculateRatingCase(loadSource, truck, laneLoad, deterioration, materialUse) {
    const baseCapacity = 2.25;
    const capacity = effectiveCapacity(baseCapacity, deterioration, materialUse);
    const truckDemand = (truck && Number.isFinite(truck.grossK) ? truck.grossK : 72) / 100;
    const liveDemand = truckDemand + laneLoad;
    const ratingFactor = Number((capacity / liveDemand).toFixed(3));

    return {
      load_source: loadSource,
      truck_id: truck ? truck.id : "HL93-DESIGN",
      laneLoad,
      truck_demand: Number(truckDemand.toFixed(3)),
      effective_capacity: Number(capacity.toFixed(3)),
      rating_factor: ratingFactor,
      steelPct: deterioration.steelPct,
      rebarPct: deterioration.rebarPct,
      prestressPct: deterioration.prestressPct,
      governing_limit_state: "strength-flexure"
    };
  }

  function createOptions(select, options) {
    select.innerHTML = "";
    for (const option of options) {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      select.appendChild(opt);
    }
  }

  function truckCatalog(defaultCatalog, getter) {
    if (typeof getter === "function") {
      const alternate = getter();
      if (alternate && Array.isArray(alternate.trucks)) {
        return alternate;
      }
    }
    return defaultCatalog;
  }

  function mount(config) {
    const catalog = truckCatalog(
      globalScope.StrintegLoadTrucks.ncNonInterstateFig6147,
      config.truckCatalogGetter
    );

    const loadSource = byId("load-source");
    const truckSelect = byId("legal-truck");
    const outputTable = byId("output-table-body");
    const summary = byId("summary-alert");

    if (!catalog || !loadSource || !truckSelect || !outputTable || !summary) {
      return;
    }

    createOptions(loadSource, [
      { value: "hl93", label: "HL-93 Design" },
      { value: "nc-legal", label: "NC Legal Load (Fig 6-147)" },
      { value: "sc-legal", label: "SC Legal Load (Statewide)" }
    ]);

    function refreshTruckOptions() {
      const source = loadSource.value;
      if (source === "nc-legal") {
        createOptions(
          truckSelect,
          catalog.trucks.map((truck) => ({
            value: truck.id,
            label: `${truck.id} (${truck.grossTon.toFixed(1)} ton)`
          }))
        );
        truckSelect.disabled = false;
        return;
      }

      if (source === "sc-legal") {
        createOptions(truckSelect, [{ value: "SC-LEGAL", label: "SC Standard Legal Truck" }]);
        truckSelect.disabled = false;
        return;
      }

      createOptions(truckSelect, [{ value: "HL93-DESIGN", label: "HL-93 design truck + lane" }]);
      truckSelect.disabled = true;
    }

    function activeTruck() {
      const source = loadSource.value;
      if (source === "nc-legal") {
        return catalog.trucks.find((truck) => truck.id === truckSelect.value) || catalog.trucks[0];
      }
      if (source === "sc-legal") {
        return { id: "SC-LEGAL", grossK: 70, source: "SC statewide legal load" };
      }
      return null;
    }

    function renderRows(rows) {
      outputTable.innerHTML = "";
      for (const row of rows) {
        const tr = document.createElement("tr");
        const metric = document.createElement("td");
        metric.textContent = row.metric;
        const value = document.createElement("td");
        value.textContent = row.value;
        tr.appendChild(metric);
        tr.appendChild(value);
        outputTable.appendChild(tr);
      }
    }

    function runEvaluation() {
      const source = loadSource.value;
      const truck = activeTruck();
      const legalTruckOnly = source !== "hl93";
      const laneLoad = legalTruckOnly ? 0 : 0.64;
      const materialUse = config.materialUse || { steel: true, rebar: true, prestress: true };

      const deterioration = {
        steelPct: readRatio("steel-pct"),
        rebarPct: readRatio("rebar-pct"),
        prestressPct: readRatio("prestress-pct")
      };

      const baseline = calculateRatingCase(
        source,
        truck,
        laneLoad,
        { steelPct: 0, rebarPct: 0, prestressPct: 0 },
        materialUse
      );

      const deteriorated = calculateRatingCase(source, truck, laneLoad, deterioration, materialUse);

      const report = {
        app_id: config.appId,
        selected_truck: truck ? truck.id : "HL93-DESIGN",
        rating_cases: [baseline, deteriorated],
        controlling_output_row: {
          case: "deteriorated",
          governing_limit_state: deteriorated.governing_limit_state,
          rating_factor: deteriorated.rating_factor,
          laneLoad,
          steelPct: deteriorated.steelPct,
          rebarPct: deteriorated.rebarPct,
          prestressPct: deteriorated.prestressPct,
          moving_load_search: "enabled"
        }
      };

      renderRows([
        { metric: "App", value: config.appId },
        { metric: "Load source", value: source },
        { metric: "Selected truck", value: report.selected_truck },
        { metric: "Lane load", value: laneLoad.toFixed(2) },
        { metric: "Baseline RF", value: baseline.rating_factor.toFixed(3) },
        { metric: "Deteriorated RF", value: deteriorated.rating_factor.toFixed(3) },
        {
          metric: "RF delta",
          value: (deteriorated.rating_factor - baseline.rating_factor).toFixed(3)
        },
        { metric: "steelPct", value: formatRatio(deteriorated.steelPct) },
        { metric: "rebarPct", value: formatRatio(deteriorated.rebarPct) },
        { metric: "prestressPct", value: formatRatio(deteriorated.prestressPct) }
      ]);

      summary.textContent = `Report ready for ${config.appId}. Truck: ${report.selected_truck}; controlling RF: ${deteriorated.rating_factor.toFixed(3)}.`;
      globalScope.StrintegRatingApp = globalScope.StrintegRatingApp || {};
      globalScope.StrintegRatingApp.lastReport = report;
    }

    refreshTruckOptions();
    loadSource.addEventListener("change", refreshTruckOptions);
    byId("run-eval").addEventListener("click", runEvaluation);
    runEvaluation();
  }

  globalScope.StrintegRatingApp = globalScope.StrintegRatingApp || {};
  globalScope.StrintegRatingApp.mount = mount;
})(typeof window !== "undefined" ? window : globalThis);
