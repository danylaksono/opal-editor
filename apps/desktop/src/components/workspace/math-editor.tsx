import { useEffect, useMemo, useState } from "react";
import katex from "katex";
import { useResizableDialog } from "@/hooks/use-resizable-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { confirmPackageRequirements } from "@/lib/feature-packages";
import {
  delimiterDiagnostic,
  serializeMath,
  type MathKind,
} from "@/lib/latex-math";

const SYMBOLS = [
  "\\alpha",
  "\\beta",
  "\\gamma",
  "\\sum_{i=1}^{n}",
  "\\frac{}{}",
  "\\sqrt{}",
  "\\infty",
  "\\leq",
  "\\times",
  "\\mathbf{}",
];
const TEMPLATES: Array<{ label: string; source: string }> = [
  { label: "Fraction", source: "\\frac{numerator}{denominator}" },
  { label: "Integral", source: "\\int_{a}^{b} f(x)\\,dx" },
  { label: "Matrix", source: "\\begin{matrix} a & b \\\\ c & d \\end{matrix}" },
  {
    label: "Cases",
    source: "f(x)=\\begin{cases} x & x>0 \\\\ 0 & x\\leq0 \\end{cases}",
  },
];

interface MathEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (source: string) => void;
  initialKind?: MathKind;
  initialBody?: string;
}

export function MathEditor({
  open,
  onOpenChange,
  onInsert,
  initialKind,
  initialBody,
}: MathEditorProps) {
  const [kind, setKind] = useState<MathKind>(initialKind ?? "equation");
  const [body, setBody] = useState(initialBody ?? "E = mc^2");
  useEffect(() => {
    if (open) {
      setKind(initialKind ?? "equation");
      setBody(initialBody ?? "E = mc^2");
    }
  }, [initialBody, initialKind, open]);
  const diagnostic = delimiterDiagnostic(body);
  const preview = useMemo(() => {
    try {
      return {
        html: katex.renderToString(body, {
          displayMode: kind !== "inline",
          throwOnError: true,
        }),
      };
    } catch (error) {
      return {
        html: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [body, kind]);
  const insert = async () => {
    if (
      !["inline", "display"].includes(kind) &&
      !(await confirmPackageRequirements(["mathematics"]))
    )
      return;
    onInsert(serializeMath(kind, body));
    onOpenChange(false);
  };
  const { style: widthStyle, handle: resizeHandle } = useResizableDialog({
    storageKey: "tectonic-editor-math-editor-width",
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        style={widthStyle}
        aria-describedby="math-editor-description"
      >
        {resizeHandle}
        <DialogHeader>
          <DialogTitle>Math editor</DialogTitle>
          <DialogDescription id="math-editor-description">
            Write LaTeX with a live preview, symbols, and structural templates.
          </DialogDescription>
        </DialogHeader>
        <select
          aria-label="Math structure"
          className="h-9 rounded border bg-background px-3"
          value={kind}
          onChange={(event) => setKind(event.target.value as MathKind)}
        >
          <option value="inline">Inline math</option>
          <option value="display">Display math</option>
          <option value="equation">Numbered equation</option>
          <option value="align">Aligned equations</option>
          <option value="gather">Gathered equations</option>
          <option value="matrix">Matrix</option>
          <option value="cases">Cases</option>
        </select>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Math symbols"
        >
          {SYMBOLS.map((symbol) => (
            <Button
              key={symbol}
              size="sm"
              variant="outline"
              onClick={() => setBody((value) => `${value}${symbol}`)}
            >
              {symbol}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {TEMPLATES.map((template) => (
            <Button
              key={template.label}
              size="sm"
              variant="secondary"
              onClick={() => setBody(template.source)}
            >
              {template.label}
            </Button>
          ))}
        </div>
        <Textarea
          aria-label="Equation source"
          className="min-h-28 font-mono"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div
          aria-live="polite"
          className="min-h-20 overflow-auto rounded border bg-white p-4 text-black"
        >
          {preview.html ? (
            <div dangerouslySetInnerHTML={{ __html: preview.html }} />
          ) : (
            <div className="text-red-700 text-sm">{preview.error}</div>
          )}
        </div>
        {diagnostic && (
          <div className="text-amber-700 text-sm" role="status">
            Delimiter check: {diagnostic}
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-sm">Source preview</summary>
          <pre className="mt-2 rounded bg-muted p-3 text-xs">
            {serializeMath(kind, body)}
          </pre>
        </details>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={insert}>
            {initialKind ? "Update equation" : "Insert equation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
