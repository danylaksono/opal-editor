import { create } from "zustand";
import { persist } from "zustand/middleware";

type CompilerBackend = "tectonic" | "texlive";
type AiProvider = "none" | "claude-cli" | "anthropic" | "openai";

interface SettingsState {
  compilerBackend: CompilerBackend;
  setCompilerBackend: (backend: CompilerBackend) => void;
  vimMode: boolean;
  setVimMode: (enabled: boolean) => void;
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
      aiProvider: "none",
      setAiProvider: (provider) => set({ aiProvider: provider }),
    }),
    {
      name: "tectonic-editor-settings",
    },
  ),
);
