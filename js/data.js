/*
 * Default dataset.
 *
 * IMPORTANT: the earth station power densities and gains below are SAMPLE values.
 * They were back-calculated so that the four reference runs (ADF WEST-2, ADF WEST-5,
 * DDSP-104E and DDSP-2 vs NUSANTARA-BR1-E, X-band uplink) reproduce the reference
 * C/I results. Replace them with values from the ITU SRS / filing data before using
 * the results for coordination.
 *
 * Schema
 *   settings.gridStepDeg      grid cell size in degrees (lat and lon)
 *   settings.minElevationDeg  minimum elevation for a cell to count as visible
 *   settings.offAxisMode      "cell"  : interferer ES off-axis gain computed for every grid cell
 *                             "input" : off-axis gain held at the input earth station value
 *   satellites[].lon          GSO orbital position (deg E, negative = W)
 *   satellites[].es           earth station location used as the input ES for this network
 *   beams[].dir               "R" (satellite receive, uplink) or "T" (satellite transmit, downlink)
 *   beams[].assignments       [[fmin, fmax], ...] in MHz
 *   beams[].es.pattern        "AP8" (RR Appendix 8), "S465" or "ISO"
 *   beams[].es.gmax           earth station antenna peak gain (dBi)
 *   beams[].es.pd             uplink only: max power density into the ES antenna (dBW/Hz)
 *   beams[].eirpd             downlink only: satellite peak EIRP density (dBW/Hz)
 */
window.CI_DEFAULT_DATA = {
  meta: {
    title: "C/I Simulator sample dataset",
    note: "Sample values calibrated to the reference runs. Replace with SRS data."
  },
  settings: {
    gridStepDeg: 4,
    minElevationDeg: 10,
    offAxisMode: "cell"
  },
  satellites: [
    {
      name: "NUSANTARA-BR1-E",
      lon: 150.5,
      es: { name: "ES 2 Jakarta", lat: -6.31, lon: 106.82 },
      beams: [
        { id: "C2R", dir: "R", assignments: [[7900, 7990], [7908, 7948]], es: { pattern: "AP8", gmax: 52, pd: -57 } }
      ]
    },
    {
      name: "ADF WEST-2",
      lon: 88.0,
      es: { name: "ES 1 Canberra area", lat: -35.3, lon: 149.1 },
      beams: [
        { id: "XECU", dir: "R", assignments: [[7908, 7948]], es: { pattern: "AP8", gmax: 30, pd: -58.7005 } }
      ]
    },
    {
      name: "ADF WEST-5",
      lon: 104.0,
      es: { name: "ES 1 Canberra area", lat: -35.3, lon: 149.1 },
      beams: [
        { id: "RX1", dir: "R", assignments: [[7900, 7990]], es: { pattern: "AP8", gmax: 30, pd: -65.6005 } }
      ]
    },
    {
      name: "DDSP-104E",
      lon: 104.0,
      es: { name: "ES 1 Canberra area", lat: -35.3, lon: 149.1 },
      beams: [
        { id: "RX1", dir: "R", assignments: [[7900, 7990]], es: { pattern: "AP8", gmax: 30, pd: -65.6005 } }
      ]
    },
    {
      name: "DDSP-2",
      lon: 88.0,
      es: { name: "ES 1 Canberra area", lat: -35.3, lon: 149.1 },
      beams: [
        { id: "RX1", dir: "R", assignments: [[7908, 7948]], es: { pattern: "AP8", gmax: 30, pd: -65.6005 } }
      ]
    }
  ]
};
