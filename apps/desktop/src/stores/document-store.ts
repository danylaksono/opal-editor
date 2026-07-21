import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  scanProjectFolder,
  readTexFileContent,
  writeTexFileContent,
  readImageAsDataUrl,
  createFileOnDisk,
  copyFileToProject,
  deleteFileFromDisk,
  deleteFolderFromDisk,
  renameFileOnDisk,
  getUniqueTargetName,
  createDirectory,
  join,
  LARGE_FILE_THRESHOLD,
  type ProjectFileType,
} from "@/lib/tauri/fs";
import { useHistoryStore } from "@/stores/history-store";
import { useProjectStore } from "@/stores/project-store";
import { clearDocCache } from "@/lib/mupdf/pdf-doc-cache";
import { clearScrollPositionCache } from "@/components/workspace/preview/pdf-viewer";
import { clearZoomCache } from "@/components/workspace/preview/zoom-cache";
import { clearEditorStateCache } from "@/components/workspace/editor/latex-editor";
import { createLogger } from "@/lib/debug/logger";
import type { CompileFailure } from "@/lib/latex-compiler";

const log = createLogger("document");

export interface ProjectFile {
  id: string; // relativePath is the id
  name: string;
  relativePath: string;
  absolutePath: string;
  type: ProjectFileType;
  content?: string;
  dataUrl?: string;
  isDirty: boolean;
  /** File size in bytes (from stat). Used to skip auto-loading large files. */
  fileSize?: number;
}

// ── PDF bytes cache (kept outside Zustand to avoid React diffing large buffers) ──
// Keyed by rootFileId. Consumers read via getPdfBytes() / getCurrentPdfBytes().
const _pdfBytesCache = new Map<string, Uint8Array>();
/** Current active PDF root file id (mirrors what Zustand tracks via pdfRevision). */
let _currentPdfRootId: string | null = null;

/** Get PDF bytes for a specific root file id. */
export function getPdfBytes(rootFileId: string): Uint8Array | undefined {
  return _pdfBytesCache.get(rootFileId);
}

/** Get the current active PDF bytes (convenience for components that don't know the rootId). */
export function getCurrentPdfBytes(): Uint8Array | null {
  return _currentPdfRootId
    ? (_pdfBytesCache.get(_currentPdfRootId) ?? null)
    : null;
}

/** Check if any PDF data exists for the current root. */
export function hasPdfData(): boolean {
  return _currentPdfRootId != null && _pdfBytesCache.has(_currentPdfRootId);
}

export function clearPdfBytesCache() {
  _pdfBytesCache.clear();
  _currentPdfRootId = null;
}

interface DocumentState {
  projectRoot: string | null;
  files: ProjectFile[];
  folders: string[];
  activeFileId: string;
  /**
   * Pinned editor tabs, in tab-strip order. The active file may be absent —
   * it then shows as a transient preview tab that the next preview replaces.
   */
  openFileIds: string[];
  cursorPosition: number;
  selectionRange: { start: number; end: number } | null;
  jumpToPosition: number | null;
  isThreadOpen: boolean;
  /** Bumped whenever PDF bytes change — triggers re-render without storing bytes in state. */
  pdfRevision: number;
  compileError: CompileFailure | string | null;
  isCompiling: boolean;
  /** When true, a recompile will be triggered after the current compile finishes. */
  pendingRecompile: boolean;
  isSaving: boolean;
  initialized: boolean;
  /** Incremented on every file content change; used to skip no-op recompiles. */
  contentGeneration: number;
  /** Per-root-file cache: rootFileId → compile error message. */
  compileErrorCache: Map<string, CompileFailure | string>;
  /** Per-root-file: rootFileId → contentGeneration at last successful compile. */
  lastCompiledGenerations: Map<string, number>;

