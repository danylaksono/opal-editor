import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { mkdir, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
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
  ArrowRightIcon,
  BookOpenCheckIcon,
  ShieldCheckIcon,
  WifiOffIcon,
  ImportIcon,
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
import { cn } from "@/lib/utils";
import { getTemplateById, getTemplateSkeleton } from "@/lib/template-registry";
import { DEFAULT_AI_PROJECT_GUIDE } from "@/lib/default-ai-project-guide";
import { OnboardingPrompt } from "@/components/onboarding-prompt";
import { useOnboardingStore } from "@/stores/onboarding-store";
import {
  TUTORIAL_BIB,
  TUTORIAL_MAIN_TEX,
  TUTORIAL_SAMPLE_IMAGE_NAME,
  TUTORIAL_SAMPLE_IMAGE_URL,
} from "@/lib/tutorial-project";
import { ProjectImportDialog } from "./project-import-dialog";

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
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
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
      setOpeningPath(selected);
      try {
        await openProject(selected);
        addRecentProject(selected);
      } catch (err) {
        toast.error("Failed to open project", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setOpeningPath(null);
      }
    }
  };

  // Reorder the recent-projects list only once the project has actually
  // finished loading, so the list doesn't shift under the user's cursor
  // while `openProject` is still scanning/reading files.
  const handleOpenRecent = async (path: string) => {
    if (openingPath) return;
    setOpeningPath(path);
    try {
      await openProject(path);
      addRecentProject(path);
    } catch (err) {
      toast.error("Failed to open project", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setOpeningPath(null);
    }
  };

  const handleImportedProject = async (path: string) => {
    const pathParts = path.split(/[/\\]/);
    pathParts.pop();
    const parent = pathParts.join(path.includes("\\") ? "\\" : "/");
    if (parent) setLastProjectFolder(parent);
    setOpeningPath(path);
    try {
      await openProject(path);
      addRecentProject(path);
    } catch (err) {
      toast.error("Failed to open project", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setOpeningPath(null);
    }
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
        baseFolder = await join(home, "Documents", "Opal");
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
      await openProject(projectPath);
      addRecentProject(projectPath);
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
        baseFolder = await join(home, "Documents", "Opal");
      }
      await mkdir(baseFolder, { recursive: true });
      const projectPath = await join(baseFolder, "Learn-LaTeX");
      await mkdir(projectPath, { recursive: true });
      const mainPath = await join(projectPath, "main.tex");
      const bibPath = await join(projectPath, "references.bib");
      if (!(await exists(mainPath)))
        await writeTextFile(mainPath, TUTORIAL_MAIN_TEX);
      if (!(await exists(bibPath))) await writeTextFile(bibPath, TUTORIAL_BIB);
      const imagePath = await join(projectPath, TUTORIAL_SAMPLE_IMAGE_NAME);
      if (!(await exists(imagePath))) {
        try {
          const response = await fetch(TUTORIAL_SAMPLE_IMAGE_URL);
          const bytes = new Uint8Array(await response.arrayBuffer());
          await writeFile(imagePath, bytes);
        } catch {
          // The figure step still teaches the syntax if the sample image can't
          // be copied; the learner can point it at their own image instead.
        }
      }
      setLastProjectFolder(baseFolder);
      startTutorial(projectPath);
      await openProject(projectPath);
      addRecentProject(projectPath);
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
    <div className="welcome-stage relative flex h-full items-center justify-center overflow-hidden bg-background">
      <OnboardingPrompt
        open={!hasSeenOffer && recentProjects.length === 0}
        isCreating={isCreatingTutorial}
        onLearn={handleCreateTutorial}
        onSkip={markOfferSeen}
      />
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-5 right-5 z-10 size-9 rounded-xl border border-border/70 bg-background/60 text-muted-foreground shadow-sm backdrop-blur"
        title="Settings"
        onClick={() => setShowSettings(true)}
      >
        <SettingsIcon className="size-4" />
      </Button>
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      <ProjectImportDialog
        open={showImportDialog}
        defaultDestination={lastProjectFolder}
        onOpenChange={setShowImportDialog}
        onImported={handleImportedProject}
      />

      <main className="relative z-[1] grid w-full max-w-5xl grid-cols-1 gap-10 px-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="max-w-xl">
          <div className="mb-8 flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt=""
              aria-hidden="true"
              className="size-11 rounded-xl shadow-sm"
            />
            <div>
              <div className="font-semibold text-sm tracking-tight">Opal</div>
              <VersionBadge
                version={appVersion}
                updateStatus={updateStatus}
                onCheck={checkForUpdate}
                onInstall={installUpdate}
              />
            </div>
          </div>

          <p className="mb-3 font-medium text-primary text-xs uppercase tracking-[0.18em]">
            Academic writing, made calm
          </p>
          <h1 className="max-w-lg font-serif text-4xl leading-[1.08] tracking-[-0.025em] sm:text-5xl">
            Focus on your ideas.
            <span className="block text-muted-foreground">
              We’ll handle the LaTeX.
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-muted-foreground text-sm leading-6">
            Write with visual tools when you want them, inspect the source when
            you need it, and see a publication-ready PDF beside your work.
          </p>

          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <WifiOffIcon className="size-3.5 text-primary" />
              Works offline
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheckIcon className="size-3.5 text-primary" />
              Your files stay yours
            </span>
            <span className="flex items-center gap-1.5">
              <SparklesIcon className="size-3.5 text-primary" />
              Beginner-friendly
            </span>
          </div>
        </section>

        <section
          aria-label="Start writing"
          className="rounded-3xl border border-border/80 bg-card/88 p-2 shadow-[0_24px_70px_-32px_color-mix(in_oklab,var(--foreground)_35%,transparent)] backdrop-blur"
        >
          <div className="grid grid-cols-2 gap-2 p-2">
            <Button
              onClick={() => setShowModeDialog(true)}
              size="lg"
              className="h-12 justify-between rounded-xl px-4"
            >
              <span className="flex items-center gap-2">
                <FolderPlusIcon className="size-4" />
                New document
              </span>
              <ArrowRightIcon className="size-3.5 opacity-70" />
            </Button>
            <Button
              onClick={handleOpenFolder}
              size="lg"
              variant="outline"
              className="h-12 justify-start gap-2 rounded-xl bg-background/60 px-4"
            >
              <FolderOpenIcon className="size-4" />
              Open project
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setShowImportDialog(true)}
            className="group mx-2 mb-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl border border-border/70 bg-background/45 px-3 py-2.5 text-left transition-colors hover:bg-muted/70"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ImportIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-sm">
                Import a project
              </span>
              <span className="block text-muted-foreground text-xs">
                ZIP archive or public GitHub repository
              </span>
            </span>
            <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>

          <button
            type="button"
            onClick={handleCreateTutorial}
            disabled={isCreatingTutorial}
            className="group mx-2 mb-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.06] p-3 text-left transition-colors hover:bg-primary/10 disabled:opacity-60"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              {isCreatingTutorial ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <BookOpenCheckIcon className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-sm">
                New to LaTeX? Start here
              </span>
              <span className="mt-0.5 block text-muted-foreground text-xs">
                Build a first paper in about five minutes
              </span>
            </span>
            <ArrowRightIcon className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
          </button>

          <div className="border-border/70 border-t px-3 pt-3 pb-2">
            <div className="mb-2 flex items-center justify-between text-muted-foreground text-xs">
              <span className="flex items-center gap-1.5">
                <ClockIcon className="size-3.5" />
                Recent work
              </span>
              <span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                  ⌘K
                </kbd>{" "}
                commands
              </span>
            </div>
            {recentProjects.length > 0 ? (
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {recentProjects.map((project) => {
                  const isOpeningThis = openingPath === project.path;
                  const isBlocked = openingPath !== null && !isOpeningThis;
                  return (
                    <div
                      key={project.path}
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors",
                        isOpeningThis && "bg-muted",
                        !isBlocked && "hover:bg-muted",
                        isBlocked && "opacity-50",
                      )}
                    >
                      {isOpeningThis ? (
                        <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <button
                        className="flex min-w-0 flex-1 flex-col items-start text-left disabled:cursor-not-allowed"
                        disabled={openingPath !== null}
                        onClick={() => handleOpenRecent(project.path)}
                      >
                        <span className="w-full truncate font-medium text-sm">
                          {project.name}
                        </span>
                        <span className="w-full truncate text-[10px] text-muted-foreground">
                          {isOpeningThis ? "Opening…" : project.path}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                        disabled={openingPath !== null}
                        aria-label={`Remove ${project.name} from recent projects`}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeRecentProject(project.path);
                        }}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-20 items-center justify-center rounded-xl border border-dashed text-center text-muted-foreground text-xs">
                Your recent documents will appear here.
              </div>
            )}
          </div>
        </section>
      </main>

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
