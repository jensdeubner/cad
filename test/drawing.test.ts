import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { PlaneAxis } from '../src/types';
import {
  planeNormal,
  planePoint,
  rayHitWorkPlane,
  intersectRayPlane,
  simplifyStroke,
  makeContourLine,
  makeWorkPlaneMesh,
  screenToRay,
} from '../src/drawing';

/**
 * Tests for src/drawing.ts — pure plane / ray / stroke math plus the
 * non-WebGL mesh & Line2 factories. No WebGLRenderer, no canvas 2D texture
 * factories are touched (jsdom has neither). Behavior is pinned as-is.
 */

function fakeDom(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): HTMLElement {
  // screenToRay only calls getBoundingClientRect(); stub just that.
  return {
    getBoundingClientRect: () => rect as DOMRect,
  } as unknown as HTMLElement;
}

/** Ortho cam looking straight down -z onto the xy plane, centred on origin. */
function makeOrthoCam(): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  cam.position.set(0, 0, 50);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

describe('planeNormal', () => {
  it('xy -> +Z', () => {
    expect(planeNormal('xy').toArray()).toEqual([0, 0, 1]);
  });
  it('xz -> +Y', () => {
    expect(planeNormal('xz').toArray()).toEqual([0, 1, 0]);
  });
  it('yz -> +X', () => {
    expect(planeNormal('yz').toArray()).toEqual([1, 0, 0]);
  });
  it('returns unit-length normals', () => {
    (['xy', 'xz', 'yz'] as PlaneAxis[]).forEach((a) => {
      expect(planeNormal(a).length()).toBeCloseTo(1, 12);
    });
  });
  it('returns a fresh Vector3 each call (no shared mutation)', () => {
    const a = planeNormal('xy');
    const b = planeNormal('xy');
    expect(a).not.toBe(b);
    a.set(9, 9, 9);
    expect(b.toArray()).toEqual([0, 0, 1]);
  });
});

describe('planePoint', () => {
  it('xy places position on Z', () => {
    expect(planePoint('xy', 4).toArray()).toEqual([0, 0, 4]);
  });
  it('xz places position on Y', () => {
    expect(planePoint('xz', -2).toArray()).toEqual([0, -2, 0]);
  });
  it('yz places position on X', () => {
    expect(planePoint('yz', 7).toArray()).toEqual([7, 0, 0]);
  });
  it('position 0 is the origin for every axis', () => {
    (['xy', 'xz', 'yz'] as PlaneAxis[]).forEach((a) => {
      expect(planePoint(a, 0).toArray()).toEqual([0, 0, 0]);
    });
  });
});

describe('rayHitWorkPlane', () => {
  it('ray straight down -Z onto xy plane hits at the same x/y, z=position', () => {
    const ray = new THREE.Ray(new THREE.Vector3(2, 3, 10), new THREE.Vector3(0, 0, -1));
    const hit = rayHitWorkPlane(ray, 'xy', 0);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(2, 12);
    expect(hit!.y).toBeCloseTo(3, 12);
    expect(hit!.z).toBeCloseTo(0, 12);
  });

  it('xy plane at non-zero position resolves z=position', () => {
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1));
    const hit = rayHitWorkPlane(ray, 'xy', 4);
    expect(hit!.z).toBeCloseTo(4, 12);
  });

  it('ray parallel to the xy plane returns null', () => {
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 10), new THREE.Vector3(1, 0, 0));
    expect(rayHitWorkPlane(ray, 'xy', 0)).toBeNull();
  });

  it('xz plane: ray down -Y hits at y=position', () => {
    const ray = new THREE.Ray(new THREE.Vector3(1, 10, 2), new THREE.Vector3(0, -1, 0));
    const hit = rayHitWorkPlane(ray, 'xz', 5);
    expect(hit!.x).toBeCloseTo(1, 12);
    expect(hit!.y).toBeCloseTo(5, 12);
    expect(hit!.z).toBeCloseTo(2, 12);
  });

  it('yz plane: ray along -X hits at x=position', () => {
    const ray = new THREE.Ray(new THREE.Vector3(10, 1, 2), new THREE.Vector3(-1, 0, 0));
    const hit = rayHitWorkPlane(ray, 'yz', 3);
    expect(hit!.x).toBeCloseTo(3, 12);
    expect(hit!.y).toBeCloseTo(1, 12);
    expect(hit!.z).toBeCloseTo(2, 12);
  });

  it('returns a cloned Vector3 (an independent instance)', () => {
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    const hit = rayHitWorkPlane(ray, 'xy', 0);
    expect(hit).toBeInstanceOf(THREE.Vector3);
  });
});

