use crate::error::CmdResult;
use crate::http;
use crate::models::{SendOptions, SendResult};
use crate::state::Http;

/// Send an HTTP request from the Rust side and return timing/size metrics
/// along with the decoded response. The heavy lifting (TLS, decompression,
/// body read) all happens off the UI thread.
#[tauri::command]
pub async fn send_request(
    state: tauri::State<'_, Http>,
    options: SendOptions,
) -> CmdResult<SendResult> {
    http::send(&state, options).await
}
