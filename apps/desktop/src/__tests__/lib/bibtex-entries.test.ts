import { describe, expect, it } from "vitest";
import {
  findBibEntries,
  findBibEntryAt,
  tidyBibEntrySource,
  updateBibEntrySource,
} from "@/lib/bibtex-entries";

describe("structured BibTeX entries", () => {
  const source = String.raw`@article{smith2024,
  author = {Jane Smith and John Doe},
  title = {A {Nested} Title},
  year = {2024},
  custom = {preserve me}
}`;

  it("parses fields and finds an entry from its key", () => {
    const entry = findBibEntries(source)[0];
    expect(entry).toMatchObject({
      type: "article",
      key: "smith2024",
      fields: {
        author: "Jane Smith and John Doe",
        title: "A {Nested} Title",
        year: "2024",
      },
    });
    expect(findBibEntryAt(source, source.indexOf("smith2024") + 2)?.type).toBe(
      "article",
    );
  });

  it("updates known fields and preserves unknown fields", () => {
    const entry = findBibEntries(source)[0];
    const updated = updateBibEntrySource(entry, {
      type: "inproceedings",
      key: "smith2025",
      fields: {
        ...entry.fields,
        title: "Updated title",
        year: "2025",
        doi: "10.1000/example",
      },
    });
    expect(updated).toContain("@inproceedings{smith2025,");
    expect(updated).toContain("title = {Updated title}");
    expect(updated).toContain("custom = {preserve me}");
    expect(updated).toContain("doi = {10.1000/example}");
  });
});

describe("tidyBibEntrySource", () => {
  it("reformats field order, casing, and quotes to braces", () => {
    const messy = `@ARTICLE{smith2024,
      year = "2024",
      title = "A Title",
      author = "Jane Smith"
    }`;
    const tidied = tidyBibEntrySource(messy);
    expect(tidied).toBe(
      `@article{smith2024,\n  title = {A Title},\n  author = {Jane Smith},\n  year = 2024\n}`,
    );
  });

  it("returns the original source when the entry has no citation key", () => {
    const noKey = "@article{, year = {2024}}";
    expect(tidyBibEntrySource(noKey)).toBe(noKey);
  });
});
