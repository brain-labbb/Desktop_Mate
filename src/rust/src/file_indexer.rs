use crate::{FileNode, IndexOptions, IndexResult};
use ignore::WalkBuilder;
use rayon::prelude::*;
use std::time::Instant;

const DANGEROUS_EXTENSIONS: &[&str] = &["exe", "dll", "so", "dylib", "bin", "app"];
const MAX_DEPTH_DEFAULT: usize = 3;
const MAX_FILE_SIZE_DEFAULT: u64 = 10 * 1024 * 1024; // 10MB

/// Index a directory with high performance
///
/// # Arguments
/// * `path` - The directory path to index
/// * `options` - Indexing options (uses defaults if None)
///
/// # Returns
/// * `Result<IndexResult>` - Indexing result with files, stats, and timing
///
/// # Example
/// ```ignore
/// let result = index_directory("/path/to/dir", None)?;
/// println!("Indexed {} files in {}ms", result.total_count, result.duration_ms);
/// ```
pub fn index_directory(
    path: &str,
    options: Option<IndexOptions>,
) -> Result<IndexResult, String> {
    let start = Instant::now();
    let opts = options.unwrap_or_default();

    // Validate path exists
    let path_obj = std::path::Path::new(path);
    if !path_obj.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !path_obj.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    // Build walker with options
    let mut walker = WalkBuilder::new(path);

    if opts.respect_gitignore {
        walker.git_ignore(true);
        walker.git_ignore_rules(true);
        walker.add_custom_ignore_filename(".dmignore"); // Desktop Mate specific ignore
    }

    if let Some(depth) = opts.max_depth {
        walker.max_depth(depth);
    }

    walker.follow_links(opts.follow_links);

    // Build parallel iterator
    let files: Vec<FileNode> = walker
        .build_parallel()
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let metadata = entry.metadata().ok()?;

            let path = entry.path();

            // Skip dangerous binary files
            if let Some(ext) = path.extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                if DANGEROUS_EXTENSIONS.contains(&ext.as_str()) {
                    return None;
                }
            }

            // Filter large files (only for files, not directories)
            if !metadata.is_dir() {
                if let Some(max_size) = opts.max_file_size {
                    if metadata.len() > max_size {
                        return None;
                    }
                }
            }

            // Skip hidden files/directories (Unix-style)
            if let Some(name) = path.file_name() {
                let name_str = name.to_string_lossy();
                if name_str.starts_with('.') && name_str != ".git" {
                    // Allow .git for version control
                    return None;
                }
            }

            // Get file type from extension
            let file_type = path
                .extension()
                .map(|e| e.to_string_lossy().to_string());

            Some(FileNode {
                name: entry.file_name().to_string_lossy().into(),
                path: path.to_string_lossy().into(),
                is_dir: metadata.is_dir(),
                size: metadata.len(),
                modified: metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs()),
                file_type,
            })
        })
        .collect();

    let duration = start.elapsed();
    let total_size = files.iter().map(|f| f.size).sum();
    let total_count = files.len();

    Ok(IndexResult {
        files,
        total_count,
        total_size,
        duration_ms: duration.as_millis() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_index_options_default() {
        let opts = IndexOptions::default();
        assert_eq!(opts.max_depth, Some(3));
        assert_eq!(opts.max_file_size, Some(10 * 1024 * 1024));
        assert_eq!(opts.follow_links, false);
        assert_eq!(opts.respect_gitignore, true);
    }

    #[test]
    fn test_dangerous_extensions() {
        assert!(DANGEROUS_EXTENSIONS.contains(&"exe"));
        assert!(DANGEROUS_EXTENSIONS.contains(&"dll"));
        assert!(DANGEROUS_EXTENSIONS.contains(&"so"));
    }
}
