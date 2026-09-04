//! Environments repository. At most one environment is active at a time.

use rusqlite::Connection;

use crate::models::Environment;

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<Environment>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, is_active, variables, position FROM environments ORDER BY position",
    )?;
    let rows = stmt
        .query_map([], |r| {
            let vars: String = r.get(3)?;
            let is_active: i64 = r.get(2)?;
            Ok(Environment {
                id: r.get(0)?,
                name: r.get(1)?,
                is_active: is_active != 0,
                variables: serde_json::from_str(&vars).unwrap_or(serde_json::Value::Array(vec![])),
                position: r.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn create(conn: &Connection, id: &str, name: &str) -> rusqlite::Result<()> {
    let pos: i64 = conn
        .query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM environments", [], |r| r.get(0))
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO environments (id, name, is_active, variables, position)
         VALUES (?1, ?2, 0, '[]', ?3)",
        rusqlite::params![id, name, pos],
    )?;
    Ok(())
}

pub fn update(
    conn: &Connection,
    id: &str,
    name: &str,
    variables: &serde_json::Value,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE environments SET name = ?2, variables = ?3 WHERE id = ?1",
        rusqlite::params![id, name, variables.to_string()],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM environments WHERE id = ?1", [id])?;
    Ok(())
}

/// Make one environment active (or none when `id` is empty), exclusively.
pub fn set_active(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE environments SET is_active = 0", [])?;
    if !id.is_empty() {
        conn.execute("UPDATE environments SET is_active = 1 WHERE id = ?1", [id])?;
    }
    Ok(())
}
