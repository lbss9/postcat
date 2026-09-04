//! Error conventions at the command boundary.
//!
//! Commands return `Result<T, String>` on purpose: the string is an i18n
//! protocol the frontend translates — either `errors.<key>` or
//! `errors.<key>|<detail>`. Keeping it a plain string avoids a second
//! serialization layer while still giving users localized messages.

/// Result type used by every `#[tauri::command]`.
pub type CmdResult<T> = Result<T, String>;

/// Map reqwest failures to the i18n keys the frontend knows.
pub fn friendly_error(e: &reqwest::Error) -> String {
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

/// Convert any displayable error into the plain-string command error.
pub fn to_string<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
