/**
 * umap.js — UMAP dimensionality reduction using umap-js.
 */
import { UMAP } from 'umap-js';
import { normalizeToUnitCube } from './normalize.js';

/**
 * Compute UMAP 3D embeddings from an array of N-dimensional vectors.
 * @param {Float32Array[]} vectors Array of input vectors
 * @param {object} options UMAP options
 * @returns {Promise<Float32Array>} Flattened Float32Array of 3D positions [-1, 1]
 */
export async function computeUMAP(vectors, options = {}) {
  return new Promise((resolve) => {
    // Run in a slight timeout to yield to the main thread
    setTimeout(() => {
      const umap = new UMAP({
        nComponents: 3,
        nEpochs: options.nEpochs || 200,
        nNeighbors: options.nNeighbors || 15,
        minDist: options.minDist !== undefined ? options.minDist : 0.1,
      });

      // Convert Float32Array[] to number[][] if needed
      // umap-js usually expects Array of Arrays
      const data = vectors.map(v => Array.from(v));
      const embedding = umap.fit(data);

      resolve(normalizeToUnitCube(embedding));
    }, 10);
  });
}
