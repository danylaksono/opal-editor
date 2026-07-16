import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  Link2Icon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  getReferenceStyleOptions,
  serializeReference,
  type LabelDefinition,
  type ReferenceCommand,
  type ReferenceDraft,
  type ReferenceMatch,
  type ReferencePackage,
} from "@/lib/latex-cross-references";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CrossReferenceInlineEditorProps {
  target: ReferenceMatch;
  labels: LabelDefinition[];
  referencePackage: ReferencePackage;
  position: { top: number; left: number };
  onApply: (draft: ReferenceDraft) => void;
  onDismiss: () => void;
}

function matchesLabel(label: LabelDefinition, query: string): boolean {
  if (!query.trim()) return true;
  const searchable = [label.key, label.context, label.kind, label.filePath]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((part) => searchable.includes(part));
}

export function CrossReferenceInlineEditor({
  target,
  labels,
  referencePackage,
  position,
  onApply,
  onDismiss,
}: CrossReferenceInlineEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [command, setCommand] = useState<ReferenceCommand>(target.command);
  const [key, setKey] = useState(target.key);
  const styleOptions = useMemo(
    () => getReferenceStyleOptions(referencePackage, command),
    [referencePackage, command],
  );
  const filteredLabels = useMemo(
    () => labels.filter((label) => matchesLabel(label, query)).slice(0, 10),
    [labels, query],
  );
  const keyExists = labels.some((label) => label.key === key);
  const draft: ReferenceDraft = { command, key, starred: target.starred };

  useEffect(() => searchRef.current?.focus(), []);
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        editorRef.current &&
        !editorRef.current.contains(event.target as Node)
      ) {
        onDismiss();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("keydown", handleKeyDown);
    }, 100);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  return (
    <div
      ref={editorRef}
      role="dialog"
      aria-label="Edit cross-reference"
      className="absolute z-40 flex max-h-[calc(100%-16px)] w-[420px] max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      style={position}
    >
      <div className="flex items-center justify-between border-border border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Link2Icon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">Edit cross-reference</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Close cross-reference editor"
          onClick={onDismiss}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <div className="space-y-3 overflow-y-auto p-3">
        <div className="space-y-1 text-muted-foreground text-xs">
          <span id="inline-reference-style-label">Reference style</span>
          <Select
            value={command}
            onValueChange={(value) => setCommand(value as ReferenceCommand)}
          >
            <SelectTrigger
              aria-labelledby="inline-reference-style-label"
              className="h-8! w-full text-xs"
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

        {!keyExists && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2.5 py-2 text-destructive text-xs">
            <AlertTriangleIcon className="size-3.5 shrink-0" />
            The label “{key}” was not found. Choose a replacement below.
          </div>
        )}

        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 pl-8 text-sm"
            placeholder="Search headings, captions, labels, or files"
          />
        </div>

        <div className="max-h-56 overflow-y-auto rounded-md border border-border p-1">
          {labels.length === 0 ? (
            <p className="px-2 py-6 text-center text-muted-foreground text-xs">
              No labels found in this project.
            </p>
          ) : filteredLabels.length === 0 ? (
            <p className="px-2 py-6 text-center text-muted-foreground text-xs">
              No matching labels
            </p>
          ) : (
            filteredLabels.map((label) => {
              const selected = label.key === key;
              return (
                <button
                  key={`${label.filePath}:${label.line}:${label.key}`}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/60",
                    selected && "bg-muted",
                  )}
                  onClick={() => setKey(label.key)}
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
                    <span className="block truncate font-medium text-xs">
                      {label.context}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {label.kind} · {label.key} · {label.filePath}:{label.line}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="rounded-md bg-muted/50 px-2.5 py-2">
          <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
            Source preview
          </div>
          <code className="block overflow-x-auto whitespace-nowrap text-xs">
            {serializeReference(draft)}
          </code>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-border border-t px-3 py-2">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Cancel
        </Button>
        <Button size="sm" disabled={!key} onClick={() => onApply(draft)}>
          Apply
        </Button>
      </div>
    </div>
  );
}
