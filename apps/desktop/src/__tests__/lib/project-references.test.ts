import { describe, expect, it } from "vitest";
import {
  buildProjectReferenceIndex,
  filterProjectReferences,
} from "@/lib/project-references";
import type { ProjectFile } from "@/stores/document-store";

function file(
  name: string,
  type: ProjectFile["type"],
  content: string,
): ProjectFile {
  return {
    id: name,
    name,
    relativePath: name,
    absolutePath: `C:\\project\\${name}`,
    type,
    content,
    isDirty: false,
  };
}

describe("project reference index", () => {
  const files = [
    file(
      "main.tex",
      "tex",
      String.raw`\cite{smith2024,missing2025}\parencite{smith2024}`,
    ),
    file(
      "references.bib",
      "bib",
      `@article{smith2024,
  title = {A useful paper},
  author = {Smith, Jane},
  year = {2024}
}

@book{unused2020,
  title = {An unused book},
  year = {2020}
}`,
    ),
  ];

  it("combines bibliography entries with citation usage", () => {
    const index = buildProjectReferenceIndex(files);
    expect(index.entries).toHaveLength(2);
    expect(
      index.entries.find((entry) => entry.key === "smith2024")?.citationCount,
    ).toBe(2);
    expect(index.missing).toEqual([
      expect.objectContaining({ key: "missing2025", citationCount: 1 }),
    ]);
  });

  it("filters cited, unused, and issue references", () => {
    const index = buildProjectReferenceIndex(files);
    expect(filterProjectReferences(index, "cited", "")).toHaveLength(1);
    expect(filterProjectReferences(index, "unused", "")).toEqual([
      expect.objectContaining({ key: "unused2020" }),
    ]);
    expect(filterProjectReferences(index, "issues", "")).toEqual([
      expect.objectContaining({ key: "missing2025" }),
    ]);
  });

  it("marks duplicate bibliography keys as issues", () => {
    const index = buildProjectReferenceIndex([
      ...files,
      file("other.bib", "bib", "@misc{smith2024, title = {Duplicate}}"),
    ]);
    expect(
      index.entries
        .filter((entry) => entry.key === "smith2024")
        .every((entry) => entry.isDuplicate),
    ).toBe(true);
    expect(filterProjectReferences(index, "issues", "")).toHaveLength(3);
  });
});
