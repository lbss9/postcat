use tauri_plugin_opener::OpenerExt;

use crate::error::{to_string, CmdResult};
use crate::themes;

/// List user-created theme JSON files.
#[tauri::command]
pub fn list_user_themes(app: tauri::AppHandle) -> Vec<serde_json::Value> {
    themes::list_user_themes(&app)
}

/// Absolute path of the themes folder (to show or open it).
#[tauri::command]
pub fn themes_dir_path(app: tauri::AppHandle) -> String {
    themes::themes_dir(&app).to_string_lossy().to_string()
}

/// Write a theme file into the themes folder.
#[tauri::command]
pub fn save_theme(app: tauri::AppHandle, filename: String, content: String) -> CmdResult<()> {
    themes::save_theme_file(&app, &filename, &content).map_err(to_string)
}

/// Open the themes folder in the OS file manager.
#[tauri::command]
pub fn open_themes_dir(app: tauri::AppHandle) -> CmdResult<()> {
    let dir = themes::themes_dir(&app);
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(to_string)
}
