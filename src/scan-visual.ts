import * as THREE from 'three';

export type ScanDisplayMode = 'cad' | 'kontrast' | 'punkte' | 'flaeche' | 'dunkel';

export interface ScanTheme {
  background: number;
  grid: [number, number];
  solidColor: number;
  solidOpacity: number;
  edgeColor: number;
  edgeOpacity: number;
  /** Winkel-Schwelle für EdgesGeometry — kleiner = mehr Kanten */
  edgeThreshold: number;
  pointOpacity: number;
  ambient: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  dirIntensity: number;
  fillIntensity: number;
  toneExposure: number;
  /** Leicht schattierte Fläche statt flacher Farbe */
  shadedSurface?: boolean;
  /** Studio-Look: Achsenfarben des unendlichen Rasters (X = rot, Z = blau). */
  axisX?: number;
  axisZ?: number;
  /** Stärke der Bild-basierten Beleuchtung (PMREM) auf PBR-Flächen. */
  envIntensity?: number;
}

export interface InfiniteGridColors {
  cell: number;
  section: number;
  axisX: number;
  axisZ: number;
}

/** Rasterfarben (minor/major + Achsen) für den Studio-Boden je Theme. */
export function studioGridColors(theme: ScanTheme): InfiniteGridColors {
  return {
    cell: theme.grid[1],
    section: theme.grid[0],
    axisX: theme.axisX ?? 0xff6b6b,
    axisZ: theme.axisZ ?? 0x5a9bff,
  };
}

/** envMapIntensity / Studio-Reflexion je Theme (Default 1). */
export function envIntensityFor(theme: ScanTheme): number {
  return theme.envIntensity ?? 1;
}

export const SCAN_THEMES: Record<ScanDisplayMode, ScanTheme> = {
  cad: {
    // Premium dark studio (Fusion 360 default is dark) — cohesive with the dark UI shell.
    background: 0x171c26,
    grid: [0x47546d, 0x2a3140],
    solidColor: 0xccd2dc,
    solidOpacity: 1,
    edgeColor: 0x9ab4d8,
    edgeOpacity: 0.92,
    edgeThreshold: 18,
    pointOpacity: 0,
    ambient: 0.5,
    hemiSky: 0xb8c6e0,
    hemiGround: 0x202632,
    hemiIntensity: 0.6,
    dirIntensity: 1.2,
    fillIntensity: 0.35,
    toneExposure: 1.05,
    shadedSurface: true,
    axisX: 0xff6b6b,
    axisZ: 0x5a9bff,
    envIntensity: 1.05,
  },
  kontrast: {
    background: 0xc8d0e0,
    grid: [0x8898b0, 0xa8b4c8],
    solidColor: 0xffffff,
    solidOpacity: 0.55,
    edgeColor: 0x0f1e30,
    edgeOpacity: 1,
    edgeThreshold: 12,
    pointOpacity: 1,
    ambient: 0.9,
    hemiSky: 0xffffff,
    hemiGround: 0x909aaa,
    hemiIntensity: 0.8,
    dirIntensity: 1.2,
    fillIntensity: 0.45,
    toneExposure: 1.1,
  },
  /** Geschlossene Dreiecksflächen statt Punkt-Sprites */
  punkte: {
    background: 0xe8edf5,
    grid: [0xa0a8b8, 0xc0c8d4],
    solidColor: 0xffffff,
    solidOpacity: 0.92,
    edgeColor: 0x1e2a3a,
    edgeOpacity: 0.7,
    edgeThreshold: 8,
    pointOpacity: 0,
    ambient: 1,
    hemiSky: 0xffffff,
    hemiGround: 0xd0d8e4,
    hemiIntensity: 0.65,
    dirIntensity: 1.15,
    fillIntensity: 0.5,
    toneExposure: 1.15,
    shadedSurface: true,
  },
  flaeche: {
    background: 0xdce3f0,
    grid: [0x98a2b8, 0xb8c0d0],
    solidColor: 0xf0f4fa,
    solidOpacity: 0.38,
    edgeColor: 0x0f172a,
    edgeOpacity: 1,
    edgeThreshold: 1,
    pointOpacity: 0.85,
    ambient: 0.9,
    hemiSky: 0xffffff,
    hemiGround: 0xb0b8c8,
    hemiIntensity: 0.75,
    dirIntensity: 1.2,
    fillIntensity: 0.45,
    toneExposure: 1.1,
    shadedSurface: true,
  },
  dunkel: {
    background: 0x10141c,
    grid: [0x3a4458, 0x232b38],
    solidColor: 0xb8c0d0,
    solidOpacity: 0.45,
    edgeColor: 0x6ec8ff,
    edgeOpacity: 0.55,
    edgeThreshold: 12,
    pointOpacity: 0.85,
    ambient: 0.65,
    hemiSky: 0x8898b0,
    hemiGround: 0x1a2030,
    hemiIntensity: 0.5,
    dirIntensity: 0.95,
    fillIntensity: 0.35,
    toneExposure: 0.95,
    axisX: 0xff7a7a,
    axisZ: 0x6ec8ff,
    envIntensity: 0.85,
  },
};

export function applyHeightColors(geom: THREE.BufferGeometry, box: THREE.Box3): void {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const min = box.min;
  const max = box.max;
  const rx = max.x - min.x || 1;
  const ry = max.y - min.y || 1;
  const rz = max.z - min.z || 1;

  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) - min.x) / rx;
    const y = (pos.getY(i) - min.y) / ry;
    const z = (pos.getZ(i) - min.z) / rz;
    colors[i * 3] = 0.25 + x * 0.75;
    colors[i * 3 + 1] = 0.2 + y * 0.7;
    colors[i * 3 + 2] = 0.35 + z * 0.65;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function applyNormalColors(geom: THREE.BufferGeometry): void {
  if (!geom.attributes.normal) geom.computeVertexNormals();
  const normals = geom.attributes.normal;
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    colors[i * 3] = normals.getX(i) * 0.5 + 0.5;
    colors[i * 3 + 1] = normals.getY(i) * 0.5 + 0.5;
    colors[i * 3 + 2] = normals.getZ(i) * 0.5 + 0.5;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function makeScanSolidMaterial(
  theme: ScanTheme,
  solidColor: number,
  opacity: number,
  useVertexColors: boolean,
  clippingPlanes: THREE.Plane[],
): THREE.Material {
  const opaque = opacity >= 0.98;
  if (theme.shadedSurface) {
    return new THREE.MeshStandardMaterial({
      color: solidColor,
      vertexColors: useVertexColors,
      transparent: !opaque,
      opacity,
      side: THREE.DoubleSide,
      clippingPlanes,
      depthWrite: opaque || opacity > 0.45,
      roughness: 0.62,
      metalness: 0.04,
      envMapIntensity: envIntensityFor(theme),
    });
  }
  return new THREE.MeshBasicMaterial({
    color: solidColor,
    vertexColors: useVertexColors,
    transparent: !opaque,
    opacity,
    side: THREE.DoubleSide,
    clippingPlanes,
    depthWrite: opaque || opacity > 0.5,
  });
}

export function brightenColor(hex: number, amount: number): number {
  const r = Math.min(255, ((hex >> 16) & 255) * amount);
  const g = Math.min(255, ((hex >> 8) & 255) * amount);
  const b = Math.min(255, (hex & 255) * amount);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** Volle STL-Auflösung für Festkörper-Darstellung */
export const SOLID_BODY_STRIDE_MAX = 1;