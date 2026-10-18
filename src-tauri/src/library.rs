// Biblioteca local: recorre fitxers i carpetes, llegeix metadades i caràtules amb lofty
// i autoritza cada fitxer trobat al protocol asset perquè el webview el pugui reproduir.

use lofty::config::ParseOptions;
use lofty::prelude::*;
use lofty::probe::Probe;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "ogg", "oga", "opus", "m4a", "aac"];
const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp"];
const COVER_NAMES: &[&str] = &["cover", "folder", "front", "album", "artwork"];
const MAX_DEPTH: usize = 8;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedTrack {
    path: String,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<f64>,
    has_artwork: bool,
    folder_artwork: Option<String>,
    #[serde(skip)]
    sort_key: (PathBuf, u32, u32, String),
}

fn has_extension(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| extensions.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

fn collect_audio(path: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if is_hidden(path) {
        return;
    }
    if path.is_dir() {
        if depth >= MAX_DEPTH {
            return;
        }
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                collect_audio(&entry.path(), depth + 1, out);
            }
        }
    } else if path.is_file() && has_extension(path, AUDIO_EXTENSIONS) {
        out.push(path.to_path_buf());
    }
}

// Imatge de carpeta: primer noms habituals (cover.jpg, folder.png...), si no qualsevol imatge
fn find_folder_cover(dir: &Path) -> Option<PathBuf> {
    let mut images: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && !is_hidden(p) && has_extension(p, IMAGE_EXTENSIONS))
        .collect();
    images.sort();
    let preferred = images.iter().find(|p| {
        p.file_stem()
            .and_then(|s| s.to_str())
            .map(|s| COVER_NAMES.contains(&s.to_ascii_lowercase().as_str()))
            .unwrap_or(false)
    });
    preferred.or(images.first()).cloned()
}

fn read_track(path: &Path, folder_artwork: Option<&Path>) -> ScannedTrack {
    let file_name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Sense títol").to_string();
    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();

    let tagged = Probe::open(path)
        .and_then(|p| p.options(ParseOptions::new().read_cover_art(true)).read())
        .ok();
    let tag = tagged.as_ref().and_then(|t| t.primary_tag().or_else(|| t.first_tag()));
    let text = |value: Option<std::borrow::Cow<str>>| {
        value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
    };

    let title = tag.and_then(|t| text(t.title())).unwrap_or_else(|| file_name.clone());
    let disc = tag.and_then(|t| t.disk()).unwrap_or(0);
    let track = tag.and_then(|t| t.track()).unwrap_or(0);
    let duration = tagged
        .as_ref()
        .map(|t| t.properties().duration().as_secs_f64())
        .filter(|d| *d > 0.0);

    ScannedTrack {
        path: path.to_string_lossy().into_owned(),
        title,
        artist: tag.and_then(|t| text(t.artist())),
        album: tag.and_then(|t| text(t.album())),
        duration,
        has_artwork: tag.map(|t| !t.pictures().is_empty()).unwrap_or(false),
        folder_artwork: folder_artwork.map(|p| p.to_string_lossy().into_owned()),
        sort_key: (parent, disc, track, file_name.to_lowercase()),
    }
}

// Recorre les rutes (fitxers o carpetes), retorna les pistes ordenades per carpeta,
// disc, número de pista i nom, i les autoritza (i les seves caràtules) al protocol asset.
pub fn scan(app: &AppHandle, inputs: Vec<PathBuf>) -> Vec<ScannedTrack> {
    let mut files = Vec::new();
    for input in &inputs {
        collect_audio(input, 0, &mut files);
    }
    let mut seen = HashSet::new();
    files.retain(|p| seen.insert(p.clone()));

    let scope = app.asset_protocol_scope();
    let mut covers: HashMap<PathBuf, Option<PathBuf>> = HashMap::new();
    let mut tracks: Vec<ScannedTrack> = files
        .iter()
        .map(|path| {
            let dir = path.parent().map(Path::to_path_buf).unwrap_or_default();
            let cover = covers.entry(dir.clone()).or_insert_with(|| {
                let cover = find_folder_cover(&dir);
                if let Some(c) = &cover {
                    let _ = scope.allow_file(c);
                }
                cover
            });
            let _ = scope.allow_file(path);
            read_track(path, cover.as_deref())
        })
        .collect();

    tracks.sort_by(|a, b| a.sort_key.cmp(&b.sort_key));
    tracks
}

// Bytes de la primera caràtula incrustada al fitxer (buit si no n'hi ha)
pub fn read_artwork(path: &Path) -> Vec<u8> {
    if !has_extension(path, AUDIO_EXTENSIONS) {
        return Vec::new();
    }
    Probe::open(path)
        .and_then(|p| p.read())
        .ok()
        .and_then(|t| {
            let tag = t.primary_tag().or_else(|| t.first_tag())?;
            tag.pictures().first().map(|pic| pic.data().to_vec())
        })
        .unwrap_or_default()
}
