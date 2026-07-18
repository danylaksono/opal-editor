import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EditorHighlightTheme, WorkspacePalette } from "@/lib/appearance";

type CompilerBackend = "tectonic" | "texlive";
type AiProvider = "none" | "anthropic" | "openai";

export const DEFAULT_EDITOR_FONT_SIZE = 14;
export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 28;

export function clampEditorFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_EDITOR_FONT_SIZE;
  return Math.min(
    MAX_EDITOR_FONT_SIZE,
    Math.max(MIN_EDITOR_FONT_SIZE, Math.round(size)),
  );
}

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
  /** When false, clicking tables/citations/figures/etc. never auto-opens the
   *  structured editors — the click just places the cursor for source editing.
   *  Alt+Enter still opens the editor for the element at the cursor. */
  inlineEditorsOnClick: boolean;
  setInlineEditorsOnClick: (enabled: boolean) => void;
  /** Editor text size in px, clamped to [MIN_EDITOR_FONT_SIZE, MAX_EDITOR_FONT_SIZE]. */
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
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
      inlineEditorsOnClick: true,
      setInlineEditorsOnClick: (enabled) =>
        set({ inlineEditorsOnClick: enabled }),
      editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
      setEditorFontSize: (size) =>
        set({ editorFontSize: clampEditorFontSize(size) }),
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
        if (s && typeof s.inlineEditorsOnClick !== "boolean") {
          s.inlineEditorsOnClick = true;
        }
        return s as SettingsState;
      },
    },
  ),
);
