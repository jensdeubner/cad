import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  sketchLabelForAxis,
  parseOriginPlaneName,
  originPlaneAxisFromObject,
  viewPresetForSketchAxis,
  originPlaneSize,
  sketchGridExtent,
  makeOriginPlaneMesh,
  makeOriginPlaneBorder,
  makeSketchGrid,
  makeSketchOriginMarker,
  ORIGIN_PLANE_NAMES,
  ORIGIN_PLANE_COLORS,
  ORIGIN_PLANE_MIN,
  ORIGIN_PLANE_MAX,
  ORIGIN_PLANE_SCENE_FACTOR,
  EMPTY_PROJECT_VIEW_SIZE,
  SKETCH_GRID_COLOR,
  SKETCH_ORIGIN_COLOR,
} from '../src/sketch';
import type { PlaneAxis } from '../src/types';

const AXES: PlaneAxis[] = ['xy', 'xz', 'yz'];

describe('sketchLabelForAxis', () => {
  it('returns base German label without index for index 0', () => {
    expect(sketchLabelForAxis('xy')).toBe('Skizze XY');
    expect(sketchLabelForAxis('xz')).toBe('Skizze XZ');
    expect(sketchLabelForAxis('yz')).toBe('Skizze YZ');
  });

  it('defaults index to 0 when omitted', () => {
    expect(sketchLabelForAxis('xy', 0)).toBe('Skizze XY');
  });

  it('appends index+1 when index > 0', () => {
    expect(sketchLabelForAxis('xy', 1)).toBe('Skizze XY 2');
    expect(sketchLabelForAxis('yz', 4)).toBe('Skizze YZ 5');
  });

  it('uppercases the axis in the base', () => {
    expect(sketchLabelForAxis('xz', 2)).toBe('Skizze XZ 3');
  });
});

describe('parseOriginPlaneName', () => {
  it('parses plain origin-plane-<axis> names', () => {
    expect(parseOriginPlaneName('origin-plane-xy')).toBe('xy');
    expect(parseOriginPlaneName('origin-plane-xz')).toBe('xz');
    expect(parseOriginPlaneName('origin-plane-yz')).toBe('yz');
  });

  it('parses origin-plane-group-<axis> names', () => {
    expect(parseOriginPlaneName('origin-plane-group-xy')).toBe('xy');
    expect(parseOriginPlaneName('origin-plane-group-xz')).toBe('xz');
    expect(parseOriginPlaneName('origin-plane-group-yz')).toBe('yz');
  });

  it('does NOT parse border names (returns null) — border is not recognized here', () => {
    expect(parseOriginPlaneName('origin-plane-border-xy')).toBeNull();
    expect(parseOriginPlaneName('origin-plane-border-xz')).toBeNull();
    expect(parseOriginPlaneName('origin-plane-border-yz')).toBeNull();
  });

  it('returns null for unrelated or empty names', () => {
    expect(parseOriginPlaneName('')).toBeNull();
    expect(parseOriginPlaneName('sketch-origin')).toBeNull();
    expect(parseOriginPlaneName('origin-plane-zz')).toBeNull();
    expect(parseOriginPlaneName('origin-plane-label-xy')).toBeNull();
  });
});

describe('originPlaneAxisFromObject', () => {
  it('returns the axis when the object itself carries an origin-plane name', () => {
    const obj = new THREE.Object3D();
    obj.name = 'origin-plane-xz';
    expect(originPlaneAxisFromObject(obj)).toBe('xz');
  });

  it('walks up parents to find an origin-plane-group ancestor', () => {
    const group = new THREE.Object3D();
    group.name = 'origin-plane-group-yz';
    const mid = new THREE.Object3D();
    const leaf = new THREE.Object3D();
    mid.add(leaf);
    group.add(mid);
    expect(originPlaneAxisFromObject(leaf)).toBe('yz');
  });

  it('returns the nearest matching ancestor axis (child name wins over ancestor)', () => {
    const ancestor = new THREE.Object3D();
    ancestor.name = 'origin-plane-group-xy';
    const child = new THREE.Object3D();
    child.name = 'origin-plane-xz';
    ancestor.add(child);
    expect(originPlaneAxisFromObject(child)).toBe('xz');
  });

  it('returns null when no ancestor matches', () => {
    const root = new THREE.Object3D();
    root.name = 'scene';
    const child = new THREE.Object3D();
    child.name = 'mesh';
    root.add(child);
    expect(originPlaneAxisFromObject(child)).toBeNull();
  });

  it('does not match a border-named object (border is unparseable)', () => {
    const obj = new THREE.Object3D();
    obj.name = 'origin-plane-border-xy';
    expect(originPlaneAxisFromObject(obj)).toBeNull();
  });
});

