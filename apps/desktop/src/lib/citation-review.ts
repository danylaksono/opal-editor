import { findBibEntries } from "@/lib/bibtex-entries";
import type { ProposedChange } from "@/stores/proposed-changes-store";

/** Citation keys that a proposed change would add to a .bib file. */
export function findAddedBibKeys(change: ProposedChange): string[] {
  if (!change.filePath.toLowerCase().endsWith(".bib")) return [];
  const oldKeys = new Set(findBibEntries(change.oldContent).map((e) => e.key));
  return findBibEntries(change.newContent)
    .map((e) => e.key)
    .filter((key) => !oldKeys.has(key));
}

/**
 * Bibliography entries added WITHOUT the resolver (i.e. not via add_citation).
 * These may be fabricated and must be reviewed individually — bulk "Keep All"
 * is blocked while any are present.
 *
 * Conservative on stacked merges: if a later propose_edit merges into an
 * add_citation change, the whole change is treated as unverified.
 */
export function findUnverifiedBibAdditions(change: ProposedChange): string[] {
  if (change.toolName === "add_citation") return [];
  return findAddedBibKeys(change);
}
