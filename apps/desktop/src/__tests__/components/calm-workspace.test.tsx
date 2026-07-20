import { createRef } from "react";
import type { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorToolbar } from "@/components/workspace/editor/editor-toolbar";
import { useDocumentStore } from "@/stores/document-store";

describe("calm workspace", () => {
  it("keeps the writing toolbar calm without removing advanced actions", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    useDocumentStore.setState({
      projectRoot: "/project",
      activeFileId: "main.tex",
      files: [
        {
          id: "main.tex",
          name: "main.tex",
          relativePath: "main.tex",
          absolutePath: "/project/main.tex",
          type: "tex",
          content: "",
          isDirty: false,
        },
      ],
    });

    render(<EditorToolbar editorView={createRef<EditorView>()} />);

    expect(
      screen.getByRole("button", { name: "Insert document structure" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cite" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Figure" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Table" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Equation" })).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "More editor actions" }),
    );
    expect(await screen.findByRole("menuitem", { name: /Bold/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Equation…" })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Cross-reference" }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Vim mode/ })).toBeTruthy();
  });
});
