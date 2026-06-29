import { useMemo, useState } from "react";
import {
  BookMarkedIcon,
  CheckIcon,
  FileTextIcon,
  SearchIcon,
} from "lucide-react";
import type { ProjectFile } from "@/stores/document-store";
import { parseBibEntries, type BibCitation } from "@/lib/bibtex";
import { cn } from "@/lib/utils";
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

const CITATION_COMMANDS = [
  { value: "cite", label: "\\cite" },
  { value: "parencite", label: "\\parencite" },
  { value: "textcite", label: "\\textcite" },
  { value: "citep", label: "\\citep" },
  { value: "citet", label: "\\citet" },
];

interface CitationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: ProjectFile[];
  onInsert: (command: string, citekeys: string[]) => void;
}

function getCitationEntries(files: ProjectFile[]) {
  return files
    .filter((file) => file.name.toLowerCase().endsWith(".bib") && file.content)
    .flatMap((file) => parseBibEntries(file.content ?? "", file.relativePath));
}

function entrySource(entry: BibCitation) {
  return entry.journal ?? entry.booktitle ?? entry.publisher ?? entry.filePath;
}

function matchesEntry(entry: BibCitation, query: string) {
  if (!query.trim()) return true;
  const haystack = [
    entry.key,
    entry.title,
    entry.author,
    entry.year,
    entry.journal,
    entry.booktitle,
    entry.publisher,
    entry.filePath,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((part) => haystack.includes(part));
}

export function CitationPicker({
  open,
  onOpenChange,
  files,
  onInsert,
}: CitationPickerProps) {
  const [query, setQuery] = useState("");
  const [command, setCommand] = useState("cite");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const entries = useMemo(() => getCitationEntries(files), [files]);
  const filtered = useMemo(
    () => entries.filter((entry) => matchesEntry(entry, query)).slice(0, 80),
    [entries, query],
  );

  const toggleKey = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const insertSelection = (keys = selectedKeys) => {
    if (keys.length === 0) return;
    onInsert(command, keys);
    setQuery("");
    setSelectedKeys([]);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setSelectedKeys([]);
      }}
    >
      <DialogContent className="gap-3 p-0 sm:max-w-2xl">
        <DialogHeader className="border-border border-b px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <BookMarkedIcon className="size-4 text-muted-foreground" />
            Insert Citation
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (selectedKeys.length > 0) insertSelection();
                  else if (filtered[0]) insertSelection([filtered[0].key]);
                }
              }}
              className="h-8 pl-8 text-sm"
              placeholder="Search title, author, year, or key"
              autoFocus
            />
          </div>
          <Select value={command} onValueChange={setCommand}>
            <SelectTrigger size="sm" className="h-8! w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CITATION_COMMANDS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-80 overflow-hidden px-2">
          {entries.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
              <FileTextIcon className="size-8 text-muted-foreground/60" />
              <div className="font-medium text-sm">No bibliography found</div>
              <p className="max-w-xs text-muted-foreground text-xs leading-relaxed">
                Add a .bib file or import a Zotero collection to search and
                insert citations from the editor.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-muted-foreground text-sm">
              No matching citations
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto py-1">
              {filtered.map((entry) => {
                const selected = selectedKeys.includes(entry.key);
                return (
                  <button
                    key={`${entry.filePath}:${entry.key}`}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60",
                      selected && "bg-muted",
                    )}
                    onClick={() => toggleKey(entry.key)}
                    onDoubleClick={() => insertSelection([entry.key])}
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
                        {entry.title ?? entry.key}
                      </span>
                      <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                        {[entry.author, entry.year, entrySource(entry)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="max-w-32 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {entry.key}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-border border-t px-4 py-3">
          <span className="text-muted-foreground text-xs">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
            {selectedKeys.length > 0 && ` · ${selectedKeys.length} selected`}
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
              disabled={selectedKeys.length === 0}
              onClick={() => insertSelection()}
            >
              Insert
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
