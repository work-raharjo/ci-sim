# C/I Simulator

Web simulator for carrier-to-interference ratio (C/I) between two GSO satellite networks. It computes C/I for each overlapping beam pair and draws a heatmap of C/I as an earth station location is moved across the visibility area of a satellite.

Static site (HTML, CSS, JavaScript, Leaflet). There is no build step, so it deploys to Vercel as-is.

## Panels

**C/I Scenario Selection** (right panel)
1. Satellite 1 (victim / reference)
2. Satellite 2 (interferer / comparison)
3. Overlapping frequency band, derived from the beam frequency assignments
4. Interference scheme: `1. Downlink (T vs T)` or `2. Uplink (R vs R)`
5. Beam pair, with the C/I at the input earth station
6. Heatmap view: victim visibility, interferer visibility or common visibility

**Active Scenario Summary** lists the scheme, the map iteration subject, the number of grid cells, the centre frequency and bandwidth of the overlap, the earth station patterns, and the horizon check for the input earth station.

**C/I Legend** (bottom left) shows the colour scale from the lowest C/I (dark red) to the best C/I (bright yellow), and the link lines.

You can drag the earth station markers (ES 1 in blue, ES 2 in red) on the map. When you drop one, the beam pair C/I values recalculate.

## Method

- Geometry: spherical Earth (R = 6 371 km), GSO radius 42 164 km. Satellites are placed at their sub-satellite points.
- Grid: lat/lon cells (default 4°), centred on the sub-satellite point of the satellite whose visibility is shown. A cell counts as visible when its elevation is at least the minimum elevation (default 10°).
- Uplink (R vs R): the map iterates the location of ES 2 (interferer).
  - `C = pd1 + Gmax1 - 20 log d(ES1, Sat1)`
  - `I = pd2 + G2(theta) - 20 log d(cell, Sat1)`
  - `theta` is the topocentric angle between Satellite 2 (where ES 2 points) and Satellite 1.
- Downlink (T vs T): the map iterates the location of ES 1 (victim).
  - `C = EIRPd1 - 20 log d(cell, Sat1) + Gmax1`
  - `I = EIRPd2 - 20 log d(cell, Sat2) + G1(theta)`
- Earth station patterns: `AP8` (RR Appendix 8, Annex III), `S465` or `ISO`. D/λ is estimated from the peak gain.
- Power values are densities (dBW/Hz), so the C/I does not depend on bandwidth. The satellite receive gain and the frequency term of free-space loss cancel because both paths share the same receiver and frequency.
- `settings.offAxisMode`:
  - `"cell"` computes the off-axis gain for every grid cell.
  - `"input"` holds it at the value for the input earth station.

## Data

The **Edit satellite data** link under the panel opens a JSON editor. From there you can apply edits, download the dataset, load a JSON file, or reset to the sample data. Edits are kept in the browser's local storage. The schema is documented at the top of `js/data.js`.

The sample dataset covers ADF WEST-2, ADF WEST-5, DDSP-104E and DDSP-2 against NUSANTARA-BR1-E (X-band uplink). Its earth station power densities and gains were back-calculated so that the four reference runs reproduce exactly. They are **not** SRS values. Replace them with filing data before using the results.

## Check

```
node tests/reference.js
```

This checks the sample dataset against the four reference runs: ES C/I, lowest, mid and best C/I, centre frequency, bandwidth, elevation, and 1 081 cells.

## Deploy

Import the repository in Vercel and use the "Other" framework preset with no build command. The output directory is the repository root.
