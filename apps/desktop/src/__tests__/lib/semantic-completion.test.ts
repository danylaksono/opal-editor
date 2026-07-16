import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEditorAction } from "@/lib/editor-actions";
import { semanticCompletionSource } from "@/lib/semantic/completion-source";
import { useDocumentStore } from "@/stores/document-store";
import { useSemanticIndexStore } from "@/stores/semantic-index-store";

function complete(source: string) {
  const state = EditorState.create({ doc: source });
  return semanticCompletionSource(
    new CompletionContext(state, source.length, true),
  );
}

describe("semantic completions", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      projectRoot: "C:/project",
      activeFileId: "main.tex",
      files: [
        {
          id: "main.tex",
          name: "main.tex",
          relativePath: "main.tex",
          absolutePath: "C:/project/main.tex",
          type: "tex",
          content: "",
          isDirty: false,
        },
      ],
    });
    useSemanticIndexStore.setState({
      snapshots: {
        "main.tex": {
          fileId: "main.tex",
          generation: 1,
          indexedAt: 1,
          diagnostics: [],
          objects: [
            {
              id: "bib",
              kind: "bibliography-entry",
              fileId: "references.bib",
              from: 0,
              to: 10,
              label: "A useful paper",
              detail: "smith2024",
              data: undefined,
            },
            {
              id: "label",
              kind: "label",
              fileId: "main.tex",
              from: 0,
              to: 10,
              label: "sec:intro",
              detail: "section",
              data: undefined,
            },
            {
              id: "asset",
              kind: "asset",
              fileId: "figures/map.png",
              from: 0,
              to: 0,
              label: "figures/map.png",
              data: undefined,
            },
          ],
        },
      },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("offers slash actions only after line-leading whitespace", () => {
    const dispose = registerEditorAction({
      id: "test.figure",
      label: "Insert figure",
      keywords: ["image"],
      category: "insert",
      run: vi.fn(),
    });
    expect(complete("  /fig")?.options.map((item) => item.label)).toContain(
      "Insert figure",
    );
    expect(complete("text /fig")).toBeNull();
    dispose();
  });

  it("completes citations, labels, assets, and environments", () => {
    expect(complete(String.raw`\cite{sm`)?.options[0].label).toBe("smith2024");
    expect(complete(String.raw`\autoref{sec`)?.options[0].label).toBe(
      "sec:intro",
    );
    expect(complete(String.raw`\includegraphics{fig`)?.options[0].label).toBe(
      "figures/map.png",
    );
    expect(
      complete(String.raw`\begin{equ`)?.options.map((item) => item.label),
    ).toContain("equation");
    expect(
      complete(String.raw`\usepackage{ams`)?.options.map((item) => item.label),
    ).toContain("amsmath");
  });
});
