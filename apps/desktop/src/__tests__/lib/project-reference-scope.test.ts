import { describe, expect, it } from "vitest";
import {
  resolveProjectReferenceScope,
  selectProjectReferenceFiles,
} from "@/lib/project-reference-scope";
import type { ProjectFile } from "@/stores/document-store";

function file(
  relativePath: string,
  type: ProjectFile["type"],
  content = "",
): ProjectFile {
  return {
    id: relativePath,
    name: relativePath.split("/").pop() ?? relativePath,
    relativePath,
    absolutePath: `C:\\project\\${relativePath}`,
    type,
    content,
    isDirty: false,
  };
}

describe("project reference scope", () => {
  it("follows TeX inputs and selects only declared bibliography files", () => {
    const files = [
      file(
        "_main.tex",
        "tex",
        String.raw`\documentclass{book}
\input{chapters/one}
\input{references}`,
      ),
      file("chapters/one.tex", "tex", String.raw`Text \cite{used2024}.`),
      file("references.tex", "tex", String.raw`\bibliography{references}`),
      file("unused.tex", "tex", String.raw`\cite{unused2024}`),
      file("references.bib", "bib", "@article{used2024}"),
      file("references_additional.bib", "bib", "@article{unused2024}"),
    ];

    const scope = resolveProjectReferenceScope(files, "_main.tex");

    expect([...scope.texFileIds]).toEqual([
      "_main.tex",
      "chapters/one.tex",
      "references.tex",
    ]);
    expect([...scope.bibliographyFileIds]).toEqual(["references.bib"]);
    expect(scope.fallbackToAllBibliographyFiles).toBe(false);
    expect(
      selectProjectReferenceFiles(files, scope, false).map((item) => item.id),
    ).toEqual([
      "_main.tex",
      "chapters/one.tex",
      "references.tex",
      "references.bib",
    ]);
    expect(
      selectProjectReferenceFiles(files, scope, true).map((item) => item.id),
    ).toEqual([
      "_main.tex",
      "chapters/one.tex",
      "references.tex",
      "references.bib",
      "references_additional.bib",
    ]);
  });

  it("supports biblatex resources and ignores commented declarations", () => {
    const files = [
      file(
        "main.tex",
        "tex",
        String.raw`\documentclass{article}
% \addbibresource{ignored.bib}
\addbibresource[location=local]{bib/used.bib}`,
      ),
      file("bib/used.bib", "bib"),
      file("ignored.bib", "bib"),
    ];

    const scope = resolveProjectReferenceScope(files, "main.tex");

    expect([...scope.bibliographyFileIds]).toEqual(["bib/used.bib"]);
    expect(scope.bibliographyDeclarations).toEqual(["bib/used.bib"]);
  });

  it("falls back to every bibliography when no declaration can be resolved", () => {
    const files = [
      file("main.tex", "tex", String.raw`\documentclass{article}`),
      file("one.bib", "bib"),
      file("two.bib", "bib"),
    ];

    const scope = resolveProjectReferenceScope(files, "main.tex");

    expect(scope.fallbackToAllBibliographyFiles).toBe(true);
    expect([...scope.bibliographyFileIds]).toEqual(["one.bib", "two.bib"]);
  });
});
