/**
 * knnEdges.js — High-performance GPU-accelerated thick edges.
 * Uses InstancedMesh to draw ribbons that animate on the GPU during transitions.
 */
import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
  uniform float uThickness;
  uniform float uTransitionProgress;
  uniform float uColorMode; // 0=Source, 1=Gradient
  
  attribute vec3 instanceStart;
  attribute vec3 instanceEnd;
  attribute vec3 instanceTargetStart;
  attribute vec3 instanceTargetEnd;
  attribute vec3 instanceColorStart;
  attribute vec3 instanceColorEnd;

  varying vec3 vColor;

  mat3 alignY(vec3 dir) {
    vec3 d = normalize(dir);
    vec3 up = abs(d.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, d));
    vec3 orthUp = cross(d, right);
    return mat3(right, d, orthUp);
  }

  void main() {
    // 1. Interpolate positions on GPU (Object Space)
    vec3 p1 = mix(instanceStart, instanceTargetStart, uTransitionProgress);
    vec3 p2 = mix(instanceEnd, instanceTargetEnd, uTransitionProgress);

    // 2. Compute edge direction and length
    vec3 dir = p2 - p1;
    float len = length(dir);
    
    vec3 localPos = position;

    // 3. Scale cylinder to fit thickness and length
    // Cylinder is originally 1 unit tall along Y axis (-0.5 to 0.5)
    localPos.y *= len;
    
    // Scale thickness (uThickness from 0 to 10. 2 * 0.05 = 0.1 world units)
    localPos.x *= uThickness * 0.05;
    localPos.z *= uThickness * 0.05;

    // 4. Rotate and Translate
    vec3 worldPos;
    if (len > 0.0001) {
        mat3 rot = alignY(dir);
        vec3 rotated = rot * localPos;
        vec3 midpoint = (p1 + p2) * 0.5;
        worldPos = rotated + midpoint;
    } else {
        worldPos = p1; // Collapse degenerate edges
    }

    // 5. Project to Clip Space
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);

    // 6. Color interpolation
    float u = position.y + 0.5; // Back to 0.0 to 1.0
    vColor = mix(instanceColorStart, instanceColorEnd, (uColorMode > 0.5) ? u : 0.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;

  void main() {
    // High intensity neon color
    gl_FragColor = vec4(clamp(vColor * 2.0, 0.0, 1.0), uOpacity);
  }
`;

export function createKNNEdges(scene, numPoints) {
  const k = 3;
  const maxEdges = Math.min(numPoints, 2000) * k;

  const geometry = new THREE.InstancedBufferGeometry();
  // 4-sided open-ended cylinder guarantees robust volumetric representation with low triangles (8 tris per edge)
  const baseGeom = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 4, 1, true);
  geometry.setAttribute('position', baseGeom.getAttribute('position'));
  geometry.setIndex(baseGeom.getIndex());

  const attrStart = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrEnd = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrTStart = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrTEnd = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrCStart = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrCEnd = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);

  geometry.setAttribute('instanceStart', attrStart);
  geometry.setAttribute('instanceEnd', attrEnd);
  geometry.setAttribute('instanceTargetStart', attrTStart);
  geometry.setAttribute('instanceTargetEnd', attrTEnd);
  geometry.setAttribute('instanceColorStart', attrCStart);
  geometry.setAttribute('instanceColorEnd', attrCEnd);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uThickness: { value: 2.0 },
      uOpacity: { value: 1.0 }, // Full opacity for debug
      uTransitionProgress: { value: 1.0 }, // Target state by default
      uColorMode: { value: 1.0 }
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending // More consistent than additive
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 999; // Always on top
  scene.add(mesh);

  function update(positions, colorData, targetPositions) {
    const n = positions.length / 3;
    const maxEdgePoints = Math.min(n, 2000);
    const stride = Math.max(1, Math.floor(n / maxEdgePoints));

    let edgeIdx = 0;
    const sArr = attrStart.array;
    const eArr = attrEnd.array;
    const tsArr = attrTStart.array;
    const teArr = attrTEnd.array;
    const csArr = attrCStart.array;
    const ceArr = attrCEnd.array;

    for (let i = 0; i < n && edgeIdx < maxEdges; i += stride) {
      const neighbors = findKNN(i, positions, k, stride);

      for (const neighbor of neighbors) {
        if (edgeIdx >= maxEdges) break;
        const j = neighbor.idx;
        const b = edgeIdx * 3;

        for (let d = 0; d < 3; d++) {
          sArr[b + d] = positions[i * 3 + d];
          eArr[b + d] = positions[j * 3 + d];
          tsArr[b + d] = targetPositions[i * 3 + d];
          teArr[b + d] = targetPositions[j * 3 + d];
          csArr[b + d] = colorData[i * 3 + d];
          ceArr[b + d] = colorData[j * 3 + d];
        }
        edgeIdx++;
      }
    }

    geometry.instanceCount = edgeIdx;
    attrStart.needsUpdate = true;
    attrEnd.needsUpdate = true;
    attrTStart.needsUpdate = true;
    attrTEnd.needsUpdate = true;
    attrCStart.needsUpdate = true;
    attrCEnd.needsUpdate = true;

    console.log(`[knnEdges] Updated topology: ${edgeIdx} edges computed.`);
    window._debug_knnEdges = { mesh, material, geometry, edgeIdx };
  }

  function findKNN(idx, pos, k, stride) {
    const neighbors = [];
    const x = pos[idx * 3], y = pos[idx * 3 + 1], z = pos[idx * 3 + 2];
    for (let j = 0; j < pos.length / 3; j += stride) {
      if (idx === j) continue;
      const dx = pos[j * 3] - x, dy = pos[j * 3 + 1] - y, dz = pos[j * 3 + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (neighbors.length < k) {
        neighbors.push({ idx: j, d2 });
        neighbors.sort((a, b) => a.d2 - b.d2);
      } else if (d2 < neighbors[k - 1].d2) {
        neighbors[k - 1] = { idx: j, d2 };
        neighbors.sort((a, b) => a.d2 - b.d2);
      }
    }
    return neighbors;
  }

  function setVisible(v) { mesh.visible = v; }

  return { update, setVisible, mesh, material };
}
