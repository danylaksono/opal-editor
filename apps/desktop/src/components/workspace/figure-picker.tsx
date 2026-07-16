import { useEffect, useState } from "react";
import { ImagePlusIcon } from "lucide-react";
import { serializeFigure, type FigureDraft } from "@/lib/latex-figures";
import type { ProjectFile } from "@/stores/document-store";
import { FigureForm } from "./editor/figure-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EMPTY_FIGURE: FigureDraft = {
  path: "",
  caption: "",
  label: "",
  placement: "htbp",
  widthPercent: 100,
  centered: true,
};

interface FigurePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: ProjectFile[];
  onInsert: (source: string) => void;
  initialPath?: string;
}

export function FigurePicker({
  open,
  onOpenChange,
  files,
  onInsert,
  initialPath,
}: FigurePickerProps) {
  const [draft, setDraft] = useState<FigureDraft>(EMPTY_FIGURE);
  useEffect(() => {
    if (open && initialPath) setDraft({ ...EMPTY_FIGURE, path: initialPath });
  }, [initialPath, open]);
  const insert = () => {
    if (!draft.path) return;
    onInsert(serializeFigure(draft));
    setDraft(EMPTY_FIGURE);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ImagePlusIcon className="size-4 text-muted-foreground" />
            Insert figure
          </DialogTitle>
        </DialogHeader>
        <FigureForm value={draft} files={files} onChange={setDraft} />
        <div className="rounded-md bg-muted/50 px-2.5 py-2">
          <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
            Source preview
          </div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">
            {draft.path ? serializeFigure(draft) : "Choose an image to preview"}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!draft.path} onClick={insert}>
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
