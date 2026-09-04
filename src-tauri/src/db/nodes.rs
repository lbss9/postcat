//! Collections tree repository: collections, folders and saved requests.

use rusqlite::Connection;

use crate::models::Node;

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

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<Node>> {
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

pub fn create(
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

pub fn rename(conn: &Connection, id: &str, name: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE nodes SET name = ?2 WHERE id = ?1", rusqlite::params![id, name])?;
    Ok(())
}

pub fn set_request(
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

pub fn set_variables(
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
pub fn move_to(
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
            Some(p) => stmt
                .query_map(rusqlite::params![p, id], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?,
            None => stmt
                .query_map(rusqlite::params![id], |r| r.get::<_, String>(0))?
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
pub fn delete(conn: &Connection, id: &str) -> rusqlite::Result<()> {
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
