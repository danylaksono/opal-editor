import { describe, expect, it } from "vitest";
import { parseBibEntries } from "@/lib/bibtex";

describe("parseBibEntries", () => {
  it("extracts common citation metadata", () => {
    const entries = parseBibEntries(
      `@article{knuth1984,
        author = {Knuth, Donald E. and Lamport, Leslie},
        title = {Literate Programming},
        journal = {The Computer Journal},
        year = {1984}
      }`,
      "references.bib",
    );

    expect(entries).toEqual([
      {
        key: "knuth1984",
        type: "article",
        title: "Literate Programming",
        author: "Knuth, Donald E.; Lamport, Leslie",
        year: "1984",
        journal: "The Computer Journal",
        booktitle: undefined,
        publisher: undefined,
        filePath: "references.bib",
      },
    ]);
  });

  it("handles nested braces and quoted values", () => {
    const entries = parseBibEntries(`@inproceedings{vaswani2017attention,
      title = {{Attention} Is All You Need},
      author = "Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob",
      booktitle = {Advances in Neural Information Processing Systems},
      year = {2017}
    }`);

    expect(entries[0]).toMatchObject({
      key: "vaswani2017attention",
      type: "inproceedings",
      title: "Attention Is All You Need",
      author: "Vaswani, Ashish; Shazeer, Noam; Parmar, Niki",
      year: "2017",
      booktitle: "Advances in Neural Information Processing Systems",
    });
  });

  it("ignores non-entry bibtex blocks", () => {
    const entries = parseBibEntries(`
      @string{jmlr = {Journal of Machine Learning Research}}
      @comment{not a citation}
      @book{lamport1994,
        title = {LaTeX: A Document Preparation System},
        publisher = {Addison-Wesley},
        year = {1994}
      }
    `);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "lamport1994",
      publisher: "Addison-Wesley",
    });
  });
});
