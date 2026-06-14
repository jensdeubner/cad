/**
 * cad-script · Solid (Track A, the parametric/mechanical object)
 *
 * The chainable value the script API hands to the agent. A `Solid` wraps an
 * oriented, welded `Mesh` plus provenance, and exposes the operations the
 * architecture doc's §4 build123d surface calls for: primitive factories,
 * transforms, the three booleans, mass properties, and — crucially — typed
 * topological selectors (§5) via `.faces()/.edges()/.vertices()`.
 *
 * Operations are non-mutating: each returns a fresh `Solid`. Every fabrication
 * stamps a monotonically increasing provenance tag onto its triangles, so
 * `Select.LAST` can name "the faces created by the most recent op" without
 * fragile numeric ids.
 */
import {
  Mesh,
  Vec3,
  Bounds,
  orient,
  tagMesh,
  volume as meshVolume,
  bounds as meshBounds,
  triangleCount,
  cloneMesh,
  translateMesh,
  rotateMesh,
  scaleMesh,
  isWatertight,
} from './mesh';
import { box, cylinder, sphere, cone, torus, wedge } from './primitives';
import { extrudeProfile, revolveProfile, ExtrudeOptions, RevolveOptions } from './sketch';
import type { P2 } from './triangulate';
import { meshUnion, meshSubtract, meshIntersect } from './csg';
import {
  Select,
  ShapeList,
  FaceInfo,
  EdgeInfo,
  VertexInfo,
  extractFaces,
  extractEdges,
  extractVertices,
  maxTag,
} from './selectors';

let OP_COUNTER = 0;
/** Next monotonic provenance tag. Exposed for tests that reset determinism. */
export function nextOpId(): number {
  return ++OP_COUNTER;
}

export class Solid {
  readonly mesh: Mesh;
  readonly opId: number;

  constructor(mesh: Mesh, opId?: number) {
    const m = orient(mesh);
    this.opId = opId ?? nextOpId();
    if (!m.tags) tagMesh(m, this.opId);
    this.mesh = m;
  }

  // ── factories ──────────────────────────────────────────────────────────
  static box(sx?: number, sy?: number, sz?: number): Solid {
    return new Solid(box(sx, sy, sz));
  }
  static cylinder(r?: number, h?: number, seg?: number): Solid {
    return new Solid(cylinder(r, h, seg));
  }
  static sphere(r?: number, uSeg?: number, vSeg?: number): Solid {
    return new Solid(sphere(r, uSeg, vSeg));
  }
  static cone(r?: number, h?: number, seg?: number): Solid {
    return new Solid(cone(r, h, seg));
  }
  static torus(R?: number, r?: number, seg?: number, sides?: number): Solid {
    return new Solid(torus(R, r, seg, sides));
  }
  static wedge(sx?: number, sy?: number, h?: number): Solid {
    return new Solid(wedge(sx, sy, h));
  }
  static extrude(profile: P2[], opts?: ExtrudeOptions): Solid {
    return new Solid(extrudeProfile(profile, opts));
  }
  static revolve(profile: P2[], opts?: RevolveOptions): Solid {
    return new Solid(revolveProfile(profile, opts));
  }
  static fromMesh(mesh: Mesh): Solid {
    return new Solid(cloneMesh(mesh));
  }

  // ── transforms (non-mutating) ────────────────────────────────────────────
  translate(dx: number, dy: number, dz: number): Solid {
    return new Solid(translateMesh(this.mesh, dx, dy, dz), this.opId);
  }
  /** Rotate about an axis through the origin, angle in DEGREES. */
  rotate(axis: Vec3, deg: number): Solid {
    return new Solid(rotateMesh(this.mesh, axis, (deg * Math.PI) / 180), this.opId);
  }
  rotateX(deg: number): Solid {
    return this.rotate([1, 0, 0], deg);
  }
  rotateY(deg: number): Solid {
    return this.rotate([0, 1, 0], deg);
  }
  rotateZ(deg: number): Solid {
    return this.rotate([0, 0, 1], deg);
  }
  scale(sx: number, sy?: number, sz?: number): Solid {
    return new Solid(scaleMesh(this.mesh, sx, sy ?? sx, sz ?? sx), this.opId);
  }

  // ── booleans (provenance preserved by CSG) ─────────────────────────────
  /** A ∪ B. Aliases: `add`, `union`. */
  fuse(other: Solid): Solid {
    return new Solid(meshUnion(this.mesh, other.mesh), nextOpId());
  }
  add(other: Solid): Solid {
    return this.fuse(other);
  }
  union(other: Solid): Solid {
    return this.fuse(other);
  }
  /** A − B. Aliases: `subtract`. */
  cut(other: Solid): Solid {
    return new Solid(meshSubtract(this.mesh, other.mesh), nextOpId());
  }
  subtract(other: Solid): Solid {
    return this.cut(other);
  }
  /** A ∩ B. */
  intersect(other: Solid): Solid {
    return new Solid(meshIntersect(this.mesh, other.mesh), nextOpId());
  }

  // ── mass properties ────────────────────────────────────────────────────
  volume(): number {
    return meshVolume(this.mesh);
  }
  bounds(): Bounds | null {
    return meshBounds(this.mesh);
  }
  triangleCount(): number {
    return triangleCount(this.mesh);
  }
  isWatertight(): boolean {
    return isWatertight(this.mesh);
  }

  // ── selectors (§5) ──────────────────────────────────────────────────────
  faces(sel: Select = Select.ALL): ShapeList<FaceInfo> {
    const all = extractFaces(this.mesh);
    if (sel === Select.ALL) return all;
    const tag = maxTag(this.mesh);
    return all.filter((f) => f.tag === tag);
  }
  edges(_sel: Select = Select.ALL): ShapeList<EdgeInfo> {
    // Edges have no single provenance tag; expose all (filter via position).
    return extractEdges(this.mesh);
  }
  vertices(): ShapeList<VertexInfo> {
    return extractVertices(this.mesh);
  }
}
