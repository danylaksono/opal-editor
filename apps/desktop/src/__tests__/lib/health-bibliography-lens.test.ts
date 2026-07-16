import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findCandidateDuplicates,
  generateCitationKey,
  renameCitationKey,
  serializeCandidate,
  type CitationCandidate,
} from "@/lib/bibliography-import";
import { analyzeProjectHealth } from "@/lib/project-health";
import { sourceLensExtension } from "@/lib/source-lens";
import { useDocumentStore } from "@/stores/document-store";
import type { SemanticObject } from "@/lib/semantic/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const candidate: CitationCandidate = {
  provider: "crossref",
  attribution: "Crossref",
  identifier: "10.1/example",
  entryType: "article",
  title: "A Useful Paper",
  authors: ["Ada Lovelace"],
  year: "2025",
  journal: "Journal",
  publisher: "",
  doi: "10.1/example",
  isbn: "",
  arxivId: "",
  url: "https://doi.org/10.1/example",
  rawMetadata: "{}",
  fromCache: false,
};

describe("bibliography acquisition helpers", () => {
  it("generates collision-safe keys and detects normalized duplicates", () => {
    expect(generateCitationKey(candidate, ["lovelace2025useful"])).toBe(
      "lovelace2025useful2",
    );
    expect(
      findCandidateDuplicates(
        candidate,
        "title = {A Useful Paper}, year={2025}, doi={10.1/example}",
      ),
    ).toEqual(expect.arrayContaining(["same DOI", "matching title and year"]));
    expect(serializeCandidate(candidate, "lovelace2025useful")).toContain(
      "@article{lovelace2025useful",
    );
  });

  it("renames bibliography declarations and citations as one transaction", async () => {
    useDocumentStore.setState({
      projectRoot: null,
      activeFileId: "main.tex",
      files: [
        {
          id: "main.tex",
          name: "main.tex",
          relativePath: "main.tex",
          absolutePath: "C:/p/main.tex",
          type: "tex",
          content: "See \\cite{oldkey,other}.",
          isDirty: false,
        },
        {
          id: "refs.bib",
          name: "refs.bib",
          relativePath: "refs.bib",
          absolutePath: "C:/p/refs.bib",
          type: "bib",
          content: "@article{oldkey, title={Test}}",
          isDirty: false,
        },
      ],
    });
    expect(await renameCitationKey("oldkey", "newkey")).toBe(true);
    expect(
      useDocumentStore.getState().files.map((file) => file.content),
    ).toEqual(["See \\cite{newkey,other}.", "@article{newkey, title={Test}}"]);
  });
});

describe("project health", () => {
  it("reports missing references, citations, assets, labels, captions, and packages", () => {
    const files = [
      {
        id: "main.tex",
        name: "main.tex",
        relativePath: "main.tex",
        absolutePath: "C:/p/main.tex",
        type: "tex" as const,
        isDirty: false,
        content: String.raw`\documentclass{article}
See \ref{sec:missing} and \cite{missing2025}.
\begin{figure}\includegraphics{missing.png}\end{figure}
\begin{align}x&=1\end{align}`,
      },
    ];
    const objects: SemanticObject[] = [
      {
        id: "r",
        kind: "reference",
        fileId: "main.tex",
        from: 30,
        to: 45,
        label: "sec:missing",
        data: undefined,
      },
      {
        id: "c",
        kind: "citation",
        fileId: "main.tex",
        from: 50,
        to: 65,
        label: "missing2025",
        data: undefined,
      },
    ];
    const messages = analyzeProjectHealth(files, objects).map(
      (issue) => issue.message,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("no matching label"),
        expect.stringContaining("Citation key is missing"),
        expect.stringContaining("Figure file is missing"),
        "Figure has no caption",
        "Figure has no label",
        expect.stringContaining("Missing package graphicx"),
        expect.stringContaining("Missing package amsmath"),
      ]),
    );
  });
});

describe("source lens", () => {
  let view: EditorView | undefined;
  afterEach(() => view?.destroy());
  it("uses decorations while retaining one authoritative source document", () => {
    const source = String.raw`\documentclass{article}
\usepackage{graphicx}
\begin{document}
\section{Intro}
See \cite{smith2025}.
\begin{figure}\includegraphics{x.png}\caption{X}\end{figure}
\foo{custom}
\end{document}`;
    const parent = document.createElement("div");
    document.body.append(parent);
    const state = EditorState.create({
      doc: source,
      selection: { anchor: source.indexOf("Intro") },
      extensions: sourceLensExtension,
    });
    view = new EditorView({ state, parent });
    expect(view.state.doc.toString()).toBe(source);
    expect(parent.textContent).toContain("Citation · smith2025");
    expect(parent.textContent).toContain("Figure · X");
    expect(parent.textContent).toContain("\\foo{custom}");
    parent.remove();
  });
});
