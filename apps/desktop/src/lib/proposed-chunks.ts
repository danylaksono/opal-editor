import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import type { ProposedChange } from "@/stores/proposed-changes-store";

/**
 * Total number of diff chunks across all pending proposed changes — the
 * "N AI edits to review" count. Uses the same chunk builder as the editor's
 * unified merge view, so the count matches what the user steps through.
 */
export function countProposedChunks(changes: ProposedChange[]): number {
  let total = 0;
  for (const change of changes) {
    try {
      total += Chunk.build(
        Text.of(change.oldContent.split("\n")),
        Text.of(change.newContent.split("\n")),
      ).length;
    } catch {
      // A diff failure should never hide the review indicator entirely
      total += 1;
    }
  }
  return total;
}
