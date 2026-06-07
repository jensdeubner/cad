mod project;

use js_sys::Float32Array;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Serialize, Deserialize)]
struct Vec3 {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Clone, Serialize, Deserialize)]
struct Contour {
    axis: String,
    position: f32,
    points: Vec<[f32; 3]>,
    closed: bool,
    /// Punkte sind bereits vollständige 3D-Koordinaten (z. B. am Scan geheftet & gedreht)
    #[serde(default)]
    full_3d: bool,
}

#[derive(Clone, Serialize, Deserialize)]
struct LoftRequest {
    contours: Vec<Contour>,
    closed_ends: bool,
}

#[wasm_bindgen]
pub struct ParsedMesh {
    positions: Vec<f32>,
    indices: Vec<u32>,
    triangle_count: u32,
}

#[wasm_bindgen]
impl ParsedMesh {
    #[wasm_bindgen(getter)]
    pub fn positions(&self) -> Float32Array {
        Float32Array::from(self.positions.as_slice())
    }

    #[wasm_bindgen(getter)]
    pub fn indices(&self) -> js_sys::Uint32Array {
        js_sys::Uint32Array::from(self.indices.as_slice())
    }

    #[wasm_bindgen(getter)]
    pub fn triangle_count(&self) -> u32 {
        self.triangle_count
    }

    #[wasm_bindgen(getter)]
    pub fn vertex_count(&self) -> u32 {
        (self.positions.len() / 3) as u32
    }
}

#[wasm_bindgen]
pub fn parse_stl(data: &[u8]) -> Result<ParsedMesh, JsValue> {
    parse_stl_with_stride(data, 1)
}

#[wasm_bindgen]
pub fn parse_stl_with_stride(data: &[u8], stride: u32) -> Result<ParsedMesh, JsValue> {
    if data.len() < 84 {
        return Err(JsValue::from_str("STL zu klein"));
    }
    let stride = stride.max(1);

    let is_ascii = data.starts_with(b"solid") && !looks_like_binary_stl(data);
    let mesh = if is_ascii {
        parse_ascii_stl_stride(data, stride)?
    } else {
        parse_binary_stl_stride(data, stride)?
    };

    Ok(mesh)
}

fn looks_like_binary_stl(data: &[u8]) -> bool {
    if data.len() < 84 {
        return false;
    }
    let tri_count = u32::from_le_bytes(data[80..84].try_into().unwrap()) as usize;
    let expected = 84 + tri_count * 50;
    expected <= data.len()
}

fn parse_binary_stl_stride(data: &[u8], stride: u32) -> Result<ParsedMesh, JsValue> {
    let tri_count = u32::from_le_bytes(data[80..84].try_into().unwrap()) as usize;
    let expected = 84 + tri_count * 50;
    if data.len() < expected {
        return Err(JsValue::from_str("Binäres STL unvollständig"));
    }

    let kept = (tri_count as u32 + stride - 1) / stride;
    let mut positions = Vec::with_capacity((kept as usize) * 9);
    let mut indices = Vec::with_capacity((kept as usize) * 3);
    let mut offset = 84usize;

    for i in 0..tri_count {
        offset += 12; // normal
        if (i as u32) % stride == 0 {
            for _ in 0..3 {
                let x = f32::from_le_bytes(data[offset..offset + 4].try_into().unwrap());
                let y = f32::from_le_bytes(data[offset + 4..offset + 8].try_into().unwrap());
                let z = f32::from_le_bytes(data[offset + 8..offset + 12].try_into().unwrap());
                offset += 12;
                let idx = (positions.len() / 3) as u32;
                positions.extend_from_slice(&[x, y, z]);
                indices.push(idx);
            }
        } else {
            offset += 36;
        }
        offset += 2; // attribute
    }

    Ok(ParsedMesh {
        triangle_count: (indices.len() / 3) as u32,
        positions,
        indices,
    })
}

fn parse_ascii_stl_stride(data: &[u8], stride: u32) -> Result<ParsedMesh, JsValue> {
    let text = std::str::from_utf8(data).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let mut positions = Vec::new();
    let mut indices = Vec::new();
    let mut verts: Vec<[f32; 3]> = Vec::new();
    let mut tri_idx = 0u32;

    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("vertex") {
            let parts: Vec<f32> = rest
                .split_whitespace()
                .filter_map(|p| p.parse().ok())
                .collect();
            if parts.len() == 3 {
                verts.push([parts[0], parts[1], parts[2]]);
                if verts.len() == 3 {
                    if tri_idx % stride == 0 {
                        let base = (positions.len() / 3) as u32;
                        for v in &verts {
                            positions.extend_from_slice(v);
                        }
                        indices.extend_from_slice(&[base, base + 1, base + 2]);
                    }
                    tri_idx += 1;
                    verts.clear();
                }
            }
        }
    }

    Ok(ParsedMesh {
        triangle_count: (indices.len() / 3) as u32,
        positions,
        indices,
    })
}

