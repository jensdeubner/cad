use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::{Read, Write};
use wasm_bindgen::prelude::*;

const MAGIC: &[u8; 4] = b"STPR";
const VERSION: u32 = 1;

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
            ProjectError::BadMagic => "Keine gültige Scan-Tracer-Projektdatei (.stpr)",
            ProjectError::UnsupportedVersion => "Projektversion wird nicht unterstützt",
            ProjectError::DecompressFailed => "Projektdatei beschädigt (Dekomprimierung fehlgeschlagen)",
            ProjectError::InvalidLayout => "Projektdatei beschädigt (ungültige Struktur)",
        })
    }
}

pub fn pack(meta_json: &str, stl_data: &[u8]) -> Result<Vec<u8>, ProjectError> {
    let meta = meta_json.as_bytes();
    let mut inner = Vec::with_capacity(8 + meta.len() + stl_data.len());
    inner.extend_from_slice(&(meta.len() as u32).to_le_bytes());
    inner.extend_from_slice(&(stl_data.len() as u32).to_le_bytes());
    inner.extend_from_slice(meta);
    inner.extend_from_slice(stl_data);

    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&inner)
        .map_err(|_| ProjectError::DecompressFailed)?;
    let compressed = encoder
        .finish()
        .map_err(|_| ProjectError::DecompressFailed)?;

    let mut out = Vec::with_capacity(16 + compressed.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&VERSION.to_le_bytes());
    out.extend_from_slice(&(compressed.len() as u32).to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes()); // reserved
    out.extend_from_slice(&compressed);
    Ok(out)
}

pub fn unpack(data: &[u8]) -> Result<(String, Vec<u8>), ProjectError> {
    if data.len() < 16 {
        return Err(ProjectError::TooSmall);
    }
    if &data[0..4] != MAGIC {
        return Err(ProjectError::BadMagic);
    }
    let version = u32::from_le_bytes(data[4..8].try_into().unwrap());
    if version != VERSION {
        return Err(ProjectError::UnsupportedVersion);
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

    if inner.len() < 8 {
        return Err(ProjectError::InvalidLayout);
    }
    let meta_len = u32::from_le_bytes(inner[0..4].try_into().unwrap()) as usize;
    let stl_len = u32::from_le_bytes(inner[4..8].try_into().unwrap()) as usize;
    if inner.len() < 8 + meta_len + stl_len {
        return Err(ProjectError::InvalidLayout);
    }

    let meta = std::str::from_utf8(&inner[8..8 + meta_len])
        .map_err(|_| ProjectError::InvalidLayout)?
        .to_string();
    let stl = inner[8 + meta_len..8 + meta_len + stl_len].to_vec();
    Ok((meta, stl))
}