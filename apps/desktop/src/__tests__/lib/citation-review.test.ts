import { describe, expect, it } from "vitest";
import {
  findAddedBibKeys,
  findUnverifiedBibAdditions,
} from "@/lib/citation-review";
import type { ProposedChange } from "@/stores/proposed-changes-store";

const OLD_BIB = "@article{existing2020,\n  title = {Old},\n  year = {2020},\n}";
const NEW_BIB = `${OLD_BIB}\n\n@article{added2024,\n  title = {New},\n  year = {2024},\n}`;

function makeChange(overrides: Partial<ProposedChange> = {}): ProposedChange {
  return {
    id: "c1",
    filePath: "refs.bib",
    absolutePath: "/project/refs.bib",
    oldContent: OLD_BIB,
    newContent: NEW_BIB,
    toolName: "propose_edit",
    ...overrides,
  } as ProposedChange;
}

describe("findAddedBibKeys", () => {
  it("returns keys added to a .bib file", () => {
    expect(findAddedBibKeys(makeChange())).toEqual(["added2024"]);
  });

  it("ignores non-bib files", () => {
    expect(findAddedBibKeys(makeChange({ filePath: "main.tex" }))).toEqual([]);
  });

  it("returns nothing when only existing entries are edited", () => {
    expect(
      findAddedBibKeys(
        makeChange({ newContent: OLD_BIB.replace("Old", "Renamed") }),
      ),
    ).toEqual([]);
  });
});

describe("findUnverifiedBibAdditions", () => {
  it("flags entries added via propose_edit", () => {
    expect(findUnverifiedBibAdditions(makeChange())).toEqual(["added2024"]);
  });

  it("trusts entries added via add_citation (resolver-built)", () => {
    expect(
      findUnverifiedBibAdditions(makeChange({ toolName: "add_citation" })),
    ).toEqual([]);
  });
});
