import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  BookMarkedIcon,
  CheckIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { parseBibEntries, parseBibItems, type BibCitation } from "@/lib/bibtex";
import {
  getCitationStyleOptions,
  serializeCitation,
  type CitationCommand,
  type CitationDraft,
  type CitationMatch,
  type CitationPackage,
} from "@/lib/latex-citations";
import type { ProjectFile } from "@/stores/document-store";
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

interface CitationInlineEditorProps {
  target: CitationMatch;
  position: { top: number; left: number };
  files: ProjectFile[];
  citationPackage: CitationPackage;
  onApply: (draft: CitationDraft) => void;
  onDismiss: () => void;
}

function getEntries(files: ProjectFile[]): BibCitation[] {
  return files.flatMap((file) => {
    if (!file.content) return [];
    if (file.name.toLowerCase().endsWith(".bib")) {
      return parseBibEntries(file.content, file.relativePath);
    }
    if (file.name.toLowerCase().endsWith(".tex")) {
      return parseBibItems(file.content, file.relativePath);
    }
    return [];
  });
}

function matchesEntry(entry: BibCitation, query: string): boolean {
  if (!query.trim()) return true;
  const searchable = [
    entry.key,
    entry.title,
    entry.author,
    entry.year,
    entry.journal,
    entry.booktitle,
    entry.publisher,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((part) => searchable.includes(part));
}

function entrySummary(entry: BibCitation): string {
  return [
    entry.author,
    entry.year,
    entry.journal ?? entry.booktitle ?? entry.publisher,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CitationInlineEditor({
  target,
  position,
  files,
  citationPackage,
  onApply,
  onDismiss,
}: CitationInlineEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => getEntries(files), [files]);
  const entryKeys = useMemo(
    () => new Set(entries.map((entry) => entry.key)),
    [entries],
  );
  const [query, setQuery] = useState("");
  const [command, setCommand] = useState<CitationCommand>(target.command);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(target.keys);
  const [prefix, setPrefix] = useState(target.prefix);
  const [locator, setLocator] = useState(target.locator);
  const styleOptions = useMemo(
    () => getCitationStyleOptions(citationPackage, command),
    [citationPackage, command],
  );
  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesEntry(entry, query)).slice(0, 8),
    [entries, query],
  );
  const draft: CitationDraft = {
    command,
    keys: selectedKeys,
    prefix,
    locator,
    starred: target.starred,
  };
  const packageLabel =
    citationPackage === "unknown" ? "LaTeX" : citationPackage;

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

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

  const toggleKey = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((selected) => selected !== key)
        : [...current, key],
    );
  };

  return (
    <div
      ref={editorRef}
      role="dialog"
      aria-label="Edit citation"
      className="absolute z-40 flex max-h-[calc(100%-16px)] w-[460px] max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      style={position}
    >
      <div className="flex items-center justify-between border-border border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <BookMarkedIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">Edit citation</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {packageLabel}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Close citation editor"
          onClick={onDismiss}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <div className="space-y-3 overflow-y-auto p-3">
        <div className="block space-y-1 text-muted-foreground text-xs">
          <span id="inline-citation-style-label">Citation style</span>
          <Select
            value={command}
            onValueChange={(value) => setCommand(value as CitationCommand)}
          >
            <SelectTrigger
              aria-labelledby="inline-citation-style-label"
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

        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">References</span>
          <div className="flex min-h-8 flex-wrap gap-1 rounded-md border border-border bg-muted/20 p-1.5">
            {selectedKeys.length === 0 && (
              <span className="px-1 py-0.5 text-muted-foreground text-xs">
                Choose at least one reference below
              </span>
            )}
            {selectedKeys.map((key) => {
              const missing = !entryKeys.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]",
                    missing && "bg-destructive/10 text-destructive",
                  )}
                  title={
                    missing
                      ? "This key is not present in a project .bib file"
                      : undefined
                  }
                  onClick={() => toggleKey(key)}
                >
                  {missing && <AlertTriangleIcon className="size-3" />}
                  {key}
                  <XIcon className="size-3" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 pl-8 text-sm"
              placeholder="Search title, author, year, or key"
            />
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-border p-1">
            {entries.length === 0 ? (
              <p className="px-2 py-5 text-center text-muted-foreground text-xs">
                No .bib entries found. Add a bibliography or import Zotero.
              </p>
            ) : filteredEntries.length === 0 ? (
              <p className="px-2 py-5 text-center text-muted-foreground text-xs">
                No matching references
              </p>
            ) : (
              filteredEntries.map((entry) => {
                const selected = selectedKeys.includes(entry.key);
                return (
                  <button
                    key={`${entry.filePath}:${entry.key}`}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/60",
                      selected && "bg-muted",
                    )}
                    onClick={() => toggleKey(entry.key)}
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
                        {entry.title ?? entry.key}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {entrySummary(entry)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1 text-muted-foreground text-xs">
            <label htmlFor="inline-citation-prefix">Prefix</label>
            <Input
              id="inline-citation-prefix"
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              className="h-8 text-sm"
              placeholder="e.g. see"
            />
          </div>
          <div className="space-y-1 text-muted-foreground text-xs">
            <label htmlFor="inline-citation-locator">Pages or chapter</label>
            <Input
              id="inline-citation-locator"
              value={locator}
              onChange={(event) => setLocator(event.target.value)}
              className="h-8 text-sm"
              placeholder="e.g. pp. 23--25"
            />
          </div>
        </div>

        <div className="rounded-md bg-muted/50 px-2.5 py-2">
          <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
            Source preview
          </div>
          <code className="block overflow-x-auto whitespace-nowrap text-xs">
            {serializeCitation(draft)}
          </code>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-border border-t px-3 py-2">
        <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={selectedKeys.length === 0}
          onClick={() => onApply(draft)}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
