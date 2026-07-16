import { describe, expect, it } from "vitest";
import {
  detectCitationPackage,
  findCitationAt,
  findCitations,
  getCitationStyleOptions,
  serializeCitation,
} from "@/lib/latex-citations";

describe("LaTeX citations", () => {
  it("parses supported commands, keys, prefixes, and locators", () => {
    const source = String.raw`Text \citep[see][pp. 23--25]{smith2024, jones2023}.`;
    const citation = findCitations(source)[0];

    expect(citation).toMatchObject({
      command: "citep",
      keys: ["smith2024", "jones2023"],
      prefix: "see",
      locator: "pp. 23--25",
      source: String.raw`\citep[see][pp. 23--25]{smith2024, jones2023}`,
    });
  });

  it("treats a single optional argument as the locator", () => {
    const citation = findCitations(String.raw`\parencite[ch. 2]{doe2025}`)[0];
    expect(citation.prefix).toBe("");
    expect(citation.locator).toBe("ch. 2");
  });

  it("supports starred commands and ignores comments and custom macros", () => {
    const source = [
      String.raw`% \cite{ignored}`,
      String.raw`Visible \textcite*{kept}.`,
      String.raw`\mycite{custom}`,
      String.raw`\\cite{escaped-command}`,
    ].join("\n");

    expect(findCitations(source)).toHaveLength(1);
    expect(findCitations(source)[0]).toMatchObject({
      command: "textcite",
      starred: true,
      keys: ["kept"],
    });
  });

  it("finds a citation containing the cursor", () => {
    const source = String.raw`Before \cite{key} after`;
    expect(findCitationAt(source, source.indexOf("key") + 1)?.keys).toEqual([
      "key",
    ]);
    expect(findCitationAt(source, 1)).toBeNull();
  });

  it("serializes source without rewriting surrounding document text", () => {
    expect(
      serializeCitation({
        command: "citep",
        keys: ["smith2024", "jones2023"],
        prefix: "see",
        locator: "pp. 2--4",
      }),
    ).toBe(String.raw`\citep[see][pp. 2--4]{smith2024,jones2023}`);

    expect(
      serializeCitation({
        command: "parencite",
        keys: ["smith2024"],
        prefix: "",
        locator: "ch. 3",
      }),
    ).toBe(String.raw`\parencite[ch. 3]{smith2024}`);
  });

  it("detects bibliography packages and returns compatible styles", () => {
    expect(
      detectCitationPackage([String.raw`\usepackage[authoryear]{biblatex}`]),
    ).toBe("biblatex");
    expect(
      detectCitationPackage([String.raw`\usepackage{geometry,natbib}`]),
    ).toBe("natbib");
    expect(
      getCitationStyleOptions("natbib").map((style) => style.command),
    ).toEqual(["citep", "citet", "cite"]);
  });
});
