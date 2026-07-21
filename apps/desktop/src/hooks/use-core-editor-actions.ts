import { useEffect } from "react";
import { toast } from "sonner";
import {
  dispatchEditorAction,
  registerEditorAction,
} from "@/lib/editor-actions";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useDocumentStore } from "@/stores/document-store";
import { isTutorialSandbox, restoreTutorialFiles } from "@/lib/tutorial-setup";

/**
 * Full "start from scratch" reset: restore the Learn LaTeX sandbox files to
 * their original content (so a modified tutorial doesn't linger), forget
 * progress, and re-arm the first-launch offer. Reopens the sandbox if it's the
 * project currently on screen so the editor reflects the restored files.
 */
async function performOnboardingReset(): Promise<void> {
  const onboarding = useOnboardingStore.getState();
  const doc = useDocumentStore.getState();
  const tutorialPath = onboarding.tutorialProject;

  if (isTutorialSandbox(tutorialPath) && tutorialPath) {
    await restoreTutorialFiles(tutorialPath);
    if (doc.projectRoot === tutorialPath) {
      // Reopen so the editor loads the freshly-restored files.
      await doc.openProject(tutorialPath);
    }
  }

  onboarding.resetTutorial();
}

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
        description:
          "Restore the tutorial to its original content and re-arm the welcome offer",
        keywords: ["help", "tutorial", "onboarding", "reset"],
        category: "help",
        run: () => {
          const tutorialPath = useOnboardingStore.getState().tutorialProject;
          const willRestoreFiles = isTutorialSandbox(tutorialPath);
          // Overwriting the sandbox files is destructive, so confirm first.
          toast("Reset LaTeX onboarding?", {
            description: willRestoreFiles
              ? "Restores the Learn LaTeX tutorial to its original content (discarding changes) and re-arms the welcome offer."
              : "Re-arms the welcome tutorial offer.",
            action: {
              label: "Reset",
              onClick: () => {
                performOnboardingReset()
                  .then(() =>
                    toast.success("LaTeX onboarding reset", {
                      description: willRestoreFiles
                        ? "The tutorial is back to its starting point."
                        : "Tutorial progress and the welcome offer were reset.",
                    }),
                  )
                  .catch((err) =>
                    toast.error("Could not reset onboarding", {
                      description:
                        err instanceof Error ? err.message : String(err),
                    }),
                  );
              },
            },
          });
        },
      }),
    );
    return () => unregister.forEach((dispose) => dispose());
  }, []);
}