#[wasm_bindgen]
pub fn loft_contours_json(json: &str) -> Result<ParsedMesh, JsValue> {
    let req: LoftRequest =
        serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    loft_contours(req)
}

fn project_to_plane(p: &[f32; 3], axis: &str, position: f32) -> Vec3 {
    match axis {
        "xy" => Vec3 {
            x: p[0],
            y: p[1],
            z: position,
        },
        "xz" => Vec3 {
            x: p[0],
            y: position,
            z: p[2],
        },
        _ => Vec3 {
            x: position,
            y: p[1],
            z: p[2],
        },
    }
}

fn dist3(a: Vec3, b: Vec3) -> f32 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    let dz = a.z - b.z;
    (dx * dx + dy * dy + dz * dz).sqrt()
}

fn resample_arclength(ring: &[Vec3], target: usize) -> Vec<Vec3> {
    if ring.len() < 2 {
        return ring.to_vec();
    }
    if target < 3 {
        return ring.to_vec();
    }
    if ring.len() == target {
        return ring.to_vec();
    }

    let mut seg_len = Vec::with_capacity(ring.len());
    let mut total = 0.0f32;
    for i in 0..ring.len() {
        let j = (i + 1) % ring.len();
        let d = dist3(ring[i], ring[j]);
        seg_len.push(d);
        total += d;
    }
    if total < 1e-6 {
        return ring.to_vec();
    }

    let step = total / target as f32;
    let mut out = Vec::with_capacity(target);
    let mut seg = 0usize;
    let mut along = 0.0f32;

    for _ in 0..target {
        let target_dist = out.len() as f32 * step;
        while seg < seg_len.len() && along + seg_len[seg] < target_dist {
            along += seg_len[seg];
            seg += 1;
        }
        if seg >= ring.len() {
            out.push(ring[ring.len() - 1]);
            continue;
        }
        let local = (target_dist - along) / seg_len[seg].max(1e-6);
        let j = (seg + 1) % ring.len();
        let a = ring[seg];
        let b = ring[j];
        out.push(Vec3 {
            x: a.x + (b.x - a.x) * local,
            y: a.y + (b.y - a.y) * local,
            z: a.z + (b.z - a.z) * local,
        });
    }
    out
}

fn align_ring(reference: &[Vec3], candidate: &[Vec3]) -> Vec<Vec3> {
    let n = reference.len();
    if n < 3 || candidate.len() != n {
        return candidate.to_vec();
    }

    let mut best = candidate.to_vec();
    let mut best_cost = f32::MAX;

    for reverse in [false, true] {
        let mut base = candidate.to_vec();
        if reverse {
            base.reverse();
        }
        for offset in 0..n {
            let mut cost = 0.0f32;
            for i in 0..n {
                let a = reference[i];
                let b = base[(i + offset) % n];
                cost += dist3(a, b);
            }
            if cost < best_cost {
                best_cost = cost;
                best = (0..n).map(|i| base[(i + offset) % n]).collect();
            }
        }
    }
    best
}

