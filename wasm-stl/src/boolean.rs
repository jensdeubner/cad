use boolmesh::prelude::{compute_boolean, Manifold, OpType};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

use crate::ParsedMesh;

#[derive(Deserialize)]
struct MeshPayload {
    positions: Vec<f32>,
    indices: Vec<u32>,
}

#[derive(Deserialize)]
struct BooleanSubtractRequest {
    target: MeshPayload,
    tool: MeshPayload,
}

#[derive(Deserialize)]
struct BooleanUnionRequest {
    meshes: Vec<MeshPayload>,
}

const MAX_TRIANGLES: usize = 500_000;

fn mesh_payload_to_manifold(mesh: &MeshPayload) -> Result<Manifold, String> {
    let tri_count = mesh.indices.len() / 3;
    if tri_count > MAX_TRIANGLES {
        return Err(format!(
            "Zu viele Dreiecke ({tri_count}) — Maximum ist {MAX_TRIANGLES}"
        ));
    }
    if mesh.indices.len() < 3 || mesh.indices.len() % 3 != 0 {
        return Err("Ungültige Indexliste".into());
    }
    let pos: Vec<f64> = mesh.positions.iter().map(|v| *v as f64).collect();
    if pos.len() < 9 || pos.len() % 3 != 0 {
        return Err("Ungültige Positionsliste".into());
    }
    let idx: Vec<usize> = mesh.indices.iter().map(|v| *v as usize).collect();
    Manifold::new(&pos, &idx)
}

fn manifold_to_mesh(m: &Manifold, empty_err: &str) -> Result<ParsedMesh, String> {
    let indices_tri = m.get_indices();
    if indices_tri.is_empty() {
        return Err(empty_err.into());
    }
    let positions: Vec<f32> = m
        .ps
        .iter()
        .flat_map(|v| [v.x as f32, v.y as f32, v.z as f32])
        .collect();
    let indices: Vec<u32> = indices_tri
        .iter()
        .flat_map(|t| [t.x as u32, t.y as u32, t.z as u32])
        .collect();
    Ok(ParsedMesh {
        positions,
        indices,
        triangle_count: indices_tri.len() as u32,
    })
}

fn total_triangles(meshes: &[MeshPayload]) -> usize {
    meshes.iter().map(|m| m.indices.len() / 3).sum()
}

#[wasm_bindgen]
pub fn mesh_boolean_subtract_json(json: &str) -> Result<ParsedMesh, JsValue> {
    let req: BooleanSubtractRequest = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Ungültige Anfrage: {e}")))?;

    let target = mesh_payload_to_manifold(&req.target)
        .map_err(|e| JsValue::from_str(&format!("Ziel-Mesh: {e}")))?;
    let tool = mesh_payload_to_manifold(&req.tool)
        .map_err(|e| JsValue::from_str(&format!("Werkzeug-Mesh: {e}")))?;

    let result = compute_boolean(&target, &tool, OpType::Subtract)
        .map_err(|e| JsValue::from_str(&format!("Subtrahieren fehlgeschlagen: {e}")))?;

    manifold_to_mesh(&result, "Subtrahieren ergab leeres Mesh")
        .map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn mesh_boolean_union_json(json: &str) -> Result<ParsedMesh, JsValue> {
    let req: BooleanUnionRequest = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Ungültige Anfrage: {e}")))?;

    if req.meshes.len() < 2 {
        return Err(JsValue::from_str("Vereinigen: mindestens zwei Meshes nötig"));
    }
    if total_triangles(&req.meshes) > MAX_TRIANGLES {
        return Err(JsValue::from_str(&format!(
            "Zu viele Dreiecke gesamt — Maximum ist {MAX_TRIANGLES}"
        )));
    }

    let first = mesh_payload_to_manifold(&req.meshes[0])
        .map_err(|e| JsValue::from_str(&format!("Mesh 1: {e}")))?;
    let mut acc = first;

    for (i, mesh) in req.meshes.iter().enumerate().skip(1) {
        let next = mesh_payload_to_manifold(mesh)
            .map_err(|e| JsValue::from_str(&format!("Mesh {}: {e}", i + 1)))?;
        acc = compute_boolean(&acc, &next, OpType::Add)
            .map_err(|e| JsValue::from_str(&format!("Vereinigen fehlgeschlagen: {e}")))?;
    }

    manifold_to_mesh(&acc, "Vereinigen ergab leeres Mesh").map_err(|e| JsValue::from_str(&e))
}