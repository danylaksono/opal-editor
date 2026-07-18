import { type FC, useMemo } from "react";
import { Check, ShieldCheckIcon, TriangleAlertIcon, X } from "lucide-react";
import { type ProposedChange } from "@/stores/proposed-changes-store";
import { findUnverifiedBibAdditions } from "@/lib/citation-review";
import { cn } from "@/lib/utils";

interface ProposedChangesPanelProps {
  change: ProposedChange;
  changeIndex: number;
  totalChanges: number;
  onKeep: () => void;
  onUndo: () => void;
}

export const ProposedChangesPanel: FC<ProposedChangesPanelProps> = ({
  change,
  changeIndex,
  totalChanges,
  onKeep,
  onUndo,
}) => {
  const oldLines = change.oldContent.split("\n").length;
  const newLines = change.newContent.split("\n").length;
  const added = Math.max(0, newLines - oldLines);
  const removed = Math.max(0, oldLines - newLines);

  const unverifiedKeys = useMemo(
    () => findUnverifiedBibAdditions(change),
    [change],
  );
  const isVerifiedCitation =
    change.toolName === "add_citation" && unverifiedKeys.length === 0;
  const keepAllBlocked = unverifiedKeys.length > 0;

  return (
    <div className="flex items-center justify-between border-border border-t bg-muted/50 px-3 py-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">Proposed Changes</span>
        {totalChanges > 1 && (
          <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-medium text-violet-600 text-xs dark:text-violet-400">
            {changeIndex + 1}/{totalChanges} files
          </span>
        )}
        <span className="text-muted-foreground">{change.filePath}</span>
        {isVerifiedCitation ? (
          <span
            className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-700 text-xs dark:text-emerald-400"
            title="This reference was built from the resolver's publication record (Crossref/arXiv/Open Library), not from the AI's memory."
          >
            <ShieldCheckIcon className="size-3" />
            resolver-verified reference
          </span>
        ) : (
          <span className="text-muted-foreground">{change.toolName}</span>
        )}
        {unverifiedKeys.length > 0 && (
          <span
            className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 text-xs dark:text-amber-400"
            title={`Bibliography entries not built by the reference resolver — they may be inaccurate or fabricated. Review each individually: ${unverifiedKeys.join(", ")}`}
          >
            <TriangleAlertIcon className="size-3" />
            {unverifiedKeys.length} unverified reference
            {unverifiedKeys.length === 1 ? "" : "s"}
          </span>
        )}
        {added > 0 && <span className="text-green-400">+{added}</span>}
        {removed > 0 && <span className="text-red-400">-{removed}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onKeep}
          disabled={keepAllBlocked}
          title={
            keepAllBlocked
              ? "Blocked: unverified bibliography entries must be accepted chunk by chunk"
              : undefined
          }
          className={cn(
            "flex items-center gap-1 rounded-md bg-green-600/20 px-2.5 py-1 text-green-400 text-xs transition-colors hover:bg-green-600/30",
            keepAllBlocked &&
              "cursor-not-allowed opacity-40 hover:bg-green-600/20",
          )}
        >
          <Check className="size-3.5" />
          Keep All
          <kbd className="ml-1 rounded bg-green-600/20 px-1 py-0.5 font-mono text-[10px]">
            ⌘Y
          </kbd>
        </button>
        <button
          onClick={onUndo}
          className="flex items-center gap-1 rounded-md bg-red-600/20 px-2.5 py-1 text-red-400 text-xs transition-colors hover:bg-red-600/30"
        >
          <X className="size-3.5" />
          Undo All
          <kbd className="ml-1 rounded bg-red-600/20 px-1 py-0.5 font-mono text-[10px]">
            ⌘N
          </kbd>
        </button>
      </div>
    </div>
  );
};
