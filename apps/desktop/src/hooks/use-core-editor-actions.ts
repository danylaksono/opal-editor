import { useEffect } from "react";
import {
  dispatchEditorAction,
  registerEditorAction,
} from "@/lib/editor-actions";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useDocumentStore } from "@/stores/document-store";

const INSERT_ACTIONS = [
  ["insert.section", "Section", ["heading", "chapter"]],
  ["insert.subsection", "Subsection", ["heading", "subsection"]],
  ["insert.list-item", "List item", ["item", "bullet", "list"]],
  ["insert.citation", "Citation", ["reference", "bibliography", "cite"]],
  ["insert.cross-reference", "Cross-reference", ["label", "ref", "link"]],
  ["insert.figure", "Figure", ["image", "graphic", "caption"]],
  ["insert.equation", "Equation", ["math", "formula", "align"]],
  ["insert.table", "Table", ["grid", "tabular", "booktabs"]],
  ["insert.environment", "Structure", ["list", "quote", "theorem"]],
] as const;

export function useCoreEditorActions(): void {
  useEffect(() => {
    const unregister = INSERT_ACTIONS.map(([id, label, keywords]) =>
      registerEditorAction({
        id,
        label: `Insert ${label.toLowerCase()}`,
        description: `Add a ${label.toLowerCase()} at the cursor`,
        keywords: [...keywords],
        category: "insert",
        available: (context) =>
          context.projectOpen && context.activeFileType === "tex",
        run: () => dispatchEditorAction(id),
      }),
    );
    unregister.push(
      registerEditorAction({
        id: "bibliography.import",
        label: "Import bibliography by identifier",
        description: "Look up a DOI, ISBN, or arXiv ID after confirmation",
        keywords: ["doi", "isbn", "arxiv", "reference", "bibliography"],
        category: "document",
        available: (context) => context.projectOpen,
        run: () => {
          window.dispatchEvent(new CustomEvent("open-bibliography-import"));
        },
      }),
      registerEditorAction({
        id: "help.learn-latex",
        label: "Restart Learn LaTeX tutorial",
        description: "Show the local beginner tutorial again",
        keywords: ["help", "tutorial", "onboarding", "learn"],
        category: "help",
        available: (context) => context.projectOpen,
        run: () => {
          const projectRoot = useDocumentStore.getState().projectRoot;
          if (projectRoot)
            useOnboardingStore.getState().startTutorial(projectRoot);
        },
      }),
      registerEditorAction({
        id: "help.reset-onboarding",
        label: "Reset LaTeX onboarding",
        description: "Reset the first-launch offer and tutorial progress",
        keywords: ["help", "tutorial", "onboarding", "reset"],
        category: "help",
        run: () => useOnboardingStore.getState().resetTutorial(),
      }),
    );
    return () => unregister.forEach((dispose) => dispose());
  }, []);
}
