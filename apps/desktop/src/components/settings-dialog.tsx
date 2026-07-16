import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTheme } from "next-themes";
import {
  MonitorIcon,
  MoonIcon,
  SunIcon,
  PaletteIcon,
  FileCogIcon,
  TerminalIcon,
  DownloadIcon,
  Loader2Icon,
  CheckCircle2Icon,
  CircleIcon,
  InfoIcon,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useUvSetupStore } from "@/stores/uv-setup-store";
import { AiSettings } from "@/components/ai-settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const themeOptions = [
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
  { id: "system", label: "System", icon: MonitorIcon },
] as const;

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure the editor, appearance, and optional AI assistance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <AppearanceSection />
          <EditorSection />
          <AiSettings />
          <PythonSection />
          <div className="space-y-2">
            <SectionHeading icon={InfoIcon} title="About" />
            <p className="text-muted-foreground text-xs">
              Bibliography metadata imported from arXiv is provided by arXiv and
              is subject to arXiv's API terms. DOI metadata may be provided by
              Crossref; ISBN metadata by Open Library.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: typeof PaletteIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      <h3 className="font-medium text-sm">{title}</h3>
    </div>
  );
}

function AppearanceSection() {
  const { theme = "system", setTheme } = useTheme();
  return (
    <div className="space-y-3">
      <SectionHeading icon={PaletteIcon} title="Appearance" />
      <div className="grid grid-cols-3 gap-2">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const active = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors",
                active
                  ? "border-ring bg-accent/50"
                  : "border-border hover:bg-muted/50",
              )}
              onClick={() => setTheme(option.id)}
            >
              <Icon className="size-4" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EditorSection() {
  const compilerBackend = useSettingsStore((s) => s.compilerBackend);
  const setCompilerBackend = useSettingsStore((s) => s.setCompilerBackend);
  const vimMode = useSettingsStore((s) => s.vimMode);
  const setVimMode = useSettingsStore((s) => s.setVimMode);
  const lensExperimental = useSettingsStore((s) => s.lensExperimental);
  const setLensExperimental = useSettingsStore((s) => s.setLensExperimental);

  return (
    <div className="space-y-3">
      <SectionHeading icon={FileCogIcon} title="Editor" />

      <div className="space-y-1.5">
        <span className="text-muted-foreground text-xs">Compiler backend</span>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["tectonic", "Tectonic", "Embedded, offline"],
              ["texlive", "TeX Live", "System install"],
            ] as const
          ).map(([id, label, detail]) => {
            const active = compilerBackend === id;
            return (
              <button
                key={id}
                type="button"
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-ring bg-accent/50"
                    : "border-border hover:bg-muted/50",
                )}
                onClick={() => setCompilerBackend(id)}
              >
                <span className="font-medium text-sm">{label}</span>
                <span className="text-muted-foreground text-xs">{detail}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div>
          <div className="font-medium text-sm">Vim mode</div>
          <div className="text-muted-foreground text-xs">
            Modal editing keybindings
          </div>
        </div>
        <input
          type="checkbox"
          checked={vimMode}
          onChange={(e) => setVimMode(e.target.checked)}
          className="size-4 accent-primary"
        />
      </label>
      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div>
          <div className="font-medium text-sm">Source Lens (experimental)</div>
          <div className="text-muted-foreground text-xs">
            Source-preserving visual summaries for recognised LaTeX
          </div>
        </div>
        <input
          type="checkbox"
          checked={lensExperimental}
          onChange={(event) => setLensExperimental(event.target.checked)}
          className="size-4 accent-primary"
        />
      </label>
    </div>
  );
}

function PythonSection() {
  const uvStatus = useUvSetupStore((s) => s.status);
  const uvVersion = useUvSetupStore((s) => s.version);
  const uvInstalling = useUvSetupStore((s) => s.isInstalling);
  const checkUv = useUvSetupStore((s) => s.checkStatus);
  const installUv = useUvSetupStore((s) => s.install);
  const finishUvInstall = useUvSetupStore((s) => s._finishInstall);

  useEffect(() => {
    checkUv();
  }, [checkUv]);

  useEffect(() => {
    const unlisten = listen<boolean>("uv-install-complete", (event) => {
      finishUvInstall(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [finishUvInstall]);

  const ready = uvStatus === "ready";
  const detail = uvInstalling
    ? "Installing…"
    : ready
      ? (uvVersion ?? "Installed")
      : uvStatus === "checking"
        ? "Checking…"
        : "Not installed";

  return (
    <div className="space-y-3">
      <SectionHeading icon={TerminalIcon} title="Python Environment" />
      <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5">
        {ready ? (
          <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
        ) : (
          <CircleIcon className="size-4 shrink-0 text-muted-foreground/40" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">uv</div>
          <div className="truncate text-muted-foreground text-xs">{detail}</div>
        </div>
        {uvStatus === "not-installed" && !uvInstalling && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={installUv}
          >
            <DownloadIcon className="mr-1 size-3" />
            Install
          </Button>
        )}
        {uvInstalling && (
          <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>
      <p className="text-muted-foreground/70 text-xs">
        Optional. Enables running Python scripts and generating plots from
        within a project.
      </p>
    </div>
  );
}
