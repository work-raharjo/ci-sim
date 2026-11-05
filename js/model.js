/*
 * C/I Simulator - calculation model
 * Pure functions, no DOM. Works in the browser (window.CIModel) and in Node (module.exports).
 *
 * Geometry : spherical Earth (R = 6371 km), GSO radius 42 164 km.
 * C/I      : power densities in dBW/Hz, so the result is independent of bandwidth.
 *            Satellite antenna gains and free-space loss frequency terms cancel because
 *            the wanted and interfering paths share the same receiver and frequency.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CIModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RE = 6371.0;
  var RGSO = 42164.0;
  var D2R = Math.PI / 180;
  var R2D = 180 / Math.PI;

  var BANDS = [
    { id: "UHF", name: "UHF-Band", min: 300, max: 1000 },
    { id: "L", name: "L-Band", min: 1000, max: 2000 },
    { id: "S", name: "S-Band", min: 2000, max: 3400 },
    { id: "C", name: "C-Band", min: 3400, max: 7100 },
    { id: "X", name: "X-Band", min: 7100, max: 8500 },
    { id: "Ku", name: "Ku-Band", min: 10700, max: 14800 },
    { id: "Ka", name: "Ka-Band", min: 17000, max: 31000 },
    { id: "QV", name: "Q/V-Band", min: 37000, max: 52400 }
  ];

  var SCHEMES = [
    { id: "DL", label: "1. Downlink (T vs T)", dir: "T" },
    { id: "UL", label: "2. Uplink (R vs R)", dir: "R" }
  ];

  var VIEWS = [
    { id: "V1", label: "1. Victim Visibility (Satellite 1 Visibility)", short: "Victim Visibility" },
    { id: "V2", label: "2. Interferer Visibility (Satellite 2 Visibility)", short: "Interferer Visibility" },
    { id: "V3", label: "3. Common Visibility (Satellites 1 and 2)", short: "Common Visibility" }
  ];

  /* ---------- vectors ---------- */
  function ecef(lat, lon, radius) {
    var la = lat * D2R, lo = lon * D2R, r = radius || RE;
    return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
  }
  function satPos(lon) { return ecef(0, lon, RGSO); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /** Elevation (deg) and slant range (km) from a ground point to a GSO satellite. */
  function look(lat, lon, satLon) {
    var p = ecef(lat, lon), v = sub(satPos(satLon), p);
    var d = norm(v);
    var el = Math.asin(clamp(dot(v, p) / (d * RE), -1, 1)) * R2D;
    return { el: el, d: d };
  }

  /** Topocentric angle (deg) between two GSO satellites as seen from a ground point. */
  function separation(lat, lon, satLonA, satLonB) {
    var p = ecef(lat, lon);
    var a = sub(satPos(satLonA), p), b = sub(satPos(satLonB), p);
    return Math.acos(clamp(dot(a, b) / (norm(a) * norm(b)), -1, 1)) * R2D;
  }

  function log10(x) { return Math.log(x) / Math.LN10; }

  /* ---------- earth station antenna patterns ---------- */
  /** D/lambda estimated from peak gain (eta = 0.7): 20 log(D/lambda) = Gmax - 7.7 */
  function dOverLambda(gmax) { return Math.pow(10, (gmax - 7.7) / 20); }

  /** ITU RR Appendix 8, Annex III reference earth station pattern. */
  function gainAP8(phi, gmax) {
    var dl = dOverLambda(gmax);
    phi = Math.abs(phi);
    if (dl >= 100) {
      var g1 = 2 + 15 * log10(dl);
      var phiM = (20 / dl) * Math.sqrt(Math.max(gmax - g1, 0));
      var phiR = 15.85 * Math.pow(dl, -0.6);
      if (phi < phiM) return gmax - 2.5e-3 * Math.pow(dl * phi, 2);
      if (phi < phiR) return g1;
      if (phi < 48) return 32 - 25 * log10(phi);
      return -10;
    } else {
      var g1b = -18 + 25 * log10(dl);
      var phiMb = (20 / dl) * Math.sqrt(Math.max(gmax - g1b, 0));
      if (phi < phiMb) return gmax - 2.5e-3 * Math.pow(dl * phi, 2);
      if (phi < 100 / dl) return g1b;
      if (phi < 48) return 52 - 10 * log10(dl) - 25 * log10(phi);
      return 10 - 10 * log10(dl);
    }
  }

  /** ITU-R S.465 reference pattern (sidelobe envelope, main lobe at Gmax). */
  function gainS465(phi, gmax) {
    var dl = dOverLambda(gmax);
    var phiMin = dl >= 50 ? Math.max(1, 100 / dl) : Math.max(2, 114 * Math.pow(dl, -1.09));
    phi = Math.abs(phi);
    if (phi < phiMin) return gmax;
    if (phi < 48) return Math.min(gmax, 32 - 25 * log10(phi));
    return -10;
  }

  function esGain(pattern, phi, gmax) {
    switch (String(pattern || "AP8").toUpperCase()) {
      case "S465": case "S.465": return gainS465(phi, gmax);
      case "ISO": case "ISOTROPIC": return 0;
      default: return gainAP8(phi, gmax);
    }
  }

  /* ---------- frequency ---------- */
  function bandOf(fMHz) {
    for (var i = 0; i < BANDS.length; i++) if (fMHz >= BANDS[i].min && fMHz < BANDS[i].max) return BANDS[i];
    return null;
  }
  function intersect(a, b) {
    var lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]);
    return hi > lo ? [lo, hi] : null;
  }
  /** Largest frequency overlap between two beams inside a band. */
  function beamOverlap(beamA, beamB, band) {
    var best = null;
    (beamA.assignments || []).forEach(function (a) {
      (beamB.assignments || []).forEach(function (b) {
        var x = intersect(a, b);
        if (!x) return;
        var bd = bandOf((x[0] + x[1]) / 2);
        if (band && (!bd || bd.id !== band)) return;
        if (!best || x[1] - x[0] > best[1] - best[0]) best = x;
      });
    });
    return best ? { fmin: best[0], fmax: best[1], centre: (best[0] + best[1]) / 2, bw: best[1] - best[0] } : null;
  }

  /** Bands in which any beams of the two satellites overlap. */
  function overlapBands(sat1, sat2) {
    var ids = {};
    sat1.beams.forEach(function (b1) {
      sat2.beams.forEach(function (b2) {
        (b1.assignments || []).forEach(function (a) {
          (b2.assignments || []).forEach(function (b) {
            var x = intersect(a, b);
            if (x) { var bd = bandOf((x[0] + x[1]) / 2); if (bd) ids[bd.id] = true; }
          });
        });
      });
    });
    return BANDS.filter(function (b) { return ids[b.id]; });
  }

  /* ---------- C/I ---------- */
  /**
   * ctx = { scheme, sat1, sat2, beam1, beam2, es1:{lat,lon}, es2:{lat,lon}, offAxisMode }
   * Returns a function (lat, lon) -> result for a simulated earth station at that point.
   *  Uplink (R vs R): the simulated point is ES 2 (interferer). Victim receiver = Satellite 1.
   *  Downlink (T vs T): the simulated point is ES 1 (victim receiver).
   */
  function makeEvaluator(ctx) {
    var s1 = ctx.sat1.lon, s2 = ctx.sat2.lon;
    var b1 = ctx.beam1, b2 = ctx.beam2;
    var e1 = b1.es || {}, e2 = b2.es || {};

    if (ctx.scheme === "UL") {
      var l1 = look(ctx.es1.lat, ctx.es1.lon, s1);
      var C = e1.pd + e1.gmax - 20 * log10(l1.d);
      var fixedTheta = separation(ctx.es2.lat, ctx.es2.lon, s2, s1);
      var fixedG = esGain(e2.pattern, fixedTheta, e2.gmax);
      return function (lat, lon) {
        var lk1 = look(lat, lon, s1), lk2 = look(lat, lon, s2);
        var theta = ctx.offAxisMode === "input" ? fixedTheta : separation(lat, lon, s2, s1);
        var g = ctx.offAxisMode === "input" ? fixedG : esGain(e2.pattern, theta, e2.gmax);
        var res = { el1: lk1.el, el2: lk2.el, theta: theta, gOff: g };
        if (lk1.el < 0) { res.ci = null; res.reason = "No interference path (Satellite 1 below horizon)"; return res; }
        var I = e2.pd + g - 20 * log10(lk1.d);
        res.ci = C - I;
        return res;
      };
    }
    // Downlink
    return function (lat, lon) {
      var lk1 = look(lat, lon, s1), lk2 = look(lat, lon, s2);
      var theta = separation(lat, lon, s1, s2);
      var g = esGain(e1.pattern, theta, e1.gmax);
      var res = { el1: lk1.el, el2: lk2.el, theta: theta, gOff: g };
      if (lk1.el < 0) { res.ci = null; res.reason = "No wanted link (Satellite 1 below horizon)"; return res; }
      if (lk2.el < 0) { res.ci = null; res.reason = "No interference path (Satellite 2 below horizon)"; return res; }
      var C = b1.eirpd - 20 * log10(lk1.d) + e1.gmax;
      var I = b2.eirpd - 20 * log10(lk2.d) + g;
      res.ci = C - I;
      return res;
    };
  }

  /** Lat/lon grid centred on a sub-satellite point. */
  function grid(centreLon, step) {
    var cells = [], nLat = Math.floor((90 - step / 2) / step), nLon = Math.round(360 / step);
    for (var i = -nLat; i <= nLat; i++) {
      for (var j = -Math.floor(nLon / 2); j < nLon - Math.floor(nLon / 2); j++) {
        cells.push({ lat: i * step, lon: centreLon + j * step });
      }
    }
    return cells;
  }

  /** Compute the heatmap for a scenario. */
  function heatmap(ctx, view, step, minEl) {
    var ev = makeEvaluator(ctx);
    var centre = view === "V2" ? ctx.sat2.lon : ctx.sat1.lon;
    var out = [], min = Infinity, max = -Infinity;
    grid(centre, step).forEach(function (c) {
      var lk1 = look(c.lat, c.lon, ctx.sat1.lon), lk2 = look(c.lat, c.lon, ctx.sat2.lon);
      var in1 = lk1.el >= minEl, in2 = lk2.el >= minEl;
      var keep = view === "V1" ? in1 : view === "V2" ? in2 : in1 && in2;
      if (!keep) return;
      var r = ev(c.lat, c.lon);
      r.lat = c.lat; r.lon = c.lon;
      if (r.ci !== null) { min = Math.min(min, r.ci); max = Math.max(max, r.ci); }
      out.push(r);
    });
    return { cells: out, min: min, max: max };
  }

  /** Enumerate beam pairs for scheme + band with C/I at the input earth station. */
  function beamPairs(sat1, sat2, schemeId, bandId, es1, es2, offAxisMode) {
    var dir = schemeId === "UL" ? "R" : "T";
    var pairs = [];
    sat1.beams.forEach(function (b1) {
      if (b1.dir !== dir) return;
      sat2.beams.forEach(function (b2) {
        if (b2.dir !== dir) return;
        var ov = beamOverlap(b1, b2, bandId);
        if (!ov) return;
        var ctx = { scheme: schemeId, sat1: sat1, sat2: sat2, beam1: b1, beam2: b2, es1: es1, es2: es2, offAxisMode: offAxisMode };
        var inp = schemeId === "UL" ? es2 : es1;
        var r = makeEvaluator(ctx)(inp.lat, inp.lon);
        pairs.push({ beam1: b1, beam2: b2, overlap: ov, esCI: r.ci, esResult: r });
      });
    });
    return pairs;
  }

  return {
    RE: RE, RGSO: RGSO, BANDS: BANDS, SCHEMES: SCHEMES, VIEWS: VIEWS,
    look: look, separation: separation, gainAP8: gainAP8, gainS465: gainS465, esGain: esGain,
    bandOf: bandOf, beamOverlap: beamOverlap, overlapBands: overlapBands,
    makeEvaluator: makeEvaluator, grid: grid, heatmap: heatmap, beamPairs: beamPairs
  };
});
