use crate::db;
use crate::error::{to_string, CmdResult};
use crate::models::HistoryRow;
use crate::state::Db;

/// Persist one request into the history log.
#[tauri::command]
pub fn history_add(db: tauri::State<'_, Db>, entry: HistoryRow) -> CmdResult<()> {
    let conn = db.lock()?;
    db::history::insert(&conn, &entry).map_err(to_string)
}

/// Read the most recent requests, newest first.
#[tauri::command]
pub fn history_list(db: tauri::State<'_, Db>) -> CmdResult<Vec<HistoryRow>> {
    let conn = db.lock()?;
    db::history::list(&conn, 100).map_err(to_string)
}

/// Wipe the whole history log.
#[tauri::command]
pub fn history_clear(db: tauri::State<'_, Db>) -> CmdResult<()> {
    let conn = db.lock()?;
    db::history::clear(&conn).map_err(to_string)
}
