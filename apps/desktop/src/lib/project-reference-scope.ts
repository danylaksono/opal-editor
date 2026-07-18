import type { ProjectFile } from "@/stores/document-store";

export interface ProjectReferenceScope {
  rootFileId: string;
  texFileIds: Set<string>;
  bibliographyFileIds: Set<string>;
  bibliographyDeclarations: string[];
  fallbackToAllBibliographyFiles: boolean;
}

export function resolveProjectReferenceScope(
  files: ProjectFile[],
  rootFileId: string,
): ProjectReferenceScope {
  const textFiles = files.filter(
    (file) => file.type === "tex" && file.content !== undefined,
  );
  const bibliographyFiles = files.filter((file) => file.type === "bib");
  const filesByPath = new Map(
    files.map((file) => [normalizePath(file.relativePath), file]),
  );
  const root = files.find(
    (file) => file.id === rootFileId && file.type === "tex",
  );

  if (!root) {
    return {
      rootFileId,
      texFileIds: new Set(textFiles.map((file) => file.id)),
      bibliographyFileIds: new Set(bibliographyFiles.map((file) => file.id)),
      bibliographyDeclarations: [],
      fallbackToAllBibliographyFiles: true,
    };
  }

  const texFileIds = new Set<string>();
  const bibliographyFileIds = new Set<string>();
  const bibliographyDeclarations: string[] = [];
  const queue = [root];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || texFileIds.has(file.id)) continue;
    texFileIds.add(file.id);

    const source = stripLatexComments(file.content ?? "");
    for (const requestedPath of findIncludedTexPaths(source)) {
      const included = resolveProjectFile(
        filesByPath,
        file.relativePath,
        requestedPath,
        ".tex",
      );
      if (included?.type === "tex" && !texFileIds.has(included.id)) {
        queue.push(included);
      }
    }

    for (const requestedPath of findBibliographyPaths(source)) {
      bibliographyDeclarations.push(requestedPath);
      const bibliography = resolveProjectFile(
        filesByPath,
        file.relativePath,
        requestedPath,
        ".bib",
      );
      if (bibliography?.type === "bib") {
        bibliographyFileIds.add(bibliography.id);
      }
    }
  }

  const fallbackToAllBibliographyFiles = bibliographyFileIds.size === 0;
  if (fallbackToAllBibliographyFiles) {
    for (const file of bibliographyFiles) bibliographyFileIds.add(file.id);
  }

  return {
    rootFileId: root.id,
    texFileIds,
    bibliographyFileIds,
    bibliographyDeclarations,
    fallbackToAllBibliographyFiles,
  };
}

export function selectProjectReferenceFiles(
  files: ProjectFile[],
  scope: ProjectReferenceScope,
  includeAllBibliographyFiles: boolean,
): ProjectFile[] {
  return files.filter((file) => {
    if (file.type === "tex") return scope.texFileIds.has(file.id);
    if (file.type === "bib") {
      return (
        includeAllBibliographyFiles || scope.bibliographyFileIds.has(file.id)
      );
    }
    return false;
  });
}

function stripLatexComments(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^\\])%.*$/, "$1"))
    .join("\n");
}

function findIncludedTexPaths(content: string): string[] {
  const paths: string[] = [];
  const includePattern = /\\(?:input|include|subfile)\s*\{([^}]+)\}/g;
  for (const match of content.matchAll(includePattern)) {
    const path = match[1].trim();
    if (isLiteralPath(path)) paths.push(path);
  }

  const importPattern = /\\(?:import|subimport)\s*\{([^}]+)\}\s*\{([^}]+)\}/g;
  for (const match of content.matchAll(importPattern)) {
    const path = `${match[1].trim()}/${match[2].trim()}`;
    if (isLiteralPath(path)) paths.push(path);
  }
  return paths;
}

function findBibliographyPaths(content: string): string[] {
  const paths: string[] = [];
  const bibliographyPattern = /\\bibliography\s*\{([^}]+)\}/g;
  for (const match of content.matchAll(bibliographyPattern)) {
    for (const value of match[1].split(",")) {
      const path = value.trim();
      if (isLiteralPath(path)) paths.push(path);
    }
  }

  const biblatexPattern =
    /\\(?:addbibresource|addglobalbib|addsectionbib)(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g;
  for (const match of content.matchAll(biblatexPattern)) {
    const path = match[1].trim();
    if (isLiteralPath(path)) paths.push(path);
  }
  return paths;
}

function isLiteralPath(path: string): boolean {
  return Boolean(path) && !/[\\#$]/.test(path);
}

function resolveProjectFile(
  filesByPath: Map<string, ProjectFile>,
  fromPath: string,
  requestedPath: string,
  defaultExtension: string,
): ProjectFile | undefined {
  const requested = requestedPath
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\/g, "/");
  const withExtension = hasExtension(requested)
    ? requested
    : `${requested}${defaultExtension}`;
  const fromDirectory = normalizePath(fromPath).split("/").slice(0, -1);
  const candidates = [
    normalizePath([...fromDirectory, withExtension].join("/")),
    normalizePath(withExtension),
  ];
  for (const candidate of candidates) {
    const file = filesByPath.get(candidate);
    if (file) return file;
  }
  return undefined;
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/").toLowerCase();
}

function hasExtension(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  return /\.[a-zA-Z0-9]+$/.test(name);
}
