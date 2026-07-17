import { describe, expect, it } from "vitest";
import { searchProjectFiles } from "@/lib/project-search";
import type { ProjectFile } from "@/stores/document-store";

const files: ProjectFile[] = [
  {
    id: "main.tex",
    name: "main.tex",
    relativePath: "main.tex",
    absolutePath: "/project/main.tex",
    type: "tex",
    content: "Alpha beta\nalpha alphabet\n",
    isDirty: false,
  },
  {
    id: "references.bib",
    name: "references.bib",
    relativePath: "references.bib",
    absolutePath: "/project/references.bib",
    type: "bib",
    content: "@article{alpha2026,\n  title = {Alpha methods}\n}",
    isDirty: false,
  },
  {
    id: "figure.png",
    name: "figure.png",
    relativePath: "figure.png",
    absolutePath: "/project/figure.png",
    type: "image",
    isDirty: false,
  },
];

describe("project search", () => {
  it("searches loaded project text and reports source locations", () => {
    const result = searchProjectFiles(files, "alpha", {
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
    });
    expect(result.error).toBeUndefined();
    expect(result.matches).toHaveLength(5);
    expect(result.matches[1]).toMatchObject({
      fileId: "main.tex",
      line: 2,
      column: 1,
      lineText: "alpha alphabet",
    });
  });

  it("supports whole words, case sensitivity, and invalid regex feedback", () => {
    expect(
      searchProjectFiles(files, "Alpha", {
        caseSensitive: true,
        wholeWord: true,
        useRegex: false,
      }).matches,
    ).toHaveLength(2);
    expect(
      searchProjectFiles(files, "(", {
        caseSensitive: false,
        wholeWord: false,
        useRegex: true,
      }).error,
    ).toBeTruthy();
  });
});