describe('viewPresetForSketchAxis', () => {
  it('maps xy -> top', () => {
    expect(viewPresetForSketchAxis('xy')).toBe('top');
  });
  it('maps xz -> front', () => {
    expect(viewPresetForSketchAxis('xz')).toBe('front');
  });
  it('maps yz -> side', () => {
    expect(viewPresetForSketchAxis('yz')).toBe('side');
  });
});

describe('originPlaneSize clamping', () => {
  it('clamps to min (52) for a small scene', () => {
    // 100 * 0.34 = 34 -> below min
    expect(originPlaneSize(100)).toBe(ORIGIN_PLANE_MIN);
    expect(originPlaneSize(0)).toBe(52);
  });

  it('clamps to max (96) for a large scene', () => {
    // 1000 * 0.34 = 340 -> above max
    expect(originPlaneSize(1000)).toBe(ORIGIN_PLANE_MAX);
  });

  it('returns the scaled value when in [52, 96] (mid: 200 * 0.34 = 68)', () => {
    expect(originPlaneSize(200)).toBeCloseTo(200 * ORIGIN_PLANE_SCENE_FACTOR, 10);
    expect(originPlaneSize(200)).toBeCloseTo(68, 10);
  });

  it('exposes consistent constants used in scaling', () => {
    expect(ORIGIN_PLANE_SCENE_FACTOR).toBe(0.34);
    expect(ORIGIN_PLANE_MIN).toBe(52);
    expect(ORIGIN_PLANE_MAX).toBe(96);
    expect(EMPTY_PROJECT_VIEW_SIZE).toBe(200);
  });

  it('hits exactly min and max at the boundary scene sizes', () => {
    // scaled == 52 exactly at sceneSize = 52/0.34
    expect(originPlaneSize(52 / 0.34)).toBeCloseTo(52, 6);
    // scaled == 96 exactly at sceneSize = 96/0.34
    expect(originPlaneSize(96 / 0.34)).toBeCloseTo(96, 6);
  });
});

describe('sketchGridExtent', () => {
  it('uses sceneSize * 0.45 when that dominates (mid scene 200 -> 90)', () => {
    // sceneSize*0.45 = 90; originPlaneSize(200)*0.85 = 68*0.85 = 57.8 -> max is 90
    expect(sketchGridExtent(200)).toBeCloseTo(90, 10);
  });

  it('uses originPlaneSize*0.85 when scene*0.45 is smaller (small scene)', () => {
    // sceneSize 10: 10*0.45 = 4.5; originPlaneSize(10) = 52 (min) -> 52*0.85 = 44.2
    expect(sketchGridExtent(10)).toBeCloseTo(52 * 0.85, 10);
    expect(sketchGridExtent(10)).toBeCloseTo(44.2, 10);
  });

  it('grows with scene*0.45 for large scenes', () => {
    // sceneSize 1000: 1000*0.45 = 450; originPlaneSize(1000)=96 -> 96*0.85=81.6 -> 450 wins
    expect(sketchGridExtent(1000)).toBeCloseTo(450, 10);
  });
});

