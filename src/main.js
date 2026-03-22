/**
 * main.js — Entry point for the Crystal Embedding Visualizer.
 */
import { generateMockEmbeddings, generateClusterColors } from './data/mockData.js';
import { computePCA } from './data/pca.js';
import { computeUMAP } from './data/umap.js';
import * as THREE from 'three';
import { createScene } from './renderer/scene.js';
import { createPointCloud } from './renderer/pointCloud.js';
import { createControls } from './renderer/controls.js';
import { LayoutManager, generateRandomLayout, generateSphericalLayout, generateCubicGridLayout, generateHexGridLayout, generateCircleGridLayout } from './animation/layoutManager.js';
import { Animator } from './animation/animator.js';
import { createGUI } from './interaction/gui.js';

// ─── Configuration ──────────────────────────────────────────────
const NUM_POINTS = 1000;
const EMBEDDING_DIM = 48; // Updated to match mockData.js
const NUM_CLUSTERS = 8;

// Base layouts
const BASE_LAYOUTS = ['PCA', 'UMAP', 'Random', 'Spherical', 'Cubic Grid', 'Hex Grid', 'Disc'];

// ─── DOM References ─────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');
const pointCountEl = document.getElementById('point-count');
const projectionEl = document.getElementById('current-projection');
const fpsCounterEl = document.getElementById('fps-counter');

