import type { PDFDocument } from "mupdf";

type MupdfModule = typeof import("mupdf");

type MupdfWasmModuleConfig = {
  locateFile?: (path: string) => string;
};

const wasmModuleConfig = ((
  globalThis as typeof globalThis & {
    $libmupdf_wasm_Module?: MupdfWasmModuleConfig;
  }
).$libmupdf_wasm_Module ??= {});

// In Vite dev, requests for /node_modules/.../mupdf-wasm.wasm can fall back to
// index.html. Pointing MuPDF at Vite's @fs URL keeps worker startup on the
// actual binary during local development without changing packaged builds.
if (import.meta.env.DEV) {
  const devWasmUrl = `/@fs/${__MUPDF_WASM_FS_PATH__}`;
  wasmModuleConfig.locateFile = (path: string) => {
    if (path.endsWith("mupdf-wasm.wasm")) {
      return devWasmUrl;
    }
    return path;
  };
}

const mupdf: MupdfModule = await import("mupdf");

const documentMap = new Map<number, PDFDocument>();
let nextDocId = 1;

const methods: Record<string, (...args: any[]) => any> = {};

methods.openDocument = (buffer: ArrayBuffer, magic: string): number => {
  const docId = nextDocId++;
  const doc = mupdf.Document.openDocument(
    buffer,
    magic,
  ) as unknown as PDFDocument;
  documentMap.set(docId, doc);
  return docId;
};

methods.closeDocument = (docId: number): void => {
  const doc = documentMap.get(docId);
  if (doc) {
    documentMap.delete(docId);
    // Explicitly free the WASM-side document. The FinalizationRegistry fallback
    // rarely fires (the JS GC sees only a tiny wrapper object while the WASM
    // heap balloons), so without this every closed document leaks its full
    // parsed PDF in the WASM heap.
    doc.destroy();
  }
};

methods.countPages = (docId: number): number => {
  const doc = documentMap.get(docId)!;
  return doc.countPages();
};

methods.getPageSize = (
  docId: number,
  pageIndex: number,
): { width: number; height: number } => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  const bounds = page.getBounds();
  page.destroy();
  return {
    width: bounds[2] - bounds[0],
    height: bounds[3] - bounds[1],
  };
};

methods.getAllPageSizes = (
  docId: number,
): { width: number; height: number }[] => {
  const doc = documentMap.get(docId)!;
  const count = doc.countPages();
  const sizes: { width: number; height: number }[] = [];
  for (let i = 0; i < count; i++) {
    const page = doc.loadPage(i);
    const bounds = page.getBounds();
    page.destroy();
    sizes.push({
      width: bounds[2] - bounds[0],
      height: bounds[3] - bounds[1],
    });
  }
  return sizes;
};

methods.drawPage = (
  docId: number,
  pageIndex: number,
  dpi: number,
): ImageData => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  const scale = dpi / 72;
  const matrix = mupdf.Matrix.scale(scale, scale);
  // alpha=false so the PDF's white background is rendered opaquely (RGB, 3 bytes/pixel)
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const w = pixmap.getWidth();
  const h = pixmap.getHeight();
  // getPixels() returns a live view into the WASM heap — copy out to RGBA
  // *before* destroying the pixmap (destroying first is a use-after-free).
  const rgb = pixmap.getPixels();
  // Convert RGB (3 bytes/pixel) → RGBA (4 bytes/pixel) for ImageData
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i];
    rgba[j + 1] = rgb[i + 1];
    rgba[j + 2] = rgb[i + 2];
    rgba[j + 3] = 255; // fully opaque
  }
  pixmap.destroy();
  page.destroy();
  return new ImageData(rgba, w, h);
};

methods.getPageText = (docId: number, pageIndex: number): unknown => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  const stext = page.toStructuredText("preserve-whitespace");
  const json = stext.asJSON();
  stext.destroy();
  page.destroy();
  const raw = JSON.parse(json);

  // Transform mupdf's nested spans format to our flat line format
  const blocks = (raw.blocks || []).map((block: any) => {
    if (block.type !== "text") return block;
    return {
      type: "text",
      bbox: block.bbox,
      lines: (block.lines || []).map((line: any) => {
        let text = "";
        let font = {
          name: "",
          family: "",
          size: 12,
          weight: "normal",
          style: "normal",
        };
        let baselineY = 0;

        const spans = line.spans || [];
        if (spans.length > 0) {
          text = spans
            .map((span: any) =>
              (span.chars || []).map((ch: any) => ch.c).join(""),
            )
            .join("");

          const firstSpan = spans[0];
          font = {
            name: firstSpan.font?.name || "",
            family: firstSpan.font?.family || "",
            size: firstSpan.size || 12,
            weight: firstSpan.font?.weight || "normal",
            style: firstSpan.font?.style || "normal",
          };

          // Use first char origin as baseline
          if (firstSpan.chars?.[0]?.origin) {
            baselineY = firstSpan.chars[0].origin.y;
          } else {
            baselineY = (line.bbox?.y || 0) + (line.bbox?.h || 0);
          }
        }

        return {
          bbox: line.bbox || { x: 0, y: 0, w: 0, h: 0 },
          wmode: line.wmode || 0,
          x: line.bbox?.x || 0,
          y: baselineY,
          text,
          font,
        };
      }),
    };
  });

  return { blocks };
};

methods.getPageLinks = (docId: number, pageIndex: number): unknown[] => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  const links = page.getLinks();
  const result = links.map((link: any) => {
    const bounds = link.getBounds();
    const uri: string = link.getURI() || "";
    const isExternal: boolean = link.isExternal?.() ?? uri.startsWith("http");
    let href: string;
    if (isExternal) {
      href = uri;
    } else {
      try {
        const resolved = doc.resolveLink(uri) as any;
        if (typeof resolved === "number") {
          href = `#page=${resolved + 1}`;
        } else if (resolved && typeof resolved.page === "number") {
          href = `#page=${resolved.page + 1}`;
        } else {
          href = uri;
        }
      } catch {
        href = uri;
      }
    }
    return {
      x: bounds[0],
      y: bounds[1],
      w: bounds[2] - bounds[0],
      h: bounds[3] - bounds[1],
      href,
      isExternal,
    };
  });
  for (const link of links) link.destroy?.();
  page.destroy();
  return result;
};

methods.renderThumbnail = (
  docId: number,
  pageIndex: number,
  targetWidth: number,
): ArrayBuffer => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  const bounds = page.getBounds();
  const pageWidth = bounds[2] - bounds[0];
  const retinaScale = 2;
  const scale = (targetWidth * retinaScale) / pageWidth;
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pixmap.asPNG();
  pixmap.destroy();
  page.destroy();
  return png.buffer as ArrayBuffer;
};

// RPC message handler
self.onmessage = (event: MessageEvent) => {
  const [func, id, args] = event.data as [string, number, unknown[]];
  try {
    const result = methods[func](...args);
    if (result instanceof ImageData) {
      postMessage(["RESULT", id, result], { transfer: [result.data.buffer] });
    } else if (result instanceof ArrayBuffer) {
      postMessage(["RESULT", id, result], { transfer: [result] });
    } else {
      postMessage(["RESULT", id, result]);
    }
  } catch (error: any) {
    postMessage(["ERROR", id, { name: error.name, message: error.message }]);
  }
};

postMessage(["INIT", 0, Object.keys(methods)]);
