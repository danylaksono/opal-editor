import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  CircleIcon,
  FileTextIcon,
  LoaderIcon,
  MessageSquareIcon,
  Trash2Icon,
} from "lucide-react";
import type { ReviewAnchor, ReviewComment } from "@/stores/review-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ReviewCommentsPanelProps {
  comments: ReviewComment[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (comment: ReviewComment) => void;
  onGoToSource: (comment: ReviewComment) => void;
  onSetStatus: (
    comment: ReviewComment,
    status: ReviewComment["status"],
  ) => void;
  onDelete: (comment: ReviewComment) => void;
}

export function ReviewCommentsPanel({
  comments,
  loading,
  selectedId,
  onSelect,
  onGoToSource,
  onSetStatus,
  onDelete,
}: ReviewCommentsPanelProps) {
  const [showResolved, setShowResolved] = useState(false);
  const visibleComments = useMemo(
    () =>
      comments
        .filter((comment) => showResolved || comment.status === "open")
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "open" ? -1 : 1;
          return a.anchor.page - b.anchor.page;
        }),
    [comments, showResolved],
  );
  const openCount = comments.filter(
    (comment) => comment.status === "open",
  ).length;

  return (
    <aside
      className="flex h-full w-80 shrink-0 flex-col border-border border-l bg-background"
      aria-label="Review comments"
    >
      <div className="flex h-[calc(44px+var(--titlebar-height))] shrink-0 items-end justify-between border-border border-b px-3 pb-2">
        <div>
          <h2 className="font-medium text-sm">Review comments</h2>
          <p className="text-muted-foreground text-xs">
            {openCount} open · {comments.length} total
          </p>
        </div>
        <Button
          variant={showResolved ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setShowResolved((value) => !value)}
        >
          {showResolved ? "Hide resolved" : "Show resolved"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
            <LoaderIcon className="size-4 animate-spin" />
            Loading comments…
          </div>
        ) : visibleComments.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <MessageSquareIcon className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="font-medium text-sm">
              {comments.length === 0
                ? "No review comments"
                : "No open comments"}
            </p>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
              Select text in the PDF or right-click a location to add one.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleComments.map((comment) => (
              <article
                key={comment.id}
                className={cn(
                  "rounded-lg border bg-card p-3 transition-colors",
                  selectedId === comment.id
                    ? "border-primary/60 ring-2 ring-primary/15"
                    : "hover:border-foreground/20",
                  comment.status === "resolved" && "opacity-65",
                )}
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => onSelect(comment)}
                >
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground text-xs">
                    {comment.status === "resolved" ? (
                      <CheckCircle2Icon className="size-3.5 text-emerald-600" />
                    ) : (
                      <CircleIcon className="size-3.5" />
                    )}
                    <span>Page {comment.anchor.page}</span>
                    {comment.anchor.source && (
                      <span className="min-w-0 flex-1 truncate text-right font-mono">
                        {comment.anchor.source.file}:
                        {comment.anchor.source.line}
                      </span>
                    )}
                  </div>
                  {comment.anchor.selectedText && (
                    <blockquote className="mb-2 line-clamp-3 border-muted-foreground/30 border-l-2 pl-2 text-muted-foreground text-xs">
                      {comment.anchor.selectedText}
                    </blockquote>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {comment.body}
                  </p>
                </button>

                <div className="mt-3 flex items-center gap-1 border-border border-t pt-2">
                  {comment.anchor.source && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => onGoToSource(comment)}
                    >
                      <FileTextIcon className="size-3.5" />
                      Source
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      onSetStatus(
                        comment,
                        comment.status === "open" ? "resolved" : "open",
                      )
                    }
                  >
                    {comment.status === "open" ? "Resolve" : "Reopen"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7 text-muted-foreground hover:text-destructive"
                    aria-label="Delete comment"
                    onClick={() => onDelete(comment)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export interface ReviewCommentDraft {
  anchor: ReviewAnchor;
  documentRoot: string;
}

interface ReviewCommentDialogProps {
  draft: ReviewCommentDraft | null;
  onOpenChange: (open: boolean) => void;
  onSave: (body: string) => void;
}

export function ReviewCommentDialog({
  draft,
  onOpenChange,
  onSave,
}: ReviewCommentDialogProps) {
  const [body, setBody] = useState("");

  useEffect(() => {
    if (draft) setBody("");
  }, [draft]);

  return (
    <Dialog open={!!draft} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add review comment</DialogTitle>
        </DialogHeader>
        {draft?.anchor.selectedText && (
          <blockquote className="max-h-28 overflow-y-auto border-muted-foreground/30 border-l-2 pl-3 text-muted-foreground text-sm">
            {draft.anchor.selectedText}
          </blockquote>
        )}
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What should be changed or checked?"
          className="min-h-28 resize-y"
          autoFocus
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              body.trim()
            ) {
              event.preventDefault();
              onSave(body.trim());
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!body.trim()} onClick={() => onSave(body.trim())}>
            Add comment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
