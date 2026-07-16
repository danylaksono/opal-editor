import { useEffect, useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmPackageRequirements,
  type LatexFeature,
} from "@/lib/feature-packages";
import {
  createTableModel,
  pasteTsv,
  serializeTable,
  type TableModel,
} from "@/lib/latex-tables";

interface TableEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (source: string) => void;
  initialModel?: TableModel;
}

export function TableEditor({
  open,
  onOpenChange,
  onInsert,
  initialModel,
}: TableEditorProps) {
  const [model, setModel] = useState(() => initialModel ?? createTableModel());
  useEffect(() => {
    if (open) setModel(initialModel ?? createTableModel());
  }, [initialModel, open]);
  const source = useMemo(
    () => (model.unsupported ? model.originalSource : serializeTable(model)),
    [model],
  );

  const updateCell = (row: number, column: number, value: string) =>
    setModel((current) => ({
      ...current,
      rows: current.rows.map((values, rowIndex) =>
        rowIndex === row
          ? values.map((cell, columnIndex) =>
              columnIndex === column ? value : cell,
            )
          : values,
      ),
    }));
  const addRow = () =>
    setModel((current) => ({
      ...current,
      rows: [...current.rows, current.columns.map(() => "")],
    }));
  const removeRow = (row: number) =>
    setModel((current) => ({
      ...current,
      rows: current.rows.filter((_, index) => index !== row),
    }));
  const moveRow = (row: number, offset: number) =>
    setModel((current) => {
      const target = row + offset;
      if (target < 0 || target >= current.rows.length) return current;
      const rows = [...current.rows];
      [rows[row], rows[target]] = [rows[target], rows[row]];
      return { ...current, rows };
    });
  const addColumn = () =>
    setModel((current) => ({
      ...current,
      columns: [...current.columns, { alignment: "l" }],
      rows: current.rows.map((row) => [...row, ""]),
    }));
  const removeColumn = (column: number) =>
    setModel((current) => ({
      ...current,
      columns: current.columns.filter((_, index) => index !== column),
      rows: current.rows.map((row) =>
        row.filter((_, index) => index !== column),
      ),
    }));

  const insert = async () => {
    const features: LatexFeature[] = ["tables"];
    if (model.booktabs) features.push("professional-tables");
    if (model.tabularEnvironment === "tabularx")
      features.push("flexible-tables");
    if (!(await confirmPackageRequirements(features))) return;
    onInsert(source);
    onOpenChange(false);
  };

  if (model.unsupported) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Table summary</DialogTitle>
            <DialogDescription>{model.unsupportedReason}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">
            {model.originalSource}
          </pre>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Edit source</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-4xl overflow-y-auto"
        aria-describedby="table-editor-description"
      >
        <DialogHeader>
          <DialogTitle>Table editor</DialogTitle>
          <DialogDescription id="table-editor-description">
            Cells keep their LaTeX source. Paste spreadsheet rows as TSV.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="table-caption">Caption</Label>
            <Input
              id="table-caption"
              value={model.caption}
              onChange={(event) =>
                setModel({ ...model, caption: event.target.value })
              }
            />
          </div>
          <div>
            <Label htmlFor="table-label">Label</Label>
            <Input
              id="table-label"
              value={model.label}
              onChange={(event) =>
                setModel({ ...model, label: event.target.value })
              }
              placeholder="tab:results"
            />
          </div>
          <div>
            <Label htmlFor="table-placement">Placement</Label>
            <Input
              id="table-placement"
              value={model.placement}
              onChange={(event) =>
                setModel({ ...model, placement: event.target.value })
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={addRow}>
            <PlusIcon /> Row
          </Button>
          <Button size="sm" variant="outline" onClick={addColumn}>
            <PlusIcon /> Column
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={model.booktabs}
              onChange={(event) =>
                setModel({ ...model, booktabs: event.target.checked })
              }
            />{" "}
            Professional rules
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={model.tabularEnvironment === "tabularx"}
              onChange={(event) =>
                setModel({
                  ...model,
                  tabularEnvironment: event.target.checked
                    ? "tabularx"
                    : "tabular",
                })
              }
            />{" "}
            Fit page width
          </label>
        </div>
        <div
          className="overflow-x-auto rounded border"
          role="grid"
          aria-label="Table cells"
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-24 p-1" />
                {model.columns.map((column, index) => (
                  <th key={`column-${index}`} className="min-w-32 border-l p-1">
                    <div className="flex items-center gap-1">
                      <select
                        aria-label={`Column ${index + 1} alignment`}
                        className="h-8 flex-1 rounded border bg-background px-2"
                        value={column.alignment}
                        onChange={(event) =>
                          setModel((current) => ({
                            ...current,
                            columns: current.columns.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    alignment: event.target
                                      .value as typeof item.alignment,
                                  }
                                : item,
                            ),
                          }))
                        }
                      >
                        <option value="l">Left</option>
                        <option value="c">Centre</option>
                        <option value="r">Right</option>
                        <option value="X">Flexible</option>
                      </select>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete column ${index + 1}`}
                        disabled={model.columns.length === 1}
                        onClick={() => removeColumn(index)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  <th className="border-t p-1">
                    <div className="flex">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move row ${rowIndex + 1} up`}
                        onClick={() => moveRow(rowIndex, -1)}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move row ${rowIndex + 1} down`}
                        onClick={() => moveRow(rowIndex, 1)}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete row ${rowIndex + 1}`}
                        disabled={model.rows.length === 1}
                        onClick={() => removeRow(rowIndex)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </th>
                  {row.map((cell, columnIndex) => (
                    <td
                      key={`cell-${rowIndex}-${columnIndex}`}
                      className="border-t border-l p-1"
                    >
                      <Input
                        aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                        value={cell}
                        onChange={(event) =>
                          updateCell(rowIndex, columnIndex, event.target.value)
                        }
                        onPaste={(event) => {
                          const text =
                            event.clipboardData.getData("text/plain");
                          if (text.includes("\t") || text.includes("\n")) {
                            event.preventDefault();
                            setModel(pasteTsv(model, text));
                          }
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <Label htmlFor="table-tsv">Paste TSV</Label>
          <Textarea
            id="table-tsv"
            className="font-mono text-xs"
            placeholder={"Name\tValue\nAlpha\t10"}
            onPaste={(event) => {
              event.preventDefault();
              setModel(
                pasteTsv(model, event.clipboardData.getData("text/plain")),
              );
            }}
          />
        </div>
        <details>
          <summary className="cursor-pointer text-sm">Source preview</summary>
          <pre className="mt-2 max-h-52 overflow-auto rounded bg-muted p-3 text-xs">
            {source}
          </pre>
        </details>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={insert}>
            {initialModel ? "Update table" : "Insert table"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
