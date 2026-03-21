/**
 * controls.js — OrbitControls setup with damping.
 */
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Set up OrbitControls.
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLCanvasElement} canvas
 * @returns {OrbitControls}
 */
export function createControls(camera, canvas) {
  const controls = new OrbitControls(camera, canvas);

  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.5;
  controls.minDistance = 0.5;
  controls.maxDistance = 10;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.5;

  return controls;
}
