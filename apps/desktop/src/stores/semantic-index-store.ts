import { create } from "zustand";
import { scanWithSemanticProviders } from "@/lib/semantic/providers";
import type {
  FileSemanticSnapshot,
  SemanticObject,
  SemanticObjectKind,
} from "@/lib/semantic/types";
import type { ProjectFile } from "./document-store";

interface SemanticIndexState {
  snapshots: Record<string, FileSemanticSnapshot>;
  requestedGenerations: Record<string, number>;
  reindexFile: (
    file: ProjectFile,
    generation: number,
    immediate?: boolean,
  ) => void;
  reindexProject: (files: ProjectFile[], generation: number) => void;
  objects: (kind?: SemanticObjectKind) => SemanticObject[];
  clear: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let semanticWorker: Worker | null | undefined;

function getSemanticWorker(): Worker | null {
  if (semanticWorker !== undefined) return semanticWorker;
  if (typeof Worker === "undefined") {
    semanticWorker = null;
    return null;
  }
  semanticWorker = new Worker(
    new URL("../lib/semantic/semantic.worker.ts", import.meta.url),
    { type: "module" },
  );
  return semanticWorker;
}

export const useSemanticIndexStore = create<SemanticIndexState>()(
  (set, get) => ({
    snapshots: {},
    requestedGenerations: {},

    reindexFile: (file, generation, immediate = false) => {
      if (file.type === "image" || file.type === "pdf") {
        set((state) => ({
          snapshots: {
            ...state.snapshots,
            [file.id]: {
              fileId: file.id,
              generation,
              indexedAt: Date.now(),
              diagnostics: [],
              objects: [
                {
                  id: `${file.id}:asset`,
                  kind: "asset",
                  fileId: file.id,
                  from: 0,
                  to: 0,
                  label: file.relativePath,
                  detail: file.type,
                  data: { path: file.relativePath, type: file.type },
                },
              ],
            },
          },
        }));
        return;
      }
      if (
        file.content === undefined ||
        !/\.(?:tex|ltx|bib)$/i.test(file.name)
      ) {
        return;
      }
      const previous = timers.get(file.id);
      if (previous) clearTimeout(previous);
      set((state) => ({
        requestedGenerations: {
          ...state.requestedGenerations,
          [file.id]: generation,
        },
      }));
      const run = () => {
        timers.delete(file.id);
        const requested = get().requestedGenerations[file.id];
        if (requested !== generation) return;
        const context = {
          fileId: file.id,
          fileName: file.name,
          content: file.content ?? "",
          generation,
        };
        const accept = (
          result: ReturnType<typeof scanWithSemanticProviders>,
        ) => {
          if (get().requestedGenerations[file.id] !== generation) return;
          set((state) => ({
            snapshots: {
              ...state.snapshots,
              [file.id]: {
                fileId: file.id,
                generation,
                ...result,
                indexedAt: Date.now(),
              },
            },
          }));
        };
        const worker = immediate ? null : getSemanticWorker();
        if (!worker) {
          accept(scanWithSemanticProviders(context));
          return;
        }
        const handleMessage = (
          event: MessageEvent<{
            context: typeof context;
            result: ReturnType<typeof scanWithSemanticProviders>;
          }>,
        ) => {
          if (
            event.data.context.fileId !== file.id ||
            event.data.context.generation !== generation
          )
            return;
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
          accept(event.data.result);
        };
        const handleError = () => {
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
          worker.terminate();
          semanticWorker = null;
          accept(scanWithSemanticProviders(context));
        };
        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);
        worker.postMessage(context);
      };
      if (immediate) run();
      else timers.set(file.id, setTimeout(run, 75));
    },

    reindexProject: (files, generation) => {
      const liveIds = new Set(files.map((file) => file.id));
      set((state) => ({
        snapshots: Object.fromEntries(
          Object.entries(state.snapshots).filter(([fileId]) =>
            liveIds.has(fileId),
          ),
        ),
      }));
      for (const file of files) get().reindexFile(file, generation);
    },

    objects: (kind) =>
      Object.values(get().snapshots)
        .flatMap((snapshot) => snapshot.objects)
        .filter((object) => !kind || object.kind === kind),

    clear: () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      semanticWorker?.terminate();
      semanticWorker = undefined;
      set({ snapshots: {}, requestedGenerations: {} });
    },
  }),
);
