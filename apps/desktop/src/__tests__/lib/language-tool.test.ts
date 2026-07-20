import { describe, expect, it } from "vitest";
import { annotateLatex, type LtAnnotationItem } from "@/lib/language-tool";

/** Rebuild the virtual text LanguageTool sees (text + interpretAs). */
function virtualText(annotation: LtAnnotationItem[]): string {
  return annotation
    .map((a) => ("text" in a ? a.text : (a.interpretAs ?? "")))
    .join("");
}

describe("annotateLatex", () => {
  it("passes plain prose through as text", () => {
    const { annotation } = annotateLatex("This is a sentence.");
    expect(virtualText(annotation)).toBe("This is a sentence.");
  });

  it("skips the preamble and \\end{document} tail", () => {
    const source =
      "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHello world.\n\\end{document}\n";
    expect(virtualText(annotateLatex(source).annotation)).toBe(
      "\nHello world.\n",
    );
  });

  it("hides comments and math, keeps sentence flow for inline math", () => {
    const source = "The value $x^2$ grows. % TODO check\nNext line.";
    expect(virtualText(annotateLatex(source).annotation)).toBe(
      "The value X grows. \nNext line.",
    );
  });

  it("keeps prose inside formatting commands but hides the command tokens", () => {
    const source = "A \\textbf{bold move} indeed.";
    expect(virtualText(annotateLatex(source).annotation)).toBe(
      "A bold move indeed.",
    );
  });

  it("interprets citations and references as placeholder words", () => {
    const source =
      "As shown by \\citet{smith2020} in Section~\\ref{sec:intro}.";
    expect(virtualText(annotateLatex(source).annotation)).toBe(
      "As shown by Author (2020) in Section 1.",
    );
  });

  it("hides math environments entirely", () => {
    const source = "Before.\n\\begin{align}\na &= b \\\\\n\\end{align}\nAfter.";
    expect(virtualText(annotateLatex(source).annotation)).toBe(
      "Before.\n\nAfter.",
    );
  });

  it("keeps prose inside non-math environments", () => {
    const source = "\\begin{abstract}\nWe presents a method.\n\\end{abstract}";
    expect(virtualText(annotateLatex(source).annotation)).toBe(
      "\nWe presents a method.\n",
    );
  });

  it("converts LaTeX escapes and quotes to their readings", () => {
    const source = "Costs 5\\% more, ``quoted'' text\\& done.";
    expect(virtualText(annotateLatex(source).annotation)).toBe(
      "Costs 5% more, “quoted” text& done.",
    );
  });

  // LanguageTool reports offsets in original-input coordinates (markup counts
  // at its literal length) — verified against the public API
  it("accepts match offsets in source coordinates", () => {
    const source = "The value $x^2$ grows fast.";
    const annotated = annotateLatex(source);
    const offset = source.indexOf("grows");
    const range = annotated.toSource(offset, "grows".length);
    expect(range).toEqual({ start: offset, end: offset + "grows".length });
  });

  it("accepts offsets after commands with checked content", () => {
    const source = "\\section{Introduction}\nThis are wrong.";
    const annotated = annotateLatex(source);
    const offset = source.indexOf("This are");
    const range = annotated.toSource(offset, "This are".length);
    expect(source.slice(range!.start, range!.end)).toBe("This are");
  });

  it("returns null for matches entirely inside markup", () => {
    const source = "Word $misspeled$ here.";
    const annotated = annotateLatex(source);
    const offset = source.indexOf("$misspeled$") + 1;
    expect(annotated.toSource(offset, "misspeled".length)).toBeNull();
  });

  it("returns null for out-of-range offsets", () => {
    const annotated = annotateLatex("Short text.");
    expect(annotated.toSource(100, 5)).toBeNull();
    expect(annotated.toSource(0, 0)).toBeNull();
  });

  it("handles optional arguments on commands", () => {
    const source = "\\section[short]{Long title}\nText follows here.";
    const annotated = annotateLatex(source);
    const virtual = virtualText(annotated.annotation);
    expect(virtual).toContain("Long title");
    expect(virtual).not.toContain("short");
    expect(virtual).toContain("Text follows here.");
  });
});
