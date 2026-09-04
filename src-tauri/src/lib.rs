// PostCat — Tauri backend
mod db;
mod themes;

use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

use db::{Db, Environment, HistoryRow, Node};

/// A key/value pair with an on/off toggle, used for headers and query params.
#[derive(Debug, Deserialize)]
struct KeyVal {
    key: String,
    value: String,
    #[serde(default)]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct FormFieldOpt {
    key: String,
    value: String,
    /// "text" | "file" (value holds the file path when file)
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    enabled: bool,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BodyOpt {
    /// none | form-data | urlencoded | raw | binary
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    raw_lang: String,
    #[serde(default)]
    raw: String,
    #[serde(default)]
    form_data: Vec<FormFieldOpt>,
    #[serde(default)]
    urlencoded: Vec<KeyVal>,
    #[serde(default)]
    binary_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendOptions {
    method: String,
    url: String,
    #[serde(default)]
    headers: Vec<KeyVal>,
    #[serde(default)]
    params: Vec<KeyVal>,
    #[serde(default)]
    body: BodyOpt,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SendResult {
    status: u16,
    status_text: String,
    ok: bool,
    time_ms: u64,
    size_bytes: u64,
    headers: Vec<(String, String)>,
    body: String,
    content_type: String,
    final_url: String,
}

/// Send an HTTP request from the Rust side and return timing/size metrics
/// along with the decoded response. The heavy lifting (TLS, decompression,
/// body read) all happens off the UI thread.
#[tauri::command]
async fn send_request(
    client: tauri::State<'_, reqwest::Client>,
    options: SendOptions,
) -> Result<SendResult, String> {
    let method = reqwest::Method::from_bytes(options.method.to_uppercase().as_bytes())
        .map_err(|_| format!("errors.method|{}", options.method))?;

    // Parse and attach enabled query params.
    let mut url = reqwest::Url::parse(options.url.trim())
        .map_err(|e| format!("errors.url|{e}"))?;
    {
        let mut pairs = url.query_pairs_mut();
        for p in options.params.iter().filter(|p| p.enabled && !p.key.is_empty()) {
            pairs.append_pair(&p.key, &p.value);
        }
    }

    let mut req = client.request(method, url);

    // Enabled headers.
    let mut has_content_type = false;
    for h in options.headers.iter().filter(|h| h.enabled && !h.key.is_empty()) {
        if h.key.eq_ignore_ascii_case("content-type") {
            has_content_type = true;
        }
        req = req.header(&h.key, &h.value);
    }

    // Body handling by type.
    let body = &options.body;
    match body.kind.as_str() {
        "raw" => {
            if !body.raw.is_empty() {
                if !has_content_type {
                    let ct = match body.raw_lang.as_str() {
                        "json" => "application/json",
                        "xml" => "application/xml",
                        "html" => "text/html",
                        "javascript" => "application/javascript",
                        _ => "text/plain",
                    };
                    req = req.header("Content-Type", ct);
                }
                req = req.body(body.raw.clone());
            }
        }
        "urlencoded" => {
            let pairs: Vec<(String, String)> = body
                .urlencoded
                .iter()
                .filter(|k| k.enabled && !k.key.is_empty())
                .map(|k| (k.key.clone(), k.value.clone()))
                .collect();
            req = req.form(&pairs);
        }
        "form-data" => {
            let mut form = reqwest::multipart::Form::new();
            for f in body.form_data.iter().filter(|f| f.enabled && !f.key.is_empty()) {
                if f.kind == "file" {
                    if f.value.is_empty() {
                        continue;
                    }
                    let bytes = std::fs::read(&f.value)
                        .map_err(|e| format!("errors.request|{e}"))?;
                    let filename = std::path::Path::new(&f.value)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("file")
                        .to_string();
                    let part = reqwest::multipart::Part::bytes(bytes).file_name(filename);
                    form = form.part(f.key.clone(), part);
                } else {
                    form = form.text(f.key.clone(), f.value.clone());
                }
            }
            req = req.multipart(form);
        }
        "binary" => {
            if !body.binary_path.is_empty() {
                let bytes = std::fs::read(&body.binary_path)
                    .map_err(|e| format!("errors.request|{e}"))?;
                if !has_content_type {
                    req = req.header("Content-Type", "application/octet-stream");
                }
                req = req.body(bytes);
            }
        }
        _ => {}
    }

    let started = Instant::now();
    let resp = req.send().await.map_err(|e| friendly_error(&e))?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let headers: Vec<(String, String)> = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| friendly_error(&e))?;
    let time_ms = started.elapsed().as_millis() as u64;
    let size_bytes = bytes.len() as u64;
    let body = String::from_utf8_lossy(&bytes).into_owned();

    Ok(SendResult {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        ok: status.is_success(),
        time_ms,
        size_bytes,
        headers,
        body,
        content_type,
        final_url,
    })
}

/// Map reqwest errors to i18n keys the frontend translates.
/// Format: "errors.<key>" or "errors.<key>|<detail>".
fn friendly_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "errors.timeout".to_string()
    } else if e.is_connect() {
        "errors.connect".to_string()
    } else if e.is_request() {
        format!("errors.request|{e}")
    } else {
        format!("errors.unknown|{e}")
    }
}

