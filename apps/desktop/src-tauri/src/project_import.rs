use futures_util::StreamExt;
use serde::Serialize;
use std::ffi::{OsStr, OsString};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufReader, Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;
use zip::ZipArchive;

const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_DOWNLOAD_BYTES: u64 = 128 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    project_path: String,
    file_count: usize,
}

#[tauri::command]
pub async fn import_zip_project(
    archive_path: String,
    destination_dir: String,
) -> Result<ImportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let archive_path = PathBuf::from(archive_path);
        let project_name = archive_path
            .file_stem()
            .and_then(|name| name.to_str())
            .map(sanitize_project_name)
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "imported-project".to_string());

        extract_archive_file(&archive_path, Path::new(&destination_dir), &project_name)
    })
    .await
    .map_err(|error| format!("ZIP import task failed: {error}"))?
}

#[tauri::command]
pub async fn import_github_project(
    repository_url: String,
    destination_dir: String,
) -> Result<ImportResult, String> {
    let (owner, repository) = parse_github_repository_url(&repository_url)?;
    let destination = PathBuf::from(destination_dir);
    ensure_destination_directory(&destination)?;

    let archive_url = format!("https://api.github.com/repos/{owner}/{repository}/zipball");
    let temporary_archive = destination.join(format!(".tectonic-github-{}.zip", Uuid::new_v4()));

    let download_result = download_github_archive(&archive_url, &temporary_archive).await;
    if let Err(error) = download_result {
        let _ = fs::remove_file(&temporary_archive);
        return Err(error);
    }

    let extraction_archive = temporary_archive.clone();
    let extraction_destination = destination.clone();
    let project_name = repository.clone();
    let extraction_task = tauri::async_runtime::spawn_blocking(move || {
        extract_archive_file(&extraction_archive, &extraction_destination, &project_name)
    })
    .await;

    let _ = fs::remove_file(&temporary_archive);
    extraction_task.map_err(|error| format!("GitHub import task failed: {error}"))?
}

async fn download_github_archive(url: &str, target: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("Could not prepare GitHub download: {error}"))?;
    let response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header(reqwest::header::USER_AGENT, "Opal")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| format!("Could not connect to GitHub: {error}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("Repository not found. Check the URL and make sure it is public.".to_string());
    }
    let response = response
        .error_for_status()
        .map_err(|error| format!("GitHub could not provide this repository: {error}"))?;

    if response
        .content_length()
        .is_some_and(|size| size > MAX_DOWNLOAD_BYTES)
    {
        return Err("Repository archive is larger than the 128 MB import limit.".to_string());
    }

    let mut file = tokio::fs::File::create(target)
        .await
        .map_err(|error| format!("Could not create the temporary archive: {error}"))?;
    let mut downloaded = 0_u64;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("GitHub download was interrupted: {error}"))?;
        downloaded = downloaded
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| "Repository archive is too large.".to_string())?;
        if downloaded > MAX_DOWNLOAD_BYTES {
            return Err("Repository archive is larger than the 128 MB import limit.".to_string());
        }
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|error| format!("Could not save the repository archive: {error}"))?;
    }

    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(|error| format!("Could not finish saving the repository archive: {error}"))
}

fn parse_github_repository_url(url: &str) -> Result<(String, String), String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|_| {
        "Enter a full GitHub URL such as https://github.com/owner/repo.".to_string()
    })?;

    if parsed.scheme() != "https" || parsed.host_str() != Some("github.com") {
        return Err("Only https://github.com repository URLs are supported.".to_string());
    }

    let segments: Vec<&str> = parsed
        .path_segments()
        .map(|parts| parts.filter(|part| !part.is_empty()).collect())
        .unwrap_or_default();
    if segments.len() != 2 {
        return Err(
            "Use the repository URL, for example https://github.com/owner/repo.".to_string(),
        );
    }

    let owner = segments[0];
    let repository = segments[1].strip_suffix(".git").unwrap_or(segments[1]);
    if !is_safe_github_name(owner) || !is_safe_github_name(repository) {
        return Err("The GitHub owner or repository name is not valid.".to_string());
    }

    Ok((owner.to_string(), repository.to_string()))
}

fn is_safe_github_name(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character))
}

