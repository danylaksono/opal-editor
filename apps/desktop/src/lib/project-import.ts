import { invoke } from "@tauri-apps/api/core";

export interface ProjectImportResult {
  projectPath: string;
  fileCount: number;
}

export function importZipProject(
  archivePath: string,
  destinationDir: string,
): Promise<ProjectImportResult> {
  return invoke<ProjectImportResult>("import_zip_project", {
    archivePath,
    destinationDir,
  });
}

export function importGitHubProject(
  repositoryUrl: string,
  destinationDir: string,
): Promise<ProjectImportResult> {
  return invoke<ProjectImportResult>("import_github_project", {
    repositoryUrl,
    destinationDir,
  });
}
