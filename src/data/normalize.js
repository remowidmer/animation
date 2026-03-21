/**
 * normalize.js — Normalize N×3 point sets into the [-1, 1] cube.
 */

/**
 * Normalize an array of 3D points so each axis fits within [-1, 1].
 * @param {number[][]} points Array of [x, y, z] points
 * @returns {Float32Array} Flattened Float32Array of normalized xyz coords
 */
export function normalizeToUnitCube(points) {
  const n = points.length;
  if (n === 0) return new Float32Array(0);

  // Find min/max per axis
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < n; i++) {
    const [x, y, z] = points[i];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const rangeZ = maxZ - minZ || 1;
  const maxRange = Math.max(rangeX, rangeY, rangeZ);

  const cx = (minX + maxX) / 2.0;
  const cy = (minY + maxY) / 2.0;
  const cz = (minZ + maxZ) / 2.0;

  // Normalize and strictly center everything at (0,0,0) 
  // This ensures auto-rotate always spins smoothly around the exact center of mass.
  const result = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = points[i];
    result[i * 3]     = ((x - cx) / maxRange) * 2.0;
    result[i * 3 + 1] = ((y - cy) / maxRange) * 2.0;
    result[i * 3 + 2] = ((z - cz) / maxRange) * 2.0;
  }

  return result;
}
