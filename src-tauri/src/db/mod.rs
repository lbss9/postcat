//! SQLite persistence. `open` creates/migrates the schema; the submodules are
//! repositories — plain functions over a `Connection`, one per table.

pub mod environments;
pub mod history;
pub mod nodes;

use rusqlite::Connection;

/// Open (or create) the database and make sure the schema is current.
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
