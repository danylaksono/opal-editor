import { beforeEach, describe, expect, it } from "vitest";
import { executeAiTool } from "@/lib/ai/tools";
import { useDocumentStore } from "@/stores/document-store";
import { useProposedChangesStore } from "@/stores/proposed-changes-store";

function makeFile(relativePath: string, content: string, type = "tex") {
  return {
    id: relativePath,
    name: relativePath.split("/").pop()!,
    relativePath,
    absolutePath: `/project/${relativePath}`,
    type,
    content,
    isDirty: false,
  } as any;
}

const MAIN_TEX = [
  "\\documentclass{article}",
  "\\begin{document}",
  "Hello world.",
  "Hello again.",
  "\\end{document}",
].join("\n");

const INTRO_TEX = "\\section{Introduction}\nSome intro text.";

beforeEach(() => {
  useDocumentStore.setState({
    projectRoot: "/project",
    files: [
      makeFile("main.tex", MAIN_TEX),
      makeFile("chapters/intro.tex", INTRO_TEX),
      makeFile("figure.png", null as any, "image"),
    ],
  } as any);
  useProposedChangesStore.setState({ changes: [] });
});

describe("list_files", () => {
  it("lists project files with types", async () => {
    const res = await executeAiTool("list_files", {}, "tu1");
    expect(res.isError).toBeFalsy();
    expect(res.content).toContain("main.tex (tex)");
    expect(res.content).toContain("chapters/intro.tex (tex)");
    expect(res.content).toContain("figure.png (image)");
  });

  it("errors when no project is open", async () => {
    useDocumentStore.setState({ projectRoot: null, files: [] } as any);
    const res = await executeAiTool("list_files", {}, "tu1");
    expect(res.isError).toBe(true);
  });
});

describe("read_file", () => {
  it("returns the buffer content", async () => {
    const res = await executeAiTool("read_file", { path: "main.tex" }, "tu1");
    expect(res.isError).toBeFalsy();
    expect(res.content).toBe(MAIN_TEX);
  });

  it("normalizes backslash paths", async () => {
    const res = await executeAiTool(
      "read_file",
      { path: "chapters\\intro.tex" },
      "tu1",
    );
    expect(res.isError).toBeFalsy();
    expect(res.content).toBe(INTRO_TEX);
  });

  it("errors on a missing file", async () => {
    const res = await executeAiTool("read_file", { path: "nope.tex" }, "tu1");
    expect(res.isError).toBe(true);
    expect(res.content).toContain("not found");
  });

  it("errors on a binary file", async () => {
    const res = await executeAiTool("read_file", { path: "figure.png" }, "tu1");
    expect(res.isError).toBe(true);
  });

  it("reflects a pending proposed change (effective content)", async () => {
    useProposedChangesStore.getState().addChange({
      id: "prev",
      filePath: "main.tex",
      absolutePath: "/project/main.tex",
      oldContent: MAIN_TEX,
      newContent: MAIN_TEX.replace("Hello world.", "Goodbye world."),
      toolName: "propose_edit",
    });
    const res = await executeAiTool("read_file", { path: "main.tex" }, "tu1");
    expect(res.content).toContain("Goodbye world.");
    expect(res.content).not.toContain("Hello world.");
  });
});

describe("search_project", () => {
  it("finds matching lines case-insensitively", async () => {
    const res = await executeAiTool(
      "search_project",
      { query: "hello" },
      "tu1",
    );
    expect(res.isError).toBeFalsy();
    expect(res.content).toContain("main.tex:3: Hello world.");
    expect(res.content).toContain("main.tex:4: Hello again.");
  });

  it("reports no matches", async () => {
    const res = await executeAiTool(
      "search_project",
      { query: "zebra" },
      "tu1",
    );
    expect(res.isError).toBeFalsy();
    expect(res.content).toContain("No matches");
  });
});

describe("propose_edit", () => {
  it("registers a proposed change without touching the buffer", async () => {
    const res = await executeAiTool(
      "propose_edit",
      { path: "main.tex", search: "Hello world.", replace: "Hi world." },
      "tu1",
    );
    expect(res.isError).toBeFalsy();
    expect(res.content).toContain("review");

    const changes = useProposedChangesStore.getState().changes;
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe("tu1");
    expect(changes[0].filePath).toBe("main.tex");
    expect(changes[0].oldContent).toBe(MAIN_TEX);
    expect(changes[0].newContent).toContain("Hi world.");
    expect(changes[0].newContent).not.toContain("Hello world.");

    // Buffer must be untouched — the user reviews before anything applies
    const file = useDocumentStore
      .getState()
      .files.find((f) => f.relativePath === "main.tex");
    expect(file?.content).toBe(MAIN_TEX);
  });

  it("does not interpret $ patterns in the replacement", async () => {
    const res = await executeAiTool(
      "propose_edit",
      { path: "main.tex", search: "Hello world.", replace: "Costs $& more" },
      "tu1",
    );
    expect(res.isError).toBeFalsy();
    const change = useProposedChangesStore.getState().changes[0];
    expect(change.newContent).toContain("Costs $& more");
  });

  it("errors when the search text is not found", async () => {
    const res = await executeAiTool(
      "propose_edit",
      { path: "main.tex", search: "Nonexistent text", replace: "x" },
      "tu1",
    );
    expect(res.isError).toBe(true);
    expect(res.content).toContain("not found");
    expect(useProposedChangesStore.getState().changes).toHaveLength(0);
  });

  it("errors when the search text is ambiguous", async () => {
    const res = await executeAiTool(
      "propose_edit",
      { path: "main.tex", search: "Hello", replace: "Hi" },
      "tu1",
    );
    expect(res.isError).toBe(true);
    expect(res.content).toContain("more than one");
    expect(useProposedChangesStore.getState().changes).toHaveLength(0);
  });

  it("stacks edits: second edit bases on the first's result, baseline preserved", async () => {
    await executeAiTool(
      "propose_edit",
      { path: "main.tex", search: "Hello world.", replace: "Hi world." },
      "tu1",
    );
    const res = await executeAiTool(
      "propose_edit",
      { path: "main.tex", search: "Hello again.", replace: "Bye again." },
      "tu2",
    );
    expect(res.isError).toBeFalsy();

    const changes = useProposedChangesStore.getState().changes;
    expect(changes).toHaveLength(1); // merged per-file
    expect(changes[0].oldContent).toBe(MAIN_TEX); // original baseline
    expect(changes[0].newContent).toContain("Hi world.");
    expect(changes[0].newContent).toContain("Bye again.");
  });
});
