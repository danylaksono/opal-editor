import { useEffect, useRef, useState } from "react";
import { ImageIcon, XIcon } from "lucide-react";
import {
  updateFigureSource,
  type FigureDraft,
  type FigureMatch,
} from "@/lib/latex-figures";
import type { ProjectFile } from "@/stores/document-store";
import { Button } from "@/components/ui/button";
import { FigureForm } from "./figure-form";

interface FigureInlineEditorProps {
  target: FigureMatch;
  files: ProjectFile[];
  position: { top: number; left: number };
  onApply: (source: string) => void;
  onDismiss: () => void;
}

export function FigureInlineEditor({
  target,
  files,
  position,
  onApply,
  onDismiss,
}: FigureInlineEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<FigureDraft>({
    path: target.path,
    caption: target.caption,
    label: target.label,
    placement: target.placement,
    widthPercent: target.widthPercent,
    centered: target.centered,
  });

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
      aria-label="Edit figure"
      className="absolute z-40 flex max-h-[calc(100%-16px)] w-[480px] max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      style={position}
    >
      <div className="flex items-center justify-between border-border border-b px-3 py-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <ImageIcon className="size-4 text-muted-foreground" />
          Edit figure
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Close figure editor"
          onClick={onDismiss}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="overflow-y-auto p-3">
        <FigureForm value={draft} files={files} onChange={setDraft} />
      </div>
      <div className="flex justify-end gap-2 border-border border-t px-3 py-2">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!draft.path}
          onClick={() => onApply(updateFigureSource(target, draft))}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
