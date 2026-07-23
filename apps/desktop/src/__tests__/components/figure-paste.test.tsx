import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { FigurePicker } from "@/components/workspace/figure-picker";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";

const mainFile: ProjectFile = {
  id: "main.tex",
  name: "main.tex",
  relativePath: "main.tex",
  absolutePath: "/project/main.tex",
  type: "tex",
  content: "\\documentclass{article}",
  isDirty: false,
};

const pastedFile = new File([new Uint8Array([137, 80, 78, 71])], "image.png", {
  type: "image/png",
});

beforeAll(() => {
  // jsdom does not implement object URLs
  URL.createObjectURL = vi.fn(() => "blob:mock-preview");
  URL.revokeObjectURL = vi.fn();
});

describe("paste image to figure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("writes the pasted image only on Insert and uses the deduped path", async () => {
    const importImageBytes = vi
      .fn()
      .mockResolvedValue("figures/pasted (1).png");
    const onInsert = vi.fn();
    const onOpenChange = vi.fn();
    useDocumentStore.setState({ importImageBytes });
    render(
      <FigurePicker
        open
        onOpenChange={onOpenChange}
        files={[mainFile]}
        onInsert={onInsert}
        pendingImage={pastedFile}
      />,
    );
    expect(screen.getByAltText("Pasted image preview")).toBeTruthy();
    expect(importImageBytes).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Insert" }));
    await waitFor(() => expect(importImageBytes).toHaveBeenCalledOnce());
    const [bytes, folder, name] = importImageBytes.mock.calls[0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(folder).toBe("figures");
    expect(name).toMatch(/^pasted-\d{8}-\d{6}\.png$/);
    // The inserted LaTeX uses the actual written (deduplicated) path
    expect(onInsert).toHaveBeenCalledWith(
      expect.stringContaining("figures/pasted (1).png"),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not write anything when the dialog is cancelled", async () => {
    const importImageBytes = vi.fn();
    const onOpenChange = vi.fn();
    useDocumentStore.setState({ importImageBytes });
    render(
      <FigurePicker
        open
        onOpenChange={onOpenChange}
        files={[mainFile]}
        onInsert={vi.fn()}
        pendingImage={pastedFile}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(importImageBytes).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sanitises a user-provided filename before writing", async () => {
    const importImageBytes = vi.fn().mockResolvedValue("figures/chart.png");
    useDocumentStore.setState({ importImageBytes });
    render(
      <FigurePicker
        open
        onOpenChange={vi.fn()}
        files={[mainFile]}
        onInsert={vi.fn()}
        pendingImage={pastedFile}
      />,
    );
    fireEvent.change(screen.getByLabelText("Image file name"), {
      target: { value: "sub\\dir/my chart" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Insert" }));
    await waitFor(() => expect(importImageBytes).toHaveBeenCalledOnce());
    expect(importImageBytes.mock.calls[0][2]).toBe("subdirmy-chart.png");
  });

  it("dispatches the paste event when an image is pasted into the dialog", () => {
    const listener = vi.fn();
    window.addEventListener("image-pasted-for-figure", listener);
    render(
      <FigurePicker
        open
        onOpenChange={vi.fn()}
        files={[mainFile]}
        onInsert={vi.fn()}
      />,
    );
    fireEvent.paste(screen.getByRole("dialog"), {
      clipboardData: { types: [], files: [pastedFile] },
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(
      (listener.mock.calls[0][0] as CustomEvent<{ file: File }>).detail.file,
    ).toBe(pastedFile);
    window.removeEventListener("image-pasted-for-figure", listener);
  });

  it("ignores dialog pastes that carry text", () => {
    const listener = vi.fn();
    window.addEventListener("image-pasted-for-figure", listener);
    render(
      <FigurePicker
        open
        onOpenChange={vi.fn()}
        files={[mainFile]}
        onInsert={vi.fn()}
      />,
    );
    fireEvent.paste(screen.getByRole("dialog"), {
      clipboardData: { types: ["text/plain"], files: [pastedFile] },
    });
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("image-pasted-for-figure", listener);
  });
});
