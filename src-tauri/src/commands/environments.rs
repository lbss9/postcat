use crate::db;
use crate::error::{to_string, CmdResult};
use crate::models::Environment;
use crate::state::Db;

#[tauri::command]
pub fn env_list(db: tauri::State<'_, Db>) -> CmdResult<Vec<Environment>> {
    let conn = db.lock()?;
    db::environments::list(&conn).map_err(to_string)
}

#[tauri::command]
pub fn env_create(db: tauri::State<'_, Db>, id: String, name: String) -> CmdResult<String> {
    let conn = db.lock()?;
    db::environments::create(&conn, &id, &name).map_err(to_string)?;
    Ok(id)
}

#[tauri::command]
pub fn env_update(
    db: tauri::State<'_, Db>,
    id: String,
    name: String,
    variables: serde_json::Value,
) -> CmdResult<()> {
    let conn = db.lock()?;
    db::environments::update(&conn, &id, &name, &variables).map_err(to_string)
}

#[tauri::command]
pub fn env_delete(db: tauri::State<'_, Db>, id: String) -> CmdResult<()> {
    let conn = db.lock()?;
    db::environments::delete(&conn, &id).map_err(to_string)
}

#[tauri::command]
pub fn env_set_active(db: tauri::State<'_, Db>, id: String) -> CmdResult<()> {
    let conn = db.lock()?;
    db::environments::set_active(&conn, &id).map_err(to_string)
}
