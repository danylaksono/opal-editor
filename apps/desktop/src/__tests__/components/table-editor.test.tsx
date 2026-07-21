import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableEditor } from "@/components/workspace/table-editor";

function cellValue(row: number, column: number): string {
  return (
    screen.getByRole("textbox", {
      name: `Row ${row}, column ${column}`,
    }) as HTMLInputElement
  ).value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TableEditor interactions", () => {
  it("explains float placement with simple choices and keeps custom access", async () => {
    render(<TableEditor open onOpenChange={vi.fn()} onInsert={vi.fn()} />);

    expect(
      (screen.getByLabelText("Near this text") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Top of a page") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Bottom of a page") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Separate floats page") as HTMLInputElement)
        .checked,
    ).toBe(true);

    await userEvent.click(screen.getByLabelText("Near this text"));
    await userEvent.click(screen.getByText("Advanced placement code"));
    expect(
      (screen.getByLabelText("Custom LaTeX code") as HTMLInputElement).value,
    ).toBe("tbp");
    expect(
      (screen.getByLabelText("Centre table on page") as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("reorders rows by dragging the row handle", () => {
    render(<TableEditor open onOpenChange={vi.fn()} onInsert={vi.fn()} />);
    // Default model: row 1 is "Header 1..3", rows 2-3 empty
    fireEvent.change(screen.getByRole("textbox", { name: "Row 2, column 1" }), {
      target: { value: "second" },
    });
    expect(cellValue(1, 1)).toBe("Header 1");

    const handle = screen.getByRole("button", {
      name: "Drag row 2 to reorder",
    });
    const firstRow = screen
      .getByRole("textbox", { name: "Row 1, column 1" })
      .closest("tr") as HTMLTableRowElement;
    // jsdom implements neither hit testing nor pointer capture
    document.elementFromPoint = vi.fn(() => firstRow);
    handle.setPointerCapture = vi.fn();

    // jsdom has no PointerEvent, and its plain-Event fallback drops `button`;
    // MouseEvent carries the fields the handlers read
    fireEvent(
      handle,
      new MouseEvent("pointerdown", { button: 0, bubbles: true }),
    );
    // jsdom rects are all zeros, so clientY 0 is not past the midpoint →
    // the drop lands above row 1
    fireEvent(
      handle,
      new MouseEvent("pointermove", { clientX: 0, clientY: 0, bubbles: true }),
    );
    fireEvent(handle, new MouseEvent("pointerup", { bubbles: true }));

    expect(cellValue(1, 1)).toBe("second");
    expect(cellValue(2, 1)).toBe("Header 1");
  });

  it("inserts a column via the cell context menu", async () => {
    render(<TableEditor open onOpenChange={vi.fn()} onInsert={vi.fn()} />);
    expect(
      screen.queryByRole("textbox", { name: "Row 1, column 4" }),
    ).toBeNull();

    fireEvent.contextMenu(
      screen.getByRole("textbox", { name: "Row 1, column 1" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Insert column right" }),
    );

    expect(
      screen.getByRole("textbox", { name: "Row 1, column 4" }),
    ).toBeTruthy();
    // Inserted at position 2: former column 2 content shifts right
    expect(cellValue(1, 2)).toBe("");
    expect(cellValue(1, 3)).toBe("Header 2");
  });

  it("deletes a row via the context menu and keeps the last row", async () => {
    render(<TableEditor open onOpenChange={vi.fn()} onInsert={vi.fn()} />);
    fireEvent.contextMenu(
      screen.getByRole("textbox", { name: "Row 1, column 1" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete row" }),
    );
    // Former row 2 (empty) is now row 1; the header row is gone
    expect(cellValue(1, 1)).toBe("");
    expect(
      screen.queryByRole("textbox", { name: "Row 3, column 1" }),
    ).toBeNull();
  });

  it("disables column actions when right-clicking a row handle", async () => {
    render(<TableEditor open onOpenChange={vi.fn()} onInsert={vi.fn()} />);
    const handle = screen.getByRole("button", {
      name: "Drag row 1 to reorder",
    });
    fireEvent.contextMenu(handle);
    const item = await screen.findByRole("menuitem", {
      name: "Delete column",
    });
    expect(item.getAttribute("data-disabled")).not.toBeNull();
  });
});
