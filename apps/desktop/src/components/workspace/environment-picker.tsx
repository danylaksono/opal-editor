import { useState } from "react";
import { BoxesIcon } from "lucide-react";
import type { EditableEnvironment } from "@/lib/latex-environments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ENVIRONMENTS: Array<{
  name: EditableEnvironment;
  label: string;
  description: string;
  requires?: string;
}> = [
  {
    name: "itemize",
    label: "Bulleted list",
    description: "A list with bullet points",
  },
  {
    name: "enumerate",
    label: "Numbered list",
    description: "A numbered or lettered list",
  },
  {
    name: "equation",
    label: "Numbered equation",
    description: "One displayed equation",
  },
  {
    name: "equation*",
    label: "Unnumbered equation",
    description: "A displayed equation without a number",
  },
  {
    name: "align",
    label: "Aligned equations",
    description: "Multiple equations aligned at &",
    requires: "amsmath",
  },
  {
    name: "quote",
    label: "Short quotation",
    description: "An indented quotation",
  },
  { name: "abstract", label: "Abstract", description: "The document abstract" },
  {
    name: "theorem",
    label: "Theorem",
    description: "A theorem-style statement",
    requires: "theorem definition",
  },
];

interface EnvironmentPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (name: EditableEnvironment, option: string) => void;
}

export function EnvironmentPicker({
  open,
  onOpenChange,
  onInsert,
}: EnvironmentPickerProps) {
  const [selected, setSelected] = useState<EditableEnvironment>("itemize");
  const [option, setOption] = useState("");
  const insert = () => {
    onInsert(selected, option);
    setOption("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <BoxesIcon className="size-4 text-muted-foreground" />
            Insert structure
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {ENVIRONMENTS.map((environment) => (
            <button
              key={environment.name}
              type="button"
              className={cn(
                "rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted/60",
                selected === environment.name && "border-primary bg-primary/5",
              )}
              onClick={() => setSelected(environment.name)}
            >
              <span className="block font-medium text-sm">
                {environment.label}
              </span>
              <span className="block text-muted-foreground text-xs">
                {environment.description}
              </span>
              {environment.requires && (
                <span className="mt-1 block text-[10px] text-amber-600 dark:text-amber-400">
                  Requires {environment.requires}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="space-y-1 text-muted-foreground text-xs">
          <label htmlFor="environment-option">Optional title or options</label>
          <Input
            id="environment-option"
            value={option}
            onChange={(event) => setOption(event.target.value)}
            className="h-8 text-sm"
            placeholder="For example: A useful theorem"
          />
          <p>
            This becomes the environment’s optional argument. Leave it empty for
            the usual form.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={insert}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
