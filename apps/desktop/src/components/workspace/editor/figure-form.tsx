import { ImageIcon, Loader2Icon, UploadIcon } from "lucide-react";
import type { FigureDraft } from "@/lib/latex-figures";
import type { ProjectFile } from "@/stores/document-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function projectImageFiles(files: ProjectFile[]): ProjectFile[] {
  return files.filter((file) =>
    /\.(?:png|jpe?g|gif|webp|pdf|eps|svg)$/i.test(file.name),
  );
}

interface FigureFormProps {
  value: FigureDraft;
  files: ProjectFile[];
  onChange: (draft: FigureDraft) => void;
  onImportImage?: () => void;
  importingImage?: boolean;
}

export function FigureForm({
  value,
  files,
  onChange,
  onImportImage,
  importingImage = false,
}: FigureFormProps) {
  const images = projectImageFiles(files);
  return (
    <div className="space-y-3">
      <div className="space-y-1 text-muted-foreground text-xs">
        <span id="figure-image-label">Image</span>
        <div className="flex gap-2">
          <Select
            value={value.path}
            onValueChange={(path) => onChange({ ...value, path })}
          >
            <SelectTrigger
              aria-labelledby="figure-image-label"
              className="h-8! min-w-0 flex-1 text-xs"
            >
              <SelectValue placeholder="Choose a project image" />
            </SelectTrigger>
            <SelectContent>
              {images.map((file) => (
                <SelectItem key={file.id} value={file.relativePath}>
                  <span className="flex items-center gap-2">
                    <ImageIcon className="size-3.5" />
                    {file.relativePath}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onImportImage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={onImportImage}
              disabled={importingImage}
            >
              {importingImage ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <UploadIcon className="size-3.5" />
              )}
              Import
            </Button>
          )}
        </div>
        {onImportImage && (
          <p className="text-[11px]">
            External images are copied unchanged into{" "}
            <span className="font-mono">figures/</span>.
          </p>
        )}
        {images.length === 0 && (
          <p className="text-[11px]">
            Choose Import to add the first project image.
          </p>
        )}
      </div>

      <div className="grid grid-cols-[1fr_120px] gap-2">
        <div className="space-y-1 text-muted-foreground text-xs">
          <label htmlFor="figure-caption">Caption</label>
          <Input
            id="figure-caption"
            value={value.caption}
            onChange={(event) =>
              onChange({ ...value, caption: event.target.value })
            }
            className="h-8 text-sm"
            placeholder="Describe the figure"
          />
        </div>
        <div className="space-y-1 text-muted-foreground text-xs">
          <label htmlFor="figure-width">Width (%)</label>
          <Input
            id="figure-width"
            type="number"
            min={1}
            max={200}
            value={value.widthPercent}
            onChange={(event) =>
              onChange({
                ...value,
                widthPercent: Number(event.target.value) || 1,
              })
            }
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_130px] gap-2">
        <div className="space-y-1 text-muted-foreground text-xs">
          <label htmlFor="figure-label">Label</label>
          <Input
            id="figure-label"
            value={value.label}
            onChange={(event) =>
              onChange({ ...value, label: event.target.value })
            }
            className="h-8 font-mono text-sm"
            placeholder="fig:results"
          />
        </div>
        <div className="space-y-1 text-muted-foreground text-xs">
          <label htmlFor="figure-placement">Placement</label>
          <Input
            id="figure-placement"
            value={value.placement}
            onChange={(event) =>
              onChange({ ...value, placement: event.target.value })
            }
            className="h-8 font-mono text-sm"
            placeholder="htbp"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={value.centered}
          onChange={(event) =>
            onChange({ ...value, centered: event.target.checked })
          }
          className="size-4 rounded border-border accent-primary"
        />
        Centre the image
      </label>
    </div>
  );
}
