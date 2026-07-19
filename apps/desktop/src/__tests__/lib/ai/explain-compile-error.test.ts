import { describe, it, expect } from "vitest";
import {
  buildExplainCompileErrorPrompt,
  EXPLAIN_ERROR_SYSTEM_PROMPT,
} from "@/lib/ai/explain-compile-error";
import type { CompileFailure } from "@/lib/latex-compiler";
import type { ProjectFile } from "@/stores/document-store";

const failure: CompileFailure = {
  backend: "Tectonic",
  category: "undefined-command",
  summary: "LaTeX does not recognize a command.",
  sourceFile: "main.tex",
  sourceLine: 3,
  relatedDiagnostics: [],
  rawEngineOutput: "! Undefined control sequence.\nl.3 \\includegraphicx",
};

const files = [
  {
    id: "1",
    relativePath: "main.tex",
    content:
      "\\documentclass{article}\n\\begin{document}\n\\includegraphicx{fig}\n\\end{document}\n",
  },
] as ProjectFile[];

describe("buildExplainCompileErrorPrompt", () => {
  it("includes summary, location, and marked source snippet", () => {
    const prompt = buildExplainCompileErrorPrompt(failure, files, "main.tex");
    expect(prompt).toContain("LaTeX does not recognize a command.");
    expect(prompt).toContain("main.tex, line 3");
    expect(prompt).toContain("> 3 | \\includegraphicx{fig}");
    expect(prompt).toContain("! Undefined control sequence.");
  });

  it("omits the snippet when the source file is not loaded", () => {
    const prompt = buildExplainCompileErrorPrompt(failure, [], "main.tex");
    expect(prompt).not.toContain("Source around the failing line");
    expect(prompt).toContain("main.tex, line 3");
  });

  it("falls back to the root file name when sourceFile is missing", () => {
    const prompt = buildExplainCompileErrorPrompt(
      { ...failure, sourceFile: undefined, sourceLine: undefined },
      files,
      "thesis.tex",
    );
    expect(prompt).toContain("Location: thesis.tex");
  });

  it("clips very long engine output", () => {
    const prompt = buildExplainCompileErrorPrompt(
      { ...failure, rawEngineOutput: "x".repeat(10_000) },
      files,
      "main.tex",
    );
    expect(prompt.length).toBeLessThan(6_000);
    expect(prompt).toContain("…");
  });

  it("system prompt keeps the three-section structure", () => {
    expect(EXPLAIN_ERROR_SYSTEM_PROMPT).toContain("What went wrong");
    expect(EXPLAIN_ERROR_SYSTEM_PROMPT).toContain("Why it happens");
    expect(EXPLAIN_ERROR_SYSTEM_PROMPT).toContain("How to fix it");
  });
});
