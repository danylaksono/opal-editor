import { describe, expect, it } from "vitest";
import {
  findBibEntries,
  findBibEntryAt,
  tidyBibEntrySource,
  tidyBibFileSource,
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

  it("finds the entry from anywhere in its body, not just the key", () => {
    expect(findBibEntryAt(source, source.indexOf("Jane Smith"))?.key).toBe(
      "smith2024",
    );
    expect(findBibEntryAt(source, source.indexOf("preserve me"))?.key).toBe(
      "smith2024",
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

describe("tidyBibFileSource", () => {
  it("reformats every entry in a file without reordering them", () => {
    const messy = `@ARTICLE{zeta2020,
  year = "2020",
  title = "Zeta"
}

@ARTICLE{alpha2019,
  year = "2019",
  title = "Alpha"
}
`;
    const tidied = tidyBibFileSource(messy);
    expect(tidied).not.toBeNull();
    const result = tidied?.result ?? "";
    expect(tidied?.count).toBe(2);
    expect(result.indexOf("zeta2020")).toBeLessThan(
      result.indexOf("alpha2019"),
    );
    expect(result).toContain("@article{zeta2020,");
    expect(result).toContain("@article{alpha2019,");
  });

  it("returns null when the file is already tidy", () => {
    const tidy = `@article{alpha2019,\n  title = {Alpha},\n  year = 2019\n}\n`;
    expect(tidyBibFileSource(tidy)).toBeNull();
  });
});
