/**
 * gui.js — lil-gui control panel for interactive settings.
 */
import GUI from 'lil-gui';

export function createGUI(config, callbacks) {
  const gui = new GUI({ title: '✦ Crystal Visualizer' });

  // Projection selector
  gui.add(config, 'projection', config.projections)
    .name('Projection')
    .onChange(callbacks.onProjectionChange);

  // Visual settings
  const visual = gui.addFolder('Visuals');
  visual.add(config, 'colorscale', ['plotly', 'plasma'])
    .name('Colorscale')
    .onChange(callbacks.onColorscaleChange);
  visual.add(config, 'pointSize', 0.1, 1.0, 0.05)
    .name('Point Size')
    .onChange(callbacks.onPointSizeChange);
  visual.add(config, 'opacity', 0.1, 1.0, 0.05)
    .name('Opacity')
    .onChange(callbacks.onOpacityChange);
  visual.add(config, 'colorTransitions')
    .name('Color Transitions')
    .onChange(callbacks.onColorTransitionsChange);

  // UMAP settings
  const umapFolder = gui.addFolder('UMAP');
  umapFolder.add(config, 'umapMinDist', 0.0, 1.0, 0.01)
    .name('Min Dist (spread)')
    .onFinishChange(callbacks.onUmapRecompute);
  umapFolder.add(config, 'umapNeighbors', 2, 20, 1)
    .name('N Neighbors')
    .onFinishChange(callbacks.onUmapRecompute);
  umapFolder.add(config, 'umapColorMorph')
    .name('Sweep Color Morph')
    .onChange(callbacks.onUmapColorMorphChange);
  umapFolder.close();

  // Animation settings
  const anim = gui.addFolder('Animation');
  anim.add(config, 'transitionSpeed', 0.3, 5.0, 0.1)
    .name('Transition Speed (s)')
    .onChange(callbacks.onTransitionSpeedChange);

  // Disc Settings
  const discFolder = gui.addFolder('Disc Settings');

  const polyFolder = discFolder.addFolder('Z-Surface Polynomial');
  polyFolder.add(config.polyConfig, 'a', -100.0, 100.0).name('Intercept').onChange(callbacks.onPolyChange);
  polyFolder.add(config.polyConfig, 'x', -10.0, 10.0).name('X').onChange(callbacks.onPolyChange);
  polyFolder.add(config.polyConfig, 'y', -10.0, 10.0).name('Y').onChange(callbacks.onPolyChange);
  polyFolder.add(config.polyConfig, 'xx', -0.5, 0.5, 0.001).name('X²').onChange(callbacks.onPolyChange);
  polyFolder.add(config.polyConfig, 'yy', -0.5, 0.5, 0.001).name('Y²').onChange(callbacks.onPolyChange);
  polyFolder.add(config.polyConfig, 'xy', -1.0, 1.0, 0.001).name('XY').onChange(callbacks.onPolyChange);
  discFolder.close();

  // Camera
  const camera = gui.addFolder('Camera');
  camera.add(config, 'autoZoom')
    .name('Auto Zoom')
    .onChange(callbacks.onAutoZoomChange);
  camera.add(config, 'autoRotate')
    .name('Auto Rotate')
    .onChange(callbacks.onAutoRotateChange);
  camera.add(config, 'autoRotateSpeed', 0.1, 10.0, 0.1)
    .name('Rotate Speed')
    .onChange(callbacks.onAutoRotateSpeedChange);

  // Auto-cycle
  const cycle = gui.addFolder('Auto Cycle');
  cycle.add(config, 'cycleEnabled')
    .name('Enable Auto Cycle')
    .onChange(callbacks.onCycleToggle);
  cycle.add(config, 'cyclePreset', ['Custom', 'Grand Tour'])
    .name('Preset')
    .onChange(callbacks.onCycleToggle);
  cycle.add(config, 'cycleDuration', 0, 30, 0.5)
    .name('Hold Time (s)')
    .onChange(callbacks.onCycleDurationChange);

  const cycleList = cycle.addFolder('Projections to Cycle');
  cycleList.add(config, 'cycle_PCA').name('PCA').onChange(callbacks.onCycleToggle);
  cycleList.add(config, 'cycle_CubicGrid').name('Cubic Grid').onChange(callbacks.onCycleToggle);
  cycleList.add(config, 'cycle_HexGrid').name('Hex Grid').onChange(callbacks.onCycleToggle);
  cycleList.add(config, 'cycle_Disc').name('Disc').onChange(callbacks.onCycleToggle);
  cycleList.add(config, 'cycle_UMAP').name('UMAP').onChange(callbacks.onCycleToggle);

  return gui;
}