describe('intersectRayPlane', () => {
  it('hits a custom plane through a coplanar point along the normal', () => {
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1));
    const hit = intersectRayPlane(
      ray,
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 2),
    );
    expect(hit).not.toBeNull();
    expect(hit!.z).toBeCloseTo(2, 12);
  });

  it('matches rayHitWorkPlane for an equivalent xy plane', () => {
    const ray = new THREE.Ray(new THREE.Vector3(1, 1, 8), new THREE.Vector3(0, 0, -1));
    const a = rayHitWorkPlane(ray, 'xy', 3);
    const b = intersectRayPlane(ray, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 3));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b!.x).toBeCloseTo(a!.x, 12);
    expect(b!.y).toBeCloseTo(a!.y, 12);
    expect(b!.z).toBeCloseTo(a!.z, 12);
  });

  it('returns null when the ray is parallel to the plane', () => {
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 5), new THREE.Vector3(1, 0, 0));
    const hit = intersectRayPlane(
      ray,
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
    );
    expect(hit).toBeNull();
  });

  it('returns null when the plane is behind the ray (no forward hit)', () => {
    // ray going +z from z=10; plane at z=0 is behind -> no intersection.
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, 1));
    const hit = intersectRayPlane(
      ray,
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
    );
    expect(hit).toBeNull();
  });
});

describe('simplifyStroke', () => {
  it('returns a copy (not the same array) when < 2 points', () => {
    const pts = [new THREE.Vector3(1, 2, 3)];
    const out = simplifyStroke(pts, 0.5);
    expect(out).not.toBe(pts);
    expect(out).toHaveLength(1);
    expect(out[0].toArray()).toEqual([1, 2, 3]);
  });

  it('empty input -> empty copy', () => {
    const pts: THREE.Vector3[] = [];
    const out = simplifyStroke(pts, 1);
    expect(out).toEqual([]);
    expect(out).not.toBe(pts);
  });

  it('< 2 path returns the SAME element references (slice, not clone)', () => {
    const p = new THREE.Vector3(0, 0, 0);
    const out = simplifyStroke([p], 1);
    expect(out[0]).toBe(p);
  });

  it('always keeps the first point (cloned)', () => {
    const first = new THREE.Vector3(5, 5, 5);
    const out = simplifyStroke([first, new THREE.Vector3(5.01, 5, 5)], 1);
    expect(out[0].toArray()).toEqual([5, 5, 5]);
    expect(out[0]).not.toBe(first); // first is cloned on the >=2 path
  });

  it('drops points closer than minDist to the last kept point', () => {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.1, 0, 0), // dropped (0.1 < 1)
      new THREE.Vector3(0.2, 0, 0), // dropped (0.2 from kept[0] < 1)
      new THREE.Vector3(1, 0, 0), // kept (1 >= 1)
    ];
    const out = simplifyStroke(pts, 1);
    expect(out.map((p) => p.x)).toEqual([0, 1]);
  });

  it('keeps a point exactly at minDist (>= is inclusive)', () => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0)];
    const out = simplifyStroke(pts, 2);
    expect(out).toHaveLength(2);
  });

  it('keeps every point when all gaps exceed minDist', () => {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(20, 0, 0),
    ];
    const out = simplifyStroke(pts, 1);
    expect(out).toHaveLength(3);
  });

  it('measures distance from the last KEPT point, not the previous input point', () => {
    // tiny incremental steps that each are < minDist from the prior input,
    // but accumulate past minDist from the kept anchor.
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.6, 0, 0), // 0.6 from kept(0) >= 0.5 -> kept
      new THREE.Vector3(0.9, 0, 0), // 0.3 from kept(0.6) < 0.5 -> dropped
      new THREE.Vector3(1.2, 0, 0), // 0.6 from kept(0.6) >= 0.5 -> kept
      new THREE.Vector3(1.4, 0, 0), // 0.2 from kept(1.2) < 0.5 -> dropped
    ];
    const out = simplifyStroke(pts, 0.5);
    // distance is measured from the last KEPT anchor each time, so the kept
    // set is the running anchors 0 -> 0.6 -> 1.2 (1.4 falls inside 1.2's radius).
    expect(out.map((p) => p.x)).toEqual([0, 0.6, 1.2]);
  });

  it('clones kept points (mutating output does not touch input)', () => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0)];
    const out = simplifyStroke(pts, 1);
    out[1].set(99, 99, 99);
    expect(pts[1].toArray()).toEqual([5, 0, 0]);
  });
});

