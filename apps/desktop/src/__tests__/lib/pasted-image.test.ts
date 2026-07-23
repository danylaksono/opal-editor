import { describe, expect, it } from "vitest";
import {
  clipboardImageFile,
  defaultPastedImageName,
  extensionForMime,
  sanitizePastedImageName,
} from "@/lib/pasted-image";

describe("extensionForMime", () => {
  it("maps known mime types", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/svg+xml")).toBe("svg");
    expect(extensionForMime("IMAGE/WEBP")).toBe("webp");
  });

  it("falls back to png for unknown types", () => {
    expect(extensionForMime("image/tiff")).toBe("png");
  });
});

describe("defaultPastedImageName", () => {
  it("produces a timestamped name with the mime extension", () => {
    const fixed = new Date(2026, 6, 23, 14, 15, 30);
    expect(defaultPastedImageName("image/png", fixed)).toBe(
      "pasted-20260723-141530.png",
    );
    expect(defaultPastedImageName("image/jpeg", fixed)).toBe(
      "pasted-20260723-141530.jpg",
    );
  });
});

describe("sanitizePastedImageName", () => {
  it("strips path separators and illegal characters", () => {
    expect(sanitizePastedImageName("..\\evil.png", "image/png")).toBe(
      "evil.png",
    );
    expect(sanitizePastedImageName("sub/dir/chart.png", "image/png")).toBe(
      "subdirchart.png",
    );
    expect(sanitizePastedImageName('a<b>:c"d|e?f*.png', "image/png")).toBe(
      "abcdef.png",
    );
  });

  it("replaces whitespace with dashes", () => {
    expect(sanitizePastedImageName("my nice chart.png", "image/png")).toBe(
      "my-nice-chart.png",
    );
  });

  it("appends the mime extension when missing", () => {
    expect(sanitizePastedImageName("chart", "image/png")).toBe("chart.png");
    expect(sanitizePastedImageName("chart.", "image/jpeg")).toBe("chart.jpg");
  });

  it("keeps an existing valid image extension", () => {
    expect(sanitizePastedImageName("chart.jpeg", "image/png")).toBe(
      "chart.jpeg",
    );
  });

  it("falls back to the default name when empty", () => {
    expect(sanitizePastedImageName("   ", "image/png")).toMatch(
      /^pasted-\d{8}-\d{6}\.png$/,
    );
    expect(sanitizePastedImageName("...", "image/png")).toMatch(
      /^pasted-\d{8}-\d{6}\.png$/,
    );
  });
});

describe("clipboardImageFile", () => {
  const pngFile = new File([new Uint8Array([1, 2, 3])], "shot.png", {
    type: "image/png",
  });

  it("returns the image for an image-only clipboard", () => {
    const data = { types: [], files: [pngFile] } as unknown as DataTransfer;
    expect(clipboardImageFile(data)).toBe(pngFile);
  });

  it("returns null when text/plain is present (mixed clipboard)", () => {
    const data = {
      types: ["text/plain", "text/html"],
      files: [pngFile],
    } as unknown as DataTransfer;
    expect(clipboardImageFile(data)).toBeNull();
  });

  it("returns null when no image file exists", () => {
    const textFile = new File(["hello"], "note.txt", { type: "text/plain" });
    const data = { types: [], files: [textFile] } as unknown as DataTransfer;
    expect(clipboardImageFile(data)).toBeNull();
    expect(clipboardImageFile(null)).toBeNull();
  });
});
