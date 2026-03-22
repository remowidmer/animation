import { PALETTES, hexToRgb } from '../data/mockData.js';

/**
 * layoutManager.js — Manages multiple projection layouts and transitions.
 */
import { normalizeToUnitCube } from '../data/normalize.js';

/**
 * Generate a random layout for N points.
 */
export function generateRandomLayout(n) {
  const points = [];
  for (let i = 0; i < n; i++) {
    points.push([
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
    ]);
  }
  return normalizeToUnitCube(points);
}

/**
 * Generate a spherical layout (Fibonacci sphere).
 */
export function generateSphericalLayout(n) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = goldenAngle * i;
    const r = 0.7 + Math.random() * 0.3;

    points.push([
      r * Math.sin(inclination) * Math.cos(azimuth),
      r * Math.sin(inclination) * Math.sin(azimuth),
      r * Math.cos(inclination),
    ]);
  }

  return normalizeToUnitCube(points);
}

/**
 * Perfectly deterministic grid layout generation.
 * Maps N points to the first N cells in a perfectly regular grid.
 * Points are grouped by clusterId into solid spatial blocks.
 */
function createMathematicalLayout(n, cells, clusterIds) {
  // 1. Sort point indices primarily by clusterId (preserves local continuity)
  const pointIndices = Array.from({length: n}, (_, i) => i);
  pointIndices.sort((a, b) => clusterIds[a] - clusterIds[b]);

  // 2. Map sorted indices to sorted grid cells
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const ptIdx = pointIndices[i];
    const cell = cells[i];
    positions[ptIdx * 3]     = cell.x;
    positions[ptIdx * 3 + 1] = cell.y;
    positions[ptIdx * 3 + 2] = cell.z;
  }
  return positions;
}

/**
 * Generate a cubic crystal grid layout.
 */
export function generateCubicGridLayout(n, clusterIds, numClusters) {
  const gridSize = Math.ceil(Math.cbrt(n));
  const cells = [];
  
  // Outer loops ensure Z-then-Y-then-X filling order
  for (let z = 0; z < gridSize; z++) {
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        // High-precision mapping to [-1, 1] range
        const px = (x * 2.0 - (gridSize - 1)) / gridSize;
        const py = (y * 2.0 - (gridSize - 1)) / gridSize;
        const pz = (z * 2.0 - (gridSize - 1)) / gridSize;
        cells.push({ x: px, y: py, z: pz });
      }
    }
  }

  return createMathematicalLayout(n, cells, clusterIds);
}

/**
 * Generate a hexagonal close-packed (HCP) crystal grid layout.
 */
export function generateHexGridLayout(n, clusterIds, numClusters) {
  const cells = [];
  const maxExtent = Math.ceil(Math.cbrt(n) * 1.5); 
  
  const spacingY = Math.sqrt(3) / 2;
  const spacingZ = Math.sqrt(2 / 3);

  // Oversized lattice generation
  for (let z = -maxExtent; z <= maxExtent; z++) {
    for (let y = -maxExtent; y <= maxExtent; y++) {
      for (let x = -maxExtent; x <= maxExtent; x++) {
        const layerXOff = (z & 1) ? 0.5 : 0;
        const layerYOff = (z & 1) ? (spacingY / 3) : 0;
        const rowXOff = (y & 1) ? 0.5 : 0;
        
        const px = x + rowXOff + layerXOff;
        const py = y * spacingY + layerYOff;
        const pz = z * spacingZ;
        
        // Exact hexagonal prism boundary metric
        const distXY = Math.max(Math.abs(py), (Math.abs(px) * Math.sqrt(3) + Math.abs(py)) / 2);
        const dist = Math.max(distXY, Math.abs(pz));
        
        cells.push({ x: px, y: py, z: pz, dist });
      }
    }
  }

  // Purely deterministic sort for pruning
  cells.sort((a, b) => a.dist - b.dist || a.z - b.z || a.y - b.y || a.x - b.x);
  const finalCells = cells.slice(0, n);

  // Normalize to [-1, 1] unit box
  let bounds = 0;
  for (let i = 0; i < n; i++) {
    bounds = Math.max(bounds, Math.abs(finalCells[i].x), Math.abs(finalCells[i].y), Math.abs(finalCells[i].z));
  }
  if (bounds > 0) {
    const scale = 1.0 / bounds;
    for (let i = 0; i < n; i++) {
      finalCells[i].x *= scale;
      finalCells[i].y *= scale;
      finalCells[i].z *= scale;
    }
  }

  return createMathematicalLayout(n, finalCells, clusterIds);
}

