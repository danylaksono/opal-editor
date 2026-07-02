import { useMemo } from "react";
import {
  Loader2Icon,
  CircleCheckIcon,
  CircleXIcon,
  AlertTriangleIcon,
  CircleIcon,
} from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useProblemsStore } from "@/stores/problems-store";
import { useSettingsStore } from "@/stores/settings-store";

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function StatusBar() {
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const isCompiling = useDocumentStore((s) => s.isCompiling);
  const compileError = useDocumentStore((s) => s.compileError);
  const isSaving = useDocumentStore((s) => s.isSaving);
  const diagnostics = useProblemsStore((s) => s.diagnostics);
  const compilerBackend = useSettingsStore((s) => s.compilerBackend);

  const activeFile = files.find((f) => f.id === activeFileId);
  const isTextFile =
    activeFile && activeFile.type !== "image" && activeFile.type !== "pdf";

  const wordCount = useMemo(() => {
    if (!isTextFile || !activeFile?.content) return 0;
    return countWords(activeFile.content);
  }, [isTextFile, activeFile?.content]);

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter(
    (d) => d.severity === "warning",
  ).length;

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-sidebar-border border-t bg-sidebar px-3 text-[11px] text-muted-foreground">
      {/* Compile status */}
      <div className="flex items-center gap-1.5">
        {isCompiling ? (
          <>
            <Loader2Icon className="size-3 animate-spin" />
            <span>Compiling…</span>
          </>
        ) : compileError ? (
          <span className="flex items-center gap-1.5 text-destructive">
            <CircleXIcon className="size-3" />
            Compile failed
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <CircleCheckIcon className="size-3 text-emerald-500" />
            Ready
          </span>
        )}
      </div>

      {/* Diagnostics */}
      {(errorCount > 0 || warningCount > 0) && (
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <span className="flex items-center gap-1">
              <CircleXIcon className="size-3 text-destructive" />
              {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangleIcon className="size-3" />
              {warningCount}
            </span>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {isSaving && (
          <span className="flex items-center gap-1">
            <CircleIcon className="size-2 fill-current" />
            Saving…
          </span>
        )}
        {activeFile && (
          <span
            className="max-w-[240px] truncate"
            title={activeFile.relativePath}
          >
            {activeFile.relativePath}
          </span>
        )}
        {isTextFile && <span className="tabular-nums">{wordCount} words</span>}
        <span className="uppercase tracking-wide">{compilerBackend}</span>
      </div>
    </div>
  );
}
