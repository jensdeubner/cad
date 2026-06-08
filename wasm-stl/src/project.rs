use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::{Read, Write};
use wasm_bindgen::prelude::*;

const MAGIC: &[u8; 4] = b"STPR";
const VERSION_LEGACY: u32 = 1;
const VERSION_MULTI: u32 = 2;

#[derive(Debug, Clone)]
pub struct BodyMeshEntry {
    pub id: String,
    pub stl: Vec<u8>,
}

#[derive(Debug)]
pub enum ProjectError {
    TooSmall,
    BadMagic,
    UnsupportedVersion,
    DecompressFailed,
    InvalidLayout,
}

impl From<ProjectError> for JsValue {
    fn from(e: ProjectError) -> Self {
        JsValue::from_str(match e {
            ProjectError::TooSmall => "Projektdatei zu klein",
            ProjectError::BadMagic => "Keine gültige CAD-Projektdatei (.stpr)",
            ProjectError::UnsupportedVersion => "Projektversion wird nicht unterstützt",
            ProjectError::DecompressFailed => "Projektdatei beschädigt (Dekomprimierung fehlgeschlagen)",
            ProjectError::InvalidLayout => "Projektdatei beschädigt (ungültige Struktur)",
        })
    }
}

#[derive(Debug)]
pub enum UnpackResult {
    Legacy {
        meta: String,
        stl: Vec<u8>,
    },
    Multi {
        meta: String,
        bodies: Vec<BodyMeshEntry>,
    },
}

fn compress_inner(inner: &[u8]) -> Result<Vec<u8>, ProjectError> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(inner)
        .map_err(|_| ProjectError::DecompressFailed)?;
    encoder
        .finish()
        .map_err(|_| ProjectError::DecompressFailed)
}

fn wrap_file(file_version: u32, compressed: Vec<u8>) -> Vec<u8> {
    let mut out = Vec::with_capacity(16 + compressed.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&file_version.to_le_bytes());
    out.extend_from_slice(&(compressed.len() as u32).to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&compressed);
    out
}

fn decompress_payload(data: &[u8]) -> Result<Vec<u8>, ProjectError> {
    if data.len() < 16 {
        return Err(ProjectError::TooSmall);
    }
    if &data[0..4] != MAGIC {
        return Err(ProjectError::BadMagic);
    }
    let comp_len = u32::from_le_bytes(data[8..12].try_into().unwrap()) as usize;
    if 16 + comp_len > data.len() {
        return Err(ProjectError::InvalidLayout);
    }
    let mut decoder = GzDecoder::new(&data[16..16 + comp_len]);
    let mut inner = Vec::new();
    decoder
        .read_to_end(&mut inner)
        .map_err(|_| ProjectError::DecompressFailed)?;
    Ok(inner)
}

pub fn pack(meta_json: &str, stl_data: &[u8]) -> Result<Vec<u8>, ProjectError> {
    let meta = meta_json.as_bytes();
    let mut inner = Vec::with_capacity(8 + meta.len() + stl_data.len());
    inner.extend_from_slice(&(meta.len() as u32).to_le_bytes());
    inner.extend_from_slice(&(stl_data.len() as u32).to_le_bytes());
    inner.extend_from_slice(meta);
    inner.extend_from_slice(stl_data);
    let compressed = compress_inner(&inner)?;
    Ok(wrap_file(VERSION_LEGACY, compressed))
}

pub fn pack_multi(meta_json: &str, mesh_archive: &[u8]) -> Result<Vec<u8>, ProjectError> {
    let meta = meta_json.as_bytes();
    let mut inner = Vec::with_capacity(8 + meta.len() + mesh_archive.len());
    inner.extend_from_slice(&(meta.len() as u32).to_le_bytes());
    inner.extend_from_slice(&(mesh_archive.len() as u32).to_le_bytes());
    inner.extend_from_slice(meta);
    inner.extend_from_slice(mesh_archive);
    let compressed = compress_inner(&inner)?;
    Ok(wrap_file(VERSION_MULTI, compressed))
}

pub fn parse_mesh_archive(data: &[u8]) -> Result<Vec<BodyMeshEntry>, ProjectError> {
    if data.len() < 4 {
        return Err(ProjectError::InvalidLayout);
    }
    let count = u32::from_le_bytes(data[0..4].try_into().unwrap()) as usize;
    let mut offset = 4;
    let mut bodies = Vec::with_capacity(count);
    for _ in 0..count {
        if offset + 2 > data.len() {
            return Err(ProjectError::InvalidLayout);
        }
        let id_len = u16::from_le_bytes(data[offset..offset + 2].try_into().unwrap()) as usize;
        offset += 2;
        if offset + id_len + 4 > data.len() {
            return Err(ProjectError::InvalidLayout);
        }
        let id = std::str::from_utf8(&data[offset..offset + id_len])
            .map_err(|_| ProjectError::InvalidLayout)?
            .to_string();
        offset += id_len;
        let stl_len = u32::from_le_bytes(data[offset..offset + 4].try_into().unwrap()) as usize;
        offset += 4;
        if offset + stl_len > data.len() {
            return Err(ProjectError::InvalidLayout);
        }
        let stl = data[offset..offset + stl_len].to_vec();
        offset += stl_len;
        bodies.push(BodyMeshEntry { id, stl });
    }
    Ok(bodies)
}

pub fn unpack(data: &[u8]) -> Result<UnpackResult, ProjectError> {
    if data.len() < 16 {
        return Err(ProjectError::TooSmall);
    }
    if &data[0..4] != MAGIC {
        return Err(ProjectError::BadMagic);
    }
    let file_version = u32::from_le_bytes(data[4..8].try_into().unwrap());
    let inner = decompress_payload(data)?;

    if inner.len() < 8 {
        return Err(ProjectError::InvalidLayout);
    }
    let meta_len = u32::from_le_bytes(inner[0..4].try_into().unwrap()) as usize;
    let blob_len = u32::from_le_bytes(inner[4..8].try_into().unwrap()) as usize;
    if inner.len() < 8 + meta_len + blob_len {
        return Err(ProjectError::InvalidLayout);
    }

    let meta = std::str::from_utf8(&inner[8..8 + meta_len])
        .map_err(|_| ProjectError::InvalidLayout)?
        .to_string();
    let blob = &inner[8 + meta_len..8 + meta_len + blob_len];

    match file_version {
        VERSION_LEGACY => Ok(UnpackResult::Legacy {
            meta,
            stl: blob.to_vec(),
        }),
        VERSION_MULTI => {
            let bodies = parse_mesh_archive(blob)?;
            Ok(UnpackResult::Multi { meta, bodies })
        }
        _ => Err(ProjectError::UnsupportedVersion),
    }
}

