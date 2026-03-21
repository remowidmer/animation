/**
 * shaders.js — Custom GLSL shaders for the point cloud.
 * Crisp circular points with strong depth cues for 3D perception.
 */

export const vertexShader = /* glsl */ `
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uTime;

  attribute vec3  aTargetPosition;
  attribute vec3  aColor;
  attribute float aPointId;

  varying vec3  vColor;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float dist = -mvPos.z;

    // Strong perspective size attenuation — far points get noticeably smaller
    float attenuatedSize = uPointSize * uPixelRatio * (200.0 / dist);
    gl_PointSize = clamp(attenuatedSize, 1.0, 48.0);

    vColor = aColor;
  }
`;

export const fragmentShader = /* glsl */ `
  uniform float uOpacity;

  varying vec3  vColor;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);

    // Crisp circle
    float alpha = 1.0 - smoothstep(0.35, 0.5, dist);

    alpha *= uOpacity;

    if (alpha < 0.01) discard;

    // Apply basic color and alpha
    gl_FragColor = vec4(vColor, alpha);
  }
`;
