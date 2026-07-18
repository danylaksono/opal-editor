import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useDocumentStore } from "@/stores/document-store";

export interface ExternalBibliographyResponse {
  content: string;
  modifiedMs: number;
  size: number;
}

export interface ExternalBibliographySource {
  id: string;
  kind: "jabref";
  name: string;
  sourcePath: string;
  targetRelativePath: string;
  lastSourceHash: string;
  lastTargetHash: string;
  lastSyncedAt: number;
  sourceModifiedMs: number;
}

export type ExternalRefreshDecision = "unchanged" | "update" | "conflict";
export type ExternalRefreshResult = ExternalRefreshDecision | "missing-target";

interface ReferenceSourcesState {
  sourcesByProject: Record<string, ExternalBibliographySource[]>;
  syncingSourceId: string | null;
  error: string | null;
  linkJabRef: (
    sourcePath: string,
  ) => Promise<ExternalBibliographySource | null>;
  refreshSource: (
    sourceId: string,
    force?: boolean,
  ) => Promise<ExternalRefreshResult>;
  unlinkSource: (sourceId: string) => void;
}

export function hashBibliographyContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getExternalRefreshDecision(
  source: Pick<ExternalBibliographySource, "lastSourceHash" | "lastTargetHash">,
  targetContent: string,
  nextSourceContent: string,
): ExternalRefreshDecision {
  const nextSourceHash = hashBibliographyContent(nextSourceContent);
  if (nextSourceHash === source.lastSourceHash) return "unchanged";
  const targetHash = hashBibliographyContent(targetContent);
  if (targetHash === nextSourceHash) return "update";
  if (targetHash !== source.lastTargetHash) return "conflict";
  return "update";
}

function normalizePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return /^[a-zA-Z]:\//.test(normalized)
    ? normalized.toLowerCase()
    : normalized;
}

function sourceId(projectRoot: string, sourcePath: string) {
  return `jabref:${hashBibliographyContent(
    `${normalizePath(projectRoot)}\0${normalizePath(sourcePath)}`,
  )}`;
}

function sourceName(path: string) {
  return (
    path
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.bib$/i, "") || "JabRef"
  );
}

async function readExternalBibliography(sourcePath: string) {
  return invoke<ExternalBibliographyResponse>("read_external_bibliography", {
    path: sourcePath,
  });
}

export const useReferenceSourcesStore = create<ReferenceSourcesState>()(
  persist(
    (set, get) => ({
      sourcesByProject: {},
      syncingSourceId: null,
      error: null,

      linkJabRef: async (sourcePath) => {
        const documentStore = useDocumentStore.getState();
        const projectRoot = documentStore.projectRoot;
        if (!projectRoot) return null;

        const id = sourceId(projectRoot, sourcePath);
        const existing = get().sourcesByProject[projectRoot]?.find(
          (source) => source.id === id,
        );
        if (existing) return existing;

        set({ syncingSourceId: id, error: null });
        try {
          const external = await readExternalBibliography(sourcePath);
          const normalizedSource = normalizePath(sourcePath);
          const existingProjectFile = documentStore.files.find(
            (file) => normalizePath(file.absolutePath) === normalizedSource,
          );
          const targetRelativePath = existingProjectFile
            ? existingProjectFile.relativePath
            : (await documentStore.importFiles([sourcePath]))[0];
          if (!targetRelativePath) {
            throw new Error("The bibliography could not be copied");
          }

          const contentHash = hashBibliographyContent(external.content);
          const source: ExternalBibliographySource = {
            id,
            kind: "jabref",
            name: sourceName(sourcePath),
            sourcePath,
            targetRelativePath,
            lastSourceHash: contentHash,
            lastTargetHash: contentHash,
            lastSyncedAt: Date.now(),
            sourceModifiedMs: external.modifiedMs,
          };
          set((state) => ({
            sourcesByProject: {
              ...state.sourcesByProject,
              [projectRoot]: [
                ...(state.sourcesByProject[projectRoot] ?? []),
                source,
              ],
            },
            syncingSourceId: null,
          }));
          return source;
        } catch (error) {
          set({
            syncingSourceId: null,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },

      refreshSource: async (sourceIdValue, force = false) => {
        const documentStore = useDocumentStore.getState();
        const projectRoot = documentStore.projectRoot;
        if (!projectRoot) return "missing-target";
        const source = get().sourcesByProject[projectRoot]?.find(
          (candidate) => candidate.id === sourceIdValue,
        );
        if (!source) return "missing-target";
        const target = documentStore.files.find(
          (file) => file.relativePath === source.targetRelativePath,
        );
        if (!target || target.content === undefined) return "missing-target";

        set({ syncingSourceId: source.id, error: null });
        try {
          const external = await readExternalBibliography(source.sourcePath);
          const decision = getExternalRefreshDecision(
            source,
            target.content,
            external.content,
          );
          if (decision === "unchanged") {
            set({ syncingSourceId: null });
            return decision;
          }
          if (decision === "conflict" && !force) {
            set({ syncingSourceId: null });
            return decision;
          }

          documentStore.updateFileContent(target.id, external.content);
          await useDocumentStore.getState().saveFile(target.id);
          const contentHash = hashBibliographyContent(external.content);
          set((state) => ({
            sourcesByProject: {
              ...state.sourcesByProject,
              [projectRoot]: (state.sourcesByProject[projectRoot] ?? []).map(
                (candidate) =>
                  candidate.id === source.id
                    ? {
                        ...candidate,
                        lastSourceHash: contentHash,
                        lastTargetHash: contentHash,
                        lastSyncedAt: Date.now(),
                        sourceModifiedMs: external.modifiedMs,
                      }
                    : candidate,
              ),
            },
            syncingSourceId: null,
          }));
          return "update";
        } catch (error) {
          set({
            syncingSourceId: null,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },

      unlinkSource: (sourceIdValue) => {
        const projectRoot = useDocumentStore.getState().projectRoot;
        if (!projectRoot) return;
        set((state) => ({
          sourcesByProject: {
            ...state.sourcesByProject,
            [projectRoot]: (state.sourcesByProject[projectRoot] ?? []).filter(
              (source) => source.id !== sourceIdValue,
            ),
          },
          error: null,
        }));
      },
    }),
    {
      name: "tectonic-editor-reference-sources",
      partialize: (state) => ({
        sourcesByProject: state.sourcesByProject,
      }),
    },
  ),
);
