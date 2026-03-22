/**
 * animator.js — Core animation loop and transition controller.
 */
import * as THREE from 'three';
import { lerpPositions, setTargetPositions } from '../renderer/pointCloud.js';

/**
 * Cubic ease-in-out function.
 */
function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Compute bounding radius of positions.
 */
function computeBoundingRadius(posArray) {
  let maxR2 = 0;
  for (let i = 0; i < posArray.length; i += 3) {
    const r2 = posArray[i] * posArray[i] + posArray[i + 1] * posArray[i + 1] + posArray[i + 2] * posArray[i + 2];
    if (r2 > maxR2) maxR2 = r2;
  }
  return Math.sqrt(maxR2);
}

/**
 * Animation controller — render loop, transitions, auto-cycle.
 */
export class Animator {
  constructor(renderer, scene, camera, controls, geometry, material) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.geometry = geometry;
    this.material = material;

    // Depth sorting
    this.numPoints = geometry.getAttribute('position').count;
    this.sortArray = new Array(this.numPoints);
    for (let i = 0; i < this.numPoints; i++) this.sortArray[i] = i;
    this.sortDistances = new Float32Array(this.numPoints);
    this.cameraPos = new THREE.Vector3();

    // Transition state
    this.isTransitioning = false;
    this.transitionProgress = 0;
    this.transitionSpeed = 1.5;

    // FPS tracking
    this.frameCount = 0;
    this.lastFPSTime = performance.now();
    this.currentFPS = 0;
    this.fpsCallback = null;

    // Callbacks
    this.onFrame = null;
    this.onTransitionComplete = null;

    // Color transitions option
    this.colorTransitions = true;

    // Auto-zoom
    this.autoZoom = false;
    this._targetCameraZ = camera.position.length();

    // Auto-rotate
    this.controls.autoRotate = false;
    this.autoRotateSpeed = 2.0;
    this.controls.autoRotateSpeed = this.autoRotateSpeed;

    // Auto-cycle through ALL layouts
    this.autoCycle = false;
    this.cycleLayouts = [];     // ordered list of all layout names
    this.cycleIndex = 0;
    this.cycleTimer = 0;
    this.cycleDuration = 6;     // seconds to hold each layout
    this.onCycleChange = null;  // callback(name)

    // Start time
    this.startTime = performance.now();
    this.lastTime = performance.now();

