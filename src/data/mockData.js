/**
 * mockData.js — Generate synthetic embedding data forming clean, well-separated Gaussian clusters.
 * Uses simple isotropic Gaussians in high-dimensional space so t-SNE and UMAP always produce
 * clean, separated blobs with no ring artifacts.
 */

const CLUSTER_LABELS = [
  'Quartz',     // 0
  'Diamond',    // 1
  'Calcite',    // 2
  'Feldspar',   // 3
  'Perovskite', // 4
  'Garnet',     // 5
  'Fluorite',   // 6
  'Rutile',     // 7
];

/**
 * Generate isotropic Gaussian cluster embeddings.
 *
 * Key design decisions:
 *  - Cluster centers are randomly placed in `dims`-dimensional space, with
 *    minimum inter-cluster distance enforced to ensure separation.
 *  - Each point is simply center + small isotropic Gaussian noise.
 *  - No sinusoidal or periodically structured patterns, which cause ring artifacts.
 *
 * @param {number} numPoints
 * @param {number} dims - high-dimensional embedding space (keep 32–64 for fast processing)
 * @param {number} numClusters
 * @returns {{ vectors: Float32Array[], labels: string[], clusterIds: number[], numClusters: number }}
 */
export function generateMockEmbeddings(numPoints = 1000, dims = 48, numClusters = 8) {
  const actualClusters = Math.min(numClusters, CLUSTER_LABELS.length);
  const clusterSpread = 1.8;      // std-dev within each cluster
  const centerScale = 12.0;       // how far apart cluster centers are placed

  // Generate well-separated cluster centers using rejection sampling
  const centers = [];
  const rng = seededRng(42);

  for (let c = 0; c < actualClusters; c++) {
    let candidate;
    let attempts = 0;
    do {
      candidate = new Float32Array(dims);
      for (let d = 0; d < dims; d++) {
        candidate[d] = (rng() - 0.5) * 2 * centerScale;
      }
      attempts++;
    } while (
      attempts < 100 &&
      centers.some(existing => euclidDist(candidate, existing) < centerScale * 1.2)
    );
    centers.push(candidate);
  }

  const vectors = [];
  const labels = [];
  const clusterIds = [];

  for (let i = 0; i < numPoints; i++) {
    const clusterId = i % actualClusters;
    const center = centers[clusterId];
    const vec = new Float32Array(dims);

    for (let d = 0; d < dims; d++) {
      vec[d] = center[d] + gaussianRandom() * clusterSpread;
    }

    vectors.push(vec);
    labels.push(`${CLUSTER_LABELS[clusterId]}-${String(Math.floor(i / actualClusters)).padStart(3, '0')}`);
    clusterIds.push(clusterId);
  }

  return { vectors, labels, clusterIds, numClusters: actualClusters };
}

/** Simple seeded RNG (mulberry32) */
function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function euclidDist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export const PALETTES = {
  plotly: [
    '#ff7f0e', '#1f77b4', '#d62728', '#9467bd', '#8c564b',
    '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
  ],
  plasma: [
    '#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786',
    '#d8576b', '#ed7953', '#fb9f3a', '#f0f921'
  ]
};

export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

export function generateClusterColors(count, paletteName = 'plotly') {
  const colors = [];
  const palette = PALETTES[paletteName] || PALETTES.plotly;
  for (let i = 0; i < count; i++) {
    const [r, g, b] = hexToRgb(palette[i % palette.length]);
    colors.push(new Float32Array([r, g, b]));
  }
  return colors;
}
