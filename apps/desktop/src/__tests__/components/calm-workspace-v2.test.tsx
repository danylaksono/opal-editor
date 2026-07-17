import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import { FigurePicker } from "@/components/workspace/figure-picker";
import { ProjectSearchPanel } from "@/components/workspace/project-search-panel";
import { StatusBar } from "@/components/workspace/status-bar";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { usePreviewStore } from "@/stores/preview-store";

const mainFile: ProjectFile = {
  id: "main.tex",
  name: "main.tex",
  relativePath: "main.tex",
  absolutePath: "/project/main.tex",
  type: "tex",
  content: "First line\nA searchable second line",
  isDirty: false,
};

describe("calm workspace v2", () => {
  it("navigates from project search results to the exact source range", async () => {
    useDocumentStore.setState({
      files: [mainFile],
      activeFileId: "main.tex",
      jumpToPosition: null,
    });
    render(<ProjectSearchPanel />);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search all project files" }),
      "searchable",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /searchable second line/i }),
    );
    expect(useDocumentStore.getState().jumpToPosition).toBe(13);
  });

  it("imports an external figure into the default figures folder", async () => {
    vi.mocked(open).mockResolvedValue("C:\\outside\\chart.png");
    const importFiles = vi.fn().mockResolvedValue(["figures/chart.png"]);
    useDocumentStore.setState({ importFiles });
    render(
      <FigurePicker
        open
        onOpenChange={vi.fn()}
        files={[mainFile]}
        onInsert={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(importFiles).toHaveBeenCalledWith(
      ["C:\\outside\\chart.png"],
      "figures",
    );
    expect(await screen.findByText(/figures\/chart\.png/)).toBeTruthy();
  });

  it("shows cursor, selection, and compiled page information", () => {
    useDocumentStore.setState({
      files: [mainFile],
      activeFileId: "main.tex",
      cursorPosition: 13,
      selectionRange: { start: 13, end: 23 },
      compileError: null,
      isCompiling: false,
      isSaving: false,
    });
    usePreviewStore.setState({ pageCount: 12, currentPage: 3 });
    render(<StatusBar />);
    expect(screen.getByText(/Ln 2, Col 3/)).toBeTruthy();
    expect(screen.getByText(/10 selected/)).toBeTruthy();
    expect(screen.getByText("3/12 pages")).toBeTruthy();
  });
});
