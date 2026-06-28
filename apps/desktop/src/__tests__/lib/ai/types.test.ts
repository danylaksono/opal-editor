import { describe, it, expect } from "vitest";
import type { AiContext, AiRequest } from "@/lib/ai/types";

describe("AiContext", () => {
  it("valid context scopes are recognized", () => {
    const scopes: AiContext["scope"][] = [
      "selection",
      "file",
      "chapter",
      "preamble",
      "bibliography",
      "project",
    ];
    expect(scopes).toHaveLength(6);
  });

  it("valid context actions are recognized", () => {
    const actions: AiContext["action"][] = [
      "chat",
      "proofread",
      "fix",
      "complete",
      "explain",
    ];
    expect(actions).toHaveLength(5);
  });

  it("AiRequest with context serializes correctly", () => {
    const request: AiRequest = {
      tabId: "tab-1",
      projectPath: "/project",
      prompt: "Fix the abstract",
      model: "sonnet",
      messages: [],
      context: {
        scope: "file",
        files: ["main.tex"],
        action: "fix",
        selection: "\\begin{abstract}...",
      },
    };

    expect(request.context?.scope).toBe("file");
    expect(request.context?.action).toBe("fix");
    expect(request.context?.files).toEqual(["main.tex"]);
  });

  it("AiRequest without context defaults to project/chat", () => {
    const request: AiRequest = {
      tabId: "tab-1",
      projectPath: "/project",
      prompt: "Hello",
      messages: [],
    };

    expect(request.context).toBeUndefined();
    expect(request.model).toBeUndefined();
    expect(request.tabId).toBe("tab-1");
  });
});