  openProject: (rootPath: string) => Promise<void>;
  closeProject: () => void;
  setActiveFile: (id: string) => void;
  /** Open a file as a pinned tab (explorer "Open in New Tab") and activate it. */
  openFileInTab: (id: string) => void;
  /** Close an editor tab without deleting the file. Keeps the last tab open. */
  closeTab: (id: string) => void;
  /** Switch to the next (1) or previous (-1) tab, wrapping around. */
  cycleTab: (direction: 1 | -1) => void;
  addFile: (file: Omit<ProjectFile, "id" | "isDirty">) => string;
  deleteFile: (id: string) => void;
  deleteFolder: (folderPath: string) => Promise<void>;
  renameFile: (id: string, name: string) => void;
  updateFileContent: (id: string, content: string) => void;
  updateImageDataUrl: (id: string, dataUrl: string) => void;
  setCursorPosition: (position: number) => void;
  setSelectionRange: (range: { start: number; end: number } | null) => void;
  requestJumpToPosition: (position: number) => void;
  clearJumpRequest: () => void;
  setThreadOpen: (open: boolean) => void;
  setPdfData: (data: Uint8Array | null, rootFileId?: string) => void;
  setCompileError: (
    error: CompileFailure | string | null,
    rootFileId?: string,
  ) => void;
  setIsCompiling: (isCompiling: boolean) => void;
  setPendingRecompile: (pending: boolean) => void;
  setIsSaving: (isSaving: boolean) => void;
  insertAtCursor: (text: string) => void;
  replaceSelection: (start: number, end: number, text: string) => void;
  findAndReplace: (find: string, replace: string) => boolean;
  setInitialized: () => void;
  saveFile: (id: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  saveCurrentFile: () => Promise<void>;
  createNewFile: (
    name: string,
    type: "tex" | "image",
    folder?: string,
  ) => Promise<void>;
  createFolder: (name: string, parentFolder?: string) => Promise<void>;
  importFiles: (
    sourcePaths: string[],
    targetFolder?: string,
  ) => Promise<string[]>;
  moveFile: (fileId: string, targetFolder: string | null) => Promise<void>;
  moveFolder: (
    folderPath: string,
    targetFolder: string | null,
  ) => Promise<void>;
  reloadFile: (relativePath: string) => Promise<void>;
  refreshFiles: () => Promise<void>;
  /** Load content for a file that was skipped during project open (large file). */
  loadFileContent: (id: string) => Promise<void>;

  get fileName(): string;
  get content(): string;
  setFileName: (name: string) => void;
  setContent: (content: string) => void;
}

function getActiveFile(state: { files: ProjectFile[]; activeFileId: string }) {
  return state.files.find((f) => f.id === state.activeFileId);
}

function addToOpenTabs(openFileIds: string[], id: string): string[] {
  if (!id || openFileIds.includes(id)) return openFileIds;
  return [...openFileIds, id];
}

/**
 * The tab to activate after closing `closedId`: the tab that was to its right,
 * or the new last tab when the rightmost one was closed.
 */
function pickNeighborTab(
  openFileIds: string[],
  closedId: string,
): string | undefined {
  const idx = openFileIds.indexOf(closedId);
  const remaining = openFileIds.filter((t) => t !== closedId);
  if (remaining.length === 0) return undefined;
  return remaining[Math.min(Math.max(idx, 0), remaining.length - 1)];
}

/**
 * True when the content has a `\documentclass` outside of LaTeX comments.
 * A commented occurrence (e.g. usage instructions in a config file's header)
 * must not mark the file as a compilable root.
 */
export function hasDocumentclass(content: string): boolean {
  if (!/\\documentclass[\s{[]/.test(content)) return false;
  // Split on \r?\n: a trailing \r would keep `$` from anchoring in the
  // comment-stripping regex on CRLF files
  for (const line of content.split(/\r?\n/)) {
    // Strip comments; an unescaped % starts one (\% does not)
    const code = line.replace(/(^|[^\\])%.*$/, "$1");
    if (/\\documentclass[\s{[]/.test(code)) return true;
  }
  return false;
}

/**
 * Resolve the root .tex file for compilation.
 *
 * Priority order:
 * 1. `% !TEX root = <file>` magic comment in the first 20 lines of the active file
 * 2. The file itself, if it contains `\documentclass`
 * 3. `main.tex` or `document.tex` that contains `\documentclass`
 * 4. Any other .tex file in the project that contains `\documentclass`
 * 5. Fallback: the active file itself
 */
export function resolveTexRoot(fileId: string, files: ProjectFile[]): string {
  const file = files.find((f) => f.id === fileId);
  if (!file || file.type !== "tex" || !file.content) return fileId;

  // 1. Check for % !TEX root magic comment
  const lines = file.content.split("\n").slice(0, 20);
  for (const line of lines) {
    const match = line.match(/^%\s*!TEX\s+root\s*=\s*(.+)/i);
    if (match) {
      const rootPath = match[1].trim();
      const target =
        files.find((f) => f.relativePath === rootPath) ??
        files.find((f) => f.name === rootPath);
      if (target) return target.id;
    }
  }

  // 2. If the current file contains \documentclass, it is a root file
  if (hasDocumentclass(file.content)) {
    return fileId;
  }

  // 3. Look for main.tex or document.tex with \documentclass
  const wellKnown = files.find(
    (f) =>
      (f.name === "main.tex" || f.name === "document.tex") &&
      f.type === "tex" &&
      f.content &&
      hasDocumentclass(f.content),
  );
  if (wellKnown) return wellKnown.id;

  // 4. Any .tex file with \documentclass
  const anyRoot = files.find(
    (f) =>
      f.type === "tex" &&
      f.id !== fileId &&
      f.content &&
      hasDocumentclass(f.content),
  );
  if (anyRoot) return anyRoot.id;

  // 5. Fallback: the active file itself
  return fileId;
}

/** Re-key the external PDF bytes cache when a file is renamed/moved. */
function migratePdfBytesKey(oldKey: string, newKey: string) {
  if (!_pdfBytesCache.has(oldKey)) return;
  const bytes = _pdfBytesCache.get(oldKey)!;
  _pdfBytesCache.delete(oldKey);
  _pdfBytesCache.set(newKey, bytes);
  if (_currentPdfRootId === oldKey) _currentPdfRootId = newKey;
}

/** Re-key a Map entry when a file is renamed/moved. */
function migrateCacheKey<V>(
  map: Map<string, V>,
  oldKey: string,
  newKey: string,
): Map<string, V> {
  if (!map.has(oldKey)) return map;
  const copy = new Map(map);
  const val = copy.get(oldKey)!;
  copy.delete(oldKey);
  copy.set(newKey, val);
  return copy;
}

// Auto-save: debounced save 2 seconds after last content change
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
// Store reference set after creation to avoid TDZ issues
let storeRef: typeof useDocumentStore | null = null;

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const store = storeRef;
    if (!store) return;
    const state = store.getState();
    const dirtyFiles = state.files.filter(
      (f) => f.isDirty && f.content != null,
    );
    if (dirtyFiles.length > 0) {
      await state.saveAllFiles();
    }
  }, 2000);
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  projectRoot: null,
  files: [],
  folders: [],
  activeFileId: "",
  openFileIds: [],
  cursorPosition: 0,
  selectionRange: null,
  jumpToPosition: null,
  isThreadOpen: false,
  pdfRevision: 0,
  compileError: null,
  isCompiling: false,
  pendingRecompile: false,
  isSaving: false,
  initialized: false,
  contentGeneration: 0,
  compileErrorCache: new Map(),
  lastCompiledGenerations: new Map(),

  openProject: async (rootPath: string) => {
    log.info(`Opening project: ${rootPath}`);
    await invoke("allow_project_directory", { rootPath });
    const { files: fsFiles, folders: fsFolders } =
      await scanProjectFolder(rootPath);
    const projectFiles: ProjectFile[] = [];

    for (const f of fsFiles) {
      const pf: ProjectFile = {
        id: f.relativePath,
        name: f.relativePath.split(/[/\\]/).pop() || f.relativePath,
        relativePath: f.relativePath,
        absolutePath: f.absolutePath,
        type: f.type,
        isDirty: false,
        fileSize: f.fileSize,
      };

      // Load content for text-based files (skip large non-essential files)
      if (
        f.type === "tex" ||
        f.type === "bib" ||
        f.type === "style" ||
        f.type === "other"
      ) {
        const isLargeNonEssential =
          f.type === "other" && f.fileSize > LARGE_FILE_THRESHOLD;
        if (!isLargeNonEssential) {
          try {
            pf.content = await readTexFileContent(f.absolutePath);
          } catch {
            pf.content = "";
          }
        }
        // Large "other" files: content stays undefined, loaded on-demand via loadFileContent
      }

      // Load dataUrl for image files (skip very large images)
      if (f.type === "image") {
        if (f.fileSize <= LARGE_FILE_THRESHOLD) {
          try {
            pf.dataUrl = await readImageAsDataUrl(f.absolutePath);
          } catch {
            // Image loading failed, that's ok
          }
        }
      }

      // PDF files are loaded on-demand via readFile in InlinePdfContent

      projectFiles.push(pf);
    }

    // Find the main tex file
    const mainTex =
      projectFiles.find(
        (f) => f.name === "main.tex" || f.name === "document.tex",
      ) || projectFiles.find((f) => f.type === "tex");

    clearPdfBytesCache();
    const initialActiveId = mainTex?.id || projectFiles[0]?.id || "";
    set({
      projectRoot: rootPath,
      files: projectFiles,
      folders: fsFolders,
      activeFileId: initialActiveId,
      openFileIds: initialActiveId ? [initialActiveId] : [],
      pdfRevision: 0,
      compileError: null,
      compileErrorCache: new Map(),
      lastCompiledGenerations: new Map(),
      initialized: true,
      cursorPosition: 0,
      selectionRange: null,
    });

    // Seed "last modified" from the files' actual on-disk mtimes, so a
    // project you last touched externally (e.g. last week) reflects that
    // instead of looking untouched.
    const latestSourceMtime = fsFiles.reduce(
      (max, f) => (f.mtime && f.mtime > max ? f.mtime : max),
      0,
    );
    if (latestSourceMtime > 0) {
      useProjectStore
        .getState()
        .markProjectModified(rootPath, latestSourceMtime);
    }

    // Initialize history system early so snapshots work before the panel is opened
    const historyStore = useHistoryStore.getState();
    historyStore
      .init(rootPath)
      .then(() => historyStore.loadSnapshots(rootPath))
      .catch((err) => {
        log.error("Failed to initialize history", { error: String(err) });
      });
  },

  closeProject: () => {
    log.info("Closing project");
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    clearDocCache();
    clearScrollPositionCache();
    clearZoomCache();
    clearEditorStateCache();
    clearPdfBytesCache();
    set({
      projectRoot: null,
      files: [],
      folders: [],
      activeFileId: "",
      openFileIds: [],
      pdfRevision: 0,
      compileError: null,
      compileErrorCache: new Map(),
      lastCompiledGenerations: new Map(),
      initialized: false,
    });
  },

  setActiveFile: (id) => {
    const state = get();
    const rootId = resolveTexRoot(id, state.files);
    const newPdfRootId = _pdfBytesCache.has(rootId) ? rootId : null;
    const pdfRootChanged = newPdfRootId !== _currentPdfRootId;
    _currentPdfRootId = newPdfRootId;
    const cachedError = state.compileErrorCache.get(rootId) ?? null;
    set((s) => ({
      activeFileId: id,
      selectionRange: null,
      ...(pdfRootChanged ? { pdfRevision: s.pdfRevision + 1 } : {}),
      compileError: cachedError,
    }));
  },

  openFileInTab: (id) => {
    set((s) => ({ openFileIds: addToOpenTabs(s.openFileIds, id) }));
    get().setActiveFile(id);
  },

  closeTab: (id) => {
    const state = get();
    if (!state.openFileIds.includes(id)) {
      // Closing the preview tab: return to the last pinned tab, if any
      if (id === state.activeFileId && state.openFileIds.length > 0) {
        get().setActiveFile(state.openFileIds[state.openFileIds.length - 1]);
      }
      return;
    }
    if (state.activeFileId === id) {
      const neighbor = pickNeighborTab(state.openFileIds, id);
      // Keep the last tab open — the editor always shows a file
      if (!neighbor) return;
      set({ openFileIds: state.openFileIds.filter((t) => t !== id) });
      // Reuse setActiveFile for PDF-root and compile-error switching
      get().setActiveFile(neighbor);
    } else {
      // A different file is showing, so even the last pinned tab can go
      set({ openFileIds: state.openFileIds.filter((t) => t !== id) });
    }
  },

  cycleTab: (direction) => {
    const state = get();
    if (!state.activeFileId) return;
    // Include the preview tab (active file not pinned) at the end of the cycle
    const ids = state.openFileIds.includes(state.activeFileId)
      ? state.openFileIds
      : [...state.openFileIds, state.activeFileId];
    if (ids.length < 2) return;
    const idx = ids.indexOf(state.activeFileId);
    const next = ids[(idx + direction + ids.length) % ids.length];
    state.setActiveFile(next);
  },

  setSelectionRange: (range) => set({ selectionRange: range }),

  requestJumpToPosition: (position) => set({ jumpToPosition: position }),

  clearJumpRequest: () => set({ jumpToPosition: null }),

  addFile: (file) => {
    const id = file.relativePath;
    set((state) => ({
      files: [...state.files, { ...file, id, isDirty: false }],
      activeFileId: id,
      openFileIds: addToOpenTabs(state.openFileIds, id),
    }));
    return id;
  },

  deleteFile: async (id) => {
    const state = get();
    if (state.files.length <= 1) return;
    const file = state.files.find((f) => f.id === id);
    if (file) {
      try {
        await deleteFileFromDisk(file.absolutePath);
      } catch (e) {
        log.error("Failed to delete file from disk", { error: String(e) });
      }
    }
    const newFiles = state.files.filter((f) => f.id !== id);
    const newActiveId =
      state.activeFileId === id
        ? (pickNeighborTab(state.openFileIds, id) ?? newFiles[0].id)
        : state.activeFileId;
    // The fallback active (no pinned neighbor) shows as a preview, not a pin
    const newOpenFileIds = state.openFileIds.filter((t) => t !== id);
    const compileErrorCache = new Map(state.compileErrorCache);
    const lastCompiledGenerations = new Map(state.lastCompiledGenerations);
    _pdfBytesCache.delete(id);
    compileErrorCache.delete(id);
    lastCompiledGenerations.delete(id);
    // If the deleted file was active, show the new active file's cached PDF
    const switchingActive = state.activeFileId === id;
    const newRootId = switchingActive
      ? resolveTexRoot(newActiveId, newFiles)
      : undefined;
    if (switchingActive && newRootId) {
      _currentPdfRootId = _pdfBytesCache.has(newRootId) ? newRootId : null;
    }
    set((s) => ({
      files: newFiles,
      activeFileId: newActiveId,
      openFileIds: newOpenFileIds,
      compileErrorCache,
      lastCompiledGenerations,
      ...(switchingActive ? { pdfRevision: s.pdfRevision + 1 } : {}),
      ...(switchingActive && newRootId
        ? {
            compileError: compileErrorCache.get(newRootId) ?? null,
          }
        : {}),
    }));
  },

  deleteFolder: async (folderPath) => {
    const state = get();
    if (!state.projectRoot) return;
    const prefix = `${folderPath}/`;
    const filesToRemove = state.files.filter((f) =>
      f.relativePath.startsWith(prefix),
    );
    const remainingFiles = state.files.filter(
      (f) => !f.relativePath.startsWith(prefix),
    );
    // Must keep at least one file
    if (remainingFiles.length === 0) return;

    // Delete folder from disk (recursive)
    try {
      const absPath = await join(state.projectRoot, folderPath);
      await deleteFolderFromDisk(absPath);
    } catch (e) {
      log.error("Failed to delete folder from disk", { error: String(e) });
    }

    // Clean caches
    const compileErrorCache = new Map(state.compileErrorCache);
    const lastCompiledGenerations = new Map(state.lastCompiledGenerations);
    for (const f of filesToRemove) {
      _pdfBytesCache.delete(f.id);
      compileErrorCache.delete(f.id);
      lastCompiledGenerations.delete(f.id);
    }

    const removedIds = new Set(filesToRemove.map((f) => f.id));
    const survivingTabs = state.openFileIds.filter((t) => !removedIds.has(t));
    const newActiveId = removedIds.has(state.activeFileId)
      ? (survivingTabs[0] ?? remainingFiles[0].id)
      : state.activeFileId;
    const newOpenFileIds = survivingTabs;
    const switchingActive = newActiveId !== state.activeFileId;
    const newRootId = switchingActive
      ? resolveTexRoot(newActiveId, remainingFiles)
      : undefined;
    if (switchingActive && newRootId) {
      _currentPdfRootId = _pdfBytesCache.has(newRootId) ? newRootId : null;
    }

    // Remove folder from folders list
    const newFolders = state.folders.filter(
      (f) => f !== folderPath && !f.startsWith(prefix),
    ); // include exact match since folders list contains folder paths directly

    set((s) => ({
      files: remainingFiles,
      folders: newFolders,
      activeFileId: newActiveId,
      openFileIds: newOpenFileIds,
      compileErrorCache,
      lastCompiledGenerations,
      ...(switchingActive ? { pdfRevision: s.pdfRevision + 1 } : {}),
      ...(switchingActive && newRootId
        ? {
            compileError: compileErrorCache.get(newRootId) ?? null,
          }
        : {}),
    }));
  },

  renameFile: async (id, name) => {
    const state = get();
    const file = state.files.find((f) => f.id === id);
    if (!file || !state.projectRoot) return;

    const dir = file.relativePath.includes("/")
      ? file.relativePath.substring(0, file.relativePath.lastIndexOf("/"))
      : "";
    const newRelativePath = dir ? `${dir}/${name}` : name;

    const newAbsPath = await join(state.projectRoot, newRelativePath);
    try {
      await renameFileOnDisk(file.absolutePath, newAbsPath);
    } catch (e) {
      log.error("Failed to rename file on disk", { error: String(e) });
      return;
    }
    migratePdfBytesKey(id, newRelativePath);
    set((s) => {
      const compileErrorCache = migrateCacheKey(
        s.compileErrorCache,
        id,
        newRelativePath,
      );
      const lastCompiledGenerations = migrateCacheKey(
        s.lastCompiledGenerations,
        id,
        newRelativePath,
      );
      const isActive = s.activeFileId === id;
      return {
        files: s.files.map((f) =>
          f.id === id
            ? {
                ...f,
                name,
                relativePath: newRelativePath,
                absolutePath: newAbsPath,
                id: newRelativePath,
              }
            : f,
        ),
        activeFileId: isActive ? newRelativePath : s.activeFileId,
        openFileIds: s.openFileIds.map((t) => (t === id ? newRelativePath : t)),
        compileErrorCache,
        lastCompiledGenerations,
      };
    });
  },

  updateFileContent: (id, content) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, content, isDirty: true } : f,
      ),
      contentGeneration: state.contentGeneration + 1,
      // Editing a previewed file pins its tab so it doesn't vanish on switch
      ...(id === state.activeFileId
        ? { openFileIds: addToOpenTabs(state.openFileIds, id) }
        : {}),
    }));
    scheduleAutoSave();
  },

  updateImageDataUrl: (id, dataUrl) => {
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, dataUrl } : f)),
    }));
  },

  setThreadOpen: (open) => set({ isThreadOpen: open }),

  setPdfData: (data, rootFileId?) => {
    if (data) {
      const key = rootFileId ?? "__default__";
      _pdfBytesCache.set(key, data);
      _currentPdfRootId = key;
    } else if (rootFileId) {
      _pdfBytesCache.delete(rootFileId);
      if (_currentPdfRootId === rootFileId) _currentPdfRootId = null;
    } else {
      _currentPdfRootId = null;
    }
    if (rootFileId) {
      if (data) {
        const s = get();
        const compileErrorCache = new Map(s.compileErrorCache);
        const lastCompiledGenerations = new Map(s.lastCompiledGenerations);
        compileErrorCache.delete(rootFileId);
        lastCompiledGenerations.set(rootFileId, s.contentGeneration);
        set((prev) => ({
          pdfRevision: prev.pdfRevision + 1,
          compileError: null,
          compileErrorCache,
          lastCompiledGenerations,
        }));
      } else {
        set((prev) => ({
          pdfRevision: prev.pdfRevision + 1,
          compileError: null,
        }));
      }
    } else {
      set((prev) => ({
        pdfRevision: prev.pdfRevision + 1,
        compileError: null,
      }));
    }
  },

  setCompileError: (error, rootFileId?) => {
    if (rootFileId) {
      const compileErrorCache = new Map(get().compileErrorCache);
      if (error) {
        compileErrorCache.set(rootFileId, error);
      } else {
        compileErrorCache.delete(rootFileId);
      }
      set({ compileError: error, compileErrorCache });
    } else {
      set({ compileError: error });
    }
  },

  setIsCompiling: (isCompiling) => set({ isCompiling }),
  setPendingRecompile: (pending) => set({ pendingRecompile: pending }),

  setIsSaving: (isSaving) => set({ isSaving }),

  setCursorPosition: (position) => set({ cursorPosition: position }),

  insertAtCursor: (text) => {
    const state = get();
    const activeFile = getActiveFile(state);
    if (!activeFile || activeFile.type === "image" || activeFile.type === "pdf")
      return;

    const content = activeFile.content ?? "";
    const { cursorPosition } = state;
    const newContent =
      content.slice(0, cursorPosition) + text + content.slice(cursorPosition);

    set({
      files: state.files.map((f) =>
        f.id === activeFile.id
          ? { ...f, content: newContent, isDirty: true }
          : f,
      ),
      cursorPosition: cursorPosition + text.length,
      openFileIds: addToOpenTabs(state.openFileIds, activeFile.id),
    });
  },

  replaceSelection: (start, end, text) => {
    const state = get();
    const activeFile = getActiveFile(state);
    if (!activeFile || activeFile.type === "image" || activeFile.type === "pdf")
      return;

    const content = activeFile.content ?? "";
    const newContent = content.slice(0, start) + text + content.slice(end);

    set({
      files: state.files.map((f) =>
        f.id === activeFile.id
          ? { ...f, content: newContent, isDirty: true }
          : f,
      ),
      cursorPosition: start + text.length,
      openFileIds: addToOpenTabs(state.openFileIds, activeFile.id),
    });
  },

  findAndReplace: (find, replace) => {
    const state = get();
    const activeFile = getActiveFile(state);
    if (!activeFile || activeFile.type === "image" || activeFile.type === "pdf")
      return false;

    const content = activeFile.content ?? "";
    if (!content.includes(find)) return false;

    const newContent = content.replace(find, replace);
    set({
      files: state.files.map((f) =>
        f.id === activeFile.id
          ? { ...f, content: newContent, isDirty: true }
          : f,
      ),
      openFileIds: addToOpenTabs(state.openFileIds, activeFile.id),
    });
    return true;
  },

  setInitialized: () => set({ initialized: true }),

  saveFile: async (id) => {
    const state = get();
    const file = state.files.find((f) => f.id === id);
    if (!file || !file.isDirty || file.content == null) return;

    await writeTexFileContent(file.absolutePath, file.content);
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, isDirty: false } : f)),
    }));
    if (state.projectRoot) {
      useProjectStore.getState().markProjectModified(state.projectRoot);
    }
  },

  saveAllFiles: async () => {
    const state = get();
    const dirtyFiles = state.files.filter(
      (f) => f.isDirty && f.content != null,
    );
    const results = await Promise.allSettled(
      dirtyFiles.map((f) => writeTexFileContent(f.absolutePath, f.content!)),
    );
    // Only mark successfully saved files as clean
    const savedIds = new Set<string>();
    results.forEach((r, i) => {
      if (r.status === "fulfilled") savedIds.add(dirtyFiles[i].id);
    });
    if (savedIds.size > 0) {
      set((s) => ({
        files: s.files.map((f) =>
          savedIds.has(f.id) ? { ...f, isDirty: false } : f,
        ),
      }));
      if (state.projectRoot) {
        useProjectStore.getState().markProjectModified(state.projectRoot);
      }
    }
  },

  saveCurrentFile: async () => {
    const state = get();
    await state.saveFile(state.activeFileId);
    // Manual save → immediate snapshot
    if (state.projectRoot) {
      try {
        await useHistoryStore
          .getState()
          .createSnapshot(state.projectRoot, "[manual] Save");
      } catch {
        // Snapshot failure should not break save
      }
    }
  },

  createNewFile: async (name, type, folder) => {
    const state = get();
    if (!state.projectRoot) return;

    const relativePath = folder ? `${folder}/${name}` : name;
    const isTexFile = name.endsWith(".tex") || name.endsWith(".ltx");
    const content = isTexFile
      ? `\\documentclass{article}\n\n\\begin{document}\n\n% Your content here\n\n\\end{document}\n`
      : "";

    const fullPath = await createFileOnDisk(
      state.projectRoot,
      relativePath,
      content,
    );

    set((s) => ({
      files: [
        ...s.files,
        {
          id: relativePath,
          name,
          relativePath,
          absolutePath: fullPath,
          type,
          content: type !== "image" ? content : undefined,
          isDirty: false,
        },
      ],
      activeFileId: relativePath,
      openFileIds: addToOpenTabs(s.openFileIds, relativePath),
    }));
  },

  createFolder: async (name, parentFolder) => {
    const state = get();
    if (!state.projectRoot) return;

    const relativePath = parentFolder ? `${parentFolder}/${name}` : name;
    const absolutePath = await join(state.projectRoot, relativePath);
    await createDirectory(absolutePath);
    set((s) => ({
      folders: [...s.folders, relativePath],
    }));
  },

  importFiles: async (sourcePaths, targetFolder) => {
    const state = get();
    if (!state.projectRoot) return [];

    const importedPaths: string[] = [];
    for (const sourcePath of sourcePaths) {
      // Handle both Unix (/) and Windows (\) path separators
      const fileName = sourcePath.split(/[/\\]/).pop() || sourcePath;
      const targetName = targetFolder
        ? `${targetFolder}/${fileName}`
        : fileName;
      // copyFileToProject returns the actual (possibly deduplicated) relative path
      const actualName = await copyFileToProject(
        state.projectRoot,
        sourcePath,
        targetName,
      );
      importedPaths.push(actualName);
    }
    await state.refreshFiles();
    return importedPaths;
  },

  moveFile: async (fileId, targetFolder) => {
    const state = get();
    const file = state.files.find((f) => f.id === fileId);
    if (!file || !state.projectRoot) return;

    const desiredPath = targetFolder
      ? `${targetFolder}/${file.name}`
      : file.name;
    if (desiredPath === file.relativePath) return;

    // Auto-deduplicate if a file with the same name exists in the target
    const newRelativePath = await getUniqueTargetName(
      state.projectRoot,
      desiredPath,
    );
    const newAbsPath = await join(state.projectRoot, newRelativePath);
    await renameFileOnDisk(file.absolutePath, newAbsPath);

    const newName = newRelativePath.split(/[/\\]/).pop() || file.name;
    migratePdfBytesKey(fileId, newRelativePath);
    set((s) => {
      const compileErrorCache = migrateCacheKey(
        s.compileErrorCache,
        fileId,
        newRelativePath,
      );
      const lastCompiledGenerations = migrateCacheKey(
        s.lastCompiledGenerations,
        fileId,
        newRelativePath,
      );
      return {
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                name: newName,
                relativePath: newRelativePath,
                absolutePath: newAbsPath,
                id: newRelativePath,
              }
            : f,
        ),
        activeFileId:
          s.activeFileId === fileId ? newRelativePath : s.activeFileId,
        openFileIds: s.openFileIds.map((t) =>
          t === fileId ? newRelativePath : t,
        ),
        compileErrorCache,
        lastCompiledGenerations,
      };
    });
  },

  moveFolder: async (folderPath, targetFolder) => {
    const state = get();
    if (!state.projectRoot) return;

    const folderName = folderPath.split(/[/\\]/).pop()!;
    const newFolderPath = targetFolder
      ? `${targetFolder}/${folderName}`
      : folderName;
    if (newFolderPath === folderPath) return;
    // Prevent moving a folder into itself
    if (newFolderPath.startsWith(`${folderPath}/`)) return;

    const oldAbsPath = await join(state.projectRoot, folderPath);
    const newAbsPath = await join(state.projectRoot, newFolderPath);
    await renameFileOnDisk(oldAbsPath, newAbsPath);

    // Reload project to pick up all new paths
    await state.openProject(state.projectRoot);
  },

  reloadFile: async (relativePath) => {
    const state = get();
    const file = state.files.find((f) => f.relativePath === relativePath);
    if (!file) return;

    if (file.type === "tex" || file.type === "bib") {
      const content = await readTexFileContent(file.absolutePath);
      set((s) => ({
        files: s.files.map((f) =>
          f.id === file.id ? { ...f, content, isDirty: false } : f,
        ),
        contentGeneration: s.contentGeneration + 1,
      }));
    }
  },

  refreshFiles: async () => {
    const { projectRoot, files, activeFileId, openFileIds } = get();
    if (!projectRoot) return;

    const { files: fsFiles, folders: fsFolders } =
      await scanProjectFolder(projectRoot);
    const existingMap = new Map(files.map((f) => [f.relativePath, f]));
    const diskPaths = new Set(fsFiles.map((f) => f.relativePath));

    const merged: ProjectFile[] = [];

    for (const fsFile of fsFiles) {
      const existing = existingMap.get(fsFile.relativePath);

      if (existing) {
        // Existing file — reload content from disk unless the user has unsaved edits
        if (existing.isDirty) {
          merged.push(existing);
        } else {
          const updated = { ...existing, fileSize: fsFile.fileSize };
          if (
            updated.type === "tex" ||
            updated.type === "bib" ||
            updated.type === "style" ||
            updated.type === "other"
          ) {
            const isLargeNonEssential =
              updated.type === "other" &&
              fsFile.fileSize > LARGE_FILE_THRESHOLD;
            // Only reload if it was previously loaded (not a skipped large file)
            if (!isLargeNonEssential || updated.content !== undefined) {
              try {
                updated.content = await readTexFileContent(
                  updated.absolutePath,
                );
              } catch {
                /* keep previous content */
              }
            }
          }
          merged.push(updated);
        }
      } else {
        // New file on disk
        const pf: ProjectFile = {
          id: fsFile.relativePath,
          name: fsFile.relativePath.split(/[/\\]/).pop() || fsFile.relativePath,
          relativePath: fsFile.relativePath,
          absolutePath: fsFile.absolutePath,
          type: fsFile.type,
          isDirty: false,
          fileSize: fsFile.fileSize,
        };
        const isLargeNonEssential =
          pf.type === "other" && fsFile.fileSize > LARGE_FILE_THRESHOLD;
        if (
          pf.type === "tex" ||
          pf.type === "bib" ||
          pf.type === "style" ||
          (pf.type === "other" && !isLargeNonEssential)
        ) {
          try {
            pf.content = await readTexFileContent(pf.absolutePath);
          } catch {
            /* skip unreadable */
          }
        } else if (
          pf.type === "image" &&
          fsFile.fileSize <= LARGE_FILE_THRESHOLD
        ) {
          try {
            pf.dataUrl = await readImageAsDataUrl(pf.absolutePath);
          } catch {
            /* skip unreadable */
          }
        }
        // PDF files and large files are loaded on-demand
        merged.push(pf);
      }
    }

    // Keep dirty files that were deleted from disk (user hasn't saved yet)
    for (const f of files) {
      if (!diskPaths.has(f.relativePath) && f.isDirty) {
        merged.push(f);
      }
    }

    const mergedIds = new Set(merged.map((f) => f.id));
    const survivingTabs = openFileIds.filter((t) => mergedIds.has(t));
    const newActiveId = mergedIds.has(activeFileId)
      ? activeFileId
      : (survivingTabs[0] ?? merged[0]?.id ?? "");
    const newOpenFileIds = survivingTabs;

    set((s) => ({
      files: merged,
      folders: fsFolders,
      activeFileId: newActiveId,
      openFileIds: newOpenFileIds,
      contentGeneration: s.contentGeneration + 1,
    }));
  },

  loadFileContent: async (id) => {
    const state = get();
    const file = state.files.find((f) => f.id === id);
    if (!file || file.content !== undefined) return; // already loaded
    try {
      const content = await readTexFileContent(file.absolutePath);
      set((s) => ({
        files: s.files.map((f) => (f.id === id ? { ...f, content } : f)),
      }));
    } catch {
      set((s) => ({
        files: s.files.map((f) => (f.id === id ? { ...f, content: "" } : f)),
      }));
    }
  },

  get fileName() {
    const activeFile = getActiveFile(get());
    return activeFile?.name ?? "main.tex";
  },

  get content() {
    const activeFile = getActiveFile(get());
    return activeFile?.content ?? "";
  },

  setFileName: (name) => {
    const state = get();
    set({
      files: state.files.map((f) =>
        f.id === state.activeFileId ? { ...f, name } : f,
      ),
    });
  },

  setContent: (content) => {
    const state = get();
    set({
      files: state.files.map((f) =>
        f.id === state.activeFileId ? { ...f, content, isDirty: true } : f,
      ),
      contentGeneration: state.contentGeneration + 1,
      openFileIds: addToOpenTabs(state.openFileIds, state.activeFileId),
    });
    scheduleAutoSave();
  },
}));

storeRef = useDocumentStore;
