import { create } from "zustand";
import { persist } from "zustand/middleware";

export type EditorMode = "source" | "lens";
interface LensState {
  workspaceModes: Record<string, EditorMode>;
  setWorkspaceMode: (workspace: string, mode: EditorMode) => void;
}

export function defaultWorkspaceMode(workspace: string | null): EditorMode {
  return workspace && /(?:^|[/\\])Learn-LaTeX$/i.test(workspace)
    ? "lens"
    : "source";
}

export const useLensStore = create<LensState>()(
  persist(
    (set) => ({
      workspaceModes: {},
      setWorkspaceMode: (workspace, mode) =>
        set((state) => ({
          workspaceModes: { ...state.workspaceModes, [workspace]: mode },
        })),
    }),
    { name: "tectonic-editor-lens-modes", version: 1 },
  ),
);
