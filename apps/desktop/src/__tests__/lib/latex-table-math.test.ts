import { describe, expect, it } from "vitest";
import {
  applyPackagePreviews,
  findPackageDeclarations,
  previewPackageRequirements,
} from "@/lib/feature-packages";
import {
  delimiterDiagnostic,
  findMathNodes,
  serializeMath,
} from "@/lib/latex-math";
import {
  createTableModel,
  findTables,
  pasteTsv,
  serializeTable,
} from "@/lib/latex-tables";
import { useDocumentStore } from "@/stores/document-store";

describe("source-backed tables", () => {
  it("round-trips supported cells while retaining LaTeX fragments", () => {
    const source = String.raw`\begin{table}[ht]
% custom note
\begin{tabular}{lc}
\textbf{Name} & Value \\
Alpha & $x_1$ \\
\end{tabular}
\caption{Results}\label{tab:results}
\end{table}`;
    const table = findTables(source)[0];
    expect(table.unsupported).toBe(false);
    expect(table.rows[0]).toEqual([String.raw`\textbf{Name}`, "Value"]);
    expect(table.rows[1][1]).toBe("$x_1$");
    expect(table.beforeTabular).toContain("% custom note");
    expect(serializeTable(table)).toContain(String.raw`\textbf{Name}`);
  });

  it("refuses constructs that cannot be safely rewritten", () => {
    const source = String.raw`\begin{table}\begin{tabular}{cc}\multicolumn{2}{c}{Title}\\\end{tabular}\end{table}`;
    const table = findTables(source)[0];
    expect(table.unsupported).toBe(true);
    expect(() => serializeTable(table)).toThrow();
  });

  it("supports spreadsheet-shaped TSV paste", () => {
    const model = pasteTsv(createTableModel(2, 2), "A\tB\tC\n1\t2\t3");
    expect(model.columns).toHaveLength(3);
    expect(model.rows[1]).toEqual(["1", "2", "3"]);
  });
});

describe("math structures", () => {
  it("serializes and discovers supported math forms", () => {
    const source = `${serializeMath("inline", "x+1")} ${serializeMath("align", "x &= 1")}`;
    expect(findMathNodes(source).map((node) => node.kind)).toEqual([
      "inline",
      "align",
    ]);
  });

  it("reports unbalanced delimiters without blocking source", () => {
    expect(delimiterDiagnostic("f(x")).toContain("Missing");
    expect(delimiterDiagnostic("f(x)")).toBeUndefined();
  });
});

describe("confirmed package changes", () => {
  it("previews an exact diff and applies it as a validated transaction", async () => {
    useDocumentStore.setState({
      projectRoot: "C:/project",
      activeFileId: "main.tex",
      files: [
        {
          id: "main.tex",
          name: "main.tex",
          relativePath: "main.tex",
          absolutePath: "C:/project/main.tex",
          type: "tex",
          content:
            "\\documentclass{article}\n\\begin{document}\n\\end{document}",
          isDirty: false,
        },
      ],
    });
    const previews = previewPackageRequirements(["mathematics"]);
    expect(previews[0].exactDiff).toBe("+ \\usepackage{amsmath}");
    expect(await applyPackagePreviews(previews)).toBe(true);
    expect(
      findPackageDeclarations(
        useDocumentStore.getState().files[0].content ?? "",
      ).map((item) => item.name),
    ).toContain("amsmath");
  });
});
