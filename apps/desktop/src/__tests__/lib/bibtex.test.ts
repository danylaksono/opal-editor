import { describe, expect, it } from "vitest";
import {
  parseBibEntries,
  parseBibItems,
  parseBibtexSourceEntries,
  replaceBibtexEntryKey,
} from "@/lib/bibtex";

describe("parseBibEntries", () => {
  it("retains pasted source and safely rewrites only a conflicting key", () => {
    const source = `@misc{custom,
  title = {Custom source},
  x-unknown-field = {keep {this} exactly}
}`;
    const [entry] = parseBibtexSourceEntries(source);
    expect(entry.source).toContain("x-unknown-field = {keep {this} exactly}");
    const renamed = replaceBibtexEntryKey(entry, "custom2");
    expect(renamed).toContain("@misc{custom2,");
    expect(renamed).toContain("x-unknown-field = {keep {this} exactly}");
  });
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

  it("does not swallow an entry after a quote inside a braced name", () => {
    const entries = parseBibtexSourceEntries(`@article{pelzer2014added,
  title = {The Added Value of Planning Support Systems},
  author = {Pelzer, Peter and Rouwette, Eti{"e}nne},
  year = {2014}
}

@article{tebrommelstroet2010equip,
  title = {Equip the Warrior Instead of Manning the Equipment},
  author = {te Br{"o}mmelstroet, Marco},
  year = {2010},
  doi = {10.5198/jtlu.v3i1.99}
}`);

    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      key: "tebrommelstroet2010equip",
      title: "Equip the Warrior Instead of Manning the Equipment",
      author: 'te Br"ommelstroet, Marco',
      year: "2010",
    });
  });

  it("handles braced values inside parenthesized entries", () => {
    const entries = parseBibtexSourceEntries(`@article(example,
  title = {Planning (Support) Systems},
  author = {Rouwette, Eti{"e}nne}
)`);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "example",
      title: "Planning (Support) Systems",
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

describe("parseBibItems", () => {
  it("extracts keys from a classic thebibliography block", () => {
    expect(
      parseBibItems(
        String.raw`\bibitem[Knuth (1984)]{knuth1984} Literate Programming`,
        "main.tex",
      ),
    ).toEqual([
      {
        key: "knuth1984",
        type: "bibitem",
        title: "Knuth (1984)",
        filePath: "main.tex",
      },
    ]);
  });
});
