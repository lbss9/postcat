//! Data transfer types shared between the frontend (via serde/camelCase) and
//! the persistence layer. Nothing here has behaviour — only shapes.

use serde::{Deserialize, Serialize};

/// A key/value pair with an on/off toggle, used for headers and query params.
#[derive(Debug, Deserialize)]
pub struct KeyVal {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub enabled: bool,
}

/// One multipart/form-data field: plain text, or a file referenced by path.
#[derive(Debug, Deserialize)]
pub struct FormFieldOpt {
    pub key: String,
    pub value: String,
    /// "text" | "file" (value holds the file path when file)
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub enabled: bool,
}

/// The request body as chosen in the Body tab.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BodyOpt {
    /// none | form-data | urlencoded | raw | binary
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub raw_lang: String,
    #[serde(default)]
    pub raw: String,
    #[serde(default)]
    pub form_data: Vec<FormFieldOpt>,
    #[serde(default)]
    pub urlencoded: Vec<KeyVal>,
    #[serde(default)]
    pub binary_path: String,
}

/// Network knobs from Settings → Network. The defaults reproduce the engine's
/// built-in behaviour exactly, so an absent/empty object changes nothing.
#[derive(Debug, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetworkOpts {
    /// request timeout in milliseconds; 0 = never time out
    #[serde(default)]
    pub timeout_ms: u64,
    /// refuse responses larger than this many bytes; 0 = unlimited
    #[serde(default)]
    pub max_response_bytes: u64,
    /// verify TLS certificates (turn off for self-signed dev servers)
    #[serde(default = "yes")]
    pub verify_ssl: bool,
    /// automatically follow 3xx redirects
    #[serde(default = "yes")]
    pub follow_redirects: bool,
    /// "auto" | "http1" | "http2"
    #[serde(default)]
    pub http_version: String,
    /// bypass the cookie jar entirely
    #[serde(default)]
    pub disable_cookies: bool,
}

fn yes() -> bool {
    true
}

impl Default for NetworkOpts {
    fn default() -> Self {
        Self {
            timeout_ms: 0,
            max_response_bytes: 0,
            verify_ssl: true,
            follow_redirects: true,
            http_version: String::new(),
            disable_cookies: false,
        }
    }
}

/// Everything needed to perform one HTTP request (variables already resolved).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendOptions {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyVal>,
    #[serde(default)]
    pub params: Vec<KeyVal>,
    #[serde(default)]
    pub body: BodyOpt,
    #[serde(default)]
    pub network: NetworkOpts,
}

/// The decoded response plus timing/size metrics.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResult {
    pub status: u16,
    pub status_text: String,
    pub ok: bool,
    pub time_ms: u64,
    pub size_bytes: u64,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub content_type: String,
    pub final_url: String,
}

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

/// A named set of `{{variables}}`; at most one is active at a time.
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
