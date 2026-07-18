use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;

const MAX_BIBLIOGRAPHY_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalBibliography {
    pub content: String,
    pub modified_ms: u64,
    pub size: u64,
}

fn validate_bibliography_path(path: &Path) -> Result<(), String> {
    let is_bib = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("bib"));
    if !is_bib {
        return Err("Select a BibTeX .bib file".to_string());
    }
    Ok(())
}

/// Read a bibliography previously selected by the user as an external source.
/// Restricting this command to regular, reasonably-sized .bib files avoids
/// turning persisted frontend state into a general-purpose file reader.
#[tauri::command]
pub async fn read_external_bibliography(path: String) -> Result<ExternalBibliography, String> {
    let path = Path::new(&path);
    validate_bibliography_path(path)?;
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|error| format!("Could not read the linked bibliography: {}", error))?;
    if !metadata.is_file() {
        return Err("The linked bibliography is not a file".to_string());
    }
    if metadata.len() > MAX_BIBLIOGRAPHY_BYTES {
        return Err("The linked bibliography is larger than 20 MB".to_string());
    }
    let content = tokio::fs::read_to_string(path)
        .await
        .map_err(|error| format!("The linked bibliography is not valid UTF-8: {}", error))?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();

    Ok(ExternalBibliography {
        content,
        modified_ms,
        size: metadata.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_bib_paths_are_allowed() {
        assert!(validate_bibliography_path(Path::new("library.bib")).is_ok());
        assert!(validate_bibliography_path(Path::new("LIBRARY.BIB")).is_ok());
        assert!(validate_bibliography_path(Path::new("notes.txt")).is_err());
        assert!(validate_bibliography_path(Path::new("bibliography")).is_err());
    }
}
