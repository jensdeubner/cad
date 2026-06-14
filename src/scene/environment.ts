import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Studio look helpers: a tone-mapped vertical gradient background (with a
 * gentle vignette) plus a PMREM image-based-lighting environment so PBR
 * surfaces pick up soft studio reflections.
 *
 * The colour math is kept pure (no canvas / no GPU) so it can be unit tested;
 * the texture/PMREM builders are thin wrappers around it.
 */

export interface GradientStops {
  /** Top of the viewport (behind the horizon). */
  top: number;
  /** Bottom of the viewport (under the floor). */
  bottom: number;
}

function clamp8(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function scaleChannels(hex: number, factor: number, blueBoost = 0): number {
  const r = clamp8(((hex >> 16) & 255) * factor);
  const g = clamp8(((hex >> 8) & 255) * factor);
  const b = clamp8((hex & 255) * factor + blueBoost);
  return (r << 16) | (g << 8) | b;
}

/** Rec. 709 relative luminance in 0..1 for a packed 0xRRGGBB colour. */
export function relativeLuminance(hex: number): number {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Derive a pleasing vertical gradient from a single base background colour.
 * Dark backgrounds get a brighter, cooler top and a deep bottom (premium
 * studio); light backgrounds get a soft, low-contrast lift so they still read
 * as a clean light viewport.
 */
export function gradientStops(background: number): GradientStops {
  const dark = relativeLuminance(background) < 0.5;
  if (dark) {
    return {
      top: scaleChannels(background, 1.42, 6),
      bottom: scaleChannels(background, 0.5),
    };
  }
  return {
    top: scaleChannels(background, 1.05, 4),
    bottom: scaleChannels(background, 0.86),
  };
}

function hexString(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, '0')}`;
}

/**
 * Build a vertical gradient texture (top→bottom) with a subtle radial vignette.
 * Sized small (1×H) on the vertical axis; the renderer stretches it to fill.
 */
export function makeGradientTexture(stops: GradientStops, height = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, hexString(stops.top));
  grad.addColorStop(1, hexString(stops.bottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface StudioEnvironment {
  texture: THREE.Texture;
  dispose(): void;
}

/**
 * Generate a PMREM image-based-lighting environment from three's built-in
 * RoomEnvironment. Assign the returned texture to `scene.environment` so every
 * MeshStandard/MeshPhysical surface gains soft reflections.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer): StudioEnvironment {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new RoomEnvironment();
  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return {
    texture: rt.texture,
    dispose() {
      rt.dispose();
    },
  };
}
