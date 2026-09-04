//! Application state managed by Tauri and injected into commands.

use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::http::HttpState;

/// The SQLite connection, shared across commands behind a mutex.
pub struct Db(pub Mutex<Connection>);

impl Db {
    /// Lock the connection, mapping a poisoned mutex to a plain error string
    /// (the command boundary speaks `String` errors — see `error.rs`).
    pub fn lock(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.0.lock().map_err(|e| e.to_string())
    }
}

/// Everything the HTTP engine keeps between requests.
pub type Http = HttpState;
