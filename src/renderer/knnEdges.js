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

  void main() {
    // 1. Interpolate positions on GPU
    vec3 p1 = mix(instanceStart, instanceTargetStart, uTransitionProgress);
    vec3 p2 = mix(instanceEnd, instanceTargetEnd, uTransitionProgress);

    // 2. Project to clip space
    vec4 startClip = projectionMatrix * modelViewMatrix * vec4(p1, 1.0);
    vec4 endClip   = projectionMatrix * modelViewMatrix * vec4(p2, 1.0);

    // 3. Screen-space billboarding for thickness
    vec2 startScreen = startClip.xy / max(startClip.w, 0.0001);
    vec2 endScreen   = endClip.xy / max(endClip.w, 0.0001);

    vec2 dir = endScreen - startScreen;
    float len = length(dir);
    
    // Normal in screen space
    vec2 normal = (len > 0.0001) ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);

    // position.x is -0.5 to 0.5 (across), position.y is -0.5 to 0.5 (along)
    float u = position.y + 0.5; // 0 to 1
    
    // Offset. Multiplier 0.01 makes Thickness 1.0 roughly comparable to a few pixels on a 1080p screen
    vec2 offset = normal * position.x * (uThickness * 0.01);
    
    vec4 currentClip = mix(startClip, endClip, u);
    currentClip.xy += offset * currentClip.w;

    gl_Position = currentClip;

    vColor = mix(instanceColorStart, instanceColorEnd, (uColorMode > 0.5) ? u : 0.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;

  void main() {
    // Amplify color for better visibility against dark backgrounds
    gl_FragColor = vec4(vColor * 3.0, uOpacity);
  }
`;

export function createKNNEdges(scene, numPoints) {
  const k = 3;
  const maxEdges = Math.min(numPoints, 2000) * k;

  const geometry = new THREE.InstancedBufferGeometry();
  const planeGeom = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute('position', planeGeom.getAttribute('position'));
  geometry.setIndex(planeGeom.getIndex());

  const attrStart = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrEnd   = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrTStart = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrTEnd   = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrCStart = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  const attrCEnd   = new THREE.InstancedBufferAttribute(new Float32Array(maxEdges * 3), 3);
  
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
      uOpacity: { value: 0.8 },
      uTransitionProgress: { value: 0.0 },
      uColorMode: { value: 1.0 }
    },
    transparent: true,
    depthTest: false, // Ensure edges overlay points
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; 
  mesh.visible = false;
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
  }

  function findKNN(idx, pos, k, stride) {
    const neighbors = [];
    const x = pos[idx * 3], y = pos[idx * 3 + 1], z = pos[idx * 3 + 2];
    for (let j = 0; j < pos.length / 3; j += stride) {
      if (idx === j) continue;
      const dx = pos[j * 3] - x, dy = pos[j * 3 + 1] - y, dz = pos[j * 3 + 2] - z;
      const d2 = dx*dx + dy*dy + dz*dz;
      if (neighbors.length < k) {
        neighbors.push({ idx: j, d2 });
        neighbors.sort((a,b) => a.d2 - b.d2);
      } else if (d2 < neighbors[k-1].d2) {
        neighbors[k-1] = { idx: j, d2 };
        neighbors.sort((a,b) => a.d2 - b.d2);
      }
    }
    return neighbors;
  }

  function setVisible(v) { mesh.visible = v; }

  return { update, setVisible, mesh, material };
}
