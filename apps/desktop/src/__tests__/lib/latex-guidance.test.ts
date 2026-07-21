import { describe, expect, it } from "vitest";
import {
  findDeclaredPackages,
  findMissingPackageRequirements,
  friendlyCompileError,
  insertUsePackage,
  suggestCompileFix,
} from "@/lib/latex-guidance";

describe("LaTeX guidance", () => {
  it("finds comma-separated packages and missing feature requirements", () => {
    const packages = findDeclaredPackages([
      String.raw`\usepackage{amsmath, hyperref}`,
    ]);
    expect(Array.from(packages)).toEqual(["amsmath", "hyperref"]);
    expect(
      findMissingPackageRequirements(
        String.raw`\includegraphics{map.png} See \autoref{fig:map}
% \toprule`,
        packages,
      ),
    ).toMatchObject([{ packageName: "graphicx" }]);
  });

  it("adds a package after the existing preamble package block", () => {
    const source = String.raw`\documentclass{article}
\usepackage{geometry}

\begin{document}
Hello
\end{document}`;
    expect(insertUsePackage(source, "graphicx")).toContain(
      String.raw`\usepackage{geometry}
\usepackage{graphicx}
`,
    );
    expect(insertUsePackage(source, "geometry")).toBe(source);
  });

  it("adds beginner guidance while retaining technical compile details", () => {
    const result = friendlyCompileError("Undefined control sequence: \\foo");
    expect(result).toContain("does not recognize a command");
    expect(result).toContain("Undefined control sequence");
  });

  describe("suggestCompileFix", () => {
    it("explains a table row missing its trailing \\\\ (Misplaced \\noalign)", () => {
      // A booktabs \bottomrule after a row with no trailing \\ surfaces only
      // as this cryptic message — the reported line is the \bottomrule, not
      // the offending row.
      const raw = String.raw`! Misplaced \noalign.
\bottomrule ->\noalign
l.9 \bottomrule`;
      expect(suggestCompileFix(raw, "engine")).toMatch(/trailing \\\\/);
    });

    it("explains an extra alignment tab (too many & in a row)", () => {
      const raw =
        "! Extra alignment tab has been changed to \\cr.\nl.5 Header 1 & Header 2 & Header 3 &";
      expect(suggestCompileFix(raw, "engine")).toMatch(/column separator|&/);
    });

    it("explains math outside math mode", () => {
      expect(suggestCompileFix("! Missing $ inserted.", "engine")).toMatch(
        /math mode/i,
      );
    });

    it("explains a stray line break", () => {
      expect(
        suggestCompileFix("! LaTeX Error: There's no line here to end.", "engine"),
      ).toMatch(/line break|remove it/i);
    });

    it("explains an unclosed environment", () => {
      const raw =
        "! LaTeX Error: \\begin{itemize} on input line 4 ended by \\end{document}.";
      expect(suggestCompileFix(raw, "engine")).toMatch(/environment/i);
    });

    it("explains an undefined environment", () => {
      const raw = "! LaTeX Error: Environment tabu undefined.";
      expect(suggestCompileFix(raw, "engine")).toMatch(/environment/i);
    });

    it("explains an unclosed brace (runaway argument)", () => {
      expect(
        suggestCompileFix("Runaway argument?\n{Some text", "engine"),
      ).toMatch(/brace/i);
    });

    it("falls back to a category hint when nothing matches", () => {
      expect(suggestCompileFix("something unrecognized", "missing-file")).toMatch(
        /file path/i,
      );
      expect(suggestCompileFix("something unrecognized", "busy")).toMatch(
        /retry/i,
      );
      expect(suggestCompileFix("something unrecognized", "engine")).toMatch(
        /correct the source/i,
      );
    });
  });
});