/**
 * Generate a circular grid on a flat rectangular plane.
 * Points form a perfectly regular grid, cropped to a circle.
 */
export function generateCircleGridLayout(n, paletteName = 'plotly', polyConfig) {
  // Fallback if n is invalid
  if (!n || n < 1) {
    return { positions: new Float32Array(0), colors: new Float32Array(0), minZ: 0, maxZ: 0, zVals: new Float32Array(0) };
  }

  const gridSize = Math.ceil(Math.sqrt(n * 4 / Math.PI)) + 2; 
  const points = [];
  const offset = (gridSize - 1) / 2;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const dx = x - offset;
      const dy = y - offset;
      const distSq = dx * dx + dy * dy;
      const angle = Math.atan2(dy, dx);
      points.push({ x: dx, y: dy, distSq, angle });
    }
  }

  points.sort((a, b) => (a.distSq - b.distSq) || (a.angle - b.angle));

  // Guard against points array being too short
  const safeN = Math.min(n, points.length);
  if (safeN === 0) return { positions: new Float32Array(0), colors: new Float32Array(0), minZ: 0, maxZ: 0, zVals: new Float32Array(0) };

  const maxR = Math.sqrt(points[safeN - 1].distSq) || 1.0;
  
  const hexes = PALETTES[paletteName] || PALETTES.plotly;
  const paletteRGB = hexes.map(hexToRgb);

  const p = polyConfig || { x: -0.2876, y: -0.2696, xx: -0.0004606, yy: 0.0002108, xy: 0.005996 };

  let minZ = Infinity, maxZ = -Infinity;
  const zVals = new Float32Array(safeN);
  
  for (let i = 0; i < safeN; i++) {
     const nx = (points[i].x / maxR) * 2.6;
     const ny = (points[i].y / maxR) * 2.6;
     let z = (p.x || 0) * nx + (p.y || 0) * ny + (p.xx || 0) * (nx * nx) + (p.yy || 0) * (ny * ny) + (p.xy || 0) * (nx * ny);
     if (isNaN(z)) z = 0;
     zVals[i] = z;
     if (z < minZ) minZ = z;
     if (z > maxZ) maxZ = z;
  }

  if (minZ === Infinity) { minZ = 0; maxZ = 0; }

  const finalPositions = new Float32Array(safeN * 3);
  const finalColors = new Float32Array(safeN * 3);

  for (let i = 0; i < safeN; i++) {
    const pt = points[i];
    const nx = (pt.x / maxR) * 2.6;
    const ny = (pt.y / maxR) * 2.6;

    finalPositions[i * 3]     = nx;
    finalPositions[i * 3 + 1] = zVals[i] * 0.05;
    finalPositions[i * 3 + 2] = ny;

    const t = (minZ === maxZ) ? 0.5 : (zVals[i] - minZ) / (maxZ - minZ);
    const scaled = t * (paletteRGB.length - 1);
    const i0 = Math.max(0, Math.min(paletteRGB.length - 1, Math.floor(scaled)));
    const i1 = Math.max(0, Math.min(paletteRGB.length - 1, Math.floor(scaled + 1)));
    const frac = isNaN(scaled - i0) ? 0 : (scaled - i0);

    const c0 = paletteRGB[i0] || [0.5, 0.5, 0.5];
    const c1 = paletteRGB[i1] || [0.5, 0.5, 0.5];

    finalColors[i * 3]     = c0[0] * (1 - frac) + c1[0] * frac;
    finalColors[i * 3 + 1] = c0[1] * (1 - frac) + c1[1] * frac;
    finalColors[i * 3 + 2] = c0[2] * (1 - frac) + c1[2] * frac;
  }

  return { positions: finalPositions, colors: finalColors, minZ, maxZ, zVals };
}

/**
 * Layout Manager — stores named layouts and the currently active one.
 */
export class LayoutManager {
  constructor(numPoints, baseColors) {
    this.numPoints = numPoints;
    this.baseColors = baseColors; // fallback colors
    this.layouts = new Map();
    this.currentLayout = null;
  }

  addLayout(name, positions, colors = null) {
    this.layouts.set(name, {
      positions,
      colors: colors || this.baseColors
    });
  }

  getLayout(name) {
    return this.layouts.get(name) || null;
  }

  getNames() {
    return [...this.layouts.keys()];
  }
}
