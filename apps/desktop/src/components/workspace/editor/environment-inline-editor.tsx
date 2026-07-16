import { useEffect, useMemo, useRef, useState } from "react";
import { BoxesIcon, XIcon } from "lucide-react";
import {
  environmentGroup,
  updateEnvironmentSource,
  type EditableEnvironment,
  type EnvironmentMatch,
} from "@/lib/latex-environments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EnvironmentInlineEditorProps {
  target: EnvironmentMatch;
  position: { top: number; left: number };
  onApply: (source: string) => void;
  onDismiss: () => void;
}

export function EnvironmentInlineEditor({
  target,
  position,
  onApply,
  onDismiss,
}: EnvironmentInlineEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState<EditableEnvironment>(target.name);
  const [option, setOption] = useState(target.option);
  const compatibleEnvironments = useMemo(
    () => environmentGroup(target.name),
    [target.name],
  );
  const updatedSource = updateEnvironmentSource(target, { name, option });

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        editorRef.current &&
        !editorRef.current.contains(event.target as Node)
      ) {
        onDismiss();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("keydown", handleKeyDown);
    }, 100);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  return (
    <div
      ref={editorRef}
      role="dialog"
      aria-label="Edit LaTeX structure"
      className="absolute z-40 w-[380px] max-w-[calc(100%-16px)] overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      style={position}
    >
      <div className="flex items-center justify-between border-border border-b px-3 py-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <BoxesIcon className="size-4 text-muted-foreground" />
          Edit structure
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Close structure editor"
          onClick={onDismiss}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-3 p-3">
        <div className="space-y-1 text-muted-foreground text-xs">
          <span id="environment-type-label">Type</span>
          <Select
            value={name}
            onValueChange={(value) => setName(value as EditableEnvironment)}
          >
            <SelectTrigger
              aria-labelledby="environment-type-label"
              className="h-8! w-full text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {compatibleEnvironments.map((environment) => (
                <SelectItem key={environment} value={environment}>
                  {environment}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 text-muted-foreground text-xs">
          <label htmlFor="inline-environment-option">
            Optional title or options
          </label>
          <Input
            id="inline-environment-option"
            value={option}
            onChange={(event) => setOption(event.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="rounded-md bg-muted/50 px-2.5 py-2">
          <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
            Preserved source
          </div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">
            {updatedSource}
          </pre>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-border border-t px-3 py-2">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onApply(updatedSource)}>
          Apply
        </Button>
      </div>
    </div>
  );
}
