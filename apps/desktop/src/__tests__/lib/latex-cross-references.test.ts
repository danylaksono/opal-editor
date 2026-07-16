import { describe, expect, it } from "vitest";
import {
  detectReferencePackage,
  findLabelDefinitions,
  findReferenceAt,
  findReferences,
  getReferenceStyleOptions,
  serializeReference,
} from "@/lib/latex-cross-references";

describe("LaTeX cross references", () => {
  it("parses supported reference commands and ignores comments", () => {
    const source = [
      String.raw`See \autoref{fig:map}.`,
      String.raw`% \ref{ignored}`,
      String.raw`Equations \eqref*{eq:model}.`,
    ].join("\n");
    expect(findReferences(source)).toMatchObject([
      { command: "autoref", key: "fig:map", starred: false },
      { command: "eqref", key: "eq:model", starred: true },
    ]);
    expect(
      findReferenceAt(source, source.indexOf("fig:map") + 2)?.command,
    ).toBe("autoref");
  });

  it("discovers labels with useful context and kinds", () => {
    const labels = findLabelDefinitions([
      {
        filePath: "chapters/results.tex",
        content: String.raw`\section{Results}\label{sec:results}
\begin{figure}
\caption{Study area map}\label{fig:study-area}
\end{figure}`,
      },
    ]);
    expect(labels).toEqual([
      {
        key: "sec:results",
        filePath: "chapters/results.tex",
        line: 1,
        context: "Results",
        kind: "section",
      },
      {
        key: "fig:study-area",
        filePath: "chapters/results.tex",
        line: 3,
        context: "Study area map",
        kind: "figure",
      },
    ]);
  });

  it("serializes references and exposes package-compatible styles", () => {
    expect(serializeReference({ command: "cref", key: " fig:map " })).toBe(
      String.raw`\cref{fig:map}`,
    );
    expect(
      detectReferencePackage([String.raw`\usepackage{geometry,cleveref}`]),
    ).toBe("cleveref");
    expect(
      getReferenceStyleOptions("hyperref").map((style) => style.command),
    ).toEqual(["autoref", "ref", "pageref", "eqref"]);
  });
});
