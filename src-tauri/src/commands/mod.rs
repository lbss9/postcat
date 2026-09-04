//! Tauri commands — thin adapters between the frontend IPC and the domain
//! modules (`http`, `db`, `themes`). Each file groups one domain; everything
//! is re-exported so `lib.rs` can register the handlers in one place.

pub mod environments;
pub mod files;
pub mod history;
pub mod http;
pub mod nodes;
pub mod themes;

pub use environments::*;
pub use files::*;
pub use history::*;
pub use http::*;
pub use nodes::*;
pub use themes::*;