describe('makeOriginPlaneMesh', () => {
  it('names the mesh per axis', () => {
    for (const axis of AXES) {
      const mesh = makeOriginPlaneMesh(axis, 60);
      expect(mesh.name).toBe(ORIGIN_PLANE_NAMES[axis]);
    }
  });

  it('is a Mesh with PlaneGeometry of the given size and renderOrder 4', () => {
    const mesh = makeOriginPlaneMesh('xy', 60);
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect((mesh.geometry as THREE.PlaneGeometry).parameters.width).toBe(60);
    expect((mesh.geometry as THREE.PlaneGeometry).parameters.height).toBe(60);
    expect(mesh.renderOrder).toBe(4);
  });

  it('uses the axis color on a transparent DoubleSide material', () => {
    const mesh = makeOriginPlaneMesh('xz', 60);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(ORIGIN_PLANE_COLORS['xz']);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.18, 10);
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.depthWrite).toBe(false);
  });

  it('orients xy as identity (no rotation, origin at 0)', () => {
    const mesh = makeOriginPlaneMesh('xy', 60);
    expect(mesh.rotation.x).toBeCloseTo(0, 10);
    expect(mesh.rotation.y).toBeCloseTo(0, 10);
    expect(mesh.rotation.z).toBeCloseTo(0, 10);
    expect(mesh.position.x).toBeCloseTo(0, 10);
    expect(mesh.position.y).toBeCloseTo(0, 10);
    expect(mesh.position.z).toBeCloseTo(0, 10);
  });

  it('orients xz with rotation.x = -PI/2', () => {
    const mesh = makeOriginPlaneMesh('xz', 60);
    expect(mesh.rotation.x).toBeCloseTo(-Math.PI / 2, 10);
    expect(mesh.rotation.y).toBeCloseTo(0, 10);
  });

  it('orients yz with rotation.y = PI/2', () => {
    const mesh = makeOriginPlaneMesh('yz', 60);
    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2, 10);
    expect(mesh.rotation.x).toBeCloseTo(0, 10);
  });
});

describe('makeOriginPlaneBorder', () => {
  it('is a LineSegments named origin-plane-border-<axis> with renderOrder 5', () => {
    for (const axis of AXES) {
      const border = makeOriginPlaneBorder(axis, 80);
      expect(border).toBeInstanceOf(THREE.LineSegments);
      expect(border.name).toBe(`origin-plane-border-${axis}`);
      expect(border.renderOrder).toBe(5);
    }
  });

  it('has 8 position vertices (4 segments forming the square outline)', () => {
    const border = makeOriginPlaneBorder('xy', 80);
    const pos = border.geometry.getAttribute('position');
    expect(pos.count).toBe(8); // 4 segments * 2 endpoints
    expect(pos.array.length).toBe(24); // 8 verts * 3 components
  });

  it('places corners at +/- size/2 in the local plane', () => {
    const size = 80;
    const h = size / 2;
    const border = makeOriginPlaneBorder('xy', size);
    const pos = border.geometry.getAttribute('position') as THREE.BufferAttribute;
    // first segment endpoint a = (-h, -h, 0); local z is always 0
    expect(pos.getX(0)).toBeCloseTo(-h, 10);
    expect(pos.getY(0)).toBeCloseTo(-h, 10);
    expect(pos.getZ(0)).toBeCloseTo(0, 10);
    // every local z-coordinate is 0 before orientation transform
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getZ(i)).toBeCloseTo(0, 10);
      expect(Math.abs(pos.getX(i))).toBeCloseTo(h, 10);
      expect(Math.abs(pos.getY(i))).toBeCloseTo(h, 10);
    }
  });

  it('uses the axis color on its line material', () => {
    const border = makeOriginPlaneBorder('yz', 80);
    const mat = border.material as THREE.LineBasicMaterial;
    expect(mat.color.getHex()).toBe(ORIGIN_PLANE_COLORS['yz']);
    expect(mat.opacity).toBeCloseTo(0.85, 10);
  });

  it('orients the border like the plane (xz -> rotation.x = -PI/2)', () => {
    expect(makeOriginPlaneBorder('xz', 80).rotation.x).toBeCloseTo(-Math.PI / 2, 10);
    expect(makeOriginPlaneBorder('yz', 80).rotation.y).toBeCloseTo(Math.PI / 2, 10);
    expect(makeOriginPlaneBorder('xy', 80).rotation.x).toBeCloseTo(0, 10);
  });
});

