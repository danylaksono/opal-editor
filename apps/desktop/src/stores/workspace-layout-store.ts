import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceSidePanel =
  | "learn"
  | "files"
  | "search"
  | "outline"
  | "citations"
  | "health";

interface WorkspaceLayoutState {
  sidePanelOpen: boolean;
  activeSidePanel: WorkspaceSidePanel;
  problemsDrawerOpen: boolean;
  focusMode: boolean;
  reviewMode: boolean;
  setSidePanelOpen: (open: boolean) => void;
  setActiveSidePanel: (panel: WorkspaceSidePanel) => void;
  toggleSidePanel: (panel: WorkspaceSidePanel) => void;
  setProblemsDrawerOpen: (open: boolean) => void;
  toggleProblemsDrawer: () => void;
  setFocusMode: (open: boolean) => void;
  toggleFocusMode: () => void;
  setReviewMode: (open: boolean) => void;
  toggleReviewMode: () => void;
}

export const useWorkspaceLayoutStore = create<WorkspaceLayoutState>()(
  persist(
    (set) => ({
      sidePanelOpen: true,
      activeSidePanel: "files",
      problemsDrawerOpen: false,
      focusMode: false,
      reviewMode: false,
      setSidePanelOpen: (open) => set({ sidePanelOpen: open }),
      setActiveSidePanel: (panel) =>
        set({ activeSidePanel: panel, sidePanelOpen: true }),
      toggleSidePanel: (panel) =>
        set((state) => {
          if (state.sidePanelOpen && state.activeSidePanel === panel) {
            return { sidePanelOpen: false };
          }
          return { activeSidePanel: panel, sidePanelOpen: true };
        }),
      setProblemsDrawerOpen: (open) => set({ problemsDrawerOpen: open }),
      toggleProblemsDrawer: () =>
        set((state) => ({ problemsDrawerOpen: !state.problemsDrawerOpen })),
      setFocusMode: (open) => set({ focusMode: open }),
      toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
      setReviewMode: (open) =>
        set({
          reviewMode: open,
          ...(open ? { problemsDrawerOpen: false } : {}),
        }),
      toggleReviewMode: () =>
        set((state) => ({
          reviewMode: !state.reviewMode,
          ...(!state.reviewMode ? { problemsDrawerOpen: false } : {}),
        })),
    }),
    {
      name: "tectonic-editor-workspace-layout",
    },
  ),
);
