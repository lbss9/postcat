use std::path::PathBuf;
use std::sync::mpsc;

use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

/// Directory where user themes live: <app config dir>/themes.
pub fn themes_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("no app config dir")
        .join("themes");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Read every *.json theme file in the themes folder.
/// Each entry is the parsed JSON with an injected `__file` name; invalid files are skipped.
pub fn list_user_themes(app: &AppHandle) -> Vec<serde_json::Value> {
    let dir = themes_dir(app);
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        if let Some(obj) = value.as_object_mut() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                obj.insert("__file".into(), serde_json::Value::String(name.to_string()));
            }
            out.push(value);
        }
    }
    out
}

/// Watch the themes folder and emit `themes-changed` whenever it changes,
/// so the UI can live-detect files the user adds or edits at any time.
pub fn start_theme_watcher(app: AppHandle) {
    let dir = themes_dir(&app);
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(_) => return,
        };
        if watcher.watch(&dir, RecursiveMode::NonRecursive).is_err() {
            return;
        }
        // `watcher` is kept alive by this loop owning it.
        for res in rx {
            if res.is_ok() {
                let _ = app.emit("themes-changed", ());
            }
        }
    });
}