describe('makeSketchGrid', () => {
  it('builds a LineSegments named sketch-grid-lines with renderOrder 3', () => {
    const grid = makeSketchGrid('xy', 0, 10, 5);
    expect(grid).toBeInstanceOf(THREE.LineSegments);
    expect(grid.name).toBe('sketch-grid-lines');
    expect(grid.renderOrder).toBe(3);
  });

  it('uses the grid color on a transparent material', () => {
    const grid = makeSketchGrid('xy', 0, 10, 5);
    const mat = grid.material as THREE.LineBasicMaterial;
    expect(mat.color.getHex()).toBe(SKETCH_GRID_COLOR);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.45, 10);
  });

  it('produces vertices for both u and v lines across the grid count', () => {
    // count = ceil(extent/spacing) = ceil(10/5) = 2 -> i in [-2..2] = 5 rows
    // each i pushes 2 lines (u and v), each line = 2 verts -> 4 verts per i
    const grid = makeSketchGrid('xy', 0, 10, 5);
    const pos = grid.geometry.getAttribute('position');
    // 5 rows * 4 verts = 20 verts
    expect(pos.count).toBe(20);
  });

  it('rounds the line count up via ceil(extent/spacing)', () => {
    // extent 11, spacing 5 -> ceil(2.2) = 3 -> i in [-3..3] = 7 rows -> 7*4 = 28 verts
    const grid = makeSketchGrid('xy', 0, 11, 5);
    expect(grid.geometry.getAttribute('position').count).toBe(28);
  });

  it('lays the xy grid flat on the z=0 plane (all world z == 0)', () => {
    const grid = makeSketchGrid('xy', 0, 10, 5);
    const pos = grid.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getZ(i)).toBeCloseTo(0, 6);
    }
  });

  it('offsets the xy grid in world z by the sketch position', () => {
    const grid = makeSketchGrid('xy', 7, 10, 5);
    const pos = grid.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getZ(i)).toBeCloseTo(7, 6);
    }
  });

  it('lays the xz grid in world y by the sketch position', () => {
    const grid = makeSketchGrid('xz', 3, 10, 5);
    const pos = grid.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeCloseTo(3, 6);
    }
  });
});

describe('makeSketchOriginMarker', () => {
  it('builds a Group named sketch-origin', () => {
    const group = makeSketchOriginMarker('xy', 0, 5);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe('sketch-origin');
  });

  it('contains a cross (LineSegments), a ring (Line) and a dot (Mesh)', () => {
    const group = makeSketchOriginMarker('xy', 0, 5);
    const lineSegs = group.children.filter((c) => c instanceof THREE.LineSegments);
    const plainLines = group.children.filter(
      (c) => c instanceof THREE.Line && !(c instanceof THREE.LineSegments),
    );
    const meshes = group.children.filter((c) => c instanceof THREE.Mesh);
    expect(lineSegs.length).toBe(1);
    expect(plainLines.length).toBe(1);
    expect(meshes.length).toBe(1);
  });

  it('names the dot sketch-origin-dot, flags it pickable, uses a SphereGeometry', () => {
    const group = makeSketchOriginMarker('xy', 0, 5);
    const dot = group.getObjectByName('sketch-origin-dot') as THREE.Mesh;
    expect(dot).toBeDefined();
    expect(dot.userData.sketchOriginPick).toBe(true);
    expect(dot.geometry).toBeInstanceOf(THREE.SphereGeometry);
  });

  it('places the dot at the plane origin (xy position offsets world z)', () => {
    const group = makeSketchOriginMarker('xy', 4, 5);
    const dot = group.getObjectByName('sketch-origin-dot') as THREE.Mesh;
    expect(dot.position.x).toBeCloseTo(0, 10);
    expect(dot.position.y).toBeCloseTo(0, 10);
    expect(dot.position.z).toBeCloseTo(4, 10);
  });

  it('records base dot scale and opacity in userData for highlight toggling', () => {
    const group = makeSketchOriginMarker('xy', 0, 5);
    expect(group.userData.baseDotScale).toBeCloseTo(1, 10);
    expect(group.userData.baseDotOpacity).toBeCloseTo(0.85, 10);
  });

  it('uses the origin color for the cross line material', () => {
    const group = makeSketchOriginMarker('xy', 0, 5);
    const cross = group.children.find(
      (c) => c instanceof THREE.LineSegments,
    ) as THREE.LineSegments;
    const mat = cross.material as THREE.LineBasicMaterial;
    expect(mat.color.getHex()).toBe(SKETCH_ORIGIN_COLOR);
  });

  it('builds the ring with segments+1 = 25 vertices (closed circle)', () => {
    const group = makeSketchOriginMarker('xy', 0, 5);
    const ring = group.children.find(
      (c) => c instanceof THREE.Line && !(c instanceof THREE.LineSegments),
    ) as THREE.Line;
    expect(ring.geometry.getAttribute('position').count).toBe(25);
  });
});
