import { describe, expect, it } from "vitest";
import {
  parseDocumentOutline,
  parseProjectOutline,
} from "@/lib/document-outline";

describe("parseDocumentOutline", () => {
  it("parses section hierarchy", () => {
    const outline = parseDocumentOutline(`
\\section{Introduction}
\\subsection{Related Work}
\\subsubsection{Prior Models}
`);

    expect(outline).toMatchObject([
      {
        kind: "section",
        group: "structure",
        level: 2,
        title: "Introduction",
        line: 2,
      },
      {
        kind: "subsection",
        group: "structure",
        level: 3,
        title: "Related Work",
        line: 3,
      },
      {
        kind: "subsubsection",
        group: "structure",
        level: 4,
        title: "Prior Models",
        line: 4,
      },
    ]);
  });

  it("parses floats, equations, labels, and bibliography entries", () => {
    const outline = parseDocumentOutline(`
\\begin{figure}
  \\caption{Model overview}
  \\label{fig:model}
\\end{figure}

\\begin{equation}
  y = mx + b
  \\label{eq:line}
\\end{equation}

\\bibliography{references}
`);

    expect(outline).toEqual([
      {
        kind: "figure",
        group: "objects",
        level: 1,
        title: "Model overview",
        detail: "figure",
        line: 2,
      },
      {
        kind: "label",
        group: "objects",
        level: 2,
        title: "fig:model",
        detail: "label",
        line: 4,
      },
      {
        kind: "equation",
        group: "objects",
        level: 1,
        title: "Equation",
        detail: "equation",
        line: 7,
      },
      {
        kind: "label",
        group: "objects",
        level: 2,
        title: "eq:line",
        detail: "label",
        line: 9,
      },
      {
        kind: "bibliography",
        group: "objects",
        level: 1,
        title: "Bibliography",
        detail: "references",
        line: 12,
      },
    ]);
  });

  it("captures appendix markers", () => {
    const outline = parseDocumentOutline(`
\\appendix
\\section{Supplementary Results}
`);

    expect(outline[0]).toMatchObject({
      kind: "appendix",
      group: "structure",
      title: "Appendix",
      line: 2,
    });
  });
});

describe("parseProjectOutline", () => {
  it("flattens \\input and \\include files into the root outline", () => {
    const files = [
      {
        relativePath: "main.tex",
        type: "tex",
        content: [
          "\\documentclass{book}",
          "\\begin{document}",
          "\\chapter{Introduction}",
          "\\input{chapters/methods}",
          "\\include{chapters/results.tex}",
          "\\end{document}",
        ].join("\n"),
      },
      {
        relativePath: "chapters/methods.tex",
        type: "tex",
        content: "\\section{Methods}",
      },
      {
        relativePath: "chapters/results.tex",
        type: "tex",
        content: "\\section{Results}\n\\subsection{Ablations}",
      },
    ];

    const outline = parseProjectOutline("main.tex", files);

    expect(outline).toMatchObject([
      { title: "Introduction", file: "main.tex", line: 3 },
      { title: "Methods", file: "chapters/methods.tex", line: 1 },
      { title: "Results", file: "chapters/results.tex", line: 1 },
      { title: "Ablations", file: "chapters/results.tex", line: 2 },
    ]);
  });

  it("resolves includes relative to the including file's directory", () => {
    const files = [
      {
        relativePath: "thesis/main.tex",
        type: "tex",
        content: "\\chapter{One}\n\\input{intro}",
      },
      {
        relativePath: "thesis/intro.tex",
        type: "tex",
        content: "\\section{Background}",
      },
    ];

    const outline = parseProjectOutline("thesis/main.tex", files);
    expect(outline.map((i) => i.title)).toEqual(["One", "Background"]);
  });

  it("supports \\import with a directory argument", () => {
    const files = [
      {
        relativePath: "main.tex",
        type: "tex",
        content: "\\import{chapters/}{intro}",
      },
      {
        relativePath: "chapters/intro.tex",
        type: "tex",
        content: "\\section{Imported}",
      },
    ];

    const outline = parseProjectOutline("main.tex", files);
    expect(outline.map((i) => i.title)).toEqual(["Imported"]);
  });

  it("ignores commented-out includes in CRLF files", () => {
    const files = [
      {
        relativePath: "_main.tex",
        type: "tex",
        content: "\\chapter{One}\r\n% \\input{thesis-config}\r\n",
      },
      {
        relativePath: "thesis-config.tex",
        type: "tex",
        content: "\\section{Should not appear}",
      },
    ];

    const outline = parseProjectOutline("_main.tex", files);
    expect(outline.map((i) => i.title)).toEqual(["One"]);
  });

  it("ignores commented-out includes and missing files", () => {
    const files = [
      {
        relativePath: "main.tex",
        type: "tex",
        content: [
          "\\section{Only}",
          "% \\input{chapters/dropped}",
          "\\input{does-not-exist}",
        ].join("\n"),
      },
      {
        relativePath: "chapters/dropped.tex",
        type: "tex",
        content: "\\section{Dropped}",
      },
    ];

    const outline = parseProjectOutline("main.tex", files);
    expect(outline.map((i) => i.title)).toEqual(["Only"]);
  });

  it("guards against include cycles", () => {
    const files = [
      {
        relativePath: "a.tex",
        type: "tex",
        content: "\\section{A}\n\\input{b}",
      },
      {
        relativePath: "b.tex",
        type: "tex",
        content: "\\section{B}\n\\input{a}",
      },
    ];

    const outline = parseProjectOutline("a.tex", files);
    expect(outline.map((i) => i.title)).toEqual(["A", "B"]);
  });
});