fn extract_archive_file(
    archive_path: &Path,
    destination_dir: &Path,
    project_name: &str,
) -> Result<ImportResult, String> {
    ensure_destination_directory(destination_dir)?;

    let archive_file = File::open(archive_path)
        .map_err(|error| format!("Could not open the ZIP archive: {error}"))?;
    let reader = BufReader::new(archive_file);
    let mut archive =
        ZipArchive::new(reader).map_err(|error| format!("Invalid ZIP archive: {error}"))?;

    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(format!(
            "The archive contains more than {MAX_ARCHIVE_ENTRIES} entries."
        ));
    }

    let entries = inspect_entries(&mut archive)?;
    let file_entries: Vec<&ArchiveEntry> =
        entries.iter().filter(|entry| !entry.is_directory).collect();
    if file_entries.is_empty() {
        return Err("The archive does not contain any files.".to_string());
    }
    if !file_entries.iter().any(|entry| {
        entry
            .path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                extension.eq_ignore_ascii_case("tex") || extension.eq_ignore_ascii_case("ltx")
            })
    }) {
        return Err("No LaTeX (.tex or .ltx) files were found in the archive.".to_string());
    }

    let wrapper = shared_wrapper_directory(&file_entries);
    let safe_name = sanitize_project_name(project_name);
    let project_path = unique_destination(
        destination_dir,
        if safe_name.is_empty() {
            "imported-project"
        } else {
            &safe_name
        },
    );
    fs::create_dir(&project_path)
        .map_err(|error| format!("Could not create the project folder: {error}"))?;

    let extraction_result =
        extract_entries(&mut archive, &entries, wrapper.as_deref(), &project_path);
    if let Err(error) = extraction_result {
        let _ = fs::remove_dir_all(&project_path);
        return Err(error);
    }

    Ok(ImportResult {
        project_path: project_path.to_string_lossy().into_owned(),
        file_count: file_entries.len(),
    })
}

#[derive(Clone)]
struct ArchiveEntry {
    archive_index: usize,
    path: PathBuf,
    is_directory: bool,
}

fn inspect_entries<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<Vec<ArchiveEntry>, String> {
    let mut entries = Vec::with_capacity(archive.len());
    let mut total_size = 0_u64;

    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("Could not inspect ZIP entry {index}: {error}"))?;
        let path = file
            .enclosed_name()
            .ok_or_else(|| format!("Unsafe path in ZIP archive: {}", file.name()))?;

        if file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(format!(
                "Symbolic links are not supported in imported archives: {}",
                file.name()
            ));
        }

        total_size = total_size
            .checked_add(file.size())
            .ok_or_else(|| "The archive expands beyond the import limit.".to_string())?;
        if total_size > MAX_UNCOMPRESSED_BYTES {
            return Err("The archive expands beyond the 512 MB import limit.".to_string());
        }

        entries.push(ArchiveEntry {
            archive_index: index,
            path,
            is_directory: file.is_dir(),
        });
    }

    Ok(entries)
}

fn extract_entries<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    entries: &[ArchiveEntry],
    wrapper: Option<&OsStr>,
    project_path: &Path,
) -> Result<(), String> {
    for entry in entries {
        let relative_path = if let Some(wrapper_name) = wrapper {
            entry
                .path
                .strip_prefix(Path::new(wrapper_name))
                .map_err(|_| "Could not normalize the archive layout.".to_string())?
        } else {
            entry.path.as_path()
        };
        if relative_path.as_os_str().is_empty() {
            continue;
        }

        let output_path = project_path.join(relative_path);
        if entry.is_directory {
            fs::create_dir_all(&output_path)
                .map_err(|error| format!("Could not create an imported folder: {error}"))?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create an imported folder: {error}"))?;
        }

        let mut source = archive
            .by_index(entry.archive_index)
            .map_err(|error| format!("Could not read an imported file: {error}"))?;
        let mut target = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output_path)
            .map_err(|error| format!("Could not create {}: {error}", relative_path.display()))?;

        let copied = io::copy(
            &mut source.by_ref().take(MAX_UNCOMPRESSED_BYTES + 1),
            &mut target,
        )
        .map_err(|error| format!("Could not extract {}: {error}", relative_path.display()))?;
        if copied > MAX_UNCOMPRESSED_BYTES {
            return Err("An imported file exceeds the archive size limit.".to_string());
        }
        target.flush().map_err(|error| {
            format!(
                "Could not finish writing {}: {error}",
                relative_path.display()
            )
        })?;
    }

    Ok(())
}

fn shared_wrapper_directory(entries: &[&ArchiveEntry]) -> Option<OsString> {
    let mut shared: Option<OsString> = None;

    for entry in entries {
        let mut components = entry.path.components();
        let first = match components.next() {
            Some(Component::Normal(component)) => component.to_os_string(),
            _ => return None,
        };
        if components.next().is_none() {
            return None;
        }
        if shared.as_ref().is_some_and(|existing| existing != &first) {
            return None;
        }
        shared = Some(first);
    }

    shared
}