// ─── Main Init ──────────────────────────────────────────────────
async function init() {
  try {
    // 1. Generate data
    loadingStatus.textContent = 'Generating crystal embeddings…';
    await tick();

    // 0. GUI Definition (Moved up to properly drive initialization)
    const guiConfig = {
      projection: 'PCA',
      projections: [...BASE_LAYOUTS],
      pointSize: 0.2,
      colorscale: 'plasma',
      opacity: 0.9,
      colorTransitions: true,
      umapMinDist: 0.25,
      umapNeighbors: 15,
      umapColorMorph: false,
      transitionSpeed: 1.5,
      autoRotate: true,
      autoRotateSpeed: 1.0,
      autoZoom: true,
      plumeEnabled: false,
      plumeRadius: 0.0,
      plumeWidth: 5.0,
      cycleEnabled: true,
      cyclePreset: 'Custom',
      cycleDuration: 2.0,
      cycle_PCA: false,
      cycle_CubicGrid: true,
      cycle_HexGrid: false,
      cycle_Disc: true,
      cycle_UMAP: true
    };

    const { vectors, labels, clusterIds, numClusters } = generateMockEmbeddings(
      NUM_POINTS, EMBEDDING_DIM, NUM_CLUSTERS
    );
    const clusterColors = generateClusterColors(numClusters, guiConfig.colorscale);

    // 2. Compute PCA and UMAP
    loadingStatus.textContent = 'Computing projections (PCA & UMAP)…';
    await tick();

    const pcaPositions = computePCA(vectors, 3);
    const umapPositions = await computeUMAP(vectors, { nNeighbors: 15, minDist: 0.1 });

    // 3. Generate auxiliary layouts
    loadingStatus.textContent = 'Generating layouts…';
    await tick();


    const randomPositions = generateRandomLayout(NUM_POINTS);
    const sphericalPositions = generateSphericalLayout(NUM_POINTS);
    const cubicGridPositions = generateCubicGridLayout(NUM_POINTS, clusterIds, numClusters);
    const hexGridPositions = generateHexGridLayout(NUM_POINTS, clusterIds, numClusters);
    const circleGrid = generateCircleGridLayout(NUM_POINTS, guiConfig.colorscale);

    // Flatten original cluster colors to be the base colors
    const baseColors = new Float32Array(NUM_POINTS * 3);
    const clusterColorsInfo = generateClusterColors(NUM_CLUSTERS, guiConfig.colorscale);
    for (let i = 0; i < NUM_POINTS; i++) {
      const c = clusterColorsInfo[clusterIds[i]];
      baseColors[i * 3] = c[0];
      baseColors[i * 3 + 1] = c[1];
      baseColors[i * 3 + 2] = c[2];
    }

    // 4. Layout manager
    const layoutManager = new LayoutManager(NUM_POINTS, baseColors);
    layoutManager.addLayout('PCA', pcaPositions);
    layoutManager.addLayout('UMAP', umapPositions);
    layoutManager.addLayout('Random', randomPositions);
    layoutManager.addLayout('Spherical', sphericalPositions);
    layoutManager.addLayout('Cubic Grid', cubicGridPositions);
    layoutManager.addLayout('Hex Grid', hexGridPositions);
    layoutManager.addLayout('Disc', circleGrid.positions, circleGrid.colors);
    layoutManager.currentLayout = 'PCA';

    // 5. Three.js scene
    loadingStatus.textContent = 'Initializing renderer…';
    await tick();

    const { scene, camera, renderer } = createScene(canvas);
    const controls = createControls(camera, canvas);
    const { points, material, geometry } = createPointCloud(
      NUM_POINTS, pcaPositions, clusterIds, clusterColorsInfo
    );
    scene.add(points);

    // 6. Animator
    const animator = new Animator(renderer, scene, camera, controls, geometry, material);

    animator.fpsCallback = (fps) => {
      fpsCounterEl.textContent = `${fps} FPS`;
    };

    let projectionController;

    function switchProjection(name) {
      const layout = layoutManager.getLayout(name);
      if (!layout) {
        console.warn(`Layout "${name}" not ready`);
        return;
      }
      layoutManager.currentLayout = name;
      animator.currentLayoutName = name;
      animator.transitionTo(layout, layoutManager.baseColors);
      projectionEl.textContent = name;
      
      // Plume is exclusively for Disc
      material.uniforms.uPlumeEnabled.value = (guiConfig.plumeEnabled && name === 'Disc') ? 1.0 : 0.0;
      if (guiConfig.plumeEnabled && name === 'Disc') {
        animator.triggerPlumeAnimation();
      }
    }

    function rebuildCycleList() {
      if (!guiConfig.cycleEnabled) {
        animator.cycleLayouts = [];
        return;
      }

      if (guiConfig.cyclePreset === 'Grand Tour') {
        const umapNames = layoutManager.getNames().filter(n => n.startsWith('UMAP-n'));
        const list = [];
        for (let i = 0; i < umapNames.length; i++) {
          list.push('Disc');
          list.push(umapNames[i]);
          list.push(i % 2 === 0 ? 'Cubic Grid' : 'Hex Grid');
        }
        animator.cycleLayouts = list;
        return;
      }

      const list = [];
      if (guiConfig.cycle_PCA) list.push('PCA');
      if (guiConfig.cycle_CubicGrid) list.push('Cubic Grid');
      if (guiConfig.cycle_HexGrid) list.push('Hex Grid');
      if (guiConfig.cycle_Disc) list.push('Disc');

      if (guiConfig.cycle_UMAP) {
        list.push('UMAP_DYNAMIC');
      }

      animator.cycleLayouts = list;
    }

    const gui = createGUI(guiConfig, {
      onProjectionChange: switchProjection,
      onPointSizeChange: (v) => { material.uniforms.uPointSize.value = v; },
      onColorscaleChange: (name) => {
        // Regenerate cluster-based baseColors entirely
        const clusterColorsInfo = generateClusterColors(NUM_CLUSTERS, name);
        for (let i = 0; i < NUM_POINTS; i++) {
          const c = clusterColorsInfo[clusterIds[i]];
          layoutManager.baseColors[i * 3] = c[0];
          layoutManager.baseColors[i * 3 + 1] = c[1];
          layoutManager.baseColors[i * 3 + 2] = c[2];
        }

        // Regenerate Circle Grid with continuous palette
        const circleLayout = generateCircleGridLayout(NUM_POINTS, name);
        layoutManager.addLayout('Disc', circleLayout.positions, circleLayout.colors);

        // Re-apply shifted colors to all UMAP layouts
        for (const lname of layoutManager.getNames()) {
          if (lname.startsWith('UMAP-')) {
            const dist = parseFloat(lname.split('-d')[1]);
            if (!isNaN(dist)) applyUmapColorMorph(lname, dist, layoutManager, NUM_POINTS);
          } else if (lname === 'UMAP') {
            applyUmapColorMorph('UMAP', guiConfig.umapMinDist, layoutManager, NUM_POINTS);
          }
        }

        // Trigger a fresh transition to lock in the new colors immediately
        switchProjection(layoutManager.currentLayout);
      },
      onOpacityChange: (v) => { material.uniforms.uOpacity.value = v; },
      onColorTransitionsChange: (v) => {
        animator.colorTransitions = v;
        switchProjection(layoutManager.currentLayout);
      },
      onUmapRecompute: async () => {
        loadingOverlay.style.display = 'flex';
        loadingStatus.textContent = 'Recomputing UMAP…';
        await tick();

        try {
          const newUmap = await computeUMAP(vectors, {
            nNeighbors: guiConfig.umapNeighbors,
            minDist: guiConfig.umapMinDist,
          });
          layoutManager.addLayout('UMAP', newUmap);
          applyUmapColorMorph('UMAP', guiConfig.umapMinDist, layoutManager, vectors.length);

          if (layoutManager.currentLayout === 'UMAP') switchProjection('UMAP');
        } finally {
          loadingOverlay.style.display = 'none';
        }
      },
      onUmapColorMorphChange: (v) => {
        animator.umapColorMorph = v;
        if (layoutManager.currentLayout.startsWith('UMAP-')) {
          switchProjection(layoutManager.currentLayout);
        }
      },
      onTransitionSpeedChange: (v) => { animator.transitionSpeed = v; },
      onPlumeToggle: (v) => {
        material.uniforms.uPlumeEnabled.value = (v && layoutManager.currentLayout === 'Disc') ? 1.0 : 0.0;
        if (v && layoutManager.currentLayout === 'Disc') animator.triggerPlumeAnimation();
      },
      onPlumeRadiusChange: (v) => { material.uniforms.uPlumeRadius.value = v; },
      onPlumeWidthChange: (v) => { material.uniforms.uPlumeWidth.value = v; },
      onAutoRotateChange: (v) => {
        animator.customAutoRotate = v;
        controls.autoRotate = false; // Disable native flat Y-spin
      },
      onAutoRotateSpeedChange: (v) => { animator.autoRotateSpeed = v; },
      onAutoZoomChange: (v) => { animator.autoZoom = v; },
      onCycleToggle: () => {
        animator.autoCycle = guiConfig.cycleEnabled;
        rebuildCycleList();
        animator.cycleTimer = 0;
      },
      onCycleDurationChange: (v) => { animator.cycleDuration = v; },
    });

    projectionController = gui.controllers.find(c => c._name === 'Projection');

    let dynamicUmapSweepIndex = 0;

    animator.onCycleChange = (name) => {
      let layoutName = name;

      // Dynamically select the next UMAP sweep iteration when the cycle hits the UMAP slot
      if (layoutName === 'UMAP_DYNAMIC') {
        const umapNames = layoutManager.getNames().filter(n => n.startsWith('UMAP-n'));
        if (umapNames.length > 0) {
          layoutName = umapNames[dynamicUmapSweepIndex];
          dynamicUmapSweepIndex = (dynamicUmapSweepIndex + 1) % umapNames.length;
        } else {
          layoutName = 'UMAP';
        }
      }

      switchProjection(layoutName);
      guiConfig.projection = layoutName;
      if (projectionController) projectionController.updateDisplay();
    };

    // 9. Info bar
    pointCountEl.textContent = `${NUM_POINTS.toLocaleString()} points`;
    projectionEl.textContent = 'PCA';

    // 10. Start
    animator.setGuiConfig(guiConfig);
    animator.start();

    // 11. Fade overlay
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 1000);

    // Sync starting config to engine
    const syncStartup = () => {
      const initialCallbacks = {
        onPointSizeChange: (v) => { material.uniforms.uPointSize.value = v; },
        onOpacityChange: (v) => { material.uniforms.uOpacity.value = v; },
      };

      initialCallbacks.onPointSizeChange(guiConfig.pointSize);
      initialCallbacks.onOpacityChange(guiConfig.opacity);

      animator.customAutoRotate = guiConfig.autoRotate;
      animator.autoRotateSpeed = guiConfig.autoRotateSpeed;
      animator.autoZoom = guiConfig.autoZoom;
      animator.autoCycle = guiConfig.cycleEnabled;
      animator.cycleDuration = guiConfig.cycleDuration;
      animator.currentLayoutName = 'PCA';

      material.uniforms.uPlumeEnabled.value = (guiConfig.plumeEnabled && guiConfig.projection === 'Disc') ? 1.0 : 0.0;
      material.uniforms.uPlumeRadius.value = guiConfig.plumeRadius;
      material.uniforms.uPlumeWidth.value = guiConfig.plumeWidth;

      rebuildCycleList();
    };
    syncStartup();

    // 12. UMAP sweep
    precomputeUMAPSweep(vectors, layoutManager, () => {
      rebuildCycleList();
    }).catch(err => console.warn('UMAP sweep failed:', err));

  } catch (error) {
    console.error('Init failed:', error);
    loadingStatus.textContent = `Error: ${error.message}`;
  }
}