/// Persist one request into the history log.
#[tauri::command]
fn history_add(db: tauri::State<'_, Db>, entry: HistoryRow) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert_history(&conn, &entry).map_err(|e| e.to_string())
}

/// Read the most recent requests, newest first.
#[tauri::command]
fn history_list(db: tauri::State<'_, Db>) -> Result<Vec<HistoryRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::list_history(&conn, 100).map_err(|e| e.to_string())
}

/// Wipe the whole history log.
#[tauri::command]
fn history_clear(db: tauri::State<'_, Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::clear_history(&conn).map_err(|e| e.to_string())
}

/* --------------------------------- themes ---------------------------------- */

/// List user-created theme JSON files.
#[tauri::command]
fn list_user_themes(app: tauri::AppHandle) -> Vec<serde_json::Value> {
    themes::list_user_themes(&app)
}

/// Absolute path of the themes folder (to show or open it).
#[tauri::command]
fn themes_dir_path(app: tauri::AppHandle) -> String {
    themes::themes_dir(&app).to_string_lossy().to_string()
}

/// Write a theme file into the themes folder.
#[tauri::command]
fn save_theme(app: tauri::AppHandle, filename: String, content: String) -> Result<(), String> {
    let dir = themes::themes_dir(&app);
    let mut safe = filename.replace(['/', '\\', ':'], "_");
    if !safe.to_lowercase().ends_with(".json") {
        safe.push_str(".json");
    }
    std::fs::write(dir.join(safe), content).map_err(|e| e.to_string())
}

/// Open the themes folder in the OS file manager.
#[tauri::command]
fn open_themes_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = themes::themes_dir(&app);
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/* ------------------------------- collections ------------------------------- */

#[tauri::command]
fn nodes_list(db: tauri::State<'_, Db>) -> Result<Vec<Node>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::list_nodes(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn node_create(
    db: tauri::State<'_, Db>,
    id: String,
    parent_id: Option<String>,
    kind: String,
    name: String,
    request: Option<serde_json::Value>,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::create_node(&conn, &id, parent_id, &kind, &name, request).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
fn node_rename(db: tauri::State<'_, Db>, id: String, name: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::rename_node(&conn, &id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn node_set_request(
    db: tauri::State<'_, Db>,
    id: String,
    request: serde_json::Value,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::set_node_request(&conn, &id, &request).map_err(|e| e.to_string())
}

#[tauri::command]
fn node_set_variables(
    db: tauri::State<'_, Db>,
    id: String,
    variables: serde_json::Value,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::set_node_variables(&conn, &id, &variables).map_err(|e| e.to_string())
}

#[tauri::command]
fn node_move(
    db: tauri::State<'_, Db>,
    id: String,
    parent_id: Option<String>,
    index: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::move_node(&conn, &id, parent_id, index).map_err(|e| e.to_string())
}

#[tauri::command]
fn node_delete(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::delete_node(&conn, &id).map_err(|e| e.to_string())
}

/* ------------------------------- environments ------------------------------ */

#[tauri::command]
fn env_list(db: tauri::State<'_, Db>) -> Result<Vec<Environment>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::list_environments(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn env_create(db: tauri::State<'_, Db>, id: String, name: String) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::create_environment(&conn, &id, &name).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
fn env_update(
    db: tauri::State<'_, Db>,
    id: String,
    name: String,
    variables: serde_json::Value,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::update_environment(&conn, &id, &name, &variables).map_err(|e| e.to_string())
}

#[tauri::command]
fn env_delete(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::delete_environment(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn env_set_active(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::set_active_environment(&conn, &id).map_err(|e| e.to_string())
}

/// Read a text file (used to import collection / OpenAPI files).
#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write a text file (used to export collections).
#[tauri::command]
fn write_file_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http = reqwest::Client::builder()
        .user_agent(concat!("PostCat/", env!("CARGO_PKG_VERSION")))
        .cookie_store(true)
        .build()
        .expect("failed to build HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(http)
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
            write_file_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
