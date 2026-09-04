use crate::db;
use crate::error::{to_string, CmdResult};
use crate::models::Node;
use crate::state::Db;

#[tauri::command]
pub fn nodes_list(db: tauri::State<'_, Db>) -> CmdResult<Vec<Node>> {
    let conn = db.lock()?;
    db::nodes::list(&conn).map_err(to_string)
}

#[tauri::command]
pub fn node_create(
    db: tauri::State<'_, Db>,
    id: String,
    parent_id: Option<String>,
    kind: String,
    name: String,
    request: Option<serde_json::Value>,
) -> CmdResult<String> {
    let conn = db.lock()?;
    db::nodes::create(&conn, &id, parent_id, &kind, &name, request).map_err(to_string)?;
    Ok(id)
}

#[tauri::command]
pub fn node_rename(db: tauri::State<'_, Db>, id: String, name: String) -> CmdResult<()> {
    let conn = db.lock()?;
    db::nodes::rename(&conn, &id, &name).map_err(to_string)
}

#[tauri::command]
pub fn node_set_request(
    db: tauri::State<'_, Db>,
    id: String,
    request: serde_json::Value,
) -> CmdResult<()> {
    let conn = db.lock()?;
    db::nodes::set_request(&conn, &id, &request).map_err(to_string)
}

#[tauri::command]
pub fn node_set_variables(
    db: tauri::State<'_, Db>,
    id: String,
    variables: serde_json::Value,
) -> CmdResult<()> {
    let conn = db.lock()?;
    db::nodes::set_variables(&conn, &id, &variables).map_err(to_string)
}

#[tauri::command]
pub fn node_move(
    db: tauri::State<'_, Db>,
    id: String,
    parent_id: Option<String>,
    index: i64,
) -> CmdResult<()> {
    let conn = db.lock()?;
    db::nodes::move_to(&conn, &id, parent_id, index).map_err(to_string)
}

#[tauri::command]
pub fn node_delete(db: tauri::State<'_, Db>, id: String) -> CmdResult<()> {
    let conn = db.lock()?;
    db::nodes::delete(&conn, &id).map_err(to_string)
}
