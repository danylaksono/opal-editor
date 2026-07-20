import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingPrompt } from "@/components/onboarding-prompt";
import { TableEditor } from "@/components/workspace/table-editor";
import { TutorialGuide } from "@/components/workspace/tutorial-guide";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useSemanticIndexStore } from "@/stores/semantic-index-store";

describe("beginner editing dialogs", () => {
  it("offers an accessible first-launch tutorial action", async () => {
    const learn = vi.fn();
    render(
      <OnboardingPrompt
        open
        isCreating={false}
        onLearn={learn}
        onSkip={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Learn LaTeX" }));
    expect(learn).toHaveBeenCalledOnce();
  });

  it("supports keyboard-reachable table cells and row insertion", async () => {
    render(<TableEditor open onOpenChange={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByRole("grid", { name: "Table cells" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Row" }));
    expect(
      screen.getByRole("textbox", { name: "Row 4, column 1" }),
    ).toBeTruthy();
  });

  it("drives the guide's current step into an accessible editor action", async () => {
    const file: ProjectFile = {
      id: "main.tex",
      name: "main.tex",
      relativePath: "main.tex",
      absolutePath: "/tutorial/main.tex",
      type: "tex",
      content: "",
      isDirty: false,
    };
    useDocumentStore.setState({
      projectRoot: "/tutorial",
      files: [file],
      pdfRevision: 0,
    });
    useSemanticIndexStore.setState({ snapshots: {} });
    // "Add a section" is step index 4 in the track.
    useOnboardingStore.setState({
      tutorialProject: "/tutorial",
      currentStep: 4,
      maxStepReached: 4,
    });

    const actions: string[] = [];
    const listener = (event: Event) => {
      actions.push((event as CustomEvent<{ id: string }>).detail.id);
    };
    window.addEventListener("editor-action", listener);

    render(<TutorialGuide />);
    expect(
      screen.getByRole("progressbar", { name: "Tutorial progress" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Insert a section" }));

    expect(actions).toEqual(["insert.section"]);
    window.removeEventListener("editor-action", listener);
  });
});
