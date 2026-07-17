import { MonitorIcon, MoonIcon, SunIcon, CheckIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  editorHighlightOptions,
  workspacePaletteOptions,
} from "@/lib/appearance";
import { useSettingsStore } from "@/stores/settings-store";

const themeOptions = [
  {
    id: "light",
    label: "Light",
    icon: SunIcon,
    swatch: "bg-white",
  },
  {
    id: "dark",
    label: "Dark",
    icon: MoonIcon,
    swatch: "bg-neutral-900",
  },
  {
    id: "system",
    label: "System",
    icon: MonitorIcon,
    swatch: "bg-linear-to-br from-white to-neutral-900",
  },
] as const;

export function AppearancePopover() {
  const { theme = "system", resolvedTheme, setTheme } = useTheme();
  const workspacePalette = useSettingsStore((state) => state.workspacePalette);
  const setWorkspacePalette = useSettingsStore(
    (state) => state.setWorkspacePalette,
  );
  const editorHighlightTheme = useSettingsStore(
    (state) => state.editorHighlightTheme,
  );
  const setEditorHighlightTheme = useSettingsStore(
    (state) => state.setEditorHighlightTheme,
  );
  const activeOption =
    themeOptions.find((option) => option.id === theme) ?? themeOptions[2];
  const ActiveIcon = activeOption.icon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          title="Appearance"
          aria-label="Appearance"
        >
          <ActiveIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        className="w-72 border-sidebar-border bg-sidebar p-2 text-sidebar-foreground"
      >
        <div className="px-2 py-1.5">
          <div className="font-medium text-xs">Appearance</div>
          <div className="text-muted-foreground text-xs">
            Workspace mode: {resolvedTheme ?? "system"}
          </div>
        </div>
        <div className="mt-1 grid gap-1">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const active = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
                onClick={() => setTheme(option.id)}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded border border-sidebar-border",
                    option.swatch,
                  )}
                >
                  <Icon className="size-3 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {active && <CheckIcon className="size-3.5" />}
              </button>
            );
          })}
        </div>
        <div className="mt-2 border-sidebar-border border-t px-2 pt-2">
          <div className="mb-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
            Colour palette
          </div>
          <div className="grid grid-cols-2 gap-1">
            {workspacePaletteOptions.map((option) => {
              const active = workspacePalette === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent",
                    active && "bg-sidebar-accent",
                  )}
                  onClick={() => setWorkspacePalette(option.id)}
                  title={option.description}
                >
                  <span className="flex overflow-hidden rounded border border-sidebar-border">
                    {option.swatches.map((colour) => (
                      <span
                        key={colour}
                        className="h-4 w-2"
                        style={{ backgroundColor: colour }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                  {active && <CheckIcon className="size-3" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2 border-sidebar-border border-t px-2 pt-2">
          <div className="mb-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
            Editor highlighting
          </div>
          <div className="grid grid-cols-2 gap-1">
            {editorHighlightOptions.map((option) => {
              const active = editorHighlightTheme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent",
                    active && "bg-sidebar-accent",
                  )}
                  onClick={() => setEditorHighlightTheme(option.id)}
                  title={option.description}
                >
                  <span
                    className="size-4 rounded border border-sidebar-border"
                    style={{
                      background: `linear-gradient(135deg, ${option.swatches[0]} 0 45%, ${option.swatches[1]} 45% 70%, ${option.swatches[2]} 70%)`,
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                  {active && <CheckIcon className="size-3" />}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
