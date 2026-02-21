use napi_derive::napi;
use serde::{Deserialize, Serialize};

mod file_indexer;

pub use file_indexer::*;

/// File node representation
#[derive(Serialize, Deserialize, Debug)]
#[napi(object)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
    pub file_type: Option<String>,
}

/// Options for directory indexing
#[derive(Serialize, Deserialize, Debug)]
#[napi(object)]
pub struct IndexOptions {
    #[napi(ts_type = "number | null")]
    pub max_depth: Option<usize>,
    #[napi(ts_type = "number | null")]
    pub max_file_size: Option<u64>,
    pub follow_links: bool,
    pub respect_gitignore: bool,
}

impl Default for IndexOptions {
    fn default() -> Self {
        Self {
            max_depth: Some(3),
            max_file_size: Some(10 * 1024 * 1024), // 10MB
            follow_links: false,
            respect_gitignore: true,
        }
    }
}

/// Result of directory indexing
#[derive(Serialize, Deserialize, Debug)]
#[napi(object)]
pub struct IndexResult {
    pub files: Vec<FileNode>,
    pub total_count: usize,
    pub total_size: u64,
    pub duration_ms: u64,
}
