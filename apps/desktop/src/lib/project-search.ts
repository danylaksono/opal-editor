import type { ProjectFile } from "@/stores/document-store";

export interface ProjectSearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  maxResults?: number;
}

export interface ProjectSearchMatch {
  fileId: string;
  filePath: string;
  from: number;
  to: number;
  line: number;
  column: number;
  lineText: string;
  matchFromInLine: number;
  matchToInLine: number;
}

export interface ProjectSearchResult {
  matches: ProjectSearchMatch[];
  error?: string;
  truncated: boolean;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createPattern(query: string, options: ProjectSearchOptions) {
  const source = options.useRegex ? query : escapeRegExp(query);
  const bounded = options.wholeWord ? `\\b(?:${source})\\b` : source;
  return new RegExp(bounded, options.caseSensitive ? "g" : "gi");
}

function lineDetails(content: string, from: number, to: number) {
  const lineStart = content.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const nextNewline = content.indexOf("\n", to);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;
  const line = content.slice(0, lineStart).split("\n").length;
  return {
    line,
    column: from - lineStart + 1,
    lineText: content.slice(lineStart, lineEnd),
    matchFromInLine: from - lineStart,
    matchToInLine: to - lineStart,
  };
}

export function searchProjectFiles(
  files: ProjectFile[],
  query: string,
  options: ProjectSearchOptions,
): ProjectSearchResult {
  if (!query) return { matches: [], truncated: false };

  let pattern: RegExp;
  try {
    pattern = createPattern(query, options);
  } catch (error) {
    return {
      matches: [],
      error:
        error instanceof Error ? error.message : "Invalid regular expression",
      truncated: false,
    };
  }

  const maxResults = options.maxResults ?? 500;
  const matches: ProjectSearchMatch[] = [];
  for (const file of files) {
    if (file.content === undefined) continue;
    pattern.lastIndex = 0;
    for (const match of file.content.matchAll(pattern)) {
      const value = match[0];
      const from = match.index ?? 0;
      const to = from + value.length;
      matches.push({
        fileId: file.id,
        filePath: file.relativePath,
        from,
        to,
        ...lineDetails(file.content, from, to),
      });
      if (matches.length >= maxResults) {
        return { matches, truncated: true };
      }
      // A zero-length regular expression needs manual progress.
      if (value.length === 0) pattern.lastIndex += 1;
    }
  }
  return { matches, truncated: false };
}
