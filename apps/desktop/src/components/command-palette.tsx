import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";
import {
  PlayIcon,
  SaveIcon,
  PanelRightIcon,
  MaximizeIcon,
  PanelLeftIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  FilePlusIcon,
  FileTextIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { useDocumentStore } from "@/stores/document-store";
import { usePreviewStore } from "@/stores/preview-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { setTheme } = useTheme();

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("toggle-command-palette", handler);
    return () => window.removeEventListener("toggle-command-palette", handler);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    // Defer so the dialog closes before the action runs (avoids focus fights).
    setTimeout(fn, 0);
  };

  const textFiles = files.filter((f) => f.type !== "image" && f.type !== "pdf");

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search files…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {projectRoot && (
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() =>
                run(() =>
                  window.dispatchEvent(new CustomEvent("trigger-compile")),
                )
              }
            >
              <PlayIcon />
              Compile document
              <CommandShortcut>⌘↵</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => {
                  const state = useDocumentStore.getState();
                  state.setIsSaving(true);
                  state
                    .saveCurrentFile()
                    .finally(() =>
                      setTimeout(() => state.setIsSaving(false), 500),
                    );
                })
              }
            >
              <SaveIcon />
              Save file
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => usePreviewStore.getState().toggle())}
            >
              <PanelRightIcon />
              Toggle PDF preview
              <CommandShortcut>⌘\</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => useWorkspaceLayoutStore.getState().toggleFocusMode())
              }
            >
              <MaximizeIcon />
              Toggle focus mode
              <CommandShortcut>⌘⇧F</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => {
                  const s = useWorkspaceLayoutStore.getState();
                  s.setSidePanelOpen(!s.sidePanelOpen);
                })
              }
            >
              <PanelLeftIcon />
              Toggle side panel
            </CommandItem>
          </CommandGroup>
        )}

        <CommandGroup heading="General">
          <CommandItem
            onSelect={() =>
              run(() => invoke("create_new_window").catch(console.error))
            }
          >
            <FilePlusIcon />
            New window
            <CommandShortcut>⌘⇧N</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => window.dispatchEvent(new CustomEvent("open-settings")))
            }
          >
            <SettingsIcon />
            Open settings
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Appearance">
          <CommandItem onSelect={() => run(() => setTheme("light"))}>
            <SunIcon />
            Light theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("dark"))}>
            <MoonIcon />
            Dark theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("system"))}>
            <MonitorIcon />
            System theme
          </CommandItem>
        </CommandGroup>

        {projectRoot && textFiles.length > 0 && (
          <CommandGroup heading="Files">
            {textFiles.map((file) => (
              <CommandItem
                key={file.id}
                value={`file ${file.relativePath}`}
                onSelect={() => run(() => setActiveFile(file.id))}
              >
                <FileTextIcon />
                <span className="truncate">{file.relativePath}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
