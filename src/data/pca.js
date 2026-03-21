/**
 * pca.js — Client-side PCA using power iteration / randomized SVD approach.
 * Projects high-dimensional vectors down to 3D.
 * Optimized for large N (10k+) with high D (768).
 */
import { normalizeToUnitCube } from './normalize.js';

/**
 * Perform PCA dimensionality reduction via randomized projection.
 * Uses a practical approach: project onto random directions, then orthogonalize
 * using Gram-Schmidt and refine with power iteration.
 *
 * @param {Float32Array[]} vectors  Array of N vectors, each of dimension D
 * @param {number} nComponents      Number of output dimensions (default 3)
 * @returns {Float32Array}          Flattened Float32Array of Nx3 normalized positions
 */
export function computePCA(vectors, nComponents = 3) {
  const n = vectors.length;
  const d = vectors[0].length;

  // 1. Compute mean
  const mean = new Float64Array(d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      mean[j] += vectors[i][j];
    }
  }
  for (let j = 0; j < d; j++) mean[j] /= n;

  // 2. Initialize random projection vectors (D-dimensional)
  const numIterations = 10; // Power iteration steps
  const components = [];

  for (let c = 0; c < nComponents; c++) {
    // Start with a random unit vector in D dimensions
    let w = new Float64Array(d);
    for (let j = 0; j < d; j++) {
      w[j] = gaussianRandom();
    }
    normalize(w);

    // Power iteration: w = (X^T X) w, repeated
    for (let iter = 0; iter < numIterations; iter++) {
      // Compute X * w (project all points onto w) → gives N-dim vector
      const proj = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let dot = 0;
        for (let j = 0; j < d; j++) {
          dot += (vectors[i][j] - mean[j]) * w[j];
        }
        proj[i] = dot;
      }

      // Compute X^T * proj (back-project) → gives D-dim vector
      const wNew = new Float64Array(d);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < d; j++) {
          wNew[j] += (vectors[i][j] - mean[j]) * proj[i];
        }
      }

      // Gram-Schmidt: orthogonalize against previously found components
      for (const prev of components) {
        let dot = 0;
        for (let j = 0; j < d; j++) dot += wNew[j] * prev[j];
        for (let j = 0; j < d; j++) wNew[j] -= dot * prev[j];
      }

      normalize(wNew);
      w = wNew;
    }

    components.push(w);
  }

  // 3. Project all points onto the found principal components
  const points = [];
  for (let i = 0; i < n; i++) {
    const point = new Array(nComponents);
    for (let c = 0; c < nComponents; c++) {
      let dot = 0;
      for (let j = 0; j < d; j++) {
        dot += (vectors[i][j] - mean[j]) * components[c][j];
      }
      point[c] = dot;
    }
    points.push(point);
  }

  // 4. Normalize to [-1, 1]
  return normalizeToUnitCube(points);
}

/**
 * Normalize a vector in-place to unit length.
 */
function normalize(v) {
  let len = 0;
  for (let i = 0; i < v.length; i++) len += v[i] * v[i];
  len = Math.sqrt(len);
  if (len > 0) {
    for (let i = 0; i < v.length; i++) v[i] /= len;
  }
}

/**
 * Box-Muller transform for Gaussian random numbers.
 */
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
