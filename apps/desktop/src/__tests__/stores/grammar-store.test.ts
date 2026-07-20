import { beforeEach, describe, expect, it } from "vitest";
import { useGrammarStore } from "@/stores/grammar-store";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import type { GrammarIssue } from "@/lib/language-tool";

const SOURCE = "This are a test. It have flaws.";

function issue(overrides: Partial<GrammarIssue>): GrammarIssue {
  return {
    id: "r-0-0",
    message: "msg",
    shortMessage: "short",
    ruleId: "RULE",
    category: "Grammar",
    issueType: "grammar",
    start: 0,
    end: 1,
    excerpt: "",
    replacements: [],
    ...overrides,
  };
}

function setupFile(content: string) {
  const file: ProjectFile = {
    id: "main.tex",
    name: "main.tex",
    relativePath: "main.tex",
    absolutePath: "/p/main.tex",
    type: "tex",
    content,
    isDirty: false,
  };
  useDocumentStore.setState({
    projectRoot: "/p",
    files: [file],
    activeFileId: file.id,
  });
}

beforeEach(() => {
  useGrammarStore.getState().clear();
  setupFile(SOURCE);
});

describe("grammar store applyReplacement", () => {
  it("applies a suggestion and shifts later issue offsets", () => {
    // "This are" → "This is" (start 5, end 8, "are"); later: "have" at 20-24
    useGrammarStore.setState({
      checkedFileId: "main.tex",
      issues: [
        issue({ id: "a", start: 5, end: 8, excerpt: "are" }),
        issue({
          id: "b",
          start: SOURCE.indexOf("have"),
          end: SOURCE.indexOf("have") + 4,
          excerpt: "have",
        }),
      ],
    });

    expect(useGrammarStore.getState().applyReplacement("a", "is")).toBe(true);

    const content = useDocumentStore.getState().files[0].content;
    expect(content).toBe("This is a test. It have flaws.");
    // The remaining issue shifted left by 1 and still points at "have"
    const remaining = useGrammarStore.getState().issues;
    expect(remaining).toHaveLength(1);
    expect(content!.slice(remaining[0].start, remaining[0].end)).toBe("have");
  });

  it("refuses to apply when the document changed since the check", () => {
    useGrammarStore.setState({
      checkedFileId: "main.tex",
      issues: [issue({ id: "a", start: 5, end: 8, excerpt: "are" })],
    });
    // Document was edited after the check — excerpt no longer matches
    setupFile("Completely different content.");

    expect(useGrammarStore.getState().applyReplacement("a", "is")).toBe(false);
    expect(useGrammarStore.getState().error).toMatch(/changed since/i);
    expect(useGrammarStore.getState().issues).toHaveLength(1);
  });

  it("dismiss removes a single issue", () => {
    useGrammarStore.setState({
      checkedFileId: "main.tex",
      issues: [
        issue({ id: "a", start: 5, end: 8, excerpt: "are" }),
        issue({ id: "b", start: 19, end: 23, excerpt: "have" }),
      ],
    });
    useGrammarStore.getState().dismiss("a");
    expect(useGrammarStore.getState().issues.map((i) => i.id)).toEqual(["b"]);
  });
});
