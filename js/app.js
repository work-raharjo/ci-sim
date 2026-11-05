/* C/I Simulator - user interface */
(function () {
  "use strict";
  var M = window.CIModel;
  var STORE_KEY = "ci-sim-data-v1";

  /* ---------- data ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadData() {
    try {
      var s = localStorage.getItem(STORE_KEY);
      if (s) { var d = JSON.parse(s); validate(d); return d; }
    } catch (e) { /* fall back to default */ }
    return clone(window.CI_DEFAULT_DATA);
  }
  function saveData(d) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } }
  function clearData() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }

  function validate(d) {
    if (!d || !Array.isArray(d.satellites) || d.satellites.length < 2) throw new Error("At least two satellites are required in \"satellites\".");
    d.settings = Object.assign({ gridStepDeg: 4, minElevationDeg: 10, offAxisMode: "cell" }, d.settings || {});
    var names = {};
    d.satellites.forEach(function (s, i) {
      if (!s.name) throw new Error("Satellite #" + (i + 1) + " has no name.");
      if (names[s.name]) throw new Error("Duplicate satellite name: " + s.name);
      names[s.name] = true;
      if (typeof s.lon !== "number") throw new Error(s.name + ": \"lon\" must be a number.");
      if (!s.es || typeof s.es.lat !== "number" || typeof s.es.lon !== "number") throw new Error(s.name + ": \"es\" needs numeric lat and lon.");
      if (!Array.isArray(s.beams)) throw new Error(s.name + ": \"beams\" must be an array.");
      s.beams.forEach(function (b) {
        if (!b.id || (b.dir !== "R" && b.dir !== "T")) throw new Error(s.name + ": every beam needs an id and dir \"R\" or \"T\".");
        if (!Array.isArray(b.assignments)) throw new Error(s.name + " " + b.id + ": \"assignments\" must be [[fmin, fmax], ...].");
        b.es = b.es || {};
        if (typeof b.es.gmax !== "number") throw new Error(s.name + " " + b.id + ": es.gmax is required.");
        if (b.dir === "R" && typeof b.es.pd !== "number") throw new Error(s.name + " " + b.id + ": es.pd is required for receive (uplink) beams.");
        if (b.dir === "T" && typeof b.eirpd !== "number") throw new Error(s.name + " " + b.id + ": eirpd is required for transmit (downlink) beams.");
      });
    });
    return d;
  }

  var data = loadData();
  var esMoved = {}; // satellite name -> {lat, lon} after dragging on the map

  /* ---------- map ---------- */
  var map = L.map("map", { zoomSnap: 0.25, zoomDelta: 0.5, worldCopyJump: false, minZoom: 1.5 }).setView([5, 110], 2.25);
  var tiles = {};
  ["m", "y"].forEach(function (lyr) {
    tiles[lyr] = L.tileLayer("https://{s}.google.com/vt/lyrs=" + lyr + "&x={x}&y={y}&z={z}", {
      subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 20, attribution: "Google"
    });
  });
  tiles.y.addTo(map);
  L.control.scale({ position: "bottomleft" }).addTo(map);

  var heatLayer = L.layerGroup().addTo(map);
  var linkLayer = L.layerGroup().addTo(map);
  var markerLayer = L.layerGroup().addTo(map);

  document.querySelectorAll('input[name="basemap"]').forEach(function (r) {
    r.addEventListener("change", function () {
      Object.keys(tiles).forEach(function (k) { map.removeLayer(tiles[k]); });
      tiles[r.value].addTo(map);
    });
  });

  /* ---------- icons ---------- */
  var BLUE = "#38a9dc", RED = "#d33d29";
  var GLYPH_SAT = '<g transform="rotate(-45 15 14)" fill="#fff">' +
    '<rect x="12" y="11" width="6" height="6" rx="1"/>' +
    '<rect x="4" y="12" width="7" height="4"/><rect x="19" y="12" width="7" height="4"/>' +
    '<rect x="14.2" y="7.5" width="1.6" height="3.5"/><circle cx="15" cy="7" r="1.4"/></g>';
  var GLYPH_ES = '<g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round">' +
    '<path d="M8.5 11.5a7.5 7.5 0 0 0 10 10z" fill="#fff" stroke="none"/>' +
    '<path d="M13.5 16.5l4-4"/><path d="M17.5 8.5a4 4 0 0 1 4 4"/><path d="M17.8 5.2a7.3 7.3 0 0 1 7 7"/></g>';
  function pinIcon(color, glyph) {
    var svg = '<svg class="pin" width="32" height="44" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M15 1C7.3 1 1 7.2 1 14.9c0 9.9 14 26.1 14 26.1s14-16.2 14-26.1C29 7.2 22.7 1 15 1z" fill="' + color + '" stroke="rgba(0,0,0,.25)" stroke-width="1"/>' +
      glyph + "</svg>";
    return L.divIcon({ html: svg, className: "", iconSize: [32, 44], iconAnchor: [16, 43], tooltipAnchor: [0, -38] });
  }

  /* ---------- colour scale ---------- */
  var STOPS = [[0, [120, 0, 0]], [0.12, [141, 1, 2]], [0.24, [178, 0, 0]], [0.36, [212, 0, 3]], [0.46, [245, 1, 3]],
    [0.54, [255, 30, 0]], [0.62, [255, 72, 0]], [0.72, [255, 113, 1]], [0.81, [255, 152, 0]], [0.89, [255, 185, 2]],
    [0.95, [253, 221, 0]], [1, [255, 245, 40]]];
  function colour(t) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], u = (t - a[0]) / (b[0] - a[0] || 1);
        var c = a[1].map(function (v, k) { return Math.round(v + (b[1][k] - v) * u); });
        return "rgb(" + c.join(",") + ")";
      }
    }
    return "rgb(255,245,40)";
  }

  /* ---------- selects ---------- */
  var el = function (id) { return document.getElementById(id); };
  var selSat1 = el("selSat1"), selSat2 = el("selSat2"), selBand = el("selBand"),
      selScheme = el("selScheme"), selPair = el("selPair"), selView = el("selView");

  function fill(sel, items, keep) {
    var prev = keep ? sel.value : null;
    sel.innerHTML = "";
    items.forEach(function (it) {
      var o = document.createElement("option");
      o.value = it.value; o.textContent = it.label;
      sel.appendChild(o);
    });
    if (prev !== null && items.some(function (it) { return String(it.value) === prev; })) sel.value = prev;
    sel.disabled = items.length === 0 || (items.length === 1 && items[0].value === "");
  }

  function sat(name) { return data.satellites.filter(function (s) { return s.name === name; })[0]; }
  function esOf(s) { return esMoved[s.name] || { lat: s.es.lat, lon: s.es.lon }; }
  function fmt(x, n) { return x === null || !isFinite(x) ? "n/a" : x.toFixed(n === undefined ? 3 : n); }
  function fmtF(x) { return (Math.round(x * 100) / 100).toFixed(2); }

  function refreshSat1() {
    fill(selSat1, data.satellites.map(function (s) { return { value: s.name, label: s.name }; }), true);
    refreshSat2();
  }
  function refreshSat2() {
    var s1 = selSat1.value;
    var others = data.satellites.filter(function (s) { return s.name !== s1; });
    var prefer = selSat2.value;
    fill(selSat2, others.map(function (s) { return { value: s.name, label: s.name }; }), true);
    if (!prefer && others.some(function (s) { return s.name === "NUSANTARA-BR1-E"; })) selSat2.value = "NUSANTARA-BR1-E";
    refreshBand();
  }
  function refreshBand() {
    var bands = M.overlapBands(sat(selSat1.value), sat(selSat2.value));
    fill(selBand, bands.length ? bands.map(function (b) { return { value: b.id, label: b.name }; })
      : [{ value: "", label: "No overlapping band" }], true);
    refreshPairs();
  }
  var pairs = [];
  function refreshPairs() {
    var s1 = sat(selSat1.value), s2 = sat(selSat2.value);
    pairs = selBand.value ? M.beamPairs(s1, s2, selScheme.value, selBand.value, esOf(s1), esOf(s2), data.settings.offAxisMode) : [];
    var prevKey = selPair.value;
    fill(selPair, pairs.length ? pairs.map(function (p, i) {
      return { value: p.beam1.id + "|" + p.beam2.id, label: p.beam1.id + " vs " + p.beam2.id + " (ES C/I: " + fmt(p.esCI) + " dB)" };
    }) : [{ value: "", label: "No overlapping beam pair" }], false);
    if (prevKey && pairs.some(function (p) { return p.beam1.id + "|" + p.beam2.id === prevKey; })) selPair.value = prevKey;
    run();
  }

  /* ---------- run ---------- */
  var lastFitKey = "";
  function run() {
    heatLayer.clearLayers(); linkLayer.clearLayers(); markerLayer.clearLayers();
    var s1 = sat(selSat1.value), s2 = sat(selSat2.value);
    var scheme = selScheme.value, view = selView.value;
    var schemeObj = M.SCHEMES.filter(function (x) { return x.id === scheme; })[0];
    var viewObj = M.VIEWS.filter(function (x) { return x.id === view; })[0];
    var es1 = esOf(s1), es2 = esOf(s2);
    var pair = pairs.filter(function (p) { return p.beam1.id + "|" + p.beam2.id === selPair.value; })[0];

    el("legendTitle").textContent = "C/I Legend (" + schemeObj.label + " - " + viewObj.short + ")";

    drawMarkers(s1, s2, es1, es2, scheme);

    if (!pair) {
      el("legMin").textContent = "-"; el("legMid").textContent = "-"; el("legMax").textContent = "-";
      el("legNoPath").hidden = true;
      el("summary").innerHTML = '<div class="h">Active Scenario Summary:</div>' +
        "<div>No beam pair of " + esc(s1.name) + " and " + esc(s2.name) + " overlaps for this band and scheme.</div>" +
        "<div>Select another band or scheme, or add beams in the satellite data.</div>";
      return;
    }

    var ctx = { scheme: scheme, sat1: s1, sat2: s2, beam1: pair.beam1, beam2: pair.beam2, es1: es1, es2: es2, offAxisMode: data.settings.offAxisMode };
    var st = data.settings;
    var hm = M.heatmap(ctx, view, st.gridStepDeg, st.minElevationDeg);
    var span = hm.max - hm.min, half = st.gridStepDeg / 2, noPath = 0;

    hm.cells.forEach(function (c) {
      var ok = c.ci !== null;
      if (!ok) noPath++;
      var rect = L.rectangle([[c.lat - half, c.lon - half], [c.lat + half, c.lon + half]], {
        stroke: false, fillColor: ok ? colour(span > 0 ? (c.ci - hm.min) / span : 1) : "#969696",
        fillOpacity: ok ? 0.55 : 0.35, interactive: true
      });
      rect.bindTooltip(function () { return cellTip(c, scheme); }, { sticky: true, className: "cell-tip", direction: "top", offset: [0, -6] });
      heatLayer.addLayer(rect);
    });

    var valid = isFinite(hm.min);
    el("legMin").textContent = valid ? fmt(hm.min) + " dB (Lowest)" : "-";
    el("legMid").textContent = valid ? fmt((hm.min + hm.max) / 2) + " dB" : "-";
    el("legMax").textContent = valid ? fmt(hm.max) + " dB (Best)" : "-";
    el("legNoPath").hidden = noPath === 0;

    // summary
    var ov = pair.overlap, r = pair.esResult;
    var subj = scheme === "UL"
      ? "Simulated ES 2 Location (Interferer: " + esc(s2.name) + ")"
      : "Simulated ES 1 Location (Victim: " + esc(s1.name) + ")";
    var horizon;
    if (scheme === "UL") {
      horizon = r.el1 >= 0
        ? "Visible (LoS above ES 2 horizon, Elevation to Sat 1: " + fmtF(r.el1) + "&deg;)"
        : "Not visible (Sat 1 below ES 2 horizon, Elevation: " + fmtF(r.el1) + "&deg;)";
    } else {
      horizon = r.el2 >= 0
        ? "Visible (LoS above ES 1 horizon, Elevation to Sat 2: " + fmtF(r.el2) + "&deg;)"
        : "Not visible (Sat 2 below ES 1 horizon, Elevation: " + fmtF(r.el2) + "&deg;)";
    }
    el("summary").innerHTML =
      '<div class="h">Active Scenario Summary:</div>' +
      "<div>&bull; <b>Scheme:</b> " + schemeObj.label + "</div>" +
      "<div>&bull; <b>Map Iteration Subject:</b> " + subj + "</div>" +
      "<div>&bull; <b>Coverage View:</b> " + viewObj.short + " (" + hm.cells.length + " cells)</div>" +
      "<div>&bull; <b>Centre Frequency:</b> " + ov.centre.toFixed(2) + " MHz (BW: " + ov.bw.toFixed(2) + " MHz)</div>" +
      "<div>&bull; <b>Pattern Sat 1 / Sat 2:</b> " + esc(pair.beam1.es.pattern || "AP8") + " / " + esc(pair.beam2.es.pattern || "AP8") + "</div>" +
      "<div>&bull; <b>Input ES Horizon Status:</b> " + horizon + "</div>";

    drawLinks(s1, s2, es1, es2, scheme);

    var fitKey = s1.name + "|" + s2.name + "|" + view + "|" + scheme;
    if (fitKey !== lastFitKey && hm.cells.length) {
      lastFitKey = fitKey;
      var b = L.latLngBounds(hm.cells.map(function (c) { return [c.lat, c.lon]; }));
      var wide = window.innerWidth > 900;
      map.fitBounds(b, { paddingTopLeft: [10, 10], paddingBottomRight: [wide ? 450 : 10, 10] });
    }
  }

  function cellTip(c, scheme) {
    var who = scheme === "UL" ? "ES 2 (interferer)" : "ES 1 (victim)";
    var h = "<b>" + who + " at " + c.lat.toFixed(1) + "&deg;, " + normLon(c.lon).toFixed(1) + "&deg;</b><br>";
    h += c.ci !== null ? "C/I: <b>" + c.ci.toFixed(3) + " dB</b><br>" : c.reason + "<br>";
    h += "Elevation to Sat 1: " + c.el1.toFixed(2) + "&deg;<br>Elevation to Sat 2: " + c.el2.toFixed(2) + "&deg;<br>";
    h += "Off-axis angle: " + c.theta.toFixed(2) + "&deg; (gain " + c.gOff.toFixed(2) + " dBi)";
    return h;
  }
  function normLon(x) { x = ((x + 180) % 360 + 360) % 360 - 180; return x; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }

  /* Keep markers and lines on the same world copy as the heatmap. */
  function nearLon(lon, ref) { while (lon - ref > 180) lon -= 360; while (lon - ref < -180) lon += 360; return lon; }

  function drawMarkers(s1, s2, es1, es2, scheme) {
    var ref = selView.value === "V2" ? s2.lon : s1.lon;
    var items = [
      { ll: [0, nearLon(s1.lon, ref)], c: BLUE, g: GLYPH_SAT, t: "Satellite 1 (Victim): " + s1.name + " @ " + s1.lon + "&deg;E" },
      { ll: [0, nearLon(s2.lon, ref)], c: RED, g: GLYPH_SAT, t: "Satellite 2 (Interferer): " + s2.name + " @ " + s2.lon + "&deg;E" },
      { ll: [es1.lat, nearLon(es1.lon, ref)], c: BLUE, g: GLYPH_ES, t: "ES 1 (Victim, " + s1.name + ")", drag: s1.name },
      { ll: [es2.lat, nearLon(es2.lon, ref)], c: RED, g: GLYPH_ES, t: "ES 2 (Interferer, " + s2.name + ")", drag: s2.name }
    ];
    items.forEach(function (it) {
      var m = L.marker(it.ll, { icon: pinIcon(it.c, it.g), draggable: !!it.drag, zIndexOffset: it.drag ? 500 : 0 });
      m.bindTooltip(function () {
        var p = m.getLatLng();
        return it.t + "<br>" + p.lat.toFixed(3) + "&deg;, " + normLon(p.lng).toFixed(3) + "&deg;" + (it.drag ? "<br><i>Drag to move this earth station</i>" : "");
      }, { direction: "top" });
      if (it.drag) {
        m.on("dragend", function () {
          var p = m.getLatLng();
          esMoved[it.drag] = { lat: Math.max(-89, Math.min(89, p.lat)), lon: normLon(p.lng) };
          refreshPairs();
        });
      }
      markerLayer.addLayer(m);
    });
  }

  function drawLinks(s1, s2, es1, es2, scheme) {
    var ref = selView.value === "V2" ? s2.lon : s1.lon;
    var S1 = [0, nearLon(s1.lon, ref)], S2 = [0, nearLon(s2.lon, ref)];
    var E1 = [es1.lat, nearLon(es1.lon, ref)], E2 = [es2.lat, nearLon(es2.lon, ref)];
    var o = function (col) { return { color: col, weight: 3, dashArray: "9 7", interactive: false, opacity: 0.95 }; };
    linkLayer.addLayer(L.polyline([E1, S1], o("#1e5ae6")));
    if (scheme === "UL") {
      linkLayer.addLayer(L.polyline([E2, S1], o("#dc1414")));
      linkLayer.addLayer(L.polyline([E2, S2], o("#777")));
      el("greyLabel").textContent = "Satellite 2 Reference Link";
    } else {
      linkLayer.addLayer(L.polyline([S2, E1], o("#dc1414")));
      linkLayer.addLayer(L.polyline([E2, S2], o("#777")));
      el("greyLabel").textContent = "Satellite 2 Reference Link";
    }
  }

  /* ---------- wiring ---------- */
  fill(selScheme, M.SCHEMES.map(function (s) { return { value: s.id, label: s.label }; }));
  selScheme.value = "UL";
  fill(selView, M.VIEWS.map(function (v) { return { value: v.id, label: v.label }; }));

  selSat1.addEventListener("change", refreshSat2);
  selSat2.addEventListener("change", refreshBand);
  selBand.addEventListener("change", refreshPairs);
  selScheme.addEventListener("change", refreshPairs);
  selPair.addEventListener("change", run);
  selView.addEventListener("change", run);

  /* ---------- data editor ---------- */
  var modal = el("modal"), txt = el("dataText"), msg = el("dataMsg");
  function openModal() { txt.value = JSON.stringify(data, null, 2); msg.textContent = ""; msg.className = "modal-msg"; modal.hidden = false; txt.focus(); }
  function closeModal() { modal.hidden = true; }
  function applyData(d, note) {
    validate(d);
    data = d; esMoved = {}; lastFitKey = "";
    saveData(data);
    selSat2.value = "";
    refreshSat1();
    msg.textContent = note || "Applied."; msg.className = "modal-msg ok";
  }
  el("btnData").addEventListener("click", openModal);
  el("btnClose").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
  el("btnApply").addEventListener("click", function () {
    try { applyData(JSON.parse(txt.value)); } catch (e) { msg.textContent = e.message; msg.className = "modal-msg err"; }
  });
  el("btnReset").addEventListener("click", function () {
    clearData(); var d = clone(window.CI_DEFAULT_DATA); txt.value = JSON.stringify(d, null, 2);
    applyData(d, "Sample data restored."); clearData();
  });
  el("btnDownload").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ci-sim-data.json";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  el("fileInput").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try { var d = JSON.parse(rd.result); txt.value = JSON.stringify(d, null, 2); applyData(d, "Loaded " + f.name + "."); }
      catch (err) { msg.textContent = err.message; msg.className = "modal-msg err"; }
      e.target.value = "";
    };
    rd.readAsText(f);
  });

  /* ---------- start ---------- */
  refreshSat1();
  if (data.satellites.some(function (s) { return s.name === "ADF WEST-2"; }) && selSat1.value !== "ADF WEST-2") {
    selSat1.value = "ADF WEST-2"; refreshSat2();
  }
})();
