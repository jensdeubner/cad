import * as THREE from 'three';

/**
 * Infinite, anti-aliased floor grid on the XZ plane (y = 0) implemented as a
 * single large plane with a fragment shader. Lines stay ~screen-stable width
 * via fwidth(), minor + major spacings are drawn, the X/Z centre axes are
 * tinted, and everything fades radially into the background so there is no hard
 * square boundary (unlike THREE.GridHelper).
 */

export interface InfiniteGridColors {
  cell: number;
  section: number;
  axisX: number;
  axisZ: number;
}

export interface InfiniteGridConfig {
  cellSize?: number;
  sectionSize?: number;
  fadeNear?: number;
  fadeFar?: number;
  colors?: Partial<InfiniteGridColors>;
  opacity?: number;
}

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;

  uniform float uCellSize;
  uniform float uSectionSize;
  uniform vec3 uCellColor;
  uniform vec3 uSectionColor;
  uniform vec3 uAxisXColor;
  uniform vec3 uAxisZColor;
  uniform float uFadeNear;
  uniform float uFadeFar;
  uniform vec2 uCenter;
  uniform float uOpacity;

  float gridMask(vec2 wxz, float size, float thickness) {
    vec2 coord = wxz / size;
    vec2 deriv = fwidth(coord);
    vec2 g = abs(fract(coord - 0.5) - 0.5) / (deriv * thickness);
    float line = min(g.x, g.y);
    return 1.0 - min(line, 1.0);
  }

  float axisMask(float v, float thickness) {
    float d = fwidth(v) * thickness;
    return 1.0 - min(abs(v) / d, 1.0);
  }

  void main() {
    vec2 wxz = vWorld.xz;

    float minor = gridMask(wxz, uCellSize, 1.0);
    float major = gridMask(wxz, uSectionSize, 1.4);

    vec3 color = uCellColor;
    float alpha = minor * 0.5;
    color = mix(color, uSectionColor, major);
    alpha = max(alpha, major * 0.85);

    // x ~= 0 -> the Z axis (runs along Z); z ~= 0 -> the X axis (runs along X)
    float zAxis = axisMask(vWorld.x, 1.6);
    float xAxis = axisMask(vWorld.z, 1.6);
    color = mix(color, uAxisZColor, zAxis);
    alpha = max(alpha, zAxis);
    color = mix(color, uAxisXColor, xAxis);
    alpha = max(alpha, xAxis);

    float dist = distance(wxz, uCenter);
    float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, dist);
    alpha *= fade * uOpacity;
    if (alpha <= 0.001) discard;

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface InfiniteGrid {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  configure(config: InfiniteGridConfig): void;
  setColors(colors: Partial<InfiniteGridColors>): void;
  setCenter(x: number, z: number): void;
  setOpacity(value: number): void;
  dispose(): void;
}

const DEFAULT_COLORS: InfiniteGridColors = {
  cell: 0x2a3346,
  section: 0x3d4a63,
  axisX: 0xff6b6b,
  axisZ: 0x5a9bff,
};

export function createInfiniteGrid(config: InfiniteGridConfig = {}): InfiniteGrid {
  const colors = { ...DEFAULT_COLORS, ...(config.colors ?? {}) };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uCellSize: { value: config.cellSize ?? 10 },
      uSectionSize: { value: config.sectionSize ?? 100 },
      uCellColor: { value: new THREE.Color(colors.cell) },
      uSectionColor: { value: new THREE.Color(colors.section) },
      uAxisXColor: { value: new THREE.Color(colors.axisX) },
      uAxisZColor: { value: new THREE.Color(colors.axisZ) },
      uFadeNear: { value: config.fadeNear ?? 200 },
      uFadeFar: { value: config.fadeFar ?? 800 },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uOpacity: { value: config.opacity ?? 1 },
    },
  });
  // WebGL1 fallback for fwidth(); native in WebGL2.
  (material.extensions as { derivatives?: boolean }).derivatives = true;

  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  geometry.rotateX(-Math.PI / 2); // lie flat in XZ
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'infinite-grid';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  function applyScale() {
    const far = material.uniforms.uFadeFar.value as number;
    mesh.scale.setScalar(far * 2.6);
  }
  applyScale();

  return {
    mesh,
    material,
    configure(c: InfiniteGridConfig) {
      if (c.cellSize !== undefined) material.uniforms.uCellSize.value = c.cellSize;
      if (c.sectionSize !== undefined) material.uniforms.uSectionSize.value = c.sectionSize;
      if (c.fadeNear !== undefined) material.uniforms.uFadeNear.value = c.fadeNear;
      if (c.fadeFar !== undefined) material.uniforms.uFadeFar.value = c.fadeFar;
      if (c.opacity !== undefined) material.uniforms.uOpacity.value = c.opacity;
      if (c.colors) this.setColors(c.colors);
      applyScale();
    },
    setColors(c: Partial<InfiniteGridColors>) {
      if (c.cell !== undefined) (material.uniforms.uCellColor.value as THREE.Color).setHex(c.cell);
      if (c.section !== undefined)
        (material.uniforms.uSectionColor.value as THREE.Color).setHex(c.section);
      if (c.axisX !== undefined)
        (material.uniforms.uAxisXColor.value as THREE.Color).setHex(c.axisX);
      if (c.axisZ !== undefined)
        (material.uniforms.uAxisZColor.value as THREE.Color).setHex(c.axisZ);
    },
    setCenter(x: number, z: number) {
      (material.uniforms.uCenter.value as THREE.Vector2).set(x, z);
    },
    setOpacity(value: number) {
      material.uniforms.uOpacity.value = value;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Pick a "nice" grid cell size (1/2/5 × 10ⁿ) so the minor spacing stays legible
 * relative to the model size. Pure — used to drive the grid uniforms.
 */
export function niceGridStep(sceneSize: number): number {
  const target = Math.max(sceneSize, 1) / 20;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / pow;
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return step * pow;
}
