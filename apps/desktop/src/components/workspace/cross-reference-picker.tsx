import { useEffect, useMemo, useState } from "react";
import { BookOpenIcon, CheckIcon, HashIcon, SearchIcon } from "lucide-react";
import {
  detectReferencePackage,
  findLabelDefinitions,
  getDefaultReferenceCommand,
  getReferenceStyleOptions,
  type LabelDefinition,
  type ReferenceCommand,
  type ReferenceDraft,
} from "@/lib/latex-cross-references";
import type { ProjectFile } from "@/stores/document-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CrossReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: ProjectFile[];
  onInsert: (reference: ReferenceDraft) => void;
}

function matchesLabel(label: LabelDefinition, query: string): boolean {
  if (!query.trim()) return true;
  const searchable = [
    label.key,
    label.context,
    label.kind,
    label.filePath,
    label.line,
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((part) => searchable.includes(part));
}

export function CrossReferencePicker({
  open,
  onOpenChange,
  files,
  onInsert,
}: CrossReferencePickerProps) {
  const texFiles = useMemo(
    () =>
      files
        .filter((file) => file.name.toLowerCase().endsWith(".tex"))
        .map((file) => ({
          filePath: file.relativePath,
          content: file.content ?? "",
        })),
    [files],
  );
  const labels = useMemo(() => findLabelDefinitions(texFiles), [texFiles]);
  const referencePackage = useMemo(
    () => detectReferencePackage(texFiles.map((file) => file.content)),
    [texFiles],
  );
  const styleOptions = useMemo(
    () => getReferenceStyleOptions(referencePackage),
    [referencePackage],
  );
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [command, setCommand] = useState<ReferenceCommand>(
    getDefaultReferenceCommand(referencePackage),
  );
  const filteredLabels = useMemo(
    () => labels.filter((label) => matchesLabel(label, query)).slice(0, 100),
    [labels, query],
  );

  useEffect(() => {
    if (open) setCommand(getDefaultReferenceCommand(referencePackage));
  }, [open, referencePackage]);

  const insertReference = (key = selectedKey) => {
    if (!key) return;
    onInsert({ command, key });
    setQuery("");
    setSelectedKey("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setQuery("");
          setSelectedKey("");
        }
      }}
    >
      <DialogContent className="gap-3 p-0 sm:max-w-2xl">
        <DialogHeader className="border-border border-b px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <BookOpenIcon className="size-4 text-muted-foreground" />
            Insert cross-reference
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                insertReference(selectedKey || filteredLabels[0]?.key);
              }}
              className="h-8 pl-8 text-sm"
              placeholder="Search label, heading, caption, or file"
              autoFocus
            />
          </div>
          <Select
            value={command}
            onValueChange={(value) => setCommand(value as ReferenceCommand)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Reference style"
              className="h-8! w-52 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {styleOptions.map((style) => (
                <SelectItem key={style.command} value={style.command}>
                  {style.label} — {style.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-80 overflow-hidden px-2">
          {labels.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
              <HashIcon className="size-8 text-muted-foreground/60" />
              <div className="font-medium text-sm">No labels found</div>
              <p className="max-w-xs text-muted-foreground text-xs leading-relaxed">
                Add a label such as \label&#123;sec:introduction&#125; to a
                section, figure, table, or equation.
              </p>
            </div>
          ) : filteredLabels.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-muted-foreground text-sm">
              No matching labels
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto py-1">
              {filteredLabels.map((label) => {
                const selected = selectedKey === label.key;
                return (
                  <button
                    key={`${label.filePath}:${label.line}:${label.key}`}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60",
                      selected && "bg-muted",
                    )}
                    onClick={() => setSelectedKey(label.key)}
                    onDoubleClick={() => insertReference(label.key)}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-border",
                        selected &&
                          "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {selected && <CheckIcon className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-sm">
                        {label.context}
                      </span>
                      <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                        {label.kind} · {label.filePath}:{label.line}
                      </span>
                    </span>
                    <span className="max-w-40 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {label.key}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-border border-t px-4 py-3">
          <span className="text-muted-foreground text-xs">
            {labels.length} {labels.length === 1 ? "label" : "labels"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selectedKey}
              onClick={() => insertReference()}
            >
              Insert
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
