//! History log repository (bounded to the most recent 200 entries).

use rusqlite::Connection;

use crate::models::HistoryRow;

pub fn insert(conn: &Connection, row: &HistoryRow) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO history (id, method, url, status, at, request)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            row.id,
            row.method,
            row.url,
            row.status,
            row.at,
            row.request.to_string(),
        ],
    )?;
    // keep the log bounded
    conn.execute(
        "DELETE FROM history WHERE id NOT IN
            (SELECT id FROM history ORDER BY at DESC LIMIT 200)",
        [],
    )?;
    Ok(())
}

pub fn list(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<HistoryRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, method, url, status, at, request
         FROM history ORDER BY at DESC LIMIT ?1",
    )?;
    let rows = stmt
        .query_map([limit], |r| {
            let request_str: String = r.get(5)?;
            Ok(HistoryRow {
                id: r.get(0)?,
                method: r.get(1)?,
                url: r.get(2)?,
                status: r.get(3)?,
                at: r.get(4)?,
                request: serde_json::from_str(&request_str)
                    .unwrap_or(serde_json::Value::Null),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn clear(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM history", [])?;
    Ok(())
}
