import { describe, expect, it } from "vitest";
import {
  findDeclaredPackages,
  findMissingPackageRequirements,
  friendlyCompileError,
  insertUsePackage,
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
});
