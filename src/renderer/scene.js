/**
 * scene.js — Three.js scene, camera, and renderer setup.
 */
import * as THREE from 'three';

/**
 * Create and configure the Three.js scene, camera, and renderer.
 * @param {HTMLCanvasElement} canvas
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer }}
 */
export function createScene(canvas) {
  // Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0a0a12, 1);

  // Camera
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    50
  );
  camera.position.set(0, 0, 3);

  // Scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a12, 0.25);

  // Handle resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
