import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  FileTextIcon,
  ListChecksIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  bulkRenameDuplicateBibliographyEntries,
  duplicateCitationKeyError,
  type DuplicateBibliographyGroup,
  filterDuplicateBibliographyGroups,
  keepDuplicateBibliographyEntry,
  renameDuplicateBibliographyEntry,
  suggestDuplicateCitationKey,
} from "@/lib/duplicate-bibliography";
import type { ProjectReference } from "@/lib/project-references";

interface DuplicateBibliographyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: DuplicateBibliographyGroup[];
  existingKeys: string[];
  onOpenEntry: (entry: ProjectReference) => void;
  initialQuery?: string;
  initialRenameEntry?: ProjectReference | null;
  onSmartCleanup: () => void;
  smartCleanupAvailable: boolean;
  smartCleanupBusy: boolean;
}

export function DuplicateBibliographyDialog({
  open,
  onOpenChange,
  groups,
  existingKeys,
  onOpenEntry,
  initialQuery = "",
  initialRenameEntry = null,
  onSmartCleanup,
  smartCleanupAvailable,
  smartCleanupBusy,
}: DuplicateBibliographyDialogProps) {
  const [renaming, setRenaming] = useState<ProjectReference | null>(null);
  const [newKey, setNewKey] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const wasOpen = useRef(false);
  const filteredGroups = useMemo(
    () => filterDuplicateBibliographyGroups(groups, query),
    [groups, query],
  );
  const validationError = renaming
    ? duplicateCitationKeyError(newKey, renaming.key, existingKeys)
    : null;

  useEffect(() => {
    if (open && !wasOpen.current) {
      setQuery(initialQuery);
      setConfirmBulk(false);
      if (initialRenameEntry) {
        setRenaming(initialRenameEntry);
        setNewKey(
          suggestDuplicateCitationKey(initialRenameEntry.key, existingKeys),
        );
      } else {
        setRenaming(null);
        setNewKey("");
      }
    } else if (!open && wasOpen.current) {
      setRenaming(null);
      setNewKey("");
      setQuery("");
      setConfirmBulk(false);
    }
    wasOpen.current = open;
  }, [existingKeys, initialQuery, initialRenameEntry, open]);

  useEffect(() => {
    if (
      renaming &&
      !groups.some((group) =>
        group.entries.some((entry) => sameEntry(entry, renaming)),
      )
    ) {
      setRenaming(null);
      setNewKey("");
    }
  }, [groups, renaming]);

  const startRename = (entry: ProjectReference) => {
    setRenaming(entry);
    setNewKey(suggestDuplicateCitationKey(entry.key, existingKeys));
  };

  const renameEntry = async () => {
    if (!renaming || validationError) return;
    setBusy(true);
    try {
      if (
        !(await renameDuplicateBibliographyEntry(
          renaming,
          newKey,
          existingKeys,
        ))
      ) {
        toast.error("The bibliography changed before it could be updated");
      }
    } finally {
      setBusy(false);
    }
  };

  const keepEntry = async (
    group: DuplicateBibliographyGroup,
    entry: ProjectReference,
  ) => {
    setBusy(true);
    try {
      if (!(await keepDuplicateBibliographyEntry(group, entry))) {
        toast.error("The bibliography changed before it could be updated");
      }
    } finally {
      setBusy(false);
    }
  };

  const bulkFix = async () => {
    setBusy(true);
    try {
      if (
        !(await bulkRenameDuplicateBibliographyEntries(groups, existingKeys))
      ) {
        toast.error("No duplicate bibliography keys could be updated");
      }
      setConfirmBulk(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,52rem)] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="size-5 text-amber-600" />
            Fix duplicate bibliography keys
          </DialogTitle>
          <DialogDescription>
            Keep one copy when records describe the same source, or rename a
            specific copy when they are different. Renaming a copy does not
            rewrite citations because their intended record is ambiguous.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-y bg-muted/20 px-6 py-3">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 pr-8 pl-8 text-xs"
              placeholder="Search keys, titles, authors, years, or files"
              aria-label="Search duplicate bibliography keys"
            />
            {query && (
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setQuery("")}
                aria-label="Clear duplicate search"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Showing {filteredGroups.length} of {groups.length} duplicate{" "}
            {groups.length === 1 ? "key" : "keys"}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
          {groups.length === 0 ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
              <CheckIcon className="mx-auto size-5 text-emerald-600" />
              <p className="mt-1 font-medium text-sm">
                Duplicate keys resolved
              </p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No duplicate keys match “{query}”
            </div>
          ) : (
            filteredGroups.map((group) => (
              <section
                key={group.key}
                className="rounded-md border border-sidebar-border"
              >
                <div className="border-sidebar-border border-b bg-sidebar-accent/30 px-3 py-2">
                  <p className="font-medium text-xs">
                    <span className="font-mono">{group.key}</span>
                    <span className="ml-2 font-normal text-muted-foreground">
                      {group.entries.length} copies
                    </span>
                  </p>
                </div>
                <div className="divide-y divide-sidebar-border">
                  {group.entries.map((entry) => {
                    const isRenaming = renaming
                      ? sameEntry(entry, renaming)
                      : false;
                    return (
                      <div
                        key={`${entry.fileId}:${entry.from}`}
                        className="space-y-2 p-3"
                      >
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => onOpenEntry(entry)}
                        >
                          <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-xs">
                              {entry.title ?? entry.key}
                            </span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {[entry.author, entry.year, entry.filePath]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </button>

                        {isRenaming ? (
                          <form
                            className="rounded bg-sidebar-accent/30 p-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void renameEntry();
                            }}
                          >
                            <label
                              htmlFor={`duplicate-key-${entry.fileId}-${entry.from}`}
                              className="mb-1 block font-medium text-[10px]"
                            >
                              New key for this copy
                            </label>
                            <div className="flex gap-1.5">
                              <Input
                                id={`duplicate-key-${entry.fileId}-${entry.from}`}
                                value={newKey}
                                onChange={(event) =>
                                  setNewKey(event.target.value)
                                }
                                className="h-7 font-mono text-xs"
                                aria-invalid={!!validationError}
                                autoFocus
                              />
                              <Button
                                type="submit"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={busy || !!validationError}
                              >
                                Rename
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setRenaming(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                            <p
                              className={
                                validationError
                                  ? "mt-1 text-[10px] text-destructive"
                                  : "mt-1 text-[10px] text-muted-foreground"
                              }
                            >
                              {validationError ??
                                `Existing citations remain \\cite{${entry.key}}.`}
                            </p>
                          </form>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 pl-6">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => startRename(entry)}
                              disabled={busy}
                            >
                              <PencilIcon className="size-3" />
                              Rename this copy
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => void keepEntry(group, entry)}
                              disabled={busy}
                            >
                              <CheckIcon className="size-3" />
                              Keep this; remove others
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4 sm:justify-between">
          {confirmBulk && groups.length > 0 ? (
            <div className="flex w-full flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-[11px] leading-relaxed">
                The first listed copy keeps each original key.{" "}
                {groups.reduce(
                  (total, group) => total + group.entries.length - 1,
                  0,
                )}{" "}
                additional records will receive new keys; none will be deleted.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmBulk(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void bulkFix()}
                  disabled={busy}
                >
                  <ListChecksIcon className="size-4" />
                  Confirm bulk fix
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setConfirmBulk(true)}
                  disabled={groups.length === 0 || busy}
                >
                  <ListChecksIcon className="size-4" />
                  Bulk fix all
                </Button>
                <Button
                  variant="outline"
                  onClick={onSmartCleanup}
                  disabled={
                    groups.length === 0 ||
                    busy ||
                    !smartCleanupAvailable ||
                    smartCleanupBusy
                  }
                  title={
                    smartCleanupAvailable
                      ? "Ask AI to review duplicate records"
                      : "Connect an AI provider to use Smart cleanup"
                  }
                >
                  <SparklesIcon className="size-4" />
                  Smart cleanup
                </Button>
              </div>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {groups.length === 0 ? "Done" : "Close"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function sameEntry(left: ProjectReference, right: ProjectReference) {
  return (
    left.fileId === right.fileId &&
    left.from === right.from &&
    left.to === right.to &&
    left.source === right.source
  );
}
