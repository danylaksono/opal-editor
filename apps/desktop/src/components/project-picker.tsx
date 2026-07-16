import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import { toast } from "sonner";
import {
  FolderOpenIcon,
  FolderPlusIcon,
  ClockIcon,
  XIcon,
  FileTextIcon,
  SparklesIcon,
  CheckCircle2Icon,
  SettingsIcon,
  Loader2Icon,
  RefreshCwIcon,
  ArrowUpCircleIcon,
} from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { useDocumentStore } from "@/stores/document-store";
import { useUpdater } from "@/hooks/use-updater";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProjectWizard, type CreationMode } from "./project-wizard";
import { SettingsDialog } from "./settings-dialog";
import { exists, join } from "@/lib/tauri/fs";
import { getTemplateById, getTemplateSkeleton } from "@/lib/template-registry";
import { DEFAULT_AI_PROJECT_GUIDE } from "@/lib/default-ai-project-guide";
import { OnboardingPrompt } from "@/components/onboarding-prompt";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { TUTORIAL_BIB, TUTORIAL_MAIN_TEX } from "@/lib/tutorial-project";

function randomProjectName(): string {
  const adjectives = ["swift", "bright", "calm", "bold", "keen"];
  const nouns = ["paper", "draft", "note", "study", "folio"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const id = Math.random().toString(36).slice(2, 6);
  return `${adj}-${noun}-${id}`;
}

export function ProjectPicker() {
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [wizardMode, setWizardMode] = useState<CreationMode | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [isCreatingBlank, setIsCreatingBlank] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isCreatingTutorial, setIsCreatingTutorial] = useState(false);
  const { status: updateStatus, checkForUpdate, installUpdate } = useUpdater();

  const recentProjects = useProjectStore((s) => s.recentProjects);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const removeRecentProject = useProjectStore((s) => s.removeRecentProject);
  const lastProjectFolder = useProjectStore((s) => s.lastProjectFolder);
  const setLastProjectFolder = useProjectStore((s) => s.setLastProjectFolder);
  const openProject = useDocumentStore((s) => s.openProject);
  const hasSeenOffer = useOnboardingStore((s) => s.hasSeenOffer);
  const markOfferSeen = useOnboardingStore((s) => s.markOfferSeen);
  const startTutorial = useOnboardingStore((s) => s.startTutorial);

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    if (!hasSeenOffer && recentProjects.length > 0) markOfferSeen();
  }, [hasSeenOffer, markOfferSeen, recentProjects.length]);

  // Allow the command palette to open Settings from the launch screen.
  useEffect(() => {
    const handler = () => setShowSettings(true);
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, []);

  const handleOpenFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Project Folder",
    });
    if (selected) {
      addRecentProject(selected);
      await openProject(selected);
    }
  };

  const handleOpenRecent = async (path: string) => {
    addRecentProject(path);
    await openProject(path);
  };

  const handleSelectMode = (mode: CreationMode) => {
    setShowModeDialog(false);
    setWizardMode(mode);
  };

  const handleCreateBlankDocument = async () => {
    setIsCreatingBlank(true);
    try {
      const template = getTemplateById("blank");
      if (!template) throw new Error("Blank template is not available");

      let baseFolder = lastProjectFolder;
      if (!baseFolder) {
        const home = await homeDir();
        if (!home) throw new Error("Could not find your home directory");
        baseFolder = await join(home, "Documents", "TectonicEditor");
      }
      await mkdir(baseFolder, { recursive: true });

      const projectPath = await join(baseFolder, randomProjectName());
      await mkdir(projectPath, { recursive: true });

      const aiGuidePath = await join(projectPath, "AGENTS.md");
      if (!(await exists(aiGuidePath))) {
        await writeTextFile(aiGuidePath, DEFAULT_AI_PROJECT_GUIDE);
      }

      const mainTexPath = await join(projectPath, template.mainFileName);
      if (!(await exists(mainTexPath))) {
        await writeTextFile(mainTexPath, getTemplateSkeleton(template));
      }

      setShowModeDialog(false);
      setLastProjectFolder(baseFolder);
      addRecentProject(projectPath);
      await openProject(projectPath);
    } catch (err) {
      toast.error("Failed to create blank document", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsCreatingBlank(false);
    }
  };

  const handleCreateTutorial = async () => {
    setIsCreatingTutorial(true);
    try {
      let baseFolder = lastProjectFolder;
      if (!baseFolder) {
        const home = await homeDir();
        baseFolder = await join(home, "Documents", "TectonicEditor");
      }
      await mkdir(baseFolder, { recursive: true });
      const projectPath = await join(baseFolder, "Learn-LaTeX");
      await mkdir(projectPath, { recursive: true });
      const mainPath = await join(projectPath, "main.tex");
      const bibPath = await join(projectPath, "references.bib");
      if (!(await exists(mainPath)))
        await writeTextFile(mainPath, TUTORIAL_MAIN_TEX);
      if (!(await exists(bibPath))) await writeTextFile(bibPath, TUTORIAL_BIB);
      setLastProjectFolder(baseFolder);
      addRecentProject(projectPath);
      startTutorial(projectPath);
      await openProject(projectPath);
    } catch (error) {
      toast.error("Failed to create tutorial", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCreatingTutorial(false);
    }
  };

  if (wizardMode) {
    return (
      <ProjectWizard mode={wizardMode} onBack={() => setWizardMode(null)} />
    );
  }

  return (
    <div className="relative flex h-full items-center justify-center bg-background">
      <OnboardingPrompt
        open={!hasSeenOffer && recentProjects.length === 0}
        isCreating={isCreatingTutorial}
        onLearn={handleCreateTutorial}
        onSkip={markOfferSeen}
      />
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 size-9 text-muted-foreground"
        title="Settings"
        onClick={() => setShowSettings(true)}
      >
        <SettingsIcon className="size-4" />
      </Button>
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />

      <div className="flex w-full max-w-md flex-col items-center gap-8 px-8">
        <div className="flex flex-col items-center gap-2">
          <img src="/icon-192.png" alt="TectonicEditor" className="size-16" />
          <h1 className="font-bold text-2xl">TectonicEditor</h1>
          <VersionBadge
            version={appVersion}
            updateStatus={updateStatus}
            onCheck={checkForUpdate}
            onInstall={installUpdate}
          />
          <p className="text-center text-muted-foreground text-sm">
            A fast, offline LaTeX editor
          </p>
        </div>

        <div className="flex w-full gap-3">
          <Button
            onClick={() => setShowModeDialog(true)}
            size="lg"
            variant="outline"
            className="flex-1 gap-2"
          >
            <FolderPlusIcon className="size-5" />
            New Project
          </Button>
          <Button onClick={handleOpenFolder} size="lg" className="flex-1 gap-2">
            <FolderOpenIcon className="size-5" />
            Open Folder
          </Button>
        </div>

        <p className="text-muted-foreground/70 text-xs">
          Press{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>{" "}
          for commands
        </p>

        {recentProjects.length > 0 && (
          <div className="w-full">
            <div className="mb-3 flex items-center gap-2 text-muted-foreground text-sm">
              <ClockIcon className="size-4" />
              <span>Recent Projects</span>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {recentProjects.map((project) => (
                <div
                  key={project.path}
                  className="group flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted"
                >
                  <button
                    className="flex flex-1 flex-col items-start overflow-hidden text-left"
                    onClick={() => handleOpenRecent(project.path)}
                  >
                    <span className="truncate font-medium text-sm">
                      {project.name}
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {project.path}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecentProject(project.path);
                    }}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New Project mode selection dialog */}
      <Dialog open={showModeDialog} onOpenChange={setShowModeDialog}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>How would you like to start?</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleSelectMode("template")}
              className="group flex flex-1 flex-col items-center gap-3 rounded-xl border border-foreground/10 p-5 text-center transition-all hover:border-foreground/20 hover:bg-muted/50"
            >
              <div className="flex size-12 items-center justify-center rounded-lg bg-muted/50 transition-colors group-hover:bg-muted">
                <SparklesIcon className="size-6 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <div>
                <div className="font-semibold text-sm">Guided Setup</div>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                  Pick a template and let AI help you get started
                </p>
              </div>
              <span className="rounded-full bg-foreground/8 px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                Recommended
              </span>
            </button>

            <button
              onClick={handleCreateBlankDocument}
              disabled={isCreatingBlank}
              className="group flex flex-1 flex-col items-center gap-3 rounded-xl border border-border p-5 text-center transition-all hover:border-foreground/20 hover:bg-muted/50"
            >
              <div className="flex size-12 items-center justify-center rounded-lg bg-muted/50 transition-colors group-hover:bg-muted">
                {isCreatingBlank ? (
                  <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
                ) : (
                  <FileTextIcon className="size-6 text-muted-foreground transition-colors group-hover:text-foreground" />
                )}
              </div>
              <div>
                <div className="font-semibold text-sm">Blank Document</div>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                  Start with an empty LaTeX file
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Version Badge with Update Status ───

function VersionBadge({
  version,
  updateStatus,
  onCheck,
  onInstall,
}: {
  version: string;
  updateStatus: import("@/hooks/use-updater").UpdateStatus;
  onCheck: () => void;
  onInstall: () => void;
}) {
  if (!version) return null;

  switch (updateStatus.state) {
    case "available":
      return (
        <button
          onClick={onInstall}
          className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-primary text-xs transition-colors hover:bg-primary/20"
        >
          <ArrowUpCircleIcon className="size-3.5" />v{updateStatus.version}{" "}
          available — click to update
        </button>
      );

    case "downloading":
      return (
        <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-muted-foreground text-xs">
          <Loader2Icon className="size-3.5 animate-spin" />
          Downloading... {updateStatus.percent}%
        </div>
      );

    case "installing":
      return (
        <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-muted-foreground text-xs">
          <Loader2Icon className="size-3.5 animate-spin" />
          Installing...
        </div>
      );

    case "ready":
      return (
        <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-green-600 text-xs">
          <CheckCircle2Icon className="size-3.5" />
          Update complete — restarting...
        </div>
      );

    case "checking":
      return (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Loader2Icon className="size-3 animate-spin" />v{version} — checking
          for updates...
        </div>
      );

    case "error":
      return (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span>v{version}</span>
          <span className="mx-0.5">·</span>
          <button
            onClick={onCheck}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <RefreshCwIcon className="size-3" />
            Retry
          </button>
        </div>
      );

    case "up-to-date":
      return (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span>v{version}</span>
          <span className="mx-0.5">·</span>
          <button
            onClick={onCheck}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <CheckCircle2Icon className="size-3 text-green-500" />
            Up to date
          </button>
        </div>
      );

    default:
      return (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span>v{version}</span>
          <span className="mx-0.5">·</span>
          <button
            onClick={onCheck}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <RefreshCwIcon className="size-3" />
            Check for updates
          </button>
        </div>
      );
  }
}