fn loft_contours(req: LoftRequest) -> Result<ParsedMesh, JsValue> {
    if req.contours.len() < 2 {
        return Err(JsValue::from_str("Mindestens 2 Konturen für Loft nötig"));
    }

    let first_axis = req.contours[0].axis.as_str();
    if !req.contours.iter().all(|c| c.axis == first_axis) {
        return Err(JsValue::from_str(
            "Alle Konturen müssen auf derselben Ebenen-Achse liegen (z. B. beide XY)",
        ));
    }

    let mut sorted = req.contours;
    sorted.sort_by(|a, b| {
        a.position
            .partial_cmp(&b.position)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let rings: Vec<Vec<Vec3>> = sorted
        .iter()
        .map(|c| {
            c.points
                .iter()
                .map(|p| {
                    if c.full_3d {
                        Vec3 {
                            x: p[0],
                            y: p[1],
                            z: p[2],
                        }
                    } else {
                        project_to_plane(p, &c.axis, c.position)
                    }
                })
                .collect()
        })
        .collect();

    let max_pts = rings.iter().map(|r| r.len()).max().unwrap_or(0);
    let n = max_pts.clamp(3, 96);
    if n < 3 {
        return Err(JsValue::from_str("Jede Kontur braucht mindestens 3 Punkte"));
    }

    let mut uniform: Vec<Vec<Vec3>> = Vec::with_capacity(rings.len());
    uniform.push(resample_arclength(&rings[0], n));
    for r in 1..rings.len() {
        let resampled = resample_arclength(&rings[r], n);
        let aligned = align_ring(&uniform[r - 1], &resampled);
        uniform.push(aligned);
    }

    let mut positions = Vec::with_capacity(uniform.len() * n * 3);
    let mut indices = Vec::new();

    for ring in &uniform {
        for v in ring {
            positions.extend_from_slice(&[v.x, v.y, v.z]);
        }
    }

    let ring_count = uniform.len();
    for r in 0..ring_count - 1 {
        for i in 0..n {
            let i2 = (i + 1) % n;
            let a = (r * n + i) as u32;
            let b = (r * n + i2) as u32;
            let c = ((r + 1) * n + i2) as u32;
            let d = ((r + 1) * n + i) as u32;
            indices.extend_from_slice(&[a, b, c, a, c, d]);
        }
    }

    if req.closed_ends {
        cap_ring(&mut positions, &mut indices, &uniform[0], 0, true);
        cap_ring(
            &mut positions,
            &mut indices,
            &uniform[ring_count - 1],
            ((ring_count - 1) * n) as u32,
            false,
        );
    }

    Ok(ParsedMesh {
        triangle_count: (indices.len() / 3) as u32,
        positions,
        indices,
    })
}

fn cap_ring(
    positions: &mut Vec<f32>,
    indices: &mut Vec<u32>,
    ring: &[Vec3],
    ring_vertex_base: u32,
    flip: bool,
) {
    let center = ring.iter().fold(Vec3 { x: 0.0, y: 0.0, z: 0.0 }, |acc, v| Vec3 {
        x: acc.x + v.x,
        y: acc.y + v.y,
        z: acc.z + v.z,
    });
    let n = ring.len() as f32;
    let center = Vec3 {
        x: center.x / n,
        y: center.y / n,
        z: center.z / n,
    };
    let center_idx = (positions.len() / 3) as u32;
    positions.extend_from_slice(&[center.x, center.y, center.z]);
    for i in 0..ring.len() {
        let i2 = (i + 1) % ring.len();
        let a = ring_vertex_base + i as u32;
        let b = ring_vertex_base + i2 as u32;
        if flip {
            indices.extend_from_slice(&[center_idx, b, a]);
        } else {
            indices.extend_from_slice(&[center_idx, a, b]);
        }
    }
}

#[wasm_bindgen]
pub fn export_binary_stl(positions: &[f32], indices: &[u32]) -> Result<Vec<u8>, JsValue> {
    if positions.len() % 3 != 0 {
        return Err(JsValue::from_str("Positions ungültig"));
    }
    if indices.len() % 3 != 0 {
        return Err(JsValue::from_str("Indices ungültig"));
    }

    let tri_count = indices.len() / 3;
    let mut out = Vec::with_capacity(84 + tri_count * 50);
    out.extend_from_slice(&[0u8; 80]);
    out.extend_from_slice(&(tri_count as u32).to_le_bytes());

    for t in 0..tri_count {
        let i0 = indices[t * 3] as usize;
        let i1 = indices[t * 3 + 1] as usize;
        let i2 = indices[t * 3 + 2] as usize;
        let v0 = [
            positions[i0 * 3],
            positions[i0 * 3 + 1],
            positions[i0 * 3 + 2],
        ];
        let v1 = [
            positions[i1 * 3],
            positions[i1 * 3 + 1],
            positions[i1 * 3 + 2],
        ];
        let v2 = [
            positions[i2 * 3],
            positions[i2 * 3 + 1],
            positions[i2 * 3 + 2],
        ];
        let n = normal(v0, v1, v2);
        out.extend_from_slice(&n[0].to_le_bytes());
        out.extend_from_slice(&n[1].to_le_bytes());
        out.extend_from_slice(&n[2].to_le_bytes());
        for v in [v0, v1, v2] {
            out.extend_from_slice(&v[0].to_le_bytes());
            out.extend_from_slice(&v[1].to_le_bytes());
            out.extend_from_slice(&v[2].to_le_bytes());
        }
        out.extend_from_slice(&[0u8, 0]);
    }

    Ok(out)
}

#[wasm_bindgen]
pub fn pack_project(meta_json: &str, stl_data: &[u8]) -> Result<Vec<u8>, JsValue> {
    project::pack(meta_json, stl_data).map_err(Into::into)
}

#[wasm_bindgen]
pub fn unpack_project(data: &[u8]) -> Result<JsValue, JsValue> {
    let (meta, stl) = project::unpack(data).map_err(|e: project::ProjectError| JsValue::from(e))?;
    // Uint8Array statt serde-Array — große STLs (>~50 MB) sonst RangeError im Browser
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("meta"), &JsValue::from_str(&meta))
        .map_err(|e| JsValue::from_str(&format!("meta: {e:?}")))?;
    js_sys::Reflect::set(
        &obj,
        &JsValue::from_str("stl"),
        &js_sys::Uint8Array::from(stl.as_slice()),
    )
    .map_err(|e| JsValue::from_str(&format!("stl: {e:?}")))?;
    Ok(obj.into())
}

fn normal(a: [f32; 3], b: [f32; 3], c: [f32; 3]) -> [f32; 3] {
    let ux = b[0] - a[0];
    let uy = b[1] - a[1];
    let uz = b[2] - a[2];
    let vx = c[0] - a[0];
    let vy = c[1] - a[1];
    let vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    let len = (nx * nx + ny * ny + nz * nz).sqrt().max(1e-8);
    [nx / len, ny / len, nz / len]
}