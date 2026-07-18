import { useMemo, useState, type ComponentType } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangleIcon,
  CloudIcon,
  DatabaseIcon,
  FileTextIcon,
  LoaderIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
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
import {
  type CiteDriveBibliographySource,
  type ExternalBibliographySource,
  type JabRefBibliographySource,
  useReferenceSourcesStore,
} from "@/stores/reference-sources-store";
import { useDocumentStore } from "@/stores/document-store";

export function ExternalBibliographySources() {
  const projectRoot = useDocumentStore((state) => state.projectRoot);
  const allSources = useReferenceSourcesStore(
    (state) => state.sourcesByProject,
  );
  const sources = useMemo(
    () => (projectRoot ? (allSources[projectRoot] ?? []) : []),
    [allSources, projectRoot],
  );
  const syncingSourceId = useReferenceSourcesStore(
    (state) => state.syncingSourceId,
  );
  const error = useReferenceSourcesStore((state) => state.error);
  const refreshSource = useReferenceSourcesStore(
    (state) => state.refreshSource,
  );
  const unlinkSource = useReferenceSourcesStore((state) => state.unlinkSource);
  const [conflictSource, setConflictSource] =
    useState<ExternalBibliographySource | null>(null);

  const handleRefresh = async (source: ExternalBibliographySource) => {
    try {
      const result = await refreshSource(source.id);
      if (result === "conflict") {
        setConflictSource(source);
      } else if (result === "missing-target") {
        toast.error("The project bibliography no longer exists", {
          description: source.targetRelativePath,
        });
      } else if (result === "update") {
        toast.success(`Refreshed ${source.name}`);
      } else {
        toast.info(`${source.name} is already up to date`);
      }
    } catch (refreshError) {
      toast.error(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh the bibliography",
      );
    }
  };

  const replaceProjectCopy = async () => {
    if (!conflictSource) return;
    try {
      await refreshSource(conflictSource.id, true);
      toast.success(`Refreshed ${conflictSource.name}`, {
        description: "The external source replaced the project copy.",
      });
      setConflictSource(null);
    } catch (refreshError) {
      toast.error(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh the bibliography",
      );
    }
  };

  const jabRefSources = sources.filter(
    (source): source is JabRefBibliographySource => source.kind === "jabref",
  );
  const citeDriveSources = sources.filter(
    (source): source is CiteDriveBibliographySource =>
      source.kind === "citedrive",
  );

  return (
    <div className="border-sidebar-border border-t">
      <JabRefSourceSection
        projectRoot={projectRoot}
        sources={jabRefSources}
        syncingSourceId={syncingSourceId}
        onRefresh={handleRefresh}
        onUnlink={unlinkSource}
      />
      <CiteDriveSourceSection
        projectRoot={projectRoot}
        sources={citeDriveSources}
        syncingSourceId={syncingSourceId}
        onRefresh={handleRefresh}
        onUnlink={unlinkSource}
      />

      {error && (
        <p className="px-2 pb-2 text-[10px] text-destructive leading-relaxed">
          {error}
        </p>
      )}

      <Dialog
        open={!!conflictSource}
        onOpenChange={(open) => {
          if (!open) setConflictSource(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-amber-600" />
              Bibliography changed in both places
            </DialogTitle>
            <DialogDescription>
              Both the{" "}
              {conflictSource?.kind === "citedrive"
                ? "CiteDrive bibliography"
                : "external JabRef library"}{" "}
              and <strong>{conflictSource?.targetRelativePath}</strong> have
              changed since the last refresh. Replacing the project copy will
              discard its local changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflictSource(null)}>
              Keep project copy
            </Button>
            <Button variant="destructive" onClick={replaceProjectCopy}>
              Replace project copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SourceSectionProps<T extends ExternalBibliographySource> {
  projectRoot: string | null;
  sources: T[];
  syncingSourceId: string | null;
  onRefresh: (source: T) => Promise<void>;
  onUnlink: (sourceId: string) => void;
}

function JabRefSourceSection({
  projectRoot,
  sources,
  syncingSourceId,
  onRefresh,
  onUnlink,
}: SourceSectionProps<JabRefBibliographySource>) {
  const linkJabRef = useReferenceSourcesStore((state) => state.linkJabRef);

  const handleLink = async () => {
    const selected = await openFileDialog({
      multiple: false,
      directory: false,
      title: "Link a JabRef or BibTeX library",
      filters: [{ name: "BibTeX library", extensions: ["bib"] }],
    });
    if (typeof selected !== "string") return;
    const source = await linkJabRef(selected);
    if (source) {
      toast.success(`Linked ${source.name}`, {
        description: `Project copy: ${source.targetRelativePath}`,
      });
    } else {
      showLinkError();
    }
  };

  return (
    <SourceSection
      title="JabRef / BibTeX file"
      description="Link an external .bib library and refresh a protected project copy when JabRef changes."
      icon={DatabaseIcon}
      actionLabel="Link .bib file"
      projectRoot={projectRoot}
      sources={sources}
      syncingSourceId={syncingSourceId}
      onAction={handleLink}
      onRefresh={onRefresh}
      onUnlink={onUnlink}
      sourceTitle={(source) => source.sourcePath}
    />
  );
}

function CiteDriveSourceSection({
  projectRoot,
  sources,
  syncingSourceId,
  onRefresh,
  onUnlink,
}: SourceSectionProps<CiteDriveBibliographySource>) {
  const linkCiteDrive = useReferenceSourcesStore(
    (state) => state.linkCiteDrive,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");

  const handleLink = async () => {
    const source = await linkCiteDrive(sourceUrl);
    if (!source) {
      showLinkError();
      return;
    }
    toast.success("Connected CiteDrive", {
      description: `Project copy: ${source.targetRelativePath}`,
    });
    setSourceUrl("");
    setDialogOpen(false);
  };

  return (
    <>
      <SourceSection
        title="CiteDrive"
        description="Connect a project's dynamic .bib URL and pull updates into a protected project copy."
        icon={CloudIcon}
        actionLabel="Connect CiteDrive"
        projectRoot={projectRoot}
        sources={sources}
        syncingSourceId={syncingSourceId}
        onAction={() => setDialogOpen(true)}
        onRefresh={onRefresh}
        onUnlink={onUnlink}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleLink();
            }}
          >
            <DialogHeader>
              <DialogTitle>Connect CiteDrive</DialogTitle>
              <DialogDescription>
                In CiteDrive, open Connect Project and copy the dynamic .bib
                URL. The URL is stored locally and is not shown in the source
                list.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label
                htmlFor="citedrive-source-url"
                className="mb-1.5 block font-medium text-xs"
              >
                Dynamic bibliography URL
              </label>
              <Input
                id="citedrive-source-url"
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://api.citedrive.com/bib/…/references.bib?x=…"
                autoComplete="off"
                spellCheck={false}
                required
              />
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Sync is currently one-way: refreshing replaces the project copy
                after checking for local changes.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!sourceUrl.trim() || !!syncingSourceId}
              >
                {syncingSourceId ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <CloudIcon className="size-4" />
                )}
                Connect
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SharedSourceSectionProps<T extends ExternalBibliographySource>
  extends SourceSectionProps<T> {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  actionLabel: string;
  onAction: () => void | Promise<void>;
  sourceTitle?: (source: T) => string;
}

function SourceSection<T extends ExternalBibliographySource>({
  title,
  description,
  icon: Icon,
  actionLabel,
  projectRoot,
  sources,
  syncingSourceId,
  onAction,
  onRefresh,
  onUnlink,
  sourceTitle,
}: SharedSourceSectionProps<T>) {
  const busy = !!syncingSourceId;

  return (
    <section className="border-sidebar-border border-b px-2 py-2">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-xs">{title}</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          onClick={onAction}
          title={actionLabel}
          aria-label={actionLabel}
          disabled={!projectRoot || busy}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      {sources.length === 0 ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 text-xs"
          onClick={onAction}
          disabled={!projectRoot || busy}
        >
          {busy ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <PlusIcon className="size-3" />
          )}
          {actionLabel}
        </Button>
      ) : (
        <div className="mt-2 space-y-1">
          {sources.map((source) => (
            <div
              key={source.id}
              className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-sidebar-accent/50"
              title={sourceTitle?.(source)}
            >
              <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-xs">{source.name}</p>
                <p className="truncate text-[9px] text-muted-foreground">
                  {source.targetRelativePath} · synced{" "}
                  {new Date(source.lastSyncedAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-foreground focus:opacity-100 disabled:opacity-30 group-hover:opacity-100"
                onClick={() => onRefresh(source)}
                disabled={busy}
                title={`Refresh ${source.name}`}
                aria-label={`Refresh ${source.name}`}
              >
                {syncingSourceId === source.id ? (
                  <LoaderIcon className="size-3 animate-spin" />
                ) : (
                  <RefreshCwIcon className="size-3" />
                )}
              </button>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-foreground focus:opacity-100 disabled:opacity-30 group-hover:opacity-100"
                onClick={() => onUnlink(source.id)}
                disabled={busy}
                title="Unlink source; keep project file"
                aria-label={`Unlink ${source.name}`}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function showLinkError() {
  toast.error(
    useReferenceSourcesStore.getState().error ??
      "Could not link the bibliography",
  );
}
