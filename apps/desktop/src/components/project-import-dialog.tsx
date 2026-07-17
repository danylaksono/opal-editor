import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowRightIcon,
  FileArchiveIcon,
  GithubIcon,
  Loader2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  importGitHubProject,
  importZipProject,
  type ProjectImportResult,
} from "@/lib/project-import";

type ImportKind = "zip" | "github";

interface ProjectImportDialogProps {
  open: boolean;
  defaultDestination?: string | null;
  onOpenChange: (open: boolean) => void;
  onImported: (projectPath: string) => Promise<void>;
}

export function ProjectImportDialog({
  open: isOpen,
  defaultDestination,
  onOpenChange,
  onImported,
}: ProjectImportDialogProps) {
  const [githubUrl, setGithubUrl] = useState("");
  const [importing, setImporting] = useState<ImportKind | null>(null);

  const chooseDestination = async (): Promise<string | null> => {
    const destination = await open({
      directory: true,
      multiple: false,
      title: "Choose Where to Save the Imported Project",
      defaultPath: defaultDestination ?? undefined,
    });
    return typeof destination === "string" ? destination : null;
  };

  const finishImport = async (
    importKind: ImportKind,
    operation: (destination: string) => Promise<ProjectImportResult>,
  ) => {
    const destination = await chooseDestination();
    if (!destination) return;

    setImporting(importKind);
    let result: ProjectImportResult;
    try {
      result = await operation(destination);
    } catch (error) {
      toast.error("Could not import project", {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    } finally {
      setImporting(null);
    }

    toast.success("Project imported", {
      description: `${result.fileCount} files saved to ${result.projectPath}`,
    });
    onOpenChange(false);
    try {
      await onImported(result.projectPath);
    } catch (error) {
      toast.error("The project was imported but could not be opened", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleZipImport = async () => {
    const archive = await open({
      directory: false,
      multiple: false,
      title: "Import LaTeX Project from ZIP",
      filters: [{ name: "ZIP archive", extensions: ["zip"] }],
    });
    if (typeof archive !== "string") return;

    await finishImport("zip", (destination) =>
      importZipProject(archive, destination),
    );
  };

  const handleGitHubImport = async (event: React.FormEvent) => {
    event.preventDefault();
    const repositoryUrl = githubUrl.trim();
    if (!repositoryUrl) return;

    await finishImport("github", (destination) =>
      importGitHubProject(repositoryUrl, destination),
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!importing) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a project</DialogTitle>
          <DialogDescription>
            Bring in an Overleaf download, a template archive, or a public
            GitHub repository.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={handleZipImport}
            disabled={importing !== null}
            className="group flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-foreground/20 hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-60"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {importing === "zip" ? (
                <Loader2Icon className="size-5 animate-spin" />
              ) : (
                <FileArchiveIcon className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-sm">Choose ZIP file</span>
              <span className="mt-0.5 block text-muted-foreground text-xs">
                Overleaf exports and downloaded LaTeX templates
              </span>
            </span>
            <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>

          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                {importing === "github" ? (
                  <Loader2Icon className="size-5 animate-spin" />
                ) : (
                  <GithubIcon className="size-5" />
                )}
              </span>
              <span>
                <span className="block font-medium text-sm">
                  Import from GitHub
                </span>
                <span className="mt-0.5 block text-muted-foreground text-xs">
                  Downloads the default branch of a public repository
                </span>
              </span>
            </div>
            <form
              className="flex gap-2"
              onSubmit={handleGitHubImport}
              aria-label="Import public GitHub repository"
            >
              <Input
                type="url"
                value={githubUrl}
                onChange={(event) => setGithubUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
                aria-label="GitHub repository URL"
                disabled={importing !== null}
                required
                pattern="https://github\.com/[^/]+/[^/]+/?"
              />
              <Button
                type="submit"
                disabled={importing !== null || !githubUrl.trim()}
              >
                Import
              </Button>
            </form>
          </div>

          <p className="px-1 text-[11px] text-muted-foreground leading-5">
            You choose the destination folder before anything is saved. GitHub
            import currently supports public repositories and does not connect
            an account.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
