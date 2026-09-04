//! The HTTP engine: turns a `SendOptions` into a reqwest request, sends it
//! off the UI thread and returns the decoded response with metrics.

use std::sync::Mutex;
use std::time::Instant;

use crate::error::friendly_error;
use crate::models::{NetworkOpts, SendOptions, SendResult};

/// Long-lived HTTP clients. The default client serves the common case; a
/// second one is built (and cached) whenever the user picks non-default
/// network settings, since TLS/redirect/cookie policy live on the client.
pub struct HttpState {
    default: reqwest::Client,
    custom: Mutex<Option<(NetworkOpts, reqwest::Client)>>,
}

impl HttpState {
    pub fn new() -> Self {
        Self {
            default: build_client(&NetworkOpts::default()),
            custom: Mutex::new(None),
        }
    }

    /// The client matching `opts`, reusing the cached custom client when the
    /// settings haven't changed since the last non-default request.
    fn client_for(&self, opts: &NetworkOpts) -> reqwest::Client {
        if *opts == NetworkOpts::default() {
            return self.default.clone();
        }
        let mut cached = self.custom.lock().unwrap_or_else(|p| p.into_inner());
        if let Some((cached_opts, client)) = cached.as_ref() {
            if cached_opts == opts {
                return client.clone();
            }
        }
        let client = build_client(opts);
        *cached = Some((opts.clone(), client.clone()));
        client
    }
}

impl Default for HttpState {
    fn default() -> Self {
        Self::new()
    }
}

fn build_client(opts: &NetworkOpts) -> reqwest::Client {
    let mut b = reqwest::Client::builder()
        .user_agent(concat!("PostCat/", env!("CARGO_PKG_VERSION")))
        .cookie_store(!opts.disable_cookies)
        .danger_accept_invalid_certs(!opts.verify_ssl);
    if !opts.follow_redirects {
        b = b.redirect(reqwest::redirect::Policy::none());
    }
    match opts.http_version.as_str() {
        "http1" => b = b.http1_only(),
        "http2" => b = b.http2_prior_knowledge(),
        _ => {}
    }
    b.build().expect("failed to build HTTP client")
}

/// Content-Type our engine sets for a raw body of the given language.
fn raw_content_type(lang: &str) -> &'static str {
    match lang {
        "json" => "application/json",
        "xml" => "application/xml",
        "html" => "text/html",
        "javascript" => "application/javascript",
        _ => "text/plain",
    }
}

/// Build the outgoing request: URL + query params, headers, then the body.
fn build_request(
    client: &reqwest::Client,
    options: &SendOptions,
) -> Result<reqwest::RequestBuilder, String> {
    let method = reqwest::Method::from_bytes(options.method.to_uppercase().as_bytes())
        .map_err(|_| format!("errors.method|{}", options.method))?;

    // Parse and attach enabled query params.
    let mut url = reqwest::Url::parse(options.url.trim())
        .map_err(|e| format!("errors.url|{e}"))?;
    {
        let mut pairs = url.query_pairs_mut();
        for p in options.params.iter().filter(|p| p.enabled && !p.key.is_empty()) {
            pairs.append_pair(&p.key, &p.value);
        }
    }

    let mut req = client.request(method, url);

    // Enabled headers.
    let mut has_content_type = false;
    for h in options.headers.iter().filter(|h| h.enabled && !h.key.is_empty()) {
        if h.key.eq_ignore_ascii_case("content-type") {
            has_content_type = true;
        }
        req = req.header(&h.key, &h.value);
    }

    // Body handling by type.
    let body = &options.body;
    match body.kind.as_str() {
        "raw" => {
            if !body.raw.is_empty() {
                if !has_content_type {
                    req = req.header("Content-Type", raw_content_type(&body.raw_lang));
                }
                req = req.body(body.raw.clone());
            }
        }
        "urlencoded" => {
            let pairs: Vec<(String, String)> = body
                .urlencoded
                .iter()
                .filter(|k| k.enabled && !k.key.is_empty())
                .map(|k| (k.key.clone(), k.value.clone()))
                .collect();
            req = req.form(&pairs);
        }
        "form-data" => {
            let mut form = reqwest::multipart::Form::new();
            for f in body.form_data.iter().filter(|f| f.enabled && !f.key.is_empty()) {
                if f.kind == "file" {
                    if f.value.is_empty() {
                        continue;
                    }
                    let bytes = std::fs::read(&f.value)
                        .map_err(|e| format!("errors.request|{e}"))?;
                    let filename = std::path::Path::new(&f.value)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("file")
                        .to_string();
                    let part = reqwest::multipart::Part::bytes(bytes).file_name(filename);
                    form = form.part(f.key.clone(), part);
                } else {
                    form = form.text(f.key.clone(), f.value.clone());
                }
            }
            req = req.multipart(form);
        }
        "binary" => {
            if !body.binary_path.is_empty() {
                let bytes = std::fs::read(&body.binary_path)
                    .map_err(|e| format!("errors.request|{e}"))?;
                if !has_content_type {
                    req = req.header("Content-Type", "application/octet-stream");
                }
                req = req.body(bytes);
            }
        }
        _ => {}
    }

    if options.network.timeout_ms > 0 {
        req = req.timeout(std::time::Duration::from_millis(options.network.timeout_ms));
    }

    Ok(req)
}

/// Perform the request and collect status, headers, body and metrics.
pub async fn send(state: &HttpState, options: SendOptions) -> Result<SendResult, String> {
    let client = state.client_for(&options.network);
    let req = build_request(&client, &options)?;

    let started = Instant::now();
    let resp = req.send().await.map_err(|e| friendly_error(&e))?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let headers: Vec<(String, String)> = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| friendly_error(&e))?;
    let time_ms = started.elapsed().as_millis() as u64;
    let size_bytes = bytes.len() as u64;
    let max = options.network.max_response_bytes;
    if max > 0 && size_bytes > max {
        return Err(format!("errors.tooLarge|{size_bytes}"));
    }
    let body = String::from_utf8_lossy(&bytes).into_owned();

    Ok(SendResult {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        ok: status.is_success(),
        time_ms,
        size_bytes,
        headers,
        body,
        content_type,
        final_url,
    })
}
