import { useEffect, useMemo, useState } from "react";
import { BookPlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  appendCandidate,
  clearMetadataCache,
  findCandidateDuplicates,
  generateCitationKey,
  lookupReference,
  type CitationCandidate,
} from "@/lib/bibliography-import";
import { useDocumentStore } from "@/stores/document-store";
import { useSemanticIndexStore } from "@/stores/semantic-index-store";
import { useResizableDialog } from "@/hooks/use-resizable-dialog";

export function BibliographyImportDialog() {
  const [open, setOpen] = useState(false);
  const { style: widthStyle, handle: resizeHandle } = useResizableDialog({
    storageKey: "tectonic-editor-bibliography-import-width",
  });
  const [identifier, setIdentifier] = useState("");
  const [candidate, setCandidate] = useState<CitationCandidate | null>(null);
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const files = useDocumentStore((state) => state.files);
  const bibFiles = files.filter((file) => file.type === "bib");
  const [targetFile, setTargetFile] = useState("");
  const snapshots = useSemanticIndexStore((state) => state.snapshots);
  const existingKeys = useMemo(
    () =>
      Object.values(snapshots)
        .flatMap((snapshot) => snapshot.objects)
        .filter((item) => item.kind === "bibliography-entry")
        .map((item) => item.detail ?? item.label),
    [snapshots],
  );
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-bibliography-import", handler);
    return () =>
      window.removeEventListener("open-bibliography-import", handler);
  }, []);
  useEffect(() => {
    if (!targetFile && bibFiles[0]) setTargetFile(bibFiles[0].id);
  }, [bibFiles, targetFile]);
  const source = files.find((file) => file.id === targetFile)?.content ?? "";
  const duplicates = useMemo(
    () => (candidate ? findCandidateDuplicates(candidate, source) : []),
    [candidate, source],
  );
  const lookup = async (refresh = false) => {
    setLoading(true);
    try {
      const result = await lookupReference(identifier, refresh);
      setCandidate(result);
      setKey(generateCitationKey(result, existingKeys));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };
  const importEntry = async () => {
    if (!candidate || !targetFile || !key) return;
    if (existingKeys.includes(key)) {
      toast.error("That citation key already exists");
      return;
    }
    if (await appendCandidate(targetFile, candidate, key)) {
      toast.success(`Imported ${key}`);
      setOpen(false);
      setCandidate(null);
      setIdentifier("");
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        style={widthStyle}
        aria-describedby="bibliography-import-description"
      >
        {resizeHandle}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookPlusIcon className="size-5" />
            Import by identifier
          </DialogTitle>
          <DialogDescription id="bibliography-import-description">
            Enter a DOI, ISBN-10/13, or arXiv ID. Network access occurs only
            when you choose Lookup. arXiv metadata is used with acknowledgement
            to arXiv.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            aria-label="DOI, ISBN, or arXiv identifier"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="10.1000/example, 978…, or 2401.12345"
          />
          <Button
            onClick={() => lookup(false)}
            disabled={!identifier || loading}
          >
            {loading ? "Looking up…" : "Lookup"}
          </Button>
        </div>
        {candidate && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between text-xs">
              <span>
                Provider: {candidate.attribution}
                {candidate.fromCache ? " (cached)" : ""}
              </span>
              <Button size="sm" variant="ghost" onClick={() => lookup(true)}>
                <RefreshCwIcon />
                Refresh
              </Button>
            </div>
            <div>
              <Label htmlFor="candidate-title">Title</Label>
              <Input
                id="candidate-title"
                value={candidate.title}
                onChange={(event) =>
                  setCandidate({ ...candidate, title: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="candidate-authors">Authors (one per line)</Label>
              <Textarea
                id="candidate-authors"
                value={candidate.authors.join("\n")}
                onChange={(event) =>
                  setCandidate({
                    ...candidate,
                    authors: event.target.value.split("\n"),
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="candidate-year">Year</Label>
                <Input
                  id="candidate-year"
                  value={candidate.year}
                  onChange={(event) =>
                    setCandidate({ ...candidate, year: event.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="candidate-key">Citation key</Label>
                <Input
                  id="candidate-key"
                  value={key}
                  onChange={(event) =>
                    setKey(event.target.value.replace(/[^a-zA-Z0-9:._-]/g, ""))
                  }
                />
              </div>
            </div>
            {duplicates.length > 0 && (
              <div className="rounded bg-amber-100 p-2 text-amber-950 text-sm dark:bg-amber-950 dark:text-amber-100">
                Possible duplicate: {duplicates.join(", ")}. Review before
                importing.
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-sm">
                Raw provider metadata
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                {candidate.rawMetadata}
              </pre>
            </details>
            <div>
              <Label htmlFor="target-bib">Bibliography file</Label>
              <select
                id="target-bib"
                className="h-9 w-full rounded border bg-background px-2"
                value={targetFile}
                onChange={(event) => setTargetFile(event.target.value)}
              >
                {bibFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.relativePath}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <DialogFooter className="items-center sm:justify-between">
          <Button
            variant="ghost"
            onClick={() =>
              void clearMetadataCache().then(() =>
                toast.success("Metadata cache cleared"),
              )
            }
          >
            <Trash2Icon />
            Clear metadata cache
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={importEntry}
              disabled={!candidate || !targetFile || !key}
            >
              Confirm import
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