    this._loop = this._loop.bind(this);
  }

  start() {
    this._loop();
  }

  setGuiConfig(config) {
    this.guiConfig = config;
  }

  transitionTo(layout, baseColors) {
    let colors = null;

    // Use morphed colors if enabled and available
    if (this.umapColorMorph && layout.morphedColors) {
      colors = layout.morphedColors;
    } else if (this.colorTransitions && layout.colors) {
      colors = layout.colors;
    } else if (baseColors) {
      colors = baseColors;
    }

    if (colors) {
      setTargetPositions(this.geometry, layout.positions, colors);
    } else {
      setTargetPositions(this.geometry, layout.positions);
    }

    // Initialize transition
    this.isTransitioning = true;
    this.transitionProgress = 0;
  }

  _loop() {
    requestAnimationFrame(this._loop);

    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const elapsed = (now - this.startTime) / 1000;

    // Update time uniform
    this.material.uniforms.uTime.value = elapsed;

    // Handle transition
    if (this.isTransitioning) {
      this.transitionProgress += dt / this.transitionSpeed;

      if (this.transitionProgress >= 1) {
        this.transitionProgress = 1;
        this.isTransitioning = false;
      }

      const easedT = easeInOutCubic(this.transitionProgress);
      const lerpFactor = Math.min(easedT * 0.15 + 0.02, 0.2);
      lerpPositions(this.geometry, lerpFactor);

      if (!this.isTransitioning && this.onTransitionComplete) {
        lerpPositions(this.geometry, 1.0);
        this.onTransitionComplete();
      }
    }

    // Auto-zoom (frames the main bulk of the data dynamically)
    if (this.autoZoom) {
      const posArray = this.geometry.getAttribute('position').array;

      // Calculate RMS (Root Mean Square) distance from origin instead of strict maximum.
      // This is highly robust to outliers (e.g. scattered UMAP points) and provides a very stable volume metric.
      let sumDistSq = 0;
      for (let i = 0; i < posArray.length; i += 3) {
        sumDistSq += posArray[i] * posArray[i] + posArray[i + 1] * posArray[i + 1] + posArray[i + 2] * posArray[i + 2];
      }
      const numPoints = posArray.length / 3;
      const rms = Math.sqrt(sumDistSq / numPoints);

      // Scale RMS outward to enclose the primary volume visually
      const visualRadius = rms * 2.0;

      const fov = this.camera.fov * (Math.PI / 180);
      const idealDist = (visualRadius / Math.sin(fov / 2));
      this._targetCameraZ = Math.max(idealDist, 1.0);

      const currentDist = this.camera.position.length();
      // Track distance much faster to keep up with rapid 0s hold continuous cycling
      const newDist = currentDist + (this._targetCameraZ - currentDist) * dt * 5.0;
      const dir = this.camera.position.clone().normalize();
      this.camera.position.copy(dir.multiplyScalar(newDist));
    }

    // Auto-cycle: iterate through all layouts (including t-SNE snapshots)
    if (this.autoCycle && this.cycleLayouts.length > 1 && !this.isTransitioning) {
      this.cycleTimer += dt;
      if (this.cycleTimer >= this.cycleDuration) {
        this.cycleTimer = 0;
        this.cycleIndex = (this.cycleIndex + 1) % this.cycleLayouts.length;
        if (this.onCycleChange) {
          this.onCycleChange(this.cycleLayouts[this.cycleIndex]);
        }
      }
    }

    // Update controls (with robust, flicker-free spherical coordinate auto-rotate)
    if (this.customAutoRotate) {
      const dt = 1.0 / 60.0;
      const speed = this.autoRotateSpeed * dt * 0.2;
      
      // 1. Get current spherical coordinates
      const camPos = this.camera.position;
      const radius = camPos.length();
      let theta = Math.atan2(camPos.x, camPos.z);
      let phi = Math.acos(camPos.y / radius);
      
      // 2. Apply independent wandering velocities
      const rWander = Math.sin(elapsed * 0.13) + Math.cos(elapsed * 0.29) + Math.sin(elapsed * 0.07);
      const pWander = Math.cos(elapsed * 0.11) + Math.sin(elapsed * 0.31) + Math.cos(elapsed * 0.05);
      
      theta += speed * (1.0 + rWander * 0.5);
      phi += speed * pWander * 0.8;
      
      // 3. Enforce range and layout constraints
      // Standard 3D boundaries (avoid poles)
      phi = THREE.MathUtils.clamp(phi, 0.1, Math.PI - 0.1);
      
      // Robust Disc Bumper: Directly clamp Phi away from the flat 90-degree equator
      if (this.currentLayoutName === 'Disc') {
          const equator = Math.PI / 2;
          const restrictedHalfWidth = 0.55; // ~31.5 degrees
          
          if (Math.abs(equator - phi) < restrictedHalfWidth) {
              // Smoothly nudge or snap? Since we're at the coordinate level, 
              // we can just clamp to the nearest valid boundary.
              // To avoid any sudden jumps, we use a very high-frequency lerp if inside.
              const boundary = phi < equator ? (equator - restrictedHalfWidth) : (equator + restrictedHalfWidth);
              phi = THREE.MathUtils.lerp(phi, boundary, 0.15);
          }
      }
      
      // 4. Reconstruct Cartesian position
      this.camera.position.set(
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.cos(theta)
      );
    }

    this.controls.update();


    // Sort particles by depth for correct transparent blending
    this.camera.getWorldPosition(this.cameraPos);
    const pos = this.geometry.getAttribute('position').array;
    for (let i = 0; i < this.numPoints; i++) {
      const dx = pos[i * 3] - this.cameraPos.x;
      const dy = pos[i * 3 + 1] - this.cameraPos.y;
      const dz = pos[i * 3 + 2] - this.cameraPos.z;
      this.sortDistances[i] = dx * dx + dy * dy + dz * dz;
    }

    // Sort back-to-front (descending distance)
    this.sortArray.sort((a, b) => this.sortDistances[b] - this.sortDistances[a]);

    const indexBuffer = this.geometry.getIndex().array;
    for (let i = 0; i < this.numPoints; i++) {
      indexBuffer[i] = this.sortArray[i];
    }
    this.geometry.getIndex().needsUpdate = true;

    // Render
    this.renderer.render(this.scene, this.camera);

    // FPS tracking
    this.frameCount++;
    if (now - this.lastFPSTime >= 1000) {
      this.currentFPS = this.frameCount;
      this.frameCount = 0;
      this.lastFPSTime = now;
      if (this.fpsCallback) this.fpsCallback(this.currentFPS);
    }

    // Custom frame callback
    if (this.onFrame) this.onFrame(elapsed);
  }
}
