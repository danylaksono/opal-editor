import { create } from "zustand";
import { checkLatex, type GrammarIssue } from "@/lib/language-tool";
import { useDocumentStore } from "./document-store";
import { useSettingsStore } from "./settings-store";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("grammar");

/** Abort handle for the in-flight check (module-level: not UI state). */
let activeCheck: AbortController | null = null;

interface GrammarState {
  issues: GrammarIssue[];
  isChecking: boolean;
  error: string | null;
  /** File the current issues belong to */
  checkedFileId: string | null;
  checkedAt: number | null;
  /** Check the active .tex file with the configured LanguageTool server. */
  check: () => Promise<void>;
  dismiss: (id: string) => void;
  /** Replace the issue's source range with a suggestion. Returns false when
   *  the document changed since the check and offsets are stale. */
  applyReplacement: (id: string, value: string) => boolean;
  clear: () => void;
}

export const useGrammarStore = create<GrammarState>()((set, get) => ({
  issues: [],
  isChecking: false,
  error: null,
  checkedFileId: null,
  checkedAt: null,

  check: async () => {
    const docState = useDocumentStore.getState();
    const file = docState.files.find((f) => f.id === docState.activeFileId);
    if (!file || file.type !== "tex" || !file.content) {
      set({ error: "Open a .tex file to check its grammar", issues: [] });
      return;
    }

    activeCheck?.abort();
    const controller = new AbortController();
    activeCheck = controller;

    const settings = useSettingsStore.getState();
    set({ isChecking: true, error: null });
    try {
      const issues = await checkLatex({
        source: file.content,
        serverUrl: settings.languageToolUrl,
        language: settings.languageToolLanguage,
        picky: settings.languageToolPicky,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      log.info(`check found ${issues.length} issues in ${file.relativePath}`);
      set({
        issues,
        isChecking: false,
        checkedFileId: file.id,
        checkedAt: Date.now(),
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      log.error("check failed", { error: message });
      set({
        isChecking: false,
        error: /Could not reach/i.test(message)
          ? `${message} — check the server URL in Settings, or your connection.`
          : message,
      });
    } finally {
      if (activeCheck === controller) activeCheck = null;
    }
  },

  dismiss: (id) =>
    set((state) => ({ issues: state.issues.filter((i) => i.id !== id) })),

  applyReplacement: (id, value) => {
    const { issues, checkedFileId } = get();
    const issue = issues.find((i) => i.id === id);
    if (!issue || !checkedFileId) return false;

    const docState = useDocumentStore.getState();
    const file = docState.files.find((f) => f.id === checkedFileId);
    if (!file?.content) return false;

    // Offsets are only valid against the text that was checked
    if (file.content.slice(issue.start, issue.end) !== issue.excerpt) {
      set({
        error: "The document changed since the last check — run it again.",
      });
      return false;
    }

    const content =
      file.content.slice(0, issue.start) +
      value +
      file.content.slice(issue.end);
    docState.updateFileContent(file.id, content);

    // Shift the remaining issues that sit after the edit
    const delta = value.length - (issue.end - issue.start);
    set((state) => ({
      error: null,
      issues: state.issues
        .filter((i) => i.id !== id)
        .map((i) =>
          i.start >= issue.end
            ? { ...i, start: i.start + delta, end: i.end + delta }
            : i,
        ),
    }));
    return true;
  },

  clear: () =>
    set({
      issues: [],
      error: null,
      checkedFileId: null,
      checkedAt: null,
    }),
}));
