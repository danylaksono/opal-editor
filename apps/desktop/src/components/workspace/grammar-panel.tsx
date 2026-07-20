import {
  BookTypeIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PlayIcon,
  SpellCheckIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocumentStore } from "@/stores/document-store";
import { useGrammarStore } from "@/stores/grammar-store";
import { cn } from "@/lib/utils";
import type { GrammarIssue } from "@/lib/language-tool";

/** Issue color by LanguageTool issue type: spelling red, grammar amber,
 *  style/typography blue. */
function issueAccent(issueType: string): string {
  if (issueType === "misspelling") return "text-red-500";
  if (issueType === "grammar") return "text-amber-500";
  return "text-sky-500";
}

function IssueCard({ issue }: { issue: GrammarIssue }) {
  const dismiss = useGrammarStore((s) => s.dismiss);
  const applyReplacement = useGrammarStore((s) => s.applyReplacement);
  const checkedFileId = useGrammarStore((s) => s.checkedFileId);

  const jump = () => {
    if (!checkedFileId) return;
    useDocumentStore.getState().setActiveFile(checkedFileId);
    setTimeout(
      () => useDocumentStore.getState().requestJumpToPosition(issue.start),
      0,
    );
  };

  return (
    <div className="group rounded-md border bg-background p-2">
      <div className="flex items-start gap-2">
        <SpellCheckIcon
          className={cn(
            "mt-0.5 size-3.5 shrink-0",
            issueAccent(issue.issueType),
          )}
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={jump}
          title="Jump to text"
        >
          <div className="text-xs">
            <span className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              {issue.excerpt.length > 40
                ? `${issue.excerpt.slice(0, 40)}…`
                : issue.excerpt}
            </span>
          </div>
          <div className="mt-1 text-muted-foreground text-xs leading-snug">
            {issue.message}
          </div>
        </button>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
          onClick={() => dismiss(issue.id)}
          title="Dismiss"
          aria-label={`Dismiss: ${issue.message}`}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      {issue.replacements.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
          {issue.replacements.slice(0, 3).map((value) => (
            <button
              key={value}
              type="button"
              className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-medium text-primary text-xs transition-colors hover:bg-primary/15"
              onClick={() => applyReplacement(issue.id, value)}
              title={`Replace with "${value}"`}
            >
              {value === "" ? "Remove" : value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GrammarPanel() {
  const issues = useGrammarStore((s) => s.issues);
  const isChecking = useGrammarStore((s) => s.isChecking);
  const error = useGrammarStore((s) => s.error);
  const checkedAt = useGrammarStore((s) => s.checkedAt);
  const checkedFileId = useGrammarStore((s) => s.checkedFileId);
  const check = useGrammarStore((s) => s.check);
  const activeFileName = useDocumentStore(
    (s) => s.files.find((f) => f.id === s.activeFileId)?.relativePath,
  );
  const checkedFileName = useDocumentStore(
    (s) => s.files.find((f) => f.id === checkedFileId)?.relativePath,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-sidebar-border border-b px-3">
        <BookTypeIcon className="size-4" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-xs">Grammar</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {isChecking
              ? "Checking…"
              : checkedAt
                ? `${issues.length} ${issues.length === 1 ? "issue" : "issues"} in ${checkedFileName ?? "file"}`
                : "LanguageTool"}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-6 shrink-0 gap-1 px-2 text-xs"
          onClick={check}
          disabled={isChecking}
        >
          {isChecking ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <PlayIcon className="size-3" />
          )}
          Check
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive text-xs leading-snug">
            {error}
          </div>
        )}
        {!error && !checkedAt && !isChecking && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <BookTypeIcon className="size-6 text-muted-foreground/40" />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Check the grammar and spelling of{" "}
              {activeFileName ? (
                <span className="font-medium">{activeFileName}</span>
              ) : (
                "the open file"
              )}{" "}
              with LanguageTool. Math, commands, and citations are skipped.
            </p>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              Uses the server configured in Settings — the public LanguageTool
              API by default, or a local server for offline checking.
            </p>
          </div>
        )}
        {!error && checkedAt && issues.length === 0 && !isChecking && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <CheckCircle2Icon className="size-6 text-emerald-500" />
            <p className="text-muted-foreground text-xs">
              No issues found in {checkedFileName ?? "the checked file"}.
            </p>
          </div>
        )}
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
}