fn ensure_destination_directory(path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Err("Choose an existing destination folder.".to_string());
    }
    Ok(())
}

fn unique_destination(parent: &Path, name: &str) -> PathBuf {
    let initial = parent.join(name);
    if !initial.exists() {
        return initial;
    }
    for suffix in 2..10_000 {
        let candidate = parent.join(format!("{name}-{suffix}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{name}-{}", Uuid::new_v4()))
}

fn sanitize_project_name(name: &str) -> String {
    let sanitized: String = name
        .trim()
        .chars()
        .map(|character| {
            if character.is_control() || r#"<>:"/\|?*"#.contains(character) {
                '-'
            } else {
                character
            }
        })
        .collect();
    sanitized
        .trim_matches(|character: char| character == '.' || character == ' ')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn write_test_archive(path: &Path, entries: &[(&str, &str)]) {
        let file = File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, content) in entries {
            writer.start_file(name, options).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
    }

    #[test]
    fn parses_supported_github_urls() {
        assert_eq!(
            parse_github_repository_url("https://github.com/example/paper.git").unwrap(),
            ("example".to_string(), "paper".to_string())
        );
    }

    #[test]
    fn rejects_non_repository_github_urls() {
        assert!(parse_github_repository_url("https://github.com/example/paper/tree/main").is_err());
        assert!(parse_github_repository_url("https://example.com/example/paper").is_err());
        assert!(parse_github_repository_url("git@github.com:example/paper.git").is_err());
    }

    #[test]
    fn strips_a_shared_archive_wrapper() {
        let entries = [
            ArchiveEntry {
                archive_index: 0,
                path: PathBuf::from("paper-main/main.tex"),
                is_directory: false,
            },
            ArchiveEntry {
                archive_index: 1,
                path: PathBuf::from("paper-main/images/figure.png"),
                is_directory: false,
            },
        ];
        let references: Vec<&ArchiveEntry> = entries.iter().collect();
        assert_eq!(
            shared_wrapper_directory(&references),
            Some(OsString::from("paper-main"))
        );
    }

    #[test]
    fn keeps_root_level_archive_layout() {
        let entries = [ArchiveEntry {
            archive_index: 0,
            path: PathBuf::from("main.tex"),
            is_directory: false,
        }];
        let references: Vec<&ArchiveEntry> = entries.iter().collect();
        assert_eq!(shared_wrapper_directory(&references), None);
    }

    #[test]
    fn sanitizes_project_folder_names() {
        assert_eq!(
            sanitize_project_name(" paper: draft?.zip "),
            "paper- draft-.zip"
        );
        assert_eq!(sanitize_project_name("..."), "");
    }

    #[test]
    fn extracts_a_latex_project_and_removes_its_wrapper() {
        let directory = tempdir().unwrap();
        let archive = directory.path().join("sample.zip");
        write_test_archive(
            &archive,
            &[
                ("sample-main/main.tex", "\\documentclass{article}"),
                ("sample-main/figures/notes.txt", "figure notes"),
            ],
        );

        let result = extract_archive_file(&archive, directory.path(), "sample").unwrap();
        let project_path = PathBuf::from(result.project_path);

        assert_eq!(result.file_count, 2);
        assert!(project_path.join("main.tex").is_file());
        assert!(project_path.join("figures/notes.txt").is_file());
        assert!(!project_path.join("sample-main").exists());
    }

    #[test]
    fn rejects_path_traversal_entries_without_writing_files() {
        let directory = tempdir().unwrap();
        let archive = directory.path().join("unsafe.zip");
        write_test_archive(
            &archive,
            &[
                ("main.tex", "\\documentclass{article}"),
                ("../outside.txt", "unsafe"),
            ],
        );

        let result = extract_archive_file(&archive, directory.path(), "unsafe");

        assert!(result.is_err());
        assert!(!directory.path().join("outside.txt").exists());
        assert!(!directory.path().join("unsafe").exists());
    }

    #[test]
    fn rejects_archives_without_latex_sources() {
        let directory = tempdir().unwrap();
        let archive = directory.path().join("not-latex.zip");
        write_test_archive(&archive, &[("README.md", "Nothing to compile")]);

        let result = extract_archive_file(&archive, directory.path(), "not-latex");

        assert!(result.is_err());
        assert!(!directory.path().join("not-latex").exists());
    }
}
