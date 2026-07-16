import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useHistoryStore } from "@/stores/history-store";

export interface ProjectTextEdit {
  fileId: string;
  from: number;
  to: number;
  expected: string;
  insert: string;
}

export interface ProjectEditTransaction {
  id: string;
  label: string;
  edits: ProjectTextEdit[];
}

function applyEdits(content: string, edits: ProjectTextEdit[]): string {
  let output = content;
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    output = `${output.slice(0, edit.from)}${edit.insert}${output.slice(edit.to)}`;
  }
  return output;
}

export async function applyProjectEditTransaction(
  transaction: ProjectEditTransaction,
): Promise<boolean> {
  const state = useDocumentStore.getState();
  const grouped = new Map<string, ProjectTextEdit[]>();
  for (const edit of transaction.edits) {
    grouped.set(edit.fileId, [...(grouped.get(edit.fileId) ?? []), edit]);
  }
  for (const [fileId, edits] of grouped) {
    const file = state.files.find((candidate) => candidate.id === fileId);
    if (file?.content === undefined) return false;
    for (const edit of edits) {
      if (file.content.slice(edit.from, edit.to) !== edit.expected)
        return false;
    }
    const ordered = [...edits].sort((a, b) => a.from - b.from);
    if (
      ordered.some(
        (edit, index) => index > 0 && ordered[index - 1].to > edit.from,
      )
    )
      return false;
  }

  if (state.projectRoot) {
    await useHistoryStore
      .getState()
      .createSnapshot(
        state.projectRoot,
        `[semantic] Before ${transaction.label}`,
      )
      .catch(() => null);
  }

  const inverse: ProjectTextEdit[] = [];
  const originals = new Map<string, string>();
  try {
    for (const [fileId, edits] of grouped) {
      const file = useDocumentStore
        .getState()
        .files.find((candidate) => candidate.id === fileId)!;
      originals.set(fileId, file.content ?? "");
      const next = applyEdits(file.content ?? "", edits);
      useDocumentStore.getState().updateFileContent(fileId, next);
      let cumulativeDelta = 0;
      for (const edit of [...edits].sort((a, b) => a.from - b.from)) {
        const finalFrom = edit.from + cumulativeDelta;
        inverse.push({
          fileId,
          from: finalFrom,
          to: finalFrom + edit.insert.length,
          expected: edit.insert,
          insert: edit.expected,
        });
        cumulativeDelta += edit.insert.length - (edit.to - edit.from);
      }
    }
  } catch {
    for (const [fileId, content] of originals)
      useDocumentStore.getState().updateFileContent(fileId, content);
    return false;
  }

  toast.success(transaction.label, {
    action: {
      label: "Undo",
      onClick: () => {
        void applyProjectEditTransaction({
          id: `${transaction.id}:undo`,
          label: `Undo ${transaction.label}`,
          edits: inverse,
        });
      },
    },
    duration: 10_000,
  });
  return true;
}
