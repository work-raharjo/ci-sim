/*
 * Reference check: the sample dataset must reproduce the four reference runs
 * (X-band uplink, R vs R, victim visibility view).
 * Run: node tests/reference.js
 */
var M = require("../js/model.js");
global.window = {};
require("../js/data.js");
var data = window.CI_DEFAULT_DATA;

var REF = [
  { sat1: "ADF WEST-2", pair: "XECU|C2R", es: "37.423", min: "37.317", mid: "37.854", max: "38.391", f: "7928.00", bw: "40.00", el: "66.77" },
  { sat1: "ADF WEST-5", pair: "RX1|C2R", es: "30.702", min: "30.689", mid: "31.226", max: "31.763", f: "7945.00", bw: "90.00", el: "81.87" },
  { sat1: "DDSP-104E", pair: "RX1|C2R", es: "30.702", min: "30.689", mid: "31.226", max: "31.763", f: "7945.00", bw: "90.00", el: "81.87" },
  { sat1: "DDSP-2", pair: "RX1|C2R", es: "30.523", min: "30.417", mid: "30.954", max: "31.491", f: "7928.00", bw: "40.00", el: "66.77" }
];

function sat(n) { return data.satellites.filter(function (s) { return s.name === n; })[0]; }
var st = data.settings, fails = 0;

REF.forEach(function (r) {
  var s1 = sat(r.sat1), s2 = sat("NUSANTARA-BR1-E");
  var p = M.beamPairs(s1, s2, "UL", "X", s1.es, s2.es, st.offAxisMode)
    .filter(function (x) { return x.beam1.id + "|" + x.beam2.id === r.pair; })[0];
  var ctx = { scheme: "UL", sat1: s1, sat2: s2, beam1: p.beam1, beam2: p.beam2, es1: s1.es, es2: s2.es, offAxisMode: st.offAxisMode };
  var h = M.heatmap(ctx, "V1", st.gridStepDeg, st.minElevationDeg);
  var got = {
    es: p.esCI.toFixed(3), min: h.min.toFixed(3), mid: ((h.min + h.max) / 2).toFixed(3), max: h.max.toFixed(3),
    f: p.overlap.centre.toFixed(2), bw: p.overlap.bw.toFixed(2), el: (Math.round(p.esResult.el1 * 100) / 100).toFixed(2), cells: h.cells.length
  };
  var ok = ["es", "min", "mid", "max", "f", "bw", "el"].every(function (k) { return got[k] === r[k]; }) && got.cells === 1081;
  if (!ok) fails++;
  console.log((ok ? "PASS " : "FAIL ") + r.sat1 + " " + r.pair + "  " + JSON.stringify(got));
});
process.exit(fails ? 1 : 0);
