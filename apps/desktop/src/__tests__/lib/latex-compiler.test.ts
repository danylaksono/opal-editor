import { describe, it, expect } from "vitest";
import { effectiveCompileProfile, profilesEqual } from "@/lib/latex-compiler";
import type { ProjectFile } from "@/stores/document-store";

function makeFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    id: "main.tex",
    name: "main.tex",
    relativePath: "main.tex",
    absolutePath: "/project/main.tex",
    type: "tex",
    content: "",
    isDirty: false,
    ...overrides,
  };
}

const FULL = {
  onlyCurrentChapter: false,
  skipFigures: false,
  singlePass: false,
};

describe("effectiveCompileProfile", () => {
  const root = makeFile({
    id: "_main.tex",
    name: "_main.tex",
    relativePath: "_main.tex",
    content:
      "\\documentclass{book}\n\\begin{document}\n\\include{chapter04}\n\\input{preamble}\n\\end{document}",
  });
  const chapter = makeFile({
    id: "chapter04.tex",
    name: "chapter04.tex",
    relativePath: "chapter04.tex",
    content: "\\chapter{Four}",
  });
  const preamble = makeFile({
    id: "preamble.tex",
    name: "preamble.tex",
    relativePath: "preamble.tex",
    content: "% setup",
  });
  const files = [root, chapter, preamble];

  it("returns null when all fast options are off", () => {
    expect(
      effectiveCompileProfile("_main.tex", "chapter04.tex", files, FULL),
    ).toBeNull();
  });

  it("targets an \\include'd chapter for includeOnly", () => {
    const profile = effectiveCompileProfile(
      "_main.tex",
      "chapter04.tex",
      files,
      {
        ...FULL,
        onlyCurrentChapter: true,
      },
    );
    expect(profile).toEqual({
      includeOnly: "chapter04",
      draft: false,
      singlePass: false,
    });
  });

  it("falls back to a full build when the file is \\input, not \\include'd", () => {
    expect(
      effectiveCompileProfile("_main.tex", "preamble.tex", files, {
        ...FULL,
        onlyCurrentChapter: true,
      }),
    ).toBeNull();
  });

  it("never applies includeOnly to the root itself", () => {
    expect(
      effectiveCompileProfile("_main.tex", "_main.tex", files, {
        ...FULL,
        onlyCurrentChapter: true,
      }),
    ).toBeNull();
  });

  it("carries draft and singlePass flags", () => {
    expect(
      effectiveCompileProfile("_main.tex", "_main.tex", files, {
        onlyCurrentChapter: false,
        skipFigures: true,
        singlePass: true,
      }),
    ).toEqual({ includeOnly: null, draft: true, singlePass: true });
  });
});

describe("profilesEqual", () => {
  it("treats two full builds (null) as equal", () => {
    expect(profilesEqual(null, null)).toBe(true);
  });

  it("distinguishes full from fast builds", () => {
    expect(
      profilesEqual(null, {
        includeOnly: null,
        draft: true,
        singlePass: false,
      }),
    ).toBe(false);
  });

  it("compares field by field", () => {
    const a = { includeOnly: "ch1", draft: false, singlePass: true };
    expect(profilesEqual(a, { ...a })).toBe(true);
    expect(profilesEqual(a, { ...a, includeOnly: "ch2" })).toBe(false);
  });
});
