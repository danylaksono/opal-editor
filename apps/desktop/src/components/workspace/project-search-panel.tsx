import { useDeferredValue, useMemo, useState } from "react";
import {
  CaseSensitiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  RegexIcon,
  SearchIcon,
  WholeWordIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  searchProjectFiles,
  type ProjectSearchMatch,
} from "@/lib/project-search";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";

function MatchPreview({ match }: { match: ProjectSearchMatch }) {
  const before = match.lineText.slice(0, match.matchFromInLine);
  const value = match.lineText.slice(
    match.matchFromInLine,
    match.matchToInLine,
  );
  const after = match.lineText.slice(match.matchToInLine);
  return (
    <span className="block truncate font-mono text-[11px]">
      {before}
      <mark className="rounded-sm bg-primary/20 px-0.5 text-foreground">
        {value || "∅"}
      </mark>
      {after}
    </span>
  );
}

export function ProjectSearchPanel() {
  const files = useDocumentStore((state) => state.files);
  const setActiveFile = useDocumentStore((state) => state.setActiveFile);
  const requestJumpToPosition = useDocumentStore(
    (state) => state.requestJumpToPosition,
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  const result = useMemo(
    () =>
      searchProjectFiles(files, deferredQuery, {
        caseSensitive,
        wholeWord,
        useRegex,
      }),
    [caseSensitive, deferredQuery, files, useRegex, wholeWord],
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, ProjectSearchMatch[]>();
    for (const match of result.matches) {
      grouped.set(match.fileId, [...(grouped.get(match.fileId) ?? []), match]);
    }
    return Array.from(grouped.entries());
  }, [result.matches]);

  const openMatch = (match: ProjectSearchMatch) => {
    setActiveFile(match.fileId);
    requestJumpToPosition(match.from);
  };

  const toggleFile = (fileId: string) => {
    setCollapsedFiles((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-sidebar-border border-b px-3">
        <SearchIcon className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-xs">Search project</span>
        {result.matches.length > 0 && (
          <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] tabular-nums">
            {result.matches.length}
            {result.truncated ? "+" : ""}
          </span>
        )}
      </div>
      <div className="space-y-2 border-sidebar-border border-b p-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 pr-2 pl-8 text-xs"
            placeholder="Search all project files"
            aria-label="Search all project files"
            autoFocus
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-7", caseSensitive && "bg-sidebar-accent")}
            onClick={() => setCaseSensitive((value) => !value)}
            aria-pressed={caseSensitive}
            title="Match case"
          >
            <CaseSensitiveIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-7", wholeWord && "bg-sidebar-accent")}
            onClick={() => setWholeWord((value) => !value)}
            aria-pressed={wholeWord}
            title="Match whole word"
          >
            <WholeWordIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-7", useRegex && "bg-sidebar-accent")}
            onClick={() => setUseRegex((value) => !value)}
            aria-pressed={useRegex}
            title="Use regular expression"
          >
            <RegexIcon className="size-3.5" />
          </Button>
          <span className="ml-auto text-[10px] text-muted-foreground">
            Ctrl+Shift+F
          </span>
        </div>
        {result.error && (
          <p className="text-destructive text-xs" role="alert">
            {result.error}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {!deferredQuery ? (
          <div className="px-3 py-8 text-center text-muted-foreground text-xs">
            Search LaTeX, bibliography, style, and text files.
          </div>
        ) : !result.error && groups.length === 0 ? (
          <div className="px-3 py-8 text-center text-muted-foreground text-xs">
            No results found
          </div>
        ) : (
          groups.map(([fileId, matches]) => {
            const collapsed = collapsedFiles.has(fileId);
            return (
              <div key={fileId} className="mb-1">
                <button
                  type="button"
                  className="flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left hover:bg-sidebar-accent/60"
                  onClick={() => toggleFile(fileId)}
                  aria-expanded={!collapsed}
                >
                  {collapsed ? (
                    <ChevronRightIcon className="size-3" />
                  ) : (
                    <ChevronDownIcon className="size-3" />
                  )}
                  <FileTextIcon className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {matches[0].filePath}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {matches.length}
                  </span>
                </button>
                {!collapsed &&
                  matches.map((match) => (
                    <button
                      key={`${match.from}:${match.to}`}
                      type="button"
                      className="flex w-full items-start gap-2 rounded py-1.5 pr-2 pl-6 text-left hover:bg-sidebar-accent/50 focus-visible:bg-sidebar-accent"
                      onClick={() => openMatch(match)}
                    >
                      <span className="w-7 shrink-0 pt-px text-right text-[10px] text-muted-foreground tabular-nums">
                        {match.line}
                      </span>
                      <span className="min-w-0 flex-1">
                        <MatchPreview match={match} />
                      </span>
                    </button>
                  ))}
              </div>
            );
          })
        )}
        {result.truncated && (
          <p className="px-3 py-2 text-[10px] text-muted-foreground">
            Showing the first 500 results. Refine the query to see more.
          </p>
        )}
      </div>
    </div>
  );
}
