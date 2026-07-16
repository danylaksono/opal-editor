import { useMemo } from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  StethoscopeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmPackageRequirements } from "@/lib/feature-packages";
import {
  FEATURE_PACKAGE_REGISTRY,
  findPackageDeclarations,
} from "@/lib/feature-packages";
import { analyzeProjectHealth } from "@/lib/project-health";
import { useDocumentStore } from "@/stores/document-store";
import { useSemanticIndexStore } from "@/stores/semantic-index-store";

export function HealthPanel() {
  const files = useDocumentStore((state) => state.files);
  const snapshots = useSemanticIndexStore((state) => state.snapshots);
  const issues = useMemo(
    () =>
      analyzeProjectHealth(
        files,
        Object.values(snapshots).flatMap((snapshot) => snapshot.objects),
      ),
    [files, snapshots],
  );
  const packages = useMemo(
    () =>
      files.flatMap((file) =>
        findPackageDeclarations(file.content ?? "").map((item) => ({
          ...item,
          fileId: file.id,
          reasons: Object.values(FEATURE_PACKAGE_REGISTRY)
            .flat()
            .filter((requirement) => requirement.name === item.name)
            .map((requirement) => requirement.reason),
        })),
      ),
    [files],
  );
  const navigate = (fileId?: string, from?: number) => {
    if (!fileId) return;
    useDocumentStore.getState().setActiveFile(fileId);
    if (from !== undefined)
      setTimeout(
        () => useDocumentStore.getState().requestJumpToPosition(from),
        0,
      );
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-sidebar-border border-b px-3">
        <StethoscopeIcon className="size-4" />
        <div>
          <div className="font-medium text-xs">Project health</div>
          <div className="text-[10px] text-muted-foreground">
            {issues.length} findings
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <details className="mb-2 rounded-md border bg-background p-2">
          <summary className="cursor-pointer font-medium text-xs">
            Declared packages ({packages.length})
          </summary>
          <div className="mt-2 space-y-1">
            {packages.length === 0 ? (
              <div className="text-muted-foreground text-xs">
                No packages declared.
              </div>
            ) : (
              packages.map((item, index) => (
                <button
                  type="button"
                  key={`${item.fileId}-${item.name}-${index}`}
                  className="block w-full rounded px-1 py-1 text-left hover:bg-muted"
                  onClick={() => navigate(item.fileId, item.from)}
                >
                  <span className="font-mono text-xs">{item.name}</span>
                  {item.options.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {" "}
                      [{item.options.join(", ")}]
                    </span>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    {item.reasons.join("; ") ||
                      "Custom or project-specific package — left untouched"}
                  </div>
                </button>
              ))
            )}
          </div>
        </details>
        {issues.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-muted-foreground text-xs">
            <CheckCircle2Icon className="size-8 text-emerald-600" />
            No project health issues found.
          </div>
        ) : (
          issues.map((issue) => {
            const Icon =
              issue.severity === "error"
                ? AlertCircleIcon
                : issue.severity === "warning"
                  ? AlertTriangleIcon
                  : InfoIcon;
            return (
              <div
                key={issue.id}
                className="mb-2 rounded-md border bg-background p-2"
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-2 text-left"
                  onClick={() => navigate(issue.fileId, issue.from)}
                >
                  <Icon
                    className={
                      issue.severity === "error"
                        ? "mt-0.5 size-3.5 text-destructive"
                        : issue.severity === "warning"
                          ? "mt-0.5 size-3.5 text-amber-600"
                          : "mt-0.5 size-3.5 text-blue-600"
                    }
                  />
                  <span className="text-xs">{issue.message}</span>
                </button>
                {issue.fixFeature && (
                  <Button
                    className="mt-2 h-7 text-xs"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void confirmPackageRequirements([issue.fixFeature!])
                    }
                  >
                    Preview fix
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
