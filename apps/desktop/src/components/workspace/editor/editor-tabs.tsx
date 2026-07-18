import { useEffect, useMemo, useRef } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";

/**
 * Tab strip for open files, shown above the editor toolbar.
 * Selecting a file previews it in a transient tab (italic) that the next
 * preview replaces; "Open in New Tab", editing, or double-clicking pins it.
 * Ctrl+PageDown / Ctrl+PageUp cycle tabs (Ctrl+Tab belongs to the AI chat tabs).
 */
export function EditorTabs() {
  const files = useDocumentStore((s) => s.files);
  const openFileIds = useDocumentStore((s) => s.openFileIds);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const openFileInTab = useDocumentStore((s) => s.openFileInTab);
  const closeTab = useDocumentStore((s) => s.closeTab);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pinned tabs, plus the active file as a trailing preview tab when unpinned
  const previewFileId =
    activeFileId && !openFileIds.includes(activeFileId) ? activeFileId : null;
  const tabs = useMemo(() => {
    const ids = previewFileId ? [...openFileIds, previewFileId] : openFileIds;
    return ids
      .map((id) => files.find((f) => f.id === id))
      .filter((f): f is ProjectFile => f != null);
  }, [openFileIds, previewFileId, files]);

  // Scroll the active tab into view when it changes
  useEffect(() => {
    if (!activeFileId) return;
    const el = scrollRef.current?.querySelector(
      `[data-file-id="${CSS.escape(activeFileId)}"]`,
    );
    el?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeFileId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "PageDown" || e.key === "PageUp")) {
        e.preventDefault();
        useDocumentStore.getState().cycleTab(e.key === "PageDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Show the parent folder for tabs whose file name is not unique
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tabs) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name));
  }, [tabs]);

  if (tabs.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="scrollbar-none flex shrink-0 items-center overflow-x-auto border-border border-b bg-background"
      role="tablist"
      aria-label="Open files"
    >
      {tabs.map((file) => (
        <TabButton
          key={file.id}
          file={file}
          isActive={file.id === activeFileId}
          isPreview={file.id === previewFileId}
          isLastTab={tabs.length <= 1}
          showDir={duplicateNames.has(file.name)}
          onClick={() => setActiveFile(file.id)}
          onPin={() => openFileInTab(file.id)}
          onClose={() => closeTab(file.id)}
        />
      ))}
    </div>
  );
}

function TabButton({
  file,
  isActive,
  isPreview,
  isLastTab,
  showDir,
  onClick,
  onPin,
  onClose,
}: {
  file: ProjectFile;
  isActive: boolean;
  isPreview: boolean;
  isLastTab: boolean;
  showDir: boolean;
  onClick: () => void;
  onPin: () => void;
  onClose: () => void;
}) {
  const dir = file.relativePath.includes("/")
    ? file.relativePath.slice(0, file.relativePath.lastIndexOf("/"))
    : "";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-file-id={file.id}
      onClick={onClick}
      onDoubleClick={onPin}
      onAuxClick={(e) => {
        if (e.button === 1 && !isLastTab) {
          e.preventDefault();
          onClose();
        }
      }}
      title={
        isPreview
          ? `${file.relativePath} (preview — double-click to keep open)`
          : file.relativePath
      }
      className={cn(
        "group relative flex min-w-0 max-w-[180px] shrink-0 items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs transition-colors",
        isActive
          ? "border-primary bg-muted/50 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground",
      )}
    >
      <span className={cn("truncate", isPreview && "italic")}>{file.name}</span>
      {showDir && dir && (
        <span className="max-w-20 truncate text-[10px] text-muted-foreground/70">
          {dir}
        </span>
      )}
      {/* Dirty dot, swapped for the close button on hover */}
      {file.isDirty && (
        <span
          className={cn(
            "size-2 shrink-0 rounded-full bg-primary/70",
            !isLastTab && "group-hover:hidden",
          )}
        />
      )}
      {!isLastTab && (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Close ${file.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn(
            "shrink-0 rounded-sm p-0.5 transition-opacity hover:bg-muted-foreground/20",
            file.isDirty
              ? "hidden group-hover:inline-flex"
              : "opacity-0 group-hover:opacity-100",
          )}
        >
          <XIcon className="size-3" />
        </span>
      )}
    </button>
  );
}
