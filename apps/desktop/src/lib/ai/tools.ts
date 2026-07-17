import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { useProposedChangesStore } from "@/stores/proposed-changes-store";
import type { AiToolDefinition } from "./types";

/**
 * The AI assistant's tool surface. All tools run in the frontend against the
 * in-memory document store, so they see unsaved editor changes. `propose_edit`
 * never touches the buffer or disk directly — it registers a ProposedChange
 * that the user reviews (accept/reject) in the editor's merge view.
 */

const TEXT_FILE_TYPES = new Set(["tex", "bib", "style", "other"]);
const MAX_FILE_CHARS = 120_000;
const MAX_SEARCH_RESULTS = 50;

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: "list_files",
    description:
      "List all files in the LaTeX project with their types. " +
      "Use this to discover the project structure before reading files.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "read_file",
    description:
      "Read the current content of a project file, including unsaved editor " +
      "changes and pending proposed edits. Always read a file before " +
      "proposing edits to it.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Project-relative file path, e.g. 'main.tex' or 'chapters/intro.tex'",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "search_project",
    description:
      "Search all text files in the project for a literal string " +
      "(case-insensitive). Returns matching lines as 'path:line: text'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Literal text to search for" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_edit",
    description:
      "Propose a change to a project file. `search` must be copied verbatim " +
      "from the file (including whitespace) and match exactly one location; " +
      "include enough surrounding context to make it unique. The edit is NOT " +
      "applied directly — the user reviews it as a diff in the editor and " +
      "accepts or rejects it. Make one propose_edit call per logical change.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Project-relative path of the file to edit",
        },
        search: {
          type: "string",
          description: "Exact text to replace (must be unique in the file)",
        },
        replace: { type: "string", description: "Replacement text" },
        reason: {
          type: "string",
          description: "One-line explanation of the change",
        },
      },
      required: ["path", "search", "replace"],
      additionalProperties: false,
    },
  },
];

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

function ok(content: string): ToolExecutionResult {
  return { content };
}

function err(content: string): ToolExecutionResult {
  return { content, isError: true };
}

function findFile(path: string): ProjectFile | undefined {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return useDocumentStore
    .getState()
    .files.find((f) => f.relativePath === normalized);
}

/**
 * The content the user currently sees for a file: a pending proposed change's
 * newContent if one exists, otherwise the editor buffer.
 */
function effectiveContent(file: ProjectFile): string | null {
  const pending = useProposedChangesStore
    .getState()
    .getChangeForFile(file.relativePath);
  return pending?.newContent ?? file.content ?? null;
}

function listFiles(): ToolExecutionResult {
  const { files, projectRoot } = useDocumentStore.getState();
  if (!projectRoot) return err("No project is open.");
  if (files.length === 0) return ok("The project contains no files.");
  const lines = files.map((f) => `${f.relativePath} (${f.type})`);
  return ok(lines.join("\n"));
}

function readFile(input: any): ToolExecutionResult {
  const path = typeof input?.path === "string" ? input.path : "";
  if (!path) return err("Missing required parameter: path");
  const file = findFile(path);
  if (!file) {
    return err(
      `File not found: ${path}. Call list_files to see available files.`,
    );
  }
  if (!TEXT_FILE_TYPES.has(file.type)) {
    return err(`${path} is a ${file.type} file and cannot be read as text.`);
  }
  const content = effectiveContent(file);
  if (content == null) {
    return err(`${path} is not loaded in the editor (file may be too large).`);
  }
  if (content.length > MAX_FILE_CHARS) {
    return ok(
      `${content.slice(0, MAX_FILE_CHARS)}\n\n[Truncated — file is ${content.length} characters long]`,
    );
  }
  return ok(content);
}

function searchProject(input: any): ToolExecutionResult {
  const query = typeof input?.query === "string" ? input.query : "";
  if (!query) return err("Missing required parameter: query");
  const { files, projectRoot } = useDocumentStore.getState();
  if (!projectRoot) return err("No project is open.");

  const needle = query.toLowerCase();
  const results: string[] = [];
  let truncated = false;

  for (const file of files) {
    if (!TEXT_FILE_TYPES.has(file.type)) continue;
    const content = effectiveContent(file);
    if (content == null) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        if (results.length >= MAX_SEARCH_RESULTS) {
          truncated = true;
          break;
        }
        results.push(`${file.relativePath}:${i + 1}: ${lines[i].trim()}`);
      }
    }
    if (truncated) break;
  }

  if (results.length === 0) return ok(`No matches found for "${query}".`);
  return ok(
    results.join("\n") +
      (truncated ? `\n[More matches exist — showing first ${MAX_SEARCH_RESULTS}]` : ""),
  );
}

function proposeEdit(input: any, toolUseId: string): ToolExecutionResult {
  const path = typeof input?.path === "string" ? input.path : "";
  const search = typeof input?.search === "string" ? input.search : "";
  const replace = typeof input?.replace === "string" ? input.replace : "";
  if (!path) return err("Missing required parameter: path");
  if (!search) return err("Missing required parameter: search");

  const file = findFile(path);
  if (!file) {
    return err(
      `File not found: ${path}. Call list_files to see available files.`,
    );
  }
  if (!TEXT_FILE_TYPES.has(file.type)) {
    return err(`${path} is a ${file.type} file and cannot be edited as text.`);
  }
  const base = effectiveContent(file);
  if (base == null) {
    return err(`${path} is not loaded in the editor (file may be too large).`);
  }

  // Count occurrences of the literal search text
  let count = 0;
  let idx = base.indexOf(search);
  while (idx !== -1) {
    count++;
    idx = base.indexOf(search, idx + 1);
    if (count > 1) break;
  }
  if (count === 0) {
    return err(
      `The search text was not found in ${path}. The file content may differ from what you expect — call read_file and copy the text verbatim.`,
    );
  }
  if (count > 1) {
    return err(
      `The search text matches more than one location in ${path}. Include more surrounding lines to make it unique.`,
    );
  }

  const at = base.indexOf(search);
  const newContent = base.slice(0, at) + replace + base.slice(at + search.length);

  useProposedChangesStore.getState().addChange({
    id: toolUseId,
    filePath: file.relativePath,
    absolutePath: file.absolutePath,
    oldContent: base,
    newContent,
    toolName: "propose_edit",
  });

  return ok(
    `Proposed edit to ${path}. The user will review it in the editor and accept or reject it — do not assume it has been applied.`,
  );
}

export async function executeAiTool(
  name: string,
  input: unknown,
  toolUseId: string,
): Promise<ToolExecutionResult> {
  try {
    switch (name) {
      case "list_files":
        return listFiles();
      case "read_file":
        return readFile(input);
      case "search_project":
        return searchProject(input);
      case "propose_edit":
        return proposeEdit(input, toolUseId);
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(`Tool execution failed: ${String(e)}`);
  }
}
