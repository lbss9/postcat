use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

use crate::error::{to_string, CmdResult};

/// Absolute path of the app data folder (database, themes…).
#[tauri::command]
pub fn data_dir_path(app: tauri::AppHandle) -> CmdResult<String> {
    let dir = app.path().app_data_dir().map_err(to_string)?;
    Ok(dir.to_string_lossy().to_string())
}

/// Open the app data folder in the OS file manager.
#[tauri::command]
pub fn open_data_dir(app: tauri::AppHandle) -> CmdResult<()> {
    let dir = app.path().app_data_dir().map_err(to_string)?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(to_string)
}

/// Read a text file (used to import collection / OpenAPI files).
#[tauri::command]
pub fn read_file_text(path: String) -> CmdResult<String> {
    std::fs::read_to_string(&path).map_err(to_string)
}

/// Write a text file (used to export collections).
#[tauri::command]
pub fn write_file_text(path: String, contents: String) -> CmdResult<()> {
    std::fs::write(&path, contents).map_err(to_string)
}
