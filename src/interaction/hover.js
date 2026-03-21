/**
 * hover.js — GPU raycaster for point hover detection and tooltip display.
 */
import * as THREE from 'three';

/**
 * Create hover interaction system.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Points} points
 * @param {THREE.ShaderMaterial} material
 * @param {string[]} labels     Point labels for tooltip
 * @param {number[]} clusterIds Cluster IDs for tooltip metadata
 * @returns {{ update: Function, dispose: Function }}
 */
export function createHoverSystem(camera, points, material, labels, clusterIds) {
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.05;

  const mouse = new THREE.Vector2();
  const tooltip = document.getElementById('tooltip');
  const tooltipLabel = tooltip.querySelector('.tooltip-label');
  const tooltipMeta = tooltip.querySelector('.tooltip-meta');

  let currentHighlight = -1;
  let isMouseTracking = false;

  function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Position tooltip near cursor
    if (currentHighlight >= 0) {
      tooltip.style.left = `${event.clientX + 16}px`;
      tooltip.style.top = `${event.clientY - 10}px`;
    }

    isMouseTracking = true;
  }

  function onMouseLeave() {
    isMouseTracking = false;
    hideTooltip();
    setHighlight(-1);
  }

  function showTooltip(index) {
    tooltipLabel.textContent = labels[index] || `Point ${index}`;
    tooltipMeta.textContent = `Index: ${index}\nCluster: ${clusterIds[index]}`;
    tooltip.classList.remove('hidden');
  }

  function hideTooltip() {
    tooltip.classList.add('hidden');
  }

  function setHighlight(index) {
    currentHighlight = index;
    material.uniforms.uHighlightIndex.value = index;
  }

  // Throttled raycasting (every 3 frames via manual counter)
  let frameCounter = 0;

  function update() {
    frameCounter++;
    if (frameCounter % 3 !== 0 || !isMouseTracking) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(points);

    if (intersects.length > 0) {
      const nearest = intersects[0];
      const idx = nearest.index;

      if (idx !== currentHighlight) {
        setHighlight(idx);
        showTooltip(idx);
      }
    } else {
      if (currentHighlight >= 0) {
        setHighlight(-1);
        hideTooltip();
      }
    }
  }

  // Attach listeners
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseleave', onMouseLeave);

  function dispose() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseleave', onMouseLeave);
  }

  return { update, dispose };
}
