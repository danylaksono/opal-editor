import { beforeEach, describe, expect, it, vi } from "vitest";
import { scanWithSemanticProviders } from "@/lib/semantic/providers";
import {
  getEditorActions,
  registerEditorAction,
  runEditorAction,
} from "@/lib/editor-actions";
import { applyProjectEditTransaction } from "@/lib/project-edit-transaction";
import { useDocumentStore } from "@/stores/document-store";
import { useSemanticIndexStore } from "@/stores/semantic-index-store";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("semantic provider foundation", () => {
  it("indexes semantic objects from a TeX file", () => {
    const result = scanWithSemanticProviders({
      fileId: "main.tex",
      fileName: "main.tex",
      generation: 1,
      content: String.raw`\usepackage{graphicx}
\section{Intro}\label{sec:intro}
See \ref{sec:intro} and \cite{smith2024}.
\begin{figure}\includegraphics{map.png}\caption{Map}\end{figure}`,
    });
    expect(result.objects.map((object) => object.kind)).toEqual(
      expect.arrayContaining([
        "package",
        "label",
        "reference",
        "citation",
        "figure",
      ]),
    );
  });

  it("discards stale debounced index generations", () => {
    vi.useFakeTimers();
    const store = useSemanticIndexStore.getState();
    store.clear();
    const file = {
      id: "main.tex",
      name: "main.tex",
      relativePath: "main.tex",
      absolutePath: "C:/project/main.tex",
      type: "tex" as const,
      content: String.raw`\label{old}`,
      isDirty: false,
    };
    store.reindexFile(file, 1);
    store.reindexFile({ ...file, content: String.raw`\label{new}` }, 2, true);
    vi.runAllTimers();
    expect(
      useSemanticIndexStore.getState().snapshots["main.tex"].generation,
    ).toBe(2);
    expect(
      useSemanticIndexStore
        .getState()
        .objects("label")
        .map((object) => object.label),
    ).toContain("new");
    vi.useRealTimers();
  });
});

describe("editor actions", () => {
  it("registers, filters, runs, and unregisters actions", () => {
    const run = vi.fn();
    const unregister = registerEditorAction({
      id: "test.insert",
      label: "Insert test",
      keywords: ["test"],
      category: "insert",
      available: (context) => context.projectOpen,
      run,
    });
    expect(getEditorActions({ projectOpen: false })).toHaveLength(0);
    expect(getEditorActions({ projectOpen: true })).toHaveLength(1);
    runEditorAction("test.insert");
    expect(run).toHaveBeenCalledOnce();
    unregister();
  });
});

describe("project edit transactions", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      projectRoot: null,
      activeFileId: "main.tex",
      files: [
        {
          id: "main.tex",
          name: "main.tex",
          relativePath: "main.tex",
          absolutePath: "C:/project/main.tex",
          type: "tex",
          content: "Hello world",
          isDirty: false,
        },
      ],
    });
  });

  it("validates expected source before applying any edit", async () => {
    expect(
      await applyProjectEditTransaction({
        id: "rename",
        label: "Rename",
        edits: [
          {
            fileId: "main.tex",
            from: 6,
            to: 11,
            expected: "wrong",
            insert: "TeX",
          },
        ],
      }),
    ).toBe(false);
    expect(useDocumentStore.getState().files[0].content).toBe("Hello world");
  });

  it("applies validated edits", async () => {
    expect(
      await applyProjectEditTransaction({
        id: "rename",
        label: "Rename",
        edits: [
          {
            fileId: "main.tex",
            from: 6,
            to: 11,
            expected: "world",
            insert: "TeX",
          },
        ],
      }),
    ).toBe(true);
    expect(useDocumentStore.getState().files[0].content).toBe("Hello TeX");
  });
});