describe('makeWorkPlaneMesh', () => {
  it('names the mesh "work-plane" and sets renderOrder 2', () => {
    const m = makeWorkPlaneMesh('xy', 0, 10);
    expect(m.name).toBe('work-plane');
    expect(m.renderOrder).toBe(2);
    expect(m).toBeInstanceOf(THREE.Mesh);
  });

  it('xy: no rotation, position.z = position', () => {
    const m = makeWorkPlaneMesh('xy', 3, 10);
    expect(m.rotation.x).toBe(0);
    expect(m.rotation.y).toBe(0);
    expect(m.position.z).toBe(3);
    expect(m.position.x).toBe(0);
    expect(m.position.y).toBe(0);
  });

  it('xz: rotation.x = -PI/2, position.y = position', () => {
    const m = makeWorkPlaneMesh('xz', 4, 10);
    expect(m.rotation.x).toBeCloseTo(-Math.PI / 2, 12);
    expect(m.rotation.y).toBe(0);
    expect(m.position.y).toBe(4);
    expect(m.position.z).toBe(0);
  });

  it('yz: rotation.y = PI/2, position.x = position', () => {
    const m = makeWorkPlaneMesh('yz', 5, 10);
    expect(m.rotation.y).toBeCloseTo(Math.PI / 2, 12);
    expect(m.rotation.x).toBe(0);
    expect(m.position.x).toBe(5);
  });

  it('neutral opacity: 0.1 when not drawing, 0.22 when drawing', () => {
    const notDrawing = makeWorkPlaneMesh('xy', 0, 10, false, 'neutral');
    const drawing = makeWorkPlaneMesh('xy', 0, 10, true, 'neutral');
    expect((notDrawing.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.1, 12);
    expect((drawing.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.22, 12);
  });

  it('hit visual: green color 0x22c55e, opacity 0.42', () => {
    const m = makeWorkPlaneMesh('xy', 0, 10, false, 'hit');
    const mat = m.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0x22c55e);
    expect(mat.opacity).toBeCloseTo(0.42, 12);
  });

  it('miss visual: red color 0xef4444, opacity 0.32', () => {
    const m = makeWorkPlaneMesh('xy', 0, 10, false, 'miss');
    const mat = m.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0xef4444);
    expect(mat.opacity).toBeCloseTo(0.32, 12);
  });

  it('neutral visual uses blue color 0x2563eb', () => {
    const m = makeWorkPlaneMesh('xy', 0, 10);
    expect((m.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x2563eb);
  });

  it('drawing flag is ignored for non-neutral visuals (hit stays 0.42)', () => {
    const m = makeWorkPlaneMesh('xy', 0, 10, true, 'hit');
    expect((m.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.42, 12);
  });

  it('material is transparent, double-sided, depthWrite off', () => {
    const mat = makeWorkPlaneMesh('xy', 0, 10).material as THREE.MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.depthWrite).toBe(false);
  });

  it('builds a PlaneGeometry sized by the size argument', () => {
    const m = makeWorkPlaneMesh('xy', 0, 12);
    expect(m.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect((m.geometry as THREE.PlaneGeometry).parameters.width).toBe(12);
    expect((m.geometry as THREE.PlaneGeometry).parameters.height).toBe(12);
  });
});

describe('makeContourLine', () => {
  const res = new THREE.Vector2(800, 600);

  it('open line of 3 points -> 2 segments, renderOrder 1000', () => {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 1, 0),
    ];
    const line = makeContourLine(pts, false, '#ff0000', res, 5);
    // LineSegmentsGeometry stores one instance per segment (N-1 for an open line).
    expect(line.geometry.getAttribute('instanceStart').count).toBe(2);
    expect(line.renderOrder).toBe(1000);
  });

  it('closed line of 3 points appends the first point -> 3 segments', () => {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 1, 0),
    ];
    const line = makeContourLine(pts, true, '#ff0000', res, 5);
    expect(line.geometry.getAttribute('instanceStart').count).toBe(3);
  });

  it('closed flag does NOT close when <= 2 points (3 pts required)', () => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)];
    const line = makeContourLine(pts, true, '#00ff00', res);
    // points.length > 2 is false -> no wrap-around -> 1 segment.
    expect(line.geometry.getAttribute('instanceStart').count).toBe(1);
  });

  it('material color is the hex of the css color string', () => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    const line = makeContourLine(pts, false, '#ff0000', res, 5);
    // LineMaterial stores color as a THREE.Color built from the hex int.
    expect((line.material as { color: THREE.Color }).color.getHex()).toBe(0xff0000);
  });

  it('defaults lineWidth to 5 and copies the resolution', () => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    const line = makeContourLine(pts, false, '#123456', res);
    const mat = line.material as { linewidth: number; resolution: THREE.Vector2 };
    expect(mat.linewidth).toBe(5);
    expect(mat.resolution.x).toBe(800);
    expect(mat.resolution.y).toBe(600);
  });

  it('honors a custom lineWidth argument', () => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    const line = makeContourLine(pts, false, '#123456', res, 9);
    expect((line.material as { linewidth: number }).linewidth).toBe(9);
  });

  it('material draws over geometry: depthTest off, transparent on', () => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    const mat = makeContourLine(pts, false, '#123456', res).material as {
      depthTest: boolean;
      depthWrite: boolean;
      transparent: boolean;
      opacity: number;
    };
    expect(mat.depthTest).toBe(false);
    expect(mat.depthWrite).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(1);
  });
});

