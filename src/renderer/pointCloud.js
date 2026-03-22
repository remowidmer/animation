/**
 * pointCloud.js — High-performance point cloud using BufferGeometry + ShaderMaterial.
 */
import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders.js';

/**
 * Create the point cloud object.
 * @param {number} numPoints     Total number of points
 * @param {Float32Array} positions  Initial positions (Nx3 flattened)
 * @param {number[]} clusterIds   Cluster ID per point
 * @param {Float32Array[]} clusterColors  Color per cluster [r,g,b]
 * @returns {{ points: THREE.Points, material: THREE.ShaderMaterial, geometry: THREE.BufferGeometry }}
 */
export function createPointCloud(numPoints, positions, clusterIds, clusterColors) {
  const geometry = new THREE.BufferGeometry();

  // Position attribute (current interpolated position)
  const posArray = new Float32Array(positions);
  geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

  // Target position attribute (for lerp transitions)
  const targetArray = new Float32Array(positions);
  geometry.setAttribute('aTargetPosition', new THREE.BufferAttribute(targetArray, 3));

  // Color attribute (current interpolated color)
  const colorArray = new Float32Array(numPoints * 3);
  for (let i = 0; i < numPoints; i++) {
    const c = clusterColors[clusterIds[i]];
    colorArray[i * 3] = c[0];
    colorArray[i * 3 + 1] = c[1];
    colorArray[i * 3 + 2] = c[2];
  }
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colorArray, 3));

  // Target color attribute (for lerp transitions)
  const targetColorArray = new Float32Array(colorArray);
  geometry.setAttribute('aTargetColor', new THREE.BufferAttribute(targetColorArray, 3));

  // Point ID attribute (for hover highlight)
  const idArray = new Float32Array(numPoints);
  for (let i = 0; i < numPoints; i++) idArray[i] = i;
  geometry.setAttribute('aPointId', new THREE.BufferAttribute(idArray, 1));

  // Index buffer for depth sorting
  const indices = new Uint16Array(numPoints);
  for (let i = 0; i < numPoints; i++) indices[i] = i;
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  // Shader material
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uPointSize:      { value: 0.2 },
      uPixelRatio:     { value: Math.min(window.devicePixelRatio, 2) },
      uTime:           { value: 0 },
      uOpacity:        { value: 0.9 },
      uPlumeEnabled:   { value: 0.0 },
      uPlumeRadius:    { value: 0.0 },
      uPlumeWidth:     { value: 5.0 },
      uPlumeCenter:    { value: new THREE.Vector2(0, 0) },
    },
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);

  return { points, material, geometry };
}

/**
 * Set a new target layout for smooth transition.
 * @param {THREE.BufferGeometry} geometry
 * @param {Float32Array} newPositions Flattened Nx3 target positions
 * @param {Float32Array} newColors Optional flattened Nx3 target colors
 */
export function setTargetPositions(geometry, newPositions, newColors) {
  const target = geometry.getAttribute('aTargetPosition');
  target.array.set(newPositions);
  target.needsUpdate = true;

  if (newColors) {
    const targetCol = geometry.getAttribute('aTargetColor');
    targetCol.array.set(newColors);
    targetCol.needsUpdate = true;
  }
}

/**
 * Lerp current positions and colors toward target states.
 * @param {THREE.BufferGeometry} geometry
 * @param {number} t  Interpolation factor (0-1) for this frame
 * @returns {boolean} True if still animating
 */
export function lerpPositions(geometry, t) {
  const pos = geometry.getAttribute('position');
  const target = geometry.getAttribute('aTargetPosition');
  const p = pos.array;
  const tgt = target.array;

  const col = geometry.getAttribute('aColor');
  const targetCol = geometry.getAttribute('aTargetColor');
  const c = col.array;
  const tgtC = targetCol.array;

  let maxDelta = 0;
  for (let i = 0; i < p.length; i++) {
    const deltaP = tgt[i] - p[i];
    p[i] += deltaP * t;
    const absDelta = Math.abs(deltaP);
    if (absDelta > maxDelta) maxDelta = absDelta;

    const deltaC = tgtC[i] - c[i];
    c[i] += deltaC * t;
  }

  pos.needsUpdate = true;
  col.needsUpdate = true;
  return maxDelta > 0.0001;
}
