import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useResizableDialog } from "@/hooks/use-resizable-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { cn } from "@/lib/utils";
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

/** Cell the context menu acts on. `column` is -1 for row-handle clicks. */
interface MenuTarget {
  row: number;
  column: number;
}

interface DropIndicator {
  row: number;
  after: boolean;
}

export function TableEditor({
  open,
  onOpenChange,
  onInsert,
  initialModel,
}: TableEditorProps) {
  const [model, setModel] = useState(() => initialModel ?? createTableModel());
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [dragRow, setDragRow] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null,
  );
  useEffect(() => {
    if (open) {
      setModel(initialModel ?? createTableModel());
      setMenuTarget(null);
      setDragRow(null);
      setDropIndicator(null);
    }
  }, [initialModel, open]);

  const { style: widthStyle, handle: resizeHandle } = useResizableDialog({
    storageKey: "tectonic-editor-table-editor-width",
    minWidth: 520,
  });
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
  const insertRow = (index: number) =>
    setModel((current) => {
      const rows = [...current.rows];
      rows.splice(
        index,
        0,
        current.columns.map(() => ""),
      );
      return { ...current, rows };
    });
  const addRow = () => insertRow(model.rows.length);
  const removeRow = (row: number) =>
    setModel((current) =>
      current.rows.length === 1
        ? current
        : {
            ...current,
            rows: current.rows.filter((_, index) => index !== row),
          },
    );
  const moveRow = (row: number, offset: number) =>
    setModel((current) => {
      const target = row + offset;
      if (target < 0 || target >= current.rows.length) return current;
      const rows = [...current.rows];
      [rows[row], rows[target]] = [rows[target], rows[row]];
      return { ...current, rows };
    });
  /** Move the dragged row so it lands at `insertIndex` (pre-removal index). */
  const reorderRow = (from: number, insertIndex: number) =>
    setModel((current) => {
      const to = from < insertIndex ? insertIndex - 1 : insertIndex;
      if (to === from) return current;
      const rows = [...current.rows];
      const [moved] = rows.splice(from, 1);
      rows.splice(to, 0, moved);
      return { ...current, rows };
    });
  const insertColumn = (index: number) =>
    setModel((current) => {
      const columns = [...current.columns];
      columns.splice(index, 0, { alignment: "l" });
      return {
        ...current,
        columns,
        rows: current.rows.map((row) => {
          const cells = [...row];
          cells.splice(index, 0, "");
          return cells;
        }),
      };
    });
  const addColumn = () => insertColumn(model.columns.length);
  const removeColumn = (column: number) =>
    setModel((current) =>
      current.columns.length === 1
        ? current
        : {
            ...current,
            columns: current.columns.filter((_, index) => index !== column),
            rows: current.rows.map((row) =>
              row.filter((_, index) => index !== column),
            ),
          },
    );
  const moveColumn = (column: number, offset: number) =>
    setModel((current) => {
      const target = column + offset;
      if (target < 0 || target >= current.columns.length) return current;
      const columns = [...current.columns];
      [columns[column], columns[target]] = [columns[target], columns[column]];
      return {
        ...current,
        columns,
        rows: current.rows.map((row) => {
          const cells = [...row];
          [cells[column], cells[target]] = [cells[target], cells[column]];
          return cells;
        }),
      };
    });

  // Row reordering uses pointer capture instead of HTML5 drag-and-drop:
  // Tauri's native drag-drop handling (needed for OS file drops elsewhere in
  // the app) swallows HTML5 drag events in the WebView, so `draggable` never
  // fires here.
  const handleDragPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    row: number,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragRow(row);
  };
  const handleDragPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRow === null) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLTableRowElement>("tr[data-row-index]");
    if (!target) return;
    const row = Number(target.dataset.rowIndex);
    const rect = target.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDropIndicator((current) =>
      current?.row === row && current.after === after
        ? current
        : { row, after },
    );
  };
  const handleDragPointerUp = () => {
    if (dragRow !== null && dropIndicator !== null) {
      reorderRow(
        dragRow,
        dropIndicator.after ? dropIndicator.row + 1 : dropIndicator.row,
      );
    }
    setDragRow(null);
    setDropIndicator(null);
  };
  const endDrag = () => {
    setDragRow(null);
    setDropIndicator(null);
  };

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

  const targetRow = menuTarget?.row ?? -1;
  const targetColumn = menuTarget?.column ?? -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
        style={widthStyle}
        aria-describedby="table-editor-description"
      >
        {resizeHandle}
        <DialogHeader>
          <DialogTitle>Table editor</DialogTitle>
          <DialogDescription id="table-editor-description">
            Cells keep their LaTeX source. Paste spreadsheet rows as TSV. Drag
            the row handles to reorder; right-click cells for more options.
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
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="overflow-x-auto rounded border"
              role="grid"
              aria-label="Table cells"
            >
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-10 p-1" />
                    {model.columns.map((column, index) => (
                      <th
                        key={`column-${index}`}
                        className="min-w-32 border-l p-1"
                        onContextMenu={() =>
                          setMenuTarget({ row: -1, column: index })
                        }
                      >
                        <div className="flex items-center gap-1">
                          <select
                            aria-label={`Column ${index + 1} alignment`}
                            className="h-8 flex-1 rounded border bg-background px-2"
                            value={column.alignment}
                            onChange={(event) =>
                              setModel((current) => ({
                                ...current,
                                columns: current.columns.map(
                                  (item, itemIndex) =>
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
                    <tr
                      key={`row-${rowIndex}`}
                      className={cn(
                        dragRow === rowIndex && "opacity-50",
                        dropIndicator?.row === rowIndex &&
                          (dropIndicator.after
                            ? "[&>td]:border-b-2 [&>td]:border-b-primary [&>th]:border-b-2 [&>th]:border-b-primary"
                            : "[&>td]:border-t-2 [&>td]:border-t-primary [&>th]:border-t-2 [&>th]:border-t-primary"),
                      )}
                      data-row-index={rowIndex}
                    >
                      <th
                        className="border-t p-1"
                        onContextMenu={() =>
                          setMenuTarget({ row: rowIndex, column: -1 })
                        }
                      >
                        <button
                          type="button"
                          aria-label={`Drag row ${rowIndex + 1} to reorder`}
                          title="Drag to reorder"
                          className="flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                          onPointerDown={(event) =>
                            handleDragPointerDown(event, rowIndex)
                          }
                          onPointerMove={handleDragPointerMove}
                          onPointerUp={handleDragPointerUp}
                          onPointerCancel={endDrag}
                        >
                          <GripVerticalIcon className="size-4" />
                        </button>
                      </th>
                      {row.map((cell, columnIndex) => (
                        <td
                          key={`cell-${rowIndex}-${columnIndex}`}
                          className="border-t border-l p-1"
                          onContextMenu={() =>
                            setMenuTarget({
                              row: rowIndex,
                              column: columnIndex,
                            })
                          }
                        >
                          <Input
                            aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                            value={cell}
                            onChange={(event) =>
                              updateCell(
                                rowIndex,
                                columnIndex,
                                event.target.value,
                              )
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
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <ContextMenuItem
              disabled={targetRow < 0}
              onSelect={() => insertRow(targetRow)}
            >
              Insert row above
            </ContextMenuItem>
            <ContextMenuItem
              disabled={targetRow < 0}
              onSelect={() => insertRow(targetRow + 1)}
            >
              Insert row below
            </ContextMenuItem>
            <ContextMenuItem
              disabled={targetRow <= 0}
              onSelect={() => moveRow(targetRow, -1)}
            >
              Move row up
            </ContextMenuItem>
            <ContextMenuItem
              disabled={targetRow < 0 || targetRow >= model.rows.length - 1}
              onSelect={() => moveRow(targetRow, 1)}
            >
              Move row down
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              disabled={targetRow < 0 || model.rows.length === 1}
              onSelect={() => removeRow(targetRow)}
            >
              Delete row
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={targetColumn < 0}
              onSelect={() => insertColumn(targetColumn)}
            >
              Insert column left
            </ContextMenuItem>
            <ContextMenuItem
              disabled={targetColumn < 0}
              onSelect={() => insertColumn(targetColumn + 1)}
            >
              Insert column right
            </ContextMenuItem>
            <ContextMenuItem
              disabled={targetColumn <= 0}
              onSelect={() => moveColumn(targetColumn, -1)}
            >
              Move column left
            </ContextMenuItem>
            <ContextMenuItem
              disabled={
                targetColumn < 0 || targetColumn >= model.columns.length - 1
              }
              onSelect={() => moveColumn(targetColumn, 1)}
            >
              Move column right
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              disabled={targetColumn < 0 || model.columns.length === 1}
              onSelect={() => removeColumn(targetColumn)}
            >
              Delete column
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
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
