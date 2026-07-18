import { invoke } from "@tauri-apps/api/core";
import { resolveTexRoot, type ProjectFile } from "@/stores/document-store";
import { createLogger } from "@/lib/debug/logger";
import { friendlyCompileError } from "@/lib/latex-guidance";

const log = createLogger("latex");

/** Resolve which file to compile and the root ID for caching.
 *  resolveTexRoot now handles \documentclass detection and main.tex fallback,
 *  so the only remaining fallback here is for projects with no .tex files.
 *  Returns `null` when the project has no compilable .tex file. */
export function resolveCompileTarget(
  activeFileId: string,
  files: ProjectFile[],
): { rootId: string; targetPath: string } | null {
  const rootId = resolveTexRoot(activeFileId, files);
  const rootEntry = files.find((f) => f.id === rootId);
  if (rootEntry?.type === "tex") {
    return { rootId, targetPath: rootEntry.relativePath };
  }
  // No .tex file exists — cannot compile
  const anyTex = files.find((f) => f.type === "tex");
  if (anyTex) {
    return { rootId: anyTex.id, targetPath: anyTex.relativePath };
  }
  return null;
}

export interface CompileDiagnostic {
  message: string;
  file?: string;
  line?: number;
}

export interface CompileFailure {
  backend: string;
  category:
    | "undefined-command"
    | "missing-file"
    | "syntax"
    | "busy"
    | "engine"
    | string;
  summary: string;
  sourceFile?: string;
  sourceLine?: number;
  relatedDiagnostics: CompileDiagnostic[];
  rawEngineOutput: string;
}

export function isCompileFailure(value: unknown): value is CompileFailure {
  return Boolean(
    value &&
      typeof value === "object" &&
      "summary" in value &&
      "rawEngineOutput" in value,
  );
}

/** Normalize both structured Rust failures and legacy string rejections. */
export function formatCompileError(error: unknown): CompileFailure {
  if (isCompileFailure(error)) return error;
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Compilation failed";
  const summary = friendlyCompileError(raw);
  const line = /(?:^|\n)l\.(\d+)/.exec(raw)?.[1];
  return {
    backend: "unknown",
    category: /Undefined control sequence/.test(raw)
      ? "undefined-command"
      : /not found|File `/.test(raw)
        ? "missing-file"
        : "engine",
    summary,
    sourceLine: line ? Number(line) : undefined,
    relatedDiagnostics: [
      { message: summary, line: line ? Number(line) : undefined },
    ],
    rawEngineOutput: raw,
  };
}

export async function compileLatex(
  projectDir: string,
  mainFile: string = "main.tex",
  useTexlive: boolean = false,
): Promise<Uint8Array> {
  log.info(
    `Compiling ${mainFile} (backend: ${useTexlive ? "texlive" : "tectonic"})`,
  );
  const start = performance.now();
  // compile_latex returns raw PDF bytes via Tauri IPC Response
  const buffer = await invoke<ArrayBuffer>("compile_latex", {
    projectDir,
    mainFile,
    useTexlive,
  });

  const result = new Uint8Array(buffer);
  log.info(
    `Compiled ${mainFile} in ${(performance.now() - start).toFixed(0)}ms (${(result.byteLength / 1024).toFixed(0)} KB)`,
  );
  return result;
}

export interface TexliveStatus {
  available: boolean;
  engines: string[];
  version: string | null;
}

export async function detectTexlive(): Promise<TexliveStatus> {
  return invoke<TexliveStatus>("detect_texlive");
}

export interface SynctexResult {
  file: string;
  line: number;
  column: number;
}

export async function synctexEdit(
  projectDir: string,
  page: number,
  x: number,
  y: number,
): Promise<SynctexResult | null> {
  try {
    const result = await invoke<SynctexResult>("synctex_edit", {
      projectDir,
      page,
      x,
      y,
    });
    if (result)
      log.debug(`SyncTeX: page ${page} → ${result.file}:${result.line}`);
    return result;
  } catch (err) {
    log.debug("SyncTeX lookup failed", { page, error: String(err) });
    return null;
  }
}

export interface SynctexViewResult {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function synctexView(
  projectDir: string,
  file: string,
  line: number,
): Promise<SynctexViewResult | null> {
  try {
    const result = await invoke<SynctexViewResult>("synctex_view", {
      projectDir,
      file,
      line,
    });
    log.debug(`SyncTeX: ${file}:${line} → page ${result.page}`);
    return result;
  } catch (err) {
    log.debug("SyncTeX forward lookup failed", {
      file,
      line,
      error: String(err),
    });
    return null;
  }
}