describe('screenToRay', () => {
  it('center of a 800x600 element maps an ortho cam ray onto origin', () => {
    const cam = makeOrthoCam();
    const dom = fakeDom({ left: 0, top: 0, width: 800, height: 600 });
    const ray = screenToRay(400, 300, dom, cam);
    // ortho cam at z=50 looking -z: center ray origin sits above origin, dir = -z.
    expect(ray.origin.x).toBeCloseTo(0, 6);
    expect(ray.origin.y).toBeCloseTo(0, 6);
    expect(ray.direction.x).toBeCloseTo(0, 6);
    expect(ray.direction.y).toBeCloseTo(0, 6);
    expect(ray.direction.z).toBeCloseTo(-1, 6);
  });

  it('top-left pixel maps to the camera frustum top-left world corner', () => {
    const cam = makeOrthoCam();
    const dom = fakeDom({ left: 0, top: 0, width: 800, height: 600 });
    const ray = screenToRay(0, 0, dom, cam);
    const hit = rayHitWorkPlane(ray, 'xy', 0);
    // ndc(-1,+1) -> ortho left=-10, top=+10
    expect(hit!.x).toBeCloseTo(-10, 6);
    expect(hit!.y).toBeCloseTo(10, 6);
  });

  it('bottom-right pixel maps to the frustum bottom-right world corner', () => {
    const cam = makeOrthoCam();
    const dom = fakeDom({ left: 0, top: 0, width: 800, height: 600 });
    const ray = screenToRay(800, 600, dom, cam);
    const hit = rayHitWorkPlane(ray, 'xy', 0);
    expect(hit!.x).toBeCloseTo(10, 6);
    expect(hit!.y).toBeCloseTo(-10, 6);
  });

  it('subtracts rect.left/top so an offset element re-centres correctly', () => {
    const cam = makeOrthoCam();
    const dom = fakeDom({ left: 100, top: 50, width: 800, height: 600 });
    // client (500,350) - (left100,top50) = local (400,300) = element centre.
    const ray = screenToRay(500, 350, dom, cam);
    expect(ray.origin.x).toBeCloseTo(0, 6);
    expect(ray.origin.y).toBeCloseTo(0, 6);
  });

  it('returns a THREE.Ray', () => {
    const cam = makeOrthoCam();
    const dom = fakeDom({ left: 0, top: 0, width: 800, height: 600 });
    expect(screenToRay(10, 10, dom, cam)).toBeInstanceOf(THREE.Ray);
  });
});
