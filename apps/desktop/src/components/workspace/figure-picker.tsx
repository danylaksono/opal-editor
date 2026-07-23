import { useEffect, useState } from "react";
import { ImagePlusIcon, Loader2Icon } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { serializeFigure, type FigureDraft } from "@/lib/latex-figures";
import {
  clipboardImageFile,
  defaultPastedImageName,
  fileToBytes,
  sanitizePastedImageName,
} from "@/lib/pasted-image";
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
  /** Clipboard image pasted into the editor, held in memory and written to
   *  figures/ only when the user confirms Insert. */
  pendingImage?: File;
  onDiscardPending?: () => void;
}

export function FigurePicker({
  open,
  onOpenChange,
  files,
  onInsert,
  initialPath,
  pendingImage,
  onDiscardPending,
}: FigurePickerProps) {
  const [draft, setDraft] = useState<FigureDraft>(EMPTY_FIGURE);
  const [importingImage, setImportingImage] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [inserting, setInserting] = useState(false);
  const importFiles = useDocumentStore((state) => state.importFiles);
  const importImageBytes = useDocumentStore((state) => state.importImageBytes);
  useEffect(() => {
    if (open && initialPath) setDraft({ ...EMPTY_FIGURE, path: initialPath });
  }, [initialPath, open]);
  useEffect(() => {
    if (!open) {
      setDraft(EMPTY_FIGURE);
      setPendingName("");
    }
  }, [open]);
  useEffect(() => {
    if (!pendingImage) {
      setPreviewUrl(undefined);
      return;
    }
    setPendingName(defaultPastedImageName(pendingImage.type));
    const url = URL.createObjectURL(pendingImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);
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
  const insert = async () => {
    if (!pendingImage) {
      if (!draft.path) return;
      onInsert(serializeFigure(draft));
      setDraft(EMPTY_FIGURE);
      onOpenChange(false);
      return;
    }
    setInserting(true);
    try {
      const name = sanitizePastedImageName(pendingName, pendingImage.type);
      const bytes = await fileToBytes(pendingImage);
      // Written only now, on confirm — cancelling never leaves a file behind.
      const actualPath = await importImageBytes(bytes, "figures", name);
      if (!actualPath)
        throw new Error("Open a project before inserting a figure");
      onInsert(serializeFigure({ ...draft, path: actualPath }));
      toast.success(`Saved ${actualPath}`);
      setDraft(EMPTY_FIGURE);
      onOpenChange(false);
    } catch (error) {
      // Keep the dialog open: the bytes are still in memory, so the user
      // can rename or retry without re-pasting.
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setInserting(false);
    }
  };
  const provisionalPath = pendingImage
    ? `figures/${sanitizePastedImageName(pendingName, pendingImage.type)}`
    : draft.path;
  const previewDraft = { ...draft, path: provisionalPath };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onPaste={(event) => {
          const file = clipboardImageFile(event.clipboardData);
          if (!file) return;
          event.preventDefault();
          window.dispatchEvent(
            new CustomEvent("image-pasted-for-figure", { detail: { file } }),
          );
        }}
      >
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
          pendingImage={
            pendingImage && previewUrl
              ? { name: pendingName, previewUrl }
              : undefined
          }
          onPendingNameChange={setPendingName}
          onDiscardPendingImage={onDiscardPending}
        />
        <div className="rounded-md bg-muted/50 px-2.5 py-2">
          <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
            Source preview
          </div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">
            {provisionalPath
              ? serializeFigure(previewDraft)
              : "Choose an image to preview"}
          </pre>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={inserting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={
              pendingImage ? !pendingName.trim() || inserting : !draft.path
            }
            onClick={() => void insert()}
          >
            {inserting && <Loader2Icon className="size-3.5 animate-spin" />}
            {inserting ? "Saving…" : "Insert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
