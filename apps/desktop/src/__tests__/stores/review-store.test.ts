import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ReviewComment, useReviewStore } from "@/stores/review-store";

const savedComment: ReviewComment = {
  id: "review-1",
  documentRoot: "main.tex",
  body: "Clarify this sentence.",
  status: "open",
  anchor: {
    kind: "text",
    page: 2,
    x: 42,
    y: 100,
    width: 120,
    height: 18,
    selectedText: "A selected sentence",
    source: {
      file: "chapters/introduction.tex",
      line: 18,
      column: 4,
    },
  },
  createdAt: "2026-07-18T10:00:00.000Z",
  updatedAt: "2026-07-18T10:00:00.000Z",
};

describe("useReviewStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReviewStore.setState({
      projectRoot: null,
      comments: [],
      loading: false,
    });
  });

  it("loads valid project comments from the metadata file", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue(
      JSON.stringify({ version: 1, comments: [savedComment] }),
    );

    await useReviewStore.getState().loadProject("/project");

    expect(readTextFile).toHaveBeenCalledWith(
      "/project/.tectonic-editor/review-comments.json",
    );
    expect(useReviewStore.getState()).toMatchObject({
      projectRoot: "/project",
      comments: [savedComment],
      loading: false,
    });
  });

  it("treats missing or malformed metadata as an empty review", async () => {
    vi.mocked(exists).mockResolvedValueOnce(false);

    await useReviewStore.getState().loadProject("/empty");
    expect(useReviewStore.getState().comments).toEqual([]);

    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(readTextFile).mockResolvedValueOnce("{not json");

    await useReviewStore.getState().loadProject("/malformed");
    expect(useReviewStore.getState().comments).toEqual([]);
  });

  it("persists add, resolve, and delete operations in order", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeTextFile).mockResolvedValue(undefined);
    await useReviewStore.getState().loadProject("/project");

    const comment = useReviewStore.getState().addComment({
      documentRoot: "main.tex",
      body: "  Rework this paragraph.  ",
      anchor: savedComment.anchor,
    });
    expect(comment.body).toBe("Rework this paragraph.");
    expect(comment.status).toBe("open");

    useReviewStore.getState().setCommentStatus(comment.id, "resolved");
    expect(useReviewStore.getState().comments[0]?.status).toBe("resolved");

    useReviewStore.getState().deleteComment(comment.id);
    expect(useReviewStore.getState().comments).toEqual([]);

    await vi.waitFor(() => {
      expect(writeTextFile).toHaveBeenCalledTimes(3);
    });

    expect(mkdir).toHaveBeenCalledWith("/project/.tectonic-editor", {
      recursive: true,
    });
    expect(writeTextFile).toHaveBeenLastCalledWith(
      "/project/.tectonic-editor/review-comments.json",
      JSON.stringify({ version: 1, comments: [] }, null, 2),
    );
  });
});
