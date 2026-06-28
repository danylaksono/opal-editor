import { useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  BookOpenIcon,
  FolderIcon,
  ListIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { Sidebar } from "./sidebar";
import { LatexEditor } from "./editor/latex-editor";
import { PdfPreview } from "./preview/pdf-preview";
import { useDocumentStore } from "@/stores/document-store";
import { usePreviewStore } from "@/stores/preview-store";
import {
  useWorkspaceLayoutStore,
  type WorkspaceSidePanel,
} from "@/stores/workspace-layout-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sidePanelItems: Array<{
  id: WorkspaceSidePanel;
  label: string;
  icon: typeof FolderIcon;
}> = [
  { id: "files", label: "Files", icon: FolderIcon },
  { id: "outline", label: "Outline", icon: ListIcon },
  { id: "citations", label: "Citations", icon: BookOpenIcon },
];

function ActivityRail() {
  const sidePanelOpen = useWorkspaceLayoutStore((s) => s.sidePanelOpen);
  const activeSidePanel = useWorkspaceLayoutStore((s) => s.activeSidePanel);
  const toggleSidePanel = useWorkspaceLayoutStore((s) => s.toggleSidePanel);
  const setSidePanelOpen = useWorkspaceLayoutStore((s) => s.setSidePanelOpen);

  return (
    <div className="flex w-12 shrink-0 flex-col items-center border-sidebar-border border-r bg-sidebar pt-[var(--titlebar-height)] text-sidebar-foreground">
      <div className="flex h-12 items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setSidePanelOpen(!sidePanelOpen)}
          title={sidePanelOpen ? "Collapse side panel" : "Open side panel"}
        >
          {sidePanelOpen ? (
            <PanelLeftCloseIcon className="size-4" />
          ) : (
            <PanelLeftOpenIcon className="size-4" />
          )}
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1 px-1 py-2">
        {sidePanelItems.map((item) => {
          const Icon = item.icon;
          const active = sidePanelOpen && activeSidePanel === item.id;
          return (
            <Button
              key={item.id}
              variant="ghost"
              size="icon"
              className={cn(
                "size-9 rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
              onClick={() => toggleSidePanel(item.id)}
              title={item.label}
              aria-pressed={active}
            >
              <Icon className="size-4" />
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspaceLayout() {
  const initialized = useDocumentStore((s) => s.initialized);
  const previewVisible = usePreviewStore((s) => s.visible);
  const togglePreview = usePreviewStore((s) => s.toggle);
  const sidePanelOpen = useWorkspaceLayoutStore((s) => s.sidePanelOpen);
  const activeSidePanel = useWorkspaceLayoutStore((s) => s.activeSidePanel);

  // Cmd+\ / Ctrl+\ toggles the PDF preview pane.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        togglePreview();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePreview]);

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      <ActivityRail />

      <PanelGroup direction="horizontal" className="min-w-0 flex-1">
        {sidePanelOpen && (
          <>
            <Panel defaultSize={18} minSize={12} maxSize={32}>
              <Sidebar activePanel={activeSidePanel} />
            </Panel>

            <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-ring" />
          </>
        )}

        <Panel defaultSize={previewVisible ? 42.5 : 85} minSize={25}>
          <div className="relative h-full">
            <LatexEditor />
            <button
              type="button"
              onClick={togglePreview}
              title={
                previewVisible
                  ? "Hide PDF preview (Cmd+\\)"
                  : "Show PDF preview (Cmd+\\)"
              }
              className="absolute right-3 bottom-3 z-40 rounded-md border bg-background/85 p-1.5 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
            >
              {previewVisible ? (
                <PanelRightCloseIcon className="size-4" />
              ) : (
                <PanelRightOpenIcon className="size-4" />
              )}
            </button>
          </div>
        </Panel>

        {previewVisible && (
          <>
            <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-ring" />

            <Panel defaultSize={42.5} minSize={25}>
              <PdfPreview />
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}
