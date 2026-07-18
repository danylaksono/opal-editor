import { describe, expect, it } from "vitest";
import { countProposedChunks } from "@/lib/proposed-chunks";
import type { ProposedChange } from "@/stores/proposed-changes-store";

function makeChange(
  oldContent: string,
  newContent: string,
  filePath = "main.tex",
): ProposedChange {
  return {
    id: `c-${filePath}`,
    filePath,
    absolutePath: `/project/${filePath}`,
    oldContent,
    newContent,
    toolName: "propose_edit",
  } as ProposedChange;
}

describe("countProposedChunks", () => {
  it("returns 0 for no changes", () => {
    expect(countProposedChunks([])).toBe(0);
  });

  it("counts a single edited region as one chunk", () => {
    const before = "line one\nline two\nline three";
    const after = "line one\nline 2\nline three";
    expect(countProposedChunks([makeChange(before, after)])).toBe(1);
  });

  it("counts separated edits as separate chunks", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].join("\n");
    const after = ["A", "b", "c", "d", "e", "f", "g", "h", "I"].join("\n");
    expect(countProposedChunks([makeChange(before, after)])).toBe(2);
  });

  it("sums chunks across files", () => {
    const one = makeChange("x\ny", "X\ny", "a.tex");
    const two = makeChange("p\nq", "p\nQ", "b.tex");
    expect(countProposedChunks([one, two])).toBe(2);
  });

  it("counts identical content as zero chunks", () => {
    expect(countProposedChunks([makeChange("same\ntext", "same\ntext")])).toBe(
      0,
    );
  });
});
