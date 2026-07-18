export type OutlineItemKind =
  | "part"
  | "chapter"
  | "section"
  | "subsection"
  | "subsubsection"
  | "appendix"
  | "figure"
  | "table"
  | "equation"
  | "label"
  | "bibliography";

export type OutlineItemGroup = "structure" | "objects";

export interface OutlineItem {
  kind: OutlineItemKind;
  group: OutlineItemGroup;
  level: number;
  title: string;
  detail?: string;
  line: number;
  /** Relative path of the file this item lives in (set by parseProjectOutline). */
  file?: string;
}

const HEADING_LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
};

function stripLatex(value: string) {
  return value
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstBraceArgument(line: string, command: string) {
  const start = line.search(
    new RegExp(`\\\\${command}\\*?(?:\\[[^\\]]*\\])?\\s*\\{`),
  );
  if (start === -1) return null;
  const open = line.indexOf("{", start);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < line.length; i++) {
    if (line[i] === "{") depth++;
    if (line[i] === "}") {
      depth--;
      if (depth === 0) return line.slice(open + 1, i);
    }
  }

  return null;
}

function findLabels(line: string) {
  const labels: string[] = [];
  const regex = /\\label\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line))) {
    labels.push(match[1].trim());
  }
  return labels;
}

export function parseDocumentOutline(content: string): OutlineItem[] {
  return parseOutlineCore(content);
}

function parseOutlineCore(
  content: string,
  file?: string,
  expandInclude?: (target: string) => OutlineItem[],
): OutlineItem[] {
  // Split on \r?\n so CRLF files don't leave a trailing \r on each line,
  // which would break $-anchored regexes (comment stripping)
  const lines = content.split(/\r?\n/);
  const items: OutlineItem[] = [];
  let openFloatIndex: number | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const lineStartIndex = items.length;

    const headingMatch = line.match(
      /\\(part|chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\s*\{/,
    );
    if (headingMatch) {
      const type = headingMatch[1];
      const title = firstBraceArgument(line, type);
      items.push({
        kind: type as OutlineItemKind,
        group: "structure",
        level: HEADING_LEVELS[type] ?? 2,
        title: stripLatex(title ?? "") || "Untitled",
        line: lineNumber,
      });
    }

    if (/\\appendix\b/.test(line)) {
      items.push({
        kind: "appendix",
        group: "structure",
        level: 1,
        title: "Appendix",
        line: lineNumber,
      });
    }

    const beginMatch = line.match(
      /\\begin\{(figure|table|equation|align|gather|multline)\*?\}/,
    );
    if (beginMatch) {
      const environment = beginMatch[1];
      if (environment === "figure" || environment === "table") {
        items.push({
          kind: environment,
          group: "objects",
          level: 1,
          title: environment === "figure" ? "Figure" : "Table",
          detail: environment,
          line: lineNumber,
        });
        openFloatIndex = items.length - 1;
      } else {
        items.push({
          kind: "equation",
          group: "objects",
          level: 1,
          title: "Equation",
          detail: environment,
          line: lineNumber,
        });
      }
    }

    const caption = firstBraceArgument(line, "caption");
    if (caption && openFloatIndex != null) {
      items[openFloatIndex] = {
        ...items[openFloatIndex],
        title: stripLatex(caption) || items[openFloatIndex].title,
      };
    }

    if (/\\end\{(figure|table)\*?\}/.test(line)) {
      openFloatIndex = null;
    }

    const bibliographyMatch = line.match(
      /\\(bibliography|printbibliography|addbibresource)(?:\[[^\]]*\])?(?:\{([^}]*)\})?/,
    );
    if (bibliographyMatch) {
      const target = bibliographyMatch[2]?.trim();
      items.push({
        kind: "bibliography",
        group: "objects",
        level: 1,
        title:
          bibliographyMatch[1] === "addbibresource"
            ? "Bibliography file"
            : "Bibliography",
        detail: target,
        line: lineNumber,
      });
    }

    for (const label of findLabels(line)) {
      items.push({
        kind: "label",
        group: "objects",
        level: 2,
        title: label,
        detail: "label",
        line: lineNumber,
      });
    }

    if (file) {
      for (let i = lineStartIndex; i < items.length; i++) {
        items[i].file = file;
      }
    }

    if (expandInclude) {
      // Ignore commented-out includes (unescaped % starts a comment)
      const codeLine = line.replace(/(^|[^\\])%.*$/, "$1");
      const includeRegex =
        /\\(?:input|include|subfile|subfileinclude)\s*\{([^}]+)\}|\\(?:import|subimport)\s*\{([^}]*)\}\s*\{([^}]+)\}/g;
      let match: RegExpExecArray | null;
      while ((match = includeRegex.exec(codeLine))) {
        const target =
          match[1] ??
          (match[2] ? `${match[2].replace(/\/+$/, "")}/${match[3]}` : match[3]);
        items.push(...expandInclude(target.trim()));
      }
    }
  });

  return items;
}

// ─── Project-wide outline (Overleaf-style) ───

export interface OutlineSourceFile {
  relativePath: string;
  type?: string;
  content?: string;
}

function normalizeOutlinePath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function resolveIncludePath(
  target: string,
  fromDir: string,
  byPath: Map<string, OutlineSourceFile>,
): string | null {
  const raw = normalizeOutlinePath(target);
  if (!raw) return null;
  // \input{chapters/intro} → chapters/intro.tex; explicit extensions win
  const candidates = /\.[a-zA-Z]+$/.test(raw) ? [raw] : [`${raw}.tex`, raw];
  for (const candidate of candidates) {
    // LaTeX resolves relative to the compile root; also try relative to the
    // including file's directory since both layouts are common in practice.
    if (byPath.has(candidate)) return candidate;
    if (fromDir) {
      const joined = normalizeOutlinePath(`${fromDir}/${candidate}`);
      if (byPath.has(joined)) return joined;
    }
  }
  return null;
}

/**
 * Build a single outline for the whole document tree, starting from the root
 * file and splicing in the outline of every file pulled in via \input,
 * \include, \subfile, or \import at the point where it appears — the way
 * Overleaf's file outline flattens multi-file projects.
 *
 * Each item carries the `file` it came from so callers can jump across files.
 * Files are expanded at most once (guards against include cycles).
 */
export function parseProjectOutline(
  rootPath: string,
  files: OutlineSourceFile[],
): OutlineItem[] {
  const byPath = new Map<string, OutlineSourceFile>();
  for (const f of files) {
    byPath.set(normalizeOutlinePath(f.relativePath), f);
  }

  const visited = new Set<string>();

  function parseFile(path: string): OutlineItem[] {
    const normalized = normalizeOutlinePath(path);
    const file = byPath.get(normalized);
    if (!file || typeof file.content !== "string") return [];
    if (file.type && file.type !== "tex") return [];
    if (visited.has(normalized)) return [];
    visited.add(normalized);

    const fromDir = normalized.includes("/")
      ? normalized.slice(0, normalized.lastIndexOf("/"))
      : "";
    return parseOutlineCore(file.content, file.relativePath, (target) => {
      const resolved = resolveIncludePath(target, fromDir, byPath);
      return resolved ? parseFile(resolved) : [];
    });
  }

  return parseFile(rootPath);
}
