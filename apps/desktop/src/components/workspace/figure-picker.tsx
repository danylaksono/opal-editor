import { useEffect, useState } from "react";
import { ImagePlusIcon } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { serializeFigure, type FigureDraft } from "@/lib/latex-figures";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
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
  const [importingImage, setImportingImage] = useState(false);
  const importFiles = useDocumentStore((state) => state.importFiles);
  useEffect(() => {
    if (open && initialPath) setDraft({ ...EMPTY_FIGURE, path: initialPath });
  }, [initialPath, open]);
  const importImage = async () => {
    const selected = await openDialog({
      multiple: false,
      title: "Import image into figures",
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"],
        },
      ],
    });
    if (typeof selected !== "string") return;
    setImportingImage(true);
    try {
      const [path] = await importFiles([selected], "figures");
      if (!path) throw new Error("The image could not be imported");
      setDraft((current) => ({ ...current, path }));
      toast.success(`Imported ${path}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setImportingImage(false);
    }
  };
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
        <FigureForm
          value={draft}
          files={files}
          onChange={setDraft}
          onImportImage={() => void importImage()}
          importingImage={importingImage}
        />
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
