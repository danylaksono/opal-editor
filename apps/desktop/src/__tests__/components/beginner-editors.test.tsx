import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingPrompt } from "@/components/onboarding-prompt";
import { TableEditor } from "@/components/workspace/table-editor";
import { TutorialChecklist } from "@/components/workspace/tutorial-checklist";
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

  it("turns tutorial steps into accessible editor actions", async () => {
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
    useOnboardingStore.setState({
      activeTutorialProject: "/tutorial",
      completed: {},
    });

    const actions: string[] = [];
    const listener = (event: Event) => {
      actions.push((event as CustomEvent<{ id: string }>).detail.id);
    };
    window.addEventListener("editor-action", listener);

    render(<TutorialChecklist />);
    expect(
      screen
        .getByRole("progressbar", { name: "Tutorial progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Add a section" }));

    expect(actions).toEqual(["insert.section"]);
    window.removeEventListener("editor-action", listener);
  });
});
