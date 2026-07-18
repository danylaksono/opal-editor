use futures_util::StreamExt;
use reqwest::header::{ACCEPT, CONTENT_LENGTH, LOCATION, USER_AGENT};
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

fn validate_citedrive_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value.trim())
        .map_err(|_| "Enter a valid CiteDrive project URL".to_string())?;
    let host = url
        .host_str()
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "The CiteDrive URL has no host".to_string())?;
    if url.scheme() != "https" || !(host == "citedrive.com" || host.ends_with(".citedrive.com")) {
        return Err("Use an HTTPS URL provided by CiteDrive".to_string());
    }
    Ok(url)
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

/// Download CiteDrive's dynamic .bib project URL. Redirects are followed only
/// while they remain on HTTPS CiteDrive hosts, keeping capability URLs away
/// from arbitrary endpoints.
#[tauri::command]
pub async fn fetch_citedrive_bibliography(url: String) -> Result<ExternalBibliography, String> {
    let mut current_url = validate_citedrive_url(&url)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Could not initialize CiteDrive sync: {}", error))?;

    for _ in 0..5 {
        let response = client
            .get(current_url.clone())
            .header(
                USER_AGENT,
                concat!("TectonicEditor/", env!("CARGO_PKG_VERSION")),
            )
            .header(ACCEPT, "application/x-bibtex, text/plain;q=0.9")
            .send()
            .await
            .map_err(|error| format!("Could not contact CiteDrive: {}", error))?;

        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "CiteDrive returned an invalid redirect".to_string())?;
            let redirected = current_url
                .join(location)
                .map_err(|_| "CiteDrive returned an invalid redirect".to_string())?;
            current_url = validate_citedrive_url(redirected.as_str())?;
            continue;
        }

        if !response.status().is_success() {
            return Err(format!(
                "CiteDrive returned HTTP {}. Check that the project URL is current.",
                response.status()
            ));
        }
        if response
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .is_some_and(|size| size > MAX_BIBLIOGRAPHY_BYTES)
        {
            return Err("The CiteDrive bibliography is larger than 20 MB".to_string());
        }

        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|error| format!("Could not read the CiteDrive response: {}", error))?;
            if bytes.len() + chunk.len() > MAX_BIBLIOGRAPHY_BYTES as usize {
                return Err("The CiteDrive bibliography is larger than 20 MB".to_string());
            }
            bytes.extend_from_slice(&chunk);
        }
        let content = String::from_utf8(bytes)
            .map_err(|_| "CiteDrive returned a bibliography that is not valid UTF-8".to_string())?;
        let preview = content
            .trim_start()
            .chars()
            .take(200)
            .collect::<String>()
            .to_ascii_lowercase();
        if preview.starts_with("<!doctype html") || preview.starts_with("<html") {
            return Err(
                "CiteDrive returned a web page instead of a bibliography. Copy the project’s dynamic .bib URL."
                    .to_string(),
            );
        }

        return Ok(ExternalBibliography {
            size: content.len() as u64,
            content,
            modified_ms: 0,
        });
    }

    Err("CiteDrive redirected too many times".to_string())
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

    #[test]
    fn only_https_citedrive_urls_are_allowed() {
        assert!(validate_citedrive_url(
            "https://api.citedrive.com/bib/project/references.bib?x=token"
        )
        .is_ok());
        assert!(validate_citedrive_url("https://app.citedrive.com/project").is_ok());
        assert!(validate_citedrive_url("http://api.citedrive.com/bib/project").is_err());
        assert!(validate_citedrive_url("https://example.com/references.bib").is_err());
        assert!(validate_citedrive_url("not a url").is_err());
    }
}
