//! PostCat — Tauri backend.
//!
//! Module map:
//! - `models`   — serde types shared with the frontend
//! - `http`     — the request engine (reqwest) and its client cache
//! - `db`       — SQLite schema + repositories (history, nodes, environments)
//! - `themes`   — user theme files on disk + live folder watcher
//! - `commands` — the `#[tauri::command]` adapters registered below
//! - `state`    — managed state handed to commands
//! - `error`    — the string-based error protocol the frontend translates

mod commands;
mod db;
mod error;
mod http;
mod models;
mod state;
mod themes;

use std::sync::Mutex;

use tauri::Manager;

use commands::*;
use state::{Db, Http};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Http::new())
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&dir).ok();
            let conn = db::open(&dir.join("postcat.db")).expect("failed to open database");
            app.manage(Db(Mutex::new(conn)));
            themes::start_theme_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_request,
            history_add,
            history_list,
            history_clear,
            list_user_themes,
            themes_dir_path,
            save_theme,
            open_themes_dir,
            nodes_list,
            node_create,
            node_rename,
            node_set_request,
            node_set_variables,
            node_move,
            node_delete,
            env_list,
            env_create,
            env_update,
            env_delete,
            env_set_active,
            read_file_text,
            write_file_text,
            data_dir_path,
            open_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