/**
 * Precompute UMAP parameter sweeps.
 * Sweep N=3 from minDist 0.5 to 1.0 in 5 steps, caching shifted colors.
 */
async function precomputeUMAPSweep(vectors, layoutManager, onEachComplete) {
  const params = [
    { n: 3, d: 0.50 },
    { n: 3, d: 0.625 },
    { n: 3, d: 0.75 },
    { n: 3, d: 0.875 },
    { n: 3, d: 1.00 }
  ];

  const c = new THREE.Color();
  const hsl = {};

  for (const p of params) {
    try {
      const name = `UMAP-n${p.n}-d${p.d}`;
      await tick();
      console.log(`Computing ${name}...`);
      const positions = await computeUMAP(vectors, { nNeighbors: p.n, minDist: p.d });
      layoutManager.addLayout(name, positions);

      applyUmapColorMorph(name, p.d, layoutManager, vectors.length);

      if (onEachComplete) onEachComplete();
    } catch (e) {
      console.warn(e);
    }
  }
}

/**
 * Applies shifted HSL colors to a UMAP layout based on its minDist parameter.
 */
function applyUmapColorMorph(layoutName, minDist, layoutManager, numPoints) {
  const layout = layoutManager.getLayout(layoutName);
  const morphed = new Float32Array(numPoints * 3);
  const c = new THREE.Color();
  const hsl = {};

  // Hue shifts dramatically as distance diverges from 0.5
  const hueShift = (minDist - 0.5) * 1.5;

  for (let i = 0; i < numPoints; i++) {
    c.setRGB(
      layoutManager.baseColors[i * 3],
      layoutManager.baseColors[i * 3 + 1],
      layoutManager.baseColors[i * 3 + 2]
    );
    c.getHSL(hsl);
    hsl.h = (hsl.h + hueShift) % 1.0;
    if (hsl.h < 0) hsl.h += 1.0; // Handle negative wrapping
    hsl.l = Math.min(1.0, hsl.l + (minDist - 0.5) * 0.2); // Brighten as it spreads
    c.setHSL(hsl.h, hsl.s, hsl.l);

    morphed[i * 3] = c.r;
    morphed[i * 3 + 1] = c.g;
    morphed[i * 3 + 2] = c.b;
  }
  layout.morphedColors = morphed;
}

function tick() {
  return new Promise(resolve => setTimeout(resolve, 16)); // ~1 frame
}

// ─── Start ──────────────────────────────────────────────────────
init();
