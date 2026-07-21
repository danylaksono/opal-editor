import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
  lastModified?: number;
}

interface ProjectState {
  recentProjects: RecentProject[];
  lastProjectFolder: string | null;
  addRecentProject: (path: string) => void;
  removeRecentProject: (path: string) => void;
  setLastProjectFolder: (path: string) => void;
  /** Records that a file inside this project was modified (saved by the app,
   *  or found via an on-disk mtime scan). Pass a specific timestamp for the
   *  latter; omit it to stamp "now". Never moves the value backwards. */
  markProjectModified: (path: string, timestamp?: number) => void;
}

const MAX_RECENT = 10;

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      recentProjects: [],
      lastProjectFolder: null,

      setLastProjectFolder: (path) => set({ lastProjectFolder: path }),

      addRecentProject: (path) => {
        const name = path.split(/[/\\]/).pop() || path;
        set((state) => {
          const existing = state.recentProjects.find((p) => p.path === path);
          const filtered = state.recentProjects.filter((p) => p.path !== path);
          return {
            recentProjects: [
              {
                path,
                name,
                lastOpened: Date.now(),
                lastModified: existing?.lastModified,
              },
              ...filtered,
            ].slice(0, MAX_RECENT),
          };
        });
      },

      removeRecentProject: (path) => {
        set((state) => ({
          recentProjects: state.recentProjects.filter((p) => p.path !== path),
        }));
      },

      markProjectModified: (path, timestamp) => {
        const ts = timestamp ?? Date.now();
        set((state) => {
          const existing = state.recentProjects.find((p) => p.path === path);
          if (existing) {
            return {
              recentProjects: state.recentProjects.map((p) =>
                p.path === path
                  ? { ...p, lastModified: Math.max(p.lastModified ?? 0, ts) }
                  : p,
              ),
            };
          }
          // openProject can finish scanning before the caller records the
          // project as "recent" (addRecentProject runs after load succeeds).
          // Seed a placeholder here so the mtime isn't lost; addRecentProject
          // will fill in lastOpened/reordering once the caller runs it.
          const name = path.split(/[/\\]/).pop() || path;
          return {
            recentProjects: [
              ...state.recentProjects,
              { path, name, lastOpened: 0, lastModified: ts },
            ],
          };
        });
      },
    }),
    {
      name: "tectonic-editor-projects",
    },
  ),
);
