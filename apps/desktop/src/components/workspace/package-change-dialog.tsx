import { useEffect, useState } from "react";
import { AlertTriangleIcon, PackagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyPackagePreviews,
  type PackageRequestDetail,
} from "@/lib/feature-packages";

export function PackageChangeDialog() {
  const [request, setRequest] = useState<PackageRequestDetail | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const handleRequest = (event: Event) =>
      setRequest((current) => {
        current?.resolve(false);
        return (event as CustomEvent<PackageRequestDetail>).detail;
      });
    window.addEventListener("request-package-change", handleRequest);
    return () =>
      window.removeEventListener("request-package-change", handleRequest);
  }, []);

  const close = (confirmed: boolean) => {
    request?.resolve(confirmed);
    setRequest(null);
  };
  const apply = async () => {
    if (!request) return;
    setApplying(true);
    const success = await applyPackagePreviews(request.previews);
    setApplying(false);
    close(success);
  };

  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => !open && close(false)}
    >
      <DialogContent aria-describedby="package-change-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlusIcon className="size-5" />
            Confirm preamble change
          </DialogTitle>
          <DialogDescription id="package-change-description">
            Nothing changes until you confirm this exact diff.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {request?.previews.map((preview) => (
            <div
              key={preview.requiredPackage}
              className="rounded-md border p-3"
            >
              <div className="font-medium">{preview.requiredPackage}</div>
              <div className="text-muted-foreground text-sm">
                {preview.reason}
              </div>
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-green-700 text-xs dark:text-green-400">
                {preview.exactDiff}
              </pre>
              <div className="mt-1 text-muted-foreground text-xs">
                Target: {preview.targetRootFile}
              </div>
              {preview.conflicts.length > 0 && (
                <div className="mt-2 flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangleIcon className="size-4" />
                  Conflicts with {preview.conflicts.join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={applying}>
            {applying ? "Applying…" : "Apply package change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
