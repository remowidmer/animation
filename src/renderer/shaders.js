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
  varying vec3  vPos;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float dist = -mvPos.z;

    // Strong perspective size attenuation — far points get noticeably smaller
    float attenuatedSize = uPointSize * uPixelRatio * (200.0 / dist);
    gl_PointSize = clamp(attenuatedSize, 1.0, 48.0);

    vColor = aColor;
    vPos = position;
  }
`;

export const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uPolyX;
  uniform float uPolyY;
  uniform float uPolyXX;
  uniform float uPolyYY;
  uniform float uPolyXY;
  uniform float uMinZ;
  uniform float uMaxZ;

  varying vec3  vColor;
  varying vec3  vPos;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);

    // Crisp circle
    float alpha = 1.0 - smoothstep(0.35, 0.5, dist);
    alpha *= uOpacity;

    if (alpha < 0.01) discard;

    vec3 finalColor = vColor;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;
