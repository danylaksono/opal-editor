import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { create } from "zustand";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("review");
const REVIEW_FILE_VERSION = 1;

export interface ReviewSourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface ReviewAnchor {
  kind: "text" | "point";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  selectedText?: string;
  source?: ReviewSourceLocation;
}

export interface ReviewComment {
  id: string;
  documentRoot: string;
  body: string;
  status: "open" | "resolved";
  anchor: ReviewAnchor;
  createdAt: string;
  updatedAt: string;
}

interface ReviewFile {
  version: number;
  comments: ReviewComment[];
}

interface AddReviewCommentInput {
  documentRoot: string;
  body: string;
  anchor: ReviewAnchor;
}

interface ReviewState {
  projectRoot: string | null;
  comments: ReviewComment[];
  loading: boolean;
  loadProject: (projectRoot: string) => Promise<void>;
  clearProject: () => void;
  addComment: (input: AddReviewCommentInput) => ReviewComment;
  setCommentStatus: (id: string, status: ReviewComment["status"]) => void;
  deleteComment: (id: string) => void;
}

let writeQueue: Promise<void> = Promise.resolve();

function isReviewComment(value: unknown): value is ReviewComment {
  if (!value || typeof value !== "object") return false;
  const comment = value as Partial<ReviewComment>;
  const anchor = comment.anchor as Partial<ReviewAnchor> | undefined;
  return (
    typeof comment.id === "string" &&
    typeof comment.documentRoot === "string" &&
    typeof comment.body === "string" &&
    (comment.status === "open" || comment.status === "resolved") &&
    typeof comment.createdAt === "string" &&
    typeof comment.updatedAt === "string" &&
    !!anchor &&
    (anchor.kind === "text" || anchor.kind === "point") &&
    typeof anchor.page === "number" &&
    typeof anchor.x === "number" &&
    typeof anchor.y === "number" &&
    typeof anchor.width === "number" &&
    typeof anchor.height === "number"
  );
}

function parseReviewFile(value: string): ReviewComment[] {
  try {
    const parsed = JSON.parse(value) as Partial<ReviewFile>;
    if (
      parsed.version !== REVIEW_FILE_VERSION ||
      !Array.isArray(parsed.comments)
    ) {
      return [];
    }
    return parsed.comments.filter(isReviewComment);
  } catch {
    return [];
  }
}

async function reviewFilePath(projectRoot: string): Promise<{
  directory: string;
  file: string;
}> {
  const directory = await join(projectRoot, ".tectonic-editor");
  return {
    directory,
    file: await join(directory, "review-comments.json"),
  };
}

function persistComments(projectRoot: string, comments: ReviewComment[]): void {
  const snapshot: ReviewFile = {
    version: REVIEW_FILE_VERSION,
    comments,
  };
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const path = await reviewFilePath(projectRoot);
      await mkdir(path.directory, { recursive: true });
      await writeTextFile(path.file, JSON.stringify(snapshot, null, 2));
    })
    .catch((error) => {
      log.error("Failed to save review comments", { error: String(error) });
    });
}

function createCommentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `review-${Date.now()}`;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  projectRoot: null,
  comments: [],
  loading: false,

  loadProject: async (projectRoot) => {
    set({ projectRoot, comments: [], loading: true });
    try {
      const path = await reviewFilePath(projectRoot);
      const comments = (await exists(path.file))
        ? parseReviewFile(await readTextFile(path.file))
        : [];
      if (get().projectRoot === projectRoot) {
        set({ comments, loading: false });
      }
    } catch (error) {
      log.error("Failed to load review comments", { error: String(error) });
      if (get().projectRoot === projectRoot) {
        set({ comments: [], loading: false });
      }
    }
  },

  clearProject: () => set({ projectRoot: null, comments: [], loading: false }),

  addComment: (input) => {
    const now = new Date().toISOString();
    const comment: ReviewComment = {
      id: createCommentId(),
      documentRoot: input.documentRoot,
      body: input.body.trim(),
      status: "open",
      anchor: input.anchor,
      createdAt: now,
      updatedAt: now,
    };
    const comments = [...get().comments, comment];
    set({ comments });
    const projectRoot = get().projectRoot;
    if (projectRoot) persistComments(projectRoot, comments);
    return comment;
  },

  setCommentStatus: (id, status) => {
    const comments = get().comments.map((comment) =>
      comment.id === id
        ? { ...comment, status, updatedAt: new Date().toISOString() }
        : comment,
    );
    set({ comments });
    const projectRoot = get().projectRoot;
    if (projectRoot) persistComments(projectRoot, comments);
  },

  deleteComment: (id) => {
    const comments = get().comments.filter((comment) => comment.id !== id);
    set({ comments });
    const projectRoot = get().projectRoot;
    if (projectRoot) persistComments(projectRoot, comments);
  },
}));
