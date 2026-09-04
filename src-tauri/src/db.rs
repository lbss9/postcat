use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// One persisted request in the history log.
#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryRow {
    pub id: String,
    pub method: String,
    pub url: String,
    pub status: Option<i64>,
    pub at: i64,
    /// The full RequestState, stored as JSON so it can be replayed.
    pub request: serde_json::Value,
}

/// Thread-safe wrapper Tauri manages as state.
pub struct Db(pub Mutex<Connection>);

pub fn open(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS history (
            id       TEXT PRIMARY KEY,
            method   TEXT NOT NULL,
            url      TEXT NOT NULL,
            status   INTEGER,
            at       INTEGER NOT NULL,
            request  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_history_at ON history(at DESC);

        CREATE TABLE IF NOT EXISTS nodes (
            id        TEXT PRIMARY KEY,
            parent_id TEXT,
            kind      TEXT NOT NULL,
            name      TEXT NOT NULL,
            request   TEXT,
            variables TEXT,
            position  INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id, position);

        CREATE TABLE IF NOT EXISTS environments (
            id        TEXT PRIMARY KEY,
            name      TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 0,
            variables TEXT NOT NULL DEFAULT '[]',
            position  INTEGER NOT NULL DEFAULT 0
        );",
    )?;
    // migration for DBs created before the nodes.variables column existed
    let _ = conn.execute("ALTER TABLE nodes ADD COLUMN variables TEXT", []);
    Ok(conn)
}

pub fn insert_history(conn: &Connection, row: &HistoryRow) -> rusqlite::Result<()> {
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

pub fn list_history(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<HistoryRow>> {
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

pub fn clear_history(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM history", [])?;
    Ok(())
}

/* ----------------------------- collections tree ---------------------------- */

/// A node in the collections tree: a collection, a folder, or a saved request.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub parent_id: Option<String>,
    /// "collection" | "folder" | "request"
    pub kind: String,
    pub name: String,
    /// the saved RequestState for request nodes, null otherwise
    pub request: Option<serde_json::Value>,
    /// collection-scoped variables (array of {key,value,enabled}) for collection nodes
    pub variables: Option<serde_json::Value>,
    pub position: i64,
}

fn next_position(conn: &Connection, parent_id: &Option<String>) -> i64 {
    let res: rusqlite::Result<i64> = match parent_id {
        Some(p) => conn.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM nodes WHERE parent_id = ?1",
            [p],
            |r| r.get(0),
        ),
        None => conn.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM nodes WHERE parent_id IS NULL",
            [],
            |r| r.get(0),
        ),
    };
    res.unwrap_or(0)
}

pub fn list_nodes(conn: &Connection) -> rusqlite::Result<Vec<Node>> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, kind, name, request, variables, position
         FROM nodes ORDER BY position",
    )?;
    let rows = stmt
        .query_map([], |r| {
            let request: Option<String> = r.get(4)?;
            let variables: Option<String> = r.get(5)?;
            Ok(Node {
                id: r.get(0)?,
                parent_id: r.get(1)?,
                kind: r.get(2)?,
                name: r.get(3)?,
                request: request.and_then(|s| serde_json::from_str(&s).ok()),
                variables: variables.and_then(|s| serde_json::from_str(&s).ok()),
                position: r.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn create_node(
    conn: &Connection,
    id: &str,
    parent_id: Option<String>,
    kind: &str,
    name: &str,
    request: Option<serde_json::Value>,
) -> rusqlite::Result<()> {
    let pos = next_position(conn, &parent_id);
    conn.execute(
        "INSERT INTO nodes (id, parent_id, kind, name, request, position)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            id,
            parent_id,
            kind,
            name,
            request.map(|v| v.to_string()),
            pos,
        ],
    )?;
    Ok(())
}

pub fn rename_node(conn: &Connection, id: &str, name: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE nodes SET name = ?2 WHERE id = ?1", rusqlite::params![id, name])?;
    Ok(())
}

pub fn set_node_request(
    conn: &Connection,
    id: &str,
    request: &serde_json::Value,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE nodes SET request = ?2 WHERE id = ?1",
        rusqlite::params![id, request.to_string()],
    )?;
    Ok(())
}

pub fn set_node_variables(
    conn: &Connection,
    id: &str,
    variables: &serde_json::Value,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE nodes SET variables = ?2 WHERE id = ?1",
        rusqlite::params![id, variables.to_string()],
    )?;
    Ok(())
}

/// Move a node under `parent_id` at the given sibling index, renumbering siblings.
pub fn move_node(
    conn: &Connection,
    id: &str,
    parent_id: Option<String>,
    index: i64,
) -> rusqlite::Result<()> {
    // reparent first
    conn.execute(
        "UPDATE nodes SET parent_id = ?2 WHERE id = ?1",
        rusqlite::params![id, parent_id],
    )?;

    // collect the target parent's children (in order), excluding the moved node
    let mut ids: Vec<String> = {
        let mut stmt = match &parent_id {
            Some(_) => conn.prepare(
                "SELECT id FROM nodes WHERE parent_id = ?1 AND id != ?2 ORDER BY position",
            )?,
            None => conn.prepare(
                "SELECT id FROM nodes WHERE parent_id IS NULL AND id != ?1 ORDER BY position",
            )?,
        };
        let rows = match &parent_id {
            Some(p) => stmt.query_map(rusqlite::params![p, id], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?,
            None => stmt.query_map(rusqlite::params![id], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?,
        };
        rows
    };

    let idx = index.clamp(0, ids.len() as i64) as usize;
    ids.insert(idx, id.to_string());

    for (pos, node_id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE nodes SET position = ?2 WHERE id = ?1",
            rusqlite::params![node_id, pos as i64],
        )?;
    }
    Ok(())
}

/// Delete a node and all of its descendants.
pub fn delete_node(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "WITH RECURSIVE d(id) AS (
            SELECT id FROM nodes WHERE id = ?1
            UNION ALL
            SELECT n.id FROM nodes n JOIN d ON n.parent_id = d.id
         )
         DELETE FROM nodes WHERE id IN (SELECT id FROM d)",
        [id],
    )?;
    Ok(())
}

/* ------------------------------- environments ------------------------------ */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub is_active: bool,
    /// array of { key, value, enabled }
    pub variables: serde_json::Value,
    pub position: i64,
}

pub fn list_environments(conn: &Connection) -> rusqlite::Result<Vec<Environment>> {
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

pub fn create_environment(conn: &Connection, id: &str, name: &str) -> rusqlite::Result<()> {
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

pub fn update_environment(
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

pub fn delete_environment(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM environments WHERE id = ?1", [id])?;
    Ok(())
}

/// Make one environment active (or none when `id` is empty), exclusively.
pub fn set_active_environment(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE environments SET is_active = 0", [])?;
    if !id.is_empty() {
        conn.execute("UPDATE environments SET is_active = 1 WHERE id = ?1", [id])?;
    }
    Ok(())
}
