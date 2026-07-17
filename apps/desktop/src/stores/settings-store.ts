import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EditorHighlightTheme, WorkspacePalette } from "@/lib/appearance";

type CompilerBackend = "tectonic" | "texlive";
type AiProvider = "none" | "anthropic" | "openai";

interface SettingsState {
  compilerBackend: CompilerBackend;
  setCompilerBackend: (backend: CompilerBackend) => void;
  vimMode: boolean;
  setVimMode: (enabled: boolean) => void;
  lensExperimental: boolean;
  setLensExperimental: (enabled: boolean) => void;
  workspacePalette: WorkspacePalette;
  setWorkspacePalette: (palette: WorkspacePalette) => void;
  editorHighlightTheme: EditorHighlightTheme;
  setEditorHighlightTheme: (theme: EditorHighlightTheme) => void;
  aiProvider: AiProvider;
  setAiProvider: (provider: AiProvider) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      compilerBackend: "tectonic",
      setCompilerBackend: (backend) => set({ compilerBackend: backend }),
      vimMode: false,
      setVimMode: (enabled) => set({ vimMode: enabled }),
      lensExperimental: false,
      setLensExperimental: (enabled) => set({ lensExperimental: enabled }),
      workspacePalette: "paper",
      setWorkspacePalette: (workspacePalette) => set({ workspacePalette }),
      editorHighlightTheme: "match",
      setEditorHighlightTheme: (editorHighlightTheme) =>
        set({ editorHighlightTheme }),
      aiProvider: "none",
      setAiProvider: (provider) => set({ aiProvider: provider }),
    }),
    {
      name: "tectonic-editor-settings",
      version: 2,
      // Coerce the removed "claude-cli" provider (and any unknown value) to "none"
      // for users upgrading from a build that still had the Claude CLI provider.
      migrate: (state) => {
        const s = state as Partial<SettingsState> | undefined;
        if (s && s.aiProvider !== "anthropic" && s.aiProvider !== "openai") {
          s.aiProvider = "none";
        }
        if (s && !s.workspacePalette) s.workspacePalette = "paper";
        if (s && !s.editorHighlightTheme) s.editorHighlightTheme = "match";
        return s as SettingsState;
      },
    },
  ),
);
